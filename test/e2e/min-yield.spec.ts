// Min-yield column fallback evidence, required by M3's own acceptance
// wording: "Max is firm; min may yield only for safe readability/reflow and
// the fallback must be visible in M3 evidence." When the configured column
// minimum cannot fit safely at the current container width, the grid must
// not force it — `global.css`'s `.sheet-columns` deliberately leaves the
// narrow case unforced (see the comment above its `@container` rules).

import { expect, test } from '@playwright/test';

import { freezeClock, multiSheetFixture } from './fixtures';
import { installMockApi } from './mock-api';
import { seedPreferences } from './preferences';

test('min-yield: column-min of 3 yields to 1 at the primary narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 1080 });
  await freezeClock(page);
  const { sheets, tasksBySheet } = multiSheetFixture(3);
  await installMockApi(page, { sheets, tasksBySheet });
  await seedPreferences(page, {
    mode: 'standard',
    theme: 'dark',
    columnBounds: { min: 3, max: 3 },
  });
  await page.goto('/');
  await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });

  const trackCount = await page.evaluate(() => {
    const el = document.querySelector('.sheet-columns');
    if (!el) return -1;
    return getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length;
  });
  // The configured min (3) cannot safely fit at 420px; the grid must yield
  // to fewer columns rather than forcing an unsafe reflow.
  expect(trackCount).toBeLessThan(3);

  await page.screenshot({
    path: 'docs/evidence/M3.6/vp1-narrow-420x1080-standard-dark-min-yield-fallback.png',
    fullPage: true,
  });
});

test('min-yield: column-min of 2 is honored once the viewport is wide enough', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await freezeClock(page);
  const { sheets, tasksBySheet } = multiSheetFixture(3);
  await installMockApi(page, { sheets, tasksBySheet });
  await seedPreferences(page, {
    mode: 'standard',
    theme: 'dark',
    columnBounds: { min: 2, max: 3 },
  });
  await page.goto('/');
  await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });

  const trackCount = await page.evaluate(() => {
    const el = document.querySelector('.sheet-columns');
    if (!el) return -1;
    return getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length;
  });
  expect(trackCount).toBeGreaterThanOrEqual(2);

  await page.screenshot({
    path: 'docs/evidence/M3.6/vp7-tablet-1180x820-standard-dark-min-honored.png',
    fullPage: true,
  });
});
