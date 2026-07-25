// Turns a session cookie into an `Actor`, or rejects the request.
//
// Every authenticated route sits behind this. It is the only place an `Actor`
// is created for a request, so there is no path to an authorized handler that
// skipped the eligibility and revocation checks in `AuthService.resolveSession`.

import type { MiddlewareHandler } from 'hono';

import { buildSessionResolver } from '../app-context';
import { readSessionCookie, buildSessionCookie, SESSION_COOKIE_NAME } from '../auth/cookies';
import { SESSION_SLIDING_TTL_MS } from '../auth/session';
import { cookieSecureFrom, type AppEnv } from '../env';
import { actorFromUser, denyUnauthenticated } from '../policy';

export const authenticate: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = readSessionCookie(c.req.header('Cookie'));
  if (token === null) throw denyUnauthenticated();

  // Session resolution needs KV and D1 only. Using the provider-free resolver
  // means an unconfigured OAuth client yields 401 for a bad session rather
  // than 503, which would misreport a routine rejection as an outage.
  const auth = buildSessionResolver(c.env);
  const resolved = await auth.resolveSession(token);

  // Covers every failure the same way: absent, expired, revoked by an
  // auth-version bump, or belonging to a disabled/recycled account. The caller
  // learns only that they are not authenticated.
  if (resolved === null) throw denyUnauthenticated();

  c.set('actor', actorFromUser(resolved.user));
  c.set('session', resolved.session);
  c.set('sessionToken', token);

  await next();

  // Re-issue the cookie so the browser's own expiry tracks the slid session.
  // Only when the response is not already setting the cookie itself (logout).
  if (!c.res.headers.has('Set-Cookie')) {
    const remainingMs = resolved.session.expiresAt - Date.now();
    c.header(
      'Set-Cookie',
      buildSessionCookie(token, Math.floor(Math.min(remainingMs, SESSION_SLIDING_TTL_MS) / 1000), {
        secure: cookieSecureFrom(c.env),
      })
    );
  }
};

export { SESSION_COOKIE_NAME };
