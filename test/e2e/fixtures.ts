// Synthetic DTO fixtures for the e2e suite, mirroring `test/web/fixtures.ts`'s
// invented-values-only convention (M0-D21). Kept as a separate copy rather
// than importing across the vitest/Playwright boundary, since the two suites
// have independent module resolution and lifecycles.

import type { Page } from '@playwright/test';

import type { AccessibleSheetDto, SessionUserDto, TaskDto } from '../../src/shared/contracts/dto';

/**
 * The frozen "now" every due-date fixture is anchored to (M3.6-QA-02, found
 * by Codex's independent review): `computeDueBand` (`due-band.ts`) defaults
 * to the real `new Date()` when no `now` is passed, and nothing in the
 * render path ever passes one — so a fixture task's due-band only renders
 * as claimed (overdue/today/soon/soonish/future) if the *browser's actual
 * clock* is frozen to match the date this constant encodes, not just if the
 * fixture's own dates are internally consistent with each other. Every spec
 * that asserts or screenshots due-band-dependent rendering must call
 * `freezeClock(page)` (below) before `page.goto`. `1_800_000_000_000` is
 * 2027-01-15T06:40:00.000Z.
 */
export const FIXTURE_NOW = 1_800_000_000_000;

/** Must be called before `page.goto()` — installs Playwright's clock override so the browser's `new Date()`/`Date.now()` return `FIXTURE_NOW` instead of the real wall clock. */
export async function freezeClock(page: Page) {
  await page.clock.install({ time: FIXTURE_NOW });
}

export function makeSessionUser(overrides: Partial<SessionUserDto> = {}): SessionUserDto {
  return {
    id: 'user-1',
    displayName: 'Sample Person',
    avatarUrl: null,
    globalRole: 'user',
    locale: 'en-US',
    timezone: 'America/Chicago',
    ...overrides,
  };
}

export function makeSheet(overrides: Partial<AccessibleSheetDto> = {}): AccessibleSheetDto {
  return {
    id: 'sheet-1',
    displayName: 'Household',
    ownerUserId: 'user-1',
    state: 'active',
    accessLevel: 'owner',
    createdAt: 1_800_000_000_000,
    updatedAt: 1_800_000_000_000,
    recycledAt: null,
    ...overrides,
  };
}

let taskCounter = 0;

export function makeTask(overrides: Partial<TaskDto> = {}): TaskDto {
  taskCounter += 1;
  return {
    id: `task-${taskCounter}`,
    sheetId: 'sheet-1',
    name: `Sample task ${taskCounter}`,
    status: 'not_started',
    priority: 'medium',
    dueDate: null,
    notes: null,
    notesRedacted: false,
    isPrivate: false,
    notesPrivate: false,
    emojiFlags: [],
    sortKey: taskCounter,
    createdAt: 1_800_000_000_000,
    updatedAt: 1_800_000_000_000,
    closedAt: null,
    recycledAt: null,
    ...overrides,
  };
}

/** A representative normal-density fixture: two Lists with a mixed task spread across every due band and priority. */
export function normalFixture(): {
  sheets: AccessibleSheetDto[];
  tasksBySheet: Record<string, TaskDto[]>;
} {
  const household = makeSheet({ id: 'sheet-1', displayName: 'Household' });
  const work = makeSheet({ id: 'sheet-2', displayName: 'Work' });

  const dayMs = 86_400_000;
  const iso = (offsetDays: number) =>
    new Date(FIXTURE_NOW + offsetDays * dayMs).toISOString().slice(0, 10);

  const householdTasks = [
    makeTask({
      id: 'task-overdue',
      sheetId: household.id,
      name: 'Pay the water bill',
      status: 'not_started',
      priority: 'urgent',
      dueDate: iso(-2),
    }),
    makeTask({
      id: 'task-today',
      sheetId: household.id,
      name: 'Pick up dry cleaning',
      status: 'not_started',
      priority: 'high',
      dueDate: iso(0),
      emojiFlags: ['📌'],
    }),
    makeTask({
      id: 'task-soon',
      sheetId: household.id,
      name: 'Renew car registration',
      status: 'not_started',
      priority: 'medium',
      dueDate: iso(2),
    }),
    makeTask({
      id: 'task-future',
      sheetId: household.id,
      name: 'Plan summer trip',
      status: 'not_started',
      priority: 'low',
      dueDate: iso(30),
      notes: 'Check flight prices after the holiday',
    }),
    makeTask({
      id: 'task-unscheduled',
      sheetId: household.id,
      name: 'Organize the garage',
      status: 'not_started',
      priority: 'low',
      dueDate: null,
    }),
    makeTask({
      id: 'task-complete',
      sheetId: household.id,
      name: 'Buy groceries',
      status: 'complete',
      priority: 'medium',
      dueDate: iso(-1),
      closedAt: FIXTURE_NOW,
    }),
  ];

  const workTasks = [
    makeTask({
      id: 'task-work-1',
      sheetId: work.id,
      name: 'Prepare quarterly report',
      status: 'not_started',
      priority: 'high',
      dueDate: iso(1),
    }),
    makeTask({
      id: 'task-work-2',
      sheetId: work.id,
      name: 'Review pull requests',
      status: 'not_started',
      priority: 'medium',
      dueDate: iso(5),
    }),
  ];

  return {
    sheets: [household, work],
    tasksBySheet: { [household.id]: householdTasks, [work.id]: workTasks },
  };
}

