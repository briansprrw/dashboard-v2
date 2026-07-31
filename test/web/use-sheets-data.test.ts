import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSheetsData } from '../../src/web/hooks/use-sheets-data';
import { makeSheet, makeTask } from './fixtures';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useSheetsData', () => {
  it('loads sheets and their tasks into the ready state', async () => {
    const sheet = makeSheet();
    const task = makeTask();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/sheets'))
        return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
      if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
        return Promise.resolve(jsonResponse(200, { tasks: [task] }));
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSheetsData(true, 60_000));

    await waitFor(() => expect(result.current.data.status).toBe('ready'));
    expect(result.current.data).toMatchObject({
      status: 'ready',
      sheets: [{ sheet, tasks: [task] }],
    });
  });

  it('resolves to empty when the user has no accessible sheets', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { sheets: [] })));

    const { result } = renderHook(() => useSheetsData(true, 60_000));

    await waitFor(() => expect(result.current.data.status).toBe('empty'));
  });

  it('does not fetch while disabled', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSheetsData(false, 60_000));

    expect(result.current.data.status).toBe('loading');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to stale on a refresh failure, keeping the last successful data', async () => {
    const sheet = makeSheet();
    const task = makeTask();
    let callCount = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/sheets')) {
        callCount += 1;
        if (callCount === 1) return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
        return Promise.reject(new TypeError('network down'));
      }
      if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
        return Promise.resolve(jsonResponse(200, { tasks: [task] }));
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSheetsData(true, 60_000));
    await waitFor(() => expect(result.current.data.status).toBe('ready'));

    await result.current.refresh();

    await waitFor(() => expect(result.current.data.status).toBe('stale'));
    expect(result.current.data).toMatchObject({
      status: 'stale',
      sheets: [{ sheet, tasks: [task] }],
      message: 'Could not reach the server.',
    });
  });

  it('resolves to error (not stale) when the very first load fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));

    const { result } = renderHook(() => useSheetsData(true, 60_000));

    await waitFor(() => expect(result.current.data.status).toBe('error'));
  });

  describe('createSheet (M4-QA-01)', () => {
    it('creates a List and refreshes the sheet list', async () => {
      const created = makeSheet({ id: 'sheet-new', displayName: 'Groceries' });
      let sheetsCallCount = 0;
      const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/v1/sheets') && init?.method === 'POST') {
          return Promise.resolve(jsonResponse(201, { sheet: created }));
        }
        if (url.endsWith('/api/v1/sheets')) {
          sheetsCallCount += 1;
          return Promise.resolve(
            jsonResponse(200, { sheets: sheetsCallCount === 1 ? [] : [created] })
          );
        }
        if (url.endsWith(`/api/v1/sheets/${created.id}/tasks`))
          return Promise.resolve(jsonResponse(200, { tasks: [] }));
        throw new Error(`unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useSheetsData(true, 60_000));
      await waitFor(() => expect(result.current.data.status).toBe('empty'));

      const returned = await result.current.createSheet({ displayName: 'Groceries' });
      expect(returned.displayName).toBe('Groceries');
      await waitFor(() =>
        expect(result.current.data).toMatchObject({ status: 'ready', sheets: [{ sheet: created }] })
      );
    });

    it('surfaces a server denial without creating a List', async () => {
      const onUnauthenticated = vi.fn();
      const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/v1/sheets') && init?.method === 'POST') {
          return Promise.resolve(
            jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in again.' } })
          );
        }
        if (url.endsWith('/api/v1/sheets'))
          return Promise.resolve(jsonResponse(200, { sheets: [] }));
        throw new Error(`unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useSheetsData(true, 60_000, true, onUnauthenticated));
      await waitFor(() => expect(result.current.data.status).toBe('empty'));

      await expect(result.current.createSheet({ displayName: 'x' })).rejects.toThrow();
      expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    });
  });

  describe('sheet lifecycle actions (M4.1)', () => {
    it('renames a List and refreshes the sheet list', async () => {
      const sheet = makeSheet({ displayName: 'Before' });
      const renamed = { ...sheet, displayName: 'After' };
      let sheetsCallCount = 0;
      const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith(`/api/v1/sheets/${sheet.id}`) && init?.method === 'PATCH') {
          return Promise.resolve(jsonResponse(200, { sheet: renamed }));
        }
        if (url.endsWith('/api/v1/sheets')) {
          sheetsCallCount += 1;
          return Promise.resolve(
            jsonResponse(200, { sheets: [sheetsCallCount === 1 ? sheet : renamed] })
          );
        }
        if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
          return Promise.resolve(jsonResponse(200, { tasks: [] }));
        throw new Error(`unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useSheetsData(true, 60_000));
      await waitFor(() => expect(result.current.data.status).toBe('ready'));

      const returned = await result.current.renameSheet(sheet.id, { displayName: 'After' });
      expect(returned.displayName).toBe('After');
      await waitFor(() =>
        expect(result.current.data).toMatchObject({ sheets: [{ sheet: renamed }] })
      );
    });

    it('recycles a List and refreshes', async () => {
      const sheet = makeSheet();
      let recycleCalled = false;
      const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith(`/api/v1/sheets/${sheet.id}/recycle`) && init?.method === 'POST') {
          recycleCalled = true;
          return Promise.resolve(jsonResponse(200, { recycled: true }));
        }
        if (url.endsWith('/api/v1/sheets'))
          return Promise.resolve(jsonResponse(200, { sheets: recycleCalled ? [] : [sheet] }));
        if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
          return Promise.resolve(jsonResponse(200, { tasks: [] }));
        throw new Error(`unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useSheetsData(true, 60_000));
      await waitFor(() => expect(result.current.data.status).toBe('ready'));

      await result.current.recycleSheet(sheet.id);
      expect(recycleCalled).toBe(true);
      await waitFor(() => expect(result.current.data.status).toBe('empty'));
    });

    it('lists recycled Lists without disturbing the main sheets state', async () => {
      const sheet = makeSheet();
      const recycled = makeSheet({
        id: 'sheet-2',
        state: 'recycled',
        recycledAt: 1_800_000_005_000,
      });
      const fetchMock = vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/v1/sheets/recycled'))
          return Promise.resolve(jsonResponse(200, { sheets: [recycled] }));
        if (url.endsWith('/api/v1/sheets'))
          return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
        if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
          return Promise.resolve(jsonResponse(200, { tasks: [] }));
        throw new Error(`unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useSheetsData(true, 60_000));
      await waitFor(() => expect(result.current.data.status).toBe('ready'));

      const bin = await result.current.listRecycledSheets();
      expect(bin).toEqual([recycled]);
      // Listing the recycle bin must not itself mutate the main ready state.
      expect(result.current.data).toMatchObject({
        status: 'ready',
        sheets: [{ sheet, tasks: [] }],
      });
    });

    it('surfaces a 403 denial from a lifecycle action as a rejection without forcing sign-out', async () => {
      const sheet = makeSheet({ accessLevel: 'viewer' });
      const onUnauthenticated = vi.fn();
      const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith(`/api/v1/sheets/${sheet.id}/recycle`) && init?.method === 'POST') {
          return Promise.resolve(
            jsonResponse(403, { error: { code: 'FORBIDDEN', message: 'Not allowed.' } })
          );
        }
        if (url.endsWith('/api/v1/sheets'))
          return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
        if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
          return Promise.resolve(jsonResponse(200, { tasks: [] }));
        throw new Error(`unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useSheetsData(true, 60_000, true, onUnauthenticated));
      await waitFor(() => expect(result.current.data.status).toBe('ready'));

      await expect(result.current.recycleSheet(sheet.id)).rejects.toThrow();
      expect(onUnauthenticated).not.toHaveBeenCalled();
    });

    it('reports an unauthenticated session (401) from a lifecycle action', async () => {
      const sheet = makeSheet();
      const onUnauthenticated = vi.fn();
      const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith(`/api/v1/sheets/${sheet.id}/recycle`) && init?.method === 'POST') {
          return Promise.resolve(
            jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in again.' } })
          );
        }
        if (url.endsWith('/api/v1/sheets'))
          return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
        if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
          return Promise.resolve(jsonResponse(200, { tasks: [] }));
        throw new Error(`unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useSheetsData(true, 60_000, true, onUnauthenticated));
      await waitFor(() => expect(result.current.data.status).toBe('ready'));

      await expect(result.current.recycleSheet(sheet.id)).rejects.toThrow();
      expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    });
  });

  describe('membership and ownership actions (M4.2)', () => {
    it('looks up a user by email', async () => {
      const sheet = makeSheet();
      const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/v1/users/lookup') && init?.method === 'POST') {
          return Promise.resolve(
            jsonResponse(200, { user: { userId: 'user-9', displayName: 'Priya' } })
          );
        }
        if (url.endsWith('/api/v1/sheets'))
          return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
        if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
          return Promise.resolve(jsonResponse(200, { tasks: [] }));
        throw new Error(`unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useSheetsData(true, 60_000));
      await waitFor(() => expect(result.current.data.status).toBe('ready'));

      const found = await result.current.lookupUserByEmail('priya@example.invalid');
      expect(found).toEqual({ userId: 'user-9', displayName: 'Priya' });
    });

    it('grants and revokes membership without refreshing the main sheets list', async () => {
      const sheet = makeSheet();
      let sheetsCallCount = 0;
      const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith(`/api/v1/sheets/${sheet.id}/members`) && init?.method === 'POST') {
          return Promise.resolve(
            jsonResponse(201, {
              membership: { sheetId: sheet.id, userId: 'user-9', role: 'editor', createdAt: 0 },
            })
          );
        }
        if (
          url.endsWith(`/api/v1/sheets/${sheet.id}/members/user-9`) &&
          init?.method === 'DELETE'
        ) {
          return Promise.resolve(jsonResponse(200, { revoked: true }));
        }
        if (url.endsWith('/api/v1/sheets')) {
          sheetsCallCount += 1;
          return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
        }
        if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
          return Promise.resolve(jsonResponse(200, { tasks: [] }));
        throw new Error(`unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useSheetsData(true, 60_000));
      await waitFor(() => expect(result.current.data.status).toBe('ready'));
      const callsAfterLoad = sheetsCallCount;

      const membership = await result.current.grantMembership(sheet.id, 'user-9', 'editor');
      expect(membership.role).toBe('editor');
      await result.current.revokeMembership(sheet.id, 'user-9');

      // Neither action changes the acting owner's own accessible-sheets list,
      // so this hook's own refresh() must not have been triggered by either.
      expect(sheetsCallCount).toBe(callsAfterLoad);
    });

    it('lists members for a List', async () => {
      const sheet = makeSheet();
      const member = { sheetId: sheet.id, userId: 'user-9', role: 'viewer', createdAt: 0 };
      const fetchMock = vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith(`/api/v1/sheets/${sheet.id}/members`))
          return Promise.resolve(jsonResponse(200, { members: [member] }));
        if (url.endsWith('/api/v1/sheets'))
          return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
        if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
          return Promise.resolve(jsonResponse(200, { tasks: [] }));
        throw new Error(`unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useSheetsData(true, 60_000));
      await waitFor(() => expect(result.current.data.status).toBe('ready'));

      const members = await result.current.listMembers(sheet.id);
      expect(members).toEqual([member]);
    });

    it('transferring ownership refreshes the main sheets list (the actor’s own accessLevel changed)', async () => {
      const sheet = makeSheet({ accessLevel: 'owner' });
      const transferred = { ...sheet, ownerUserId: 'user-9', accessLevel: 'editor' as const };
      let sheetsCallCount = 0;
      const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith(`/api/v1/sheets/${sheet.id}/ownership`) && init?.method === 'POST') {
          return Promise.resolve(jsonResponse(200, { sheet: transferred }));
        }
        if (url.endsWith('/api/v1/sheets')) {
          sheetsCallCount += 1;
          return Promise.resolve(
            jsonResponse(200, { sheets: [sheetsCallCount === 1 ? sheet : transferred] })
          );
        }
        if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
          return Promise.resolve(jsonResponse(200, { tasks: [] }));
        throw new Error(`unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useSheetsData(true, 60_000));
      await waitFor(() => expect(result.current.data.status).toBe('ready'));

      await result.current.transferOwnership(sheet.id, 'user-9');
      await waitFor(() =>
        expect(result.current.data).toMatchObject({ sheets: [{ sheet: transferred }] })
      );
    });
  });

  describe('background polling (M3.5)', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('polls again after the configured interval elapses', async () => {
      const sheet = makeSheet();
      const task = makeTask();
      let sheetsCallCount = 0;
      const fetchMock = vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/v1/sheets')) {
          sheetsCallCount += 1;
          return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
        }
        if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
          return Promise.resolve(jsonResponse(200, { tasks: [task] }));
        throw new Error(`unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      renderHook(() => useSheetsData(true, 5_000));
      await vi.waitFor(() => expect(sheetsCallCount).toBe(1));

      await vi.advanceTimersByTimeAsync(5_000);
      await vi.waitFor(() => expect(sheetsCallCount).toBe(2));
    });

    it('does not start a second request while one is still in flight (no overlap)', async () => {
      const sheet = makeSheet();
      const task = makeTask();
      let sheetsCallCount = 0;
      let resolveSecondCall: (() => void) | undefined;
      const fetchMock = vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/v1/sheets')) {
          sheetsCallCount += 1;
          if (sheetsCallCount === 1) return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
          // The second call hangs until the test releases it, simulating a
          // slow in-flight request that must not overlap with a third tick.
          return new Promise<Response>((resolve) => {
            resolveSecondCall = () => resolve(jsonResponse(200, { sheets: [sheet] }));
          });
        }
        if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
          return Promise.resolve(jsonResponse(200, { tasks: [task] }));
        throw new Error(`unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      renderHook(() => useSheetsData(true, 1_000));
      await vi.waitFor(() => expect(sheetsCallCount).toBe(1));

      await vi.advanceTimersByTimeAsync(1_000);
      await vi.waitFor(() => expect(sheetsCallCount).toBe(2));

      // A tick fires while call #2 is still pending; the in-flight guard
      // must skip it rather than starting a third overlapping request.
      await vi.advanceTimersByTimeAsync(1_000);
      expect(sheetsCallCount).toBe(2);

      resolveSecondCall?.();
    });

    it('backs off to a longer delay after a failure, and resets after a success', async () => {
      const sheet = makeSheet();
      const task = makeTask();
      let sheetsCallCount = 0;
      const fetchMock = vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/v1/sheets')) {
          sheetsCallCount += 1;
          if (sheetsCallCount === 2) return Promise.reject(new TypeError('network down'));
          return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
        }
        if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
          return Promise.resolve(jsonResponse(200, { tasks: [task] }));
        throw new Error(`unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      renderHook(() => useSheetsData(true, 1_000));
      await vi.waitFor(() => expect(sheetsCallCount).toBe(1));

      // Tick 1: the second call fails.
      await vi.advanceTimersByTimeAsync(1_000);
      await vi.waitFor(() => expect(sheetsCallCount).toBe(2));

      // The next attempt is backed off to 2x the interval (2000ms): at
      // exactly 1000ms after the failure, no third call has fired yet.
      await vi.advanceTimersByTimeAsync(1_000);
      expect(sheetsCallCount).toBe(2);

      // By 2000ms after the failure, the backed-off attempt fires and
      // succeeds, which resets the delay back to the base interval.
      await vi.advanceTimersByTimeAsync(1_000);
      await vi.waitFor(() => expect(sheetsCallCount).toBe(3));

      await vi.advanceTimersByTimeAsync(1_000);
      await vi.waitFor(() => expect(sheetsCallCount).toBe(4));
    });

    it('coalesces a refresh requested during an in-flight poll instead of dropping it (M3-QA-07)', async () => {
      const sheet = makeSheet();
      const initialTask = makeTask({ name: 'Before' });
      const updatedTask = makeTask({ name: 'After' });
      let sheetsCallCount = 0;
      let resolveSecondCall: (() => void) | undefined;
      const fetchMock = vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/v1/sheets')) {
          sheetsCallCount += 1;
          if (sheetsCallCount === 1) return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
          if (sheetsCallCount === 2) {
            // The poll's own fetch hangs, simulating a mutation's refresh()
            // call landing while that poll is still in flight.
            return new Promise<Response>((resolve) => {
              resolveSecondCall = () => resolve(jsonResponse(200, { sheets: [sheet] }));
            });
          }
          // The coalesced refresh that must fire once the poll completes
          // picks up the post-mutation server state.
          return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
        }
        if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`)) {
          return Promise.resolve(
            jsonResponse(200, { tasks: [sheetsCallCount <= 2 ? initialTask : updatedTask] })
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useSheetsData(true, 1_000));
      await vi.waitFor(() => expect(sheetsCallCount).toBe(1));

      await vi.advanceTimersByTimeAsync(1_000);
      await vi.waitFor(() => expect(sheetsCallCount).toBe(2));

      // A mutation's post-write refresh() call lands while call #2 (the
      // poll) is still in flight. It must not be silently dropped.
      const coalescedRefresh = result.current.refresh();

      // Releasing the in-flight poll must trigger the coalesced refresh
      // automatically, without waiting for the next timer tick.
      resolveSecondCall?.();
      await coalescedRefresh;

      await vi.waitFor(() => expect(sheetsCallCount).toBe(3));
      await vi.waitFor(() =>
        expect(result.current.data).toMatchObject({
          status: 'ready',
          sheets: [{ sheet, tasks: [updatedTask] }],
        })
      );
    });

    it('does not poll while offline', async () => {
      const sheet = makeSheet();
      const task = makeTask();
      let sheetsCallCount = 0;
      const fetchMock = vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/v1/sheets')) {
          sheetsCallCount += 1;
          return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
        }
        if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
          return Promise.resolve(jsonResponse(200, { tasks: [task] }));
        throw new Error(`unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      renderHook(() => useSheetsData(true, 1_000, false));
      await vi.waitFor(() => expect(sheetsCallCount).toBe(1));

      await vi.advanceTimersByTimeAsync(5_000);
      expect(sheetsCallCount).toBe(1);
    });
  });
});
