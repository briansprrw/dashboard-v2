// Administrative routes: account administration and opaque recovery.
//
// Every response on this surface is built from a recovery DTO, never from a
// task or List DTO. That is the point of the surface: an administrator can
// operate the recycle bin and the account lifecycle without ever receiving task
// names, notes, privacy flags, List names, or history values.
//
// There is deliberately no route here that reads task content. Adding one would
// require reversing M0-D16, which is Brian's decision and not an implementation
// change.

import { Hono } from 'hono';

import {
  toSheetRecoveryDto,
  toTaskEventMetadataDto,
  toTaskRecoveryDto,
} from '../../shared/contracts/dto';
import { requireId } from '../../shared/contracts/validation';
import { GLOBAL_ROLES } from '../../shared/domain/enums';
import { buildServices } from '../app-context';
import type { AppEnv } from '../env';
import { readJsonBody } from '../http/request-body';
import {
  FieldErrors,
  rejectUnknownFields,
  requireObject,
  validateEnum,
} from '../../shared/contracts/validation';

export const adminRoutes = new Hono<AppEnv>();

/** Opaque lifecycle state for one task: identity and timestamps, no content. */
adminRoutes.get('/tasks/:taskId', async (c) => {
  const taskId = requireId(c.req.param('taskId'), 'taskId');
  const services = buildServices(c.env, c.get('requestId'));
  const view = await services.adminRecovery.getTaskRecoveryState(c.get('actor'), taskId);
  return c.json({ task: toTaskRecoveryDto(view) });
});

/** Allowlisted history metadata — that changes happened, not what they were. */
adminRoutes.get('/tasks/:taskId/history', async (c) => {
  const taskId = requireId(c.req.param('taskId'), 'taskId');
  const services = buildServices(c.env, c.get('requestId'));
  const events = await services.adminRecovery.listTaskHistoryMetadata(c.get('actor'), taskId);
  return c.json({ events: events.map(toTaskEventMetadataDto) });
});

adminRoutes.post('/tasks/:taskId/restore', async (c) => {
  const taskId = requireId(c.req.param('taskId'), 'taskId');
  const services = buildServices(c.env, c.get('requestId'));
  const task = await services.adminRecovery.restoreTask(c.get('actor'), taskId);
  return c.json({ task: toTaskRecoveryDto({ task, historyEventCount: 0 }) });
});

adminRoutes.delete('/tasks/:taskId', async (c) => {
  const taskId = requireId(c.req.param('taskId'), 'taskId');
  const services = buildServices(c.env, c.get('requestId'));
  await services.adminRecovery.purgeTask(c.get('actor'), taskId);
  return c.json({ purged: true });
});

adminRoutes.get('/sheets/:sheetId', async (c) => {
  const sheetId = requireId(c.req.param('sheetId'), 'sheetId');
  const services = buildServices(c.env, c.get('requestId'));
  const sheet = await services.adminRecovery.getSheetRecoveryState(c.get('actor'), sheetId);
  return c.json({ sheet: toSheetRecoveryDto(sheet) });
});

adminRoutes.post('/sheets/:sheetId/restore', async (c) => {
  const sheetId = requireId(c.req.param('sheetId'), 'sheetId');
  const services = buildServices(c.env, c.get('requestId'));
  const sheet = await services.adminRecovery.restoreSheet(c.get('actor'), sheetId);
  return c.json({ sheet: toSheetRecoveryDto(sheet) });
});

const SET_ROLE_FIELDS = ['globalRole'] as const;

adminRoutes.post('/users/:userId/role', async (c) => {
  const userId = requireId(c.req.param('userId'), 'userId');
  const body = requireObject(await readJsonBody(c));
  rejectUnknownFields(body, SET_ROLE_FIELDS);

  const errors = new FieldErrors();
  const globalRole = validateEnum(errors, 'globalRole', body.globalRole, GLOBAL_ROLES);
  errors.throwIfAny();

  const services = buildServices(c.env, c.get('requestId'));
  await services.accounts.setGlobalRole(c.get('actor'), userId, globalRole!);
  return c.json({ updated: true });
});

adminRoutes.post('/users/:userId/disable', async (c) => {
  const userId = requireId(c.req.param('userId'), 'userId');
  const services = buildServices(c.env, c.get('requestId'));
  await services.accounts.disable(c.get('actor'), userId);
  return c.json({ disabled: true });
});

adminRoutes.post('/users/:userId/recycle', async (c) => {
  const userId = requireId(c.req.param('userId'), 'userId');
  const services = buildServices(c.env, c.get('requestId'));
  await services.accounts.recycle(c.get('actor'), userId);
  return c.json({ recycled: true });
});

adminRoutes.post('/users/:userId/restore', async (c) => {
  const userId = requireId(c.req.param('userId'), 'userId');
  const services = buildServices(c.env, c.get('requestId'));
  await services.accounts.restore(c.get('actor'), userId);
  return c.json({ restored: true });
});

/** Immediate "sign out everywhere" for one account. */
adminRoutes.post('/users/:userId/revoke-sessions', async (c) => {
  const userId = requireId(c.req.param('userId'), 'userId');
  const services = buildServices(c.env, c.get('requestId'));
  await services.accounts.revokeSessions(c.get('actor'), userId);
  return c.json({ revoked: true });
});
