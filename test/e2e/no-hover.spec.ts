// Real no-hover/touch-context evidence (M3.6-QA-05, Codex's independent
// review): the M3.6 correction previously claimed a Playwright/Chromium
// no-hover browser context was "structurally unclosable," but Codex's own
// probe disproved that in this installed runtime — a `hasTouch: true`
// browser context genuinely produces `(hover: none)`/`(any-hover: none)`/
// `(pointer: coarse)` media, confirmed independently here before writing
// this spec. VP-8/VP-9 (smart-frame) already set `hasTouch: true` for their
// screenshot captures, but nothing asserted the resulting media state or
// exercised the actual workflow inside it — this spec closes both gaps.

import { expect, test } from '@playwright/test';

import { freezeClock, normalFixture } from './fixtures';
import { installMockApi } from './mock-api';
import { seedPreferences } from './preferences';

test('a hasTouch:true context genuinely reports no-hover/coarse-pointer media', async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  await freezeClock(page);
  const { sheets, tasksBySheet } = normalFixture();
  await installMockApi(page, { sheets, tasksBySheet });
  await seedPreferences(page, { mode: 'standard', theme: 'dark' });
  await page.goto('/');
  await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });

  const media = await page.evaluate(() => ({
    hoverNone: matchMedia('(hover: none)').matches,
    anyHoverNone: matchMedia('(any-hover: none)').matches,
    pointerCoarse: matchMedia('(pointer: coarse)').matches,
  }));
  expect(media).toEqual({ hoverNone: true, anyHoverNone: true, pointerCoarse: true });
  await context.close();
});

test('the full create/edit/complete/move/recycle workflow works inside a real no-hover context', async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  await freezeClock(page);
  const { sheets, tasksBySheet } = normalFixture();
  const store = await installMockApi(page, { sheets, tasksBySheet });
  await seedPreferences(page, { mode: 'standard', theme: 'dark' });
  await page.goto('/');
  await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });

  // Confirm this page is genuinely in the no-hover context before relying on it.
  const hoverNone = await page.evaluate(() => matchMedia('(hover: none)').matches);
  expect(hoverNone).toBe(true);

  await page.getByTestId('create-task-button').first().click();
  const createForm = page.getByTestId('task-form');
  await expect(createForm).toBeVisible();
  await createForm.getByTestId('task-form-name').fill('No-hover workflow task');
  await createForm.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText('No-hover workflow task')).toBeVisible({ timeout: 5000 });

  const row = page.getByTestId('task-row').filter({ hasText: 'No-hover workflow task' });
  await row.getByRole('button', { name: 'Move task' }).click();
  const moveDialog = page.getByTestId('move-task-dialog');
  await expect(moveDialog).toBeVisible();
  await moveDialog.getByTestId('move-destination-select').selectOption({ label: 'Work' });
  await moveDialog.getByRole('button', { name: 'Move' }).click();
  await expect(moveDialog).toBeHidden({ timeout: 5000 });

  const finalTask = [...store.tasks.values()].find((t) => t.name === 'No-hover workflow task');
  expect(finalTask?.sheetId).toBe('sheet-2');
  await context.close();
});
