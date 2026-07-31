import { describe, expect, it, vi } from 'vitest';

import { actorFromUser, type Actor } from '../../src/server/policy';
import { AccountService } from '../../src/server/services/account-service';
import type { ServiceDeps } from '../../src/server/services/service-context';
import { SheetService } from '../../src/server/services/sheet-service';
import type { SheetRecord, UserRecord } from '../../src/shared/domain/records';
import {
  auditEvents,
  db,
  makeSheet,
  makeUser,
  memberships,
  preferences,
  sheets,
  T0,
  taskEvents,
  tasks,
  users,
} from './fixtures';

// M4.5 — adversarial permission/audit review.
//
// Kept in its own file rather than appended to `authorization-service.test.ts`
// because this is a distinct review packet with a single shared root cause,
// and a reviewer should be able to read the whole finding set together.
//
// That root cause: an owner guard applied to *one* statement inside a D1 batch
// while the batch's other statements stayed unguarded. Zero matched rows is not
// a SQL error, so the batch commits and only the application code afterwards
// raises `409 OWNERSHIP_CHANGED` — by which point the unguarded side effects
// are already durable. The M4-QA-02 correction guarded the mutations and left
// the audit rows, the transfer batch's membership DELETE, and the account-purge
// cascade unguarded. Codex found the first two independently as M4-RR-01.

function deps(requestId = 'm45-review'): ServiceDeps {
  return {
    repos: {
      users: users(),
      sheets: sheets(),
      memberships: memberships(),
      tasks: tasks(),
      taskEvents: taskEvents(),
      auditEvents: auditEvents(),
      preferences: preferences(),
    },
    db: db(),
    clock: () => T0,
    requestId,
  };
}

async function expectStatus(promise: Promise<unknown>, status: number): Promise<void> {
  await expect(promise).rejects.toMatchObject({ status });
}

interface Scenario {
  owner: UserRecord;
  editor: UserRecord;
  stranger: UserRecord;
  sheet: SheetRecord;
  ownerActor: Actor;
}

async function scenario(): Promise<Scenario> {
  const owner = await makeUser();
  const editor = await makeUser();
  const stranger = await makeUser();
  const sheet = await makeSheet(owner.id);
  await memberships().upsert({
    sheetId: sheet.id,
    userId: editor.id,
    role: 'editor',
    createdByUserId: owner.id,
    now: T0,
  });
  return { owner, editor, stranger, sheet, ownerActor: actorFromUser(owner) };
}

/**
 * Deterministically reproduces "request A authorizes as owner, request B
 * transfers ownership and commits, request A's write then lands" by
 * intercepting the `findById` that `authorize()` uses — the same technique the
 * M4-QA-02 tests use, so this is not a new testing approach. Timing is never
 * relied on.
 */
function interceptWithConcurrentTransfer(
  d: ServiceDeps,
  sheetId: string,
  ownerActor: Actor,
  rivalUserId: string
): void {
  const originalFindById = d.repos.sheets.findById.bind(d.repos.sheets);
  let intercepted = false;
  vi.spyOn(d.repos.sheets, 'findById').mockImplementation(async (id: string) => {
    const result = await originalFindById(id);
    if (!intercepted && id === sheetId) {
      intercepted = true;
      await new SheetService(deps()).transferOwnership(ownerActor, sheetId, rivalUserId);
    }
    return result;
  });
}

async function auditActions(sheetId: string, action: string) {
  const rows = await auditEvents().listForTarget('sheet', sheetId, 200);
  return rows.filter((r) => r.action === action);
}

