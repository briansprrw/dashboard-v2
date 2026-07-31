import { MEMBERSHIP_ROLES, type MembershipRole } from '../../shared/domain/enums';
import type { SheetMembershipRecord } from '../../shared/domain/records';
import { columnList, toEnum, toNullable } from './row-mapping';

// Viewer/editor shares on a List. The owner is never represented here — the
// `sheet_memberships_reject_owner_*` triggers refuse such a row outright, so a
// bug in a service cannot produce a List with two competing owner records.
//
// There is no "default to viewer" behaviour in this layer: callers state the
// role explicitly and the service applies the approved default, so a missing
// argument can never silently grant edit rights.

interface SheetMembershipRow {
  sheet_id: string;
  user_id: string;
  role: string;
  created_at: number;
  created_by_user_id: string | null;
}

const MEMBERSHIP_COLUMNS = [
  'sheet_id',
  'user_id',
  'role',
  'created_at',
  'created_by_user_id',
] as const;

function toMembershipRecord(row: SheetMembershipRow): SheetMembershipRecord {
  return {
    sheetId: row.sheet_id,
    userId: row.user_id,
    role: toEnum(MEMBERSHIP_ROLES, row.role, 'sheet_memberships.role'),
    createdAt: row.created_at,
    createdByUserId: toNullable(row.created_by_user_id),
  };
}

export interface UpsertMembershipInput {
  sheetId: string;
  userId: string;
  role: MembershipRole;
  createdByUserId: string | null;
  now: number;
}

export class MembershipRepository {
  constructor(private readonly db: D1Database) {}

  /**
   * Grants or changes a viewer/editor share. Re-granting updates the role in
   * place rather than failing, so "set this member to editor" is one idempotent
   * operation. `created_at`/`created_by_user_id` keep their original values on a
   * role change — the grant is the same grant, at a new level.
   */
  async upsert(input: UpsertMembershipInput): Promise<SheetMembershipRecord> {
    await this.prepareUpsert(input).run();

    const saved = await this.find(input.sheetId, input.userId);
    if (saved === null) throw new Error('Membership upsert did not produce a readable row');
    return saved;
  }

  /** Same statement as `upsert`, unexecuted, for batching with its audit row (M2-FQA-04). */
  prepareUpsert(input: UpsertMembershipInput): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO sheet_memberships (sheet_id, user_id, role, created_at, created_by_user_id)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (sheet_id, user_id) DO UPDATE SET role = excluded.role`
      )
      .bind(input.sheetId, input.userId, input.role, input.now, input.createdByUserId);
  }

  /**
   * Same statement as `prepareUpsert`, but only takes effect while the List's
   * `owner_user_id` still matches `expectedOwnerUserId` (M4-QA-02). Protects
   * against the interleaving where request A authorizes as owner, request B
   * transfers ownership and commits, and request A's own grant then lands
   * after B — with this guard, A's write affects zero rows instead, and the
   * caller (checking the batch result's `meta.changes`) reports a conflict
   * rather than silently applying a stale owner's decision.
   *
   * A plain `UPDATE ... WHERE` guard would not work for an `INSERT ... ON
   * CONFLICT` — the guard has to gate the whole statement, so it is expressed
   * as a `WHERE EXISTS` against `sheets` rather than a join condition on the
   * insert target.
   */
  prepareUpsertIfOwner(
    input: UpsertMembershipInput,
    expectedOwnerUserId: string
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO sheet_memberships (sheet_id, user_id, role, created_at, created_by_user_id)
         SELECT ?1, ?2, ?3, ?4, ?5
         WHERE EXISTS (SELECT 1 FROM sheets WHERE id = ?1 AND owner_user_id = ?6)
         ON CONFLICT (sheet_id, user_id) DO UPDATE SET role = excluded.role`
      )
      .bind(
        input.sheetId,
        input.userId,
        input.role,
        input.now,
        input.createdByUserId,
        expectedOwnerUserId
      );
  }

  async find(sheetId: string, userId: string): Promise<SheetMembershipRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT ${columnList(MEMBERSHIP_COLUMNS)} FROM sheet_memberships
         WHERE sheet_id = ?1 AND user_id = ?2`
      )
      .bind(sheetId, userId)
      .first<SheetMembershipRow>();
    return row === null ? null : toMembershipRecord(row);
  }

  /**
   * The membership role a user holds on a List, or null. Callers must treat null
   * as "no membership", not as "no access": the user may still be the owner,
   * which lives on the sheet record.
   */
  async findRole(sheetId: string, userId: string): Promise<MembershipRole | null> {
    const row = await this.db
      .prepare('SELECT role FROM sheet_memberships WHERE sheet_id = ?1 AND user_id = ?2')
      .bind(sheetId, userId)
      .first<{ role: string }>();
    return row === null ? null : toEnum(MEMBERSHIP_ROLES, row.role, 'sheet_memberships.role');
  }

  async listForSheet(sheetId: string): Promise<SheetMembershipRecord[]> {
    const { results } = await this.db
      .prepare(
        `SELECT ${columnList(MEMBERSHIP_COLUMNS)} FROM sheet_memberships
         WHERE sheet_id = ?1
         ORDER BY created_at, user_id`
      )
      .bind(sheetId)
      .all<SheetMembershipRow>();
    return results.map(toMembershipRecord);
  }

  async listForUser(userId: string): Promise<SheetMembershipRecord[]> {
    const { results } = await this.db
      .prepare(
        `SELECT ${columnList(MEMBERSHIP_COLUMNS)} FROM sheet_memberships
         WHERE user_id = ?1
         ORDER BY sheet_id`
      )
      .bind(userId)
      .all<SheetMembershipRow>();
    return results.map(toMembershipRecord);
  }

  /** Revokes a share. Reports whether a row was actually removed. */
  async remove(sheetId: string, userId: string): Promise<boolean> {
    const result = await this.prepareRemove(sheetId, userId).run();
    return (result.meta.changes ?? 0) > 0;
  }

  /** Same statement as `remove`, unexecuted, for batching with its audit row (M2-FQA-04). */
  prepareRemove(sheetId: string, userId: string): D1PreparedStatement {
    return this.db
      .prepare('DELETE FROM sheet_memberships WHERE sheet_id = ?1 AND user_id = ?2')
      .bind(sheetId, userId);
  }

  /** Same statement as `prepareRemove`, guarded by the List's current owner (M4-QA-02). */
  prepareRemoveIfOwner(
    sheetId: string,
    userId: string,
    expectedOwnerUserId: string
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `DELETE FROM sheet_memberships WHERE sheet_id = ?1 AND user_id = ?2
         AND EXISTS (SELECT 1 FROM sheets WHERE id = ?1 AND owner_user_id = ?3)`
      )
      .bind(sheetId, userId, expectedOwnerUserId);
  }
}
