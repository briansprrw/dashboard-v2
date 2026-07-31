import { Hono } from 'hono';

import type { AppEnv } from './env';
import { errorEnvelope } from './errors/error-envelope';
import { onError } from './errors/on-error';
import { authenticate } from './middleware/authenticate';
import { envValidation } from './middleware/env-validation';
import { originCheck } from './middleware/origin';
import { requestId } from './middleware/request-id';
import { securityHeaders } from './middleware/security-headers';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { healthHandler } from './routes/health';
import { sheetRoutes } from './routes/sheets';
import { taskRoutes } from './routes/tasks';
import { userRoutes } from './routes/users';

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

// Origin enforcement applies to every state-changing /api/v1 request, before
// authentication: a cross-origin mutation is refused whether or not it carries
// a valid session.
//
// Registered on `*` rather than only on the mounted route groups so an unknown
// path is covered too. This deliberately changes one M1 behaviour: an unsafe
// request to an unknown /api/v1 path now answers 403 (origin) instead of the
// M1 catch-all's 404, because the origin check runs first. That ordering is
// the point — a route that does not exist must not be a CSRF-exempt hole, and
// telling an unverified cross-origin caller whether a path exists is itself a
// small disclosure. Safe methods are unaffected, so `GET` on an unknown path
// still returns the M1 404 envelope.
apiV1.use('*', originCheck);

apiV1.get('/health', healthHandler);

// Auth routes manage their own authentication: /start and /callback are reached
// while signed out, and /session and /session/profile apply `authenticate`
// individually.
apiV1.route('/auth', authRoutes);

// Everything below requires a live session. `authenticate` is applied to the
// mounted paths rather than inside each handler, so a route added to these
// sub-apps later is authenticated by default rather than by remembering to.
apiV1.use('/sheets/*', authenticate);
apiV1.use('/sheets', authenticate);
apiV1.use('/tasks/*', authenticate);
apiV1.use('/admin/*', authenticate);
apiV1.use('/users/*', authenticate);

apiV1.route('/sheets', sheetRoutes);
apiV1.route('/tasks', taskRoutes);
apiV1.route('/admin', adminRoutes);
apiV1.route('/users', userRoutes);

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
