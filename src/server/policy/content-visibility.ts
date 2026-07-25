// Who may see protected content: private tasks, private notes, and
// task-history field values.
//
// This module exists separately from `sheet-access.ts` because the approved
// model makes content visibility a *different axis* from authority. M0-D16 and
// the Launch Contract §2 row "View private content through administrative
// authority" both deny it to Admin, so the rule cannot be expressed as "higher
// role sees more". The functions below therefore never consult `isAdmin` to
// grant anything — an admin reaches these checks with exactly the rights their
// membership gives them, and no more.
//
// Every function returns a decision about a *single* item. Filtering a
// collection is the caller's job (`visibleTasksFor`), so a caller cannot forget
// that the collection needs filtering at all.

import type { TaskRecord } from '../../shared/domain/records';
import type { Actor } from './actor';
import { isEligible } from './actor';
import type { SheetAccessContext } from './sheet-access';
import { canReadSheet, canWriteTasks, isOwner } from './sheet-access';

/**
 * May the actor see that this task exists, and its non-private fields?
 *
 * A private task is visible only to the List owner (M0 §3: "hidden from
 * Viewers, Editors, and administrators and visible only to its List owner").
 * For a non-private task this is the ordinary List read.
 */
export function canReadTask(actor: Actor, sheet: SheetAccessContext, task: TaskRecord): boolean {
  if (!isEligible(actor)) return false;
  if (task.isPrivate) return isOwner(actor, sheet);
  return canReadSheet(actor, sheet);
}

/**
 * May the actor see this task's `notes`?
 *
 * A private note withholds only the note; the rest of the task stays visible
 * (M0 §3). So this is a narrower question than `canReadTask` and is asked
 * separately when shaping a task DTO — never inferred from it.
 */
export function canReadTaskNotes(
  actor: Actor,
  sheet: SheetAccessContext,
  task: TaskRecord
): boolean {
  if (!canReadTask(actor, sheet, task)) return false;
  if (task.notesPrivate) return isOwner(actor, sheet);
  return true;
}

/**
 * May the actor write to this task?
 *
 * A private task is not writable by a non-owner even when that actor is an
 * Editor on the List: they are not permitted to know it exists, and a write
 * path that "fails differently" for a private task would disclose it. Editors
 * retain full write rights on every non-private task.
 */
export function canWriteTask(actor: Actor, sheet: SheetAccessContext, task: TaskRecord): boolean {
  if (!isEligible(actor)) return false;
  if (task.isPrivate) return isOwner(actor, sheet);
  return canWriteTasks(actor, sheet);
}

/**
 * §2 "View task-history field values": the List owner only. Admin is denied
 * (M0 §5: administrators "cannot read task-history before/after values or other
 * protected history fields") and receives allowlisted metadata instead, which
 * is a different repository read entirely.
 */
export function canReadTaskHistoryValues(actor: Actor, sheet: SheetAccessContext): boolean {
  if (!isEligible(actor)) return false;
  return isOwner(actor, sheet);
}

/**
 * The tasks an actor may see in a List, with private tasks removed for everyone
 * but the owner. Returns a new array; callers must use the result rather than
 * the input.
 */
export function visibleTasksFor(
  actor: Actor,
  sheet: SheetAccessContext,
  tasks: readonly TaskRecord[]
): TaskRecord[] {
  return tasks.filter((task) => canReadTask(actor, sheet, task));
}
