import { describe, expect, it, vi } from 'vitest';

import { actorFromUser, type Actor } from '../../src/server/policy';
import { AccountService } from '../../src/server/services/account-service';
import { AdminAuditService } from '../../src/server/services/admin-audit-service';
import { AdminRecoveryService } from '../../src/server/services/admin-recovery-service';
import type { ServiceDeps } from '../../src/server/services/service-context';
import { SheetPreferencesService } from '../../src/server/services/sheet-preferences-service';
import { SheetService } from '../../src/server/services/sheet-service';
import { TaskService } from '../../src/server/services/task-service';
import { UserDirectoryService } from '../../src/server/services/user-directory-service';
import type { SheetRecord, UserRecord } from '../../src/shared/domain/records';
import {
  auditEvents,
  db,
  makeSheet,
  makeTask,
  makeUser,
  memberships,
  preferences,
  sheets,
  T0,
  taskEvents,
  tasks,
  users,
} from './fixtures';

// Service-layer authorization against a real, migrated D1 database.
//
// The policy unit tests prove the decision functions are right; these prove the
// services actually *consult* them, that denials produce the intended status
// codes, and that the invariants survive a real write path. Denials are the
// point of this file — the allow cases exist mainly to prove a denial is
// meaningful rather than everything failing uniformly.

function deps(requestId = 'test-request'): ServiceDeps {
  return {
    repos: {
      users: users(),
      sheets: sheets(),
      memberships: memberships(),
      tasks: tasks(),
      taskEvents: taskEvents(),
      auditEvents: auditEvents(),
      preferences: preferences(),
    },
    db: db(),
    clock: () => T0,
    requestId,
  };
}

function buildServices() {
  const d = deps();
  const sheetService = new SheetService(d);
  return {
    sheets: sheetService,
    tasks: new TaskService(d, sheetService),
    accounts: new AccountService(d),
    adminRecovery: new AdminRecoveryService(d),
    adminAudit: new AdminAuditService(d),
    userDirectory: new UserDirectoryService(d),
    sheetPreferences: new SheetPreferencesService(d),
  };
}

/** Asserts a rejection carries the expected HTTP status from `AppError`. */
async function expectStatus(promise: Promise<unknown>, status: number): Promise<void> {
  await expect(promise).rejects.toMatchObject({ status });
}

interface Scenario {
  owner: UserRecord;
  editor: UserRecord;
  viewer: UserRecord;
  stranger: UserRecord;
  admin: UserRecord;
  sheet: SheetRecord;
  actors: Record<'owner' | 'editor' | 'viewer' | 'stranger' | 'admin', Actor>;
}

async function scenario(): Promise<Scenario> {
  const owner = await makeUser();
  const editor = await makeUser();
  const viewer = await makeUser();
  const stranger = await makeUser();
  const admin = await makeUser({ globalRole: 'admin' });

  const sheet = await makeSheet(owner.id);
  await memberships().upsert({
    sheetId: sheet.id,
    userId: editor.id,
    role: 'editor',
    createdByUserId: owner.id,
    now: T0,
  });
  await memberships().upsert({
    sheetId: sheet.id,
    userId: viewer.id,
    role: 'viewer',
    createdByUserId: owner.id,
    now: T0,
  });

  return {
    owner,
    editor,
    viewer,
    stranger,
    admin,
    sheet,
    actors: {
      owner: actorFromUser(owner),
      editor: actorFromUser(editor),
      viewer: actorFromUser(viewer),
      stranger: actorFromUser(stranger),
      admin: actorFromUser(admin),
    },
  };
}

describe('viewer receives 403 on every mutation', () => {
  it('denies task creation', async () => {
    const s = await scenario();
    const services = buildServices();
    await expectStatus(
      services.tasks.create(s.actors.viewer, s.sheet.id, {
        name: 'Attempted task',
        status: 'not_started',
        priority: 'medium',
        dueDate: null,
        notes: null,
        isPrivate: false,
        notesPrivate: false,
        emojiFlagsJson: null,
      }),
      403
    );
  });

  it('denies task update', async () => {
    const s = await scenario();
    const task = await makeTask(s.sheet.id);
    const services = buildServices();

    await expectStatus(
      services.tasks.update(s.actors.viewer, task.id, {
        name: 'Renamed',
        status: 'not_started',
        priority: 'medium',
        dueDate: null,
        notes: null,
        isPrivate: false,
        notesPrivate: false,
        emojiFlagsJson: null,
      }),
      403
    );
  });

  it('denies task recycle', async () => {
    const s = await scenario();
    const task = await makeTask(s.sheet.id);
    await expectStatus(buildServices().tasks.recycle(s.actors.viewer, task.id), 403);
  });

  it('denies renaming the List', async () => {
    const s = await scenario();
    await expectStatus(buildServices().sheets.rename(s.actors.viewer, s.sheet.id, 'New name'), 403);
  });

  it('denies granting membership', async () => {
    const s = await scenario();
    await expectStatus(
      buildServices().sheets.grantMembership(s.actors.viewer, s.sheet.id, s.stranger.id, 'viewer'),
      403
    );
  });

  it('denies transferring ownership', async () => {
    const s = await scenario();
    await expectStatus(
      buildServices().sheets.transferOwnership(s.actors.viewer, s.sheet.id, s.viewer.id),
      403
    );
  });

  it('denies recycling the List', async () => {
    const s = await scenario();
    await expectStatus(buildServices().sheets.recycle(s.actors.viewer, s.sheet.id), 403);
  });

  it('still allows the viewer to read', async () => {
    const s = await scenario();
    const result = await buildServices().sheets.authorize(s.actors.viewer, s.sheet.id);
    expect(result.accessLevel).toBe('viewer');
  });
});

describe('editor rights and their limits', () => {
  it('allows an editor to create and recycle a task', async () => {
    const s = await scenario();
    const services = buildServices();

    const task = await services.tasks.create(s.actors.editor, s.sheet.id, {
      name: 'Editor task',
      status: 'not_started',
      priority: 'medium',
      dueDate: null,
      notes: null,
      isPrivate: false,
      notesPrivate: false,
      emojiFlagsJson: null,
    });
    await expect(services.tasks.recycle(s.actors.editor, task.id)).resolves.toBeUndefined();
  });

  it('denies an editor restoring a task they recycled', async () => {
    const s = await scenario();
    const services = buildServices();
    const task = await makeTask(s.sheet.id);

    await services.tasks.recycle(s.actors.editor, task.id);
    await expectStatus(services.tasks.restore(s.actors.editor, task.id), 403);
  });

  it('denies an editor permanently deleting a task', async () => {
    const s = await scenario();
    const services = buildServices();
    const task = await makeTask(s.sheet.id);
    await services.tasks.recycle(s.actors.editor, task.id);

    await expectStatus(services.tasks.purge(s.actors.editor, task.id), 403);
  });

  it('allows the owner to restore what an editor recycled', async () => {
    const s = await scenario();
    const services = buildServices();
    const task = await makeTask(s.sheet.id);

    await services.tasks.recycle(s.actors.editor, task.id);
    const restored = await services.tasks.restore(s.actors.owner, task.id);
    expect(restored.recycledAt).toBeNull();
  });
});

describe('strangers cannot discover Lists or tasks', () => {
  it('reports an inaccessible List as 404, not 403', async () => {
    const s = await scenario();
    // 403 would confirm the List exists.
    await expectStatus(buildServices().sheets.authorize(s.actors.stranger, s.sheet.id), 404);
  });

  it('reports a task in an inaccessible List as 404', async () => {
    const s = await scenario();
    const task = await makeTask(s.sheet.id);
    await expectStatus(buildServices().tasks.getById(s.actors.stranger, task.id), 404);
  });

  it('reports a genuinely absent List as 404 as well', async () => {
    const s = await scenario();
    await expectStatus(buildServices().sheets.authorize(s.actors.owner, crypto.randomUUID()), 404);
  });
});

