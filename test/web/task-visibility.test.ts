import { describe, expect, it } from 'vitest';

import { filterTasksByClosedVisibility } from '../../src/web/components/tasks/task-visibility';
import { DEFAULT_PREFERENCES } from '../../src/web/state/preferences-schema';
import { makeTask } from './fixtures';

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe('filterTasksByClosedVisibility', () => {
  it('never filters an open task regardless of the closed-task preference', () => {
    const open = makeTask({ status: 'not_started', closedAt: null });
    const prefs = {
      complete: { mode: 'hide' as const, days: 1 },
      cancelled: { mode: 'hide' as const, days: 1 },
    };
    expect(filterTasksByClosedVisibility([open], prefs, NOW)).toEqual([open]);
  });

  it('hides a completed task when the mode is "hide"', () => {
    const complete = makeTask({ status: 'complete', closedAt: NOW });
    const prefs = {
      complete: { mode: 'hide' as const, days: 1 },
      cancelled: DEFAULT_PREFERENCES.closedTaskVisibility.cancelled,
    };
    expect(filterTasksByClosedVisibility([complete], prefs, NOW)).toEqual([]);
  });

  it('keeps a completed task indefinitely when the mode is "always"', () => {
    const complete = makeTask({ status: 'complete', closedAt: NOW - 400 * DAY });
    const prefs = {
      complete: { mode: 'always' as const, days: 1 },
      cancelled: DEFAULT_PREFERENCES.closedTaskVisibility.cancelled,
    };
    expect(filterTasksByClosedVisibility([complete], prefs, NOW)).toEqual([complete]);
  });

  it('keeps a task closed within the configured N-day window and drops one outside it', () => {
    const withinWindow = makeTask({ id: 'within', status: 'complete', closedAt: NOW - 2 * DAY });
    const outsideWindow = makeTask({
      id: 'outside',
      status: 'complete',
      closedAt: NOW - 10 * DAY,
    });
    const prefs = {
      complete: { mode: 'days' as const, days: 7 },
      cancelled: DEFAULT_PREFERENCES.closedTaskVisibility.cancelled,
    };
    expect(
      filterTasksByClosedVisibility([withinWindow, outsideWindow], prefs, NOW).map((t) => t.id)
    ).toEqual(['within']);
  });

  it('applies complete and cancelled visibility independently', () => {
    const complete = makeTask({ id: 'complete', status: 'complete', closedAt: NOW });
    const cancelled = makeTask({ id: 'cancelled', status: 'cancelled', closedAt: NOW });
    const prefs = {
      complete: { mode: 'always' as const, days: 1 },
      cancelled: { mode: 'hide' as const, days: 1 },
    };
    expect(
      filterTasksByClosedVisibility([complete, cancelled], prefs, NOW).map((t) => t.id)
    ).toEqual(['complete']);
  });
});
