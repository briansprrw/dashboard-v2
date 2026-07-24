import { defineConfig } from 'vitest/config';

// Deliberately independent of vite.config.ts: the Cloudflare Vite plugin's
// worker environment (nodejs_compat resolve.external) is incompatible with
// Vitest's default Node test environment. Server code under test here is
// plain Hono/TypeScript with no Workers-runtime-only APIs, so a plain Node
// test environment is sufficient for M1. Revisit with
// @cloudflare/vitest-pool-workers if a future milestone needs workerd-exact
// runtime behavior in tests.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
