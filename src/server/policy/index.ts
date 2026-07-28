// Single entry point for authorization decisions. Services and routes import
// from here so every policy call is greppable at one path, and so no caller can
// quietly reimplement a rule that already exists in this directory.

export type { Actor } from './actor';
export { actorFromUser, isAdmin, isEligible } from './actor';

export type { MoveTaskDecision, SheetAccessContext } from './sheet-access';
export {
  canAssignOwnershipTo,
  canManageMembership,
  canManageSheetLifecycle,
  canMoveTask,
  canReadSheet,
  canRenameSheet,
  canRestoreOrPurgeTask,
  canTransferOwnership,
  canWriteTasks,
  isOwner,
  moveAcquiresOwnership,
  moveChangesTaskOwner,
  moveRelinquishesOwnership,
  moveTaskDecision,
  resolveAccessLevel,
} from './sheet-access';

export {
  canReadTask,
  canReadTaskHistoryValues,
  canReadTaskNotes,
  canWriteTask,
  canWriteTaskAsPrivate,
  canWriteTaskNotesAsPrivate,
  visibleTasksFor,
} from './content-visibility';

export {
  adminMayReadProtectedContent,
  canAdministerAccounts,
  canPerformOpaqueRecovery,
  canReadAdminAudit,
  isEligibleNonAdmin,
} from './admin-policy';

export { denyAsNotFound, denyForbidden, denyUnauthenticated } from './authorization-error';
