import { describe, expect, it } from 'vitest';

import {
  T0,
  makeSheet,
  makeTask,
  makeUser,
  memberships,
  sheets,
  taskEvents,
  tasks,
  users,
} from './fixtures';

// Real-SQL coverage for the List lifecycle: create, read, rename, recycle,
// restore, ownership transfer, and permanent delete — the sequences the
// milestone requires to be exercised against a migrated database rather than a
// mock.

describe('SheetRepository — create and read', () => {
  it('creates an active List owned by the creator', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id, { displayName: 'Errands' });

    expect(sheet.ownerUserId).toBe(owner.id);
    expect(sheet.state).toBe('active');
    expect(sheet.recycledAt).toBeNull();
    expect(sheet.createdAt).toBe(T0);
    expect(sheet.updatedAt).toBe(T0);

    const reread = await sheets().findById(sheet.id);
    expect(reread).toEqual(sheet);
  });

  it('returns null for an unknown id rather than throwing', async () => {
    expect(await sheets().findById(crypto.randomUUID())).toBeNull();
  });
});

describe('SheetRepository — rename, recycle, restore', () => {
  it('renames the List and advances updated_at', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);

    await sheets().rename(sheet.id, 'Renamed', T0 + 5000);

    const updated = await sheets().findById(sheet.id);
    expect(updated?.displayName).toBe('Renamed');
    expect(updated?.updatedAt).toBe(T0 + 5000);
    expect(updated?.createdAt).toBe(T0);
  });

  it('recycles and restores the List, keeping state and recycled_at in step', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);

    await sheets().recycle(sheet.id, T0 + 1000);
    const recycled = await sheets().findById(sheet.id);
    expect(recycled?.state).toBe('recycled');
    expect(recycled?.recycledAt).toBe(T0 + 1000);

    await sheets().restore(sheet.id, T0 + 2000);
    const restored = await sheets().findById(sheet.id);
    expect(restored?.state).toBe('active');
    expect(restored?.recycledAt).toBeNull();
  });

  it('keeps contained tasks with the List through recycle and restore', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);
    const task = await makeTask(sheet.id);

    await sheets().recycle(sheet.id, T0 + 1000);
    // The List moves as a unit: its tasks are not individually recycled, so
    // restoring the List brings them back exactly as they were.
    expect((await tasks().findById(task.id))?.recycledAt).toBeNull();

    await sheets().restore(sheet.id, T0 + 2000);
    expect(await tasks().findById(task.id)).not.toBeNull();
  });

  it('excludes recycled Lists from the owner listing', async () => {
    const owner = await makeUser();
    const active = await makeSheet(owner.id, { displayName: 'Active list' });
    const gone = await makeSheet(owner.id, { displayName: 'Recycled list' });

    await sheets().recycle(gone.id, T0 + 1000);

    const owned = await sheets().listOwnedActive(owner.id);
    expect(owned.map((s) => s.id)).toEqual([active.id]);
  });

  it('lists only the owner’s own recycled Lists, most recently recycled first', async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const active = await makeSheet(owner.id, { displayName: 'Still active' });
    const firstRecycled = await makeSheet(owner.id, { displayName: 'First recycled' });
    const secondRecycled = await makeSheet(owner.id, { displayName: 'Second recycled' });
    const othersRecycled = await makeSheet(other.id, { displayName: 'Not mine' });

    await sheets().recycle(firstRecycled.id, T0 + 1000);
    await sheets().recycle(secondRecycled.id, T0 + 2000);
    await sheets().recycle(othersRecycled.id, T0 + 3000);

    const recycled = await sheets().listRecycledOwned(owner.id);
    expect(recycled.map((s) => s.id)).toEqual([secondRecycled.id, firstRecycled.id]);
    expect(recycled.map((s) => s.id)).not.toContain(active.id);
    expect(recycled.map((s) => s.id)).not.toContain(othersRecycled.id);
  });
});

describe('SheetRepository — accessible listing', () => {
  it('returns owned Lists as owner and shared Lists at their membership role', async () => {
    const owner = await makeUser();
    const member = await makeUser();
    const owned = await makeSheet(member.id, { displayName: 'A own' });
    const shared = await makeSheet(owner.id, { displayName: 'B shared' });

    await memberships().upsert({
      sheetId: shared.id,
      userId: member.id,
      role: 'editor',
      createdByUserId: owner.id,
      now: T0,
    });

    const accessible = await sheets().listAccessibleActive(member.id);
    expect(accessible.map((s) => [s.id, s.accessLevel])).toEqual([
      [owned.id, 'owner'],
      [shared.id, 'editor'],
    ]);
  });

  it('omits Lists the user neither owns nor is a member of', async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    await makeSheet(owner.id);

    expect(await sheets().listAccessibleActive(stranger.id)).toEqual([]);
  });

  it('omits a recycled List even when the user still holds a membership', async () => {
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
    await sheets().recycle(sheet.id, T0 + 1000);

    expect(await sheets().listAccessibleActive(member.id)).toEqual([]);
  });
});

