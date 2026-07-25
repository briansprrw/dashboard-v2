import { describe, expect, it } from 'vitest';

import type { Actor, SheetAccessContext } from '../../src/server/policy';
import {
  adminMayReadProtectedContent,
  canAdministerAccounts,
  canManageMembership,
  canManageSheetLifecycle,
  canMoveTask,
  canPerformOpaqueRecovery,
  canReadSheet,
  canReadTask,
  canReadTaskHistoryValues,
  canReadTaskNotes,
  canRestoreOrPurgeTask,
  canTransferOwnership,
  canWriteTask,
  canWriteTasks,
  resolveAccessLevel,
  visibleTasksFor,
} from '../../src/server/policy';
import type { TaskRecord } from '../../src/shared/domain/records';

// The machine-readable authorization matrix required as M2 evidence (M2-E2).
//
// This file is a direct transcription of the M0.3 Launch Contract §2
// role/action/visibility table. Each capability is asserted for *every* role
// column, so a permission that is accidentally widened fails a test that names
// the role it was widened to — rather than merely failing to fail.
//
// The roles are exactly the contract's columns. "Anonymous" is absent by
// construction: policy functions require an `Actor`, and an unauthenticated
// request never produces one (that path is asserted in the contract tests as a
// 401 instead).

const OWNER_ID = 'user-owner';
const SHEET: SheetAccessContext = { ownerUserId: OWNER_ID, membershipRole: null };

const actors = {
  viewer: { userId: 'user-viewer', globalRole: 'user', state: 'active' },
  editor: { userId: 'user-editor', globalRole: 'user', state: 'active' },
  owner: { userId: OWNER_ID, globalRole: 'user', state: 'active' },
  admin: { userId: 'user-admin', globalRole: 'admin', state: 'active' },
  stranger: { userId: 'user-stranger', globalRole: 'user', state: 'active' },
  disabled: { userId: 'user-disabled', globalRole: 'user', state: 'disabled' },
  recycled: { userId: 'user-recycled', globalRole: 'user', state: 'recycled' },
  disabledAdmin: { userId: 'user-disabled-admin', globalRole: 'admin', state: 'disabled' },
  disabledOwner: { userId: OWNER_ID, globalRole: 'user', state: 'disabled' },
} as const satisfies Record<string, Actor>;

type RoleName = keyof typeof actors;

/** The List context each role sees: membership roles differ per actor. */
function contextFor(role: RoleName): SheetAccessContext {
  switch (role) {
    case 'viewer':
      return { ownerUserId: OWNER_ID, membershipRole: 'viewer' };
    case 'editor':
      return { ownerUserId: OWNER_ID, membershipRole: 'editor' };
    default:
      return SHEET;
  }
}

function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task-1',
    sheetId: 'sheet-1',
    name: 'Synthetic task',
    status: 'not_started',
    priority: 'medium',
    dueDate: null,
    notes: 'Synthetic note',
    isPrivate: false,
    notesPrivate: false,
    emojiFlagsJson: null,
    sortKey: 1000,
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: 0,
    updatedAt: 0,
    closedAt: null,
    recycledAt: null,
    legacySourceId: null,
    ...overrides,
  };
}

/**
 * Expected outcomes per capability, transcribed from Launch Contract §2.
 * `true` = the contract's ✔, `false` = the contract's "—".
 */
const MATRIX: Record<
  string,
  { check: (actor: Actor, ctx: SheetAccessContext) => boolean; expected: Record<RoleName, boolean> }
