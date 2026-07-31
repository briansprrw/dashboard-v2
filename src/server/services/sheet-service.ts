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
import {
  buildAuditStatementIfSheetOwner,
  buildAuditStatementIfSheetOwnerAndActiveUser,
  buildAuditStatementIfSheetOwnerAndMembership,
} from './audit';
import type { ServiceDeps } from './service-context';
import { idFactory } from './service-context';

/**
 * The single conflict every owner-guarded write raises when the ownership it
 * was authorized against no longer holds at database-write time (M4-QA-02,
 * Codex M4-RR2-02). One helper so the code and message cannot drift apart
 * across the seven call sites that need it.
 */
function ownershipChanged(): AppError {
  return new AppError(
    409,
    'OWNERSHIP_CHANGED',
    'This List’s ownership changed while this request was in progress. Reload and try again.'
  );
}

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

  /**
   * Renames the List, conditioned on the ownership observed at `authorize()`
   * still holding at write time (Codex M4-RR2-02).
   *
   * The unguarded version let a former owner suspended across a concurrent
   * transfer resume and rename the *new* owner's List. Guarding on the
   * observed owner rather than on `actor.userId` keeps the Admin override
   * ownership-independent — an Admin may still rename a List they do not own —
   * while making every actor's decision fail loudly if it was superseded
   * mid-flight, instead of silently applying to a List that changed hands.
   */
  async rename(actor: Actor, sheetId: string, displayName: string): Promise<SheetRecord> {
    const { context } = await this.authorize(actor, sheetId);
    if (!canRenameSheet(actor, context)) throw denyForbidden();

    const result = await this.deps.repos.sheets
      .prepareRenameIfOwner(sheetId, displayName, this.deps.clock(), context.ownerUserId)
      .run();
    if ((result.meta.changes ?? 0) === 0) throw ownershipChanged();

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
    //
    // The audit row carries the *same* guard (M4-AR-01). It is one batch, but
    // the batch commits either way — a no-op guard is not a SQL error — so an
    // unguarded audit statement here would durably record a grant or role
    // change that this request went on to refuse.
    const membershipBatchResults = await this.deps.db.batch([
      this.deps.repos.memberships.prepareUpsertIfOwner(membershipInput, sheet.ownerUserId),
      buildAuditStatementIfSheetOwner(
        this.deps,
        {
          actorUserId: actor.userId,
          action:
            previousRole === null ? 'sheet.membership.granted' : 'sheet.membership.role_changed',
          targetType: 'sheet',
          targetId: sheetId,
          // Opaque identity and the granted level(s) only — never the List's name.
          metadata:
            previousRole === null ? { targetUserId, role } : { targetUserId, previousRole, role },
        },
        sheetId,
        sheet.ownerUserId
      ),
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

    // The audit row shares the mutation's *complete* precondition — the owner
    // is unchanged (M4-QA-02, M4-AR-01) **and** the membership still exists
    // (Codex M4-RR2-03) — and is batched ahead of the `DELETE` so it evaluates
    // that second condition before the removal erases it. Guarded on ownership
    // alone, two concurrent revokes of the same membership both recorded
    // `sheet.membership.revoked`, one of them from the request that went on to
    // report failure: a single removal produced two successful-looking events.
    const revokeBatchResults = await this.deps.db.batch([
      buildAuditStatementIfSheetOwnerAndMembership(
        this.deps,
        {
          actorUserId: actor.userId,
          action: 'sheet.membership.revoked',
          targetType: 'sheet',
          targetId: sheetId,
          metadata: { targetUserId },
        },
        sheetId,
        sheet.ownerUserId,
        targetUserId
      ),
      this.deps.repos.memberships.prepareRemoveIfOwner(sheetId, targetUserId, sheet.ownerUserId),
    ]);
    if ((revokeBatchResults[1]?.meta.changes ?? 0) === 0) {
      // Distinguish the two reasons rather than reporting the ownership one for
      // both: a concurrent revoke of the same membership is not an ownership
      // change, and saying so sent the caller to reload a List that was fine.
      const ownerNow = await this.deps.repos.sheets.findById(sheetId);
      if (ownerNow === null || ownerNow.ownerUserId !== sheet.ownerUserId) {
        throw ownershipChanged();
      }
      throw new AppError(404, 'NOT_FOUND', 'The requested resource was not found.');
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
    // Every statement in this batch shares one database-time predicate:
    // the List is still owned by `previousOwnerUserId` AND `newOwnerUserId` is
    // still an active account. Both facts were read above, and both can be
    // invalidated before the write — a concurrent transfer (M4-QA-02) or a
    // concurrent disable/recycle of the target (Codex M4-RR2-01). Carrying only
    // the first into the write let an ineligible account be installed as owner
    // with a clean audit row asserting a legitimate transfer. When the
    // predicate fails, all three statements match zero rows: ownership is not
    // reassigned, the proposed owner keeps any membership they held, and no
    // `sheet.ownership.transferred` row is written. The batch still commits —
    // a no-op guard is not a SQL error — so the `meta.changes` check below is
    // what turns that into a conflict.
    //
    // The audit statement comes **first**, and the ordering is load-bearing.
    // Statements in a D1 batch run sequentially inside the transaction, so an
    // audit row placed after the owner `UPDATE` would evaluate its
    // `owner_user_id = previousOwnerUserId` guard against the row the `UPDATE`
    // had already rewritten, and would never fire — suppressing the evidence
    // for every *successful* transfer. Guarding on the new owner instead would
    // fire correctly on the success path but also write a phantom row when a
    // concurrent transfer happened to name the same target. Evaluating the
    // original predicate before any mutation is the only ordering that is
    // right in all three cases.
    const transferBatchResults = await this.deps.db.batch([
      buildAuditStatementIfSheetOwnerAndActiveUser(
        this.deps,
        {
          actorUserId: actor.userId,
          action: 'sheet.ownership.transferred',
          targetType: 'sheet',
          targetId: sheetId,
          metadata: { previousOwnerUserId, newOwnerUserId },
        },
        sheetId,
        previousOwnerUserId,
        newOwnerUserId
      ),
      ...this.deps.repos.sheets.prepareTransferOwnershipIfOwner(
        sheetId,
        newOwnerUserId,
        previousOwnerUserId,
        now
      ),
    ]);
    // Index 2 is the owner-changing UPDATE (index 0 is the guarded audit row,
    // index 1 the membership DELETE, which carries the same guard and so
    // cannot strip a membership from a transfer that was refused).
    if ((transferBatchResults[2]?.meta.changes ?? 0) === 0) {
      // Nothing was written either way; this read only decides *which* accurate
      // conflict to report, so the caller learns whether to pick a different
      // recipient or reload the List.
      const targetNow = await this.deps.repos.users.findById(newOwnerUserId);
      if (targetNow === null || targetNow.state !== 'active') {
        throw new AppError(
          409,
          'INELIGIBLE_OWNER',
          'Ownership can only be transferred to an active account.'
        );
      }
      throw ownershipChanged();
    }

    const updated = await this.deps.repos.sheets.findById(sheetId);
    if (updated === null) throw denyAsNotFound();
    return updated;
  }

  /**
   * The owner this lifecycle action was taken against (M4-AR-04).
   *
   * `sheet.recycled`, `sheet.restored`, and `sheet.purged` are reachable by
   * the List owner *and* by an Admin overriding them, and they previously
   * wrote identical rows with empty metadata for both. M0 §5 requires
   * administrative overrides to be auditable as such, and comparing
   * `actorUserId` to this `ownerUserId` is what makes that possible after the
   * fact. It matters most for `sheet.purged`: that action deletes the `sheets`
   * row, so an investigator can no longer recover the owner by lookup, and
   * without this the override is permanently unreconstructable.
   *
   * An opaque account id, never the List's name — same allowlist boundary as
   * every other audit metadata field.
   */
  private lifecycleAuditMetadata(actor: Actor, context: SheetAccessContext) {
    return {
      ownerUserId: context.ownerUserId,
      adminOverride: context.ownerUserId !== actor.userId,
    };
  }

  /**
   * Recycles the List and everything in it as one unit (M0 §4 folder
   * semantics), conditioned on the ownership observed at `authorize()`
   * (Codex M4-RR2-02).
   *
   * Recycling is a high-impact lifecycle write, and the unguarded version let a
   * former owner recycle the *new* owner's List after a concurrent transfer —
   * writing an audit row whose `ownerUserId` named the stale owner, so the
   * evidence was wrong as well as the action. The audit shares the guard and is
   * batched first, for the ordering reason `transferOwnership` documents.
   */
  async recycle(actor: Actor, sheetId: string): Promise<void> {
    const { context } = await this.authorize(actor, sheetId);
    if (!canManageSheetLifecycle(actor, context)) throw denyForbidden();

    const now = this.deps.clock();
    const results = await this.deps.db.batch([
      buildAuditStatementIfSheetOwner(
        this.deps,
        {
          actorUserId: actor.userId,
          action: 'sheet.recycled',
          targetType: 'sheet',
          targetId: sheetId,
          metadata: this.lifecycleAuditMetadata(actor, context),
        },
        sheetId,
        context.ownerUserId
      ),
      this.deps.repos.sheets.prepareRecycleIfOwner(sheetId, now, context.ownerUserId),
    ]);
    if ((results[1]?.meta.changes ?? 0) === 0) throw ownershipChanged();
  }

  async restore(actor: Actor, sheetId: string): Promise<void> {
    const { context } = await this.authorize(actor, sheetId, { allowRecycled: true });
    if (!canManageSheetLifecycle(actor, context)) throw denyForbidden();

    const now = this.deps.clock();
    const results = await this.deps.db.batch([
      buildAuditStatementIfSheetOwner(
        this.deps,
        {
          actorUserId: actor.userId,
          action: 'sheet.restored',
          targetType: 'sheet',
          targetId: sheetId,
          metadata: this.lifecycleAuditMetadata(actor, context),
        },
        sheetId,
        context.ownerUserId
      ),
      this.deps.repos.sheets.prepareRestoreIfOwner(sheetId, now, context.ownerUserId),
    ]);
    if ((results[1]?.meta.changes ?? 0) === 0) throw ownershipChanged();
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

    // Owner-guarded like `recycle`/`restore` (Codex M4-RR2-02), and the most
    // consequential of the three: a stale authority here permanently destroys
    // the new owner's List, its tasks, and its history with no recovery window.
    const results = await this.deps.db.batch([
      buildAuditStatementIfSheetOwner(
        this.deps,
        {
          actorUserId: actor.userId,
          action: 'sheet.purged',
          targetType: 'sheet',
          targetId: sheetId,
          metadata: this.lifecycleAuditMetadata(actor, context),
        },
        sheetId,
        context.ownerUserId
      ),
      this.deps.repos.sheets.prepareDeletePermanentlyIfOwner(sheetId, context.ownerUserId),
    ]);
    if ((results[1]?.meta.changes ?? 0) === 0) throw ownershipChanged();
  }
}

/** Shared bound so the service and the request validator agree on the limit. */
export const SHEET_NAME_LIMITS = LIMITS.sheetName;
