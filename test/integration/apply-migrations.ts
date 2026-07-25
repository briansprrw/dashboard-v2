import { applyD1Migrations, env } from 'cloudflare:test';

// Each integration test file gets its own isolated, empty D1 database (Vitest
// pool-workers isolated storage). Applying the real migration files here is
// itself part of the acceptance evidence: if a migration cannot apply from
// empty, every integration test fails at setup rather than silently running
// against a hand-built schema.
await applyD1Migrations(env.DASH2_DB, env.TEST_MIGRATIONS);
