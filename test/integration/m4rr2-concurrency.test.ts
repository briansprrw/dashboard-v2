import { describe, expect, it, vi } from 'vitest';

import { actorFromUser, type Actor } from '../../src/server/policy';
import { AccountService } from '../../src/server/services/account-service';
import type { ServiceDeps } from '../../src/server/services/service-context';
import { SheetService } from '../../src/server/services/sheet-service';
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

// Codex re-review pass 2 (M4-RR2-01..03): database-time authority and
// eligibility under concurrent requests.
//
// M4-QA-02 established that a write authorized from a read must carry that
// read's precondition into the write itself. M4-AR-01/02 extended the same
// predicate to the audit rows and the transfer batch's membership delete.
// These three findings are the interleavings that remained uncovered:
//
//   RR2-01  transfer carried the *source owner* precondition but not the
//           *target eligibility* one, so a target disabled or recycled between
//           the eligibility read and the batch could still be installed.
//   RR2-02  the owner-only lifecycle writes (rename/recycle/restore/purge)
//           carried no precondition at all, so a former owner suspended across
//           a concurrent transfer could act on the new owner's List.
//   RR2-03  revoke's audit shared only the ownership precondition, not the
//           membership-exists one, so two racing revokes recorded two
//           successful-looking events for one removal.
//
// Every race is injected deterministically by intercepting the exact read the
// service under test performs, never by timing.

