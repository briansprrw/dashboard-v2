// Account administration: global roles, disable, recycle, restore.
//
// The rule that shapes this file is immediate revocation. M0 §8 requires that
// "disabling or recycling an account causes immediate server-side revocation",
// and the Launch Contract denies the entire Disabled/Recycled column. A state
// change alone does not achieve that: an already-issued session would keep
// working until it expired. So every state change here is paired with an
// `auth_version` bump in the same method, and the repository deliberately does
// *not* bump it for us — making the pairing visible at the call site rather
// than hidden in a helper that a future caller might bypass.

import type { GlobalRole } from '../../shared/domain/enums';
import type { UserRecord } from '../../shared/domain/records';
import { AppError } from '../errors/app-error';
import type { Actor } from '../policy';
import { canAdministerAccounts, denyForbidden } from '../policy';
import { writeAuditEvent } from './audit';
import type { ServiceDeps } from './service-context';

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

    const now = this.deps.clock();
    await this.deps.repos.users.updateGlobalRole(targetUserId, globalRole, now);
    await this.deps.repos.users.bumpAuthVersion(targetUserId, now);

    await writeAuditEvent(this.deps, {
      actorUserId: actor.userId,
      action: 'user.role.changed',
      targetType: 'user',
      targetId: targetUserId,
      metadata: { previousRole: target.globalRole, newRole: globalRole },
    });
  }

  /**
   * Disables an account: authentication is refused and every existing session
   * is revoked on its next request.
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
    await this.deps.repos.users.disable(targetUserId, now);
    await this.deps.repos.users.bumpAuthVersion(targetUserId, now);

    await writeAuditEvent(this.deps, {
      actorUserId: actor.userId,
      action: 'user.disabled',
      targetType: 'user',
      targetId: targetUserId,
    });
  }

  /**
   * Recycles an account: soft-deletes it, revokes its sessions, and starts the
   * 30-day window.
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
    await this.deps.repos.users.recycle(targetUserId, now);
    await this.deps.repos.users.bumpAuthVersion(targetUserId, now);

    await writeAuditEvent(this.deps, {
      actorUserId: actor.userId,
      action: 'user.recycled',
      targetType: 'user',
      targetId: targetUserId,
    });
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

    await this.deps.repos.users.restore(targetUserId, this.deps.clock());
    await writeAuditEvent(this.deps, {
      actorUserId: actor.userId,
      action: 'user.restored',
      targetType: 'user',
      targetId: targetUserId,
    });
  }

  /**
   * Revokes every session for a user without changing their account state —
   * the "sign out everywhere" operation, and the containment action if a
   * session is believed compromised.
   */
  async revokeSessions(actor: Actor, targetUserId: string): Promise<void> {
    this.requireAdmin(actor);
    await this.load(targetUserId);

    await this.deps.repos.users.bumpAuthVersion(targetUserId, this.deps.clock());
    await writeAuditEvent(this.deps, {
      actorUserId: actor.userId,
      action: 'session.revoked.admin',
      targetType: 'user',
      targetId: targetUserId,
    });
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
