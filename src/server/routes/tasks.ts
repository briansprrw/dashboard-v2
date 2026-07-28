// Task routes.
//
// Note visibility is resolved through `canReadTaskNotes` on every response that
// carries a task, using the context the service already resolved. There is no
// path in this file that builds a task DTO without asking.

import { Hono } from 'hono';

import { toTaskDto, toTaskEventDto, toTaskMoveResultDto } from '../../shared/contracts/dto';
import { parseMoveTask, parseTaskFields } from '../../shared/contracts/requests';
import { requireId } from '../../shared/contracts/validation';
import { buildServices } from '../app-context';
import type { AppEnv } from '../env';
import { readJsonBody } from '../http/request-body';
import { canReadTask, canReadTaskNotes } from '../policy';

export const taskRoutes = new Hono<AppEnv>();

taskRoutes.get('/:taskId', async (c) => {
  const taskId = requireId(c.req.param('taskId'), 'taskId');
  const actor = c.get('actor');
  const services = buildServices(c.env, c.get('requestId'));

  const { task, context } = await services.tasks.getById(actor, taskId);
  return c.json({ task: toTaskDto(task, canReadTaskNotes(actor, context, task)) });
});

taskRoutes.put('/:taskId', async (c) => {
  const taskId = requireId(c.req.param('taskId'), 'taskId');
  const actor = c.get('actor');
  const body = parseTaskFields(await readJsonBody(c));
  const services = buildServices(c.env, c.get('requestId'));

  const task = await services.tasks.update(actor, taskId, body);
  const { context } = await services.tasks.getById(actor, taskId);
  return c.json({ task: toTaskDto(task, canReadTaskNotes(actor, context, task)) });
});

taskRoutes.post('/:taskId/move', async (c) => {
  const taskId = requireId(c.req.param('taskId'), 'taskId');
  const actor = c.get('actor');
  const body = parseMoveTask(await readJsonBody(c));
  const services = buildServices(c.env, c.get('requestId'));

  // Built from the destination context `move` already resolved, not a fresh
  // re-authorization: after a confirmed relinquishing move the mover may no
  // longer be able to read the task at all, which is the point of the
  // confirmation they just gave (M2-FQA-06). Re-authorizing here would turn
  // that expected, successful outcome into a false 404.
  const { task, context } = await services.tasks.move(
    actor,
    taskId,
    body.destinationSheetId,
    body.confirmed
  );

  // A confirmed relinquish can leave the actor unable to read the task at
  // its new location — exactly the outcome the confirmation warned about.
  // The full task DTO must not be returned to someone `canReadTask` denies
  // (M2-FQA-RR-03): an opaque acknowledgement carries no task field at all.
  if (!canReadTask(actor, context, task)) {
    return c.json({ result: toTaskMoveResultDto(task.id, task.sheetId) });
  }
  return c.json({ task: toTaskDto(task, canReadTaskNotes(actor, context, task)) });
});

taskRoutes.post('/:taskId/recycle', async (c) => {
  const taskId = requireId(c.req.param('taskId'), 'taskId');
  const services = buildServices(c.env, c.get('requestId'));
  await services.tasks.recycle(c.get('actor'), taskId);
  return c.json({ recycled: true });
});

taskRoutes.post('/:taskId/restore', async (c) => {
  const taskId = requireId(c.req.param('taskId'), 'taskId');
  const actor = c.get('actor');
  const services = buildServices(c.env, c.get('requestId'));

  const task = await services.tasks.restore(actor, taskId);
  const { context } = await services.tasks.getById(actor, taskId);
  return c.json({ task: toTaskDto(task, canReadTaskNotes(actor, context, task)) });
});

taskRoutes.delete('/:taskId', async (c) => {
  const taskId = requireId(c.req.param('taskId'), 'taskId');
  const services = buildServices(c.env, c.get('requestId'));
  await services.tasks.purge(c.get('actor'), taskId);
  return c.json({ purged: true });
});

/**
 * Full task history with before/after values — List-owner-only.
 *
 * An Admin calling this receives 403 from the service. Their allowlisted
 * metadata view is a different route on the admin surface entirely, which is
 * the distinction AC-M4 and M0 §5 require.
 */
taskRoutes.get('/:taskId/history', async (c) => {
  const taskId = requireId(c.req.param('taskId'), 'taskId');
  const services = buildServices(c.env, c.get('requestId'));
  const events = await services.tasks.listHistory(c.get('actor'), taskId);
  return c.json({ events: events.map(toTaskEventDto) });
});
