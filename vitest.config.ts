import { defineConfig } from 'vitest/config';

// Three test projects with deliberately different runtimes:
//
//   `node`        — contract/unit tests for plain Hono/TypeScript code with
//                   synthetic doubles. Fast, no workerd, no database. This is
//                   the M1 configuration, unchanged in behaviour.
//   `web`         — React component/hook tests (jsdom), added in M3.1 for the
//                   client app state and data-action layer.
//   `integration` — repository/schema tests that must execute real SQL against
//                   a real, actually-migrated D1 database. Defined separately
//                   in vitest.workers.config.ts because it runs inside workerd
//                   via @cloudflare/vitest-pool-workers.
//
// Still deliberately independent of vite.config.ts: the Cloudflare Vite
// plugin's worker environment (nodejs_compat resolve.external) is incompatible
// with Vitest's Node test environment.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['test/{contract,unit}/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['test/web/**/*.test.{ts,tsx}'],
          setupFiles: ['./test/web/setup.ts'],
        },
      },
      './vitest.workers.config.ts',
    ],
  },
});
