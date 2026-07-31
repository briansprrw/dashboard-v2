import { MEMBERSHIP_ROLES, SHEET_STATES } from '../../shared/domain/enums';
import type {
  AccessibleSheetRecord,
  SheetRecord,
  SheetRecoveryRecord,
} from '../../shared/domain/records';
import { columnList, toEnum, toNullable } from './row-mapping';

// Lists (stored as `sheets`). Ownership is canonical on `owner_user_id`; this
// repository never writes an owner row into `sheet_memberships`.
//
// `transferOwnership` is expressed as a batch so the membership cleanup and the
// owner change either both land or neither does. That matters because the
// `sheets_reject_transfer_to_member` trigger deliberately refuses a transfer
// that would leave the new owner also holding a viewer/editor row.

interface SheetRow {
  id: string;
  owner_user_id: string;
  display_name: string;
  state: string;
  legacy_source_id: string | null;
  created_at: number;
  updated_at: number;
  recycled_at: number | null;
}

interface AccessibleSheetRow extends SheetRow {
  access_level: string;
}

interface SheetRecoveryRow {
  id: string;
  owner_user_id: string;
  state: string;
  recycled_at: number | null;
}

const SHEET_COLUMNS = [
  'id',
  'owner_user_id',
  'display_name',
  'state',
  'legacy_source_id',
  'created_at',
  'updated_at',
  'recycled_at',
] as const;

/**
 * Deliberately narrower than SHEET_COLUMNS: no `display_name`. A List's name is
 * user-authored content, and an administrative recovery path is entitled to the
 * object's identity and lifecycle state, not to what the List is called.
 */
const SHEET_RECOVERY_COLUMNS = ['id', 'owner_user_id', 'state', 'recycled_at'] as const;

function toSheetRecord(row: SheetRow): SheetRecord {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    displayName: row.display_name,
    state: toEnum(SHEET_STATES, row.state, 'sheets.state'),
    legacySourceId: toNullable(row.legacy_source_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    recycledAt: toNullable(row.recycled_at),
  };
}

const ACCESS_LEVELS = ['owner', ...MEMBERSHIP_ROLES] as const;

function toAccessibleSheetRecord(row: AccessibleSheetRow): AccessibleSheetRecord {
  return {
    ...toSheetRecord(row),
    accessLevel: toEnum(ACCESS_LEVELS, row.access_level, 'access_level'),
  };
}

export interface CreateSheetInput {
  id: string;
  ownerUserId: string;
  displayName: string;
  legacySourceId: string | null;
  now: number;
}

export class SheetRepository {
  constructor(private readonly db: D1Database) {}

  async create(input: CreateSheetInput): Promise<SheetRecord> {
    await this.db
      .prepare(
        `INSERT INTO sheets (id, owner_user_id, display_name, state, legacy_source_id,
                             created_at, updated_at, recycled_at)
         VALUES (?1, ?2, ?3, 'active', ?4, ?5, ?5, NULL)`
      )
      .bind(input.id, input.ownerUserId, input.displayName, input.legacySourceId, input.now)
      .run();

    const created = await this.findById(input.id);
    if (created === null) throw new Error('Sheet insert did not produce a readable row');
    return created;
  }

  async findById(id: string): Promise<SheetRecord | null> {
    const row = await this.db
      .prepare(`SELECT ${columnList(SHEET_COLUMNS)} FROM sheets WHERE id = ?1`)
      .bind(id)
      .first<SheetRow>();
    return row === null ? null : toSheetRecord(row);
  }

  /**
   * The only List read an administrative recovery or purge path may use. The
   * query does not select `display_name`, so there is no full record to
   * accidentally return.
   */
  async findRecoveryStateById(id: string): Promise<SheetRecoveryRecord | null> {
    const row = await this.db
      .prepare(`SELECT ${columnList(SHEET_RECOVERY_COLUMNS)} FROM sheets WHERE id = ?1`)
      .bind(id)
      .first<SheetRecoveryRow>();
    if (row === null) return null;
    return {
      id: row.id,
      ownerUserId: row.owner_user_id,
      state: toEnum(SHEET_STATES, row.state, 'sheets.state'),
      recycledAt: toNullable(row.recycled_at),
    };
  }

  /** Active Lists owned by a user, for ownership-invariant checks and listings. */
  async listOwnedActive(ownerUserId: string): Promise<SheetRecord[]> {
    const { results } = await this.db
      .prepare(
        `SELECT ${columnList(SHEET_COLUMNS)} FROM sheets
         WHERE owner_user_id = ?1 AND state = 'active'
         ORDER BY display_name, id`
      )
      .bind(ownerUserId)
      .all<SheetRow>();
    return results.map(toSheetRecord);
  }