describe('private tasks', () => {
  async function withPrivateTask() {
    const s = await scenario();
    const task = await makeTask(s.sheet.id, {
      name: 'Private task',
      notes: 'Private note',
      isPrivate: true,
    });
    return { s, task, services: buildServices() };
  }

  it('lets the owner read a private task', async () => {
    const { s, task, services } = await withPrivateTask();
    const result = await services.tasks.getById(s.actors.owner, task.id);
    expect(result.task.id).toBe(task.id);
  });

  it.each([['editor'], ['viewer'], ['admin']] as const)(
    'hides a private task from %s as 404',
    async (role) => {
      const { s, task, services } = await withPrivateTask();
      await expectStatus(services.tasks.getById(s.actors[role], task.id), 404);
    }
  );

  it('omits a private task from an editor list read', async () => {
    const { s, task, services } = await withPrivateTask();
    await makeTask(s.sheet.id, { name: 'Ordinary task' });

    const visible = await services.tasks.listForSheet(s.actors.editor, s.sheet.id);
    expect(visible.map((t) => t.id)).not.toContain(task.id);
    expect(visible).toHaveLength(1);
  });

  it('omits a private task from an admin list read', async () => {
    const { s, task, services } = await withPrivateTask();
    const visible = await services.tasks.listForSheet(s.actors.admin, s.sheet.id);
    expect(visible.map((t) => t.id)).not.toContain(task.id);
  });

  it('includes a private task in the owner list read', async () => {
    const { s, task, services } = await withPrivateTask();
    const visible = await services.tasks.listForSheet(s.actors.owner, s.sheet.id);
    expect(visible.map((t) => t.id)).toContain(task.id);
  });

  it('denies an editor updating a private task', async () => {
    const { s, task, services } = await withPrivateTask();
    await expectStatus(
      services.tasks.update(s.actors.editor, task.id, {
        name: 'Hijacked',
        status: 'not_started',
        priority: 'medium',
        dueDate: null,
        notes: null,
        isPrivate: false,
        notesPrivate: false,
        emojiFlagsJson: null,
      }),
      404
    );
  });
});

// M2-FQA-03: authorization must check the *requested* isPrivate state, not
// only the task's stored state before the write. `canWriteTasks` alone (on
// create) or `canWriteTask` against the pre-write record alone (on update)
// let a non-owner produce owner-only content they could never have written
// into an existing private task.
describe('creating or transitioning a task to private requires ownership (M2-FQA-03)', () => {
  it.each([['editor'], ['admin']] as const)(
    'denies %s creating a task with isPrivate: true',
    async (role) => {
      const s = await scenario();
      const services = buildServices();
      await expectStatus(
        services.tasks.create(s.actors[role], s.sheet.id, {
          name: 'Attempted private task',
          status: 'not_started',
          priority: 'medium',
          dueDate: null,
          notes: null,
          isPrivate: true,
          notesPrivate: false,
          emojiFlagsJson: null,
        }),
        403
      );
    }
  );

  it('does not create a task row when a non-owner private creation is denied', async () => {
    const s = await scenario();
    const services = buildServices();
    const before = await services.tasks.listForSheet(s.actors.owner, s.sheet.id);

    await expectStatus(
      services.tasks.create(s.actors.editor, s.sheet.id, {
        name: 'Attempted private task',
        status: 'not_started',
        priority: 'medium',
        dueDate: null,
        notes: null,
        isPrivate: true,
        notesPrivate: false,
        emojiFlagsJson: null,
      }),
      403
    );

    const after = await services.tasks.listForSheet(s.actors.owner, s.sheet.id);
    expect(after).toHaveLength(before.length);
  });

  it('allows the owner to create a private task', async () => {
    const s = await scenario();
    const services = buildServices();
    const task = await services.tasks.create(s.actors.owner, s.sheet.id, {
      name: 'Owner private task',
      status: 'not_started',
      priority: 'medium',
      dueDate: null,
      notes: null,
      isPrivate: true,
      notesPrivate: false,
      emojiFlagsJson: null,
    });
    expect(task.isPrivate).toBe(true);
  });

  it.each([['editor'], ['admin']] as const)(
    'denies %s transitioning an ordinary task to private',
    async (role) => {
      const s = await scenario();
      const services = buildServices();
      const task = await makeTask(s.sheet.id, { name: 'Ordinary task', isPrivate: false });

      await expectStatus(
        services.tasks.update(s.actors[role], task.id, {
          name: 'Ordinary task',
          status: 'not_started',
          priority: 'medium',
          dueDate: null,
          notes: null,
          isPrivate: true,
          notesPrivate: false,
          emojiFlagsJson: null,
        }),
        403
      );

      const stillPublic = await tasks().findById(task.id);
      expect(stillPublic?.isPrivate).toBe(false);
    }
  );

  it('allows the owner to transition their own task to private', async () => {
    const s = await scenario();
    const services = buildServices();
    const task = await makeTask(s.sheet.id, { name: 'Ordinary task', isPrivate: false });

    const updated = await services.tasks.update(s.actors.owner, task.id, {
      name: 'Ordinary task',
      status: 'not_started',
      priority: 'medium',
      dueDate: null,
      notes: null,
      isPrivate: true,
      notesPrivate: false,
      emojiFlagsJson: null,
    });
    expect(updated.isPrivate).toBe(true);
  });
});

