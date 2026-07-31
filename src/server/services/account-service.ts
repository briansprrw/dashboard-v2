// Account administration: global roles, disable, recycle, restore.
//
// The rule that shapes this file is immediate revocation. M0 §8 requires that
// "disabling or recycling an account causes immediate server-side revocation",
// and the Launch Contract denies the entire Disabled/Recycled column. A state
// change alone does not achieve that: an already-issued session would keep
// working until it expired. Every state-changing method here therefore uses a
// repository method that changes the state *and* bumps `auth_version` in one
// D1 batch (`disable`, `recycle`, `updateGlobalRoleAndRevoke`) rather than two
// separate statements. Codex M2-QA-03 found that two separate statements left
// a partial-failure window: if the bump failed after the state change landed,
// the account was disabled/recycled but its old sessions kept a still-matching
// auth version, so a later restore would silently resurrect them.

import type { GlobalRole } from '../../shared/domain/enums';
import type { SheetMembershipRecord, SheetRecord, UserRecord } from '../../shared/domain/records';
import { normalizeEmail } from '../auth/auth-service';
import { AppError } from '../errors/app-error';
import type { Actor } from '../policy';
import { canAdministerAccounts, denyForbidden } from '../policy';
import { buildAuditStatement } from './audit';
import type { ServiceDeps } from './service-context';

export interface UserDetail {
  user: UserRecord;
  ownedSheets: SheetRecord[];
  memberships: SheetMembershipRecord[];
  /**
   * The List behind each membership, keyed by sheet id (Codex M4-RR-04), so
   * the admin detail view can name what the account has access to instead of
   * rendering a bare UUID. List metadata only — no task content is loaded.
   */
  membershipSheets: Map<string, SheetRecord>;
}

export class AccountService {
  constructor(private readonly deps: ServiceDeps) {}

  private requireAdmin(actor: Actor): void {
    if (!canAdministerAccounts(actor)) throw denyForbidden();
  }

  private async load(userId: string): Promise<UserRecord> {
    const user = await this.deps.repos.users.findById(userId);
    if (user === null) {
      throw new AppError(404, 'NOT_FOUND', 'The requested resource was not found.');
    }
    return user;
  }

  /**
   * Admin-only exact-email lookup that can find an account in *any* state,
   * including disabled and recycled (M4-QA-03). Deliberately separate from
   * `UserDirectoryService.findByEmail`, which is intentionally active-only —
   * that lookup is the ordinary sharing/transfer entry point available to any
   * eligible user, and widening it to disabled/recycled accounts would turn
   * it into a stronger account-state oracle than sharing needs. This method
   * requires admin authority precisely because "does this email belong to a
   * disabled account" is exactly the kind of fact an ordinary user must not
   * be able to learn, while an administrator recovering an account
   * legitimately needs to find it by email after losing in-memory UI state
   * (a closed dialog, a page reload).
   */
  async findUserByEmail(actor: Actor, email: string): Promise<UserRecord> {
    this.requireAdmin(actor);

    const identity = await this.deps.repos.users.findIdentityByEmail(normalizeEmail(email));
    if (identity === null) {
      throw new AppError(404, 'NOT_FOUND', 'The requested resource was not found.');
    }
    const user = await this.deps.repos.users.findById(identity.userId);
    if (user === null) {
      throw new AppError(404, 'NOT_FOUND', 'The requested resource was not found.');
    }
    return user;
  }

  /**
   * Admin user-detail view (M0 §12): account state, global role, last
   * activity, owned Lists, and memberships — never private task/note/history
   * content, since none of the three underlying reads (`findById`,
   * `listOwnedActive`/`listRecycledOwned`, `listForUser`) selects it in the
   * first place.
   */
  async getUserDetail(actor: Actor, targetUserId: string): Promise<UserDetail> {
    this.requireAdmin(actor);
    const user = await this.load(targetUserId);

    const [activeOwned, recycledOwned, memberships] = await Promise.all([
      this.deps.repos.sheets.listOwnedActive(targetUserId),
      this.deps.repos.sheets.listRecycledOwned(targetUserId),
      this.deps.repos.memberships.listForUser(targetUserId),
    ]);

    // A per-row lookup rather than a new batched repository method, matching
    // the same trade-off `GET /sheets/:sheetId/members` already makes: an
    // account's membership count is small in V2, and this avoids adding a
    // repository method whose only caller is this one view.
    const membershipSheets = new Map<string, SheetRecord>();
    await Promise.all(
      memberships.map(async (membership) => {
        const sheet = await this.deps.repos.sheets.findById(membership.sheetId);
        if (sheet !== null) membershipSheets.set(membership.sheetId, sheet);
      })
    );

    return {
      user,
      ownedSheets: [...activeOwned, ...recycledOwned],
      memberships,
      membershipSheets,
    };
  }

