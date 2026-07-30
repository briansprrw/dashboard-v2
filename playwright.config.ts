import { defineConfig, devices } from '@playwright/test';

// Drives the real Vite dev server (real React app, real CSS, real container
// queries) with every `/api/v1/*` call intercepted at the browser network
// layer (see `test/e2e/mock-api.ts`) instead of a live authenticated Worker
// session — the accepted substitute for the live-OAuth-blocked evidence path
// (M3-QA-06/M3.6-D1 decision). No test-mode server bypass exists or is added.
//
// Named `projects` (M3.6-QA-03, found by Codex's independent re-review):
// the technical architecture requires the shared browser-workflow
// specification to run across named narrow/full-desktop/phone/tablet/
// smart-frame/touch/no-hover/Firefox-smoke projects
// (`docs/plans/2026-07-22-dash2-technical-architecture.md:817-824`), not
// only inside one default desktop Chromium context. `test/e2e/workflow.spec.ts`
// runs under every project below (it internally skips its per-dimension
// loop except on `chromium-desktop`, and skips its per-project run only on
// `chromium-desktop`, so each project contributes exactly one real
// workflow pass — see the spec file itself for that split). Every other
// spec (viewport screenshots, column-bounds, min-yield, accessibility,
// zoom/motion, touch-target sizing, `no-hover.spec.ts` — which already
// creates its own multiple browser contexts internally) is scoped to
// `chromium-desktop` only; running them under every project would only
// add runtime without new evidence.
const WORKFLOW_SPECS = ['**/workflow.spec.ts'];

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // All specs share one Vite dev server instance. A high worker count (this
  // machine defaults to one per CPU core) was found to cause real timeouts
  // under load once the suite grew past ~50 tests (M3-DEF-10's viewport
  // expansion) — not flaky tests, but genuine contention against the single
  // shared dev server. Capped at 4, which keeps a full run well under a
  // minute without saturating it.
  workers: 4,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'test-results/e2e-report' }]],
  outputDir: 'test-results/e2e-artifacts',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite dev --port 5173 --strictPort',
    url: 'http://localhost:5173',
    // Off by default, so an evidence run always gets a freshly started server
    // rather than silently inheriting whatever state a long-lived local one is
    // in. `DASH2_REUSE_SERVER=1` opts in for the cases where attaching is the
    // point — chiefly `live-preview.spec.ts`, which is normally run while a
    // `vite dev` is already up (see that file's header).
    reuseExistingServer: !!process.env.DASH2_REUSE_SERVER,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
      // Runs the full suite — every spec file, not just the workflow ones —
      // since this is the primary/default project every other spec targets.
      // `live-preview.spec.ts` is the one exception: it is a manual tool, not
      // evidence, and it needs a null viewport that cannot coexist with this
      // project's `deviceScaleFactor` (see the `live-preview` project below).
      testIgnore: ['**/live-preview.spec.ts'],
    },
    {
      // Manual preview only. Deliberately spreads no `devices[...]` preset:
      // `viewport: null` is what makes window resizing actually resize the
      // page, and Playwright rejects it alongside a preset's
      // `deviceScaleFactor`. Skipped unless `DASH2_LIVE_PREVIEW` is set, so a
      // plain `npx playwright test` never waits on a browser nobody opened.
      name: 'live-preview',
      testMatch: ['**/live-preview.spec.ts'],
      use: {
        viewport: null,
        launchOptions: { args: ['--window-size=1360,940', '--window-position=60,40'] },
      },
    },
    {
      name: 'chromium-narrow',
      use: { ...devices['Desktop Chrome'], viewport: { width: 420, height: 1080 } },
      testMatch: WORKFLOW_SPECS,
    },
    {
      name: 'chromium-full-1920',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
      testMatch: WORKFLOW_SPECS,
    },
    {
      name: 'chromium-phone',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 360, height: 800 },
        isMobile: true,
        hasTouch: true,
      },
      testMatch: WORKFLOW_SPECS,
    },
    {
      name: 'webkit-phone',
      use: { ...devices['Desktop Safari'], viewport: { width: 360, height: 800 }, hasTouch: true },
      testMatch: WORKFLOW_SPECS,
    },
    {
      name: 'chromium-ipad-portrait',
      use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 }, hasTouch: true },
      testMatch: WORKFLOW_SPECS,
    },
    {
      name: 'chromium-ipad-landscape',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1180, height: 820 }, hasTouch: true },
      testMatch: WORKFLOW_SPECS,
    },
    {
      name: 'chromium-smart-frame-touch-nohover',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        hasTouch: true,
      },
      testMatch: WORKFLOW_SPECS,
    },
    {
      name: 'firefox-smoke',
      use: { ...devices['Desktop Firefox'] },
      testMatch: WORKFLOW_SPECS,
    },
  ],
});
