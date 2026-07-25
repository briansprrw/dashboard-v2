import {
  GLOBAL_ROLES,
  IDENTITY_PROVIDERS,
  USER_STATES,
  type GlobalRole,
  type IdentityProvider,
  type UserState,
} from '../../shared/domain/enums';
import type { UserIdentityRecord, UserRecord } from '../../shared/domain/records';
import { columnList, toEnum, toNullable } from './row-mapping';

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
                                      email_display, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)`
      )
      .bind(
        input.provider,
        input.providerSubject,
        input.userId,
        input.emailNormalized,
        input.emailDisplay,
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

  async updateGlobalRole(id: string, globalRole: GlobalRole, now: number): Promise<void> {
    await this.db
      .prepare('UPDATE users SET global_role = ?2, updated_at = ?3 WHERE id = ?1')
      .bind(id, globalRole, now)
      .run();
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
   * Disables an account without recycling it. `recycled_at` stays null: a
   * disabled account is not in the recycle bin and has no purge deadline
   * (M0-D22). Revoking existing sessions is a separate, explicit
   * `bumpAuthVersion` call by the service so the caller cannot forget it
   * silently — the state change alone must never be assumed to be enough.
   */
  async disable(id: string, now: number): Promise<void> {
    await this.db
      .prepare(
        `UPDATE users SET state = 'disabled', recycled_at = NULL, updated_at = ?2 WHERE id = ?1`
      )
      .bind(id, now)
      .run();
  }

  /** Moves the account into the 30-day recycle bin. */
  async recycle(id: string, now: number): Promise<void> {
    await this.db
      .prepare(
        `UPDATE users SET state = 'recycled', recycled_at = ?2, updated_at = ?2 WHERE id = ?1`
      )
      .bind(id, now)
      .run();
  }

  /** Returns a disabled or recycled account to active use. */
  async restore(id: string, now: number): Promise<void> {
    await this.db
      .prepare(
        `UPDATE users SET state = 'active', recycled_at = NULL, updated_at = ?2 WHERE id = ?1`
      )
      .bind(id, now)
      .run();
  }

  /**
   * Permanently removes the account row. `sheets.owner_user_id` is ON DELETE
   * RESTRICT, so this fails while the user still owns any List — an ownerless
   * List cannot be produced this way. The caller must transfer or permanently
   * delete the owned Lists first.
   */
  async deletePermanently(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM users WHERE id = ?1').bind(id).run();
  }
}
