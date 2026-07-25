import type { AuditEventRecord } from '../../shared/domain/records';
import { columnList, toNullable } from './row-mapping';

// Administrative/security audit stream, separate from task history.
//
// `metadataJson` must already be an allowlisted object serialised by the caller.
// This repository does not and cannot redact: it has no way to tell an approved
// metadata key from a task note. Callers build the object from fixed keys.

interface AuditEventRow {
  id: string;
  actor_user_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata_json: string;
  request_id: string | null;
  created_at: number;
}

const AUDIT_COLUMNS = [
  'id',
  'actor_user_id',
  'action',
  'target_type',
  'target_id',
  'metadata_json',
  'request_id',
  'created_at',
] as const;

function toAuditEventRecord(row: AuditEventRow): AuditEventRecord {
  return {
    id: row.id,
    actorUserId: toNullable(row.actor_user_id),
    action: row.action,
    targetType: row.target_type,
    targetId: toNullable(row.target_id),
    metadataJson: row.metadata_json,
    requestId: toNullable(row.request_id),
    createdAt: row.created_at,
  };
}

export interface AppendAuditEventInput {
  id: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  /** Opaque identity of the affected object; may already be purged. */
  targetId: string | null;
  /** Allowlisted metadata only — never task content, credentials, or session IDs. */
  metadataJson: string;
  requestId: string | null;
  now: number;
}

export class AuditEventRepository {
  constructor(private readonly db: D1Database) {}

  /** Append-only: the audit stream has no update or delete operation by design. */
  async append(input: AppendAuditEventInput): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO audit_events (id, actor_user_id, action, target_type, target_id,
                                   metadata_json, request_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
      )
      .bind(
        input.id,
        input.actorUserId,
        input.action,
        input.targetType,
        input.targetId,
        input.metadataJson,
        input.requestId,
        input.now
      )
      .run();
  }

  /**
   * Most recent audit events, newest first. Bounded by an explicit limit because
   * this collection grows without end; the admin surface that pages through it
   * lands in M4.
   */
  async listRecent(limit: number): Promise<AuditEventRecord[]> {
    const { results } = await this.db
      .prepare(
        `SELECT ${columnList(AUDIT_COLUMNS)} FROM audit_events
         ORDER BY created_at DESC, id DESC
         LIMIT ?1`
      )
      .bind(limit)
      .all<AuditEventRow>();
    return results.map(toAuditEventRecord);
  }

  /** Audit history for one object, including one that has since been purged. */
  async listForTarget(
    targetType: string,
    targetId: string,
    limit: number
  ): Promise<AuditEventRecord[]> {
    const { results } = await this.db
      .prepare(
        `SELECT ${columnList(AUDIT_COLUMNS)} FROM audit_events
         WHERE target_type = ?1 AND target_id = ?2
         ORDER BY created_at DESC, id DESC
         LIMIT ?3`
      )
      .bind(targetType, targetId, limit)
      .all<AuditEventRow>();
    return results.map(toAuditEventRecord);
  }
}
