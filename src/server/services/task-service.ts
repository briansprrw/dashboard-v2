// Tasks: reads that respect private content, writes that respect the matrix,
// moves that require rights on both ends, and the recycle/restore/purge
// lifecycle.
//
// Two rules in here are load-bearing for privacy and are implemented so that
// forgetting them is not possible from outside this file:
//
//   1. A private task is invisible to non-owners. Every denial for a private
//      task is a 404, never a 403, so the API cannot be used to test whether a
//      private task exists.
//   2. A private note is withheld without hiding the task. That is a separate
//      decision from (1) and is applied when the DTO is built (M2.4), using the
//      policy function this service exposes results from.

import type { TaskPriority, TaskStatus } from '../../shared/domain/enums';
import { isTaskEventType } from '../../shared/domain/enums';
import type { TaskEventRecord, TaskRecord } from '../../shared/domain/records';
import { AppError } from '../errors/app-error';
import type { Actor, SheetAccessContext } from '../policy';
import {
  canReadTaskHistoryValues,
  canRestoreOrPurgeTask,
  canWriteTask,
  canWriteTaskAsPrivate,
  canWriteTaskNotesAsPrivate,
  canWriteTasks,
  denyAsNotFound,
  denyForbidden,
  moveAcquiresOwnership,
  moveTaskDecision,
  visibleTasksFor,
} from '../policy';
import { canReadTask } from '../policy/content-visibility';
import { buildAuditStatement } from './audit';
import type { ServiceDeps } from './service-context';
import { idFactory } from './service-context';
import type { SheetService } from './sheet-service';

/** New-task fields a client may supply. Ordering and timestamps are derived. */
export interface CreateTaskFields {
  name: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  notes: string | null;
  isPrivate: boolean;
  notesPrivate: boolean;
  emojiFlagsJson: string | null;
}

export type UpdateTaskFields = CreateTaskFields;

/** Spacing between allocated sort keys, leaving room for later reordering. */
const SORT_KEY_STEP = 1000;

export class TaskService {
  constructor(
    private readonly deps: ServiceDeps,
    private readonly sheets: SheetService
  ) {}

  /**
   * Active tasks in a List, with private tasks removed for every actor but the
   * owner. Filtering happens here rather than in the route so no route can
   * return an unfiltered list.
   */
  async listForSheet(actor: Actor, sheetId: string): Promise<TaskRecord[]> {
    const { context } = await this.sheets.authorize(actor, sheetId);
    const tasks = await this.deps.repos.tasks.listActiveBySheet(sheetId);
    return visibleTasksFor(actor, context, tasks);
  }

  /** Recycled tasks in a List, same private-task filtering. */
  async listRecycledForSheet(actor: Actor, sheetId: string): Promise<TaskRecord[]> {
    const { context } = await this.sheets.authorize(actor, sheetId);
    const tasks = await this.deps.repos.tasks.listRecycledBySheet(sheetId);
    return visibleTasksFor(actor, context, tasks);
  }

  /**
   * Loads one task with its List context, denying as 404 whenever the actor may
   * not see it — including the private-task case, where 403 would disclose the
   * task's existence.
   */
  async authorizeTask(
    actor: Actor,
    taskId: string
  ): Promise<{ task: TaskRecord; context: SheetAccessContext }> {
    const task = await this.deps.repos.tasks.findById(taskId);
    if (task === null) throw denyAsNotFound();

    // Reuses the List authorization, so a task in a List the actor cannot read
    // is unreachable for the same reason the List is.
    const { context } = await this.sheets.authorize(actor, task.sheetId);
    if (!canReadTask(actor, context, task)) throw denyAsNotFound();

    return { task, context };
  }

  async getById(
    actor: Actor,
    taskId: string
  ): Promise<{ task: TaskRecord; context: SheetAccessContext }> {
    return this.authorizeTask(actor, taskId);
  }

