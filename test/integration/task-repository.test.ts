import { describe, expect, it } from 'vitest';

import { T0, makeSheet, makeTask, makeUser, sheets, taskEvents, tasks, users } from './fixtures';

// Real-SQL coverage for the task lifecycle: create, read, list, update,
// quick-complete/reopen, move, recycle, restore, and permanent delete.

describe('TaskRepository — create and read', () => {
  it('creates an open task with no close time', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);

    const task = await makeTask(sheet.id, {
      status: 'in_progress',
      priority: 'high',
      dueDate: '2026-08-01',
      createdByUserId: owner.id,
    });

    expect(task.sheetId).toBe(sheet.id);
    expect(task.status).toBe('in_progress');
    expect(task.priority).toBe('high');
    expect(task.dueDate).toBe('2026-08-01');
    expect(task.closedAt).toBeNull();
    expect(task.recycledAt).toBeNull();
    expect(task.createdByUserId).toBe(owner.id);
    expect(task.updatedByUserId).toBe(owner.id);

    expect(await tasks().findById(task.id)).toEqual(task);
  });

  it('derives the close time when a task is created already closed', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);

    const complete = await makeTask(sheet.id, { status: 'complete', now: T0 + 10 });
    expect(complete.closedAt).toBe(T0 + 10);

    const cancelled = await makeTask(sheet.id, { status: 'cancelled', now: T0 + 20 });
    expect(cancelled.closedAt).toBe(T0 + 20);
  });

  it('stores a reconciliation origin id when one is supplied, and null otherwise', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);

    expect((await makeTask(sheet.id)).legacySourceId).toBeNull();
    expect((await makeTask(sheet.id, { legacySourceId: 'v1-row-42' })).legacySourceId).toBe(
      'v1-row-42'
    );
  });

  it('round-trips both privacy flags independently', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);

    const privateTask = await makeTask(sheet.id, { isPrivate: true, notesPrivate: false });
    expect(privateTask.isPrivate).toBe(true);
    expect(privateTask.notesPrivate).toBe(false);

    const privateNote = await makeTask(sheet.id, { isPrivate: false, notesPrivate: true });
    expect(privateNote.isPrivate).toBe(false);
    expect(privateNote.notesPrivate).toBe(true);
  });
});

describe('TaskRepository — listing', () => {
  it('orders active tasks by sort key with a deterministic tie-break', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);

    const third = await makeTask(sheet.id, { sortKey: 3000 });
    const first = await makeTask(sheet.id, { sortKey: 1000 });
    // Two tasks sharing a sort key must not swap positions between reads.
    const tieA = await makeTask(sheet.id, {
      id: '00000000-aaaa-4000-8000-000000000001',
      sortKey: 2000,
    });
    const tieB = await makeTask(sheet.id, {
      id: '00000000-bbbb-4000-8000-000000000002',
      sortKey: 2000,
    });

    const listed = await tasks().listActiveBySheet(sheet.id);
    expect(listed.map((t) => t.id)).toEqual([first.id, tieA.id, tieB.id, third.id]);

    const again = await tasks().listActiveBySheet(sheet.id);
    expect(again.map((t) => t.id)).toEqual(listed.map((t) => t.id));
  });

  it('separates active tasks from recycled ones', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);
    const kept = await makeTask(sheet.id, { sortKey: 1000 });
    const binned = await makeTask(sheet.id, { sortKey: 2000 });

    await tasks().recycle(binned.id, owner.id, T0 + 1000);

    expect((await tasks().listActiveBySheet(sheet.id)).map((t) => t.id)).toEqual([kept.id]);
    expect((await tasks().listRecycledBySheet(sheet.id)).map((t) => t.id)).toEqual([binned.id]);
  });

  it('does not return tasks from another List', async () => {
    const owner = await makeUser();
    const mine = await makeSheet(owner.id);
    const other = await makeSheet(owner.id);
    await makeTask(other.id);

    expect(await tasks().listActiveBySheet(mine.id)).toEqual([]);
  });

  it('reports the highest sort key, or null for an empty List', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);

    expect(await tasks().maxSortKey(sheet.id)).toBeNull();

    await makeTask(sheet.id, { sortKey: 1000 });
    await makeTask(sheet.id, { sortKey: 4000 });
    expect(await tasks().maxSortKey(sheet.id)).toBe(4000);
  });
});

