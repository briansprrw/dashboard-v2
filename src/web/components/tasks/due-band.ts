// Computes which of V2's seven semantic due bands a task falls in
// (M0-D23, product plan task-display spec line 439): overdue, today, soon,
// soonish, future, complete, unscheduled.
//
// The soon/soonish/future day-count boundaries below are the M0.1
// reconciliation defaults (row E3: soon 1-3d, soonish 4-7d, future 8+d).
// M0-D23 fixes the seven-band *count* and says thresholds are locally
// configurable; it does not restate these numbers as an approved default.
// M3.3 is the packet that makes these thresholds user-configurable and
// validated (ordered, bounded, non-overlapping) — this module's constants
// are the working default until then, deliberately isolated here so M3.3
// can replace them with a per-device setting without touching the band
// logic itself.

import type { TaskDto } from '../../../shared/contracts/dto';
import { isClosedStatus } from '../../../shared/domain/enums';

export const DEFAULT_DUE_THRESHOLDS = {
  /** Inclusive upper bound, in whole days from today, for the "soon" band. */
  soonMaxDays: 3,
  /** Inclusive upper bound, in whole days from today, for the "soonish" band. */
  soonishMaxDays: 7,
} as const;

export type DueBand =
  'overdue' | 'today' | 'soon' | 'soonish' | 'future' | 'complete' | 'unscheduled';

export interface DueBandResult {
  band: DueBand;
  /** Redundant text label — the band must never be color-only (AC-G2). */
  label: string;
}

const BAND_LABELS: Record<DueBand, string> = {
  overdue: 'Overdue',
  today: 'Due today',
  soon: 'Due soon',
  soonish: 'Due soonish',
  future: 'Due later',
  complete: 'Complete',
  unscheduled: 'TBD',
};

/**
 * The seven bands in the order they escalate, most urgent first (M0-D23).
 * Exported so the Legend can enumerate them in a meaningful order rather
 * than whatever order an object's keys happen to iterate in.
 */
export const DUE_BANDS_IN_ORDER: readonly DueBand[] = [
  'overdue',
  'today',
  'soon',
  'soonish',
  'future',
  'complete',
  'unscheduled',
] as const;

/**
 * How a band reads in the Legend, which differs from a task row's own label
 * on purpose: a row says what *that task* is ("Due soon"), while the Legend
 * has to teach the boundary the band actually covers ("4-7 days"). The
 * day-count bands are therefore rendered from the caller's live thresholds,
 * so the Legend stays truthful when a user changes them (M3.3).
 */
export function describeDueBand(
  band: DueBand,
  thresholds: { soonMaxDays: number; soonishMaxDays: number } = DEFAULT_DUE_THRESHOLDS
): string {
  switch (band) {
    case 'soon':
      return thresholds.soonMaxDays === 1 ? '1 day' : `1-${thresholds.soonMaxDays} days`;
    case 'soonish':
      return thresholds.soonMaxDays + 1 === thresholds.soonishMaxDays
        ? `${thresholds.soonishMaxDays} days`
        : `${thresholds.soonMaxDays + 1}-${thresholds.soonishMaxDays} days`;
    case 'future':
      return `${thresholds.soonishMaxDays + 1}+ days`;
    case 'unscheduled':
      return 'No due date';
    // `computeDueBand` puts *both* closed statuses in this band, so naming it
    // "Complete" in a key would be inaccurate for cancelled tasks and would
    // also collide with the Status row's own "Complete" entry, which is a
    // different concept with the same word.
    case 'complete':
      return 'Complete or cancelled';
    default:
      return BAND_LABELS[band];
  }
}

/**
 * Whole-day difference between a due date (`YYYY-MM-DD`, local/date-only —
 * matching `validateDueDate`'s stored format) and "today" in the same
 * calendar. Parsed as UTC midnight on both sides so the subtraction is a
 * clean day count regardless of the caller's timezone offset.
 */
function daysUntil(dueDate: string, now: Date): number {
  const due = new Date(`${dueDate}T00:00:00Z`);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((due.getTime() - today.getTime()) / msPerDay);
}

/**
 * `now` is injectable for deterministic tests; production callers omit it.
 * A closed task (`complete`/`cancelled`, per `isClosedStatus`) is always
 * `complete` regardless of its due date — closing a task is a stronger,
 * more recent signal than whatever date it happened to carry.
 */
export function computeDueBand(
  task: Pick<TaskDto, 'status' | 'dueDate'>,
  now: Date = new Date(),
  thresholds: { soonMaxDays: number; soonishMaxDays: number } = DEFAULT_DUE_THRESHOLDS
): DueBandResult {
  if (isClosedStatus(task.status)) {
    // The band is shared by both closed statuses, but the *label* is a
    // statement about this task and must not call a cancelled task complete
    // (M3.6-DEF-13). The band itself is unchanged, so the row's color, sort
    // position, and every existing `.band` assertion are unaffected.
    return {
      band: 'complete',
      label: task.status === 'cancelled' ? 'Cancelled' : BAND_LABELS.complete,
    };
  }
  if (task.dueDate === null) {
    return { band: 'unscheduled', label: BAND_LABELS.unscheduled };
  }

  const days = daysUntil(task.dueDate, now);
  let band: DueBand;
  if (days < 0) band = 'overdue';
  else if (days === 0) band = 'today';
  else if (days <= thresholds.soonMaxDays) band = 'soon';
  else if (days <= thresholds.soonishMaxDays) band = 'soonish';
  else band = 'future';

  return { band, label: BAND_LABELS[band] };
}