  /**
   * `canWriteTasks` covers the List-level right; `canWriteTaskAsPrivate` and
   * `canWriteTaskNotesAsPrivate` are the separate, narrower checks for the
   * specific `isPrivate`/`notesPrivate` values being written (M2-FQA-03,
   * M2-FQA-RR-02) — creation authorized only the List, never the
   * requested-private state on either axis, so a non-owning Editor or Admin
   * could create an owner-only task, or an ordinary task with an owner-only
   * note, that they could never have written into an existing one.
   */
  async create(actor: Actor, sheetId: string, fields: CreateTaskFields): Promise<TaskRecord> {
    const { context } = await this.sheets.authorize(actor, sheetId);
    if (!canWriteTasks(actor, context)) throw denyForbidden();
    if (!canWriteTaskAsPrivate(actor, context, fields.isPrivate)) throw denyForbidden();
    if (!canWriteTaskNotesAsPrivate(actor, context, false, fields.notesPrivate)) {
      throw denyForbidden();
    }

    const now = this.deps.clock();
    const maxSortKey = await this.deps.repos.tasks.maxSortKey(sheetId);
    const sortKey = (maxSortKey ?? 0) + SORT_KEY_STEP;
    const taskId = idFactory(this.deps)();

    await this.deps.db.batch([
      this.deps.repos.tasks.prepareCreate({
        id: taskId,
        sheetId,
        ...fields,
        sortKey,
        createdByUserId: actor.userId,
        legacySourceId: null,
        now,
      }),
      this.prepareHistory(actor, taskId, 'created', now),
    ]);

    const task = await this.deps.repos.tasks.findById(taskId);
    if (task === null) throw new Error('Task insert did not produce a readable row');
    return task;
  }

  /**
   * Applies a complete new field state.
   *
   * `canWriteTask` (singular) rather than `canWriteTasks` (the List-level
   * right): an Editor may edit ordinary tasks but must not edit a private task
   * they cannot see. That alone checks only the task's *current* stored
   * state, so `canWriteTaskAsPrivate` additionally authorizes the *requested*
   * `isPrivate` value (M2-FQA-03): without it, a non-owning Editor could turn
   * an ordinary task they may write into a private one, producing owner-only
   * content they were never permitted to create. `canWriteTaskNotesAsPrivate`
   * does the same for the independent `notesPrivate` axis (M2-FQA-RR-02),
   * checking both the note's current and requested private state — a
   * non-owner may not touch an already-private note, nor make an ordinary
   * one private, nor clear/un-private one, since all of those change
   * owner-only content.
   */
  async update(actor: Actor, taskId: string, fields: UpdateTaskFields): Promise<TaskRecord> {
    const { task, context } = await this.authorizeTask(actor, taskId);
    if (!canWriteTask(actor, context, task)) throw denyForbidden();
    if (!canWriteTaskAsPrivate(actor, context, fields.isPrivate)) throw denyForbidden();
    if (!canWriteTaskNotesAsPrivate(actor, context, task.notesPrivate, fields.notesPrivate)) {
      throw denyForbidden();
    }

    const now = this.deps.clock();
    await this.deps.db.batch([
      this.deps.repos.tasks.prepareUpdate(taskId, {
        ...fields,
        updatedByUserId: actor.userId,
        now,
      }),
      this.prepareHistory(actor, taskId, 'updated', now),
    ]);

    const updated = await this.deps.repos.tasks.findById(taskId);
    if (updated === null) throw denyAsNotFound();
    return updated;
  }