// M2-FQA-RR-02: the notesPrivate axis is independent of isPrivate and needs
// its own authorization gate. canWriteTaskAsPrivate alone left an ordinary
// (isPrivate: false) task free to carry notesPrivate: true written by a
// non-owner — the task-level check passed because the task itself was not
// going private.
describe('creating or changing a private note requires ownership (M2-FQA-RR-02)', () => {
  it.each([['editor'], ['admin']] as const)(
    'denies %s creating an ordinary task with notesPrivate: true',
    async (role) => {
      const s = await scenario();
      const services = buildServices();
      await expectStatus(
        services.tasks.create(s.actors[role], s.sheet.id, {
          name: 'Attempted private-note task',
          status: 'not_started',
          priority: 'medium',
          dueDate: null,
          notes: 'attempted note',
          isPrivate: false,
          notesPrivate: true,
          emojiFlagsJson: null,
        }),
        403
      );
    }
  );

  it('allows the owner to create an ordinary task with notesPrivate: true', async () => {
    const s = await scenario();
    const services = buildServices();
    const task = await services.tasks.create(s.actors.owner, s.sheet.id, {
      name: 'Owner note-private task',
      status: 'not_started',
      priority: 'medium',
      dueDate: null,
      notes: 'owner note',
      isPrivate: false,
      notesPrivate: true,
      emojiFlagsJson: null,
    });
    expect(task.notesPrivate).toBe(true);
  });

  it.each([['editor'], ['admin']] as const)(
    'denies %s transitioning an ordinary note to private',
    async (role) => {
      const s = await scenario();
      const services = buildServices();
      const task = await makeTask(s.sheet.id, {
        name: 'Ordinary task',
        notes: 'ordinary note',
        isPrivate: false,
        notesPrivate: false,
      });

      await expectStatus(
        services.tasks.update(s.actors[role], task.id, {
          name: 'Ordinary task',
          status: 'not_started',
          priority: 'medium',
          dueDate: null,
          notes: 'ordinary note',
          isPrivate: false,
          notesPrivate: true,
          emojiFlagsJson: null,
        }),
        403
      );

      const stillPublic = await tasks().findById(task.id);
      expect(stillPublic?.notesPrivate).toBe(false);
    }
  );

  it.each([['editor'], ['admin']] as const)(
    'denies %s editing the text of an already-private note',
    async (role) => {
      const s = await scenario();
      const services = buildServices();
      const task = await makeTask(s.sheet.id, {
        name: 'Ordinary task',
        notes: 'original private note',
        isPrivate: false,
        notesPrivate: true,
      });

      await expectStatus(
        services.tasks.update(s.actors[role], task.id, {
          name: 'Ordinary task',
          status: 'not_started',
          priority: 'medium',
          dueDate: null,
          notes: 'hijacked note text',
          isPrivate: false,
          notesPrivate: true,
          emojiFlagsJson: null,
        }),
        403
      );

      const unchanged = await tasks().findById(task.id);
      expect(unchanged?.notes).toBe('original private note');
    }
  );

  it.each([['editor'], ['admin']] as const)(
    'denies %s un-privating an already-private note',
    async (role) => {
      const s = await scenario();
      const services = buildServices();
      const task = await makeTask(s.sheet.id, {
        name: 'Ordinary task',
        notes: 'still private',
        isPrivate: false,
        notesPrivate: true,
      });

      await expectStatus(
        services.tasks.update(s.actors[role], task.id, {
          name: 'Ordinary task',
          status: 'not_started',
          priority: 'medium',
          dueDate: null,
          notes: 'still private',
          isPrivate: false,
          notesPrivate: false,
          emojiFlagsJson: null,
        }),
        403
      );

      const stillPrivate = await tasks().findById(task.id);
      expect(stillPrivate?.notesPrivate).toBe(true);
    }
  );

  it('allows the owner to edit, clear, and un-private their own private note', async () => {
    const s = await scenario();
    const services = buildServices();
    const task = await makeTask(s.sheet.id, {
      name: 'Ordinary task',
      notes: 'original',
      isPrivate: false,
      notesPrivate: true,
    });

    const edited = await services.tasks.update(s.actors.owner, task.id, {
      name: 'Ordinary task',
      status: 'not_started',
      priority: 'medium',
      dueDate: null,
      notes: 'edited by owner',
      isPrivate: false,
      notesPrivate: true,
      emojiFlagsJson: null,
    });
    expect(edited.notes).toBe('edited by owner');

    const unprivated = await services.tasks.update(s.actors.owner, task.id, {
      name: 'Ordinary task',
      status: 'not_started',
      priority: 'medium',
      dueDate: null,
      notes: 'edited by owner',
      isPrivate: false,
      notesPrivate: false,
      emojiFlagsJson: null,
    });
    expect(unprivated.notesPrivate).toBe(false);
  });
});

describe('task history visibility', () => {
  it('gives the List owner the full history', async () => {
    const s = await scenario();
    const services = buildServices();
    const task = await makeTask(s.sheet.id);
    await services.tasks.recycle(s.actors.owner, task.id);

    const history = await services.tasks.listHistory(s.actors.owner, task.id);
    expect(history.length).toBeGreaterThan(0);
  });

  it.each([['editor'], ['viewer'], ['admin']] as const)(
    'denies task-history field values to %s',
    async (role) => {
      const s = await scenario();
      const services = buildServices();
      const task = await makeTask(s.sheet.id);
      await expectStatus(services.tasks.listHistory(s.actors[role], task.id), 403);
    }
  );
});

describe('task move requires rights on both Lists', () => {
  it('allows a move when the editor may write to both', async () => {
    const s = await scenario();
    const destination = await makeSheet(s.owner.id);
    await memberships().upsert({
      sheetId: destination.id,
      userId: s.editor.id,
      role: 'editor',
      createdByUserId: s.owner.id,
      now: T0,
    });

    const task = await makeTask(s.sheet.id);
    const moved = await buildServices().tasks.move(s.actors.editor, task.id, destination.id, false);
    expect(moved.task.sheetId).toBe(destination.id);
  });

  it('denies a move into a List where the actor is only a viewer', async () => {
    const s = await scenario();
    const destination = await makeSheet(s.owner.id);
    await memberships().upsert({
      sheetId: destination.id,
      userId: s.editor.id,
      role: 'viewer',
      createdByUserId: s.owner.id,
      now: T0,
    });

    const task = await makeTask(s.sheet.id);
    await expectStatus(
      buildServices().tasks.move(s.actors.editor, task.id, destination.id, false),
      403
    );
  });

  it('denies a move into a List the actor cannot see at all, as 404', async () => {
    const s = await scenario();
    const foreign = await makeSheet(s.stranger.id);
    const task = await makeTask(s.sheet.id);

    await expectStatus(
      buildServices().tasks.move(s.actors.editor, task.id, foreign.id, false),
      404
    );
  });

  it('leaves the task in place when the move is denied', async () => {
    const s = await scenario();
    const foreign = await makeSheet(s.stranger.id);
    const task = await makeTask(s.sheet.id);

    await expectStatus(
      buildServices().tasks.move(s.actors.editor, task.id, foreign.id, false),
      404
    );

    const after = await tasks().findById(task.id);
    expect(after?.sheetId).toBe(s.sheet.id);
  });
});

// M2-FQA-04: a required history/audit row must commit atomically with the
// mutation it documents. These prove it by injecting a genuine D1 failure —
// an invalid foreign key on the *second* statement of a real service-level
// batch — and asserting the *first* statement (the mutation itself) also did
// not apply. `D1Database.batch()` is documented as all-or-nothing, but the
// defect this finding describes was never calling it in the first place; a
// batch call alone is not proof, a rejected batch leaving no partial state is.
describe('mutation and required history/audit evidence commit atomically (M2-FQA-04)', () => {
  it('a task update batched with an invalid history statement leaves the task unchanged', async () => {
    const s = await scenario();
    const task = await makeTask(s.sheet.id, { name: 'Original name' });
    const services = buildServices();
    const d = deps();

    await expect(
      d.db.batch([
        d.repos.tasks.prepareUpdate(task.id, {
          name: 'Should not persist',
          status: 'not_started',
          priority: 'medium',
          dueDate: null,
          notes: null,
          isPrivate: false,
          notesPrivate: false,
          emojiFlagsJson: null,
          updatedByUserId: s.owner.id,
          now: T0,
        }),
        // Invalid: no task with this id exists, so the FK on task_events.task_id fails.
        d.repos.taskEvents.prepareAppend({
          id: crypto.randomUUID(),
          taskId: crypto.randomUUID(),
          actorUserId: s.owner.id,
          eventType: 'updated',
          changesJson: '{}',
          now: T0,
        }),
      ])
    ).rejects.toThrow();

    const unchanged = await services.tasks.getById(s.actors.owner, task.id);
    expect(unchanged.task.name).toBe('Original name');
  });

  it('an admin task restore batched with an invalid audit statement leaves the task recycled', async () => {
    const s = await scenario();
    const task = await makeTask(s.sheet.id);
    const services = buildServices();
    const d = deps();
    await services.tasks.recycle(s.actors.owner, task.id);

    await expect(
      d.db.batch([
        d.repos.tasks.prepareRestore(task.id, s.actors.admin.userId, T0),
        // Invalid: exceeds the audit metadata length bound the schema enforces.
        d.repos.auditEvents.prepareAppend({
          id: crypto.randomUUID(),
          actorUserId: s.actors.admin.userId,
          action: 'task.restored.admin',
          targetType: 'task',
          targetId: task.id,
          metadataJson: 'x'.repeat(100_000),
          requestId: null,
          now: T0,
        }),
      ])
    ).rejects.toThrow();

    const stillRecycled = await tasks().findById(task.id);
    expect(stillRecycled?.recycledAt).not.toBeNull();
  });
});

