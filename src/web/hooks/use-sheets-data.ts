// The centralized task/sheet data-action layer M3.1 exists to create: one
// hook that owns fetching every accessible sheet's tasks and exposes the
// mutation actions later packets (M3.2-M3.5) build UI on top of. Every layout
// — Standard, Glance, any future one — reads from and calls into this same
// hook rather than fetching independently, so they can never drift from each
// other's idea of the data (M3 outcome: "The same task/action layer powers
// Standard and Glance modes").
//
// M3.5 adds background polling on top of M3.1's manual refresh: a timer
// calls `refresh()` on the caller-supplied interval, an in-flight guard
// keeps a slow request from overlapping with the next tick (M3.5 packet
// wording: "avoid overlapping requests"), and repeated failures back off to
// a longer delay instead of retrying every tick (M0 §8's refresh note).

import { useCallback, useEffect, useRef, useState } from 'react';

import type { AccessibleSheetDto, TaskDto } from '../../shared/contracts/dto';
import type { MoveTaskRequest, TaskFieldsRequest } from '../../shared/contracts/requests';
import { api } from '../lib/api';
import { ApiError, ApiNetworkError } from '../lib/api-client';

export interface SheetWithTasks {
  sheet: AccessibleSheetDto;
  tasks: TaskDto[];
}

/**
 * `ready`   — at least one accessible sheet, current data.
 * `empty`   — the signed-in user has zero accessible sheets.
 * `stale`   — a background refresh failed; `sheets` still holds the last
 *             successful data so the UI never blanks on a transient failure.
 * `error`   — the *first* load failed, so there is no valid data to show.
 */
export type SheetsDataState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'ready'; sheets: SheetWithTasks[]; lastSuccessAt: number }
  | { status: 'stale'; sheets: SheetWithTasks[]; lastSuccessAt: number; message: string }
  | { status: 'error'; message: string };

export interface UseSheetsDataResult {
  data: SheetsDataState;
  refresh: () => Promise<void>;
  createTask: (sheetId: string, fields: TaskFieldsRequest) => Promise<TaskDto>;
  updateTask: (taskId: string, fields: TaskFieldsRequest) => Promise<TaskDto>;
  moveTask: (taskId: string, body: MoveTaskRequest) => Promise<void>;
  recycleTask: (taskId: string) => Promise<void>;
  restoreTask: (taskId: string) => Promise<TaskDto>;
  purgeTask: (taskId: string) => Promise<void>;
}

const BACKOFF_MULTIPLIER = 2;
const BACKOFF_CEILING_MS = 10 * 60_000;

async function loadAllSheets(): Promise<SheetWithTasks[]> {
  const { sheets } = await api.sheets.list();
  const withTasks = await Promise.all(
    sheets.map(async (sheet) => {
      const { tasks } = await api.tasks.listForSheet(sheet.id);
      return { sheet, tasks };
    })
  );
  return withTasks;
}

function describeLoadFailure(error: unknown): string {
  if (error instanceof ApiNetworkError) return 'Could not reach the server.';
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong loading your Lists.';
}

/**
 * Fetches every List the signed-in user can access, and each List's tasks.
 * Only mounts/refreshes while `enabled` is true, so callers gate this on the
 * session being `ready` rather than duplicating that check at every call
 * site. Polls on `refreshIntervalMs` (M3.5) while `enabled` and `online`;
 * `online` is expected to come from `useOnlineStatus` so a caller does not
 * need to duplicate connectivity detection.
 *
 * `onUnauthenticated` (M3-QA-05) fires whenever a load or mutation receives a
 * 401 from an *already-established* session — an expired or server-side
 * revoked/disabled account. Without it, a background 401 was previously
 * indistinguishable from an ordinary transient failure and fell into the
 * generic stale/error path, leaving private data and (locally rendered, if
 * server-denied) mutation controls visible indefinitely. The caller is
 * expected to pass something that re-checks or invalidates the session (e.g.
 * `useSession`'s `refresh`), so the app can drop to the signed-out state.
 */
