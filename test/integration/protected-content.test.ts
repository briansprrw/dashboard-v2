import { describe, expect, it } from 'vitest';

import {
  T0,
  makeSheet,
  makeTask,
  makeUser,
  preferences,
  sheets,
  taskEvents,
  tasks,
  users,
} from './fixtures';

// The repository half of the M0-D16 boundary: administrative recovery and audit
// paths must be able to act on an object's identity and lifecycle state without
// ever receiving private task content, private notes, or task-history field
// values.
//
// Policy enforcement (who may call which read) is M2.2, and DTO shaping is
// M2.4. What is proven here is stronger and lower-level: the recovery reads
// physically cannot return the protected columns, because the SQL does not
// select them. A filtered-after-the-fact approach fails open the first time
// someone forgets the filter; this one fails closed.
//
// Assertions use `Object.hasOwn`/`Object.keys` rather than value comparisons so
// a key that is present but undefined still fails the test — and no test prints
// the synthetic private content it creates.

const PRIVATE_MARKER = 'synthetic-private-marker';

describe('task recovery reads exclude protected content', () => {
  it('returns identity and lifecycle state only', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);
    const task = await makeTask(sheet.id, {
      name: PRIVATE_MARKER,
      notes: PRIVATE_MARKER,
      isPrivate: true,
      notesPrivate: true,
      dueDate: '2026-08-01',
      priority: 'urgent',
    });

    const recovery = await tasks().findRecoveryStateById(task.id);
    expect(recovery).not.toBeNull();

    expect(Object.keys(recovery!).sort()).toEqual([
      'createdAt',
      'id',
      'recycledAt',
      'sheetId',
      'updatedAt',
    ]);
    expect(recovery?.id).toBe(task.id);
    expect(recovery?.sheetId).toBe(sheet.id);
  });

  it('carries no task name, notes, status, priority, due date, or privacy flags', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);
    const task = await makeTask(sheet.id, {
      name: PRIVATE_MARKER,
      notes: PRIVATE_MARKER,
      isPrivate: true,
      notesPrivate: true,
    });

    const recovery = await tasks().findRecoveryStateById(task.id);

    for (const forbidden of [
      'name',
      'notes',
      'status',
      'priority',
      'dueDate',
      'isPrivate',
      'notesPrivate',
      'emojiFlagsJson',
      'legacySourceId',
    ]) {
      expect(Object.hasOwn(recovery!, forbidden)).toBe(false);
    }

    // Belt and braces: the marker must not appear anywhere in the serialised
    // recovery record, including inside a nested value.
    expect(JSON.stringify(recovery)).not.toContain(PRIVATE_MARKER);
  });

  it('reports recycle state so a restore or purge decision needs no content read', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);
    const task = await makeTask(sheet.id, { name: PRIVATE_MARKER, isPrivate: true });

    expect((await tasks().findRecoveryStateById(task.id))?.recycledAt).toBeNull();

    await tasks().recycle(task.id, owner.id, T0 + 1000);
    expect((await tasks().findRecoveryStateById(task.id))?.recycledAt).toBe(T0 + 1000);
  });

  it('supports purging a private task by opaque identity alone', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);
    const task = await makeTask(sheet.id, {
      name: PRIVATE_MARKER,
      notes: PRIVATE_MARKER,
      isPrivate: true,
    });

    await tasks().recycle(task.id, owner.id, T0 + 1000);

    // An administrative purge is possible using only the id: at no point does
    // the operation need to read what the task says.
    const recovery = await tasks().findRecoveryStateById(task.id);
    expect(recovery?.recycledAt).not.toBeNull();
    expect(await tasks().deletePermanently(recovery!.id)).toBe(true);
    expect(await tasks().findRecoveryStateById(task.id)).toBeNull();
  });

  it('returns null for an unknown id without revealing whether one ever existed differently', async () => {
    expect(await tasks().findRecoveryStateById(crypto.randomUUID())).toBeNull();
  });
});

describe('List recovery reads exclude the List name', () => {
  it('returns identity, ownership, and lifecycle state only', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id, { displayName: PRIVATE_MARKER });

    const recovery = await sheets().findRecoveryStateById(sheet.id);

    expect(Object.keys(recovery!).sort()).toEqual(['id', 'ownerUserId', 'recycledAt', 'state']);
    expect(Object.hasOwn(recovery!, 'displayName')).toBe(false);
    expect(JSON.stringify(recovery)).not.toContain(PRIVATE_MARKER);
    expect(recovery?.ownerUserId).toBe(owner.id);
  });

  it('reports recycle state for a restore decision', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id, { displayName: PRIVATE_MARKER });

    await sheets().recycle(sheet.id, T0 + 1000);

    const recovery = await sheets().findRecoveryStateById(sheet.id);
    expect(recovery?.state).toBe('recycled');
    expect(recovery?.recycledAt).toBe(T0 + 1000);
  });
});

