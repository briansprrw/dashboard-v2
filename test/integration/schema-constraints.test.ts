import { describe, expect, it } from 'vitest';

import {
  T0,
  auditEvents,
  db,
  makeSheet,
  makeTask,
  makeUser,
  memberships,
  sheets,
  taskEvents,
  tasks,
  users,
} from './fixtures';

// Denial paths at the storage boundary. Runtime validation (M2.4) will reject
// most of these before they reach D1; these tests prove the database is a real
// backstop rather than a hope, so a service bug or a future code path that
// bypasses validation still cannot persist an invalid or invariant-breaking row.
//
// Assertions check that the write is rejected, not the wording of SQLite's
// message, except where a named trigger is the specific mechanism under test.

describe('users constraints', () => {
  it('rejects an unknown global role', async () => {
    await expect(
      db()
        .prepare(
          `INSERT INTO users (id, display_name, global_role, state, created_at, updated_at)
           VALUES (?1, 'X', 'superadmin', 'active', ?2, ?2)`
        )
        .bind(crypto.randomUUID(), T0)
        .run()
    ).rejects.toThrow();
  });

  it('rejects an unknown account state', async () => {
    await expect(
      db()
        .prepare(
          `INSERT INTO users (id, display_name, global_role, state, created_at, updated_at)
           VALUES (?1, 'X', 'user', 'archived', ?2, ?2)`
        )
        .bind(crypto.randomUUID(), T0)
        .run()
    ).rejects.toThrow();
  });

  it('rejects a recycled account with no recycled_at, and vice versa', async () => {
    await expect(
      db()
        .prepare(
          `INSERT INTO users (id, display_name, global_role, state, recycled_at, created_at, updated_at)
           VALUES (?1, 'X', 'user', 'recycled', NULL, ?2, ?2)`
        )
        .bind(crypto.randomUUID(), T0)
        .run()
    ).rejects.toThrow();

    await expect(
      db()
        .prepare(
          `INSERT INTO users (id, display_name, global_role, state, recycled_at, created_at, updated_at)
           VALUES (?1, 'X', 'user', 'active', ?2, ?2, ?2)`
        )
        .bind(crypto.randomUUID(), T0)
        .run()
    ).rejects.toThrow();
  });

  it('rejects an empty display name', async () => {
    await expect(
      db()
        .prepare(
          `INSERT INTO users (id, display_name, global_role, state, created_at, updated_at)
           VALUES (?1, '', 'user', 'active', ?2, ?2)`
        )
        .bind(crypto.randomUUID(), T0)
        .run()
    ).rejects.toThrow();
  });

  it('rejects a display name over the documented bound', async () => {
    await expect(
      db()
        .prepare(
          `INSERT INTO users (id, display_name, global_role, state, created_at, updated_at)
           VALUES (?1, ?2, 'user', 'active', ?3, ?3)`
        )
        .bind(crypto.randomUUID(), 'a'.repeat(201), T0)
        .run()
    ).rejects.toThrow();
  });

  it('starts every account at auth version 1', async () => {
    const user = await makeUser();
    expect(user.authVersion).toBe(1);
  });
});

describe('user_identities constraints', () => {
  it('rejects a second account claiming the same normalised email', async () => {
    const first = await makeUser();
    const second = await makeUser();
    const identity = await users().findIdentityByEmail(`${first.id}@example.invalid`);
    expect(identity).not.toBeNull();

    await expect(
      users().createIdentity({
        provider: 'google',
        providerSubject: crypto.randomUUID(),
        userId: second.id,
        emailNormalized: `${first.id}@example.invalid`,
        emailDisplay: `${first.id}@example.invalid`,
        now: T0,
      })
    ).rejects.toThrow();
  });

  it('rejects an identity for a user that does not exist', async () => {
    await expect(
      users().createIdentity({
        provider: 'google',
        providerSubject: crypto.randomUUID(),
        userId: crypto.randomUUID(),
        emailNormalized: `${crypto.randomUUID()}@example.invalid`,
        emailDisplay: 'nobody@example.invalid',
        now: T0,
      })
    ).rejects.toThrow();
  });

  it('rejects an unapproved identity provider', async () => {
    const user = await makeUser();
    await expect(
      db()
        .prepare(
          `INSERT INTO user_identities (provider, provider_subject, user_id, email_normalized,
                                        email_display, created_at, updated_at)
           VALUES ('github', ?1, ?2, ?3, ?3, ?4, ?4)`
        )
        .bind(crypto.randomUUID(), user.id, `${crypto.randomUUID()}@example.invalid`, T0)
        .run()
    ).rejects.toThrow();
  });
});