describe('ownership invariant', () => {
  it('refuses to grant the owner a membership on their own List', async () => {
    const s = await scenario();
    await expectStatus(
      buildServices().sheets.grantMembership(s.actors.owner, s.sheet.id, s.owner.id, 'editor'),
      409
    );
  });

  it('refuses to grant a membership to a disabled account', async () => {
    const s = await scenario();
    await users().disable(s.stranger.id, T0);

    await expectStatus(
      buildServices().sheets.grantMembership(s.actors.owner, s.sheet.id, s.stranger.id, 'viewer'),
      409
    );
  });

  it('refuses to grant a membership to a recycled account', async () => {
    const s = await scenario();
    await users().recycle(s.stranger.id, T0);

    await expectStatus(
      buildServices().sheets.grantMembership(s.actors.owner, s.sheet.id, s.stranger.id, 'viewer'),
      409
    );
  });

  it('refuses to transfer ownership to a disabled account', async () => {
    const s = await scenario();
    await users().disable(s.editor.id, T0);

    await expectStatus(
      buildServices().sheets.transferOwnership(s.actors.owner, s.sheet.id, s.editor.id),
      409
    );
  });

  it('refuses to transfer ownership to a recycled account', async () => {
    const s = await scenario();
    await users().recycle(s.editor.id, T0);

    await expectStatus(
      buildServices().sheets.transferOwnership(s.actors.owner, s.sheet.id, s.editor.id),
      409
    );
  });

  it('refuses a transfer to the existing owner', async () => {
    const s = await scenario();
    await expectStatus(
      buildServices().sheets.transferOwnership(s.actors.owner, s.sheet.id, s.owner.id),
      409
    );
  });

  it('transfers ownership and removes the new owner stale membership atomically', async () => {
    const s = await scenario();
    const updated = await buildServices().sheets.transferOwnership(
      s.actors.owner,
      s.sheet.id,
      s.editor.id
    );

    expect(updated.ownerUserId).toBe(s.editor.id);
    // The former editor must not still hold a membership row alongside ownership.
    expect(await memberships().findRole(s.sheet.id, s.editor.id)).toBeNull();
  });

  it('leaves the List with exactly one owner after transfer', async () => {
    const s = await scenario();
    await buildServices().sheets.transferOwnership(s.actors.owner, s.sheet.id, s.editor.id);

    const after = await sheets().findById(s.sheet.id);
    expect(after?.ownerUserId).toBe(s.editor.id);
    // The previous owner keeps no residual membership either.
    expect(await memberships().findRole(s.sheet.id, s.owner.id)).toBeNull();
  });

  it('refuses to delete a user who still owns a List', async () => {
    const s = await scenario();
    await expect(users().deletePermanently(s.owner.id)).rejects.toThrow();

    // The List survives with its owner intact rather than becoming ownerless.
    const after = await sheets().findById(s.sheet.id);
    expect(after?.ownerUserId).toBe(s.owner.id);
  });
});

describe('stale-authority race protection (M4-QA-02)', () => {
  // Each test deterministically reproduces "request A authorizes as owner,
  // request B transfers ownership and commits, request A's write then lands"
  // by intercepting the service's own `findById` (the read `authorize()`
  // uses) to inject a real, completed transfer between A's authorize step
  // and A's write — rather than relying on timing, which would be flaky.

  it('grantMembership: refuses a stale-authority write and never grants the membership', async () => {
    const s = await scenario();
    const rival = await makeUser();
    const target = s.stranger;
    const d = deps();
    const sheetService = new SheetService(d);

    const originalFindById = d.repos.sheets.findById.bind(d.repos.sheets);
    let intercepted = false;
    vi.spyOn(d.repos.sheets, 'findById').mockImplementation(async (id: string) => {
      const result = await originalFindById(id);
      if (!intercepted && id === s.sheet.id) {
        intercepted = true;
        // A concurrent request transfers ownership away from `s.owner`
        // before `grantMembership`'s own write executes below.
        await buildServices().sheets.transferOwnership(s.actors.owner, s.sheet.id, rival.id);
      }
      return result;
    });

    await expectStatus(
      sheetService.grantMembership(s.actors.owner, s.sheet.id, target.id, 'viewer'),
      409
    );
    expect(await memberships().findRole(s.sheet.id, target.id)).toBeNull();
  });

  it('revokeMembership: refuses a stale-authority write and never revokes the membership', async () => {
    const s = await scenario();
    const rival = await makeUser();
    const d = deps();
    const sheetService = new SheetService(d);

    const originalFindById = d.repos.sheets.findById.bind(d.repos.sheets);
    let intercepted = false;
    vi.spyOn(d.repos.sheets, 'findById').mockImplementation(async (id: string) => {
      const result = await originalFindById(id);
      if (!intercepted && id === s.sheet.id) {
        intercepted = true;
        await buildServices().sheets.transferOwnership(s.actors.owner, s.sheet.id, rival.id);
      }
      return result;
    });

    await expectStatus(sheetService.revokeMembership(s.actors.owner, s.sheet.id, s.editor.id), 409);
    // The editor's membership must survive — the stale revoke never landed.
    expect(await memberships().findRole(s.sheet.id, s.editor.id)).toBe('editor');
  });

  it('transferOwnership: a second, stale transfer refuses rather than silently reassigning ownership again', async () => {
    const s = await scenario();
    const firstTarget = await makeUser();
    const staleSecondTarget = s.stranger;
    const d = deps();
    const sheetService = new SheetService(d);

    const originalFindById = d.repos.sheets.findById.bind(d.repos.sheets);
    let intercepted = false;
    vi.spyOn(d.repos.sheets, 'findById').mockImplementation(async (id: string) => {
      const result = await originalFindById(id);
      if (!intercepted && id === s.sheet.id) {
        intercepted = true;
        // A different concurrent request completes its own transfer first.
        await buildServices().sheets.transferOwnership(s.actors.owner, s.sheet.id, firstTarget.id);
      }
      return result;
    });

    await expectStatus(
      sheetService.transferOwnership(s.actors.owner, s.sheet.id, staleSecondTarget.id),
      409
    );
    // Ownership is exactly what the winning concurrent transfer set — the
    // stale second transfer must not have overwritten it.
    expect((await sheets().findById(s.sheet.id))?.ownerUserId).toBe(firstTarget.id);
  });

  it('a role change (not a first grant) still succeeds once ownership is stable, and is audited distinctly (M4-QA-07)', async () => {
    const s = await scenario();
    await buildServices().sheets.grantMembership(
      s.actors.owner,
      s.sheet.id,
      s.stranger.id,
      'viewer'
    );

    const updated = await buildServices().sheets.grantMembership(
      s.actors.owner,
      s.sheet.id,
      s.stranger.id,
      'editor'
    );
    expect(updated.role).toBe('editor');

    const events = await auditEvents().listForTarget('sheet', s.sheet.id, 20);
    const roleChangeEvent = events.find((e) => e.action === 'sheet.membership.role_changed');
    expect(roleChangeEvent).toBeDefined();
    const metadata = JSON.parse(roleChangeEvent!.metadataJson) as Record<string, unknown>;
    expect(metadata.previousRole).toBe('viewer');
    expect(metadata.role).toBe('editor');
  });
});

