// A manual tool, not evidence: opens a real visible browser window against the
// mocked app (the same `mock-api.ts` / `normalFixture` the M3.6 screenshots
// use) so Brian can click around and compare against `docs/mockups/dash2.html`
// himself. Close the browser window to end the run.
//
// Run it with:
//   DASH2_LIVE_PREVIEW=1 DASH2_REUSE_SERVER=1 \
//     npx playwright test live-preview.spec.ts --headed --project=live-preview --timeout=0
//
// Both environment variables matter:
//
// - `DASH2_LIVE_PREVIEW` gates the `test.skip` below. Without it this file used
//   to run inside `npm run test:e2e`, where it waited forever for a
//   browser-close event that an unattended run never produces and then failed
//   on timeout — one guaranteed red test in every full-suite run, which is why
//   the milestone's own required e2e check could not go green (found while
//   completing M3.6).
// - `DASH2_REUSE_SERVER` lets `playwright.config.ts` attach to a `vite dev`
//   that is already running, instead of refusing to start because port 5173 is
//   taken. A preview is exactly the case where someone already has the dev
//   server up.
//
// The dedicated `live-preview` project in `playwright.config.ts` supplies
// `viewport: null`, which is also deliberate: with any fixed viewport Playwright
// pins the *page* size independently of the *window* size, so dragging the
// window edge resizes the window and nothing reflows — which reads as "the app
// isn't responsive" when it is. `null` hands page sizing back to the real
// window so resizing genuinely exercises the layout.

import { test } from '@playwright/test';

import { freezeClock, normalFixture } from './fixtures';
import { installMockApi } from './mock-api';
import { seedPreferences } from './preferences';

// File scope, not inside the test: an in-body `test.skip` runs *after* the
// browser context has been created, so the null-viewport conflict below fired
// before the skip could take effect and the test still failed.
test.skip(
  !process.env.DASH2_LIVE_PREVIEW,
  'Manual tool. Set DASH2_LIVE_PREVIEW=1 (see this file header) to open it.'
);

test('live preview for manual review', async ({ page }) => {
  await freezeClock(page);
  const { sheets, tasksBySheet } = normalFixture();
  await installMockApi(page, { sheets, tasksBySheet });
  await seedPreferences(page, { mode: 'glance', theme: 'dark' });
  await page.goto('/');
  console.log('Live preview open — close the browser window when done.');
  await page.waitForEvent('close', { timeout: 0 });
});
