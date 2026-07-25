import path from 'node:path';

import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// Integration-test project. These tests run inside workerd with a real
// Miniflare-backed D1 database, so repository SQL, CHECK constraints, foreign
// keys, partial indexes, and triggers are exercised for real rather than
// against a mock. The migration files under /migrations are the exact SQL
// applied — a schema change that cannot apply to an empty database fails here.
//
// Miniflare is configured explicitly rather than by pointing at wrangler.jsonc:
// the test database must be a throwaway local one with no relationship to any
// deployed environment's bindings.
// Resolved from this file rather than the working directory so the migration
// path does not depend on where the test command was started.
const migrationsDir = path.join(import.meta.dirname, 'migrations');

export default defineConfig(async () => {
  const migrations = await readD1Migrations(migrationsDir);

  return {
    plugins: [
      cloudflareTest({
        miniflare: {
          // Kept in step with wrangler.jsonc so the test runtime matches the
          // deployed one.
          compatibilityDate: '2026-07-23',
          compatibilityFlags: ['nodejs_compat'],
          d1Databases: ['DASH2_DB'],
          // Sessions and short-lived OAuth flow state live in KV (M0-D12,
          // M2-D2), so the auth tests need a real KV namespace to exercise
          // expiry and one-time consumption rather than a stub.
          kvNamespaces: ['DASH2_SESSIONS'],
          bindings: {
            // Read by test/integration/apply-migrations.ts. Migration SQL
            // only — no credentials and no data.
            TEST_MIGRATIONS: migrations,
          },
        },
      }),
    ],
    test: {
      name: 'integration',
      include: ['test/integration/**/*.test.ts'],
      // Applies every migration to this file's isolated, empty database before
      // its tests run.
      setupFiles: ['./test/integration/apply-migrations.ts'],
    },
  };
});
