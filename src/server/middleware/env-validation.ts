import type { MiddlewareHandler } from 'hono';

import { AppError } from '../errors/app-error';
import type { AppEnv } from '../env';

// Defensive, cheap (no D1/KV call) check that every declared binding is
// actually present before any route runs. Guards against a binding being
// dropped from wrangler.jsonc or a deploy environment mismatch producing a
// confusing failure deep inside application code instead of a clear one.
export const envValidation: MiddlewareHandler<AppEnv> = async (c, next) => {
  const missing: string[] = [];
  if (!c.env?.DASH2_DB) missing.push('DASH2_DB');
  if (!c.env?.DASH2_SESSIONS) missing.push('DASH2_SESSIONS');

  if (missing.length > 0) {
    // Client sees only a generic message; the specific missing bindings are
    // server-log-only detail, never returned in the HTTP response.
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Service is not configured correctly.', {
      logDetail: { missingBindings: missing },
    });
  }

  await next();
};
