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
 * Whether a move would newly place the task under the actor's own ownership.
 *
 * Ownership is what grants protected-content visibility in this model: a
 * private task, a private note, and task-history field values are all readable
 * by "the List owner" and by nobody else. So relocating a task into a List the
 * actor owns is not a neutral filing operation — it hands the actor content
 * rights over that task that they did not have a moment earlier.
 */
export function moveAcquiresOwnership(
  actor: Actor,
  source: SheetAccessContext,
  destination: SheetAccessContext
): boolean {
  if (destination.ownerUserId !== actor.userId) return false;
  return source.ownerUserId !== actor.userId;
}

/**
 * Whether a move would change who owns the task's content rights at all —
 * acquisition (above) or the mirror case, the acting owner giving their own
 * task to someone else's List. Same underlying question as
 * `moveAcquiresOwnership`, asked without regard to which side the actor is on.
 */
export function moveChangesTaskOwner(
  source: SheetAccessContext,
  destination: SheetAccessContext
): boolean {
  return source.ownerUserId !== destination.ownerUserId;
}

/**
 * Whether the actor may relinquish their own task's ownership into someone
 * else's List, subject to explicit confirmation (see `canMoveTask`).
 */
export function moveRelinquishesOwnership(
  actor: Actor,
  source: SheetAccessContext,
  destination: SheetAccessContext
): boolean {
  if (source.ownerUserId !== actor.userId) return false;
  return destination.ownerUserId !== actor.userId;
}

/**
 * §2 "Move task (edit rights on **both** Lists)". Expressed as one function
 * taking both contexts so a caller physically cannot check only the source —
 * the confused-deputy shape this rule exists to prevent.
 *
 * The edit-rights rule alone is not sufficient, and M2.5's adversarial review
 * found why (M2-AR-01). Write access to a List you do not own — an Editor
 * share, or an Admin's blanket authority — combined with ownership of any List
 * of your own is enough to pull another person's task across the ownership
 * boundary and then read its private note and history values through the
 * *ordinary* owner surface. The administrative privacy barriers do not apply
 * on that path, because by then the actor genuinely is the owner.
 *
 * A later review (2026-07-26, Brian's explicit decision) found the same
 * boundary has a second gap and narrowed the rule further: an Editor with
 * write access to two Lists owned by two *different* other people could move
 * a task between them, even though the actor acquires nothing — content
 * simply crosses an ownership boundary neither List owner approved. So a
 * cross-owner move is refused unless the actor is the List owner giving away
 * their own task, and even that case requires the caller to have confirmed
 * the privacy consequence (`explicitConfirmation`) — see `moveTaskDecision`,
 * which is the function callers should actually use; this one answers only
 * "is this move ever possible", not "is it possible right now".
 */
export function canMoveTask(
  actor: Actor,
  source: SheetAccessContext,
  destination: SheetAccessContext
): boolean {
  if (!canWriteTasks(actor, source) || !canWriteTasks(actor, destination)) return false;
  if (!moveChangesTaskOwner(source, destination)) return true;
  return moveRelinquishesOwnership(actor, source, destination);
}

export type MoveTaskDecision =
  { kind: 'allowed' } | { kind: 'requiresConfirmation' } | { kind: 'denied' };

/**
 * The full move decision, including the confirmation gate `canMoveTask` alone
 * cannot express. Only the List owner relinquishing their own task needs
 * confirmation — acquiring ownership stays a hard `denied` with no
 * confirmation escape hatch, and a same-owner move needs neither.
 */
export function moveTaskDecision(
  actor: Actor,
  source: SheetAccessContext,
  destination: SheetAccessContext,
  explicitConfirmation: boolean
): MoveTaskDecision {
  if (!canMoveTask(actor, source, destination)) return { kind: 'denied' };
  if (!moveChangesTaskOwner(source, destination)) return { kind: 'allowed' };
  return explicitConfirmation ? { kind: 'allowed' } : { kind: 'requiresConfirmation' };
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

/**
 * Whether the actor may name `newOwnerUserId` as this List's owner.
 *
 * A second, narrower question than `canTransferOwnership`, which only asks
 * whether the actor may perform a transfer at all. The *destination* matters
 * independently, and M2.5's adversarial review found why: an Admin's authority
 * over ownership let them name themselves the new owner of any List, and
 * ownership is precisely what grants the private-task, private-note, and
 * history-value reads that M0-D16 and §2 deny them. Two ordinary API calls
 * turned administrative authority into the content read the three
 * administrative-surface barriers exist to prevent.
 *
 * An actor may therefore only name themselves if they already own the List
 * (where the transfer is a no-op the service rejects separately). Transferring
 * to anyone else — the actual recovery use, including reassigning a stranded
 * List — is untouched.
 */
export function canAssignOwnershipTo(
  actor: Actor,
  sheet: SheetAccessContext,
  newOwnerUserId: string
): boolean {
  if (!canTransferOwnership(actor, sheet)) return false;
  if (newOwnerUserId !== actor.userId) return true;
  return isOwner(actor, sheet);
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
