import { describe, expect, it } from 'vitest';

import { actorFromUser, type Actor } from '../../src/server/policy';
import { AccountService } from '../../src/server/services/account-service';
import { AdminRecoveryService } from '../../src/server/services/admin-recovery-service';
import type { ServiceDeps } from '../../src/server/services/service-context';
import { SheetService } from '../../src/server/services/sheet-service';
import { TaskService } from '../../src/server/services/task-service';
import type { SheetRecord, UserRecord } from '../../src/shared/domain/records';
import {
  auditEvents,
  db,
  makeSheet,
  makeTask,
  makeUser,
  memberships,
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
