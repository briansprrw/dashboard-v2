// Lists: creation, renaming, membership, ownership transfer, and lifecycle.
//
// Every public method here follows the same three-step shape — load the facts,
// ask policy, then mutate — and never mutates before asking. Route handlers call
// these methods and do not re-derive authorization; that is the M2.2 requirement
// that "route handlers must not duplicate or bypass authorization policy".
//
// The ownership invariant ("every sheet has exactly one active owner") is
// defended at three levels: the schema's triggers and RESTRICT foreign key
// (M2.1), the explicit checks in this file, and the denial tests that probe
// both. This layer's job is to make the impossible states *unreachable through
// the API*, so the database constraint is a backstop rather than the only guard.

import type { MembershipRole } from '../../shared/domain/enums';
import { LIMITS } from '../../shared/domain/limits';
import type {
  AccessibleSheetRecord,
  SheetMembershipRecord,
  SheetRecord,
} from '../../shared/domain/records';
import { AppError } from '../errors/app-error';
import type { Actor, SheetAccessContext } from '../policy';
import {
  canAssignOwnershipTo,
  canManageMembership,
  canManageSheetLifecycle,
  canReadSheet,
  canRenameSheet,
  canTransferOwnership,
  denyAsNotFound,
  denyForbidden,
  isAdmin,
  isEligible,
  resolveAccessLevel,
} from '../policy';
import { buildAuditStatement } from './audit';
import type { ServiceDeps } from './service-context';
import { idFactory } from './service-context';

/** A List plus the actor's resolved rights on it, so callers never re-derive them. */
export interface AuthorizedSheet {
  sheet: SheetRecord;
  context: SheetAccessContext;
  accessLevel: ReturnType<typeof resolveAccessLevel>;
}

export class SheetService {
  constructor(private readonly deps: ServiceDeps) {}

  /**
   * Loads a List and the actor's rights on it, denying as 404 when the actor
   * has no access at all. A caller that has an `AuthorizedSheet` in hand knows
   * the read was permitted; there is no way to obtain one without passing this.
   *
   * Two lifecycle rules are enforced here, at the one choke point every public
   * method routes through, rather than left to each caller to remember
   * (Codex M2-QA-01):
   *
   *   - A recycled List is unreachable through ordinary access. The approved
   *     lifecycle is "List + everything in it moves and restores as one unit"
   *     (M0 §4/§Accounts) — a recycled List must behave as gone, not merely
   *     read-only, until an owner-or-admin restore. `options.allowRecycled`
   *     exists only for the lifecycle methods (`recycle`/`restore`/`purge`)
   *     that must be able to reach the List precisely to act on that state.
   *   - A List owned by a recycled account is unreachable to everyone but an
   *     Admin. The contract requires a recycled account's Lists to
   *     "disappear for other members until restore" — owned-but-hidden, not
   *     ownerless. An Admin's own recovery/administration path still needs to
   *     reach it, so this rule is waived for Admin, not lifted entirely.
   *     Deliberately does **not** extend to a merely `disabled` owner
   *     (Codex M2-RR-01, correcting an over-broad first attempt at this fix):
   *     `AccountService.disable`'s own contract is that "the account keeps
   *     owning its Lists" and only *recycling* triggers the disappear-until-
   *     restore rule; `disabled` blocks the owner's own login but must not
   *     also cut off their existing Editors/Viewers from a List that still
   *     exists and is not in any recovery window.
   */
  async authorize(
    actor: Actor,
    sheetId: string,
    options?: { allowRecycled?: boolean }
  ): Promise<AuthorizedSheet> {
    if (!isEligible(actor)) throw denyAsNotFound();

    const sheet = await this.deps.repos.sheets.findById(sheetId);
    if (sheet === null) throw denyAsNotFound();

    const membershipRole = await this.deps.repos.memberships.findRole(sheetId, actor.userId);
    const context: SheetAccessContext = { ownerUserId: sheet.ownerUserId, membershipRole };

    // A List the actor cannot read at all is reported as absent rather than
    // forbidden: "this List exists but is not yours" is itself information.
    if (!canReadSheet(actor, context)) throw denyAsNotFound();

    if (sheet.state === 'recycled' && !options?.allowRecycled) {
      throw denyAsNotFound();
    }

    if (!isAdmin(actor) && context.ownerUserId !== actor.userId) {
      const owner = await this.deps.repos.users.findById(context.ownerUserId);
      if (owner === null || owner.state === 'recycled') throw denyAsNotFound();
    }

    return { sheet, context, accessLevel: resolveAccessLevel(actor, context) };
  }

