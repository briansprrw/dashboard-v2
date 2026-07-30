// Regression coverage for M3-DEF-09/M3.6-QA-05 (found during M3.6 self-review
// and Codex's independent re-review): task-row action buttons rendered well
// under any reasonable touch-target minimum (21-23px measured), and once
// fixed with an invisible `::before` hit-area extension, Codex's re-review
// found that fix itself unsafe — the four buttons had no guaranteed real
// spacing between them, so adjacent 44px hit-areas overlapped at narrow
// widths, and a real click on the visibly-rendered Move button activated
// the overlapping Recycle zone instead (confirmed with a reproducible
// trace: no move dialog appeared, the Undo banner did).
//
// The corrected fix (`global.css`) uses real, guaranteed spacing instead: an
// explicit flex `gap` on `.task-row__actions` plus a real `min-width`/
// `min-height: 44px` on every button. The clickable area *is* the rendered
// element — there is no separate geometry that can silently drift out of
// sync with the button layout, which is what made the pseudo-element
// approach fail. This spec measures the buttons' own `getBoundingClientRect()`
// (not a pseudo-element) and, per Codex's required regression evidence,
// proves every adjacent action dispatches only its own action by clicking
// each button in turn and asserting only the expected effect occurred.

import { expect, test } from '@playwright/test';

import { freezeClock, normalFixture } from './fixtures';
import { installMockApi } from './mock-api';
import { seedPreferences } from './preferences';

const MIN_TOUCH_TARGET_PX = 44;

async function measureButtons(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('.task-row__actions button'));
    return buttons.map((b) => {
      const r = b.getBoundingClientRect();
      return { text: b.textContent, x: r.x, y: r.y, width: r.width, height: r.height };
    });
  });
}

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

test('task-row action buttons meet the 44x44px minimum at the phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await freezeClock(page);
  const { sheets, tasksBySheet } = normalFixture();
  await installMockApi(page, { sheets, tasksBySheet });
  await seedPreferences(page, { mode: 'standard', theme: 'dark' });
  await page.goto('/');
  await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });

  const sizes = await measureButtons(page);
  expect(sizes.length).toBeGreaterThan(0);
  for (const size of sizes) {
    expect(size.width, `${size.text} width`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
    expect(size.height, `${size.text} height`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  }
});

test('task-row action buttons meet the 44x44px minimum in compact density', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await freezeClock(page);
  const { sheets, tasksBySheet } = normalFixture();
  await installMockApi(page, { sheets, tasksBySheet });
  await seedPreferences(page, { mode: 'standard', theme: 'dark', density: 'compact' });
  await page.goto('/');
  await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });

  const sizes = await measureButtons(page);
  expect(sizes.length).toBeGreaterThan(0);
  for (const size of sizes) {
    expect(size.width, `${size.text} width`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
    expect(size.height, `${size.text} height`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  }
});

test('adjacent action buttons never overlap, at any viewport in the reference set', async ({
  page,
}) => {
  for (const width of [360, 420, 640, 820, 1180, 1920]) {
    await page.setViewportSize({ width, height: 1080 });
    await freezeClock(page);
    const { sheets, tasksBySheet } = normalFixture();
    await installMockApi(page, { sheets, tasksBySheet });
    await seedPreferences(page, { mode: 'standard', theme: 'dark' });
    await page.goto('/');
    await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });

    const sizes = await measureButtons(page);
    for (let i = 0; i < sizes.length; i++) {
      const a = sizes[i];
      if (!a) continue;
      for (let j = i + 1; j < sizes.length; j++) {
        const b = sizes[j];
        if (!b) continue;
        expect(
          rectsOverlap(a, b),
          `at ${width}px: "${a.text}" and "${b.text}" hit-areas overlap`
        ).toBe(false);
      }
    }
  }
});

test('a click on each action button dispatches only that action, not a neighbor (Codex M3.6-QA-05)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await freezeClock(page);
  const { sheets, tasksBySheet } = normalFixture();
  await installMockApi(page, { sheets, tasksBySheet });
  await seedPreferences(page, { mode: 'standard', theme: 'dark' });
  await page.goto('/');
  await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });

  const row = page.getByTestId('task-row').first();

  // Move must open the move dialog, not trigger Recycle (the exact
  // misrouting Codex's trace reproduced against the pseudo-element approach).
  await row.getByRole('button', { name: 'Move task' }).click();
  await expect(page.getByTestId('move-task-dialog')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('undo-banner')).toBeHidden();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('move-task-dialog')).toBeHidden();

  // Edit must open the edit form, not trigger any other action.
  await row.getByRole('button', { name: 'Edit task' }).click();
  await expect(page.getByTestId('task-form')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('undo-banner')).toBeHidden();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('task-form')).toBeHidden();

  // Quick complete must trigger completion (visible via the Undo banner),
  // not open a dialog.
  await row.getByRole('button', { name: 'Quick complete' }).click();
  await expect(page.getByTestId('undo-banner')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('move-task-dialog')).toBeHidden();
  await expect(page.getByTestId('task-form')).toBeHidden();
});

test('a click at each button visible edge lands on that button, not its neighbor', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await freezeClock(page);
  const { sheets, tasksBySheet } = normalFixture();
  await installMockApi(page, { sheets, tasksBySheet });
  await seedPreferences(page, { mode: 'standard', theme: 'dark' });
  await page.goto('/');
  await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });

  const moveButton = page.getByRole('button', { name: 'Move task' }).first();
  await moveButton.scrollIntoViewIfNeeded();
  const box = await moveButton.boundingBox();
  if (!box) throw new Error('Move button not found');

  // Click 2px inside the button's left edge — the exact class of point
  // Codex's trace found landing on the overlapping Recycle zone before
  // this fix (there "4 pixels inside the visibly rendered Move button").
  await page.mouse.click(box.x + 2, box.y + box.height / 2);
  await expect(page.getByTestId('move-task-dialog')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('undo-banner')).toBeHidden();
});