describe('M4-AR-01: a refused owner-guarded write leaves no audit evidence', () => {
  // The M4-QA-02 tests asserted only that the mutation did not land; they never
  // read the audit stream, so a phantom row went undetected.

  it('a refused grant writes no sheet.membership.granted row', async () => {
    const s = await scenario();
    const rival = await makeUser();
    const d = deps();
    interceptWithConcurrentTransfer(d, s.sheet.id, s.ownerActor, rival.id);

    await expectStatus(
      new SheetService(d).grantMembership(s.ownerActor, s.sheet.id, s.stranger.id, 'viewer'),
      409
    );

    expect(await memberships().findRole(s.sheet.id, s.stranger.id)).toBeNull();
    expect(await auditActions(s.sheet.id, 'sheet.membership.granted')).toHaveLength(0);
  });

  it('a refused role change writes no sheet.membership.role_changed row', async () => {
    const s = await scenario();
    const rival = await makeUser();
    const d = deps();
    // The editor already holds a membership, so this exercises the other branch
    // of grantMembership's audit-action choice.
    interceptWithConcurrentTransfer(d, s.sheet.id, s.ownerActor, rival.id);

    await expectStatus(
      new SheetService(d).grantMembership(s.ownerActor, s.sheet.id, s.editor.id, 'viewer'),
      409
    );

    expect(await memberships().findRole(s.sheet.id, s.editor.id)).toBe('editor');
    expect(await auditActions(s.sheet.id, 'sheet.membership.role_changed')).toHaveLength(0);
  });

  it('a refused revoke writes no sheet.membership.revoked row', async () => {
    const s = await scenario();
    const rival = await makeUser();
    const d = deps();
    interceptWithConcurrentTransfer(d, s.sheet.id, s.ownerActor, rival.id);

    await expectStatus(
      new SheetService(d).revokeMembership(s.ownerActor, s.sheet.id, s.editor.id),
      409
    );

    expect(await memberships().findRole(s.sheet.id, s.editor.id)).toBe('editor');
    expect(await auditActions(s.sheet.id, 'sheet.membership.revoked')).toHaveLength(0);
  });

  it('a refused transfer writes exactly one transferred row — the one that really happened', async () => {
    const s = await scenario();
    const firstTarget = await makeUser();
    const d = deps();
    interceptWithConcurrentTransfer(d, s.sheet.id, s.ownerActor, firstTarget.id);

    await expectStatus(
      new SheetService(d).transferOwnership(s.ownerActor, s.sheet.id, s.stranger.id),
      409
    );

    expect((await sheets().findById(s.sheet.id))?.ownerUserId).toBe(firstTarget.id);
    const transfers = await auditActions(s.sheet.id, 'sheet.ownership.transferred');
    // Before the fix this was 2, and both rows claimed the same
    // previousOwnerUserId with a different newOwnerUserId — mutually
    // contradictory evidence about one List.
    expect(transfers).toHaveLength(1);
    expect(transfers[0]!.metadataJson).toContain(firstTarget.id);
    expect(transfers[0]!.metadataJson).not.toContain(s.stranger.id);
  });

  it('a successful grant is still audited', async () => {
    // Positive control: the guard must not suppress real evidence.
    const s = await scenario();
    await new SheetService(deps()).grantMembership(
      s.ownerActor,
      s.sheet.id,
      s.stranger.id,
      'viewer'
    );

    expect(await auditActions(s.sheet.id, 'sheet.membership.granted')).toHaveLength(1);
  });
});

describe('M4-AR-02: a refused transfer does not strip the target membership', () => {
  it('the proposed new owner keeps the access they already had', async () => {
    const s = await scenario();
    const rival = await makeUser();
    const d = deps();
    expect(await memberships().findRole(s.sheet.id, s.editor.id)).toBe('editor');
    interceptWithConcurrentTransfer(d, s.sheet.id, s.ownerActor, rival.id);

    // The owner tries to hand the List to the editor and loses the race. The
    // transfer batch's membership DELETE was the one unguarded statement, so
    // the editor lost their access to an operation that reported failure —
    // with no audit row describing a revocation.
    await expectStatus(
      new SheetService(d).transferOwnership(s.ownerActor, s.sheet.id, s.editor.id),
      409
    );

    expect(await memberships().findRole(s.sheet.id, s.editor.id)).toBe('editor');
    expect(await auditActions(s.sheet.id, 'sheet.membership.revoked')).toHaveLength(0);
  });

  it('a successful transfer still clears the new owner stale membership row', async () => {
    // Positive control, and load-bearing rather than cosmetic: the schema's
    // trigger refuses a List whose owner also holds a membership row.
    const s = await scenario();
    const updated = await new SheetService(deps()).transferOwnership(
      s.ownerActor,
      s.sheet.id,
      s.editor.id
    );

    expect(updated.ownerUserId).toBe(s.editor.id);
    expect(await memberships().findRole(s.sheet.id, s.editor.id)).toBeNull();
    expect(await auditActions(s.sheet.id, 'sheet.ownership.transferred')).toHaveLength(1);
  });
});

