// Authentication routes: start, callback, session, logout.
//
// The callback is the security-critical one. Its failure behaviour is uniform
// on purpose: every failure — bad state, replayed state, failed exchange,
// unverified email, unknown account, disabled account — produces the same
// redirect to the same generic error, and the specific reason goes only to the
// server log. Distinguishable failures here would let an unauthenticated caller
// probe which email addresses have accounts.

import { Hono } from 'hono';

import { toSessionUserDto } from '../../shared/contracts/dto';
import { parseProfileBootstrap } from '../../shared/contracts/requests';
import { buildAuthService, buildRepositories, buildSessionResolver } from '../app-context';
import { AuthenticationFailure, sanitizeRedirectPath } from '../auth/auth-service';
import { buildSessionClearCookie, buildSessionCookie, readSessionCookie } from '../auth/cookies';
import { checkRateLimit } from '../auth/rate-limit';
import { SESSION_SLIDING_TTL_MS } from '../auth/session';
import { cookieSecureFrom, type AppEnv } from '../env';
import { readJsonBody } from '../http/request-body';
import { authenticate } from '../middleware/authenticate';
import { logEvent } from '../observability/log-event';
import { denyUnauthenticated } from '../policy';

export const authRoutes = new Hono<AppEnv>();

/** Where the browser lands after a failed sign-in. Carries no detail. */
const SIGN_IN_ERROR_PATH = '/signed-out?error=1';

/**
 * Bound on sign-in *initiations* from one source per window (Codex M2-QA-04).
 * `/start` is unauthenticated and writes a fresh OAuth-state KV record on
 * every request, so it needs its own control rather than relying on
 * `authenticate` or `originCheck`, neither of which applies here. Generous
 * enough that no plausible legitimate retry sequence (a user bouncing back
 * to sign-in, a few tabs) is affected; see `rate-limit.ts` for why this is a
 * best-effort KV counter rather than a precise quota.
 */
// `onWriteFailure: 'allow'` keeps M2-QA-04's original behaviour deliberately
// (Codex M4-RR-03 narrowed the fail-closed change to the lookup route): a
// spurious rejection here breaks sign-in itself, which is a worse outcome than
// a briefly permissive bound on an endpoint that is already cheap and
// IP-scoped.
const SIGN_IN_START_RATE_LIMIT = {
  limit: 20,
  windowSeconds: 60,
  onWriteFailure: 'allow',
} as const;

/**
 * Begins sign-in. Responds with a redirect to the provider.
 *
 * `redirect` is sanitised to a same-origin path before storage, so the callback
 * cannot be turned into an open redirect by a crafted start URL.
 */
authRoutes.get('/start', async (c) => {
  // Cloudflare sets this on every request reaching the Worker; a request
  // lacking it (only possible outside Cloudflare's network, e.g. local dev
  // without the header simulated) shares one bucket rather than bypassing the
  // limit entirely.
  const clientKey = c.req.header('CF-Connecting-IP') ?? 'unknown';
  const { allowed } = await checkRateLimit(
    c.env.DASH2_SESSIONS,
    clientKey,
    SIGN_IN_START_RATE_LIMIT
  );
  if (!allowed) {
    // Same generic redirect as every other sign-in failure: a rate-limited
    // caller must not learn anything a well-behaved one couldn't.
    return c.redirect(SIGN_IN_ERROR_PATH, 302);
  }

  const auth = buildAuthService(c.env);
  const { authorizationUrl } = await auth.startSignIn(c.req.query('redirect') ?? null);
  return c.redirect(authorizationUrl, 302);
});

/**
 * Provider callback. Always redirects — never returns a JSON body — because
 * the browser arrives here by top-level navigation.
 */
authRoutes.get('/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');

  if (typeof code !== 'string' || typeof state !== 'string') {
    return c.redirect(SIGN_IN_ERROR_PATH, 302);
  }

  const auth = buildAuthService(c.env);

  try {
    const result = await auth.completeSignIn({ code, state });

    c.header(
      'Set-Cookie',
      buildSessionCookie(result.sessionToken, SESSION_SLIDING_TTL_MS / 1000, {
        secure: cookieSecureFrom(c.env),
      })
    );
    return c.redirect(sanitizeRedirectPath(result.redirectPath), 302);
  } catch (error) {
    // The reason is recorded for operators and never shown to the caller.
    logEvent({
      requestId: c.get('requestId'),
      path: c.req.path,
      method: c.req.method,
      status: 302,
      code: 'AUTH_FAILED',
      detail: {
        reason: error instanceof AuthenticationFailure ? error.reason : 'unexpected',
      },
    });
    return c.redirect(SIGN_IN_ERROR_PATH, 302);
  }
});

/** The signed-in user's own profile. The client's bootstrap call. */
authRoutes.get('/session', authenticate, async (c) => {
  const actor = c.get('actor');
  const repos = buildRepositories(c.env);
  const user = await repos.users.findById(actor.userId);
  if (user === null) throw denyUnauthenticated();

  return c.json({ user: toSessionUserDto(user) });
});

/**
 * Records browser-derived locale and timezone (M0-D20, AC-D8).
 *
 * This is the entire V2 profile-mutation surface: no display-name, avatar, or
 * username field exists to send.
 */
authRoutes.post('/session/profile', authenticate, async (c) => {
  const actor = c.get('actor');
  const body = parseProfileBootstrap(await readJsonBody(c));

  const repos = buildRepositories(c.env);
  const user = await repos.users.findById(actor.userId);
  if (user === null) throw denyUnauthenticated();

  await repos.users.updateProfileBasics(actor.userId, {
    // Provider-owned fields are passed through unchanged: the request has no
    // way to supply them.
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    locale: body.locale ?? user.locale,
    timezone: body.timezone ?? user.timezone,
    now: Date.now(),
  });

  const updated = await repos.users.findById(actor.userId);
  return c.json({ user: toSessionUserDto(updated ?? user) });
});

/**
 * Ends the session. Destroys the server-side record *and* clears the cookie —
 * clearing the cookie alone would leave a still-valid token in KV.
 *
 * Deliberately succeeds even without a valid session so a client can always
 * reach a signed-out state.
 */
authRoutes.post('/logout', async (c) => {
  const token = readSessionCookie(c.req.header('Cookie'));
  if (token !== null) {
    // Provider-free: signing out must work even when OAuth is unconfigured.
    await buildSessionResolver(c.env).signOut(token);
  }

  c.header('Set-Cookie', buildSessionClearCookie({ secure: cookieSecureFrom(c.env) }));
  return c.json({ signedOut: true });
});
