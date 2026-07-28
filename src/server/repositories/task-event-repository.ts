import type { TaskEventMetadataRecord, TaskEventRecord } from '../../shared/domain/records';
import { columnList, toNullable } from './row-mapping';

// Task history. This repository is where the M0-D16 separation becomes concrete:
// `changes_json` holds full before/after values including task names and notes,
// so it is List-owner-only content.
//
// `listMetadataForTask` therefore does not read a full event and drop a field —
// it runs a different query that never selects `changes_json`. The distinction
// matters because a filtered-after-the-fact approach fails open the moment
// someone forgets the filter, while a query that cannot return the column fails
// closed by construction.

interface TaskEventRow {
  id: string;
  task_id: string;
  actor_user_id: string | null;
  event_type: string;
  changes_json: string;
  created_at: number;
}

interface TaskEventMetadataRow {
  id: string;
  task_id: string;
  actor_user_id: string | null;
  event_type: string;
  created_at: number;
}

const EVENT_COLUMNS = [
  'id',
  'task_id',
  'actor_user_id',
  'event_type',
  'changes_json',
  'created_at',
] as const;

/** Allowlisted administrative/metadata projection — `changes_json` is absent. */
const EVENT_METADATA_COLUMNS = [
  'id',
  'task_id',
  'actor_user_id',
  'event_type',
  'created_at',
] as const;

function toEventRecord(row: TaskEventRow): TaskEventRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    actorUserId: toNullable(row.actor_user_id),
    eventType: row.event_type,
    changesJson: row.changes_json,
    createdAt: row.created_at,
  };
}

function toEventMetadataRecord(row: TaskEventMetadataRow): TaskEventMetadataRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    actorUserId: toNullable(row.actor_user_id),
    eventType: row.event_type,
    createdAt: row.created_at,
  };
}

export interface AppendTaskEventInput {
  id: string;
  taskId: string;
  actorUserId: string | null;
  eventType: string;
  /** Serialised before/after values. Protected content; List-owner-only on read. */
  changesJson: string;
  now: number;
}

export class TaskEventRepository {
  constructor(private readonly db: D1Database) {}

  /** History is append-only from application routes; there is no update or delete here. */
  async append(input: AppendTaskEventInput): Promise<void> {
    await this.prepareAppend(input).run();
  }

  /**
   * Same statement as `append`, unexecuted, so a caller can batch it with the
   * task mutation it records (M2-FQA-04): a required history row must commit
   * atomically with the change it describes, not as a separate statement that
   * can fail independently and leave a mutation with no evidence.
   */
  prepareAppend(input: AppendTaskEventInput): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO task_events (id, task_id, actor_user_id, event_type, changes_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      )
      .bind(
        input.id,
        input.taskId,
        input.actorUserId,
        input.eventType,
        input.changesJson,
        input.now
      );
  }

  /**
   * Full history including before/after values. Only a caller the policy layer
   * has confirmed to be the List owner may use this.
   */
  async listForTask(taskId: string): Promise<TaskEventRecord[]> {
    const { results } = await this.db
      .prepare(
        `SELECT ${columnList(EVENT_COLUMNS)} FROM task_events
         WHERE task_id = ?1
         ORDER BY created_at, id`
      )
      .bind(taskId)
      .all<TaskEventRow>();
    return results.map(toEventRecord);
  }

  /**
   * Allowlisted metadata: that a change of some type happened, by whom, when.
   * Safe for an administrative audit or recovery surface because the query
   * cannot return the protected values.
   */
  async listMetadataForTask(taskId: string): Promise<TaskEventMetadataRecord[]> {
    const { results } = await this.db
      .prepare(
        `SELECT ${columnList(EVENT_METADATA_COLUMNS)} FROM task_events
         WHERE task_id = ?1
         ORDER BY created_at, id`
      )
      .bind(taskId)
      .all<TaskEventMetadataRow>();
    return results.map(toEventMetadataRecord);
  }

  /** How many history entries a task has, for an opaque administrative summary. */
  async countForTask(taskId: string): Promise<number> {
    const row = await this.db
      .prepare('SELECT COUNT(*) AS event_count FROM task_events WHERE task_id = ?1')
      .bind(taskId)
      .first<{ event_count: number }>();
    return row?.event_count ?? 0;
  }
}
