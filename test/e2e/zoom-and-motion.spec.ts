// High-zoom and reduced-motion evidence at the primary narrow viewport
// (VP-1), per M3's required evidence ("Accessibility scan plus manual
// keyboard/focus notes") and acceptance criterion ("Keyboard focus... high
// zoom, reduced motion, and no-hover behavior pass the approved baseline").

import { expect, test } from '@playwright/test';

import { freezeClock, normalFixture } from './fixtures';
import { installMockApi } from './mock-api';
import { seedPreferences } from './preferences';

test('primary narrow viewport at max zoom step (+3, M0 §7: 7 steps, 10%/step)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 420, height: 1080 });
  await freezeClock(page);
  const { sheets, tasksBySheet } = normalFixture();
  await installMockApi(page, { sheets, tasksBySheet });
  await seedPreferences(page, { mode: 'glance', theme: 'dark', zoom: 3 });
  await page.goto('/');
  await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });
  await page.screenshot({
    path: 'docs/evidence/M3.6/vp1-narrow-420x1080-glance-dark-zoom-max.png',
    fullPage: true,
  });
});

test('primary narrow viewport at min zoom step (-3)', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 1080 });
  await freezeClock(page);
  const { sheets, tasksBySheet } = normalFixture();
  await installMockApi(page, { sheets, tasksBySheet });
  await seedPreferences(page, { mode: 'glance', theme: 'dark', zoom: -3 });
  await page.goto('/');
  await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });
  await page.screenshot({
    path: 'docs/evidence/M3.6/vp1-narrow-420x1080-glance-dark-zoom-min.png',
    fullPage: true,
  });
});

test('reduced motion: prefers-reduced-motion is honored (no motion CSS present, confirmed by diff)', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 420, height: 1080 });
  await freezeClock(page);
  const { sheets, tasksBySheet } = normalFixture();
  await installMockApi(page, { sheets, tasksBySheet });
  await seedPreferences(page, { mode: 'glance', theme: 'dark' });
  await page.goto('/');
  await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });
  await page.screenshot({
    path: 'docs/evidence/M3.6/vp1-narrow-420x1080-glance-dark-reduced-motion.png',
    fullPage: true,
  });
  // No CSS transition/animation currently applies to any rendered element
  // (confirmed by inspecting global.css: no @keyframes, no `transition`
  // property is declared anywhere in the stylesheet as of this M3 packet
  // set), so there is nothing for `prefers-reduced-motion` to disable yet.
  // This test's captured screenshot is the evidence M3.6 requires; the
  // assertion below documents that null result rather than a UI-toggled
  // preference by design.
  const hasTransitions = await page.evaluate(() => {
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules)) {
          if (rule.cssText.includes('transition') || rule.cssText.includes('@keyframes')) {
            return true;
          }
        }
      } catch {
        // Cross-origin stylesheet; not applicable in this single-origin app.
      }
    }
    return false;
  });
  expect(hasTransitions).toBe(false);
});