describe('task-history metadata reads exclude before/after values', () => {
  it('returns actor, type, and time without changes_json', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);
    const task = await makeTask(sheet.id);

    await taskEvents().append({
      id: crypto.randomUUID(),
      taskId: task.id,
      actorUserId: owner.id,
      eventType: 'updated',
      changesJson: JSON.stringify({ notes: { from: null, to: PRIVATE_MARKER } }),
      now: T0 + 1000,
    });

    const metadata = await taskEvents().listMetadataForTask(task.id);
    expect(metadata).toHaveLength(1);

    expect(Object.keys(metadata[0]!).sort()).toEqual([
      'actorUserId',
      'createdAt',
      'eventType',
      'id',
      'taskId',
    ]);
    expect(Object.hasOwn(metadata[0]!, 'changesJson')).toBe(false);
    expect(JSON.stringify(metadata)).not.toContain(PRIVATE_MARKER);

    // The metadata still answers the administrative question — that a change of
    // this kind happened, by whom, and when.
    expect(metadata[0]?.eventType).toBe('updated');
    expect(metadata[0]?.actorUserId).toBe(owner.id);
    expect(metadata[0]?.createdAt).toBe(T0 + 1000);
  });

  it('excludes the values even when the history entry is entirely private content', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);
    const task = await makeTask(sheet.id, { isPrivate: true, notesPrivate: true });

    for (const eventType of ['created', 'updated', 'recycled']) {
      await taskEvents().append({
        id: crypto.randomUUID(),
        taskId: task.id,
        actorUserId: owner.id,
        eventType,
        changesJson: JSON.stringify({ name: { to: PRIVATE_MARKER } }),
        now: T0,
      });
    }

    const metadata = await taskEvents().listMetadataForTask(task.id);
    expect(metadata).toHaveLength(3);
    expect(JSON.stringify(metadata)).not.toContain(PRIVATE_MARKER);
  });

  it('gives the owner read the full values, so the separation is a real distinction', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);
    const task = await makeTask(sheet.id);
    const changes = JSON.stringify({ notes: { from: null, to: PRIVATE_MARKER } });

    await taskEvents().append({
      id: crypto.randomUUID(),
      taskId: task.id,
      actorUserId: owner.id,
      eventType: 'updated',
      changesJson: changes,
      now: T0,
    });

    // Not a redundant inverse assertion: if this read also excluded the values,
    // the metadata tests above would pass while owner history was simply broken.
    const full = await taskEvents().listForTask(task.id);
    expect(full[0]?.changesJson).toBe(changes);
  });

  it('counts history entries without reading any of them', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);
    const task = await makeTask(sheet.id);

    await taskEvents().append({
      id: crypto.randomUUID(),
      taskId: task.id,
      actorUserId: owner.id,
      eventType: 'created',
      changesJson: JSON.stringify({ name: { to: PRIVATE_MARKER } }),
      now: T0,
    });

    expect(await taskEvents().countForTask(task.id)).toBe(1);
  });
});

describe('private tasks are ordinary rows to the storage layer', () => {
  it('does not hide a private task from the List owner`s own read path', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);
    const visible = await makeTask(sheet.id, { sortKey: 1000 });
    const hidden = await makeTask(sheet.id, { sortKey: 2000, isPrivate: true });

    // Filtering private tasks out for non-owners is a policy/DTO decision, not a
    // repository one: the owner's read must return both, so M2.2 has something
    // to filter rather than reimplementing the query.
    const listed = await tasks().listActiveBySheet(sheet.id);
    expect(listed.map((t) => t.id)).toEqual([visible.id, hidden.id]);
    expect(listed[1]?.isPrivate).toBe(true);
  });
});

describe('preferences store no task content', () => {
  it('round-trips a bounded preference document', async () => {
    const user = await makeUser();
    const document = JSON.stringify({ dateFormat: 'iso', closedTaskRetentionDays: 7 });

    const saved = await preferences().upsert({
      userId: user.id,
      preferencesJson: document,
      schemaVersion: 1,
      now: T0,
    });
    expect(saved.preferencesJson).toBe(document);
    expect(saved.schemaVersion).toBe(1);

    const updated = await preferences().upsert({
      userId: user.id,
      preferencesJson: JSON.stringify({ dateFormat: 'us' }),
      schemaVersion: 2,
      now: T0 + 1000,
    });
    expect(updated.schemaVersion).toBe(2);
    expect(updated.updatedAt).toBe(T0 + 1000);
  });

  it('returns null before anything is saved, so defaults apply', async () => {
    const user = await makeUser();
    expect(await preferences().find(user.id)).toBeNull();
  });

  it('rejects a document beyond the documented bound', async () => {
    const user = await makeUser();
    await expect(
      preferences().upsert({
        userId: user.id,
        preferencesJson: 'x'.repeat(8193),
        schemaVersion: 1,
        now: T0,
      })
    ).rejects.toThrow();
  });

  it('is removed when the account is permanently deleted', async () => {
    const user = await makeUser();
    await preferences().upsert({
      userId: user.id,
      preferencesJson: '{}',
      schemaVersion: 1,
      now: T0,
    });

    await users().deletePermanently(user.id);

    expect(await preferences().find(user.id)).toBeNull();
  });
});
