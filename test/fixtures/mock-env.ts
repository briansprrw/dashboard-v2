import type { Env } from '../../src/server/env';
import { EXPECTED_SCHEMA_VERSION } from '../../src/shared/constants/schema';

// Synthetic-only test doubles — no real Cloudflare resource, credential, or
// production data is involved. Only the D1/KV surface area the current
// application code actually calls is implemented.
export function createMockEnv(options?: {
  schemaVersion?: number | null;
  throwOnQuery?: Error;
}): Env {
  // Defaults to whatever version the application currently expects, so a new
  // migration does not turn every "healthy database" fixture into a degraded
  // one. Tests that mean "an incompatible version" pass one explicitly.
  const schemaVersion =
    options && 'schemaVersion' in options ? options.schemaVersion : EXPECTED_SCHEMA_VERSION;

  const db = {
    prepare: () => ({
      first: async <T>() => {
        if (options?.throwOnQuery) throw options.throwOnQuery;
        return (schemaVersion === null ? null : ({ version: schemaVersion } as T)) as T | null;
      },
    }),
  } as unknown as Env['DASH2_DB'];

  // An always-empty KV: `get` returns null, so any session token presented to
  // it is unresolvable. That is what makes it the right double for asserting
  // the unauthenticated (401) behaviour of protected routes. `put`/`delete`
  // accept and discard, so logout works without a real namespace.
  const kv = {
    get: async () => null,
    put: async () => undefined,
    delete: async () => undefined,
    list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
  } as unknown as Env['DASH2_SESSIONS'];

  return { DASH2_DB: db, DASH2_SESSIONS: kv, APP_VERSION: '0.0.0-test' };
}