/** Long-text and dense-content fixture for narrow-column recognition evidence. */
export function longTextFixture(): {
  sheets: AccessibleSheetDto[];
  tasksBySheet: Record<string, TaskDto[]>;
} {
  const sheet = makeSheet({ id: 'sheet-1', displayName: 'Long-Text Recognition Check' });
  const tasks = [
    makeTask({
      id: 'task-long-1',
      sheetId: sheet.id,
      name: 'Coordinate with the property management company about the annual fire-inspection walkthrough and follow-up repairs',
      status: 'not_started',
      priority: 'urgent',
      dueDate: new Date(FIXTURE_NOW - 5 * 86_400_000).toISOString().slice(0, 10),
      notes:
        'Call the office between 9 and 11 AM; ask specifically about the stairwell door closer that failed last time and get a written estimate before approving any work.',
      emojiFlags: ['📌', '⭐'],
    }),
    makeTask({
      id: 'task-long-2',
      sheetId: sheet.id,
      name: 'Short task',
      status: 'not_started',
      priority: 'low',
      dueDate: null,
    }),
  ];
  return { sheets: [sheet], tasksBySheet: { [sheet.id]: tasks } };
}

/** Empty-section fixture: a List with zero tasks. */
export function emptyFixture(): {
  sheets: AccessibleSheetDto[];
  tasksBySheet: Record<string, TaskDto[]>;
} {
  const sheet = makeSheet({ id: 'sheet-1', displayName: 'Empty List' });
  return { sheets: [sheet], tasksBySheet: { [sheet.id]: [] } };
}

/** Dense fixture: many tasks in one List, for a single section's row-density evidence. */
export function denseFixture(count = 24): {
  sheets: AccessibleSheetDto[];
  tasksBySheet: Record<string, TaskDto[]>;
} {
  const sheet = makeSheet({ id: 'sheet-1', displayName: 'Dense List' });
  const priorities: TaskDto['priority'][] = ['low', 'medium', 'high', 'urgent'];
  const tasks = Array.from({ length: count }, (_, i) =>
    makeTask({
      id: `task-dense-${i}`,
      sheetId: sheet.id,
      name: `Dense task ${i + 1}`,
      priority: priorities[i % priorities.length],
      dueDate:
        i % 3 === 0 ? null : new Date(FIXTURE_NOW + 3 * 86_400_000).toISOString().slice(0, 10),
    })
  );
  return { sheets: [sheet], tasksBySheet: { [sheet.id]: tasks } };
}

/** Multiple Lists (sections), each modestly sized — for the grid's column-flow evidence (M0-D24, AC-G5), since `.sheet-columns` flows sections, not one section's own tasks. */
export function multiSheetFixture(sheetCount = 4): {
  sheets: AccessibleSheetDto[];
  tasksBySheet: Record<string, TaskDto[]>;
} {
  const names = ['Household', 'Work', 'Errands', 'Personal', 'Projects', 'Garden'];
  const sheets = Array.from({ length: sheetCount }, (_, i) =>
    makeSheet({ id: `sheet-${i + 1}`, displayName: names[i % names.length] })
  );
  const tasksBySheet: Record<string, TaskDto[]> = {};
  for (const sheet of sheets) {
    tasksBySheet[sheet.id] = Array.from({ length: 4 }, (_, i) =>
      makeTask({
        id: `task-${sheet.id}-${i}`,
        sheetId: sheet.id,
        name: `${sheet.displayName} task ${i + 1}`,
        dueDate:
          i % 2 === 0 ? new Date(FIXTURE_NOW + 3 * 86_400_000).toISOString().slice(0, 10) : null,
      })
    );
  }
  return { sheets, tasksBySheet };
}
