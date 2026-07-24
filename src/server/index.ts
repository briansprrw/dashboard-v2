import { Hono } from 'hono';

import type { AppEnv } from './env';
import { errorEnvelope } from './errors/error-envelope';
import { onError } from './errors/on-error';
import { envValidation } from './middleware/env-validation';
import { requestId } from './middleware/request-id';
import { securityHeaders } from './middleware/security-headers';
import { healthHandler } from './routes/health';

const app = new Hono<AppEnv>();

// Registered on the top-level app deliberately: errors thrown inside apiV1
// (mounted below via `.route()`) are dispatched through app's own router,
// not apiV1's — the same non-inheritance Hono has for `.notFound()` (see
// the comment on the apiV1 catch-all route below).
app.onError(onError);

// Cloudflare routes /api/v1/* to this Worker (see wrangler.jsonc
// assets.run_worker_first); every other path is served directly by the
// static-assets layer, falling back to index.html for client-side routing.
const apiV1 = new Hono<AppEnv>();

apiV1.use('*', requestId);
apiV1.use('*', envValidation);
apiV1.use('*', securityHeaders);
apiV1.use('*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
});

apiV1.get('/health', healthHandler);

// Hono's `.notFound()` hook only fires when this sub-app's own fetch/request
// is invoked directly; once mounted via `app.route()`, an unmatched path
// falls through to the parent's router instead. A catch-all route (placed
// after any real routes future milestones add above it) gives /api/v1/* its
// own JSON 404 regardless of how it's mounted.
apiV1.all('*', (c) => {
  return c.json(errorEnvelope('NOT_FOUND', 'Unknown API route', c.get('requestId')), 404);
});

app.route('/api/v1', apiV1);

export default app;