describe('sheet ownership invariants', () => {
  it('rejects a List owned by a user that does not exist', async () => {
    await expect(makeSheet(crypto.randomUUID())).rejects.toThrow();
  });

  it('rejects deleting a user who still owns a List (no ownerless List)', async () => {
    const owner = await makeUser();
    await makeSheet(owner.id);

    // ON DELETE RESTRICT: the purge must transfer or delete the owned Lists
    // first. Without this, the List row would survive pointing at a user that
    // no longer exists.
    await expect(users().deletePermanently(owner.id)).rejects.toThrow();
  });

  it('allows deleting a user once their owned List is gone', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);

    await sheets().deletePermanently(sheet.id);
    await expect(users().deletePermanently(owner.id)).resolves.toBeUndefined();
    expect(await users().findById(owner.id)).toBeNull();
  });

  it('rejects a membership row for the List owner', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);

    await expect(
      memberships().upsert({
        sheetId: sheet.id,
        userId: owner.id,
        role: 'editor',
        createdByUserId: owner.id,
        now: T0,
      })
    ).rejects.toThrow(/owner cannot hold a membership row/);
  });

  it('rejects re-pointing an existing membership row at the List owner', async () => {
    const owner = await makeUser();
    const member = await makeUser();
    const sheet = await makeSheet(owner.id);

    await memberships().upsert({
      sheetId: sheet.id,
      userId: member.id,
      role: 'viewer',
      createdByUserId: owner.id,
      now: T0,
    });

    await expect(
      db()
        .prepare('UPDATE sheet_memberships SET user_id = ?3 WHERE sheet_id = ?1 AND user_id = ?2')
        .bind(sheet.id, member.id, owner.id)
        .run()
    ).rejects.toThrow(/owner cannot hold a membership row/);
  });

  it('rejects an unapproved membership role', async () => {
    const owner = await makeUser();
    const member = await makeUser();
    const sheet = await makeSheet(owner.id);

    await expect(
      db()
        .prepare(
          `INSERT INTO sheet_memberships (sheet_id, user_id, role, created_at)
           VALUES (?1, ?2, 'admin', ?3)`
        )
        .bind(sheet.id, member.id, T0)
        .run()
    ).rejects.toThrow();
  });

  it('rejects a recycled List with no recycled_at', async () => {
    const owner = await makeUser();
    await expect(
      db()
        .prepare(
          `INSERT INTO sheets (id, owner_user_id, display_name, state, created_at, updated_at)
           VALUES (?1, ?2, 'X', 'recycled', ?3, ?3)`
        )
        .bind(crypto.randomUUID(), owner.id, T0)
        .run()
    ).rejects.toThrow();
  });
});