  /**
   * Changes a user's global role.
   *
   * Bumps `auth_version` so the change applies on the target's next request
   * rather than whenever their cookie happens to expire — the milestone's "role
   * and auth-version changes take effect without waiting for cookie expiry"
   * invariant. A demoted admin loses admin authority immediately.
   */
  async setGlobalRole(actor: Actor, targetUserId: string, globalRole: GlobalRole): Promise<void> {
    this.requireAdmin(actor);
    const target = await this.load(targetUserId);

    if (target.globalRole === globalRole) return;

    // An admin may not remove their own admin role (M4-AR-05). This is the
    // same availability rule `refuseSelfTargeting` applies to disable/recycle,
    // and it was missing here even though the outcome is identical: the batch
    // below bumps `auth_version`, so a self-demotion revokes the actor's own
    // sessions and leaves them with no authority to undo it. With the small
    // trusted admin set this product assumes, that can leave the installation
    // with no usable administrator and no in-app recovery. Promoting another
    // account, or being demoted *by* another admin, is unaffected.
    if (actor.userId === targetUserId && globalRole !== 'admin') {
      throw new AppError(
        409,
        'SELF_TARGET_REFUSED',
        'You cannot remove your own administrator role. Ask another administrator to do it.'
      );
    }

    const now = this.deps.clock();
    await this.deps.db.batch([
      ...this.deps.repos.users.prepareUpdateGlobalRoleAndRevoke(targetUserId, globalRole, now),
      buildAuditStatement(this.deps, {
        actorUserId: actor.userId,
        action: 'user.role.changed',
        targetType: 'user',
        targetId: targetUserId,
        metadata: { previousRole: target.globalRole, newRole: globalRole },
      }),
    ]);
  }

  /**
   * Disables an account: authentication is refused and every existing session
   * is revoked, atomically, on its next request.
   *
   * `disabled` is not the recycle bin — no `recycled_at`, no purge deadline
   * (M0-D22) — and the account keeps owning its Lists, so no ownership
   * invariant is disturbed.
   */
  async disable(actor: Actor, targetUserId: string): Promise<void> {
    this.requireAdmin(actor);
    await this.load(targetUserId);
    this.refuseSelfTargeting(actor, targetUserId);

    const now = this.deps.clock();
    await this.deps.db.batch([
      ...this.deps.repos.users.prepareDisable(targetUserId, now),
      buildAuditStatement(this.deps, {
        actorUserId: actor.userId,
        action: 'user.disabled',
        targetType: 'user',
        targetId: targetUserId,
      }),
    ]);
  }

  /**
   * Recycles an account: soft-deletes it, revokes its sessions atomically,
   * and starts the 30-day window.
   *
   * The account keeps owning its Lists deliberately. M0 §4 says a recycled
   * account's Lists "disappear for all other members until the account is
   * restored" — owned-but-hidden, not ownerless — so ownership is never
   * cleared here. Hiding those Lists from other members is a read-path concern
   * that M3/M4 implement; this service must not pre-empt it by reassigning or
   * dropping ownership, which would break the restore-as-one-unit contract.
   */
  async recycle(actor: Actor, targetUserId: string): Promise<void> {
    this.requireAdmin(actor);
    await this.load(targetUserId);
    this.refuseSelfTargeting(actor, targetUserId);

    const now = this.deps.clock();
    await this.deps.db.batch([
      ...this.deps.repos.users.prepareRecycle(targetUserId, now),
      buildAuditStatement(this.deps, {
        actorUserId: actor.userId,
        action: 'user.recycled',
        targetType: 'user',
        targetId: targetUserId,
      }),
    ]);
  }

  /**
   * Returns a disabled or recycled account to active use. No auth-version bump
   * is needed to *restore* access — the old sessions are already invalid and
   * the user signs in again — but one is harmless and is omitted deliberately
   * so restore does not invalidate a session the user may have just created.
   */
  async restore(actor: Actor, targetUserId: string): Promise<void> {
    this.requireAdmin(actor);
    await this.load(targetUserId);

    const now = this.deps.clock();
    await this.deps.db.batch([
      this.deps.repos.users.prepareRestore(targetUserId, now),
      buildAuditStatement(this.deps, {
        actorUserId: actor.userId,
        action: 'user.restored',
        targetType: 'user',
        targetId: targetUserId,
      }),
    ]);
  }

