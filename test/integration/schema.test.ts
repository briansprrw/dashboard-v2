import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { EXPECTED_SCHEMA_VERSION } from '../../src/shared/constants/schema';

// These tests run against a database built by applying the real migration files
// from /migrations to an empty D1 (see apply-migrations.ts). They assert the
// resulting objects match the approved model, so a dropped index, a missing
// trigger, or a migration that only half-applies cannot pass unnoticed.

async function objectNames(type: 'table' | 'index' | 'trigger'): Promise<string[]> {
  const { results } = await env.DASH2_DB.prepare(
    `SELECT name FROM sqlite_master
     WHERE type = ?1 AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%' AND name NOT LIKE '_cf%'
     ORDER BY name`
  )
    .bind(type)
    .all<{ name: string }>();
  return results.map((row) => row.name);
}

async function columnNames(table: string): Promise<string[]> {
  // `table` is a literal from this test file, never caller input — PRAGMA does
  // not accept a bound parameter for the table name.
  const { results } = await env.DASH2_DB.prepare(`PRAGMA table_info(${table})`).all<{
    name: string;
  }>();
  return results.map((row) => row.name).sort();
}

describe('migration 0002 — applied schema', () => {
  it('creates exactly the approved domain tables and no deferred V2.1 tables', async () => {
    expect(await objectNames('table')).toEqual([
      'audit_events',
      'schema_version',
      'sheet_memberships',
      'sheets',
      'task_events',
      'tasks',
      'user_identities',
      'user_preferences',
      'users',
    ]);
  });

  it('does not create a D1 sessions table (sessions are opaque KV records, M0-D12)', async () => {
    expect(await objectNames('table')).not.toContain('sessions');
  });

  it('does not create the deferred V2.1 or launch-unnecessary tables', async () => {
    const tables = await objectNames('table');
    for (const deferred of [
      'dashboards',
      'dashboard_sheets',
      'invites',
      'invite_redemptions',
      'public_profiles',
      'public_profile_sheets',
      'device_profiles',
    ]) {
      expect(tables).not.toContain(deferred);
    }
  });

  it('records the expected schema version', async () => {
    const row = await env.DASH2_DB.prepare(
      'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1'
    ).first<{ version: number }>();
    expect(row?.version).toBe(EXPECTED_SCHEMA_VERSION);
  });

  it('creates the indexes the documented query paths depend on', async () => {
    expect(await objectNames('index')).toEqual([
      'idx_audit_events_created_at',
      'idx_audit_events_target',
      'idx_sheet_memberships_user',
      'idx_sheets_owner_state',
      'idx_sheets_recycled_at',
      'idx_task_events_task_created',
      'idx_tasks_closed_at',
      'idx_tasks_due_date',
      'idx_tasks_legacy_source',
      'idx_tasks_recycled_at',
      'idx_tasks_sheet_sort',
      'idx_user_identities_user',
      'idx_users_recycled_at',
      'idx_users_state',
    ]);
  });

  it('creates the ownership-invariant triggers', async () => {
    // A SQL splitter that mishandled the triggers' BEGIN...END bodies would
    // leave these missing while the migration still reported success.
    expect(await objectNames('trigger')).toEqual([
      'sheet_memberships_reject_owner_insert',
      'sheet_memberships_reject_owner_update',
      'sheets_reject_transfer_to_member',
    ]);
  });

  it('gives users the columns immediate revocation and profile bootstrap need', async () => {
    expect(await columnNames('users')).toEqual([
      'auth_version',
      'avatar_url',
      'created_at',
      'display_name',
      'global_role',
      'id',
      'last_seen_at',
      'locale',
      'recycled_at',
      'state',
      'timezone',
      'updated_at',
    ]);
  });

  it('gives tasks separate private-task and private-note columns', async () => {
    const columns = await columnNames('tasks');
    expect(columns).toContain('is_private');
    expect(columns).toContain('notes_private');
  });

  it('stores ownership canonically on sheets and never as a membership role', async () => {
    expect(await columnNames('sheets')).toContain('owner_user_id');
    // 'owner' is not a membership role: the memberships table carries
    // viewer/editor only.
    await expect(
      env.DASH2_DB.prepare(
        `INSERT INTO sheet_memberships (sheet_id, user_id, role, created_at)
         VALUES ('s-x', 'u-x', 'owner', 1)`
      ).run()
    ).rejects.toThrow();
  });

  it('the query the health endpoint runs works against the migrated schema', async () => {
    const row = await env.DASH2_DB.prepare(
      'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1'
    ).first<{ version: number }>();
    expect(row).not.toBeNull();
  });
});
