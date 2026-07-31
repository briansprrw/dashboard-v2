import { describe, expect, it } from 'vitest';

import { actorFromUser } from '../../src/server/policy';
import { AdminRecoveryService } from '../../src/server/services/admin-recovery-service';
import type { ServiceDeps } from '../../src/server/services/service-context';
import { SheetService } from '../../src/server/services/sheet-service';
import { TaskService } from '../../src/server/services/task-service';
import {
  toSheetRecoveryDto,
  toTaskEventMetadataDto,
  toTaskRecoveryDto,
} from '../../src/shared/contracts/dto';
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

// The administrative boundary, proven end to end: an Admin can operate the
// recycle bin using opaque identifiers while receiving no task name, note,
// privacy flag, List name, or history value.
//
// M2.1 proved the *repository* projections cannot select protected columns.
// This file proves the layer above them — service plus DTO — does not
// reintroduce the content, and that the administrative path genuinely works
// (a boundary that denies everything would pass a leakage test while being
// useless).
//
// Synthetic markers are used rather than field-by-field assertions alone: a
// marker scan over the serialised response catches a leak through a field the
// test author did not think to name.

const NAME_MARKER = 'SYNTHETIC-NAME-e6f1a2';
const NOTE_MARKER = 'SYNTHETIC-NOTE-9c4d7b';
const SHEET_NAME_MARKER = 'SYNTHETIC-SHEET-3a8e5f';

function deps(): ServiceDeps {
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
    requestId: 'admin-recovery-test',
  };
}

async function setup() {
  const owner = await makeUser();
  const admin = await makeUser({ globalRole: 'admin' });
  const sheet = await makeSheet(owner.id, { displayName: SHEET_NAME_MARKER });

  const d = deps();
  const sheetService = new SheetService(d);
  const taskService = new TaskService(d, sheetService);
  const recovery = new AdminRecoveryService(d);

  const ownerActor = actorFromUser(owner);
  const adminActor = actorFromUser(admin);

  // A private task with private notes: the hardest case for the boundary.
  const task = await makeTask(sheet.id, {
    name: NAME_MARKER,
    notes: NOTE_MARKER,
    isPrivate: true,
    notesPrivate: true,
  });

  return { owner, admin, sheet, task, ownerActor, adminActor, taskService, recovery, sheetService };
}

describe('administrative recovery returns no protected content', () => {
  it('exposes only opaque lifecycle fields for a task', async () => {
    const { task, adminActor, recovery } = await setup();
    const view = await recovery.getTaskRecoveryState(adminActor, task.id);

    expect(Object.keys(view.task).sort()).toEqual(
      ['createdAt', 'id', 'recycledAt', 'sheetId', 'updatedAt'].sort()
    );
    expect(Object.hasOwn(view.task, 'name')).toBe(false);
    expect(Object.hasOwn(view.task, 'notes')).toBe(false);
    expect(Object.hasOwn(view.task, 'isPrivate')).toBe(false);
    expect(Object.hasOwn(view.task, 'notesPrivate')).toBe(false);
    expect(Object.hasOwn(view.task, 'status')).toBe(false);
    expect(Object.hasOwn(view.task, 'priority')).toBe(false);
    expect(Object.hasOwn(view.task, 'dueDate')).toBe(false);
  });

  it('carries no marker anywhere in the serialised recovery DTO', async () => {
    const { task, adminActor, recovery } = await setup();
    const view = await recovery.getTaskRecoveryState(adminActor, task.id);
    const dto = toTaskRecoveryDto(view);

    const serialized = JSON.stringify(dto);
    expect(serialized).not.toContain(NAME_MARKER);
    expect(serialized).not.toContain(NOTE_MARKER);
  });

  it('exposes only allowlisted history metadata, never changes', async () => {
    const { task, ownerActor, adminActor, recovery, taskService } = await setup();
    await taskService.recycle(ownerActor, task.id);

    const events = await recovery.listTaskHistoryMetadata(adminActor, task.id);
    expect(events.length).toBeGreaterThan(0);

    for (const event of events) {
      expect(Object.keys(event).sort()).toEqual(
        ['actorUserId', 'createdAt', 'eventType', 'id', 'taskId'].sort()
      );
      expect(Object.hasOwn(event, 'changesJson')).toBe(false);
    }

    const serialized = JSON.stringify(events.map(toTaskEventMetadataDto));
    expect(serialized).not.toContain(NAME_MARKER);
    expect(serialized).not.toContain(NOTE_MARKER);
  });

  it('omits the List display name from the sheet recovery view', async () => {
    const { sheet, adminActor, recovery } = await setup();
    const view = await recovery.getSheetRecoveryState(adminActor, sheet.id);

    expect(Object.keys(view).sort()).toEqual(['id', 'ownerUserId', 'recycledAt', 'state'].sort());
    expect(JSON.stringify(toSheetRecoveryDto(view))).not.toContain(SHEET_NAME_MARKER);
  });
});

