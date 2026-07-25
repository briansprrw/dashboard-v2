// Request-body reading, with the content-type and parse failures mapped to the
// same stable 400 envelope the field validators use.
//
// Content type is enforced rather than sniffed: accepting a body sent as
// `text/plain` would reopen the cross-origin form-post path that
// `Content-Type: application/json` (which a simple form cannot set) helps
// close.

import type { Context } from 'hono';

import { ValidationError } from '../../shared/contracts/validation';
import type { AppEnv } from '../env';

export async function readJsonBody(c: Context<AppEnv>): Promise<unknown> {
  const contentType = c.req.header('Content-Type') ?? '';

  // Tolerates parameters such as `application/json; charset=utf-8`.
  if (!contentType.split(';')[0]?.trim().toLowerCase().startsWith('application/json')) {
    throw new ValidationError({ contentType: 'Expected application/json.' });
  }

  try {
    return await c.req.json();
  } catch {
    // The parser's message can echo body content, so it is never propagated.
    throw new ValidationError({ body: 'Expected a valid JSON body.' });
  }
}
