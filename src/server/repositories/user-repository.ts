import {
  GLOBAL_ROLES,
  IDENTITY_PROVIDERS,
  USER_STATES,
  type GlobalRole,
  type IdentityProvider,
  type UserState,
} from '../../shared/domain/enums';
import type { UserIdentityRecord, UserRecord } from '../../shared/domain/records';
import { columnList, fromBoolean, toBoolean, toEnum, toNullable } from './row-mapping';

// Users and their provider identities. Identities live here rather than in a
// separate repository because they are only ever read or written as part of
// resolving an account, and splitting them would let a caller create an
// identity with no user.
//
// This repository decides nothing about permissions or eligibility: it reports
// stored state (including `state` and `authVersion`) and leaves the
// authorization decision to the policy layer.

interface UserRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  global_role: string;
  state: string;
  auth_version: number;
  locale: string | null;
  timezone: string | null;
  recycled_at: number | null;
  created_at: number;
  updated_at: number;
  last_seen_at: number | null;
}

interface UserIdentityRow {
  provider: string;
  provider_subject: string;
  user_id: string;
  email_normalized: string;
  email_display: string;
  subject_pending: number;
  created_at: number;
  updated_at: number;
}

// Explicit column lists, never `SELECT *`: a later migration must not be able
// to widen an existing read by accident.
const USER_COLUMNS = [
  'id',
  'display_name',
  'avatar_url',
  'global_role',
  'state',
  'auth_version',
  'locale',
  'timezone',
  'recycled_at',
  'created_at',
  'updated_at',
  'last_seen_at',
] as const;

const IDENTITY_COLUMNS = [
  'provider',
  'provider_subject',
  'user_id',
  'email_normalized',
  'email_display',
  'subject_pending',
  'created_at',
  'updated_at',
] as const;

function toUserRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: toNullable(row.avatar_url),
    globalRole: toEnum(GLOBAL_ROLES, row.global_role, 'users.global_role'),
    state: toEnum(USER_STATES, row.state, 'users.state'),
    authVersion: row.auth_version,
    locale: toNullable(row.locale),
    timezone: toNullable(row.timezone),
    recycledAt: toNullable(row.recycled_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: toNullable(row.last_seen_at),
  };
}