> = {
  'Read List + non-private tasks': {
    check: canReadSheet,
    expected: {
      viewer: true,
      editor: true,
      owner: true,
      admin: true,
      stranger: false,
      disabled: false,
      recycled: false,
      disabledAdmin: false,
      disabledOwner: false,
    },
  },
  'Create / edit task': {
    check: canWriteTasks,
    expected: {
      viewer: false,
      editor: true,
      owner: true,
      admin: true,
      stranger: false,
      disabled: false,
      recycled: false,
      disabledAdmin: false,
      disabledOwner: false,
    },
  },
  'Restore / permanently delete a recycled task': {
    check: canRestoreOrPurgeTask,
    expected: {
      viewer: false,
      editor: false,
      owner: true,
      admin: true,
      stranger: false,
      disabled: false,
      recycled: false,
      disabledAdmin: false,
      disabledOwner: false,
    },
  },
  'Manage List membership / roles': {
    check: canManageMembership,
    expected: {
      viewer: false,
      editor: false,
      owner: true,
      admin: true,
      stranger: false,
      disabled: false,
      recycled: false,
      disabledAdmin: false,
      disabledOwner: false,
    },
  },
  'Transfer ownership': {
    check: canTransferOwnership,
    expected: {
      viewer: false,
      editor: false,
      owner: true,
      admin: true,
      stranger: false,
      disabled: false,
      recycled: false,
      disabledAdmin: false,
      disabledOwner: false,
    },
  },
  'Recycle / restore / permanently delete a List': {
    check: canManageSheetLifecycle,
    expected: {
      viewer: false,
      editor: false,
      owner: true,
      admin: true,
      stranger: false,
      disabled: false,
      recycled: false,
      disabledAdmin: false,
      disabledOwner: false,
    },
  },
  'View task-history field values': {
    check: canReadTaskHistoryValues,
    expected: {
      viewer: false,
      editor: false,
      owner: true,
      // The contract denies Admin history field values explicitly (M0 §5).
      admin: false,
      stranger: false,
      disabled: false,
      recycled: false,
      disabledAdmin: false,
      disabledOwner: false,
    },
  },
  'Read private task': {
    check: (actor, ctx) => canReadTask(actor, ctx, task({ isPrivate: true })),
    expected: {
      viewer: false,
      editor: false,
      owner: true,
      admin: false,
      stranger: false,
      disabled: false,
      recycled: false,
      disabledAdmin: false,
      disabledOwner: false,
    },
  },
  'Read private note (task otherwise visible)': {
    check: (actor, ctx) => canReadTaskNotes(actor, ctx, task({ notesPrivate: true })),
    expected: {
      viewer: false,
      editor: false,
      owner: true,
      admin: false,
      stranger: false,
      disabled: false,
      recycled: false,
      disabledAdmin: false,
      disabledOwner: false,
    },
  },
  'Read ordinary task notes': {
    check: (actor, ctx) => canReadTaskNotes(actor, ctx, task()),
    expected: {
      viewer: true,
      editor: true,
      owner: true,
      admin: true,
      stranger: false,
      disabled: false,
      recycled: false,
      disabledAdmin: false,
      disabledOwner: false,
    },
  },
};

describe('Launch Contract §2 role/action/visibility matrix', () => {
  for (const [capability, { check, expected }] of Object.entries(MATRIX)) {
    describe(capability, () => {
      for (const [role, allowed] of Object.entries(expected) as [RoleName, boolean][]) {
        it(`${allowed ? 'allows' : 'denies'} ${role}`, () => {
          expect(check(actors[role], contextFor(role))).toBe(allowed);
        });
      }
    });
  }
});

describe('administrative authority is separate from content visibility', () => {
  it('grants Admin account administration', () => {
    expect(canAdministerAccounts(actors.admin)).toBe(true);
  });

  it('grants Admin opaque recovery', () => {
    expect(canPerformOpaqueRecovery(actors.admin)).toBe(true);
  });

  it('never grants Admin a protected-content read', () => {
    expect(adminMayReadProtectedContent()).toBe(false);
  });

  it('denies account administration to a non-admin', () => {
    expect(canAdministerAccounts(actors.owner)).toBe(false);
    expect(canPerformOpaqueRecovery(actors.editor)).toBe(false);
  });

  it('denies account administration to a disabled admin', () => {
    expect(canAdministerAccounts(actors.disabledAdmin)).toBe(false);
    expect(canPerformOpaqueRecovery(actors.disabledAdmin)).toBe(false);
  });
});

