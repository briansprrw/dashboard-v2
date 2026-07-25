import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  isClosedStatus,
  type TaskPriority,
  type TaskStatus,
} from '../../shared/domain/enums';
import type { TaskRecord, TaskRecoveryRecord } from '../../shared/domain/records';
import { columnList, fromBoolean, toBoolean, toEnum, toNullable } from './row-mapping';

// Tasks. Two things in here carry more weight than ordinary data access:
//
//  1. `closedAt` is derived from the status rather than accepted from the
//     caller, so it can never disagree with it. A CHECK constraint enforces the
//     same rule in the database.
//  2. `findRecoveryStateById` exists so an administrative recovery or purge path
//     never has a full `TaskRecord` in hand. The query does not select `name`,
//     `notes`, or the privacy flags at all — the projection is allowlisted at
//     the SQL boundary rather than filtered afterwards.

interface TaskRow {
  id: string;
  sheet_id: string;
  name: string;
  status: string;
  priority: string;
  due_date: string | null;
  notes: string | null;
  is_private: number;
  notes_private: number;
  emoji_flags_json: string | null;
  sort_key: number;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: number;
  updated_at: number;
  closed_at: number | null;
  recycled_at: number | null;
  legacy_source_id: string | null;
}

interface TaskRecoveryRow {
  id: string;
  sheet_id: string;
  recycled_at: number | null;
  created_at: number;
  updated_at: number;
}

const TASK_COLUMNS = [
  'id',
  'sheet_id',
  'name',
  'status',
  'priority',
  'due_date',
  'notes',
  'is_private',
  'notes_private',
  'emoji_flags_json',
  'sort_key',
  'created_by_user_id',
  'updated_by_user_id',
  'created_at',
  'updated_at',
  'closed_at',
  'recycled_at',
  'legacy_source_id',
] as const;

/**
 * The administrative-recovery projection. Every omission is deliberate: no
 * `name` or `notes` (user content), no `is_private`/`notes_private` (revealing
 * that a task is private is itself information about it), no `status`,
 * `priority`, or `due_date` (what the work is and when it is due).
 */
const TASK_RECOVERY_COLUMNS = [
  'id',
  'sheet_id',
  'recycled_at',
  'created_at',
  'updated_at',
] as const;

function toTaskRecord(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    sheetId: row.sheet_id,
    name: row.name,
    status: toEnum(TASK_STATUSES, row.status, 'tasks.status'),
    priority: toEnum(TASK_PRIORITIES, row.priority, 'tasks.priority'),
    dueDate: toNullable(row.due_date),
    notes: toNullable(row.notes),
    isPrivate: toBoolean(row.is_private, 'tasks.is_private'),
    notesPrivate: toBoolean(row.notes_private, 'tasks.notes_private'),
    emojiFlagsJson: toNullable(row.emoji_flags_json),
    sortKey: row.sort_key,
    createdByUserId: toNullable(row.created_by_user_id),
    updatedByUserId: toNullable(row.updated_by_user_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: toNullable(row.closed_at),
    recycledAt: toNullable(row.recycled_at),
    legacySourceId: toNullable(row.legacy_source_id),
  };
}

export interface CreateTaskInput {
  id: string;
  sheetId: string;
  name: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  notes: string | null;
  isPrivate: boolean;
  notesPrivate: boolean;
  emojiFlagsJson: string | null;
  sortKey: number;
  createdByUserId: string | null;
  /**
   * Reconciliation-only origin id, matching `CreateSheetInput`. Ordinary task
   * creation passes null; it exists so a later import has a write path for a
   * column the approved schema already defines, and it is never exposed through
   * an ordinary DTO.
   */
  legacySourceId: string | null;
  now: number;
}

/** Every editable task field. Callers pass the complete intended state. */
export interface UpdateTaskInput {
  name: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  notes: string | null;
  isPrivate: boolean;
  notesPrivate: boolean;
  emojiFlagsJson: string | null;
  updatedByUserId: string | null;
  now: number;
}

export class TaskRepository {
  constructor(private readonly db: D1Database) {}

  async create(input: CreateTaskInput): Promise<TaskRecord> {
    // Derived, never supplied: a closed status implies a close time and an open
    // status implies none.
    const closedAt = isClosedStatus(input.status) ? input.now : null;

    await this.db
      .prepare(
        `INSERT INTO tasks (id, sheet_id, name, status, priority, due_date, notes,
                            is_private, notes_private, emoji_flags_json, sort_key,
                            created_by_user_id, updated_by_user_id,
                            created_at, updated_at, closed_at, recycled_at, legacy_source_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12, ?13, ?13, ?14, NULL, ?15)`
      )
      .bind(
        input.id,
        input.sheetId,
        input.name,
        input.status,
        input.priority,
        input.dueDate,
        input.notes,
        fromBoolean(input.isPrivate),
        fromBoolean(input.notesPrivate),
        input.emojiFlagsJson,
        input.sortKey,
        input.createdByUserId,
        input.now,
        closedAt,
        input.legacySourceId
      )
      .run();

    const created = await this.findById(input.id);
    if (created === null) throw new Error('Task insert did not produce a readable row');
    return created;
  }

