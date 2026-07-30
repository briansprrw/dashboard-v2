// Intercepts every `/api/v1/*` request the real client app makes, at the
// browser network layer (`page.route`), and serves it from an in-memory
// store built from synthetic fixtures. The rendered app, CSS, and container
// queries are all real — only the backend is a fake, matching the M3.6
// decision (M3-QA-06/M3.6-D1) to skip live-OAuth-dependent evidence in favor
// of realistic-data browser evidence. No server code is bypassed or
// modified; this never talks to the real Worker.

import type { Page } from '@playwright/test';

import type { AccessibleSheetDto, SessionUserDto, TaskDto } from '../../src/shared/contracts/dto';
import { makeSessionUser } from './fixtures';

export interface MockApiOptions {
  user?: SessionUserDto;
  sheets: AccessibleSheetDto[];
  tasksBySheet: Record<string, TaskDto[]>;
  /** Simulates a signed-out visitor: every request returns 401. */
  loggedOut?: boolean;
  /** Forces every mutation to fail with this HTTP status (denial/failure-path evidence). */
  forceMutationStatus?: number;
}

function errorEnvelope(code: string, message: string) {
  return { error: { code, message, requestId: 'e2e-mock-request' } };
}

/** Regex capture groups are typed as possibly-`undefined`; safe here because every caller only reads a group from a match its own pattern guarantees captured. */
function capture(match: RegExpExecArray, index: number): string {
  return match[index] as string;
}

/**
 * Installs the route interceptor on `page` before navigation. Returns the
 * live in-memory task store so a spec can assert against server-visible
 * state after driving the UI (e.g. confirming a move actually happened).
 */