  /**
   * Moves a task to another List.
   *
   * Requires write rights on *both* Lists (Launch Contract §2). The destination
   * is authorized through the same `sheets.authorize` path as the source, so a
   * destination the actor cannot even read fails as 404 before the move rule is
   * reached — a caller cannot use a move to probe for Lists.
   *
   * A move that crosses an ownership boundary is a privacy-relevant action, not
   * a neutral filing operation, so it is handled by three-way outcome rather
   * than a plain allow/deny (Brian's decision, 2026-07-26, resolving M2.5's
   * open question on M2-AR-01): acquiring someone else's task is always
   * refused; a List owner giving their own task to someone else's List is
   * allowed but only once the caller passes `confirmed: true`, since it hands
   * that List's new owner sole visibility into the task's private note and
   * history values; every other move needs no confirmation.
   *
   * Returns the moved task plus the *destination* List's access context, so a
   * caller can decide what the acting user may now read without a second
   * authorization pass (M2-FQA-06). A confirmed relinquishing move revokes the
   * mover's own content rights on the task by design — that is what the
   * confirmation warns about — so re-authorizing as that actor after the move
   * would wrongly report a successful mutation as a 404. The destination
   * context this method already resolved is the correct, safe basis for the
   * response instead.
   */
  async move(
    actor: Actor,
    taskId: string,
    destinationSheetId: string,
    confirmed: boolean
  ): Promise<{ task: TaskRecord; context: SheetAccessContext }> {
    const { task, context: source } = await this.authorizeTask(actor, taskId);

    if (destinationSheetId === task.sheetId) {
      throw new AppError(409, 'ALREADY_IN_SHEET', 'The task is already in that List.');
    }

    const { context: destination } = await this.sheets.authorize(actor, destinationSheetId);

    const decision = moveTaskDecision(actor, source, destination, confirmed);
    if (decision.kind === 'denied') {
      // When the actor does hold edit rights on both Lists, the refusal is the
      // ownership-boundary one, and saying so is accurate without disclosing
      // anything the actor does not already know about their own access.
      const hasWriteRights = canWriteTasks(actor, source) && canWriteTasks(actor, destination);
      if (hasWriteRights && moveAcquiresOwnership(actor, source, destination)) {
        throw denyForbidden(
          'You cannot move a task out of a List you do not own into a List you own.'
        );
      }
      if (hasWriteRights) {
        throw denyForbidden(
          'You cannot move a task between Lists with different owners unless you own the source List.'
        );
      }
      throw denyForbidden();
    }
    if (decision.kind === 'requiresConfirmation') {
      throw new AppError(
        409,
        'CONFIRMATION_REQUIRED',
        'Moving this task will make it, its private notes, and its task history visible only to the new List owner — you will no longer be able to read them. Resend with confirmed: true to proceed.'
      );
    }
    // The private-task write rule still applies to the task being moved.
    if (!canWriteTask(actor, source, task)) throw denyForbidden();

    const now = this.deps.clock();
    await this.deps.db.batch([
      this.deps.repos.tasks.prepareMove(taskId, destinationSheetId, actor.userId, now),
      this.prepareHistory(actor, taskId, 'moved', now),
    ]);

    const moved = await this.deps.repos.tasks.findById(taskId);
    if (moved === null) throw denyAsNotFound();
    return { task: moved, context: destination };
  }

  /** Editors and above may recycle (M0 §4). */
  async recycle(actor: Actor, taskId: string): Promise<void> {
    const { task, context } = await this.authorizeTask(actor, taskId);
    if (!canWriteTask(actor, context, task)) throw denyForbidden();

    const now = this.deps.clock();
    await this.deps.db.batch([
      this.deps.repos.tasks.prepareRecycle(taskId, actor.userId, now),
      this.prepareHistory(actor, taskId, 'recycled', now),
    ]);
  }