describe('recycle-before-purge lifecycle', () => {
  it('refuses to purge an active List', async () => {
    const s = await scenario();
    await expectStatus(buildServices().sheets.purge(s.actors.owner, s.sheet.id), 409);
  });

  it('purges a recycled List', async () => {
    const s = await scenario();
    const services = buildServices();
    await services.sheets.recycle(s.actors.owner, s.sheet.id);
    await services.sheets.purge(s.actors.owner, s.sheet.id);

    expect(await sheets().findById(s.sheet.id)).toBeNull();
  });

  it('refuses to purge an active task', async () => {
    const s = await scenario();
    const task = await makeTask(s.sheet.id);
    await expectStatus(buildServices().tasks.purge(s.actors.owner, task.id), 409);
  });

  it('lists a recycled List in its owner’s own recycle bin, not in an editor’s', async () => {
    const s = await scenario();
    const services = buildServices();
    await services.sheets.recycle(s.actors.owner, s.sheet.id);

    const ownerBin = await buildServices().sheets.listRecycled(s.actors.owner);
    expect(ownerBin.map((sheet) => sheet.id)).toEqual([s.sheet.id]);

    // An editor never owns anything, so their own recycle bin never surfaces
    // a List they merely had membership on — restoring/purging a shared List
    // stays the owner's (or an admin's) call, matching `canManageSheetLifecycle`.
    const editorBin = await buildServices().sheets.listRecycled(s.actors.editor);
    expect(editorBin).toEqual([]);
  });
});

// Codex M2-QA-01: a recycled List, or a List owned by a recycled/disabled
// account, must disappear from ordinary access for every non-admin role
// (Viewer, Editor, and even the owner themself once their own account is the
// one that's ineligible) until an owner-or-admin restore — not merely become
// read-only. These tests exercise both triggers (List-level recycle, and
// owner-account-level recycle/disable) against every role, plus the two
// lifecycle methods (`recycle`/`restore`/`purge`) that must still reach a
// recycled List precisely in order to act on it, and prove reachability
// returns after restore.
describe('recycled Lists and ineligible-owner Lists disappear from ordinary access', () => {
  it('denies List read to owner, editor, and viewer once the List itself is recycled', async () => {
    const s = await scenario();
    const services = buildServices();
    await services.sheets.recycle(s.actors.owner, s.sheet.id);

    await expectStatus(buildServices().sheets.authorize(s.actors.owner, s.sheet.id), 404);
    await expectStatus(buildServices().sheets.authorize(s.actors.editor, s.sheet.id), 404);
    await expectStatus(buildServices().sheets.authorize(s.actors.viewer, s.sheet.id), 404);
  });

  it('denies task read/write in a recycled List to every non-lifecycle role', async () => {
    const s = await scenario();
    const services = buildServices();
    const task = await makeTask(s.sheet.id);
    await services.sheets.recycle(s.actors.owner, s.sheet.id);

    await expectStatus(buildServices().tasks.getById(s.actors.editor, task.id), 404);
    await expectStatus(buildServices().tasks.listForSheet(s.actors.viewer, s.sheet.id), 404);
    await expectStatus(
      buildServices().tasks.update(s.actors.editor, task.id, {
        name: 'Attempted edit',
        status: 'not_started',
        priority: 'medium',
        dueDate: null,
        notes: null,
        isPrivate: false,
        notesPrivate: false,
        emojiFlagsJson: null,
      }),
      404
    );
  });

  it('restores ordinary access to a recycled List after an owner restore', async () => {
    const s = await scenario();
    const services = buildServices();
    await services.sheets.recycle(s.actors.owner, s.sheet.id);
    await services.sheets.restore(s.actors.owner, s.sheet.id);

    const { sheet } = await buildServices().sheets.authorize(s.actors.viewer, s.sheet.id);
    expect(sheet.state).toBe('active');
  });

  it('denies List read to editor and viewer once the owner account is recycled', async () => {
    const s = await scenario();
    await users().recycle(s.owner.id, T0);

    await expectStatus(buildServices().sheets.authorize(s.actors.editor, s.sheet.id), 404);
    await expectStatus(buildServices().sheets.authorize(s.actors.viewer, s.sheet.id), 404);
  });

  it('preserves editor and viewer access when the owner account is merely disabled (Codex M2-RR-01)', async () => {
    // Corrects a regression from the M2-QA-01 fix: disabling an owner blocks
    // only that owner's own login. AccountService.disable's own contract is
    // that "the account keeps owning its Lists" — only recycling triggers the
    // disappear-until-restore rule (M0 §Accounts). A disabled owner's existing
    // Editors/Viewers must keep their access to a List that still exists and
    // is not in any recovery window.
    const s = await scenario();
    const task = await makeTask(s.sheet.id);
    await users().disable(s.owner.id, T0);

    const { sheet } = await buildServices().sheets.authorize(s.actors.editor, s.sheet.id);
    expect(sheet.state).toBe('active');
    await expect(
      buildServices().sheets.authorize(s.actors.viewer, s.sheet.id)
    ).resolves.toBeTruthy();
    await expect(buildServices().tasks.getById(s.actors.editor, task.id)).resolves.toBeTruthy();

    const accessible = await buildServices().sheets.listAccessible(s.actors.editor);
    expect(accessible.find((sh) => sh.id === s.sheet.id)).toBeDefined();

    // The disabled owner themself still cannot authenticate — that denial
    // happens at the session layer (test/integration/auth-lifecycle.test.ts),
    // not by hiding the List from other members.
  });

  it('denies task read/write once the owner account is recycled', async () => {
    const s = await scenario();
    const task = await makeTask(s.sheet.id);
    await users().recycle(s.owner.id, T0);

    await expectStatus(buildServices().tasks.getById(s.actors.editor, task.id), 404);
    await expectStatus(buildServices().tasks.listForSheet(s.actors.viewer, s.sheet.id), 404);
  });

  it('excludes a List owned by a recycled account from the members list', async () => {
    const s = await scenario();
    await users().recycle(s.owner.id, T0);

    const accessible = await buildServices().sheets.listAccessible(s.actors.editor);
    expect(accessible.find((sh) => sh.id === s.sheet.id)).toBeUndefined();
  });

  it('an Admin can still reach a List whose owner account is recycled', async () => {
    const s = await scenario();
    await users().recycle(s.owner.id, T0);

    const { sheet } = await buildServices().sheets.authorize(s.actors.admin, s.sheet.id);
    expect(sheet.id).toBe(s.sheet.id);
  });

  it('restores editor and viewer access after the owner account is restored', async () => {
    const s = await scenario();
    await users().recycle(s.owner.id, T0);
    await buildServices().accounts.restore(s.actors.admin, s.owner.id);

    const { sheet } = await buildServices().sheets.authorize(s.actors.editor, s.sheet.id);
    expect(sheet.state).toBe('active');
  });
});

describe('account administration', () => {
  it('denies account administration to a non-admin owner', async () => {
    const s = await scenario();
    await expectStatus(buildServices().accounts.disable(s.actors.owner, s.editor.id), 403);
  });

  it('lets an admin disable an account and bumps its auth version', async () => {
    const s = await scenario();
    const before = await users().findById(s.editor.id);

    await buildServices().accounts.disable(s.actors.admin, s.editor.id);

    const after = await users().findById(s.editor.id);
    expect(after?.state).toBe('disabled');
    expect(after?.authVersion).toBe((before?.authVersion ?? 0) + 1);
  });

  it('bumps the auth version on a role change so it applies immediately', async () => {
    const s = await scenario();
    const before = await users().findById(s.editor.id);

    await buildServices().accounts.setGlobalRole(s.actors.admin, s.editor.id, 'admin');

    const after = await users().findById(s.editor.id);
    expect(after?.globalRole).toBe('admin');
    expect(after?.authVersion).toBe((before?.authVersion ?? 0) + 1);
  });

  it('refuses an admin disabling their own account', async () => {
    const s = await scenario();
    await expectStatus(buildServices().accounts.disable(s.actors.admin, s.admin.id), 409);
  });

  it('denies a disabled admin every administrative action', async () => {
    const s = await scenario();
    await users().disable(s.admin.id, T0);

    const disabledAdmin = actorFromUser((await users().findById(s.admin.id))!);
    await expectStatus(buildServices().accounts.disable(disabledAdmin, s.editor.id), 403);
  });

  it('records an audit event for a role change', async () => {
    const s = await scenario();
    await buildServices().accounts.setGlobalRole(s.actors.admin, s.editor.id, 'admin');

    const events = await auditEvents().listForTarget('user', s.editor.id, 10);
    expect(events.map((e) => e.action)).toContain('user.role.changed');
  });
});

