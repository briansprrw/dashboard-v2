import { describe, expect, it } from 'vitest';

import { T0, makeSheet, makeUser, memberships, sheets, users } from './fixtures';

// Real-SQL coverage for accounts, provider identities, the account lifecycle,
// and the authentication-version lever that makes revocation immediate.

describe('UserRepository — create and read', () => {
  it('creates an active account with the profile basics V2 supports', async () => {
    const user = await makeUser();

    expect(user.state).toBe('active');
    expect(user.globalRole).toBe('user');
    expect(user.authVersion).toBe(1);
    expect(user.locale).toBe('en-US');
    expect(user.timezone).toBe('America/Chicago');
    expect(user.recycledAt).toBeNull();
    expect(user.lastSeenAt).toBeNull();

    expect(await users().findById(user.id)).toEqual(user);
  });

  it('returns null for an unknown id', async () => {
    expect(await users().findById(crypto.randomUUID())).toBeNull();
  });

  it('resolves the account behind a provider identity', async () => {
    const user = await makeUser();
    const identity = await users().findIdentityByEmail(`${user.id}@example.invalid`);
    expect(identity?.userId).toBe(user.id);
    expect(identity?.provider).toBe('google');

    const resolved = await users().findByProviderIdentity('google', identity!.providerSubject);
    expect(resolved?.id).toBe(user.id);
  });

  it('returns null for a provider subject with no identity', async () => {
    expect(await users().findByProviderIdentity('google', crypto.randomUUID())).toBeNull();
  });
});

describe('UserRepository — profile basics', () => {
  it('refreshes the provider- and browser-sourced fields', async () => {
    const user = await makeUser();

    await users().updateProfileBasics(user.id, {
      displayName: 'Updated Name',
      avatarUrl: 'https://example.invalid/a.png',
      locale: 'en-GB',
      timezone: 'Europe/London',
      now: T0 + 1000,
    });

    const updated = await users().findById(user.id);
    expect(updated?.displayName).toBe('Updated Name');
    expect(updated?.avatarUrl).toBe('https://example.invalid/a.png');
    expect(updated?.locale).toBe('en-GB');
    expect(updated?.timezone).toBe('Europe/London');
    expect(updated?.updatedAt).toBe(T0 + 1000);
  });

  it('does not change the authentication version on a profile refresh', async () => {
    const user = await makeUser();

    await users().updateProfileBasics(user.id, {
      displayName: 'Updated Name',
      avatarUrl: null,
      locale: null,
      timezone: null,
      now: T0 + 1000,
    });

    // A routine sign-in profile refresh must not log the user out.
    expect((await users().findById(user.id))?.authVersion).toBe(1);
  });
});

describe('UserRepository — authentication version', () => {
  it('increments the version so existing sessions stop matching', async () => {
    const user = await makeUser();

    expect(await users().bumpAuthVersion(user.id, T0 + 1000)).toBe(2);
    expect((await users().findById(user.id))?.authVersion).toBe(2);

    expect(await users().bumpAuthVersion(user.id, T0 + 2000)).toBe(3);
  });

  it('increments monotonically across repeated revocations', async () => {
    const user = await makeUser();

    // Computed in SQL rather than read-modify-write, so two revocations issued
    // close together cannot land on the same value.
    await Promise.all([
      users().bumpAuthVersion(user.id, T0 + 1000),
      users().bumpAuthVersion(user.id, T0 + 1001),
      users().bumpAuthVersion(user.id, T0 + 1002),
    ]);

    expect((await users().findById(user.id))?.authVersion).toBe(4);
  });

  it('returns null for an account that does not exist', async () => {
    expect(await users().bumpAuthVersion(crypto.randomUUID(), T0)).toBeNull();
  });
});

