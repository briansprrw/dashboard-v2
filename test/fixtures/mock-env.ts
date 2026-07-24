import type { Env } from '../../src/server/env';

// Synthetic-only test doubles — no real Cloudflare resource, credential, or
// production data is involved. Only the D1/KV surface area the current
// application code actually calls is implemented.
export function createMockEnv(options?: {
  schemaVersion?: number | null;
  throwOnQuery?: Error;
}): Env {
  const schemaVersion = options && 'schemaVersion' in options ? options.schemaVersion : 1;

  const db = {
    prepare: () => ({
      first: async <T>() => {
        if (options?.throwOnQuery) throw options.throwOnQuery;
        return (schemaVersion === null ? null : ({ version: schemaVersion } as T)) as T | null;
      },
    }),
  } as unknown as Env['DASH2_DB'];

  const kv = {} as unknown as Env['DASH2_SESSIONS'];

  return { DASH2_DB: db, DASH2_SESSIONS: kv, APP_VERSION: '0.0.0-test' };
}
