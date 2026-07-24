import type { MiddlewareHandler } from 'hono';

import type { AppEnv } from '../env';

// Always server-generated — never trust an inbound request ID, which would
// let a client inject arbitrary values into logs/responses.
export const requestId: MiddlewareHandler<AppEnv> = async (c, next) => {
  const id = crypto.randomUUID();
  c.set('requestId', id);
  await next();
  c.header('X-Request-Id', id);
};
