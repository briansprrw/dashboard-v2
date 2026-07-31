// The administrative recovery surface: restore and purge by opaque identity,
// without ever loading protected content.
//
// This service is deliberately separate from `TaskService` even though both can
// restore a task. `TaskService.restore` legitimately holds a full `TaskRecord`
// because an owner is entitled to it. An administrator is not, so their path
// must never obtain one — and the way to guarantee that is for the
// administrative code to have no access to a method that returns one.
//
// Every read below therefore uses the M2.1 recovery projections
// (`findRecoveryStateById`, `listMetadataForTask`), whose SQL does not select
// `name`, `notes`, the privacy flags, or `changes_json`. There is no full
// record in scope anywhere in this file to accidentally return.

import type {
  SheetRecoveryRecord,
  TaskEventMetadataRecord,
  TaskRecoveryRecord,
} from '../../shared/domain/records';
import { AppError } from '../errors/app-error';
import type { Actor } from '../policy';
import { canPerformOpaqueRecovery, denyForbidden } from '../policy';
import { buildAuditStatement } from './audit';
import type { ServiceDeps } from './service-context';
import { idFactory } from './service-context';

/** Opaque lifecycle state plus a history *count* — never history contents. */
export interface TaskRecoveryView {
  task: TaskRecoveryRecord;
  historyEventCount: number;
}

export class AdminRecoveryService {
  constructor(private readonly deps: ServiceDeps) {}

  private requireAdmin(actor: Actor): void {
    if (!canPerformOpaqueRecovery(actor)) throw denyForbidden();
  }

  /**
   * Administrative view of one task: identity, its List, lifecycle timestamps,
   * and how many history entries exist. Nothing here says what the task is
   * about, and the query cannot return it.
   */
  async getTaskRecoveryState(actor: Actor, taskId: string): Promise<TaskRecoveryView> {
    this.requireAdmin(actor);

    const task = await this.deps.repos.tasks.findRecoveryStateById(taskId);
    if (task === null) {
      throw new AppError(404, 'NOT_FOUND', 'The requested resource was not found.');
    }

    const historyEventCount = await this.deps.repos.taskEvents.countForTask(taskId);
    return { task, historyEventCount };
  }

  /**
   * Allowlisted task-history metadata: that a change of some type happened, by
   * whom, and when. `changesJson` is absent by construction — this is a
   * different query from the owner's history read, not a filtered one.
   */
  async listTaskHistoryMetadata(actor: Actor, taskId: string): Promise<TaskEventMetadataRecord[]> {
    this.requireAdmin(actor);
    return this.deps.repos.taskEvents.listMetadataForTask(taskId);
  }

  async getSheetRecoveryState(actor: Actor, sheetId: string): Promise<SheetRecoveryRecord> {
    this.requireAdmin(actor);

    const sheet = await this.deps.repos.sheets.findRecoveryStateById(sheetId);
    if (sheet === null) {
      throw new AppError(404, 'NOT_FOUND', 'The requested resource was not found.');
    }
    return sheet;
  }

  /**
   * Restores a recycled task by identity alone.
   *
   * Returns the opaque recovery state rather than the task, so even the success
   * response of an administrative action carries no content. Returns the same
   * shape as `getTaskRecoveryState` (including the real history count) so the
   * restore response is not a degraded view of the GET response.
   *
   * Appends the same allowlisted `restored` history event the owner's own
   * restore path writes (M2-FQA-05): omitting it left owner-visible history
   * incomplete for a task recovered through the administrative surface, even
   * though the task itself was genuinely restored. No content is added to
   * that event — same `changesJson: '{}'` the ordinary path writes — so the
   * administrative content boundary is unaffected.
   *
   * The restore, its history entry, and its audit row commit in one D1 batch
   * (M2-FQA-04): required audit/history evidence must not be separable from
   * the mutation it documents by a statement that can fail on its own.
   */
  async restoreTask(actor: Actor, taskId: string): Promise<TaskRecoveryView> {
    this.requireAdmin(actor);

    const existing = await this.deps.repos.tasks.findRecoveryStateById(taskId);
    if (existing === null) {
      throw new AppError(404, 'NOT_FOUND', 'The requested resource was not found.');
    }
    if (existing.recycledAt === null) {
      throw new AppError(409, 'NOT_RECYCLED', 'That item is not in the recycle bin.');
    }

    const now = this.deps.clock();
    await this.deps.db.batch([
      this.deps.repos.tasks.prepareRestore(taskId, actor.userId, now),
      this.deps.repos.taskEvents.prepareAppend({
        id: idFactory(this.deps)(),
        taskId,
        actorUserId: actor.userId,
        eventType: 'restored',
        changesJson: '{}',
        now,
      }),
      buildAuditStatement(this.deps, {
        actorUserId: actor.userId,
        action: 'task.restored.admin',
        targetType: 'task',
        targetId: taskId,
        metadata: { sheetId: existing.sheetId },
      }),
    ]);

    const restored = await this.deps.repos.tasks.findRecoveryStateById(taskId);
    if (restored === null) {
      throw new AppError(404, 'NOT_FOUND', 'The requested resource was not found.');
    }
    const historyEventCount = await this.deps.repos.taskEvents.countForTask(taskId);
    return { task: restored, historyEventCount };
  }

