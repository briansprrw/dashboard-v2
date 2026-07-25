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
  canMoveTask,
  canReadTaskHistoryValues,
  canRestoreOrPurgeTask,
  canWriteTask,
  canWriteTasks,
  denyAsNotFound,
  denyForbidden,
  visibleTasksFor,
} from '../policy';
import { canReadTask } from '../policy/content-visibility';
import { writeAuditEvent } from './audit';
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

  async create(actor: Actor, sheetId: string, fields: CreateTaskFields): Promise<TaskRecord> {
    const { context } = await this.sheets.authorize(actor, sheetId);
    if (!canWriteTasks(actor, context)) throw denyForbidden();

    const now = this.deps.clock();
    const maxSortKey = await this.deps.repos.tasks.maxSortKey(sheetId);
    const sortKey = (maxSortKey ?? 0) + SORT_KEY_STEP;

    const task = await this.deps.repos.tasks.create({
      id: idFactory(this.deps)(),
      sheetId,
      ...fields,
      sortKey,
      createdByUserId: actor.userId,
      legacySourceId: null,
      now,
    });

    await this.appendHistory(actor, task.id, 'created', now);
    return task;
  }

  /**
   * Applies a complete new field state.
   *
   * `canWriteTask` (singular) rather than `canWriteTasks` (the List-level
   * right): an Editor may edit ordinary tasks but must not edit a private task
   * they cannot see.
   */
  async update(actor: Actor, taskId: string, fields: UpdateTaskFields): Promise<TaskRecord> {
    const { task, context } = await this.authorizeTask(actor, taskId);
    if (!canWriteTask(actor, context, task)) throw denyForbidden();

    const now = this.deps.clock();
    const updated = await this.deps.repos.tasks.update(taskId, {
      ...fields,
      updatedByUserId: actor.userId,
      now,
    });
    if (updated === null) throw denyAsNotFound();

    await this.appendHistory(actor, taskId, 'updated', now);
    return updated;
  }

  /**
   * Moves a task to another List.
   *
   * Requires write rights on *both* Lists (Launch Contract §2). The destination
   * is authorized through the same `sheets.authorize` path as the source, so a
   * destination the actor cannot even read fails as 404 before the move rule is
   * reached — a caller cannot use a move to probe for Lists.
   */
  async move(actor: Actor, taskId: string, destinationSheetId: string): Promise<TaskRecord> {
    const { task, context: source } = await this.authorizeTask(actor, taskId);

    if (destinationSheetId === task.sheetId) {
      throw new AppError(409, 'ALREADY_IN_SHEET', 'The task is already in that List.');
    }

    const { context: destination } = await this.sheets.authorize(actor, destinationSheetId);

    if (!canMoveTask(actor, source, destination)) throw denyForbidden();
    // The private-task write rule still applies to the task being moved.
    if (!canWriteTask(actor, source, task)) throw denyForbidden();

    const now = this.deps.clock();
    await this.deps.repos.tasks.move(taskId, destinationSheetId, actor.userId, now);
    await this.appendHistory(actor, taskId, 'moved', now);

    const moved = await this.deps.repos.tasks.findById(taskId);
    if (moved === null) throw denyAsNotFound();
    return moved;
  }

  /** Editors and above may recycle (M0 §4). */
  async recycle(actor: Actor, taskId: string): Promise<void> {
    const { task, context } = await this.authorizeTask(actor, taskId);
    if (!canWriteTask(actor, context, task)) throw denyForbidden();

    const now = this.deps.clock();
    await this.deps.repos.tasks.recycle(taskId, actor.userId, now);
    await this.appendHistory(actor, taskId, 'recycled', now);
  }

  /**
   * Restores a recycled task. Owner or Admin only — an Editor who recycled a
   * task cannot undo it (M0 §4).
   *
   * An Admin restoring a task is audited, because it is an administrative
   * override of the ordinary ownership rule.
   */
  async restore(actor: Actor, taskId: string): Promise<TaskRecord> {
    const { task, context } = await this.authorizeTask(actor, taskId);
    if (!canRestoreOrPurgeTask(actor, context)) throw denyForbidden();

    const now = this.deps.clock();
    await this.deps.repos.tasks.restore(taskId, actor.userId, now);
    await this.appendHistory(actor, taskId, 'restored', now);

    if (actor.globalRole === 'admin' && context.ownerUserId !== actor.userId) {
      await writeAuditEvent(this.deps, {
        actorUserId: actor.userId,
        action: 'task.restored.admin',
        targetType: 'task',
        targetId: taskId,
        metadata: { sheetId: task.sheetId },
      });
    }

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
   * (`admin-recovery-service.ts`) and never loads task content at all.
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

    await this.deps.repos.tasks.deletePermanently(taskId);

    if (actor.globalRole === 'admin' && context.ownerUserId !== actor.userId) {
      await writeAuditEvent(this.deps, {
        actorUserId: actor.userId,
        action: 'task.purged.admin',
        targetType: 'task',
        targetId: taskId,
        metadata: { sheetId: task.sheetId },
      });
    }
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
   * Records a history entry.
   *
   * `changesJson` deliberately carries no before/after values yet: the approved
   * full-fidelity history (actor, time, action, changed fields, complete
   * before/after) is M4's deliverable (AC-M4), and writing a half-specified
   * shape now would either box M4 in or create records that look complete but
   * are not. What is written here is the event type and actor, which the
   * metadata projection already exposes.
   */
  private async appendHistory(
    actor: Actor,
    taskId: string,
    eventType: string,
    now: number
  ): Promise<void> {
    if (!isTaskEventType(eventType)) {
      throw new Error(`Unknown task event type: ${eventType}`);
    }

    await this.deps.repos.taskEvents.append({
      id: idFactory(this.deps)(),
      taskId,
      actorUserId: actor.userId,
      eventType,
      changesJson: '{}',
      now,
    });
  }
}
