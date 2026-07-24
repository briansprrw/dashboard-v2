import type { Handler } from 'hono';

import { EXPECTED_SCHEMA_VERSION } from '../../shared/constants/schema';
import type { AppEnv } from '../env';
import { logEvent } from '../observability/log-event';

// No binding IDs, account details, or other secret/internal-config detail
// is ever included in this response — only the application version and the
// applied vs. expected schema version.
export const healthHandler: Handler<AppEnv> = async (c) => {
  // A freshly deployed Worker whose D1 database has not been migrated yet
  // (migrations are deliberately manual and separate from deploy — see
  // docs/runbooks/preview-deployment.md) has no `schema_version` table at
  // all, which throws rather than returning an empty row. Treat that the
  // same as "no compatible schema applied yet": a 503 degraded response,
  // not an unhandled exception surfaced as a generic 500. A query failure
  // for any reason (missing table, transient D1 outage, misconfiguration)
  // still logs one request-correlated, code-only event — never the raw D1
  // error/message — so an operator can distinguish "query failed" from a
  // routine pre-migration degraded state using logs alone.
  let schemaVersion: number | null;
  try {
    const row = await c.env.DASH2_DB.prepare(
      'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1'
    ).first<{ version: number }>();
    schemaVersion = row?.version ?? null;
  } catch {
    schemaVersion = null;
    logEvent({
      requestId: c.get('requestId'),
      path: c.req.path,
      method: c.req.method,
      status: 503,
      code: 'HEALTH_SCHEMA_QUERY_FAILED',
    });
  }

  const schemaCompatible = schemaVersion === EXPECTED_SCHEMA_VERSION;

  return c.json(
    {
      status: schemaCompatible ? 'ok' : 'degraded',
      version: c.env.APP_VERSION,
      schemaVersion,
      expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
      timestamp: new Date().toISOString(),
    },
    schemaCompatible ? 200 : 503
  );
};