describe('ineligible accounts lose every right', () => {
  // Asserted as a sweep rather than per-capability so a capability added later
  // without an eligibility check is caught here even if its own matrix row is
  // forgotten.
  const capabilities = [
    canReadSheet,
    canWriteTasks,
    canRestoreOrPurgeTask,
    canManageMembership,
    canTransferOwnership,
    canManageSheetLifecycle,
    canReadTaskHistoryValues,
  ];

  for (const role of ['disabled', 'recycled', 'disabledAdmin', 'disabledOwner'] as const) {
    it(`denies every capability to ${role}`, () => {
      for (const capability of capabilities) {
        expect(capability(actors[role], contextFor(role))).toBe(false);
      }
    });
  }

  it('resolves an ineligible owner to no access at all', () => {
    expect(resolveAccessLevel(actors.disabledOwner, SHEET)).toBe('none');
  });
});

describe('task move requires rights on both Lists', () => {
  const source: SheetAccessContext = { ownerUserId: OWNER_ID, membershipRole: 'editor' };
  const writableDestination: SheetAccessContext = {
    ownerUserId: 'other-owner',
    membershipRole: 'editor',
  };
  const readOnlyDestination: SheetAccessContext = {
    ownerUserId: 'other-owner',
    membershipRole: 'viewer',
  };
  const unreachableDestination: SheetAccessContext = {
    ownerUserId: 'other-owner',
    membershipRole: null,
  };

  it('allows a move when the editor may write to both', () => {
    expect(canMoveTask(actors.editor, source, writableDestination)).toBe(true);
  });

  it('denies a move when the destination is read-only', () => {
    expect(canMoveTask(actors.editor, source, readOnlyDestination)).toBe(false);
  });

  it('denies a move when the destination is unreachable', () => {
    expect(canMoveTask(actors.editor, source, unreachableDestination)).toBe(false);
  });

  it('denies a move when the source is read-only even if the destination is writable', () => {
    const readOnlySource: SheetAccessContext = { ownerUserId: OWNER_ID, membershipRole: 'viewer' };
    expect(canMoveTask(actors.editor, readOnlySource, writableDestination)).toBe(false);
  });
});

describe('private task write access', () => {
  const privateTask = task({ isPrivate: true });

  it('allows the List owner to write a private task', () => {
    expect(canWriteTask(actors.owner, SHEET, privateTask)).toBe(true);
  });

  it('denies an editor writing a private task they cannot see', () => {
    expect(canWriteTask(actors.editor, contextFor('editor'), privateTask)).toBe(false);
  });

  it('denies an admin writing a private task', () => {
    expect(canWriteTask(actors.admin, SHEET, privateTask)).toBe(false);
  });

  it('still allows an editor to write an ordinary task', () => {
    expect(canWriteTask(actors.editor, contextFor('editor'), task())).toBe(true);
  });
});

describe('visibleTasksFor', () => {
  const tasks = [task({ id: 'public-1' }), task({ id: 'private-1', isPrivate: true })];

  it('gives the owner every task', () => {
    expect(visibleTasksFor(actors.owner, SHEET, tasks).map((t) => t.id)).toEqual([
      'public-1',
      'private-1',
    ]);
  });

  it('hides private tasks from an editor', () => {
    expect(visibleTasksFor(actors.editor, contextFor('editor'), tasks).map((t) => t.id)).toEqual([
      'public-1',
    ]);
  });

  it('hides private tasks from an admin', () => {
    expect(visibleTasksFor(actors.admin, SHEET, tasks).map((t) => t.id)).toEqual(['public-1']);
  });

  it('gives a disabled owner nothing', () => {
    expect(visibleTasksFor(actors.disabledOwner, SHEET, tasks)).toEqual([]);
  });
});