describe('positive control: the boundary is a real distinction', () => {
  // Without these, every assertion above would also pass if the reads were
  // simply broken and returned nothing useful.
  it('gives the List owner the protected values the admin was denied', async () => {
    const { task, ownerActor, taskService } = await setup();
    const { task: full } = await taskService.getById(ownerActor, task.id);

    expect(full.name).toBe(NAME_MARKER);
    expect(full.notes).toBe(NOTE_MARKER);
    expect(full.isPrivate).toBe(true);
  });

  it('gives the List owner the full List name', async () => {
    const { sheet, ownerActor, sheetService } = await setup();
    const { sheet: full } = await sheetService.authorize(ownerActor, sheet.id);
    expect(full.displayName).toBe(SHEET_NAME_MARKER);
  });
});

describe('administrative recovery actually works on opaque identity', () => {
  it('restores a recycled private task by id alone', async () => {
    const { task, ownerActor, adminActor, recovery, taskService } = await setup();
    await taskService.recycle(ownerActor, task.id);

    const restored = await recovery.restoreTask(adminActor, task.id);
    expect(restored.task.recycledAt).toBeNull();

    // Confirmed independently through storage.
    const stored = await tasks().findById(task.id);
    expect(stored?.recycledAt).toBeNull();
  });

  // M2-FQA-05: the owner's own restore path appends a `restored` history
  // event; the opaque administrative path previously did not, leaving
  // owner-visible history incomplete for a task recovered this way even
  // though the task itself was genuinely restored.
  it('appends a restored history event on administrative restore, same as the owner path', async () => {
    const { task, ownerActor, adminActor, recovery, taskService } = await setup();
    await taskService.recycle(ownerActor, task.id);
    const countBeforeRestore = await taskEvents().countForTask(task.id);

    const restored = await recovery.restoreTask(adminActor, task.id);

    const events = await taskEvents().listForTask(task.id);
    expect(events).toHaveLength(countBeforeRestore + 1);
    expect(events.map((e) => e.eventType)).toContain('restored');
    // The opaque DTO's count must reflect the same events, and carry no content.
    expect(restored.historyEventCount).toBe(events.length);
  });

  it('purges a recycled private task by id alone, and its history with it', async () => {
    const { task, ownerActor, adminActor, recovery, taskService } = await setup();
    await taskService.recycle(ownerActor, task.id);

    expect(await taskEvents().countForTask(task.id)).toBeGreaterThan(0);

    await recovery.purgeTask(adminActor, task.id);

    expect(await tasks().findById(task.id)).toBeNull();
    expect(await taskEvents().countForTask(task.id)).toBe(0);
  });

  it('refuses to purge a task that is not in the recycle bin', async () => {
    const { task, adminActor, recovery } = await setup();
    await expect(recovery.purgeTask(adminActor, task.id)).rejects.toMatchObject({ status: 409 });
  });

  it('restores a recycled List by id alone', async () => {
    const { sheet, ownerActor, adminActor, recovery, sheetService } = await setup();
    await sheetService.recycle(ownerActor, sheet.id);

    const restored = await recovery.restoreSheet(adminActor, sheet.id);
    expect(restored.state).toBe('active');
  });
});

describe('the recovery surface is admin-only', () => {
  it.each([
    [
      'task recovery state',
      (r: AdminRecoveryService, actor: ReturnType<typeof actorFromUser>, id: string) =>
        r.getTaskRecoveryState(actor, id),
    ],
    [
      'task history metadata',
      (r: AdminRecoveryService, actor: ReturnType<typeof actorFromUser>, id: string) =>
        r.listTaskHistoryMetadata(actor, id),
    ],
    [
      'task restore',
      (r: AdminRecoveryService, actor: ReturnType<typeof actorFromUser>, id: string) =>
        r.restoreTask(actor, id),
    ],
    [
      'task purge',
      (r: AdminRecoveryService, actor: ReturnType<typeof actorFromUser>, id: string) =>
        r.purgeTask(actor, id),
    ],
  ])('denies %s to the List owner', async (_label, call) => {
    const { task, ownerActor, recovery } = await setup();
    await expect(call(recovery, ownerActor, task.id)).rejects.toMatchObject({ status: 403 });
  });

  it('denies the recovery surface to a disabled admin', async () => {
    const { task, admin, recovery } = await setup();
    await users().disable(admin.id, T0);
    const disabledAdmin = actorFromUser((await users().findById(admin.id))!);

    await expect(recovery.getTaskRecoveryState(disabledAdmin, task.id)).rejects.toMatchObject({
      status: 403,
    });
  });
});