describe('M4-AR-03: account purge does not destroy a List it no longer owns', () => {
  it('a List transferred away between the read and the delete batch survives', async () => {
    const victim = await makeUser();
    const successor = await makeUser();
    const admin = await makeUser({ globalRole: 'admin' });
    const adminActor = actorFromUser(admin);
    const sheet = await makeSheet(victim.id);

    const d = deps();
    const accounts = new AccountService(d);
    await accounts.recycle(adminActor, victim.id);

    // An Admin may legitimately transfer a recycled account's List — that is
    // the stranding-recovery path the transfer rules exist to allow.
    const originalListOwnedActive = d.repos.sheets.listOwnedActive.bind(d.repos.sheets);
    let intercepted = false;
    vi.spyOn(d.repos.sheets, 'listOwnedActive').mockImplementation(async (ownerId: string) => {
      const result = await originalListOwnedActive(ownerId);
      if (!intercepted && ownerId === victim.id) {
        intercepted = true;
        await new SheetService(deps()).transferOwnership(adminActor, sheet.id, successor.id);
      }
      return result;
    });

    await accounts.purge(adminActor, victim.id);

    // The successor's List, its tasks, and its history must survive. Purge is
    // outside the 30-day window, so this loss would be unrecoverable.
    const after = await sheets().findById(sheet.id);
    expect(after).not.toBeNull();
    expect(after?.ownerUserId).toBe(successor.id);
    expect(await users().findById(victim.id)).toBeNull();
  });

  it('an ordinary purge still deletes every List the account really owns', async () => {
    // Positive control: the owner guard must not turn purge into a no-op.
    const victim = await makeUser();
    const admin = await makeUser({ globalRole: 'admin' });
    const adminActor = actorFromUser(admin);
    const ownedActive = await makeSheet(victim.id);
    const ownedRecycled = await makeSheet(victim.id);

    const services = new SheetService(deps());
    await services.recycle(actorFromUser(victim), ownedRecycled.id);

    const accounts = new AccountService(deps());
    await accounts.recycle(adminActor, victim.id);
    await accounts.purge(adminActor, victim.id);

    expect(await sheets().findById(ownedActive.id)).toBeNull();
    expect(await sheets().findById(ownedRecycled.id)).toBeNull();
    expect(await users().findById(victim.id)).toBeNull();
  });

  it('a List arriving mid-purge fails the whole batch atomically', async () => {
    // The converse race, and M4's required "owner invariant after an injected
    // failure" evidence. ON DELETE RESTRICT must reject the user delete, and
    // because D1 batch is transactional on error, the already-listed owned List
    // must survive too rather than being deleted out from under a doomed purge.
    const victim = await makeUser();
    const donor = await makeUser();
    const admin = await makeUser({ globalRole: 'admin' });
    const adminActor = actorFromUser(admin);
    const originalSheet = await makeSheet(victim.id);
    const incomingSheet = await makeSheet(donor.id);

    const d = deps();
    const accounts = new AccountService(d);
    await accounts.recycle(adminActor, victim.id);

    const originalListOwnedActive = d.repos.sheets.listOwnedActive.bind(d.repos.sheets);
    let intercepted = false;
    vi.spyOn(d.repos.sheets, 'listOwnedActive').mockImplementation(async (ownerId: string) => {
      const result = await originalListOwnedActive(ownerId);
      if (!intercepted && ownerId === victim.id) {
        intercepted = true;
        await new SheetService(deps()).transferOwnership(adminActor, incomingSheet.id, victim.id);
      }
      return result;
    });

    await expect(accounts.purge(adminActor, victim.id)).rejects.toThrow();

    expect(await users().findById(victim.id)).not.toBeNull();
    expect(await sheets().findById(originalSheet.id)).not.toBeNull();
    expect(await sheets().findById(incomingSheet.id)).not.toBeNull();
  });

  it('no ownerless List exists after a full recycle and purge cascade', async () => {
    const owner = await makeUser();
    const admin = await makeUser({ globalRole: 'admin' });
    const adminActor = actorFromUser(admin);
    await makeSheet(owner.id);

    const accounts = new AccountService(deps());
    await accounts.recycle(adminActor, owner.id);
    await accounts.purge(adminActor, owner.id);

    const orphans = await db()
      .prepare(
        `SELECT COUNT(*) AS n FROM sheets s
         LEFT JOIN users u ON u.id = s.owner_user_id
         WHERE u.id IS NULL`
      )
      .first<{ n: number }>();
    expect(orphans?.n).toBe(0);
  });
});

