import type { MiddlewareHandler } from 'hono';

import type { AppEnv } from '../env';

// Baseline security headers for every Worker-generated (/api/v1) response.
// Static-asset responses get the equivalent set from public/_headers —
// Cloudflare's asset layer does not apply that file to Worker responses,
// so the two are deliberately kept in sync by hand.
export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  c.header(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
      "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'"
  );
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
};