export async function installMockApi(page: Page, options: MockApiOptions) {
  const user = options.user ?? makeSessionUser();
  const sheets = new Map(options.sheets.map((s) => [s.id, s]));
  const tasks = new Map<string, TaskDto>();
  for (const list of Object.values(options.tasksBySheet)) {
    for (const task of list) tasks.set(task.id, task);
  }
  let nextTaskId = 1000;

  function tasksForSheet(sheetId: string): TaskDto[] {
    return [...tasks.values()].filter((t) => t.sheetId === sheetId && t.recycledAt === null);
  }

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = request.method();

    if (options.loggedOut) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify(errorEnvelope('UNAUTHENTICATED', 'Not signed in.')),
      });
      return;
    }

    // --- Session ---
    if (path === '/auth/session' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user }),
      });
      return;
    }
    if (path === '/auth/logout' && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ signedOut: true }),
      });
      return;
    }

    // --- Sheets ---
    if (path === '/sheets' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sheets: [...sheets.values()] }),
      });
      return;
    }

    // --- Tasks for a sheet ---
    const listTasksMatch = /^\/sheets\/([^/]+)\/tasks$/.exec(path);
    if (listTasksMatch && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tasks: tasksForSheet(capture(listTasksMatch, 1)) }),
      });
      return;
    }
    if (listTasksMatch && method === 'POST') {
      if (options.forceMutationStatus) {
        await route.fulfill({
          status: options.forceMutationStatus,
          contentType: 'application/json',
          body: JSON.stringify(errorEnvelope('DENIED', 'This action was denied.')),
        });
        return;
      }
      const body = request.postDataJSON() as Record<string, unknown>;
      nextTaskId += 1;
      const task: TaskDto = {
        id: `task-e2e-${nextTaskId}`,
        sheetId: capture(listTasksMatch, 1),
        name: String(body.name ?? 'Untitled'),
        status: 'not_started',
        priority: (body.priority as TaskDto['priority']) ?? 'medium',
        dueDate: (body.dueDate as string | null) ?? null,
        notes: (body.notes as string | null) ?? null,
        notesRedacted: false,
        isPrivate: Boolean(body.isPrivate),
        notesPrivate: Boolean(body.notesPrivate),
        emojiFlags: [],
        sortKey: tasks.size + 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        closedAt: null,
        recycledAt: null,
      };
      tasks.set(task.id, task);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ task }),
      });
      return;
    }

    const recycledMatch = /^\/sheets\/([^/]+)\/tasks\/recycled$/.exec(path);
    if (recycledMatch && method === 'GET') {
      const recycled = [...tasks.values()].filter(
        (t) => t.sheetId === capture(recycledMatch, 1) && t.recycledAt !== null
      );
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tasks: recycled }),
      });
      return;
    }

    // --- Single-task mutations ---
    const updateMatch = /^\/tasks\/([^/]+)$/.exec(path);
    if (updateMatch && method === 'PUT') {
      if (options.forceMutationStatus) {
        await route.fulfill({
          status: options.forceMutationStatus,
          contentType: 'application/json',
          body: JSON.stringify(errorEnvelope('DENIED', 'This action was denied.')),
        });
        return;
      }
      const existing = tasks.get(capture(updateMatch, 1));
      if (!existing) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify(errorEnvelope('NOT_FOUND', 'Task not found.')),
        });
        return;
      }
      const body = request.postDataJSON() as Record<string, unknown>;
      const closedAt =
        body.status === 'complete' || body.status === 'cancelled'
          ? (existing.closedAt ?? Date.now())
          : null;
      const updated: TaskDto = {
        ...existing,
        name: String(body.name ?? existing.name),
        status: (body.status as TaskDto['status']) ?? existing.status,
        priority: (body.priority as TaskDto['priority']) ?? existing.priority,
        dueDate: (body.dueDate as string | null) ?? existing.dueDate,
        notes: (body.notes as string | null) ?? existing.notes,
        updatedAt: Date.now(),
        closedAt,
      };
      tasks.set(updated.id, updated);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ task: updated }),
      });
      return;
    }

    if (updateMatch && method === 'DELETE') {
      tasks.delete(capture(updateMatch, 1));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ purged: true }),
      });
      return;
    }

    const moveMatch = /^\/tasks\/([^/]+)\/move$/.exec(path);
    if (moveMatch && method === 'POST') {
      if (options.forceMutationStatus) {
        await route.fulfill({
          status: options.forceMutationStatus,
          contentType: 'application/json',
          body: JSON.stringify(errorEnvelope('DENIED', 'This action was denied.')),
        });
        return;
      }
      const existing = tasks.get(capture(moveMatch, 1));
      const body = request.postDataJSON() as { destinationSheetId: string };
      if (existing) {
        tasks.set(existing.id, {
          ...existing,
          sheetId: body.destinationSheetId,
          updatedAt: Date.now(),
        });
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ task: tasks.get(capture(moveMatch, 1)) }),
      });
      return;
    }

    const recycleMatch = /^\/tasks\/([^/]+)\/recycle$/.exec(path);
    if (recycleMatch && method === 'POST') {
      if (options.forceMutationStatus) {
        await route.fulfill({
          status: options.forceMutationStatus,
          contentType: 'application/json',
          body: JSON.stringify(errorEnvelope('DENIED', 'This action was denied.')),
        });
        return;
      }
      const existing = tasks.get(capture(recycleMatch, 1));
      if (existing) tasks.set(existing.id, { ...existing, recycledAt: Date.now() });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ recycled: true }),
      });
      return;
    }

    const restoreMatch = /^\/tasks\/([^/]+)\/restore$/.exec(path);
    if (restoreMatch && method === 'POST') {
      const existing = tasks.get(capture(restoreMatch, 1));
      if (existing) tasks.set(existing.id, { ...existing, recycledAt: null });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ task: tasks.get(capture(restoreMatch, 1)) }),
      });
      return;
    }

    const historyMatch = /^\/tasks\/([^/]+)\/history$/.exec(path);
    if (historyMatch && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ events: [] }),
      });
      return;
    }

    const membersMatch = /^\/sheets\/([^/]+)\/members$/.exec(path);
    if (membersMatch && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ members: [] }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify(errorEnvelope('NOT_FOUND', `No mock handler for ${method} ${path}`)),
    });
  });

  return { tasks, sheets };
}