describe('M4-AR-04: administrative lifecycle overrides are auditable as such', () => {
  it('an admin recycling another user List records the owner and the override', async () => {
    const victim = await makeUser();
    const admin = await makeUser({ globalRole: 'admin' });
    const sheet = await makeSheet(victim.id);

    await new SheetService(deps()).recycle(actorFromUser(admin), sheet.id);

    const row = (await auditActions(sheet.id, 'sheet.recycled'))[0]!;
    const metadata = JSON.parse(row.metadataJson) as Record<string, unknown>;
    expect(metadata.ownerUserId).toBe(victim.id);
    expect(metadata.adminOverride).toBe(true);
  });

  it('an owner acting on their own List is not recorded as an override', async () => {
    const s = await scenario();
    await new SheetService(deps()).recycle(s.ownerActor, s.sheet.id);

    const row = (await auditActions(s.sheet.id, 'sheet.recycled'))[0]!;
    const metadata = JSON.parse(row.metadataJson) as Record<string, unknown>;
    expect(metadata.ownerUserId).toBe(s.owner.id);
    expect(metadata.adminOverride).toBe(false);
  });

  it('a purge records the owner, which the deleted sheet row can no longer supply', async () => {
    const victim = await makeUser();
    const admin = await makeUser({ globalRole: 'admin' });
    const sheet = await makeSheet(victim.id);
    const adminActor = actorFromUser(admin);
    const services = new SheetService(deps());

    await services.recycle(adminActor, sheet.id);
    await services.purge(adminActor, sheet.id);

    // The List is gone, so this audit row is the only surviving record of whose
    // List an administrator destroyed.
    expect(await sheets().findById(sheet.id)).toBeNull();
    const row = (await auditActions(sheet.id, 'sheet.purged'))[0]!;
    const metadata = JSON.parse(row.metadataJson) as Record<string, unknown>;
    expect(metadata.ownerUserId).toBe(victim.id);
    expect(metadata.adminOverride).toBe(true);
  });

  it('lifecycle audit metadata never carries the List name', async () => {
    const victim = await makeUser();
    const admin = await makeUser({ globalRole: 'admin' });
    const marker = 'SYNTHETIC-LIST-NAME-4c81de';
    const sheet = await makeSheet(victim.id, { displayName: marker });

    await new SheetService(deps()).recycle(actorFromUser(admin), sheet.id);

    const rows = await auditEvents().listForTarget('sheet', sheet.id, 50);
    expect(rows.map((r) => r.metadataJson).join(' ')).not.toContain(marker);
  });
});

describe('M4-AR-05: an admin cannot remove their own admin role', () => {
  it('refuses a self-demotion the actor could not undo', async () => {
    const admin = await makeUser({ globalRole: 'admin' });
    const accounts = new AccountService(deps());

    await expectStatus(accounts.setGlobalRole(actorFromUser(admin), admin.id, 'user'), 409);
    expect((await users().findById(admin.id))?.globalRole).toBe('admin');
  });

  it('still allows another admin to demote them', async () => {
    const admin = await makeUser({ globalRole: 'admin' });
    const other = await makeUser({ globalRole: 'admin' });
    const accounts = new AccountService(deps());

    await accounts.setGlobalRole(actorFromUser(other), admin.id, 'user');
    expect((await users().findById(admin.id))?.globalRole).toBe('user');
  });

  it('still allows an admin to promote another account', async () => {
    const admin = await makeUser({ globalRole: 'admin' });
    const target = await makeUser();
    const accounts = new AccountService(deps());

    await accounts.setGlobalRole(actorFromUser(admin), target.id, 'admin');
    expect((await users().findById(target.id))?.globalRole).toBe('admin');
  });
});