function deps(requestId = 'm4rr2'): ServiceDeps {
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

async function auditActions(sheetId: string, action: string) {
  const rows = await auditEvents().listForTarget('sheet', sheetId, 200);
  return rows.filter((r) => r.action === action);
}

/** Runs `during` once, the first time the target account's row is read. */
function interceptUserRead(d: ServiceDeps, userId: string, during: () => Promise<unknown>): void {
  const original = d.repos.users.findById.bind(d.repos.users);
  let fired = false;
  vi.spyOn(d.repos.users, 'findById').mockImplementation(async (id: string) => {
    const result = await original(id);
    if (!fired && id === userId) {
      fired = true;
      await during();
    }
    return result;
  });
}

/** Runs `during` once, the first time the List row is read (the `authorize()` read). */
function interceptSheetRead(d: ServiceDeps, sheetId: string, during: () => Promise<unknown>): void {
  const original = d.repos.sheets.findById.bind(d.repos.sheets);
  let fired = false;
  vi.spyOn(d.repos.sheets, 'findById').mockImplementation(async (id: string) => {
    const result = await original(id);
    if (!fired && id === sheetId) {
      fired = true;
      await during();
    }
    return result;
  });
}

describe('M4-RR2-01: transfer requires the target to still be eligible at write time', () => {
  async function transferRaceAgainstTargetState(
    makeIneligible: (adminActor: Actor, targetId: string) => Promise<unknown>
  ) {
    const owner = await makeUser();
    const target = await makeUser();
    const admin = await makeUser({ globalRole: 'admin' });
    const sheet = await makeSheet(owner.id);

    const d = deps();
    interceptUserRead(d, target.id, () => makeIneligible(actorFromUser(admin), target.id));

    return { owner, target, sheet, service: new SheetService(d) };
  }

  it('refuses when the target is recycled after the eligibility read', async () => {
    const r = await transferRaceAgainstTargetState((adminActor, targetId) =>
      new AccountService(deps()).recycle(adminActor, targetId)
    );

    await expectStatus(
      r.service.transferOwnership(actorFromUser(r.owner), r.sheet.id, r.target.id),
      409
    );

    expect((await sheets().findById(r.sheet.id))?.ownerUserId).toBe(r.owner.id);
    expect(await auditActions(r.sheet.id, 'sheet.ownership.transferred')).toHaveLength(0);
  });

  it('refuses when the target is disabled after the eligibility read', async () => {
    const r = await transferRaceAgainstTargetState((adminActor, targetId) =>
      new AccountService(deps()).disable(adminActor, targetId)
    );

    await expectStatus(
      r.service.transferOwnership(actorFromUser(r.owner), r.sheet.id, r.target.id),
      409
    );

    expect((await sheets().findById(r.sheet.id))?.ownerUserId).toBe(r.owner.id);
    expect(await auditActions(r.sheet.id, 'sheet.ownership.transferred')).toHaveLength(0);
  });

  it('reports the ineligible target rather than a misleading ownership conflict', async () => {
    // The caller needs to know to pick a different recipient, not to reload a
    // List whose ownership never changed.
    const r = await transferRaceAgainstTargetState((adminActor, targetId) =>
      new AccountService(deps()).recycle(adminActor, targetId)
    );

    await expect(
      r.service.transferOwnership(actorFromUser(r.owner), r.sheet.id, r.target.id)
    ).rejects.toMatchObject({ status: 409, code: 'INELIGIBLE_OWNER' });
  });

  it('successful control: an eligible target still receives the List and one audit row', async () => {
    const owner = await makeUser();
    const target = await makeUser();
    const sheet = await makeSheet(owner.id);

    const updated = await new SheetService(deps()).transferOwnership(
      actorFromUser(owner),
      sheet.id,
      target.id
    );

    expect(updated.ownerUserId).toBe(target.id);
    expect(await auditActions(sheet.id, 'sheet.ownership.transferred')).toHaveLength(1);
  });
});

describe('M4-RR2-02: owner-only lifecycle writes are conditioned on ownership at write time', () => {
  /** A List whose ownership moves to a rival during the actor's `authorize()` read. */
  async function transferDuringAuthorize() {
    const owner = await makeUser();
    const rival = await makeUser();
    const sheet = await makeSheet(owner.id, { displayName: 'Original name' });

    const d = deps();
    interceptSheetRead(d, sheet.id, () =>
      new SheetService(deps()).transferOwnership(actorFromUser(owner), sheet.id, rival.id)
    );

    return { owner, rival, sheet, service: new SheetService(d) };
  }

  it('a former owner cannot rename the new owner List', async () => {
    const r = await transferDuringAuthorize();

    await expectStatus(
      r.service.rename(actorFromUser(r.owner), r.sheet.id, 'RENAMED BY FORMER OWNER'),
      409
    );

    const after = await sheets().findById(r.sheet.id);
    expect(after?.displayName).toBe('Original name');
    expect(after?.ownerUserId).toBe(r.rival.id);
  });

  it('a former owner cannot recycle the new owner List, and writes no audit row', async () => {
    const r = await transferDuringAuthorize();

    await expectStatus(r.service.recycle(actorFromUser(r.owner), r.sheet.id), 409);

    expect((await sheets().findById(r.sheet.id))?.state).toBe('active');
    // Before the fix this wrote a `sheet.recycled` row whose `ownerUserId`
    // named the stale owner — wrong evidence for an action that should not
    // have happened at all.
    expect(await auditActions(r.sheet.id, 'sheet.recycled')).toHaveLength(0);
  });

  /**
   * `purge` and `restore` operate on a *recycled* List, and the service refuses
   * to transfer one — so the concurrent ownership change is applied through the
   * repository instead. That is the honest way to isolate the guard under test:
   * the finding is about the lifecycle write's own precondition, not about how
   * the ownership came to change, and an admin recovery flow can legitimately
   * move a recycled List's ownership by other means.
   */
  async function recycledSheetWhoseOwnerChangesDuringAuthorize() {
    const owner = await makeUser();
    const rival = await makeUser();
    const sheet = await makeSheet(owner.id);
    await new SheetService(deps()).recycle(actorFromUser(owner), sheet.id);

    const d = deps();
    interceptSheetRead(d, sheet.id, () => sheets().transferOwnership(sheet.id, rival.id, T0));

    return { owner, rival, sheet, service: new SheetService(d) };
  }

  it('a former owner cannot purge the new owner List', async () => {
    // The most consequential of the four: an unguarded purge permanently
    // destroys the new owner's List, tasks, and history with no recovery.
    const r = await recycledSheetWhoseOwnerChangesDuringAuthorize();

    await expectStatus(r.service.purge(actorFromUser(r.owner), r.sheet.id), 409);

    const after = await sheets().findById(r.sheet.id);
    expect(after).not.toBeNull();
    expect(after?.ownerUserId).toBe(r.rival.id);
    expect(await auditActions(r.sheet.id, 'sheet.purged')).toHaveLength(0);
  });

  it('a former owner cannot restore the new owner List', async () => {
    const r = await recycledSheetWhoseOwnerChangesDuringAuthorize();

    await expectStatus(r.service.restore(actorFromUser(r.owner), r.sheet.id), 409);

    expect((await sheets().findById(r.sheet.id))?.state).toBe('recycled');
    expect(await auditActions(r.sheet.id, 'sheet.restored')).toHaveLength(0);
  });

  it('admin positive control: an admin may still act on a List they do not own', async () => {
    // The guard is on the *observed* owner, not on `actor.userId`, so
    // administrative authority stays ownership-independent (M0 §3) while still
    // failing loudly if the List changed hands mid-request.
    const owner = await makeUser();
    const admin = await makeUser({ globalRole: 'admin' });
    const sheet = await makeSheet(owner.id, { displayName: 'Original name' });
    const adminActor = actorFromUser(admin);
    const service = new SheetService(deps());

    const renamed = await service.rename(adminActor, sheet.id, 'Renamed by admin');
    expect(renamed.displayName).toBe('Renamed by admin');

    await service.recycle(adminActor, sheet.id);
    expect((await sheets().findById(sheet.id))?.state).toBe('recycled');

    await service.restore(adminActor, sheet.id);
    expect((await sheets().findById(sheet.id))?.state).toBe('active');
  });

  it('owner positive control: the ordinary uncontended path is unaffected', async () => {
    const owner = await makeUser();
    const sheet = await makeSheet(owner.id, { displayName: 'Original name' });
    const ownerActor = actorFromUser(owner);
    const service = new SheetService(deps());

    const renamed = await service.rename(ownerActor, sheet.id, 'Renamed by owner');
    expect(renamed.displayName).toBe('Renamed by owner');

    await service.recycle(ownerActor, sheet.id);
    expect(await auditActions(sheet.id, 'sheet.recycled')).toHaveLength(1);

    await service.restore(ownerActor, sheet.id);
    expect((await sheets().findById(sheet.id))?.state).toBe('active');
  });
});

describe('M4-RR2-03: a duplicate revoke records one event and an accurate outcome', () => {
  async function duplicateRevokeRace() {
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

    const d = deps();
    const original = d.repos.memberships.find.bind(d.repos.memberships);
    let fired = false;
    vi.spyOn(d.repos.memberships, 'find').mockImplementation(async (sid: string, uid: string) => {
      const result = await original(sid, uid);
      if (!fired && sid === sheet.id && uid === editor.id) {
        fired = true;
        // A concurrent request revokes the same membership and commits.
        await new SheetService(deps()).revokeMembership(actorFromUser(owner), sheet.id, editor.id);
      }
      return result;
    });

    return { owner, editor, sheet, service: new SheetService(d) };
  }

  it('records exactly one revocation audit event for one real removal', async () => {
    const r = await duplicateRevokeRace();

    await expect(
      r.service.revokeMembership(actorFromUser(r.owner), r.sheet.id, r.editor.id)
    ).rejects.toBeDefined();

    expect(await auditActions(r.sheet.id, 'sheet.membership.revoked')).toHaveLength(1);
    expect(await memberships().findRole(r.sheet.id, r.editor.id)).toBeNull();
  });

  it('does not misreport an unchanged ownership as OWNERSHIP_CHANGED', async () => {
    const r = await duplicateRevokeRace();

    // The membership is gone, so not-found is the accurate answer. Telling the
    // caller to reload a List whose ownership never moved was misleading.
    await expect(
      r.service.revokeMembership(actorFromUser(r.owner), r.sheet.id, r.editor.id)
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });

    expect((await sheets().findById(r.sheet.id))?.ownerUserId).toBe(r.owner.id);
  });

  it('still reports OWNERSHIP_CHANGED when ownership genuinely moved', async () => {
    // The two conflicts must stay distinguishable in both directions.
    const owner = await makeUser();
    const editor = await makeUser();
    const rival = await makeUser();
    const sheet = await makeSheet(owner.id);
    await memberships().upsert({
      sheetId: sheet.id,
      userId: editor.id,
      role: 'editor',
      createdByUserId: owner.id,
      now: T0,
    });

    const d = deps();
    interceptSheetRead(d, sheet.id, () =>
      new SheetService(deps()).transferOwnership(actorFromUser(owner), sheet.id, rival.id)
    );

    await expect(
      new SheetService(d).revokeMembership(actorFromUser(owner), sheet.id, editor.id)
    ).rejects.toMatchObject({ status: 409, code: 'OWNERSHIP_CHANGED' });

    expect(await memberships().findRole(sheet.id, editor.id)).toBe('editor');
    expect(await auditActions(sheet.id, 'sheet.membership.revoked')).toHaveLength(0);
  });

  it('successful control: an uncontended revoke removes the row and records one event', async () => {
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

    await new SheetService(deps()).revokeMembership(actorFromUser(owner), sheet.id, editor.id);

    expect(await memberships().findRole(sheet.id, editor.id)).toBeNull();
    expect(await auditActions(sheet.id, 'sheet.membership.revoked')).toHaveLength(1);
  });
});
