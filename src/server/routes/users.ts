// User lookup (M4-D2) and the signed-in user's own sheet preferences (M4.3,
// M4-D3) — both scoped to the acting user, never another account's.

import { Hono } from 'hono';

import { toSheetPreferencesDto, toUserLookupDto } from '../../shared/contracts/dto';
import { parseLookupUserByEmail, parseSheetPreferences } from '../../shared/contracts/requests';
import { buildServices } from '../app-context';
import { checkRateLimit } from '../auth/rate-limit';
import type { AppEnv } from '../env';
import { errorEnvelope } from '../errors/error-envelope';
import { readJsonBody } from '../http/request-body';

export const userRoutes = new Hono<AppEnv>();

/**
 * Bound on exact-email lookups per actor per window (M4-QA-09). Unlike
 * `/auth/start` (unauthenticated, keyed by IP), this endpoint is reached
 * only by a signed-in session, so it is keyed by the acting user's own id —
 * a precise per-account bound rather than a shared-IP one, and one that
 * survives NAT/shared-network false grouping. 200/404 on this route reveals
 * whether an exact email has an active account; this bound does not close
 * that (M4-D2's approved design already accepts it, scoped to eligible
 * users only), it only stops an authenticated caller from turning it into a
 * fast bulk-enumeration oracle. See `rate-limit.ts` for the fixed-window
 * KV-counter design and its documented best-effort limits.
 */
// `onWriteFailure: 'deny'` (Codex M4-RR-03). A burst is exactly the traffic
// shape that trips KV's one-write-per-second limit on a single key, so a
// fail-open counter stopped bounding the very pattern this limit was added to
// stop: read the last durable count, fail every write, keep going. Treating an
// unrecordable attempt as refused costs a legitimate user at most a retry on a
// lookup box, and costs an enumerator the bulk oracle.
const USER_LOOKUP_RATE_LIMIT = {
  limit: 20,
  windowSeconds: 60,
  onWriteFailure: 'deny',
} as const;

// POST rather than GET/query-string, so an exact email is never carried in a
// URL where it could land in server access logs or browser history.
userRoutes.post('/lookup', async (c) => {
  const actor = c.get('actor');
  const { allowed } = await checkRateLimit(
    c.env.DASH2_SESSIONS,
    `user-lookup:${actor.userId}`,
    USER_LOOKUP_RATE_LIMIT
  );
  if (!allowed) {
    return c.json(
      errorEnvelope('RATE_LIMITED', 'Too many lookups. Try again shortly.', c.get('requestId')),
      429
    );
  }

  const body = parseLookupUserByEmail(await readJsonBody(c));
  const services = buildServices(c.env, c.get('requestId'));
  const user = await services.userDirectory.findByEmail(actor, body.email);
  return c.json({ user: toUserLookupDto(user) });
});

userRoutes.get('/me/sheet-preferences', async (c) => {
  const services = buildServices(c.env, c.get('requestId'));
  const prefs = await services.sheetPreferences.get(c.get('actor'));
  return c.json({ preferences: toSheetPreferencesDto(prefs) });
});

userRoutes.put('/me/sheet-preferences', async (c) => {
  const body = parseSheetPreferences(await readJsonBody(c));
  const services = buildServices(c.env, c.get('requestId'));
  const prefs = await services.sheetPreferences.save(c.get('actor'), body);
  return c.json({ preferences: toSheetPreferencesDto(prefs) });
});