  /** Every active List the actor can reach, owned or shared. */
  async listAccessible(actor: Actor): Promise<AccessibleSheetRecord[]> {
    if (!isEligible(actor)) throw denyAsNotFound();
    return this.deps.repos.sheets.listAccessibleActive(actor.userId);
  }

  /**
   * The actor's own List recycle bin. Owner-scoped, not the administrative
   * recovery surface (`AdminRecoveryService`) — a List only ever appears here
   * for the person who owned it, matching the same "owner or admin may
   * restore" rule `recycle`/`restore`/`purge` already enforce per-List.
   */
  async listRecycled(actor: Actor): Promise<SheetRecord[]> {
    if (!isEligible(actor)) throw denyAsNotFound();
    return this.deps.repos.sheets.listRecycledOwned(actor.userId);
  }

  /**
   * Creates a List owned by the actor. The creator is always the owner: there
   * is no path that creates a List owned by someone else, which is what makes
   * "exactly one owner, always set" true from the first moment of the row's
   * existence.
   */
  async create(actor: Actor, displayName: string): Promise<SheetRecord> {
    if (!isEligible(actor)) throw denyForbidden();

    return this.deps.repos.sheets.create({
      id: idFactory(this.deps)(),
      ownerUserId: actor.userId,
      displayName,
      legacySourceId: null,
      now: this.deps.clock(),
    });
  }

  async rename(actor: Actor, sheetId: string, displayName: string): Promise<SheetRecord> {
    const { context } = await this.authorize(actor, sheetId);
    if (!canRenameSheet(actor, context)) throw denyForbidden();

    await this.deps.repos.sheets.rename(sheetId, displayName, this.deps.clock());
    const updated = await this.deps.repos.sheets.findById(sheetId);
    if (updated === null) throw denyAsNotFound();
    return updated;
  }

  async listMembers(actor: Actor, sheetId: string): Promise<SheetMembershipRecord[]> {
    const { context } = await this.authorize(actor, sheetId);
    if (!canManageMembership(actor, context)) throw denyForbidden();
    return this.deps.repos.memberships.listForSheet(sheetId);
  }

  /**
   * Grants or changes a viewer/editor share.
   *
   * Refuses to grant a membership to the List's own owner. The schema's trigger
   * refuses it too, but a database error surfacing as a 500 is a worse answer
   * than an explicit 403 — and relying on the trigger alone would mean the API
   * contract depends on a constraint the caller cannot see.
   *
   * Also refuses a target that is not active, mirroring `transferOwnership`'s
   * eligibility check: granting a share to a disabled or recycled account would
   * sit inert until the account is restored, at which point it would silently
   * reinstate a share nobody re-approved.
   */
  async grantMembership(
    actor: Actor,
    sheetId: string,
    targetUserId: string,
    role: MembershipRole
  ): Promise<SheetMembershipRecord> {
    const { sheet, context } = await this.authorize(actor, sheetId);
    if (!canManageMembership(actor, context)) throw denyForbidden();

    if (targetUserId === sheet.ownerUserId) {
      throw new AppError(
        409,
        'OWNER_MEMBERSHIP_CONFLICT',
        'The List owner cannot also hold a viewer or editor share.'
      );
    }

    const target = await this.deps.repos.users.findById(targetUserId);
    if (target === null)
      throw new AppError(404, 'NOT_FOUND', 'The requested resource was not found.');
    if (target.state !== 'active') {
      throw new AppError(
        409,
        'INELIGIBLE_MEMBER',
        'A membership can only be granted to an active account.'
      );
    }

    const now = this.deps.clock();
    const previousRole = await this.deps.repos.memberships.findRole(sheetId, targetUserId);
    const membershipInput = {
      sheetId,
      userId: targetUserId,
      role,
      createdByUserId: actor.userId,
      now,
    };
    // Guarded by the owner observed at `authorize()` above (M4-QA-02): if a
    // concurrent transfer already moved ownership away from `sheet.ownerUserId`
    // between that read and this write, the guard clause matches zero rows and
    // the write silently does nothing rather than applying a decision made
    // under authority that no longer holds. `changes === 0` below turns that
    // into an explicit conflict instead of a false "success."
    const membershipBatchResults = await this.deps.db.batch([
      this.deps.repos.memberships.prepareUpsertIfOwner(membershipInput, sheet.ownerUserId),
      buildAuditStatement(this.deps, {
        actorUserId: actor.userId,
        action:
          previousRole === null ? 'sheet.membership.granted' : 'sheet.membership.role_changed',
        targetType: 'sheet',
        targetId: sheetId,
        // Opaque identity and the granted level(s) only — never the List's name.
        metadata:
          previousRole === null ? { targetUserId, role } : { targetUserId, previousRole, role },
      }),
    ]);
    if ((membershipBatchResults[0]?.meta.changes ?? 0) === 0) {
      throw new AppError(
        409,
        'OWNERSHIP_CHANGED',
        'This List’s ownership changed while this request was in progress. Reload and try again.'
      );
    }

    const membership = await this.deps.repos.memberships.find(sheetId, targetUserId);
    if (membership === null) throw new Error('Membership upsert did not produce a readable row');
    return membership;
  }