  async findById(id: string): Promise<TaskRecord | null> {
    const row = await this.db
      .prepare(`SELECT ${columnList(TASK_COLUMNS)} FROM tasks WHERE id = ?1`)
      .bind(id)
      .first<TaskRow>();
    return row === null ? null : toTaskRecord(row);
  }

  /**
   * The only task read an administrative recovery or purge path may use. It
   * cannot leak protected content because the query never selects it.
   */
  async findRecoveryStateById(id: string): Promise<TaskRecoveryRecord | null> {
    const row = await this.db
      .prepare(`SELECT ${columnList(TASK_RECOVERY_COLUMNS)} FROM tasks WHERE id = ?1`)
      .bind(id)
      .first<TaskRecoveryRow>();
    if (row === null) return null;
    return {
      id: row.id,
      sheetId: row.sheet_id,
      recycledAt: toNullable(row.recycled_at),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Active (non-recycled) tasks in a List, in launch order. `sort_key` alone is
   * not a total order, so `id` breaks ties deterministically — two tasks sharing
   * a sort key must not swap positions between reads.
   */
  async listActiveBySheet(sheetId: string): Promise<TaskRecord[]> {
    const { results } = await this.db
      .prepare(
        `SELECT ${columnList(TASK_COLUMNS)} FROM tasks
         WHERE sheet_id = ?1 AND recycled_at IS NULL
         ORDER BY sort_key, id`
      )
      .bind(sheetId)
      .all<TaskRow>();
    return results.map(toTaskRecord);
  }

  /** Recycled tasks in a List, most recently recycled first. */
  async listRecycledBySheet(sheetId: string): Promise<TaskRecord[]> {
    const { results } = await this.db
      .prepare(
        `SELECT ${columnList(TASK_COLUMNS)} FROM tasks
         WHERE sheet_id = ?1 AND recycled_at IS NOT NULL
         ORDER BY recycled_at DESC, id`
      )
      .bind(sheetId)
      .all<TaskRow>();
    return results.map(toTaskRecord);
  }

  /**
   * Applies a complete new field state. `closed_at` is recomputed from the
   * status: it is set when the task closes, cleared when it reopens, and left
   * unchanged while the task stays closed, so reopening and re-closing does not
   * rewrite an earlier close time on an unrelated edit.
   */
  async update(id: string, input: UpdateTaskInput): Promise<TaskRecord | null> {
    await this.db
      .prepare(
        `UPDATE tasks
         SET name = ?2, status = ?3, priority = ?4, due_date = ?5, notes = ?6,
             is_private = ?7, notes_private = ?8, emoji_flags_json = ?9,
             updated_by_user_id = ?10, updated_at = ?11,
             closed_at = CASE
               WHEN ?3 IN ('complete', 'cancelled') THEN COALESCE(closed_at, ?11)
               ELSE NULL
             END
         WHERE id = ?1`
      )
      .bind(
        id,
        input.name,
        input.status,
        input.priority,
        input.dueDate,
        input.notes,
        fromBoolean(input.isPrivate),
        fromBoolean(input.notesPrivate),
        input.emojiFlagsJson,
        input.updatedByUserId,
        input.now
      )
      .run();

    return this.findById(id);
  }

  /**
   * Moves the task to another List. Whether the actor may do so in *both* the
   * source and the destination is a policy decision made before this call.
   */
  async move(
    id: string,
    targetSheetId: string,
    actorUserId: string | null,
    now: number
  ): Promise<void> {
    await this.db
      .prepare(
        'UPDATE tasks SET sheet_id = ?2, updated_by_user_id = ?3, updated_at = ?4 WHERE id = ?1'
      )
      .bind(id, targetSheetId, actorUserId, now)
      .run();
  }

  /** Sends the task to the recycle bin. The row and its history are preserved. */
  async recycle(id: string, actorUserId: string | null, now: number): Promise<void> {
    await this.db
      .prepare(
        'UPDATE tasks SET recycled_at = ?2, updated_by_user_id = ?3, updated_at = ?2 WHERE id = ?1'
      )
      .bind(id, now, actorUserId)
      .run();
  }

  async restore(id: string, actorUserId: string | null, now: number): Promise<void> {
    await this.db
      .prepare(
        `UPDATE tasks SET recycled_at = NULL, updated_by_user_id = ?2, updated_at = ?3
         WHERE id = ?1`
      )
      .bind(id, actorUserId, now)
      .run();
  }

  /**
   * Permanently removes the task. Its history rows go with it via ON DELETE
   * CASCADE, matching "permanently deleting a task purges the task and its task
   * history". Reports whether a row was actually removed so an administrative
   * caller can distinguish "purged" from "already gone" without reading content.
   */
  async deletePermanently(id: string): Promise<boolean> {
    const result = await this.db.prepare('DELETE FROM tasks WHERE id = ?1').bind(id).run();
    return (result.meta.changes ?? 0) > 0;
  }

  /**
   * Highest sort key currently in a List, or null when it is empty. Used to
   * allocate a spaced key for a new task instead of the V1 pattern of reading a
   * max row index and writing an adjacent value with no ordering strategy.
   */
  async maxSortKey(sheetId: string): Promise<number | null> {
    const row = await this.db
      .prepare('SELECT MAX(sort_key) AS max_sort_key FROM tasks WHERE sheet_id = ?1')
      .bind(sheetId)
      .first<{ max_sort_key: number | null }>();
    return row?.max_sort_key ?? null;
  }
}
