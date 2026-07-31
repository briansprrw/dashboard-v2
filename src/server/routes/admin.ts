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

import { Hono, type Context } from 'hono';

import {
  toAdminUserDetailDto,
  toAuditEventDto,
  toSheetRecoveryDto,
  toTaskEventMetadataDto,
  toTaskRecoveryDto,
  toUserLookupDto,
} from '../../shared/contracts/dto';
import { parseLookupUserByEmail } from '../../shared/contracts/requests';
import { requireId } from '../../shared/contracts/validation';
import { GLOBAL_ROLES } from '../../shared/domain/enums';
import type { AuditEventRecord } from '../../shared/domain/records';
import { AUDIT_TARGET_TYPES } from '../services/audit';
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
  const view = await services.adminRecovery.restoreTask(c.get('actor'), taskId);
  return c.json({ task: toTaskRecoveryDto(view) });
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

adminRoutes.delete('/sheets/:sheetId', async (c) => {
  const sheetId = requireId(c.req.param('sheetId'), 'sheetId');
  const services = buildServices(c.env, c.get('requestId'));
  await services.adminRecovery.purgeSheet(c.get('actor'), sheetId);
  return c.json({ purged: true });
});

/**
 * Admin-only email lookup that can find a disabled or recycled account
 * (M4-QA-03) — distinct from `POST /users/lookup`, which is intentionally
 * active-only and available to any eligible user. POST, not GET/query
 * string, for the same reason as the ordinary lookup: an exact email must
 * never land in a URL.
 */
adminRoutes.post('/users/lookup', async (c) => {
  const body = parseLookupUserByEmail(await readJsonBody(c));
  const services = buildServices(c.env, c.get('requestId'));
  const user = await services.accounts.findUserByEmail(c.get('actor'), body.email);
  return c.json({ user: toUserLookupDto(user) });
});

/** M0 §12 admin user-detail: account/List/membership metadata only, no task content. */
adminRoutes.get('/users/:userId', async (c) => {
  const userId = requireId(c.req.param('userId'), 'userId');
  const services = buildServices(c.env, c.get('requestId'));
  const detail = await services.accounts.getUserDetail(c.get('actor'), userId);
  return c.json({ user: toAdminUserDetailDto(detail) });
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

/** Permanently deletes a recycled account and every List it owns, as one unit. */
adminRoutes.delete('/users/:userId', async (c) => {
  const userId = requireId(c.req.param('userId'), 'userId');
  const services = buildServices(c.env, c.get('requestId'));
  await services.accounts.purge(c.get('actor'), userId);
  return c.json({ purged: true });
});

function parseLimitQuery(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Reads the `beforeCreatedAt`/`beforeId` pagination cursor pair (M4-QA-08).
 * Both or neither — a lone half of the pair is not a valid cursor and is
 * treated as absent rather than guessed at.
 */
function parseBeforeCursor(c: Context<AppEnv>) {
  const rawCreatedAt = c.req.query('beforeCreatedAt');
  const rawId = c.req.query('beforeId');
  if (rawCreatedAt === undefined || rawId === undefined) return undefined;
  const createdAt = Number(rawCreatedAt);
  if (!Number.isFinite(createdAt) || rawId.length === 0) return undefined;
  return { createdAt, id: rawId };
}

/**
 * `nextCursor` is the `(createdAt, id)` of the last returned row, or `null`
 * once fewer than `limit` rows came back — the page was not full, so there
 * is nothing more to fetch. A client pages by resending the same request
 * with `beforeCreatedAt`/`beforeId` set to the previous response's
 * `nextCursor` (M4-QA-08).
 */
function buildAuditPage(events: AuditEventRecord[], limit: number) {
  const nextCursor =
    events.length >= limit && events.length > 0
      ? { createdAt: events[events.length - 1]!.createdAt, id: events[events.length - 1]!.id }
      : null;
  return { events: events.map(toAuditEventDto), nextCursor };
}

const DEFAULT_AUDIT_LIMIT = 50;

/** The separate administrative/security audit stream (M0 §5), newest first. */
adminRoutes.get('/audit', async (c) => {
  const services = buildServices(c.env, c.get('requestId'));
  const limit = parseLimitQuery(c.req.query('limit')) ?? DEFAULT_AUDIT_LIMIT;
  const events = await services.adminAudit.listRecent(c.get('actor'), limit, parseBeforeCursor(c));
  return c.json(buildAuditPage(events, limit));
});

/** Audit history for one object (a List, task, user, or membership), by opaque id. */
adminRoutes.get('/audit/:targetType/:targetId', async (c) => {
  const errors = new FieldErrors();
  const targetType = validateEnum(
    errors,
    'targetType',
    c.req.param('targetType'),
    AUDIT_TARGET_TYPES
  );
  errors.throwIfAny();
  const targetId = requireId(c.req.param('targetId'), 'targetId');

  const services = buildServices(c.env, c.get('requestId'));
  const limit = parseLimitQuery(c.req.query('limit')) ?? DEFAULT_AUDIT_LIMIT;
  const events = await services.adminAudit.listForTarget(
    c.get('actor'),
    targetType!,
    targetId,
    limit,
    parseBeforeCursor(c)
  );
  return c.json(buildAuditPage(events, limit));
});
