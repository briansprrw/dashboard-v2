// The authenticated principal a policy decision is made about.
//
// This is deliberately *not* a `UserRecord`. Policy must never receive a shape
// that carries content or lets a caller pass a half-populated row: it needs the
// account's identity, its global role, and its lifecycle state, and nothing
// else. Building an `Actor` is the authentication layer's job (M2.3); every
// policy function below takes one and cannot be called without it.

import type { GlobalRole, UserState } from '../../shared/domain/enums';
import { isAuthEligibleState } from '../../shared/domain/enums';
import type { UserRecord } from '../../shared/domain/records';

export interface Actor {
  userId: string;
  globalRole: GlobalRole;
  state: UserState;
}

export function actorFromUser(user: UserRecord): Actor {
  return { userId: user.id, globalRole: user.globalRole, state: user.state };
}

/**
 * Whether the account may exercise *any* authority at all.
 *
 * Launch Contract §2 gives the entire "Disabled/Recycled user" column a denial,
 * including the Authenticate row. Every capability function starts here, so a
 * disabled or recycled account cannot pass a single check regardless of the
 * global role or membership it still nominally holds — an admin who is disabled
 * is not an admin, and a List owner who is recycled cannot act on the List.
 */
export function isEligible(actor: Actor): boolean {
  return isAuthEligibleState(actor.state);
}

/**
 * Administrative authority. Never consulted for content visibility: M0-D16 and
 * the Launch Contract §2 row "View private content through administrative
 * authority" both deny it, so the two concepts stay in separate functions and
 * `isAdmin` is never used as a shortcut for "may read".
 */
export function isAdmin(actor: Actor): boolean {
  return isEligible(actor) && actor.globalRole === 'admin';
}