export function useSheetsData(
  enabled: boolean,
  refreshIntervalMs: number,
  online: boolean = true,
  onUnauthenticated?: () => void
): UseSheetsDataResult {
  const [data, setData] = useState<SheetsDataState>({ status: 'loading' });
  const lastGoodRef = useRef<{ sheets: SheetWithTasks[]; lastSuccessAt: number } | null>(null);
  const inFlightRef = useRef(false);
  const backoffRef = useRef(refreshIntervalMs);
  const onUnauthenticatedRef = useRef(onUnauthenticated);
  useEffect(() => {
    onUnauthenticatedRef.current = onUnauthenticated;
  });
  // Set when a caller (typically a mutation) asks for a refresh while one is
  // already in flight (M3-QA-07): the in-flight load's own early return would
  // otherwise silently skip the caller's required post-write read. `run()`
  // loops while this flag keeps getting set during a load, so a mutation's
  // refresh is coalesced onto the active request rather than dropped,
  // without ever running two loads at once.
  const refreshRequestedRef = useRef(false);

  const run = useCallback(async () => {
    if (inFlightRef.current) {
      refreshRequestedRef.current = true;
      return;
    }
    inFlightRef.current = true;
    try {
      do {
        refreshRequestedRef.current = false;
        try {
          const sheets = await loadAllSheets();
          const lastSuccessAt = Date.now();
          lastGoodRef.current = { sheets, lastSuccessAt };
          backoffRef.current = refreshIntervalMs;
          setData(
            sheets.length === 0 ? { status: 'empty' } : { status: 'ready', sheets, lastSuccessAt }
          );
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) onUnauthenticatedRef.current?.();
          const message = describeLoadFailure(error);
          const lastGood = lastGoodRef.current;
          backoffRef.current = Math.min(
            backoffRef.current * BACKOFF_MULTIPLIER,
            BACKOFF_CEILING_MS
          );
          setData(
            lastGood
              ? {
                  status: 'stale',
                  sheets: lastGood.sheets,
                  lastSuccessAt: lastGood.lastSuccessAt,
                  message,
                }
              : { status: 'error', message }
          );
        }
      } while (refreshRequestedRef.current);
    } finally {
      inFlightRef.current = false;
    }
  }, [refreshIntervalMs]);

  const load = run;

  // Exposed to callers (e.g. a manual retry button) as `refresh`. Mutation
  // actions below also call this after a successful write.
  const refresh = load;

  /**
   * M3-QA-05 re-review: the load paths already route a 401 through
   * `onUnauthenticated`, but every mutation was found still calling the API
   * directly with no equivalent check — a session that expires or is
   * revoked immediately before a create/edit/move/complete/recycle/restore/
   * purge surfaced only as a form/action error, leaving the authenticated
   * surface and any already-loaded private data on screen indefinitely.
   * Every mutation below reports through this helper and then rethrows, so
   * the caller's own error handling (`TaskForm`, `DashboardView`) still sees
   * the rejection exactly as before.
   */
  function reportIfUnauthenticated(error: unknown) {
    if (error instanceof ApiError && error.status === 401) onUnauthenticatedRef.current?.();
  }

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function runInitialLoad() {
      lastGoodRef.current = null;
      backoffRef.current = refreshIntervalMs;
      setData({ status: 'loading' });
      inFlightRef.current = true;
      try {
        const sheets = await loadAllSheets();
        if (cancelled) return;
        const lastSuccessAt = Date.now();
        lastGoodRef.current = { sheets, lastSuccessAt };
        setData(
          sheets.length === 0 ? { status: 'empty' } : { status: 'ready', sheets, lastSuccessAt }
        );
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) onUnauthenticatedRef.current?.();
        setData({ status: 'error', message: describeLoadFailure(error) });
      } finally {
        inFlightRef.current = false;
      }
    }

    void runInitialLoad();
    return () => {
      cancelled = true;
    };
    // `refreshIntervalMs` deliberately excluded: only the initial mount
    // should reset to a fresh load; a later interval-preference change is
    // picked up by the polling timer effect below without refetching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Background polling (M3.5). Never overlaps with an in-flight request
  // (`load`'s own `inFlightRef` guard skips the tick), and backs off after
  // repeated failures rather than retrying every `refreshIntervalMs` tick.
  // Pauses entirely while offline — there is nothing to poll for.
  useEffect(() => {
    if (!enabled || !online) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    function scheduleNext() {
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        void load().then(() => {
          if (!cancelled) scheduleNext();
        });
      }, backoffRef.current);
    }

    scheduleNext();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [enabled, online, load]);

  const createTask = useCallback(
    async (sheetId: string, fields: TaskFieldsRequest) => {
      try {
        const { task } = await api.tasks.create(sheetId, fields);
        await refresh();
        return task;
      } catch (error) {
        reportIfUnauthenticated(error);
        throw error;
      }
    },
    [refresh]
  );

  const updateTask = useCallback(
    async (taskId: string, fields: TaskFieldsRequest) => {
      try {
        const { task } = await api.tasks.update(taskId, fields);
        await refresh();
        return task;
      } catch (error) {
        reportIfUnauthenticated(error);
        throw error;
      }
    },
    [refresh]
  );

  const moveTask = useCallback(
    async (taskId: string, body: MoveTaskRequest) => {
      try {
        await api.tasks.move(taskId, body);
        await refresh();
      } catch (error) {
        reportIfUnauthenticated(error);
        throw error;
      }
    },
    [refresh]
  );

  const recycleTask = useCallback(
    async (taskId: string) => {
      try {
        await api.tasks.recycle(taskId);
        await refresh();
      } catch (error) {
        reportIfUnauthenticated(error);
        throw error;
      }
    },
    [refresh]
  );

  const restoreTask = useCallback(
    async (taskId: string) => {
      try {
        const { task } = await api.tasks.restore(taskId);
        await refresh();
        return task;
      } catch (error) {
        reportIfUnauthenticated(error);
        throw error;
      }
    },
    [refresh]
  );

  const purgeTask = useCallback(
    async (taskId: string) => {
      try {
        await api.tasks.purge(taskId);
        await refresh();
      } catch (error) {
        reportIfUnauthenticated(error);
        throw error;
      }
    },
    [refresh]
  );

  return { data, refresh, createTask, updateTask, moveTask, recycleTask, restoreTask, purgeTask };
}
