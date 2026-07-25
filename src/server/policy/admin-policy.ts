// Administrative authority, and the hard boundary around it.
//
// V2 administrators have "god mode" over accounts, roles, Lists, memberships,
// ownership, recycle operations, recovery, and purge (M0 §3). They have *no*
// content visibility: they cannot read private tasks, private notes, or
// task-history field values. That boundary is enforced in three independent
// places, on purpose:
//
//   1. Here, as an explicit denial that is impossible to misread.
//   2. In the repositories, whose administrative reads do not SELECT the
//      protected columns at all (M2.1).
//   3. In the DTO layer, which builds administrative responses from an
//      allowlist rather than filtering a full record (M2.4).
//
// Any one of the three failing still leaves two. This module is the first.

import type { Actor } from './actor';
import { isAdmin, isEligible } from './actor';

/** §2 "Administer accounts / roles / recycle accounts": Admin only. */
export function canAdministerAccounts(actor: Actor): boolean {
  return isAdmin(actor);
}

/**
 * §2 "Restore/purge by opaque identity without protected-content read".
 *
 * Granting this *never* grants a content read. The administrative recovery
 * surface operates on opaque identifiers and allowlisted lifecycle metadata; it
 * is a different code path from an owner's read, not the same path with a
 * higher role.
 */
export function canPerformOpaqueRecovery(actor: Actor): boolean {
  return isAdmin(actor);
}

/**
 * Whether administrative authority grants a protected-content read.
 *
 * The answer is unconditionally `false` and this function exists to say so in
 * one greppable place, so a future caller reaching for "can this admin see
 * it?" finds an explicit, documented denial rather than an absent function
 * they might be tempted to write permissively. The return type is the literal
 * `false`, not `boolean`, so even a caller that ignores the runtime value
 * cannot type-check a branch where it is true.
 *
 * Changing this reverses M0-D16 and the Launch Contract §2 privacy row, and is
 * a product decision for Brian — not an implementation change.
 */
export function adminMayReadProtectedContent(): false {
  return false;
}

/**
 * Whether an actor may act on the administrative audit stream. Reading the
 * audit log is an administrative capability; its *contents* are allowlisted
 * metadata by construction (M0 §5), never private task content.
 */
export function canReadAdminAudit(actor: Actor): boolean {
  return isAdmin(actor);
}

/**
 * A non-admin, still-eligible actor performing an ordinary action. Exposed so
 * route/service code can distinguish "denied because not an admin" from
 * "denied because the account is disabled" when choosing a status code, without
 * re-deriving eligibility.
 */
export function isEligibleNonAdmin(actor: Actor): boolean {
  return isEligible(actor) && !isAdmin(actor);
}