  /**
   * Every active List a user can reach, with the access level that grants it:
   * owned Lists plus Lists where they hold a membership. Resolved in one query
   * so a caller cannot forget one of the two sources.
   *
   * The membership branch joins the owner's account state (Codex M2-QA-01): a
   * List owned by a *recycled* account must "disappear for other members
   * until restore" (M0 §Accounts), not merely stay listed. Deliberately
   * `owner.state != 'recycled'` rather than `= 'active'` (Codex M2-RR-01,
   * correcting an over-broad first attempt): a merely `disabled` owner keeps
   * owning their Lists per `AccountService.disable`'s own contract, and their
   * Editors/Viewers must keep their access — only recycling triggers the
   * disappear-until-restore rule. The owner branch does not need the join —
   * a user viewing their own owned Lists is necessarily an eligible account,
   * since an ineligible actor is denied before this query runs.
   */
  async listAccessibleActive(userId: string): Promise<AccessibleSheetRecord[]> {
    const { results } = await this.db
      .prepare(
        `SELECT ${columnList(SHEET_COLUMNS, 's.')}, 'owner' AS access_level
         FROM sheets s
         WHERE s.owner_user_id = ?1 AND s.state = 'active'
         UNION ALL
         SELECT ${columnList(SHEET_COLUMNS, 's.')}, m.role AS access_level
         FROM sheets s
         JOIN sheet_memberships m ON m.sheet_id = s.id
         JOIN users owner ON owner.id = s.owner_user_id
         WHERE m.user_id = ?1 AND s.state = 'active' AND owner.state != 'recycled'
         ORDER BY display_name, id`
      )
      .bind(userId)
      .all<AccessibleSheetRow>();
    return results.map(toAccessibleSheetRecord);
  }

  /** Recycled Lists owned by a user — the source list for their List recycle bin. */
  async listRecycledOwned(ownerUserId: string): Promise<SheetRecord[]> {
    const { results } = await this.db
      .prepare(
        `SELECT ${columnList(SHEET_COLUMNS)} FROM sheets
         WHERE owner_user_id = ?1 AND state = 'recycled'
         ORDER BY recycled_at DESC, id`
      )
      .bind(ownerUserId)
      .all<SheetRow>();
    return results.map(toSheetRecord);
  }

  async rename(id: string, displayName: string, now: number): Promise<void> {
    await this.db
      .prepare('UPDATE sheets SET display_name = ?2, updated_at = ?3 WHERE id = ?1')
      .bind(id, displayName, now)
      .run();
  }

  /** Moves the List into the 30-day recycle bin as one unit with its tasks. */
  async recycle(id: string, now: number): Promise<void> {
    await this.prepareRecycle(id, now).run();
  }

  /** Same statement as `recycle`, unexecuted, for batching with its audit row (M2-FQA-04). */
  prepareRecycle(id: string, now: number): D1PreparedStatement {
    return this.db
      .prepare(
        `UPDATE sheets SET state = 'recycled', recycled_at = ?2, updated_at = ?2 WHERE id = ?1`
      )
      .bind(id, now);
  }

  async restore(id: string, now: number): Promise<void> {
    await this.prepareRestore(id, now).run();
  }

  /** Same statement as `restore`, unexecuted, for batching with its audit row (M2-FQA-04). */
  prepareRestore(id: string, now: number): D1PreparedStatement {
    return this.db
      .prepare(
        `UPDATE sheets SET state = 'active', recycled_at = NULL, updated_at = ?2 WHERE id = ?1`
      )
      .bind(id, now);
  }

  /**
   * Atomically moves ownership to `newOwnerUserId`, clearing any viewer/editor
   * row that user held on this List first, in the same batch as the caller's
   * required audit row (M2-FQA-04). Ownership cannot end up transferred while
   * a stale membership row survives or with no audit evidence of the change.
   */
  async transferOwnership(id: string, newOwnerUserId: string, now: number): Promise<void> {
    await this.db.batch(this.prepareTransferOwnership(id, newOwnerUserId, now));
  }

  /** The two statements `transferOwnership` batches, unexecuted, for batching with an audit row. */
  prepareTransferOwnership(id: string, newOwnerUserId: string, now: number): D1PreparedStatement[] {
    return [
      this.db
        .prepare('DELETE FROM sheet_memberships WHERE sheet_id = ?1 AND user_id = ?2')
        .bind(id, newOwnerUserId),
      this.db
        .prepare('UPDATE sheets SET owner_user_id = ?2, updated_at = ?3 WHERE id = ?1')
        .bind(id, newOwnerUserId, now),
    ];
  }

  /**
   * Same two statements as `prepareTransferOwnership`, but the owner-changing
   * `UPDATE` only takes effect while `owner_user_id` still matches
   * `expectedOwnerUserId` (M4-QA-02). The caller (`SheetService.
   * transferOwnership`) checks the corresponding batch result's
   * `meta.changes` and reports a conflict rather than committing a transfer
   * decided under authority that had already been superseded by a
   * concurrent transfer.
   */
  prepareTransferOwnershipIfOwner(
    id: string,
    newOwnerUserId: string,
    expectedOwnerUserId: string,
    now: number
  ): D1PreparedStatement[] {
    return [
      this.db
        .prepare('DELETE FROM sheet_memberships WHERE sheet_id = ?1 AND user_id = ?2')
        .bind(id, newOwnerUserId),
      this.db
        .prepare(
          'UPDATE sheets SET owner_user_id = ?2, updated_at = ?3 WHERE id = ?1 AND owner_user_id = ?4'
        )
        .bind(id, newOwnerUserId, now, expectedOwnerUserId),
    ];
  }

  /**
   * Permanently removes the List. Contained tasks, their history, and the
   * List's memberships are removed by ON DELETE CASCADE, matching the approved
   * "List and everything in it, as one unit" lifecycle.
   */
  async deletePermanently(id: string): Promise<void> {
    await this.prepareDeletePermanently(id).run();
  }

  /** Same statement as `deletePermanently`, unexecuted, for batching with its audit row. */
  prepareDeletePermanently(id: string): D1PreparedStatement {
    return this.db.prepare('DELETE FROM sheets WHERE id = ?1').bind(id);
  }
}