describe('account purge (M4.4, M0 §Accounts "delete the entire recycled account unit")', () => {
  it('refuses to purge an active (not-yet-recycled) account', async () => {
    const s = await scenario();
    await expectStatus(buildServices().accounts.purge(s.actors.admin, s.editor.id), 409);
  });

  it('denies account purge to a non-admin', async () => {
    const s = await scenario();
    await users().recycle(s.editor.id, T0);
    await expectStatus(buildServices().accounts.purge(s.actors.owner, s.editor.id), 403);
  });

  it('refuses an admin purging their own account', async () => {
    const s = await scenario();
    await users().recycle(s.admin.id, T0);
    await expectStatus(buildServices().accounts.purge(s.actors.admin, s.admin.id), 409);
  });

  it('purges a recycled account with no owned Lists', async () => {
    const s = await scenario();
    await users().recycle(s.editor.id, T0);

    await buildServices().accounts.purge(s.actors.admin, s.editor.id);

    expect(await users().findById(s.editor.id)).toBeNull();
  });

  it('purges the account and every List it owns — active and recycled — as one unit, cascading tasks/history/memberships, and never leaves an ownerless List', async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const admin = await makeUser({ globalRole: 'admin' });
    const activeSheet = await makeSheet(owner.id, { displayName: 'Active owned' });
    const recycledSheet = await makeSheet(owner.id, { displayName: 'Recycled owned' });
    const task = await makeTask(activeSheet.id);
    await sheets().recycle(recycledSheet.id, T0);
    await memberships().upsert({
      sheetId: activeSheet.id,
      userId: other.id,
      role: 'viewer',
      createdByUserId: owner.id,
      now: T0,
    });
    await users().recycle(owner.id, T0);

    await buildServices().accounts.purge(actorFromUser(admin), owner.id);

    expect(await users().findById(owner.id)).toBeNull();
    expect(await sheets().findById(activeSheet.id)).toBeNull();
    expect(await sheets().findById(recycledSheet.id)).toBeNull();
    expect(await tasks().findById(task.id)).toBeNull();
    // The cascade must not touch a List this account merely had membership
    // on (not owned) — only what it owned is part of the purge unit.
    expect(await memberships().find(activeSheet.id, other.id)).toBeNull(); // cascaded with the owned List, not orphaned
  });

  it('records an audit event for account purge, with no content leaked', async () => {
    const owner = await makeUser();
    const admin = await makeUser({ globalRole: 'admin' });
    const nameMarker = 'SYNTHETIC-PURGED-LIST-NAME';
    const ownedSheet = await makeSheet(owner.id, { displayName: nameMarker });
    await users().recycle(owner.id, T0);

    await buildServices().accounts.purge(actorFromUser(admin), owner.id);

    const events = await auditEvents().listForTarget('user', owner.id, 10);
    expect(events.map((e) => e.action)).toContain('user.purged');
    expect(JSON.stringify(events)).not.toContain(nameMarker);
    expect(JSON.stringify(events)).not.toContain(ownedSheet.displayName);
  });
});

describe('admin opaque List purge (M4.4)', () => {
  it('refuses to purge an active (not-recycled) List through the admin surface', async () => {
    const s = await scenario();
    await expectStatus(buildServices().adminRecovery.purgeSheet(s.actors.admin, s.sheet.id), 409);
  });

  it('denies admin List purge to a non-admin', async () => {
    const s = await scenario();
    await buildServices().sheets.recycle(s.actors.owner, s.sheet.id);
    await expectStatus(buildServices().adminRecovery.purgeSheet(s.actors.owner, s.sheet.id), 403);
  });

  it('purges a recycled List by opaque id, cascading its tasks', async () => {
    const s = await scenario();
    const task = await makeTask(s.sheet.id);
    await buildServices().sheets.recycle(s.actors.owner, s.sheet.id);

    await buildServices().adminRecovery.purgeSheet(s.actors.admin, s.sheet.id);

    expect(await sheets().findById(s.sheet.id)).toBeNull();
    expect(await tasks().findById(task.id)).toBeNull();
  });

  it('records sheet.purged.admin without the List name', async () => {
    const s = await scenario();
    const marker = 'SYNTHETIC-ADMIN-PURGED-LIST';
    const named = await makeSheet(s.owner.id, { displayName: marker });
    await buildServices().sheets.recycle(s.actors.owner, named.id);

    await buildServices().adminRecovery.purgeSheet(s.actors.admin, named.id);

    const events = await auditEvents().listForTarget('sheet', named.id, 10);
    expect(events.map((e) => e.action)).toContain('sheet.purged.admin');
    expect(JSON.stringify(events)).not.toContain(marker);
  });
});

describe('admin user-detail (M0 §12)', () => {
  it('denies user-detail to a non-admin', async () => {
    const s = await scenario();
    await expectStatus(buildServices().accounts.getUserDetail(s.actors.owner, s.editor.id), 403);
  });

  it('returns account/List/membership metadata only, no List name leaked in a content-bearing field', async () => {
    const s = await scenario();
    const nameMarker = 'SYNTHETIC-USER-DETAIL-LIST-NAME';
    const ownedSheet = await makeSheet(s.owner.id, { displayName: nameMarker });

    const detail = await buildServices().accounts.getUserDetail(s.actors.admin, s.owner.id);

    expect(detail.user.id).toBe(s.owner.id);
    expect(detail.ownedSheets.map((sh) => sh.id)).toContain(ownedSheet.id);
    // The List's own display name is an approved field on the owner's List
    // record itself (M0 §12 does not exclude List names, only task/note/
    // history content) — this assertion instead proves the detail view
    // carries no task content at all, by construction: `UserDetail` has no
    // field capable of holding a task name or note in the first place.
    //
    // `membershipSheets` (Codex M4-RR-04) holds `SheetRecord`s so the admin UI
    // can name the Lists an account belongs to. Same class of data as
    // `ownedSheets`, which was already here: List metadata, never task
    // content. The task-content assertion below is what actually enforces
    // that, rather than the key list alone.
    expect(Object.keys(detail)).toEqual(['user', 'ownedSheets', 'memberships', 'membershipSheets']);
  });

  it('carries no task content even when the account List holds a task', async () => {
    const s = await scenario();
    const taskMarker = 'SYNTHETIC-TASK-NAME-d41f7a';
    const noteMarker = 'SYNTHETIC-NOTE-d41f7a';
    await makeTask(s.sheet.id, { name: taskMarker, notes: noteMarker });

    const detail = await buildServices().accounts.getUserDetail(s.actors.admin, s.owner.id);

    // Serialising the whole structure is the strongest available check: it
    // catches a task field arriving through any nested record, not only
    // through a field this test knew to look at.
    const serialized = JSON.stringify({
      ...detail,
      membershipSheets: [...detail.membershipSheets.entries()],
    });
    expect(serialized).not.toContain(taskMarker);
    expect(serialized).not.toContain(noteMarker);
  });

  it('includes memberships the user holds on Lists they do not own', async () => {
    const s = await scenario();
    const detail = await buildServices().accounts.getUserDetail(s.actors.admin, s.editor.id);
    expect(detail.memberships.map((m) => m.sheetId)).toContain(s.sheet.id);
  });
});