  /**
   * Permanently deletes a recycled account and every List it owns, as one
   * unit (M0 §Accounts: "One explicitly confirmed administrator action may
   * permanently delete the entire recycled account unit early").
   *
   * Requires the account to already be in the recycle bin, mirroring the
   * recycle-before-purge rule `SheetService.purge`/`TaskService.purge`
   * already enforce — a direct purge of an active account would remove the
   * 30-day recovery window the contract promises.
   *
   * `users.id` is referenced `ON DELETE RESTRICT` from `sheets.owner_user_id`
   * (M2.1), so the user row cannot be deleted first: every List the account
   * owns — active or recycled — is deleted ahead of it in the same batch.
   * Deleting a List cascades to its memberships, tasks, and task history
   * (`ON DELETE CASCADE`, migrations/0002), which is the correct behavior
   * here: the approved unit is "the account and everything it owns," not
   * "the account, leaving its Lists orphaned." A List this account merely
   * had a viewer/editor membership on (not owned) is unaffected — membership
   * rows reference `sheets`, not `users`, for cascade purposes, and this
   * account's own membership rows elsewhere are removed by `users` `ON
   * DELETE CASCADE` on `sheet_memberships.user_id` when the user row itself
   * is deleted at the end of the same batch.
   */
  async purge(actor: Actor, targetUserId: string): Promise<void> {
    this.requireAdmin(actor);
    const target = await this.load(targetUserId);
    this.refuseSelfTargeting(actor, targetUserId);

    if (target.state !== 'recycled') {
      throw new AppError(
        409,
        'NOT_RECYCLED',
        'An account must be in the recycle bin before it can be permanently deleted.'
      );
    }

    const [activeOwned, recycledOwned] = await Promise.all([
      this.deps.repos.sheets.listOwnedActive(targetUserId),
      this.deps.repos.sheets.listRecycledOwned(targetUserId),
    ]);
    const ownedSheetIds = [...activeOwned, ...recycledOwned].map((s) => s.id);

    // Each List delete is bound to the ownership this purge actually
    // authorized (M4-AR-03): a List transferred away between the read above
    // and this batch belongs to someone else now and must survive. The
    // converse race — a List transferred *in* after the read — is caught by
    // `sheets.owner_user_id`'s ON DELETE RESTRICT, which fails the whole batch
    // atomically rather than half-purging the account.
    await this.deps.db.batch([
      ...ownedSheetIds.map((sheetId) =>
        this.deps.repos.sheets.prepareDeletePermanentlyIfOwner(sheetId, targetUserId)
      ),
      this.deps.repos.users.prepareDeletePermanently(targetUserId),
      buildAuditStatement(this.deps, {
        actorUserId: actor.userId,
        action: 'user.purged',
        targetType: 'user',
        targetId: targetUserId,
        metadata: { ownedSheetCount: ownedSheetIds.length },
      }),
    ]);
  }

  /**
   * Revokes every session for a user without changing their account state —
   * the "sign out everywhere" operation, and the containment action if a
   * session is believed compromised.
   */
  async revokeSessions(actor: Actor, targetUserId: string): Promise<void> {
    this.requireAdmin(actor);
    await this.load(targetUserId);

    const now = this.deps.clock();
    await this.deps.db.batch([
      this.deps.repos.users.prepareBumpAuthVersion(targetUserId, now),
      buildAuditStatement(this.deps, {
        actorUserId: actor.userId,
        action: 'session.revoked.admin',
        targetType: 'user',
        targetId: targetUserId,
      }),
    ]);
  }

  /**
   * Refuses an admin disabling or recycling their own account.
   *
   * Not a privacy rule but an availability one: an admin who locks themselves
   * out cannot undo it, and with a small trusted admin set that can leave the
   * installation with no usable administrator.
   */
  private refuseSelfTargeting(actor: Actor, targetUserId: string): void {
    if (actor.userId === targetUserId) {
      throw new AppError(
        409,
        'SELF_TARGET_REFUSED',
        'You cannot disable or recycle your own account.'
      );
    }
  }
}
