// Origin enforcement for state-changing requests — defence in depth behind
// `SameSite=Lax`.
//
// SameSite=Lax already stops a cross-site form or fetch from carrying the
// session cookie on a POST, so this check is a second, independent barrier
// rather than the only one. It matters because SameSite is a browser behaviour:
// it does not help against a browser that implements it wrongly, and it does
// not apply to a same-site-but-different-subdomain attacker.
//
// Only unsafe methods are checked. A GET must remain usable from a plain
// navigation, which carries no Origin header at all.

import type { MiddlewareHandler } from 'hono';

import { AppError } from '../errors/app-error';
import type { AppEnv, Env } from '../env';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Origins permitted to make state-changing calls. When `ALLOWED_ORIGINS` is
 * unset, the request's own Host is the only acceptable origin — the correct
 * default for a single-origin application, and one that cannot accidentally
 * allow everything.
 */
export function allowedOriginsFor(env: Env, requestUrl: string): Set<string> {
  const configured = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (configured.length > 0) return new Set(configured);
  return new Set([new URL(requestUrl).origin]);
}

export const originCheck: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) {
    await next();
    return;
  }

  const origin = c.req.header('Origin');

  // A missing Origin on an unsafe method is rejected rather than allowed.
  // Browsers send it on every fetch/XHR and on cross-origin form posts, so its
  // absence on a mutation means the request did not come from the application.
  if (!origin) {
    throw new AppError(403, 'ORIGIN_REQUIRED', 'This request could not be verified.');
  }

  if (!allowedOriginsFor(c.env, c.req.url).has(origin)) {
    throw new AppError(403, 'ORIGIN_NOT_ALLOWED', 'This request could not be verified.', {
      // The rejected origin is attacker-controlled but is a bounded, non-secret
      // value and is the single most useful thing to have when diagnosing a
      // legitimate deployment misconfiguration.
      logDetail: { rejectedOrigin: origin },
    });
  }

  await next();
};