  /**
   * Restores a recycled task. Owner or Admin only — an Editor who recycled a
   * task cannot undo it (M0 §4).
   *
   * An Admin restoring a task is audited, because it is an administrative
   * override of the ordinary ownership rule. The restore, its history entry,
   * and that audit row (when applicable) commit in one D1 batch (M2-FQA-04):
   * a required audit or history row must not be separable from the mutation
   * it documents by a statement that can fail on its own.
   */
  async restore(actor: Actor, taskId: string): Promise<TaskRecord> {
    const { task, context } = await this.authorizeTask(actor, taskId);
    if (!canRestoreOrPurgeTask(actor, context)) throw denyForbidden();

    const now = this.deps.clock();
    const statements = [
      this.deps.repos.tasks.prepareRestore(taskId, actor.userId, now),
      this.prepareHistory(actor, taskId, 'restored', now),
    ];
    if (actor.globalRole === 'admin' && context.ownerUserId !== actor.userId) {
      statements.push(
        buildAuditStatement(this.deps, {
          actorUserId: actor.userId,
          action: 'task.restored.admin',
          targetType: 'task',
          targetId: taskId,
          metadata: { sheetId: task.sheetId },
        })
      );
    }
    await this.deps.db.batch(statements);

    const restored = await this.deps.repos.tasks.findById(taskId);
    if (restored === null) throw denyAsNotFound();
    return restored;
  }

  /**
   * Permanently deletes a recycled task and its history.
   *
   * Requires the task to be recycled first, preserving the 30-day window. Note
   * that this is the *owner's* purge path, which legitimately holds the task
   * record. The administrative purge-by-opaque-identity path is separate
   * (`admin-recovery-service.ts`) and never loads task content at all. The
   * delete and its admin audit row (when applicable) commit in one D1 batch
   * (M2-FQA-04), same reasoning as `restore`.
   */
  async purge(actor: Actor, taskId: string): Promise<void> {
    const { task, context } = await this.authorizeTask(actor, taskId);
    if (!canRestoreOrPurgeTask(actor, context)) throw denyForbidden();

    if (task.recycledAt === null) {
      throw new AppError(
        409,
        'NOT_RECYCLED',
        'A task must be in the recycle bin before it can be permanently deleted.'
      );
    }

    const statements: D1PreparedStatement[] = [
      this.deps.repos.tasks.prepareDeletePermanently(taskId),
    ];
    if (actor.globalRole === 'admin' && context.ownerUserId !== actor.userId) {
      statements.push(
        buildAuditStatement(this.deps, {
          actorUserId: actor.userId,
          action: 'task.purged.admin',
          targetType: 'task',
          targetId: taskId,
          metadata: { sheetId: task.sheetId },
        })
      );
    }
    await this.deps.db.batch(statements);
  }

  /**
   * Full task history including before/after values. List-owner-only: an Admin
   * calling this is denied here and must use the allowlisted metadata read on
   * the administrative surface instead.
   */
  async listHistory(actor: Actor, taskId: string): Promise<TaskEventRecord[]> {
    const { context } = await this.authorizeTask(actor, taskId);
    if (!canReadTaskHistoryValues(actor, context)) throw denyForbidden();
    return this.deps.repos.taskEvents.listForTask(taskId);
  }

  /**
   * Builds a history-entry statement without executing it, so every caller
   * batches it with the task mutation it records (M2-FQA-04) rather than
   * writing it as a separate statement that can fail independently and leave
   * a committed mutation with no history evidence.
   *
   * `changesJson` deliberately carries no before/after values yet: the approved
   * full-fidelity history (actor, time, action, changed fields, complete
   * before/after) is M4's deliverable (AC-M4), and writing a half-specified
   * shape now would either box M4 in or create records that look complete but
   * are not. What is written here is the event type and actor, which the
   * metadata projection already exposes.
   */
  private prepareHistory(
    actor: Actor,
    taskId: string,
    eventType: string,
    now: number
  ): D1PreparedStatement {
    if (!isTaskEventType(eventType)) {
      throw new Error(`Unknown task event type: ${eventType}`);
    }

    return this.deps.repos.taskEvents.prepareAppend({
      id: idFactory(this.deps)(),
      taskId,
      actorUserId: actor.userId,
      eventType,
      changesJson: '{}',
      now,
    });
  }
}
