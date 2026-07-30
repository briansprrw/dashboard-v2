// Stable visual-regression baselines for M3.6's required evidence
// ("stable visual snapshots pass" — M3's own acceptance wording). Distinct
// from `viewport-capture.spec.ts`'s human-review evidence captures (plain
// `.png` files under `docs/evidence/M3.6/`, meant for Brian's Gate B
// evaluation and re-generated freely): these use Playwright's own
// `toHaveScreenshot()` assertion against a checked-in baseline in
// `test/e2e/visual-regression.spec.ts-snapshots/`, so a future CSS change
// that silently alters the approved Glance/Standard composition fails CI
// instead of only producing a new, unreviewed image (M3.6-QA-04, found by
// Codex's independent review — no such assertion existed anywhere in the
// original M3.6 packet).
//
// Baselines are committed once (via `--update-snapshots`) after a human has
// visually approved the rendered state; `npx playwright test
// visual-regression.spec.ts` re-runs the comparison on every later change.

import { expect, test } from '@playwright/test';

import { freezeClock, multiSheetFixture, normalFixture } from './fixtures';
import { installMockApi } from './mock-api';
import { seedPreferences } from './preferences';

test('visual regression: vp1 primary narrow, Glance, dark — solid due-band bars', async ({
  page,
}) => {
  await page.setViewportSize({ width: 420, height: 1080 });
  await freezeClock(page);
  const { sheets, tasksBySheet } = normalFixture();
  await installMockApi(page, { sheets, tasksBySheet });
  await seedPreferences(page, { mode: 'glance', theme: 'dark' });
  await page.goto('/');
  await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveScreenshot('vp1-glance-dark.png', { fullPage: true });
});

test('visual regression: vp2 upper-bound narrow (640px) stays one column', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 1080 });
  await freezeClock(page);
  const { sheets, tasksBySheet } = multiSheetFixture(2);
  await installMockApi(page, { sheets, tasksBySheet });
  await seedPreferences(page, { mode: 'standard', theme: 'dark' });
  await page.goto('/');
  await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveScreenshot('vp2-standard-dark-one-column.png', { fullPage: true });
});

test('visual regression: vp3 full desktop, Standard, dark — 3-column grid', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freezeClock(page);
  const { sheets, tasksBySheet } = multiSheetFixture(4);
  await installMockApi(page, { sheets, tasksBySheet });
  await seedPreferences(page, {
    mode: 'standard',
    theme: 'dark',
    columnBounds: { min: 1, max: 3 },
  });
  await page.goto('/');
  await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveScreenshot('vp3-standard-dark-3col.png', { fullPage: true });
});
