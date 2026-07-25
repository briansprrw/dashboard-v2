// How much authority an actor has over one List, and what that authority
// permits. Pure functions: no database, no clock, no request. Everything a
// decision depends on is an explicit argument, so a policy question always has
// the same answer for the same inputs and can be exhaustively tested.
//
// The source of truth for every rule here is the M0.3 Launch Contract §2
// role/action/visibility matrix. Where a rule below looks surprising, it is
// reproducing that table rather than applying general intuition about roles.

import type { MembershipRole, SheetAccessLevel } from '../../shared/domain/enums';
import type { Actor } from './actor';
import { isAdmin, isEligible } from './actor';

/**
 * The facts about a List that a decision needs. A caller loads these once and
 * passes them in; policy never reaches for them itself.
 *
 * `membershipRole` is the actor's viewer/editor row, or null when they hold
 * none. Owners never have a membership row (the schema's triggers refuse one),
 * so null here does not mean "no access".
 */
export interface SheetAccessContext {
  ownerUserId: string;
  membershipRole: MembershipRole | null;
}

/**
 * The actor's effective level on this List.
 *
 * Admin is deliberately *not* mapped to `owner`. Administrative authority is a
 * separate axis (see `admin-policy.ts`): folding it in here would silently give
 * admins the owner's content-visibility rights, which §2 denies. An admin with
 * no membership on a List resolves to `none`, and their administrative powers
 * are granted by the explicit capability functions instead.
 */
export function resolveAccessLevel(actor: Actor, sheet: SheetAccessContext): SheetAccessLevel {
  if (!isEligible(actor)) return 'none';
  if (sheet.ownerUserId === actor.userId) return 'owner';
  return sheet.membershipRole ?? 'none';
}

export function isOwner(actor: Actor, sheet: SheetAccessContext): boolean {
  return resolveAccessLevel(actor, sheet) === 'owner';
}

/** Viewer, Editor, Owner, or an eligible Admin: §2 "Read List + non-private tasks". */
export function canReadSheet(actor: Actor, sheet: SheetAccessContext): boolean {
  if (!isEligible(actor)) return false;
  if (isAdmin(actor)) return true;
  return resolveAccessLevel(actor, sheet) !== 'none';
}

/**
 * §2 "Create / edit task", "Recycle task": Editor, Owner, and Admin. Viewer is
 * denied every mutation, which is the single most-tested denial in this module.
 */
export function canWriteTasks(actor: Actor, sheet: SheetAccessContext): boolean {
  if (!isEligible(actor)) return false;
  if (isAdmin(actor)) return true;
  const level = resolveAccessLevel(actor, sheet);
  return level === 'editor' || level === 'owner';
}

/**
 * §2 "Move task (edit rights on **both** Lists)". Expressed as one function
 * taking both contexts so a caller physically cannot check only the source —
 * the confused-deputy shape this rule exists to prevent.
 */
export function canMoveTask(
  actor: Actor,
  source: SheetAccessContext,
  destination: SheetAccessContext
): boolean {
  return canWriteTasks(actor, source) && canWriteTasks(actor, destination);
}

/**
 * §2 "Restore / permanently delete an individual recycled task": Owner or
 * Admin only. Editors may recycle but may not undo it — the asymmetry is
 * deliberate in the approved lifecycle (M0 §4: "Editors may send a task to the
 * recycle bin"; the owner or an administrator restores or permanently deletes).
 */
export function canRestoreOrPurgeTask(actor: Actor, sheet: SheetAccessContext): boolean {
  if (!isEligible(actor)) return false;
  return isAdmin(actor) || isOwner(actor, sheet);
}

/** §2 "Manage List membership / roles" and "Transfer ownership": Owner or Admin. */
export function canManageMembership(actor: Actor, sheet: SheetAccessContext): boolean {
  if (!isEligible(actor)) return false;
  return isAdmin(actor) || isOwner(actor, sheet);
}

export function canTransferOwnership(actor: Actor, sheet: SheetAccessContext): boolean {
  return canManageMembership(actor, sheet);
}

/** §2 "Recycle / restore / permanently delete a List": Owner or Admin. */
export function canManageSheetLifecycle(actor: Actor, sheet: SheetAccessContext): boolean {
  if (!isEligible(actor)) return false;
  return isAdmin(actor) || isOwner(actor, sheet);
}

/** Renaming a List is a management action, not an ordinary task edit. */
export function canRenameSheet(actor: Actor, sheet: SheetAccessContext): boolean {
  return canManageSheetLifecycle(actor, sheet);
}