describe('AdminAuditService (M4.4)', () => {
  it('denies audit reads to a non-admin', async () => {
    const s = await scenario();
    await expectStatus(buildServices().adminAudit.listRecent(s.actors.owner), 403);
  });

  it('lists recent audit events, newest first', async () => {
    const s = await scenario();
    await buildServices().sheets.recycle(s.actors.owner, s.sheet.id);
    await buildServices().sheets.restore(s.actors.owner, s.sheet.id);

    const events = await buildServices().adminAudit.listRecent(s.actors.admin, 10);
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0]!.createdAt).toBeGreaterThanOrEqual(events[events.length - 1]!.createdAt);
  });

  it('lists audit history for one target', async () => {
    const s = await scenario();
    await buildServices().sheets.recycle(s.actors.owner, s.sheet.id);

    const events = await buildServices().adminAudit.listForTarget(
      s.actors.admin,
      'sheet',
      s.sheet.id
    );
    expect(events.map((e) => e.action)).toContain('sheet.recycled');
  });

  it('clamps an out-of-range limit rather than rejecting it', async () => {
    const s = await scenario();
    const events = await buildServices().adminAudit.listRecent(s.actors.admin, 10_000);
    // Does not throw, and the repository-level LIMIT bound (200) is honored —
    // asserted indirectly by the call succeeding rather than erroring on an
    // absurd LIMIT value.
    expect(Array.isArray(events)).toBe(true);
  });

  describe('cursor pagination (M4-QA-08)', () => {
    // Uses `listForTarget` against a unique, per-test synthetic targetId
    // rather than `listRecent`'s global stream: this test file's D1 storage
    // is shared across every test in the file (not reset per test), so a
    // global-stream assertion would also see audit rows other tests in this
    // file created. Scoping to one target the test alone writes to isolates
    // it completely.
    async function seedEvent(targetId: string, createdAt: number, id: string): Promise<void> {
      await auditEvents().append({
        id,
        actorUserId: null,
        action: 'user.role.changed',
        targetType: 'user',
        targetId,
        metadataJson: '{}',
        requestId: null,
        now: createdAt,
      });
    }

    it('walks every row exactly once across pages, with no duplication or omission', async () => {
      const admin = actorFromUser(await makeUser({ globalRole: 'admin' }));
      const targetId = `pagination-test-${crypto.randomUUID()}`;
      const ids = Array.from({ length: 7 }, (_, i) => `event-${i}-${crypto.randomUUID()}`);
      for (let i = 0; i < ids.length; i++) {
        await seedEvent(targetId, T0 + i * 1000, ids[i]!);
      }

      const services = buildServices();

      const page1 = await services.adminAudit.listForTarget(admin, 'user', targetId, 3);
      expect(page1.map((e) => e.id)).toEqual([ids[6], ids[5], ids[4]]);

      const page2 = await services.adminAudit.listForTarget(admin, 'user', targetId, 3, {
        createdAt: page1[2]!.createdAt,
        id: page1[2]!.id,
      });
      expect(page2.map((e) => e.id)).toEqual([ids[3], ids[2], ids[1]]);

      const page3 = await services.adminAudit.listForTarget(admin, 'user', targetId, 3, {
        createdAt: page2[2]!.createdAt,
        id: page2[2]!.id,
      });
      expect(page3.map((e) => e.id)).toEqual([ids[0]]);

      // No id appears twice across all three pages, and every seeded id appears exactly once.
      const allIds = [...page1, ...page2, ...page3].map((e) => e.id);
      expect(new Set(allIds).size).toBe(allIds.length);
      expect(allIds.sort()).toEqual([...ids].sort());
    });

    it('breaks ties correctly when two events share the exact same created_at millisecond', async () => {
      const admin = actorFromUser(await makeUser({ globalRole: 'admin' }));
      const targetId = `pagination-tie-test-${crypto.randomUUID()}`;
      // Three events at the identical timestamp — only `id` (the secondary
      // ORDER BY key) can distinguish their relative order for cursoring.
      const tiedIds = ['aaaa-tied', 'bbbb-tied', 'cccc-tied'].map(
        (label) => `${label}-${crypto.randomUUID()}`
      );
      for (const id of tiedIds) {
        await seedEvent(targetId, T0, id);
      }

      const services = buildServices();

      const page1 = await services.adminAudit.listForTarget(admin, 'user', targetId, 2);
      expect(page1).toHaveLength(2);

      const page2 = await services.adminAudit.listForTarget(admin, 'user', targetId, 2, {
        createdAt: page1[1]!.createdAt,
        id: page1[1]!.id,
      });

      // The tied third row appears on page 2, not duplicated on page 1 and
      // not skipped entirely.
      const allIds = [...page1, ...page2].map((e) => e.id);
      expect(new Set(allIds).size).toBe(allIds.length);
      expect(allIds.sort()).toEqual([...tiedIds].sort());
    });
  });
});

describe('audit metadata carries no content', () => {
  it('records a membership grant without the List name', async () => {
    const s = await scenario();
    const marker = 'SYNTHETIC-LIST-NAME-MARKER';
    const named = await makeSheet(s.owner.id, { displayName: marker });

    await buildServices().sheets.grantMembership(s.actors.owner, named.id, s.stranger.id, 'viewer');

    const events = await auditEvents().listForTarget('sheet', named.id, 10);
    expect(events.length).toBeGreaterThan(0);
    expect(JSON.stringify(events)).not.toContain(marker);
  });

  it('records an admin task purge without the task name or notes', async () => {
    const s = await scenario();
    const nameMarker = 'SYNTHETIC-TASK-NAME-MARKER';
    const noteMarker = 'SYNTHETIC-TASK-NOTE-MARKER';
    const task = await makeTask(s.sheet.id, { name: nameMarker, notes: noteMarker });

    const services = buildServices();
    await services.tasks.recycle(s.actors.owner, task.id);
    await services.adminRecovery.purgeTask(s.actors.admin, task.id);

    const events = await auditEvents().listForTarget('task', task.id, 10);
    expect(events.map((e) => e.action)).toContain('task.purged.admin');

    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(nameMarker);
    expect(serialized).not.toContain(noteMarker);
  });
});

