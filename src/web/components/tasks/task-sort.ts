// The fixed launch sort (M0.1 E4 / product-plan B15 note / M0.3 AC-G4):
// "Urgent first always. Then sort by date, then [sort] by importance, then
// alphabetically." Manual/selectable sort is out of scope until V2.1 (F-B15).
//
// AC-G4 (docs/milestones/M0.3-launch-contract-2026-07-23.md:119) names exactly
// four keys — urgent, date, importance, alpha — and no closed/open key. A
// prior version of this comparator added "closed tasks sort after every open
// task" as an unapproved fifth key; Codex's re-review (M3-QA-01) correctly
// identified that as outside the recorded contract, since closed-task
// *visibility* is already a separate, approved preference
// (`ClosedTaskVisibilityPrefs`) — a closed task that a user has chosen to
// still see is sorted exactly like any other task, urgency and all.
//
// One ordering not spelled out by the approved wording is decided here,
// within this packet's implementation authority: an undated (TBD) task sorts
// after every dated task within the same urgency tier, since a fixed due
// date is a stronger scheduling signal than "sometime." Isolated in
// `compareDates` so a later approved decision can change it without
// touching the priority/alpha logic.

import type { TaskDto } from '../../../shared/contracts/dto';
import { TASK_PRIORITIES, type TaskPriority } from '../../../shared/domain/enums';

const PRIORITY_RANK: Record<TaskPriority, number> = Object.fromEntries(
  TASK_PRIORITIES.map((priority, index) => [priority, index])
) as Record<TaskPriority, number>;

/**
 * Ascending: lower sorts first, undated last, both-undated is a tie (0).
 * M3-QA-01 (re-review): the previous version ranked an undated date as
 * `Infinity` and subtracted ranks directly, so two undated tasks produced
 * `Infinity - Infinity = NaN` — a non-zero comparator result that
 * `Array.sort` treats as "leave in place," silently skipping the
 * priority/alpha tie-breakers below for every pair of undated tasks.
 * Comparing the null cases explicitly, instead of subtracting sentinel
 * numbers, has no value for which the difference is undefined.
 */
function compareDates(aDate: string | null, bDate: string | null): number {
  if (aDate === null && bDate === null) return 0;
  if (aDate === null) return 1;
  if (bDate === null) return -1;
  return Date.parse(`${aDate}T00:00:00Z`) - Date.parse(`${bDate}T00:00:00Z`);
}

/** Ascending: lower sorts first. 0 when equal. */
export function compareTasksForDisplay(a: TaskDto, b: TaskDto): number {
  const aUrgent = a.priority === 'urgent';
  const bUrgent = b.priority === 'urgent';
  if (aUrgent !== bUrgent) return aUrgent ? -1 : 1;

  const dateDiff = compareDates(a.dueDate, b.dueDate);
  if (dateDiff !== 0) return dateDiff;

  const priorityDiff = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
  if (priorityDiff !== 0) return priorityDiff;

  return a.name.localeCompare(b.name);
}

export function sortTasksForDisplay(tasks: TaskDto[]): TaskDto[] {
  return [...tasks].sort(compareTasksForDisplay);
}
