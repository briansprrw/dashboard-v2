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
  canManageMembership,
  canManageSheetLifecycle,
  canReadSheet,
  canRenameSheet,
  canTransferOwnership,
  denyAsNotFound,
  denyForbidden,
  isEligible,
  resolveAccessLevel,
} from '../policy';
import { writeAuditEvent } from './audit';
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
   */
  async authorize(actor: Actor, sheetId: string): Promise<AuthorizedSheet> {
    if (!isEligible(actor)) throw denyAsNotFound();

    const sheet = await this.deps.repos.sheets.findById(sheetId);
    if (sheet === null) throw denyAsNotFound();

    const membershipRole = await this.deps.repos.memberships.findRole(sheetId, actor.userId);
    const context: SheetAccessContext = { ownerUserId: sheet.ownerUserId, membershipRole };

    // A List the actor cannot read at all is reported as absent rather than
    // forbidden: "this List exists but is not yours" is itself information.
    if (!canReadSheet(actor, context)) throw denyAsNotFound();

    return { sheet, context, accessLevel: resolveAccessLevel(actor, context) };
  }

  /** Every active List the actor can reach, owned or shared. */
  async listAccessible(actor: Actor): Promise<AccessibleSheetRecord[]> {
    if (!isEligible(actor)) throw denyAsNotFound();
    return this.deps.repos.sheets.listAccessibleActive(actor.userId);
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

    const membership = await this.deps.repos.memberships.upsert({
      sheetId,
      userId: targetUserId,
      role,
      createdByUserId: actor.userId,
      now: this.deps.clock(),
    });

    await writeAuditEvent(this.deps, {
      actorUserId: actor.userId,
      action: 'sheet.membership.granted',
      targetType: 'sheet',
      targetId: sheetId,
      // Opaque identity and the granted level only — never the List's name.
      metadata: { targetUserId, role },
    });

    return membership;
  }

  async revokeMembership(actor: Actor, sheetId: string, targetUserId: string): Promise<void> {
    const { context } = await this.authorize(actor, sheetId);
    if (!canManageMembership(actor, context)) throw denyForbidden();

    const removed = await this.deps.repos.memberships.remove(sheetId, targetUserId);
    if (!removed) throw new AppError(404, 'NOT_FOUND', 'The requested resource was not found.');

    await writeAuditEvent(this.deps, {
      actorUserId: actor.userId,
      action: 'sheet.membership.revoked',
      targetType: 'sheet',
      targetId: sheetId,
      metadata: { targetUserId },
    });
  }

  /**
   * Moves ownership to another user, atomically.
   *
   * The invariant this protects is the milestone's first: a List must never
   * become ownerless, and must never have two owners. The checks are explicit
   * and ordered so the failure reasons are distinguishable:
   *
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
    await this.deps.repos.sheets.transferOwnership(sheetId, newOwnerUserId, this.deps.clock());

    await writeAuditEvent(this.deps, {
      actorUserId: actor.userId,
      action: 'sheet.ownership.transferred',
      targetType: 'sheet',
      targetId: sheetId,
      metadata: { previousOwnerUserId, newOwnerUserId },
    });

    const updated = await this.deps.repos.sheets.findById(sheetId);
    if (updated === null) throw denyAsNotFound();
    return updated;
  }

  /** Recycles the List and everything in it as one unit (M0 §4 folder semantics). */
  async recycle(actor: Actor, sheetId: string): Promise<void> {
    const { context } = await this.authorize(actor, sheetId);
    if (!canManageSheetLifecycle(actor, context)) throw denyForbidden();

    await this.deps.repos.sheets.recycle(sheetId, this.deps.clock());
    await writeAuditEvent(this.deps, {
      actorUserId: actor.userId,
      action: 'sheet.recycled',
      targetType: 'sheet',
      targetId: sheetId,
    });
  }

  async restore(actor: Actor, sheetId: string): Promise<void> {
    const { context } = await this.authorize(actor, sheetId);
    if (!canManageSheetLifecycle(actor, context)) throw denyForbidden();

    await this.deps.repos.sheets.restore(sheetId, this.deps.clock());
    await writeAuditEvent(this.deps, {
      actorUserId: actor.userId,
      action: 'sheet.restored',
      targetType: 'sheet',
      targetId: sheetId,
    });
  }

  /**
   * Permanently deletes a recycled List and its contained tasks and history.
   *
   * Requires the List to be in the recycle bin first: the approved lifecycle is
   * recycle-then-purge, and permitting a direct purge of an active List would
   * remove the 30-day recovery window the contract promises.
   */
  async purge(actor: Actor, sheetId: string): Promise<void> {
    const { sheet, context } = await this.authorize(actor, sheetId);
    if (!canManageSheetLifecycle(actor, context)) throw denyForbidden();

    if (sheet.state !== 'recycled') {
      throw new AppError(
        409,
        'NOT_RECYCLED',
        'A List must be in the recycle bin before it can be permanently deleted.'
      );
    }

    await this.deps.repos.sheets.deletePermanently(sheetId);
    await writeAuditEvent(this.deps, {
      actorUserId: actor.userId,
      action: 'sheet.purged',
      targetType: 'sheet',
      targetId: sheetId,
    });
  }
}

/** Shared bound so the service and the request validator agree on the limit. */
export const SHEET_NAME_LIMITS = LIMITS.sheetName;
