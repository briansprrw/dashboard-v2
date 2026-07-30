// Real-browser keyboard-only evidence for M3.6's required "manual keyboard/
// focus notes" — actual `Tab`/`Shift+Tab`/`Escape` key events dispatched by
// Playwright through the real rendered app, not jsdom simulation (the
// `use-dialog-focus` hook already has jsdom coverage in `test/web/`; this is
// the real-browser confirmation M3.6 exists to add). See
// `docs/evidence/M3.6/manual-keyboard-focus-notes.md` for the narrative
// write-up this spec's assertions back.

import { expect, test } from '@playwright/test';

import { normalFixture } from './fixtures';
import { installMockApi } from './mock-api';
import { seedPreferences } from './preferences';

test('Tab order reaches the first task row create button without a pointer', async ({ page }) => {
  const { sheets, tasksBySheet } = normalFixture();
  await installMockApi(page, { sheets, tasksBySheet });
  await seedPreferences(page, { mode: 'standard', theme: 'dark' });
  await page.goto('/');
  await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });

  // Tab from the top of the document until the first "+ Task" button is reached.
  let reached = false;
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    const active = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    if (active === 'create-task-button') {
      reached = true;
      break;
    }
  }
  expect(reached).toBe(true);
});

test('opening the create-task dialog with Enter moves focus inside it, and Escape closes and restores focus', async ({
  page,
}) => {
  const { sheets, tasksBySheet } = normalFixture();
  await installMockApi(page, { sheets, tasksBySheet });
  await seedPreferences(page, { mode: 'standard', theme: 'dark' });
  await page.goto('/');
  await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });

  const createButton = page.getByTestId('create-task-button').first();
  await createButton.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByTestId('task-form');
  await expect(dialog).toBeVisible();
  const nameInput = page.getByTestId('task-form-name');
  await expect(nameInput).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(createButton).toBeFocused();
});

test('Tab is trapped inside the create-task dialog (Shift+Tab from the first field reaches the last, not the background)', async ({
  page,
}) => {
  const { sheets, tasksBySheet } = normalFixture();
  await installMockApi(page, { sheets, tasksBySheet });
  await seedPreferences(page, { mode: 'standard', theme: 'dark' });
  await page.goto('/');
  await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });

  await page.getByTestId('create-task-button').first().click();
  const dialog = page.getByTestId('task-form');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('task-form-name')).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  const activeIsInsideDialog = await page.evaluate(() => {
    const dialogEl = document.querySelector('[data-testid="task-form"]');
    return dialogEl?.contains(document.activeElement) ?? false;
  });
  expect(activeIsInsideDialog).toBe(true);
});

test('background content is inert while a dialog is open (not reachable by Tab)', async ({
  page,
}) => {
  const { sheets, tasksBySheet } = normalFixture();
  await installMockApi(page, { sheets, tasksBySheet });
  await seedPreferences(page, { mode: 'standard', theme: 'dark' });
  await page.goto('/');
  await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });

  await page.getByTestId('create-task-button').first().click();
  await expect(page.getByTestId('task-form')).toBeVisible();

  const backgroundIsInert = await page.evaluate(() => {
    const rows = document.querySelectorAll('[data-testid="task-row"]');
    return rows.length > 0 && Array.from(rows).every((row) => row.closest('[inert]') !== null);
  });
  expect(backgroundIsInert).toBe(true);
});
