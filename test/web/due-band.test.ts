import { describe, expect, it } from 'vitest';

import { computeDueBand, DEFAULT_DUE_THRESHOLDS } from '../../src/web/components/tasks/due-band';
import { makeTask } from './fixtures';

const NOW = new Date('2026-07-15T12:00:00Z');

function dateOffset(days: number): string {
  const d = new Date(Date.UTC(2026, 6, 15));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe('computeDueBand', () => {
  it('is unscheduled (TBD) when dueDate is null', () => {
    const task = makeTask({ dueDate: null, status: 'not_started' });
    expect(computeDueBand(task, NOW)).toEqual({ band: 'unscheduled', label: 'TBD' });
  });

  it('is overdue for any date before today, regardless of how far past', () => {
    expect(computeDueBand(makeTask({ dueDate: dateOffset(-1) }), NOW).band).toBe('overdue');
    expect(computeDueBand(makeTask({ dueDate: dateOffset(-30) }), NOW).band).toBe('overdue');
  });

  it('is today for the current date', () => {
    expect(computeDueBand(makeTask({ dueDate: dateOffset(0) }), NOW).band).toBe('today');
  });

  it('is soon at the boundary (day 1 and the configured max)', () => {
    expect(computeDueBand(makeTask({ dueDate: dateOffset(1) }), NOW).band).toBe('soon');
    expect(
      computeDueBand(makeTask({ dueDate: dateOffset(DEFAULT_DUE_THRESHOLDS.soonMaxDays) }), NOW)
        .band
    ).toBe('soon');
  });

  it('is soonish immediately past the soon boundary, through its own max', () => {
    const firstSoonishDay = DEFAULT_DUE_THRESHOLDS.soonMaxDays + 1;
    expect(computeDueBand(makeTask({ dueDate: dateOffset(firstSoonishDay) }), NOW).band).toBe(
      'soonish'
    );
    expect(
      computeDueBand(makeTask({ dueDate: dateOffset(DEFAULT_DUE_THRESHOLDS.soonishMaxDays) }), NOW)
        .band
    ).toBe('soonish');
  });

  it('is future immediately past the soonish boundary', () => {
    const firstFutureDay = DEFAULT_DUE_THRESHOLDS.soonishMaxDays + 1;
    expect(computeDueBand(makeTask({ dueDate: dateOffset(firstFutureDay) }), NOW).band).toBe(
      'future'
    );
  });

  it('is complete for a closed task regardless of its due date', () => {
    expect(
      computeDueBand(makeTask({ status: 'complete', dueDate: dateOffset(-10) }), NOW).band
    ).toBe('complete');
    expect(
      computeDueBand(makeTask({ status: 'cancelled', dueDate: dateOffset(5) }), NOW).band
    ).toBe('complete');
    expect(computeDueBand(makeTask({ status: 'complete', dueDate: null }), NOW).band).toBe(
      'complete'
    );
  });

  it('labels a cancelled task "Cancelled", not "Complete" (M3.6-DEF-13)', () => {
    // Both closed statuses share the `complete` band — that drives color and
    // sort position and is correct. The visible label is a claim about this
    // specific task, so it must not report a cancelled task as completed.
    const cancelled = computeDueBand(makeTask({ status: 'cancelled', dueDate: null }), NOW);
    expect(cancelled.band).toBe('complete');
    expect(cancelled.label).toBe('Cancelled');

    const complete = computeDueBand(makeTask({ status: 'complete', dueDate: null }), NOW);
    expect(complete.band).toBe('complete');
    expect(complete.label).toBe('Complete');
  });

  it('every band carries a non-empty text label, never color-only', () => {
    const bands = [
      makeTask({ dueDate: dateOffset(-1) }),
      makeTask({ dueDate: dateOffset(0) }),
      makeTask({ dueDate: dateOffset(1) }),
      makeTask({ dueDate: dateOffset(5) }),
      makeTask({ dueDate: dateOffset(30) }),
      makeTask({ status: 'complete', dueDate: null }),
      makeTask({ dueDate: null }),
    ];
    for (const task of bands) {
      expect(computeDueBand(task, NOW).label.length).toBeGreaterThan(0);
    }
  });
});
