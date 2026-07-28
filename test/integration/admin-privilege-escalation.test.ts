import { describe, expect, it } from 'vitest';

import { actorFromUser } from '../../src/server/policy';
import { canReadTask, canReadTaskNotes } from '../../src/server/policy/content-visibility';
import { AccountService } from '../../src/server/services/account-service';
import { AdminRecoveryService } from '../../src/server/services/admin-recovery-service';
import type { ServiceDeps } from '../../src/server/services/service-context';
import { SheetService } from '../../src/server/services/sheet-service';
import { TaskService } from '../../src/server/services/task-service';
import { toTaskDto, toTaskMoveResultDto } from '../../src/shared/contracts/dto';
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

// M2.5 adversarial review: administrative authority must not become
// content visibility.
//
// M0-D16 and Launch Contract §2 deny an administrator every protected read —
// private tasks, private notes, and task-history field values. Three barriers
// enforce that on the *administrative* surface (allowlisted SQL projections,
// a literal-`false` policy function, structurally distinct recovery DTOs).
//
// None of the three applies once an administrator changes who the owner is.
// Content visibility is derived from `ownerUserId === actor.userId`, and an
// administrator may rewrite both sides of that comparison: `ownerUserId` via
// ownership transfer, and a task's containing List via move. Either one turns
// an admin into a legitimate owner, after which the *ordinary* owner surface
// hands over exactly the content the privacy boundary exists to withhold.
//
// These tests attack that path rather than the administrative surface, and
// assert the denials that keep the two axes separate.