function toIdentityRecord(row: UserIdentityRow): UserIdentityRecord {
  return {
    provider: toEnum(IDENTITY_PROVIDERS, row.provider, 'user_identities.provider'),
    providerSubject: row.provider_subject,
    userId: row.user_id,
    emailNormalized: row.email_normalized,
    emailDisplay: row.email_display,
    subjectPending: toBoolean(row.subject_pending, 'user_identities.subject_pending'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateUserInput {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  globalRole: GlobalRole;
  state: UserState;
  locale: string | null;
  timezone: string | null;
  now: number;
}

export interface CreateUserIdentityInput {
  provider: IdentityProvider;
  providerSubject: string;
  userId: string;
  emailNormalized: string;
  emailDisplay: string;
  /**
   * Whether `providerSubject` is a placeholder awaiting the account's first
   * real verified sign-in (`true`, M6's importer) or already a real, bound
   * subject (`false`, an ordinary sign-in creating its first identity row).
   * Required rather than defaulted (same reasoning as M2-FQA-02's privacy
   * flags): a caller must state this explicitly, since getting it wrong in
   * either direction either blocks a legitimate migrated user forever or
   * reopens M2-FQA-RR-01.
   */
  subjectPending: boolean;
  now: number;
}

/** Profile fields V2 refreshes from the identity provider and the browser (M0-D20). */
export interface ProfileBasicsInput {
  displayName: string;
  avatarUrl: string | null;
  locale: string | null;
  timezone: string | null;
  now: number;
}

export class UserRepository {
  constructor(private readonly db: D1Database) {}

  async create(input: CreateUserInput): Promise<UserRecord> {
    await this.db
      .prepare(
        `INSERT INTO users (id, display_name, avatar_url, global_role, state, auth_version,
                            locale, timezone, recycled_at, created_at, updated_at, last_seen_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7, NULL, ?8, ?8, NULL)`
      )
      .bind(
        input.id,
        input.displayName,
        input.avatarUrl,
        input.globalRole,
        input.state,
        input.locale,
        input.timezone,
        input.now
      )
      .run();

    const created = await this.findById(input.id);
    if (created === null) throw new Error('User insert did not produce a readable row');
    return created;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const row = await this.db
      .prepare(`SELECT ${columnList(USER_COLUMNS)} FROM users WHERE id = ?1`)
      .bind(id)
      .first<UserRow>();
    return row === null ? null : toUserRecord(row);
  }

  /** Resolves the account behind a provider sign-in. */
  async findByProviderIdentity(
    provider: IdentityProvider,
    providerSubject: string
  ): Promise<UserRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT ${columnList(USER_COLUMNS, 'u.')}
         FROM users u
         JOIN user_identities i ON i.user_id = u.id
         WHERE i.provider = ?1 AND i.provider_subject = ?2`
      )
      .bind(provider, providerSubject)
      .first<UserRow>();
    return row === null ? null : toUserRecord(row);
  }

  async findIdentityByEmail(emailNormalized: string): Promise<UserIdentityRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT ${columnList(IDENTITY_COLUMNS)} FROM user_identities WHERE email_normalized = ?1`
      )
      .bind(emailNormalized)
      .first<UserIdentityRow>();
    return row === null ? null : toIdentityRecord(row);
  }

  async createIdentity(input: CreateUserIdentityInput): Promise<UserIdentityRecord> {
    await this.db
      .prepare(
        `INSERT INTO user_identities (provider, provider_subject, user_id, email_normalized,
                                      email_display, subject_pending, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`
      )
      .bind(
        input.provider,
        input.providerSubject,
        input.userId,
        input.emailNormalized,
        input.emailDisplay,
        fromBoolean(input.subjectPending),
        input.now
      )
      .run();

    const created = await this.findIdentityByProviderSubject(input.provider, input.providerSubject);
    if (created === null) throw new Error('Identity insert did not produce a readable row');
    return created;
  }

  async findIdentityByProviderSubject(
    provider: IdentityProvider,
    providerSubject: string
  ): Promise<UserIdentityRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT ${columnList(IDENTITY_COLUMNS)} FROM user_identities
         WHERE provider = ?1 AND provider_subject = ?2`
      )
      .bind(provider, providerSubject)
      .first<UserIdentityRow>();
    return row === null ? null : toIdentityRecord(row);
  }

  /**
   * Replaces a migrated identity's placeholder `provider_subject` with the
   * verified real one from the account's first genuine sign-in, and marks the
   * binding permanent (M2-FQA-01, M2-FQA-RR-01).
   *
   * A migrated account's identity row can only be created (M6, not built yet)
   * with *some* value in `provider_subject`, because the column is `NOT NULL`
   * and part of the table's primary key — there is no way to represent "email
   * known, provider subject not yet verified" other than a placeholder value
   * that is not a real Google subject. `createIdentity`'s plain `INSERT`
   * cannot bind that account's first real sign-in: it targets the same
   * globally-unique `email_normalized`, so the insert always collides with the
   * placeholder row it was supposed to replace. This performs the rebind as an
   * `UPDATE` against the placeholder's exact prior identity instead of a
   * second insert, changing the row in place rather than duplicating it.
   *
   * `WHERE ... AND subject_pending = 1` is the load-bearing guard, not merely
   * `oldProviderSubject` (M2-FQA-RR-01): the first fix let *any* differing
   * subject rebind a row indefinitely, so a reassigned Workspace email or a
   * changed OAuth-client subject could silently move an existing account to a
   * different real person, and repeating the process could move it back.
   * Once bound, `subject_pending` flips to 0 in this same statement and no
   * later call can ever match the `WHERE` clause again for that row — a
   * second differing subject is refused unconditionally, not merely
   * discouraged.
   *
   * `oldProviderSubject` is still matched (an optimistic-concurrency guard
   * for the race where two callers try to bind the same still-pending
   * placeholder at once): only the first `UPDATE` matches a row, and the
   * second affects zero rows, which the caller must treat as "no longer at
   * the expected prior state" rather than silently succeeding.
   */
  async rebindProviderSubject(input: {
    provider: IdentityProvider;
    oldProviderSubject: string;
    newProviderSubject: string;
    emailDisplay: string;
    now: number;
  }): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE user_identities
         SET provider_subject = ?3, email_display = ?4, subject_pending = 0, updated_at = ?5
         WHERE provider = ?1 AND provider_subject = ?2 AND subject_pending = 1`
      )
      .bind(
        input.provider,
        input.oldProviderSubject,
        input.newProviderSubject,
        input.emailDisplay,
        input.now
      )
      .run();
    return (result.meta.changes ?? 0) > 0;
  }

  /**
   * Refreshes the provider- and browser-sourced profile basics. V2 has no
   * profile editor, so this is the only path that changes these fields.
   */
  async updateProfileBasics(id: string, input: ProfileBasicsInput): Promise<void> {
    await this.db
      .prepare(
        `UPDATE users SET display_name = ?2, avatar_url = ?3, locale = ?4, timezone = ?5,
                          updated_at = ?6
         WHERE id = ?1`
      )
      .bind(id, input.displayName, input.avatarUrl, input.locale, input.timezone, input.now)
      .run();
  }

  /**
   * Changes the global role and revokes every existing session in the same D1
   * batch, for the same reason `disable`/`recycle` are batched (Codex
   * M2-QA-03): a role change without an atomic revocation could leave a
   * demoted admin's pre-change session valid if the separate bump failed.
   */
  async updateGlobalRoleAndRevoke(id: string, globalRole: GlobalRole, now: number): Promise<void> {
    await this.db.batch(this.prepareUpdateGlobalRoleAndRevoke(id, globalRole, now));
  }

  /**
   * The two statements `updateGlobalRoleAndRevoke` batches, unexecuted, so a
   * caller can add its required audit row to the same D1 batch (M2-FQA-04).
   */
  prepareUpdateGlobalRoleAndRevoke(
    id: string,
    globalRole: GlobalRole,
    now: number
  ): D1PreparedStatement[] {
    return [
      this.db
        .prepare('UPDATE users SET global_role = ?2, updated_at = ?3 WHERE id = ?1')
        .bind(id, globalRole, now),
      this.db
        .prepare(`UPDATE users SET auth_version = auth_version + 1, updated_at = ?2 WHERE id = ?1`)
        .bind(id, now),
    ];
  }

  async touchLastSeen(id: string, now: number): Promise<void> {
    await this.db.prepare('UPDATE users SET last_seen_at = ?2 WHERE id = ?1').bind(id, now).run();
  }

  /**
   * Increments the authentication version, invalidating every existing session
   * for the user on its next request. Returns the new value so the caller can
   * report or log it. Uses `auth_version + 1` in SQL rather than a
   * read-then-write so two concurrent revocations cannot cancel one another
   * out.
   */
  async bumpAuthVersion(id: string, now: number): Promise<number | null> {
    const row = await this.db
      .prepare(
        `UPDATE users SET auth_version = auth_version + 1, updated_at = ?2
         WHERE id = ?1
         RETURNING auth_version`
      )
      .bind(id, now)
      .first<{ auth_version: number }>();
    return row === null ? null : row.auth_version;
  }

  /**
   * Same mutation as `bumpAuthVersion`, unexecuted and without `RETURNING`, so
   * a caller can batch it with a required audit row (M2-FQA-04) when it does
   * not need the new value back — `RETURNING` inside a `D1Database.batch()`
   * statement is not needed here since the only caller of this variant
   * (session revocation's audit trail) does not use the returned version.
   */
  prepareBumpAuthVersion(id: string, now: number): D1PreparedStatement {
    return this.db
      .prepare(`UPDATE users SET auth_version = auth_version + 1, updated_at = ?2 WHERE id = ?1`)
      .bind(id, now);
  }

  /**
   * Disables an account without recycling it, and revokes every existing
   * session in the same D1 batch (Codex M2-QA-03).
   *
   * `recycled_at` stays null: a disabled account is not in the recycle bin and
   * has no purge deadline (M0-D22). The state change and the `auth_version`
   * bump used to be two separate statements issued by the service; if the
   * second failed after the first succeeded, the account was disabled but its
   * pre-disable sessions kept their now-stale-but-still-matching auth version,
   * so a later restore would silently resurrect them — violating "restore
   * cannot resurrect an old session." A `D1Database.batch()` either applies
   * both statements or neither, closing that partial-failure window.
   */
  async disable(id: string, now: number): Promise<void> {
    await this.db.batch(this.prepareDisable(id, now));
  }

  /**
   * The two statements `disable` batches, unexecuted, so a caller can add its
   * required audit row to the same D1 batch (M2-FQA-04).
   */
  prepareDisable(id: string, now: number): D1PreparedStatement[] {
    return [
      this.db
        .prepare(
          `UPDATE users SET state = 'disabled', recycled_at = NULL, updated_at = ?2 WHERE id = ?1`
        )
        .bind(id, now),
      this.db
        .prepare(`UPDATE users SET auth_version = auth_version + 1, updated_at = ?2 WHERE id = ?1`)
        .bind(id, now),
    ];
  }

  /**
   * Moves the account into the 30-day recycle bin, and revokes every existing
   * session in the same D1 batch. See `disable` for why this must be atomic.
   */
  async recycle(id: string, now: number): Promise<void> {
    await this.db.batch(this.prepareRecycle(id, now));
  }

  /**
   * The two statements `recycle` batches, unexecuted, so a caller can add its
   * required audit row to the same D1 batch (M2-FQA-04).
   */
  prepareRecycle(id: string, now: number): D1PreparedStatement[] {
    return [
      this.db
        .prepare(
          `UPDATE users SET state = 'recycled', recycled_at = ?2, updated_at = ?2 WHERE id = ?1`
        )
        .bind(id, now),
      this.db
        .prepare(`UPDATE users SET auth_version = auth_version + 1, updated_at = ?2 WHERE id = ?1`)
        .bind(id, now),
    ];
  }

  /** Returns a disabled or recycled account to active use. */
  async restore(id: string, now: number): Promise<void> {
    await this.prepareRestore(id, now).run();
  }

  /** Same statement as `restore`, unexecuted, for batching with its audit row (M2-FQA-04). */
  prepareRestore(id: string, now: number): D1PreparedStatement {
    return this.db
      .prepare(
        `UPDATE users SET state = 'active', recycled_at = NULL, updated_at = ?2 WHERE id = ?1`
      )
      .bind(id, now);
  }

  /**
   * Permanently removes the account row. `sheets.owner_user_id` is ON DELETE
   * RESTRICT, so this fails while the user still owns any List — an ownerless
   * List cannot be produced this way. The caller must transfer or permanently
   * delete the owned Lists first.
   */
  async deletePermanently(id: string): Promise<void> {
    await this.prepareDeletePermanently(id).run();
  }

  /** Same statement as `deletePermanently`, unexecuted, for batching with owned-List deletes and an audit row. */
  prepareDeletePermanently(id: string): D1PreparedStatement {
    return this.db.prepare('DELETE FROM users WHERE id = ?1').bind(id);
  }
}