  async revokeMembership(actor: Actor, sheetId: string, targetUserId: string): Promise<void> {
    const { sheet, context } = await this.authorize(actor, sheetId);
    if (!canManageMembership(actor, context)) throw denyForbidden();

    const existing = await this.deps.repos.memberships.find(sheetId, targetUserId);
    if (existing === null)
      throw new AppError(404, 'NOT_FOUND', 'The requested resource was not found.');

    // Same owner guard as `grantMembership` (M4-QA-02).
    const revokeBatchResults = await this.deps.db.batch([
      this.deps.repos.memberships.prepareRemoveIfOwner(sheetId, targetUserId, sheet.ownerUserId),
      buildAuditStatement(this.deps, {
        actorUserId: actor.userId,
        action: 'sheet.membership.revoked',
        targetType: 'sheet',
        targetId: sheetId,
        metadata: { targetUserId },
      }),
    ]);
    if ((revokeBatchResults[0]?.meta.changes ?? 0) === 0) {
      throw new AppError(
        409,
        'OWNERSHIP_CHANGED',
        'This List’s ownership changed while this request was in progress. Reload and try again.'
      );
    }
  }

  /**
   * Moves ownership to another user, atomically.
   *
   * The invariant this protects is the milestone's first: a List must never
   * become ownerless, and must never have two owners. The checks are explicit
   * and ordered so the failure reasons are distinguishable:
   *
   *   - the actor may not name *themselves* the new owner of a List they do not
   *     already own (M2.5). Ownership carries protected-content visibility, so
   *     an administrator transferring a List to themselves would convert
   *     administrative authority into the private-task, private-note, and
   *     history-value reads M0-D16 denies them. Reassigning to a third party,
   *     which is what recovery actually needs, is unaffected;
   *   - the new owner must exist and be eligible (transferring to a disabled or
   *     recycled account would produce a List no one can administer);
   *   - transferring to the current owner is a no-op conflict, not a silent
   *     success;
   *   - the repository performs the membership removal and the owner change in
   *     one D1 batch, so the window where the new owner holds both roles never
   *     becomes observable.
   */
  async transferOwnership(
    actor: Actor,
    sheetId: string,
    newOwnerUserId: string
  ): Promise<SheetRecord> {
    const { sheet, context } = await this.authorize(actor, sheetId);
    if (!canTransferOwnership(actor, context)) throw denyForbidden();
    if (!canAssignOwnershipTo(actor, context, newOwnerUserId)) {
      throw denyForbidden(
        'You cannot transfer a List you do not own to yourself. Transfer it to another account.'
      );
    }

    if (newOwnerUserId === sheet.ownerUserId) {
      throw new AppError(409, 'ALREADY_OWNER', 'That user already owns this List.');
    }

    const newOwner = await this.deps.repos.users.findById(newOwnerUserId);
    if (newOwner === null) {
      throw new AppError(404, 'NOT_FOUND', 'The requested resource was not found.');
    }
    if (newOwner.state !== 'active') {
      throw new AppError(
        409,
        'INELIGIBLE_OWNER',
        'Ownership can only be transferred to an active account.'
      );
    }

    const previousOwnerUserId = sheet.ownerUserId;
    const now = this.deps.clock();
    // Guarded by `previousOwnerUserId` (M4-QA-02): if a concurrent transfer
    // already moved ownership since `authorize()` read it, the owner-changing
    // UPDATE's guard clause matches zero rows and this batch's membership
    // DELETE lands with nothing to undo — the second `meta.changes` check
    // below is what actually detects and reports the conflict.
    const transferBatchResults = await this.deps.db.batch([
      ...this.deps.repos.sheets.prepareTransferOwnershipIfOwner(
        sheetId,
        newOwnerUserId,
        previousOwnerUserId,
        now
      ),
      buildAuditStatement(this.deps, {
        actorUserId: actor.userId,
        action: 'sheet.ownership.transferred',
        targetType: 'sheet',
        targetId: sheetId,
        metadata: { previousOwnerUserId, newOwnerUserId },
      }),
    ]);
    // Index 1 is the owner-changing UPDATE (index 0 is the membership DELETE,
    // which has nothing to guard — it is scoped to `newOwnerUserId`, not the
    // current owner, so it is unaffected by which owner won the race).
    if ((transferBatchResults[1]?.meta.changes ?? 0) === 0) {
      throw new AppError(
        409,
        'OWNERSHIP_CHANGED',
        'This List’s ownership changed while this request was in progress. Reload and try again.'
      );
    }

    const updated = await this.deps.repos.sheets.findById(sheetId);
    if (updated === null) throw denyAsNotFound();
    return updated;
  }

