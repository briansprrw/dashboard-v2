// Regression coverage for M3-DEF-06 (found during M3.6 evidence capture):
// `.sheet-columns`'s `@container` rules could never match because
// `container-type` was declared on the same element the query measured.
// jsdom cannot catch this — it does not implement container queries at all
// — so only a real browser can verify the column-max bound is enforced.

import { expect, test } from '@playwright/test';

import { freezeClock, multiSheetFixture } from './fixtures';
import { installMockApi } from './mock-api';
import { seedPreferences } from './preferences';

test('column-max bound is enforced at full desktop width with 4+ sections', async ({ page }) => {
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

  const trackCount = await page.evaluate(() => {
    const el = document.querySelector('.sheet-columns');
    if (!el) return -1;
    return getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length;
  });
  expect(trackCount).toBe(3);
});

test('column count never exceeds a max of 1 even with many sections', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freezeClock(page);
  const { sheets, tasksBySheet } = multiSheetFixture(4);
  await installMockApi(page, { sheets, tasksBySheet });
  await seedPreferences(page, {
    mode: 'standard',
    theme: 'dark',
    columnBounds: { min: 1, max: 1 },
  });
  await page.goto('/');
  await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });

  const trackCount = await page.evaluate(() => {
    const el = document.querySelector('.sheet-columns');
    if (!el) return -1;
    return getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length;
  });
  expect(trackCount).toBe(1);
});