describe('SheetRepository — ownership transfer', () => {
  it('transfers ownership to a user who holds no membership', async () => {
    const owner = await makeUser();
    const next = await makeUser();
    const sheet = await makeSheet(owner.id);

    await sheets().transferOwnership(sheet.id, next.id, T0 + 3000);

    const after = await sheets().findById(sheet.id);
    expect(after?.ownerUserId).toBe(next.id);
    expect(after?.updatedAt).toBe(T0 + 3000);
  });

  it('transfers to an existing member and removes their now-redundant membership', async () => {
    const owner = await makeUser();
    const editor = await makeUser();
    const sheet = await makeSheet(owner.id);

    await memberships().upsert({
      sheetId: sheet.id,
      userId: editor.id,
      role: 'editor',
      createdByUserId: owner.id,
      now: T0,
    });

    await sheets().transferOwnership(sheet.id, editor.id, T0 + 3000);

    expect((await sheets().findById(sheet.id))?.ownerUserId).toBe(editor.id);
    // Exactly one owner: the new owner must not also carry an editor row.
    expect(await memberships().findRole(sheet.id, editor.id)).toBeNull();
    expect(await memberships().listForSheet(sheet.id)).toEqual([]);
  });

  it('leaves the previous owner with no access until it is granted explicitly', async () => {
    const owner = await makeUser();
    const next = await makeUser();
    const sheet = await makeSheet(owner.id);

    await sheets().transferOwnership(sheet.id, next.id, T0 + 3000);

    // Transfer does not silently downgrade the old owner to editor: any
    // continued access is a separate, deliberate grant.
    expect(await memberships().findRole(sheet.id, owner.id)).toBeNull();
    expect(await sheets().listAccessibleActive(owner.id)).toEqual([]);
  });

  it('leaves ownership unchanged when the transfer target does not exist', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);

    await expect(
      sheets().transferOwnership(sheet.id, crypto.randomUUID(), T0 + 3000)
    ).rejects.toThrow();

    expect((await sheets().findById(sheet.id))?.ownerUserId).toBe(owner.id);
  });

  describe('owner-guarded transfer (M4-QA-02: stale-authority race protection)', () => {
    it('the owner-changing statement affects zero rows when the expected owner is stale', async () => {
      const owner = await makeUser();
      const next = await makeUser();
      const sheet = await makeSheet(owner.id);

      // Simulates the race: ownership already moved to a third party before
      // this statement (still believing `owner` is current) executes.
      const thirdParty = await makeUser();
      await sheets().transferOwnership(sheet.id, thirdParty.id, T0 + 1000);

      const statements = sheets().prepareTransferOwnershipIfOwner(
        sheet.id,
        next.id,
        owner.id, // stale — the actual current owner is now thirdParty
        T0 + 2000
      );
      const results = await Promise.all(statements.map((s) => s.run()));
      expect(results[1]?.meta.changes ?? 0).toBe(0);

      // Ownership must be exactly what the intervening transfer set it to —
      // the stale write must not have partially applied.
      expect((await sheets().findById(sheet.id))?.ownerUserId).toBe(thirdParty.id);
    });

    it('the owner-changing statement succeeds when the expected owner still matches', async () => {
      const owner = await makeUser();
      const next = await makeUser();
      const sheet = await makeSheet(owner.id);

      const statements = sheets().prepareTransferOwnershipIfOwner(
        sheet.id,
        next.id,
        owner.id,
        T0 + 1000
      );
      const results = await Promise.all(statements.map((s) => s.run()));
      expect(results[1]?.meta.changes ?? 0).toBe(1);
      expect((await sheets().findById(sheet.id))?.ownerUserId).toBe(next.id);
    });
  });
});

describe('SheetRepository — permanent delete', () => {
  it('purges the List with its tasks, task history, and memberships as one unit', async () => {
    const owner = await makeUser();
    const member = await makeUser();
    const sheet = await makeSheet(owner.id);
    const task = await makeTask(sheet.id);

    await memberships().upsert({
      sheetId: sheet.id,
      userId: member.id,
      role: 'viewer',
      createdByUserId: owner.id,
      now: T0,
    });
    await taskEvents().append({
      id: crypto.randomUUID(),
      taskId: task.id,
      actorUserId: owner.id,
      eventType: 'created',
      changesJson: '{"name":{"to":"Sample task"}}',
      now: T0,
    });

    await sheets().deletePermanently(sheet.id);

    expect(await sheets().findById(sheet.id)).toBeNull();
    expect(await tasks().findById(task.id)).toBeNull();
    expect(await taskEvents().countForTask(task.id)).toBe(0);
    expect(await memberships().findRole(sheet.id, member.id)).toBeNull();
  });

  it('leaves the owner account intact after the List is purged', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);

    await sheets().deletePermanently(sheet.id);

    expect(await users().findById(owner.id)).not.toBeNull();
  });
});