describe('UserRepository — account lifecycle', () => {
  it('disables an account without putting it in the recycle bin', async () => {
    const user = await makeUser();

    await users().disable(user.id, T0 + 1000);

    const disabled = await users().findById(user.id);
    expect(disabled?.state).toBe('disabled');
    // A disabled account has no purge deadline: `disabled` is not overloaded to
    // mean recycled (M0-D22).
    expect(disabled?.recycledAt).toBeNull();
  });

  it('recycles an account with a recovery timestamp, then restores it', async () => {
    const user = await makeUser();

    await users().recycle(user.id, T0 + 1000);
    const recycled = await users().findById(user.id);
    expect(recycled?.state).toBe('recycled');
    expect(recycled?.recycledAt).toBe(T0 + 1000);

    await users().restore(user.id, T0 + 2000);
    const restored = await users().findById(user.id);
    expect(restored?.state).toBe('active');
    expect(restored?.recycledAt).toBeNull();
  });

  it('keeps owned Lists and memberships through recycle and restore', async () => {
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

    await users().recycle(owner.id, T0 + 1000);

    // Recycling an account never orphans its Lists: ownership and shares stay
    // exactly as they were so one restore brings the whole unit back.
    const stillOwned = await sheets().findById(sheet.id);
    expect(stillOwned?.ownerUserId).toBe(owner.id);
    expect(await memberships().findRole(sheet.id, member.id)).toBe('viewer');

    await users().restore(owner.id, T0 + 2000);
    expect((await sheets().findById(sheet.id))?.ownerUserId).toBe(owner.id);
  });

  it('records last activity without touching anything else', async () => {
    const user = await makeUser();

    await users().touchLastSeen(user.id, T0 + 5000);

    const seen = await users().findById(user.id);
    expect(seen?.lastSeenAt).toBe(T0 + 5000);
    expect(seen?.updatedAt).toBe(T0);
  });

  it('changes the global role', async () => {
    const user = await makeUser();

    await users().updateGlobalRole(user.id, 'admin', T0 + 1000);

    expect((await users().findById(user.id))?.globalRole).toBe('admin');
  });
});

describe('UserRepository — permanent delete', () => {
  it('removes the account and its provider identity', async () => {
    const user = await makeUser();
    const email = `${user.id}@example.invalid`;
    expect(await users().findIdentityByEmail(email)).not.toBeNull();

    await users().deletePermanently(user.id);

    expect(await users().findById(user.id)).toBeNull();
    // The identity must not survive: a stale match row could re-attach a future
    // sign-in to a deleted account.
    expect(await users().findIdentityByEmail(email)).toBeNull();
  });

  it('removes the memberships the deleted user held', async () => {
    const owner = await makeUser();
    const member = await makeUser();
    const sheet = await makeSheet(owner.id);

    await memberships().upsert({
      sheetId: sheet.id,
      userId: member.id,
      role: 'editor',
      createdByUserId: owner.id,
      now: T0,
    });

    await users().deletePermanently(member.id);

    expect(await memberships().findRole(sheet.id, member.id)).toBeNull();
    expect(await sheets().findById(sheet.id)).not.toBeNull();
  });

  it('keeps a membership after the user who granted it is deleted', async () => {
    const owner = await makeUser();
    const granter = await makeUser();
    const member = await makeUser();
    const sheet = await makeSheet(owner.id);

    await memberships().upsert({
      sheetId: sheet.id,
      userId: member.id,
      role: 'viewer',
      createdByUserId: granter.id,
      now: T0,
    });

    await users().deletePermanently(granter.id);

    const grant = await memberships().find(sheet.id, member.id);
    expect(grant?.role).toBe('viewer');
    expect(grant?.createdByUserId).toBeNull();
  });
});

describe('MembershipRepository — grant, change, revoke', () => {
  it('changes an existing grant in place and keeps its original creation data', async () => {
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

    const promoted = await memberships().upsert({
      sheetId: sheet.id,
      userId: member.id,
      role: 'editor',
      createdByUserId: null,
      now: T0 + 5000,
    });

    expect(promoted.role).toBe('editor');
    // Same grant at a new level, not a new grant.
    expect(promoted.createdAt).toBe(T0);
    expect(promoted.createdByUserId).toBe(owner.id);
    expect(await memberships().listForSheet(sheet.id)).toHaveLength(1);
  });

  it('revokes a grant and reports whether anything was removed', async () => {
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

    expect(await memberships().remove(sheet.id, member.id)).toBe(true);
    expect(await memberships().findRole(sheet.id, member.id)).toBeNull();
    expect(await memberships().remove(sheet.id, member.id)).toBe(false);
  });

  it('reports no membership for the owner, who is not a member row', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);

    // Callers must not read null as "no access" — ownership lives on the sheet.
    expect(await memberships().findRole(sheet.id, owner.id)).toBeNull();
    expect((await sheets().findById(sheet.id))?.ownerUserId).toBe(owner.id);
  });

  it('rejects a grant on a List that does not exist', async () => {
    const member = await makeUser();
    await expect(
      memberships().upsert({
        sheetId: crypto.randomUUID(),
        userId: member.id,
        role: 'viewer',
        createdByUserId: null,
        now: T0,
      })
    ).rejects.toThrow();
  });

  it('rejects a grant to a user that does not exist', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id);
    await expect(
      memberships().upsert({
        sheetId: sheet.id,
        userId: crypto.randomUUID(),
        role: 'viewer',
        createdByUserId: null,
        now: T0,
      })
    ).rejects.toThrow();
  });
});
