// Local-storage inspection for M3.6's required evidence ("Local-storage
// inspection showing no private task content") and CLAUDE.md's guardrail
// ("Task names and notes are private content... not persisted in browser
// storage unless explicitly approved"). Drives a full interaction pass
// (preferences + every task mutation) and then inspects every `localStorage`
// key/value pair for task name/note content.

import { expect, test } from '@playwright/test';

import { freezeClock, normalFixture } from './fixtures';
import { installMockApi } from './mock-api';
import { seedPreferences } from './preferences';

const TASK_NAMES_AND_NOTES = [
  'Pay the water bill',
  'Pick up dry cleaning',
  'Renew car registration',
  'Plan summer trip',
  'Organize the garage',
  'Buy groceries',
  'Prepare quarterly report',
  'Review pull requests',
  'Check flight prices after the holiday',
];

test('localStorage after a full preference + mutation pass contains no task name/note content', async ({
  page,
}) => {
  await freezeClock(page);
  const { sheets, tasksBySheet } = normalFixture();
  await installMockApi(page, { sheets, tasksBySheet });
  await seedPreferences(page, { mode: 'standard', theme: 'dark' });
  await page.goto('/');
  await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });

  // Drive real preference changes.
  await page.getByRole('button', { name: 'Glance' }).click();
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'compact' }).click();
  await page.getByRole('button', { name: 'Standard' }).click();

  // Create a task with a distinctive private-content name and note.
  await page.getByTestId('create-task-button').first().click();
  const form = page.getByTestId('task-form');
  await form.getByTestId('task-form-name').fill('Local-storage probe task name');
  await form.locator('textarea').fill('Local-storage probe note content');
  await form.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText('Local-storage probe task name')).toBeVisible({ timeout: 5000 });

  const dump = await page.evaluate(() => {
    const out: Record<string, string> = {};
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key) out[key] = window.localStorage.getItem(key) ?? '';
    }
    return out;
  });

  const serialized = JSON.stringify(dump);
  const forbiddenStrings = [
    ...TASK_NAMES_AND_NOTES,
    'Local-storage probe task name',
    'Local-storage probe note content',
  ];
  const leaked = forbiddenStrings.filter((s) => serialized.includes(s));
  expect(leaked, `Task content leaked into localStorage: ${JSON.stringify(leaked)}`).toEqual([]);

  // Only the known device-preferences key should exist.
  expect(Object.keys(dump)).toEqual(['dash2.preferences.v1']);
});