describe('tasks constraints', () => {
  it('rejects a task referencing a List that does not exist', async () => {
    await expect(makeTask(crypto.randomUUID())).rejects.toThrow();
  });

  it('rejects an unknown status and an unknown priority', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);

    await expect(
      // @ts-expect-error deliberately invalid status, proving the DB rejects it
      makeTask(sheet.id, { status: 'done' })
    ).rejects.toThrow();

    await expect(
      // @ts-expect-error deliberately invalid priority
      makeTask(sheet.id, { priority: 'critical' })
    ).rejects.toThrow();
  });

  it('rejects a due date that is not YYYY-MM-DD', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);

    for (const bad of ['2026-7-1', '07/01/2026', 'tomorrow', '2026-07-01T00:00:00Z']) {
      await expect(makeTask(sheet.id, { dueDate: bad })).rejects.toThrow();
    }
  });

  it('accepts a null due date (undated work shows as TBD)', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);
    const task = await makeTask(sheet.id, { dueDate: null });
    expect(task.dueDate).toBeNull();
  });

  it('rejects an empty name and a name over the documented bound', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);

    await expect(makeTask(sheet.id, { name: '' })).rejects.toThrow();
    await expect(makeTask(sheet.id, { name: 'a'.repeat(501) })).rejects.toThrow();
  });

  it('rejects notes over the documented bound', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);

    await expect(makeTask(sheet.id, { notes: 'n'.repeat(4001) })).rejects.toThrow();
    const ok = await makeTask(sheet.id, { notes: 'n'.repeat(4000) });
    expect(ok.notes).toHaveLength(4000);
  });

  it('rejects a closed status without a close time, and an open status with one', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);

    await expect(
      db()
        .prepare(
          `INSERT INTO tasks (id, sheet_id, name, status, priority, sort_key,
                              created_at, updated_at, closed_at)
           VALUES (?1, ?2, 'X', 'complete', 'low', 1, ?3, ?3, NULL)`
        )
        .bind(crypto.randomUUID(), sheet.id, T0)
        .run()
    ).rejects.toThrow();

    await expect(
      db()
        .prepare(
          `INSERT INTO tasks (id, sheet_id, name, status, priority, sort_key,
                              created_at, updated_at, closed_at)
           VALUES (?1, ?2, 'X', 'in_progress', 'low', 1, ?3, ?3, ?3)`
        )
        .bind(crypto.randomUUID(), sheet.id, T0)
        .run()
    ).rejects.toThrow();
  });

  it('rejects a non-boolean privacy flag', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);

    await expect(
      db()
        .prepare(
          `INSERT INTO tasks (id, sheet_id, name, status, priority, sort_key,
                              is_private, created_at, updated_at)
           VALUES (?1, ?2, 'X', 'pending', 'low', 1, 2, ?3, ?3)`
        )
        .bind(crypto.randomUUID(), sheet.id, T0)
        .run()
    ).rejects.toThrow();
  });

  it('defaults both privacy flags to false', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);
    const task = await makeTask(sheet.id);
    expect(task.isPrivate).toBe(false);
    expect(task.notesPrivate).toBe(false);
  });
});

describe('task_events and audit_events constraints', () => {
  it('rejects a history entry for a task that does not exist', async () => {
    await expect(
      taskEvents().append({
        id: crypto.randomUUID(),
        taskId: crypto.randomUUID(),
        actorUserId: null,
        eventType: 'created',
        changesJson: '{}',
        now: T0,
      })
    ).rejects.toThrow();
  });

  it('keeps an audit entry after its actor is permanently deleted', async () => {
    const actor = await makeUser();
    const targetId = crypto.randomUUID();

    await auditEvents().append({
      id: crypto.randomUUID(),
      actorUserId: actor.id,
      action: 'user.recycle',
      targetType: 'user',
      targetId,
      metadataJson: '{"priorState":"active"}',
      requestId: 'req-test',
      now: T0,
    });

    await users().deletePermanently(actor.id);

    const events = await auditEvents().listForTarget('user', targetId, 10);
    expect(events).toHaveLength(1);
    // The trail survives the actor; the reference is nulled, not cascaded away.
    expect(events[0]?.actorUserId).toBeNull();
    expect(events[0]?.action).toBe('user.recycle');
  });
});

describe('recycled task references stay valid', () => {
  it('keeps the task attached to a valid List through recycle and restore', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);
    const task = await makeTask(sheet.id);

    await tasks().recycle(task.id, owner.id, T0 + 1000);
    expect((await tasks().findById(task.id))?.sheetId).toBe(sheet.id);

    await tasks().restore(task.id, owner.id, T0 + 2000);
    expect((await tasks().findById(task.id))?.sheetId).toBe(sheet.id);
  });
});
