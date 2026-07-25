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
    const moved = await buildServices().tasks.move(s.actors.editor, task.id, destination.id);
    expect(moved.sheetId).toBe(destination.id);
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
    await expectStatus(buildServices().tasks.move(s.actors.editor, task.id, destination.id), 403);
  });

  it('denies a move into a List the actor cannot see at all, as 404', async () => {
    const s = await scenario();
    const foreign = await makeSheet(s.stranger.id);
    const task = await makeTask(s.sheet.id);

    await expectStatus(buildServices().tasks.move(s.actors.editor, task.id, foreign.id), 404);
  });

  it('leaves the task in place when the move is denied', async () => {
    const s = await scenario();
    const foreign = await makeSheet(s.stranger.id);
    const task = await makeTask(s.sheet.id);

    await expectStatus(buildServices().tasks.move(s.actors.editor, task.id, foreign.id), 404);

    const after = await tasks().findById(task.id);
    expect(after?.sheetId).toBe(s.sheet.id);
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
