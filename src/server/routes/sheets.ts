// List routes. Every handler is thin by design: validate, delegate to the
// service, map to a DTO. No handler makes an authorization decision — that is
// entirely the service's and policy's job (M2.2's "route handlers must not
// duplicate or bypass authorization policy").

import { Hono } from 'hono';

import {
  toAccessibleSheetDto,
  toMembershipDto,
  toSheetDto,
  toTaskDto,
} from '../../shared/contracts/dto';
import {
  parseCreateSheet,
  parseGrantMembership,
  parseRenameSheet,
  parseTaskFields,
  parseTransferOwnership,
} from '../../shared/contracts/requests';
import { requireId } from '../../shared/contracts/validation';
import { buildServices } from '../app-context';
import type { AppEnv } from '../env';
import { readJsonBody } from '../http/request-body';
import { canReadTaskNotes } from '../policy';

export const sheetRoutes = new Hono<AppEnv>();

sheetRoutes.get('/', async (c) => {
  const services = buildServices(c.env, c.get('requestId'));
  const sheets = await services.sheets.listAccessible(c.get('actor'));
  return c.json({ sheets: sheets.map(toAccessibleSheetDto) });
});

sheetRoutes.post('/', async (c) => {
  const body = parseCreateSheet(await readJsonBody(c));
  const services = buildServices(c.env, c.get('requestId'));
  const sheet = await services.sheets.create(c.get('actor'), body.displayName);
  return c.json({ sheet: toSheetDto(sheet) }, 201);
});

sheetRoutes.get('/:sheetId', async (c) => {
  const sheetId = requireId(c.req.param('sheetId'), 'sheetId');
  const services = buildServices(c.env, c.get('requestId'));
  const { sheet } = await services.sheets.authorize(c.get('actor'), sheetId);
  return c.json({ sheet: toSheetDto(sheet) });
});

sheetRoutes.patch('/:sheetId', async (c) => {
  const sheetId = requireId(c.req.param('sheetId'), 'sheetId');
  const body = parseRenameSheet(await readJsonBody(c));
  const services = buildServices(c.env, c.get('requestId'));
  const sheet = await services.sheets.rename(c.get('actor'), sheetId, body.displayName);
  return c.json({ sheet: toSheetDto(sheet) });
});

sheetRoutes.post('/:sheetId/recycle', async (c) => {
  const sheetId = requireId(c.req.param('sheetId'), 'sheetId');
  const services = buildServices(c.env, c.get('requestId'));
  await services.sheets.recycle(c.get('actor'), sheetId);
  return c.json({ recycled: true });
});

sheetRoutes.post('/:sheetId/restore', async (c) => {
  const sheetId = requireId(c.req.param('sheetId'), 'sheetId');
  const services = buildServices(c.env, c.get('requestId'));
  await services.sheets.restore(c.get('actor'), sheetId);
  return c.json({ restored: true });
});

sheetRoutes.delete('/:sheetId', async (c) => {
  const sheetId = requireId(c.req.param('sheetId'), 'sheetId');
  const services = buildServices(c.env, c.get('requestId'));
  await services.sheets.purge(c.get('actor'), sheetId);
  return c.json({ purged: true });
});

sheetRoutes.get('/:sheetId/members', async (c) => {
  const sheetId = requireId(c.req.param('sheetId'), 'sheetId');
  const services = buildServices(c.env, c.get('requestId'));
  const members = await services.sheets.listMembers(c.get('actor'), sheetId);
  return c.json({ members: members.map(toMembershipDto) });
});

sheetRoutes.post('/:sheetId/members', async (c) => {
  const sheetId = requireId(c.req.param('sheetId'), 'sheetId');
  const body = parseGrantMembership(await readJsonBody(c));
  const services = buildServices(c.env, c.get('requestId'));
  const membership = await services.sheets.grantMembership(
    c.get('actor'),
    sheetId,
    body.userId,
    body.role
  );
  return c.json({ membership: toMembershipDto(membership) }, 201);
});

sheetRoutes.delete('/:sheetId/members/:userId', async (c) => {
  const sheetId = requireId(c.req.param('sheetId'), 'sheetId');
  const userId = requireId(c.req.param('userId'), 'userId');
  const services = buildServices(c.env, c.get('requestId'));
  await services.sheets.revokeMembership(c.get('actor'), sheetId, userId);
  return c.json({ revoked: true });
});

sheetRoutes.post('/:sheetId/ownership', async (c) => {
  const sheetId = requireId(c.req.param('sheetId'), 'sheetId');
  const body = parseTransferOwnership(await readJsonBody(c));
  const services = buildServices(c.env, c.get('requestId'));
  const sheet = await services.sheets.transferOwnership(
    c.get('actor'),
    sheetId,
    body.newOwnerUserId
  );
  return c.json({ sheet: toSheetDto(sheet) });
});

/**
 * Tasks in a List.
 *
 * The note-visibility decision is made per task rather than once for the List,
 * because `notesPrivate` is a per-task flag: two tasks in the same List can
 * differ, and a single List-level answer would be wrong for one of them.
 */
sheetRoutes.get('/:sheetId/tasks', async (c) => {
  const sheetId = requireId(c.req.param('sheetId'), 'sheetId');
  const actor = c.get('actor');
  const services = buildServices(c.env, c.get('requestId'));

  const { context } = await services.sheets.authorize(actor, sheetId);
  const tasks = await services.tasks.listForSheet(actor, sheetId);

  return c.json({
    tasks: tasks.map((task) => toTaskDto(task, canReadTaskNotes(actor, context, task))),
  });
});

sheetRoutes.get('/:sheetId/tasks/recycled', async (c) => {
  const sheetId = requireId(c.req.param('sheetId'), 'sheetId');
  const actor = c.get('actor');
  const services = buildServices(c.env, c.get('requestId'));

  const { context } = await services.sheets.authorize(actor, sheetId);
  const tasks = await services.tasks.listRecycledForSheet(actor, sheetId);

  return c.json({
    tasks: tasks.map((task) => toTaskDto(task, canReadTaskNotes(actor, context, task))),
  });
});

sheetRoutes.post('/:sheetId/tasks', async (c) => {
  const sheetId = requireId(c.req.param('sheetId'), 'sheetId');
  const actor = c.get('actor');
  const body = parseTaskFields(await readJsonBody(c));
  const services = buildServices(c.env, c.get('requestId'));

  const task = await services.tasks.create(actor, sheetId, body);
  const { context } = await services.sheets.authorize(actor, sheetId);

  return c.json({ task: toTaskDto(task, canReadTaskNotes(actor, context, task)) }, 201);
});
