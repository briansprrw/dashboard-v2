import type { UserPreferencesRecord } from '../../shared/domain/records';
import { columnList } from './row-mapping';

// Server-side user preferences: one bounded, validated document per user.
//
// This stores only the account-wide preferences that must follow the user across
// devices. Per-device display choices (Glance mode, zoom, theme, emoji, due-band
// thresholds, column bounds, visible Lists) are deliberately local to the device
// and never written here (M0-D9).
//
// `preferencesJson` arrives already validated and serialised. The repository
// records `schemaVersion` alongside it so a document written by an older shape
// can be recognised and re-validated rather than trusted.

interface UserPreferencesRow {
  user_id: string;
  preferences_json: string;
  schema_version: number;
  updated_at: number;
}

const PREFERENCES_COLUMNS = [
  'user_id',
  'preferences_json',
  'schema_version',
  'updated_at',
] as const;

function toPreferencesRecord(row: UserPreferencesRow): UserPreferencesRecord {
  return {
    userId: row.user_id,
    preferencesJson: row.preferences_json,
    schemaVersion: row.schema_version,
    updatedAt: row.updated_at,
  };
}

export interface UpsertPreferencesInput {
  userId: string;
  /** Already-validated, bounded JSON document. */
  preferencesJson: string;
  schemaVersion: number;
  now: number;
}

export class PreferencesRepository {
  constructor(private readonly db: D1Database) {}

  /**
   * Returns null when the user has never saved preferences. Callers apply the
   * documented defaults rather than treating absence as an error, so a new
   * account works before it has written anything.
   */
  async find(userId: string): Promise<UserPreferencesRecord | null> {
    const row = await this.db
      .prepare(`SELECT ${columnList(PREFERENCES_COLUMNS)} FROM user_preferences WHERE user_id = ?1`)
      .bind(userId)
      .first<UserPreferencesRow>();
    return row === null ? null : toPreferencesRecord(row);
  }

  async upsert(input: UpsertPreferencesInput): Promise<UserPreferencesRecord> {
    await this.db
      .prepare(
        `INSERT INTO user_preferences (user_id, preferences_json, schema_version, updated_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (user_id) DO UPDATE SET
           preferences_json = excluded.preferences_json,
           schema_version = excluded.schema_version,
           updated_at = excluded.updated_at`
      )
      .bind(input.userId, input.preferencesJson, input.schemaVersion, input.now)
      .run();

    const saved = await this.find(input.userId);
    if (saved === null) throw new Error('Preferences upsert did not produce a readable row');
    return saved;
  }
}
