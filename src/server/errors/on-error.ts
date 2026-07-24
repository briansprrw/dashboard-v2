import type { ErrorHandler } from 'hono';

import type { AppEnv } from '../env';
import { logEvent } from '../observability/log-event';
import { AppError } from './app-error';
import { coarseErrorCategory } from './error-category';
import { errorEnvelope } from './error-envelope';

export const onError: ErrorHandler<AppEnv> = (err, c) => {
  const requestId = c.get('requestId') ?? crypto.randomUUID();

  if (err instanceof AppError) {
    logEvent({
      requestId,
      path: c.req.path,
      method: c.req.method,
      status: err.status,
      code: err.code,
      detail: err.logDetail,
    });
    return c.json(errorEnvelope(err.code, err.message, requestId, err.fields), err.status);
  }

  // Never logs `err.message` or `err.name` directly — both are caller/
  // dependency-controlled and can carry private task content, query detail,
  // or credentials. `coarseErrorCategory` only ever emits one of a fixed set
  // of literal strings.
  logEvent({
    requestId,
    path: c.req.path,
    method: c.req.method,
    status: 500,
    code: 'INTERNAL_ERROR',
    detail: { errorCategory: coarseErrorCategory(err) },
  });
  return c.json(errorEnvelope('INTERNAL_ERROR', 'An unexpected error occurred.', requestId), 500);
};
