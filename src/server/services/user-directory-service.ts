// Exact-email user lookup: the entry point for naming a share or ownership-
// transfer target (M4-D2). V2 has no username or user directory/search (M0
// §2, §11) — an owner must already know the collaborator's exact email, and
// this service resolves that one email to the minimum identity needed to
// pick them, nothing more.

import type { UserRecord } from '../../shared/domain/records';
import { normalizeEmail } from '../auth/auth-service';
import { AppError } from '../errors/app-error';
import type { Actor } from '../policy';
import { denyForbidden, isEligible } from '../policy';
import type { ServiceDeps } from './service-context';

export class UserDirectoryService {
  constructor(private readonly deps: ServiceDeps) {}

  /**
   * Only an active account can be found. Not a lookup restriction layered on
   * top of sharing's own eligibility check (`grantMembership`/
   * `transferOwnership` already refuse a non-active target) — it is the same
   * rule, applied here too, so a caller cannot use the lookup step itself to
   * learn that a given email belongs to a disabled or recycled account.
   */
  async findByEmail(actor: Actor, email: string): Promise<UserRecord> {
    if (!isEligible(actor)) throw denyForbidden();

    const identity = await this.deps.repos.users.findIdentityByEmail(normalizeEmail(email));
    if (identity === null) {
      throw new AppError(404, 'NOT_FOUND', 'The requested resource was not found.');
    }

    const user = await this.deps.repos.users.findById(identity.userId);
    if (user === null || user.state !== 'active') {
      throw new AppError(404, 'NOT_FOUND', 'The requested resource was not found.');
    }

    return user;
  }
}