  /**
   * Permanently deletes a recycled task by identity alone, purging its history
   * with it (ON DELETE CASCADE).
   *
   * The audit row records that a purge occurred and against which opaque id —
   * M0 §5's "opaque administrative record that a purge occurred, without
   * retaining purged task content".
   */
  async purgeTask(actor: Actor, taskId: string): Promise<void> {
    this.requireAdmin(actor);

    const existing = await this.deps.repos.tasks.findRecoveryStateById(taskId);
    if (existing === null) {
      throw new AppError(404, 'NOT_FOUND', 'The requested resource was not found.');
    }
    if (existing.recycledAt === null) {
      throw new AppError(
        409,
        'NOT_RECYCLED',
        'A task must be in the recycle bin before it can be permanently deleted.'
      );
    }

    await this.deps.db.batch([
      this.deps.repos.tasks.prepareDeletePermanently(taskId),
      buildAuditStatement(this.deps, {
        actorUserId: actor.userId,
        action: 'task.purged.admin',
        targetType: 'task',
        targetId: taskId,
        metadata: { sheetId: existing.sheetId },
      }),
    ]);
  }

  async restoreSheet(actor: Actor, sheetId: string): Promise<SheetRecoveryRecord> {
    this.requireAdmin(actor);

    const existing = await this.deps.repos.sheets.findRecoveryStateById(sheetId);
    if (existing === null) {
      throw new AppError(404, 'NOT_FOUND', 'The requested resource was not found.');
    }
    if (existing.state !== 'recycled') {
      throw new AppError(409, 'NOT_RECYCLED', 'That item is not in the recycle bin.');
    }

    await this.deps.db.batch([
      this.deps.repos.sheets.prepareRestore(sheetId, this.deps.clock()),
      buildAuditStatement(this.deps, {
        actorUserId: actor.userId,
        action: 'sheet.restored',
        targetType: 'sheet',
        targetId: sheetId,
      }),
    ]);

    const restored = await this.deps.repos.sheets.findRecoveryStateById(sheetId);
    if (restored === null) {
      throw new AppError(404, 'NOT_FOUND', 'The requested resource was not found.');
    }
    return restored;
  }

  /**
   * Permanently deletes a recycled List by opaque identity, cascading to its
   * tasks, task history, and memberships (`ON DELETE CASCADE`,
   * migrations/0002) — the same "List and everything in it, as one unit"
   * lifecycle `SheetService.purge` enforces for an owner's own purge, reached
   * here through the administrative recovery surface instead.
   */
  async purgeSheet(actor: Actor, sheetId: string): Promise<void> {
    this.requireAdmin(actor);

    const existing = await this.deps.repos.sheets.findRecoveryStateById(sheetId);
    if (existing === null) {
      throw new AppError(404, 'NOT_FOUND', 'The requested resource was not found.');
    }
    if (existing.state !== 'recycled') {
      throw new AppError(
        409,
        'NOT_RECYCLED',
        'A List must be in the recycle bin before it can be permanently deleted.'
      );
    }

    await this.deps.db.batch([
      this.deps.repos.sheets.prepareDeletePermanently(sheetId),
      buildAuditStatement(this.deps, {
        actorUserId: actor.userId,
        action: 'sheet.purged.admin',
        targetType: 'sheet',
        targetId: sheetId,
      }),
    ]);
  }
}