function deps(requestId = 'escalation-test'): ServiceDeps {
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

/** A victim's List holding one task with a private note, plus an admin. */
async function scenario() {
  const victim = await makeUser();
  const admin = await makeUser({ globalRole: 'admin' });

  const victimSheet = await makeSheet(victim.id);
  const adminSheet = await makeSheet(admin.id);

  // A non-private task carrying a private note. Chosen deliberately: the task
  // itself is readable by an admin (§2 "Read List + non-private tasks"), so
  // every denial below is about the note alone and cannot be explained away by
  // the task being unreachable.
  const task = await makeTask(victimSheet.id, {
    name: 'Task with a private note',
    notes: 'PRIVATE-NOTE-MARKER',
    notesPrivate: true,
  });

  return {
    victim,
    admin,
    victimSheet,
    adminSheet,
    task,
    actors: { victim: actorFromUser(victim), admin: actorFromUser(admin) },
  };
}

describe('administrative authority does not become content visibility', () => {
  it('baseline: an admin cannot read a private note on a List they do not own', async () => {
    const s = await scenario();
    const services = buildServices();

    const { task, context } = await services.tasks.getById(s.actors.admin, s.task.id);
    expect(canReadTaskNotes(s.actors.admin, context, task)).toBe(false);
  });

  it('refuses an admin transferring a List they do not own to themselves', async () => {
    const s = await scenario();
    const services = buildServices();

    await expect(
      services.sheets.transferOwnership(s.actors.admin, s.victimSheet.id, s.admin.id)
    ).rejects.toMatchObject({ status: 403 });

    // The victim is still the owner, so nothing about the List changed.
    const after = await sheets().findById(s.victimSheet.id);
    expect(after?.ownerUserId).toBe(s.victim.id);
  });

  it('the private note stays unreadable after a refused self-transfer', async () => {
    const s = await scenario();
    const services = buildServices();

    await expect(
      services.sheets.transferOwnership(s.actors.admin, s.victimSheet.id, s.admin.id)
    ).rejects.toMatchObject({ status: 403 });

    const { task, context } = await services.tasks.getById(s.actors.admin, s.task.id);
    expect(canReadTaskNotes(s.actors.admin, context, task)).toBe(false);
    expect(context.ownerUserId).toBe(s.victim.id);
  });

  it('refuses an admin moving another owner task into a List the admin owns', async () => {
    const s = await scenario();
    const services = buildServices();

    await expect(
      services.tasks.move(s.actors.admin, s.task.id, s.adminSheet.id, false)
    ).rejects.toMatchObject({ status: 403 });

    const after = await tasks().findById(s.task.id);
    expect(after?.sheetId).toBe(s.victimSheet.id);
  });

  it('the private note stays unreadable after a refused move', async () => {
    const s = await scenario();
    const services = buildServices();

    await expect(
      services.tasks.move(s.actors.admin, s.task.id, s.adminSheet.id, false)
    ).rejects.toMatchObject({ status: 403 });

    const { task, context } = await services.tasks.getById(s.actors.admin, s.task.id);
    expect(canReadTaskNotes(s.actors.admin, context, task)).toBe(false);
  });

  it('refuses an admin transferring their own List to themselves is unaffected (409, not 403)', async () => {
    const s = await scenario();
    const services = buildServices();

    // An admin acting on a List they already own is an ordinary owner action;
    // it fails as ALREADY_OWNER, proving the new rule did not swallow the
    // pre-existing conflict check.
    await expect(
      services.sheets.transferOwnership(s.actors.admin, s.adminSheet.id, s.admin.id)
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('the same escalation is refused for an ordinary Editor', () => {
  // The move path is not admin-only. Any Editor on a List they do not own can
  // reach it, which is what makes this finding broader than an administrative
  // boundary defect: it is an ordinary-collaborator private-note disclosure.
  async function editorScenario() {
    const victim = await makeUser();
    const editor = await makeUser();
    const victimSheet = await makeSheet(victim.id);
    const editorSheet = await makeSheet(editor.id);

    await memberships().upsert({
      sheetId: victimSheet.id,
      userId: editor.id,
      role: 'editor',
      createdByUserId: victim.id,
      now: T0,
    });

    const task = await makeTask(victimSheet.id, {
      name: 'Task with a private note',
      notes: 'PRIVATE-NOTE-MARKER',
      notesPrivate: true,
    });

    return { victim, editor, victimSheet, editorSheet, task, actor: actorFromUser(editor) };
  }

  it('refuses an editor moving a shared task into their own List', async () => {
    const s = await editorScenario();
    const services = buildServices();

    await expect(
      services.tasks.move(s.actor, s.task.id, s.editorSheet.id, false)
    ).rejects.toMatchObject({
      status: 403,
    });

    const after = await tasks().findById(s.task.id);
    expect(after?.sheetId).toBe(s.victimSheet.id);
  });

  it('the private note stays unreadable to that editor', async () => {
    const s = await editorScenario();
    const services = buildServices();

    await expect(
      services.tasks.move(s.actor, s.task.id, s.editorSheet.id, false)
    ).rejects.toMatchObject({
      status: 403,
    });

    const { task, context } = await services.tasks.getById(s.actor, s.task.id);
    expect(canReadTaskNotes(s.actor, context, task)).toBe(false);
    expect(task.notes).toBe('PRIVATE-NOTE-MARKER');
  });

  it('a confirmed request does not let a non-owning editor bypass the ownership-acquisition block', async () => {
    const s = await editorScenario();
    const services = buildServices();

    // `confirmed: true` only ever unlocks the source-owner-relinquishing case.
    // An editor acquiring ownership is refused regardless of the flag.
    await expect(
      services.tasks.move(s.actor, s.task.id, s.editorSheet.id, true)
    ).rejects.toMatchObject({ status: 403 });

    const after = await tasks().findById(s.task.id);
    expect(after?.sheetId).toBe(s.victimSheet.id);
  });

  it('an editor may still move a task between two Lists owned by the sharer', async () => {
    const s = await editorScenario();
    const secondVictimSheet = await makeSheet(s.victim.id);
    await memberships().upsert({
      sheetId: secondVictimSheet.id,
      userId: s.editor.id,
      role: 'editor',
      createdByUserId: s.victim.id,
      now: T0,
    });
    const services = buildServices();

    const moved = await services.tasks.move(s.actor, s.task.id, secondVictimSheet.id, false);
    expect(moved.task.sheetId).toBe(secondVictimSheet.id);
  });

  it('refuses an editor moving a task between two Lists owned by two different other people', async () => {
    // The gap Brian's 2026-07-26 clarification closed: the mover acquires
    // nothing, but the task's content still crosses an ownership boundary
    // neither List owner approved, so this must be blocked, not merely
    // unconfirmed.
    const s = await editorScenario();
    const stranger = await makeUser();
    const strangerSheet = await makeSheet(stranger.id);
    await memberships().upsert({
      sheetId: strangerSheet.id,
      userId: s.editor.id,
      role: 'editor',
      createdByUserId: stranger.id,
      now: T0,
    });
    const services = buildServices();

    await expect(
      services.tasks.move(s.actor, s.task.id, strangerSheet.id, true)
    ).rejects.toMatchObject({ status: 403 });

    const after = await tasks().findById(s.task.id);
    expect(after?.sheetId).toBe(s.victimSheet.id);
  });

  it('an editor giving one of their own tasks away requires confirmation', async () => {
    const s = await editorScenario();
    const ownTask = await makeTask(s.editorSheet.id, { name: 'Editor own task' });
    const services = buildServices();

    await expect(
      services.tasks.move(s.actor, ownTask.id, s.victimSheet.id, false)
    ).rejects.toMatchObject({ status: 409, code: 'CONFIRMATION_REQUIRED' });

    const unmoved = await tasks().findById(ownTask.id);
    expect(unmoved?.sheetId).toBe(s.editorSheet.id);
  });

  it('an editor may still give one of their own tasks to a List they edit, once confirmed', async () => {
    const s = await editorScenario();
    const ownTask = await makeTask(s.editorSheet.id, { name: 'Editor own task' });
    const services = buildServices();

    const moved = await services.tasks.move(s.actor, ownTask.id, s.victimSheet.id, true);
    expect(moved.task.sheetId).toBe(s.victimSheet.id);
  });

  // M2-FQA-06: a confirmed relinquishing move of a *private* task must report
  // success, not a 404 produced by re-authorizing the moved task as the actor
  // who just gave up their read rights to it. The service's returned context
  // is the *destination* List's, which is exactly what the route builds the
  // response DTO from — this proves that context, not a fresh
  // re-authorization, is what a caller should use.
  it('a confirmed relinquish of a private task returns a usable result, not a 404', async () => {
    const s = await editorScenario();
    const ownPrivateTask = await makeTask(s.editorSheet.id, {
      name: 'Editor own private task',
      isPrivate: true,
    });
    const services = buildServices();

    const { task, context } = await services.tasks.move(
      s.actor,
      ownPrivateTask.id,
      s.victimSheet.id,
      true
    );
    expect(task.sheetId).toBe(s.victimSheet.id);
    // The mover no longer owns the destination List, so they may not read the
    // note — but building that answer must not throw or behave as "not found".
    expect(canReadTaskNotes(s.actor, context, task)).toBe(false);
  });

  // M2-FQA-RR-03: the M2-FQA-06 fix returned success, but `toTaskDto` always
  // emits the full task shape (name, status, priority, dates, privacy
  // flags), redacting only `notes`. For a private task the mover has just
  // relinquished, `canReadTask` denies them the task entirely — the route
  // must build an opaque result in that case, not a full DTO with only the
  // note text withheld.
  it('canReadTask denies the former owner the relinquished private task entirely', async () => {
    const s = await editorScenario();
    const ownPrivateTask = await makeTask(s.editorSheet.id, {
      name: 'SYNTHETIC-TASK-NAME-marker',
      isPrivate: true,
    });
    const services = buildServices();

    const { task, context } = await services.tasks.move(
      s.actor,
      ownPrivateTask.id,
      s.victimSheet.id,
      true
    );
    expect(canReadTask(s.actor, context, task)).toBe(false);
  });

  it('the route-equivalent opaque result carries no task field for a relinquished private task', async () => {
    const s = await editorScenario();
    const marker = 'SYNTHETIC-TASK-NAME-9f21ab';
    const ownPrivateTask = await makeTask(s.editorSheet.id, {
      name: marker,
      notes: 'SYNTHETIC-NOTE-9f21ab',
      isPrivate: true,
    });
    const services = buildServices();

    const { task, context } = await services.tasks.move(
      s.actor,
      ownPrivateTask.id,
      s.victimSheet.id,
      true
    );

    // Exactly the branch src/server/routes/tasks.ts takes.
    const response = canReadTask(s.actor, context, task)
      ? { task: toTaskDto(task, canReadTaskNotes(s.actor, context, task)) }
      : { result: toTaskMoveResultDto(task.id, task.sheetId) };

    expect(response).not.toHaveProperty('task');
    expect(response).toHaveProperty('result');
    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain(marker);
    expect(serialized).not.toContain('SYNTHETIC-NOTE-9f21ab');
    expect(
      (response as { result: { moved: true; taskId: string; destinationSheetId: string } }).result
        .destinationSheetId
    ).toBe(s.victimSheet.id);
  });

  it('a confirmed relinquish that stays readable to the actor still returns the full task DTO', async () => {
    // Positive control: the opaque branch is conditional on canReadTask, not
    // a blanket downgrade of every move response. `editorScenario`'s editor
    // already holds an editor membership on victimSheet (see its setup
    // above), so a non-private task relinquished into it stays readable to
    // them via that ordinary membership — the full DTO path must still fire.
    const s = await editorScenario();
    const ownTask = await makeTask(s.editorSheet.id, { name: 'Ordinary task to relinquish' });
    const services = buildServices();

    const { task, context } = await services.tasks.move(
      s.actor,
      ownTask.id,
      s.victimSheet.id,
      true
    );

    expect(canReadTask(s.actor, context, task)).toBe(true);
    const response = { task: toTaskDto(task, canReadTaskNotes(s.actor, context, task)) };
    expect(response.task.name).toBe('Ordinary task to relinquish');
  });
});

describe('legitimate administrative recovery still works', () => {
  it('an admin may transfer a List to a third active user', async () => {
    const s = await scenario();
    const successor = await makeUser();
    const services = buildServices();

    const updated = await services.sheets.transferOwnership(
      s.actors.admin,
      s.victimSheet.id,
      successor.id
    );

    expect(updated.ownerUserId).toBe(successor.id);
  });

  it('an owner may still move their own task between their own Lists', async () => {
    const s = await scenario();
    const second = await makeSheet(s.victim.id);
    const services = buildServices();

    const moved = await services.tasks.move(s.actors.victim, s.task.id, second.id, false);
    expect(moved.task.sheetId).toBe(second.id);
  });

  it('an admin may still move a task between two Lists owned by the same other user', async () => {
    const s = await scenario();
    const second = await makeSheet(s.victim.id);
    const services = buildServices();

    // The destination owner is unchanged, so no privacy boundary is crossed:
    // the admin gains nothing they did not already have.
    const moved = await services.tasks.move(s.actors.admin, s.task.id, second.id, false);
    expect(moved.task.sheetId).toBe(second.id);
  });

  it('an admin may still move a task between two Lists they personally own, no confirmation needed', async () => {
    const s = await scenario();
    const ownTask = await makeTask(s.adminSheet.id, { name: 'Admin own task' });
    const secondAdminSheet = await makeSheet(s.admin.id);
    const services = buildServices();

    // Same owner on both ends (the admin), so this never enters the
    // confirmation gate at all.
    const moved = await services.tasks.move(s.actors.admin, ownTask.id, secondAdminSheet.id, false);
    expect(moved.task.sheetId).toBe(secondAdminSheet.id);
  });
});
