// Max-firm / narrow-width fallback evidence, required by M3's own acceptance
// wording: "Max is firm; min may yield only for safe readability/reflow and
// the fallback must be visible in M3 evidence." A configured column max is
// never force-applied at an unsafe container width — the grid only ever
// renders the natural `auto-fill` count, clamped by max (see the comment
// above `.sheet-columns`'s `@container` rules).
//
// Note (M3-E5-01 / Decision Log M3-D2): `--column-min` is not currently
// consumed by any CSS rule at all, so nothing here is min "yielding" —
// there is no enforced minimum to yield from in the first place. Both tests
// below exercise `auto-fill`'s natural behavior at their viewport; the
// configured `columnBounds.min` value is irrelevant to either result. Real
// min-enforcement is a named work packet in M7 (`docs/milestones/M7-
// hardening-and-device-qa.md`) per Brian's recorded decision; the Min
// control is disabled in `DisplaySettings.tsx` accordingly.

import { expect, test } from '@playwright/test';

import { freezeClock, multiSheetFixture } from './fixtures';
import { installMockApi } from './mock-api';
import { seedPreferences } from './preferences';

test('narrow-width fallback: a configured min of 3 is never force-applied at 420px (min is not enforced, M3-E5-01)', async ({
  page,
}) => {
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
  // Nothing "yields" here: min is not enforced at all, so the grid never
  // tried to hold 3 columns in the first place. auto-fill naturally renders
  // fewer columns at 420px, and max (also 3) never overrides that — the
  // configured min value is irrelevant to this result.
  expect(trackCount).toBeLessThan(3);

  await page.screenshot({
    path: 'docs/evidence/M3.6/vp1-narrow-420x1080-standard-dark-auto-fill-1col.png',
    fullPage: true,
  });
});

test('auto-fill naturally reaches 2+ columns at a wide-enough viewport (min is not enforced, M3-E5-01)', async ({
  page,
}) => {
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
  // This reflects auto-fill's natural column count at this width, not
  // min-enforcement: the same result occurs regardless of columnBounds.min.
  expect(trackCount).toBeGreaterThanOrEqual(2);

  await page.screenshot({
    path: 'docs/evidence/M3.6/vp7-tablet-1180x820-standard-dark-auto-fill-2col.png',
    fullPage: true,
  });
});

test('the Columns setting-row label and control do not overlap at the primary narrow viewport (M3-E5-02)', async ({
  page,
}) => {
  // The disabled Min input's longer label ("Min (not yet enforced)") plus the
  // row's description text left no safe side-by-side arrangement at 420px —
  // the label column collapsed into a one-character-wide wrapped strip that
  // visually collided with the Min/Max inputs. Fixed with a narrow-width
  // `.setting-row` stacking rule in `global.css`; this asserts the fix with
  // real geometry rather than only a visual screenshot.
  await page.setViewportSize({ width: 420, height: 1080 });
  await freezeClock(page);
  const { sheets, tasksBySheet } = multiSheetFixture(1);
  await installMockApi(page, { sheets, tasksBySheet });
  await seedPreferences(page, { mode: 'standard', theme: 'dark' });
  await page.goto('/');
  await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });

  const label = page.locator('.setting-row', { hasText: 'Columns' }).locator('.setting-row__label');
  const control = page
    .locator('.setting-row', { hasText: 'Columns' })
    .locator('.setting-row__control');
  const labelBox = await label.boundingBox();
  const controlBox = await control.boundingBox();
  expect(labelBox).not.toBeNull();
  expect(controlBox).not.toBeNull();

  // Stacked, non-overlapping layout: the control's top must be at or below
  // the label's bottom, not collide with it.
  const labelBottom = labelBox!.y + labelBox!.height;
  expect(controlBox!.y).toBeGreaterThanOrEqual(labelBottom - 1);

  // The label must not have wrapped into an absurdly narrow column (the
  // regression rendered single-character line wraps).
  expect(labelBox!.width).toBeGreaterThan(100);
});
