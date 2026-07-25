// The two denial shapes every service uses, so status-code selection is made
// once rather than at each call site.
//
// The distinction that matters for privacy: when an actor may not know an
// object exists, the denial must be indistinguishable from the object being
// absent. `denyAsNotFound` exists for exactly that case and is used for private
// tasks — returning 403 for a private task the caller cannot see would confirm
// its existence, which is the disclosure the private-task feature prevents.

import { AppError } from '../errors/app-error';

/**
 * The actor is authenticated and eligible but lacks the required right, and is
 * permitted to know the object exists.
 */
export function denyForbidden(message = 'You do not have permission to perform this action.') {
  return new AppError(403, 'FORBIDDEN', message);
}

/**
 * The object exists but this actor may not know that. Deliberately identical in
 * status, code, and message to a genuine miss, so presence and absence are
 * indistinguishable from outside.
 */
export function denyAsNotFound() {
  return new AppError(404, 'NOT_FOUND', 'The requested resource was not found.');
}

/** No usable session: absent, expired, revoked, or belonging to an ineligible account. */
export function denyUnauthenticated() {
  return new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
}
