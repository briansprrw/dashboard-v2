// Automated accessibility scan for M3.6's required evidence ("Accessibility
// scan plus manual keyboard/focus notes"). Runs axe-core's WCAG 2.0/2.1 A/AA
// ruleset against the rendered app at representative viewports and modes.
// This complements, not replaces, the manual keyboard/focus notes recorded
// separately (`docs/evidence/M3.6/manual-keyboard-focus-notes.md`) — axe
// cannot verify actual tab order or focus-trap behavior, only static/ARIA
// issues.

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { freezeClock, normalFixture } from './fixtures';
import { installMockApi } from './mock-api';
import { seedPreferences } from './preferences';

const SCENARIOS = [
  {
    name: 'vp1 primary narrow, Glance, dark',
    width: 420,
    height: 1080,
    mode: 'glance' as const,
    theme: 'dark' as const,
  },
  {
    name: 'vp3 full desktop, Standard, dark',
    width: 1920,
    height: 1080,
    mode: 'standard' as const,
    theme: 'dark' as const,
  },
  {
    name: 'vp1 primary narrow, Standard, light',
    width: 420,
    height: 1080,
    mode: 'standard' as const,
    theme: 'light' as const,
  },
];

for (const scenario of SCENARIOS) {
  test(`accessibility scan — ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await freezeClock(page);
    const { sheets, tasksBySheet } = normalFixture();
    await installMockApi(page, { sheets, tasksBySheet });
    await seedPreferences(page, { mode: scenario.mode, theme: scenario.theme });
    await page.goto('/');
    await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );
    if (critical.length > 0) {
      console.log(JSON.stringify(critical, null, 2));
    }
    expect(critical, `Critical/serious axe violations found — see console output above`).toEqual(
      []
    );
  });
}

test('accessibility scan — Create Task dialog open (focus trap surface)', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 1080 });
  await freezeClock(page);
  const { sheets, tasksBySheet } = normalFixture();
  await installMockApi(page, { sheets, tasksBySheet });
  await seedPreferences(page, { mode: 'standard', theme: 'dark' });
  await page.goto('/');
  await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('create-task-button').first().click();
  await expect(page.getByTestId('task-form')).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const critical = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious'
  );
  if (critical.length > 0) {
    console.log(JSON.stringify(critical, null, 2));
  }
  expect(
    critical,
    `Critical/serious axe violations found with dialog open — see console output above`
  ).toEqual([]);
});

// The Legend (M3.6-D3) is collapsed by default, so the scans above only ever
// see its toggle. Expanded it adds ~17 chips including the seven due-band
// swatches, which are the one surface in the app that paints text directly on
// a band color at small size — exactly where a contrast regression would land.
test('accessibility scan — Legend expanded (due-band swatch contrast)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await freezeClock(page);
  const { sheets, tasksBySheet } = normalFixture();
  await installMockApi(page, { sheets, tasksBySheet });
  await seedPreferences(page, { mode: 'glance', theme: 'dark' });
  await page.goto('/');
  await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('legend-toggle').click();
  await expect(page.getByTestId('legend-body')).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const critical = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious'
  );
  if (critical.length > 0) {
    console.log(JSON.stringify(critical, null, 2));
  }
  expect(
    critical,
    `Critical/serious axe violations found with the Legend expanded — see console output above`
  ).toEqual([]);
});

// The same swatches in the Light theme, whose band palette is a translation
// rather than an approved mockup rendering and therefore the likelier of the
// two to drift.
test('accessibility scan — Legend expanded, light theme', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await freezeClock(page);
  const { sheets, tasksBySheet } = normalFixture();
  await installMockApi(page, { sheets, tasksBySheet });
  await seedPreferences(page, { mode: 'glance', theme: 'light' });
  await page.goto('/');
  await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('legend-toggle').click();
  await expect(page.getByTestId('legend-body')).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const critical = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious'
  );
  if (critical.length > 0) {
    console.log(JSON.stringify(critical, null, 2));
  }
  expect(
    critical,
    `Critical/serious axe violations found with the Legend expanded (light) — see console output above`
  ).toEqual([]);
});
