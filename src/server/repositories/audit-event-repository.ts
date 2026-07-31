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
    await this.prepareAppend(input).run();
  }

  /**
   * Same statement as `append`, unexecuted, so a caller can batch it with the
   * mutation it audits (M2-FQA-04): required audit evidence must commit
   * atomically with the state change it documents.
   */
  prepareAppend(input: AppendAuditEventInput): D1PreparedStatement {
    return this.db
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
      );
  }

  /**
   * Same statement as `prepareAppend`, but it only writes while the List
   * `sheetId` is still owned by `expectedOwnerUserId` (M4-AR-01).
   *
   * `prepareAppend` alone is not safe inside an owner-guarded batch. The guard
   * on a membership or ownership statement makes that *one* statement affect
   * zero rows when a concurrent transfer has already moved ownership — but
   * zero matched rows is not a SQL error, so the batch commits successfully
   * and only the application code afterwards turns it into `409
   * OWNERSHIP_CHANGED`. An unguarded audit row in that same batch is therefore
   * already durable by the time the request reports failure, leaving the
   * administrative stream asserting a grant, role change, revocation, or
   * ownership transfer that never happened.
   *
   * Expressed as `INSERT ... SELECT ... WHERE EXISTS` for the same reason
   * `MembershipRepository.prepareUpsertIfOwner` is: the predicate has to gate
   * the whole statement, not a column of the row being written.
   */
  prepareAppendIfSheetOwner(
    input: AppendAuditEventInput,
    sheetId: string,
    expectedOwnerUserId: string
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO audit_events (id, actor_user_id, action, target_type, target_id,
                                   metadata_json, request_id, created_at)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
         WHERE EXISTS (SELECT 1 FROM sheets WHERE id = ?9 AND owner_user_id = ?10)`
      )
      .bind(
        input.id,
        input.actorUserId,
        input.action,
        input.targetType,
        input.targetId,
        input.metadataJson,
        input.requestId,
        input.now,
        sheetId,
        expectedOwnerUserId
      );
  }

  /**
   * As `prepareAppendIfSheetOwner`, plus a requirement that `activeUserId` is
   * still an active account (Codex M4-RR2-01).
   *
   * Ownership transfer authorizes two independent facts — the actor still owns
   * the List, and the *target* is still eligible to own one — and both were
   * read before the batch. Only the first was carried into the write, so a
   * target disabled or recycled in between could still be installed as owner
   * with a clean audit row asserting a legitimate transfer.
   */
  prepareAppendIfSheetOwnerAndActiveUser(
    input: AppendAuditEventInput,
    sheetId: string,
    expectedOwnerUserId: string,
    activeUserId: string
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO audit_events (id, actor_user_id, action, target_type, target_id,
                                   metadata_json, request_id, created_at)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
         WHERE EXISTS (SELECT 1 FROM sheets WHERE id = ?9 AND owner_user_id = ?10)
           AND EXISTS (SELECT 1 FROM users WHERE id = ?11 AND state = 'active')`
      )
      .bind(
        input.id,
        input.actorUserId,
        input.action,
        input.targetType,
        input.targetId,
        input.metadataJson,
        input.requestId,
        input.now,
        sheetId,
        expectedOwnerUserId,
        activeUserId
      );
  }

  /**
   * As `prepareAppendIfSheetOwner`, plus a requirement that `memberUserId`
   * still holds a membership on the List (Codex M4-RR2-03).
   *
   * A revocation's audit row must be bound to a removal that actually happens.
   * Guarded only by ownership, two concurrent revokes of the same membership
   * both wrote `sheet.membership.revoked` — one of them from a request whose
   * `DELETE` matched nothing and which then reported failure.
   *
   * Callers must place this **before** the `DELETE` in the batch: statements
   * run sequentially inside the transaction, so an audit row placed after the
   * removal would test its own precondition against the row the `DELETE` had
   * just erased and never fire.
   */
  prepareAppendIfSheetOwnerAndMembership(
    input: AppendAuditEventInput,
    sheetId: string,
    expectedOwnerUserId: string,
    memberUserId: string
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO audit_events (id, actor_user_id, action, target_type, target_id,
                                   metadata_json, request_id, created_at)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
         WHERE EXISTS (SELECT 1 FROM sheets WHERE id = ?9 AND owner_user_id = ?10)
           AND EXISTS (SELECT 1 FROM sheet_memberships
                       WHERE sheet_id = ?9 AND user_id = ?11)`
      )
      .bind(
        input.id,
        input.actorUserId,
        input.action,
        input.targetType,
        input.targetId,
        input.metadataJson,
        input.requestId,
        input.now,
        sheetId,
        expectedOwnerUserId,
        memberUserId
      );
  }

  /**
   * Most recent audit events, newest first. Bounded by an explicit limit
   * because this collection grows without end.
   *
   * `before`, when given, is a `(createdAt, id)` cursor — the last row of the
   * previous page — rather than an offset (M4-QA-08). Two events can share
   * the same `created_at` millisecond, so an offset-based page (`LIMIT/OFFSET`)
   * can silently skip or repeat rows across pages when new events are
   * appended between reads; comparing the full `(created_at, id)` tuple
   * against the same `ORDER BY` the query already uses does not have that
   * failure mode, because the tuple is unique and monotonically decreasing
   * in the same order the page is walked.
   */
  async listRecent(limit: number, before?: AuditCursor): Promise<AuditEventRecord[]> {
    const { results } = await (
      before
        ? this.db
            .prepare(
              `SELECT ${columnList(AUDIT_COLUMNS)} FROM audit_events
             WHERE (created_at < ?1) OR (created_at = ?1 AND id < ?2)
             ORDER BY created_at DESC, id DESC
             LIMIT ?3`
            )
            .bind(before.createdAt, before.id, limit)
        : this.db
            .prepare(
              `SELECT ${columnList(AUDIT_COLUMNS)} FROM audit_events
             ORDER BY created_at DESC, id DESC
             LIMIT ?1`
            )
            .bind(limit)
    ).all<AuditEventRow>();
    return results.map(toAuditEventRecord);
  }

  /** Audit history for one object, including one that has since been purged. Same cursor contract as `listRecent`. */
  async listForTarget(
    targetType: string,
    targetId: string,
    limit: number,
    before?: AuditCursor
  ): Promise<AuditEventRecord[]> {
    const { results } = await (
      before
        ? this.db
            .prepare(
              `SELECT ${columnList(AUDIT_COLUMNS)} FROM audit_events
             WHERE target_type = ?1 AND target_id = ?2
               AND ((created_at < ?3) OR (created_at = ?3 AND id < ?4))
             ORDER BY created_at DESC, id DESC
             LIMIT ?5`
            )
            .bind(targetType, targetId, before.createdAt, before.id, limit)
        : this.db
            .prepare(
              `SELECT ${columnList(AUDIT_COLUMNS)} FROM audit_events
             WHERE target_type = ?1 AND target_id = ?2
             ORDER BY created_at DESC, id DESC
             LIMIT ?3`
            )
            .bind(targetType, targetId, limit)
    ).all<AuditEventRow>();
    return results.map(toAuditEventRecord);
  }
}

/** Opaque pagination cursor: the `(created_at, id)` of the last row on the previous page. */
export interface AuditCursor {
  createdAt: number;
  id: string;
}
