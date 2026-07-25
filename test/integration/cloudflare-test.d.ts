import type { D1Migration } from 'cloudflare:test';

// Types for the bindings vitest.workers.config.ts provides to the integration
// test worker. `env` from `cloudflare:test` is typed as `Cloudflare.Env`, so
// the bindings are declared through that interface.
declare global {
  namespace Cloudflare {
    interface Env {
      DASH2_DB: D1Database;
      /** Sessions and OAuth flow state, exercised by the auth lifecycle tests. */
      DASH2_SESSIONS: KVNamespace;
      /** Migration SQL read from /migrations at config time; test-only. */
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