  /** Recycles the List and everything in it as one unit (M0 §4 folder semantics). */
  async recycle(actor: Actor, sheetId: string): Promise<void> {
    const { context } = await this.authorize(actor, sheetId);
    if (!canManageSheetLifecycle(actor, context)) throw denyForbidden();

    const now = this.deps.clock();
    await this.deps.db.batch([
      this.deps.repos.sheets.prepareRecycle(sheetId, now),
      buildAuditStatement(this.deps, {
        actorUserId: actor.userId,
        action: 'sheet.recycled',
        targetType: 'sheet',
        targetId: sheetId,
      }),
    ]);
  }

  async restore(actor: Actor, sheetId: string): Promise<void> {
    const { context } = await this.authorize(actor, sheetId, { allowRecycled: true });
    if (!canManageSheetLifecycle(actor, context)) throw denyForbidden();

    const now = this.deps.clock();
    await this.deps.db.batch([
      this.deps.repos.sheets.prepareRestore(sheetId, now),
      buildAuditStatement(this.deps, {
        actorUserId: actor.userId,
        action: 'sheet.restored',
        targetType: 'sheet',
        targetId: sheetId,
      }),
    ]);
  }

  /**
   * Permanently deletes a recycled List and its contained tasks and history.
   *
   * Requires the List to be in the recycle bin first: the approved lifecycle is
   * recycle-then-purge, and permitting a direct purge of an active List would
   * remove the 30-day recovery window the contract promises.
   */
  async purge(actor: Actor, sheetId: string): Promise<void> {
    const { sheet, context } = await this.authorize(actor, sheetId, { allowRecycled: true });
    if (!canManageSheetLifecycle(actor, context)) throw denyForbidden();

    if (sheet.state !== 'recycled') {
      throw new AppError(
        409,
        'NOT_RECYCLED',
        'A List must be in the recycle bin before it can be permanently deleted.'
      );
    }

    await this.deps.db.batch([
      this.deps.repos.sheets.prepareDeletePermanently(sheetId),
      buildAuditStatement(this.deps, {
        actorUserId: actor.userId,
        action: 'sheet.purged',
        targetType: 'sheet',
        targetId: sheetId,
      }),
    ]);
  }
}

/** Shared bound so the service and the request validator agree on the limit. */
export const SHEET_NAME_LIMITS = LIMITS.sheetName;