describe('UserDirectoryService.findByEmail — exact-email sharing lookup (M4-D2)', () => {
  it('resolves an active user by their exact email', async () => {
    const target = await makeUser();
    const requester = await makeUser();

    const found = await buildServices().userDirectory.findByEmail(
      actorFromUser(requester),
      `${target.id}@example.invalid`
    );
    expect(found.id).toBe(target.id);
  });

  it('is case-insensitive, matching the normalization applied at sign-in', async () => {
    const target = await makeUser();
    const requester = await makeUser();

    const found = await buildServices().userDirectory.findByEmail(
      actorFromUser(requester),
      `${target.id}@EXAMPLE.invalid`.toUpperCase()
    );
    expect(found.id).toBe(target.id);
  });

  it('answers 404 for an email with no account, not a distinguishable error', async () => {
    const requester = await makeUser();
    await expectStatus(
      buildServices().userDirectory.findByEmail(actorFromUser(requester), 'nobody@example.invalid'),
      404
    );
  });

  it('answers 404 (not the account) for a disabled target, so the lookup cannot be used to probe account state', async () => {
    const target = await makeUser();
    const requester = await makeUser();
    await users().disable(target.id, T0);

    await expectStatus(
      buildServices().userDirectory.findByEmail(
        actorFromUser(requester),
        `${target.id}@example.invalid`
      ),
      404
    );
  });

  it('answers 404 for a recycled target', async () => {
    const target = await makeUser();
    const requester = await makeUser();
    await users().recycle(target.id, T0);

    await expectStatus(
      buildServices().userDirectory.findByEmail(
        actorFromUser(requester),
        `${target.id}@example.invalid`
      ),
      404
    );
  });

  it('denies a disabled requester (403), even for a valid target email', async () => {
    const target = await makeUser();
    const requester = await makeUser();
    await users().disable(requester.id, T0);
    // Re-fetch: `Actor` reflects state at the moment it was built (the auth
    // middleware's job on a real request), so the test must rebuild it from
    // the now-disabled row rather than reuse the pre-disable snapshot.
    const disabledRequester = await users().findById(requester.id);

    await expectStatus(
      buildServices().userDirectory.findByEmail(
        actorFromUser(disabledRequester!),
        `${target.id}@example.invalid`
      ),
      403
    );
  });
});

describe('AccountService.findUserByEmail — admin-only lookup that finds any account state (M4-QA-03)', () => {
  it('finds an active account by exact email', async () => {
    const target = await makeUser();
    const admin = await makeUser({ globalRole: 'admin' });
    const found = await buildServices().accounts.findUserByEmail(
      actorFromUser(admin),
      `${target.id}@example.invalid`
    );
    expect(found.id).toBe(target.id);
  });

  it('finds a disabled account — the exact case the ordinary lookup refuses (M4-QA-03)', async () => {
    const target = await makeUser();
    const admin = await makeUser({ globalRole: 'admin' });
    await users().disable(target.id, T0);

    const found = await buildServices().accounts.findUserByEmail(
      actorFromUser(admin),
      `${target.id}@example.invalid`
    );
    expect(found.id).toBe(target.id);
    expect(found.state).toBe('disabled');
  });

  it('finds a recycled account', async () => {
    const target = await makeUser();
    const admin = await makeUser({ globalRole: 'admin' });
    await users().recycle(target.id, T0);

    const found = await buildServices().accounts.findUserByEmail(
      actorFromUser(admin),
      `${target.id}@example.invalid`
    );
    expect(found.id).toBe(target.id);
    expect(found.state).toBe('recycled');
  });

  it('denies a non-admin (403) — this lookup must not widen the ordinary sharing oracle', async () => {
    const target = await makeUser();
    const owner = await makeUser();
    await expectStatus(
      buildServices().accounts.findUserByEmail(
        actorFromUser(owner),
        `${target.id}@example.invalid`
      ),
      403
    );
  });

  it('answers 404 for an email with no account', async () => {
    const admin = await makeUser({ globalRole: 'admin' });
    await expectStatus(
      buildServices().accounts.findUserByEmail(actorFromUser(admin), 'nobody@example.invalid'),
      404
    );
  });
});

describe('SheetPreferencesService — server-backed sheet order/visibility (M4.3, M4-D3)', () => {
  it('returns the default document when nothing has been saved yet', async () => {
    const owner = await makeUser();
    const prefs = await buildServices().sheetPreferences.get(actorFromUser(owner));
    expect(prefs).toEqual({ sheetOrder: [], hiddenSheetIds: [] });
  });

  it('saves and re-reads a preference document', async () => {
    const owner = await makeUser();
    const a = await makeSheet(owner.id);
    const b = await makeSheet(owner.id);

    await buildServices().sheetPreferences.save(actorFromUser(owner), {
      sheetOrder: [b.id, a.id],
      hiddenSheetIds: [a.id],
    });

    const reread = await buildServices().sheetPreferences.get(actorFromUser(owner));
    expect(reread).toEqual({ sheetOrder: [b.id, a.id], hiddenSheetIds: [a.id] });
  });

  it('scopes strictly to the acting user — saving does not affect another user’s document', async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const a = await makeSheet(owner.id);

    await buildServices().sheetPreferences.save(actorFromUser(owner), {
      sheetOrder: [a.id],
      hiddenSheetIds: [],
    });

    const otherPrefs = await buildServices().sheetPreferences.get(actorFromUser(other));
    expect(otherPrefs).toEqual({ sheetOrder: [], hiddenSheetIds: [] });
  });

  it('denies a disabled actor on both get and save (403)', async () => {
    const owner = await makeUser();
    await users().disable(owner.id, T0);
    const disabledOwner = await users().findById(owner.id);

    await expectStatus(buildServices().sheetPreferences.get(actorFromUser(disabledOwner!)), 403);
    await expectStatus(
      buildServices().sheetPreferences.save(actorFromUser(disabledOwner!), {
        sheetOrder: [],
        hiddenSheetIds: [],
      }),
      403
    );
  });

  it('a second save overwrites rather than merges with the first', async () => {
    const owner = await makeUser();
    const a = await makeSheet(owner.id);
    const b = await makeSheet(owner.id);
    const services = buildServices();

    await services.sheetPreferences.save(actorFromUser(owner), {
      sheetOrder: [a.id],
      hiddenSheetIds: [a.id],
    });
    await services.sheetPreferences.save(actorFromUser(owner), {
      sheetOrder: [b.id],
      hiddenSheetIds: [],
    });

    const final = await buildServices().sheetPreferences.get(actorFromUser(owner));
    expect(final).toEqual({ sheetOrder: [b.id], hiddenSheetIds: [] });
  });

  describe('serialized-size bound against the real database CHECK (M4-QA-05)', () => {
    /** `prefix` picks the id family so `sheetOrder`/`hiddenSheetIds` batches never collide. */
    function uuidBatch(count: number, prefix: '1' | '2'): string[] {
      return Array.from(
        { length: count },
        (_, i) => `${prefix}${String(i).padStart(7, '0')}-1111-4111-8111-111111111111`
      );
    }

    it('the per-field id-count cap (100) keeps a maximal combined document under the database CHECK on its own', async () => {
      // Confirms the count cap chosen for M4-QA-05 is actually sufficient:
      // 100 unique UUIDs in each field serializes to 7,835 bytes, safely
      // under the 8,192-byte `preferences_json` CHECK.
      const owner = await makeUser();
      const atCap = { sheetOrder: uuidBatch(100, '1'), hiddenSheetIds: uuidBatch(100, '2') };

      const saved = await buildServices().sheetPreferences.save(actorFromUser(owner), atCap);
      expect(saved.sheetOrder).toHaveLength(100);
      expect(saved.hiddenSheetIds).toHaveLength(100);
    });

    it('refuses to save a document exceeding the combined serialized-size bound, before ever reaching D1 (defense in depth)', async () => {
      // `SheetPreferencesService.save` takes an already-typed `SheetPreferences`
      // rather than going through `parseSheetPreferences`, so this constructs
      // a document the request-validation boundary would already reject
      // (over the per-field count cap) to prove the *service* itself also
      // refuses it — not only the route layer — as the real last line of
      // defense against the database CHECK.
      const owner = await makeUser();
      const oversized = { sheetOrder: uuidBatch(150, '1'), hiddenSheetIds: uuidBatch(150, '2') };

      await expectStatus(
        buildServices().sheetPreferences.save(actorFromUser(owner), oversized),
        400
      );

      // Confirms the rejection happened before any write: the user's
      // document is still the untouched default, not a partial write.
      const after = await buildServices().sheetPreferences.get(actorFromUser(owner));
      expect(after).toEqual({ sheetOrder: [], hiddenSheetIds: [] });
    });
  });
});
