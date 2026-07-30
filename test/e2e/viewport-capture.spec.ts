// Reference-viewport evidence for M3.6 (M3's own required evidence: "Screenshot
// index with viewport, fixture, mode, commit, and expected differences").
// Viewport IDs/dimensions are M0.4 §1's VP-1..VP-9 (`docs/milestones/M0.4-baseline-capture-2026-07-23.md`),
// which M3.6 explicitly replaces with real application evidence instead of
// the interim coded-mockup captures. Every capture uses the mocked API
// (`mock-api.ts`) driving the real rendered app — never the live server —
// and freezes the browser clock (`freezeClock`) so due-band rendering
// matches the fixtures' intent regardless of when the suite runs
// (M3.6-QA-02, found by Codex's independent review).

import { expect, test } from '@playwright/test';

import {
  denseFixture,
  emptyFixture,
  freezeClock,
  longTextFixture,
  multiSheetFixture,
  normalFixture,
} from './fixtures';
import { installMockApi } from './mock-api';
import { seedPreferences } from './preferences';

interface ViewportSpec {
  id: string;
  label: string;
  width: number;
  height: number;
  isMobile?: boolean;
  hasTouch?: boolean;
  noHover?: boolean;
}

// M0.4 §1 exact reference set (VP-1..VP-9).
const VIEWPORTS: ViewportSpec[] = [
  { id: 'vp1', label: 'narrow-420x1080-glance-primary', width: 420, height: 1080 },
  { id: 'vp2', label: 'narrow-640x1080-upper-bound', width: 640, height: 1080 },
  { id: 'vp3', label: 'desktop-1920x1080', width: 1920, height: 1080 },
  { id: 'vp4', label: 'phone-360x800', width: 360, height: 800, isMobile: true, hasTouch: true },
  { id: 'vp5', label: 'phone-430x932', width: 430, height: 932, isMobile: true, hasTouch: true },
  { id: 'vp6', label: 'tablet-820x1180-portrait', width: 820, height: 1180, hasTouch: true },
  { id: 'vp7', label: 'tablet-1180x820-landscape', width: 1180, height: 820, hasTouch: true },
  {
    id: 'vp8',
    label: 'smart-frame-1280x800',
    width: 1280,
    height: 800,
    noHover: true,
    hasTouch: true,
  },
  {
    id: 'vp9',
    label: 'smart-frame-1920x1080',
    width: 1920,
    height: 1080,
    noHover: true,
    hasTouch: true,
  },
];