describe('TaskRepository — update and close transitions', () => {
  const editInput = (overrides: Record<string, unknown> = {}) => ({
    name: 'Edited task',
    status: 'pending' as const,
    priority: 'low' as const,
    dueDate: null,
    notes: null,
    isPrivate: false,
    notesPrivate: false,
    emojiFlagsJson: null,
    updatedByUserId: null,
    now: T0 + 1000,
    ...overrides,
  });

  it('applies the complete new field state', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);
    const task = await makeTask(sheet.id);

    const updated = await tasks().update(
      task.id,
      editInput({
        name: 'Edited task',
        dueDate: '2026-09-15',
        notes: 'A note',
        notesPrivate: true,
        updatedByUserId: owner.id,
      })
    );

    expect(updated?.name).toBe('Edited task');
    expect(updated?.status).toBe('pending');
    expect(updated?.priority).toBe('low');
    expect(updated?.dueDate).toBe('2026-09-15');
    expect(updated?.notesPrivate).toBe(true);
    expect(updated?.updatedByUserId).toBe(owner.id);
    expect(updated?.updatedAt).toBe(T0 + 1000);
    expect(updated?.createdAt).toBe(T0);
  });

  it('sets the close time when an open task is completed', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);
    const task = await makeTask(sheet.id, { status: 'not_started' });

    const closed = await tasks().update(task.id, editInput({ status: 'complete' }));
    expect(closed?.closedAt).toBe(T0 + 1000);
  });

  it('clears the close time when a closed task is reopened', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);
    const task = await makeTask(sheet.id, { status: 'complete' });
    expect(task.closedAt).toBe(T0);

    const reopened = await tasks().update(task.id, editInput({ status: 'in_progress' }));
    expect(reopened?.closedAt).toBeNull();
  });

  it('preserves the original close time across an edit that leaves the task closed', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);
    const task = await makeTask(sheet.id, { status: 'complete', now: T0 });

    // Renaming a completed task must not look like it was completed again just
    // now — closed-task retention windows are measured from this value.
    const edited = await tasks().update(
      task.id,
      editInput({ status: 'complete', name: 'Renamed while closed', now: T0 + 90_000 })
    );
    expect(edited?.closedAt).toBe(T0);
    expect(edited?.updatedAt).toBe(T0 + 90_000);
  });

  it('changes complete to cancelled without resetting the close time', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);
    const task = await makeTask(sheet.id, { status: 'complete', now: T0 });

    const cancelled = await tasks().update(
      task.id,
      editInput({ status: 'cancelled', now: T0 + 5000 })
    );
    expect(cancelled?.status).toBe('cancelled');
    expect(cancelled?.closedAt).toBe(T0);
  });

  it('returns null when updating a task that does not exist', async () => {
    expect(await tasks().update(crypto.randomUUID(), editInput())).toBeNull();
  });
});

describe('TaskRepository — move', () => {
  it('moves the task to the destination List', async () => {
    const owner = await makeUser();
    const source = await makeSheet(owner.id);
    const destination = await makeSheet(owner.id);
    const task = await makeTask(source.id);

    await tasks().move(task.id, destination.id, owner.id, T0 + 1000);

    const moved = await tasks().findById(task.id);
    expect(moved?.sheetId).toBe(destination.id);
    expect(moved?.updatedByUserId).toBe(owner.id);
    expect((await tasks().listActiveBySheet(source.id)).map((t) => t.id)).toEqual([]);
    expect((await tasks().listActiveBySheet(destination.id)).map((t) => t.id)).toEqual([task.id]);
  });

  it('refuses a move to a List that does not exist and leaves the task where it was', async () => {
    const owner = await makeUser();
    const source = await makeSheet(owner.id);
    const task = await makeTask(source.id);

    await expect(tasks().move(task.id, crypto.randomUUID(), owner.id, T0 + 1000)).rejects.toThrow();

    expect((await tasks().findById(task.id))?.sheetId).toBe(source.id);
  });

  it('carries task history with the task', async () => {
    const owner = await makeUser();
    const source = await makeSheet(owner.id);
    const destination = await makeSheet(owner.id);
    const task = await makeTask(source.id);

    await taskEvents().append({
      id: crypto.randomUUID(),
      taskId: task.id,
      actorUserId: owner.id,
      eventType: 'created',
      changesJson: '{"name":{"to":"Sample task"}}',
      now: T0,
    });

    await tasks().move(task.id, destination.id, owner.id, T0 + 1000);
    expect(await taskEvents().countForTask(task.id)).toBe(1);
  });
});

describe('TaskRepository — recycle, restore, permanent delete', () => {
  it('recycles and restores while preserving history', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);
    const task = await makeTask(sheet.id);

    await taskEvents().append({
      id: crypto.randomUUID(),
      taskId: task.id,
      actorUserId: owner.id,
      eventType: 'created',
      changesJson: '{"name":{"to":"Sample task"}}',
      now: T0,
    });

    await tasks().recycle(task.id, owner.id, T0 + 1000);
    const recycled = await tasks().findById(task.id);
    expect(recycled?.recycledAt).toBe(T0 + 1000);
    // Recycling never deletes the row, so history survives untouched.
    expect(await taskEvents().countForTask(task.id)).toBe(1);

    await tasks().restore(task.id, owner.id, T0 + 2000);
    const restored = await tasks().findById(task.id);
    expect(restored?.recycledAt).toBeNull();
    expect(restored?.updatedAt).toBe(T0 + 2000);
    expect(await taskEvents().countForTask(task.id)).toBe(1);
  });

  it('purges the task and its history on permanent delete', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);
    const task = await makeTask(sheet.id);

    await taskEvents().append({
      id: crypto.randomUUID(),
      taskId: task.id,
      actorUserId: owner.id,
      eventType: 'updated',
      changesJson: '{"notes":{"from":null,"to":"A note"}}',
      now: T0,
    });

    expect(await tasks().deletePermanently(task.id)).toBe(true);
    expect(await tasks().findById(task.id)).toBeNull();
    expect(await taskEvents().listForTask(task.id)).toEqual([]);
    // The List itself is untouched by a task purge.
    expect(await sheets().findById(sheet.id)).not.toBeNull();
  });

  it('reports false when permanently deleting a task that is already gone', async () => {
    // Lets an administrative caller distinguish "purged" from "already gone"
    // without reading any task content.
    expect(await tasks().deletePermanently(crypto.randomUUID())).toBe(false);
  });

  it('keeps tasks after the user who created them is permanently deleted', async () => {
    const owner = await makeUser();
    const author = await makeUser();
    const sheet = await makeSheet(owner.id);
    const task = await makeTask(sheet.id, { createdByUserId: author.id });

    await users().deletePermanently(author.id);

    const survivor = await tasks().findById(task.id);
    expect(survivor).not.toBeNull();
    // The authorship reference is nulled, not cascaded: someone else's List
    // does not lose its contents because an account was purged.
    expect(survivor?.createdByUserId).toBeNull();
  });
});