test.describe('M3.6 reference-viewport captures', () => {
  for (const vp of VIEWPORTS) {
    test(`${vp.id} ${vp.label} — normal fixture, Glance`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.isMobile,
        hasTouch: vp.hasTouch,
        // `forcedColors`/`reducedMotion` are the only display-mode overrides
        // Playwright/Chromium exposes at the context level; there is no
        // direct `hover`/`any-hover` media-feature override (Chromium always
        // reports hover-capable). VP-8/VP-9's "no-hover" distinction is
        // therefore proven structurally, not by emulation: `keyboard-focus.spec.ts`
        // demonstrates every control is reachable and operable without a
        // pointer at all, which is the actual requirement no-hover contexts
        // impose (found incomplete by Codex's M3.6-QA-05 — the previous
        // version of this file did not distinguish VP-8/9 from a same-size
        // desktop capture in any way and their images were byte-identical).
      });
      const p = await context.newPage();
      await freezeClock(p);
      const { sheets, tasksBySheet } = normalFixture();
      await installMockApi(p, { sheets, tasksBySheet });
      await seedPreferences(p, { mode: 'glance', theme: 'dark' });
      await p.goto('/');
      await expect(p.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });
      await p.screenshot({
        path: `docs/evidence/M3.6/${vp.id}-${vp.label}-glance-dark-normal.png`,
        fullPage: true,
      });
      await context.close();
    });
  }

  test('vp1 primary narrow — long-text/dense-content recognition fixture', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 1080 });
    await freezeClock(page);
    const { sheets, tasksBySheet } = longTextFixture();
    await installMockApi(page, { sheets, tasksBySheet });
    await seedPreferences(page, { mode: 'glance', theme: 'dark' });
    await page.goto('/');
    await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });
    await page.screenshot({
      path: 'docs/evidence/M3.6/vp1-narrow-420x1080-glance-dark-long-text.png',
      fullPage: true,
    });
  });

  test('vp1 primary narrow — empty-section fixture', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 1080 });
    await freezeClock(page);
    const { sheets, tasksBySheet } = emptyFixture();
    await installMockApi(page, { sheets, tasksBySheet });
    await seedPreferences(page, { mode: 'glance', theme: 'dark' });
    await page.goto('/');
    await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });
    await page.screenshot({
      path: 'docs/evidence/M3.6/vp1-narrow-420x1080-glance-dark-empty-section.png',
      fullPage: true,
    });
  });

  test('vp3 full desktop — dense fixture, Standard mode, one section row-density', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await freezeClock(page);
    const { sheets, tasksBySheet } = denseFixture();
    await installMockApi(page, { sheets, tasksBySheet });
    await seedPreferences(page, { mode: 'standard', theme: 'dark' });
    await page.goto('/');
    await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });
    await page.screenshot({
      path: 'docs/evidence/M3.6/vp3-desktop-1920x1080-standard-dark-dense.png',
      fullPage: true,
    });
  });

  test('vp3 full desktop — multi-section fixture, Standard mode, 3-column grid flow (AC-G5/M0-D24)', async ({
    page,
  }) => {
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
    await page.screenshot({
      path: 'docs/evidence/M3.6/vp3-desktop-1920x1080-standard-dark-multi-section-3col.png',
      fullPage: true,
    });
  });

  test('vp2 primary narrow (upper bound, 640px) stays one column, not two', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 1080 });
    await freezeClock(page);
    const { sheets, tasksBySheet } = multiSheetFixture(2);
    await installMockApi(page, { sheets, tasksBySheet });
    await seedPreferences(page, { mode: 'standard', theme: 'dark' });
    await page.goto('/');
    await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });
    const trackCount = await page.evaluate(() => {
      const el = document.querySelector('.sheet-columns');
      if (!el) return -1;
      return getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length;
    });
    expect(trackCount).toBe(1);
    await page.screenshot({
      path: 'docs/evidence/M3.6/vp2-narrow-640x1080-standard-dark-one-column.png',
      fullPage: true,
    });
  });

  test('vp1 primary narrow — every status/priority/due-band, color-independent recognition, light theme', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 420, height: 1080 });
    await freezeClock(page);
    const { sheets, tasksBySheet } = normalFixture();
    await installMockApi(page, { sheets, tasksBySheet });
    await seedPreferences(page, { mode: 'standard', theme: 'light' });
    await page.goto('/');
    await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });
    await page.screenshot({
      path: 'docs/evidence/M3.6/vp1-narrow-420x1080-standard-light-normal.png',
      fullPage: true,
    });
  });

  test('vp1 primary narrow — Glance with clock/date header enabled', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 1080 });
    await freezeClock(page);
    const { sheets, tasksBySheet } = normalFixture();
    await installMockApi(page, { sheets, tasksBySheet });
    await seedPreferences(page, { mode: 'glance', theme: 'dark', showClock: true });
    await page.goto('/');
    await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('clock-header')).toBeVisible();
    await page.screenshot({
      path: 'docs/evidence/M3.6/vp1-narrow-420x1080-glance-dark-clock-enabled.png',
      fullPage: true,
    });
  });

  // The Legend (M3.6-D3, resolved 2026-07-30) collapsed and expanded. Both
  // states are Gate B evidence: collapsed is what Glance mode actually costs
  // by default (one line), expanded is the approved mockup's Status/Due/
  // Priority key and the only surface that paints text directly on every one
  // of the seven band colors at small size.
  test('vp1 primary narrow — Glance with the Legend expanded', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 1080 });
    await freezeClock(page);
    const { sheets, tasksBySheet } = normalFixture();
    await installMockApi(page, { sheets, tasksBySheet });
    await seedPreferences(page, { mode: 'glance', theme: 'dark' });
    await page.goto('/');
    await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('legend-toggle').click();
    await expect(page.getByTestId('legend-body')).toBeVisible();
    await page.screenshot({
      path: 'docs/evidence/M3.6/vp1-narrow-420x1080-glance-dark-legend-expanded.png',
      fullPage: true,
    });
  });

  test('vp3 full desktop — Glance with the Legend expanded, all seven bands', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await freezeClock(page);
    const { sheets, tasksBySheet } = normalFixture();
    await installMockApi(page, { sheets, tasksBySheet });
    await seedPreferences(page, { mode: 'glance', theme: 'dark' });
    await page.goto('/');
    await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('legend-toggle').click();
    await expect(page.getByTestId('legend-body')).toBeVisible();
    await page.screenshot({
      path: 'docs/evidence/M3.6/vp3-desktop-1920x1080-glance-dark-legend-expanded.png',
      fullPage: true,
    });
  });
});
