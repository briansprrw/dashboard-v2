// Shared cross-viewport/cross-project core-workflow evidence for M3.6 (M3's
// own required evidence: "Browser-test matrix and results", "Task mutation
// failure/denial test results"). Drives the real rendered app via the
// mocked API (`mock-api.ts`), proving the same task/action layer and
// workflow work identically everywhere — M3's own acceptance criterion ("No
// viewport uses a separate domain/workflow implementation"), the
// implementation plan's requirement ("The same browser test performs
// create/edit/complete/move/recycle on every supported viewport project",
// `docs/plans/2026-07-22-dash2-implementation-plan.md:194`), and the
// architecture doc's named-project matrix
// (`docs/plans/2026-07-22-dash2-technical-architecture.md:817-824`).
//
// Two distinct coverage axes, kept in one file rather than two, since both
// exist to prove "the same shared spec," not two different specs:
//   1. All nine M0.4 reference *dimensions*, run once under the default
//      `chromium-desktop` project (this project's own responsibility per
//      `playwright.config.ts`'s `testMatch` scoping).
//   2. The same shared workflow, run once per named *browser/device
//      project* (Chromium narrow/full/phone, WebKit phone, iPad portrait/
//      landscape, smart-frame touch/no-hover, Firefox smoke) at that
//      project's own configured viewport — proving the workflow itself,
//      not just CSS breakpoints, works across real engines and input
//      types. Found missing entirely by Codex's independent M3.6 re-review
//      (M3.6-QA-03): the original correction ran all nine dimensions but
//      only ever inside one default desktop Chromium context.

import { expect, test } from '@playwright/test';

import { freezeClock, normalFixture } from './fixtures';
import { installMockApi } from './mock-api';
import { seedPreferences } from './preferences';

const REFERENCE_VIEWPORTS = [
  { id: 'vp1', width: 420, height: 1080 },
  { id: 'vp2', width: 640, height: 1080 },
  { id: 'vp3', width: 1920, height: 1080 },
  { id: 'vp4', width: 360, height: 800 },
  { id: 'vp5', width: 430, height: 932 },
  { id: 'vp6', width: 820, height: 1180 },
  { id: 'vp7', width: 1180, height: 820 },
  { id: 'vp8', width: 1280, height: 800 },
  { id: 'vp9', width: 1920, height: 1080 },
];

async function runCoreWorkflow(page: import('@playwright/test').Page) {
  await freezeClock(page);
  const { sheets, tasksBySheet } = normalFixture();
  const store = await installMockApi(page, { sheets, tasksBySheet });
  await seedPreferences(page, { mode: 'standard', theme: 'dark' });
  await page.goto('/');
  await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });

  // --- Create ---
  await page.getByTestId('create-task-button').first().click();
  const createForm = page.getByTestId('task-form');
  await expect(createForm).toBeVisible();
  await createForm.getByTestId('task-form-name').fill('New workflow task');
  await createForm.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText('New workflow task')).toBeVisible({ timeout: 5000 });

  // --- Edit ---
  const editedRow = page.getByTestId('task-row').filter({ hasText: 'New workflow task' });
  await editedRow.getByRole('button', { name: 'Edit task' }).click();
  const editForm = page.getByTestId('task-form');
  await expect(editForm).toBeVisible();
  await editForm.getByTestId('task-form-name').fill('Edited workflow task');
  await editForm.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Edited workflow task')).toBeVisible({ timeout: 5000 });

  // --- Quick complete + Undo ---
  const completableRow = page.getByTestId('task-row').filter({ hasText: 'Edited workflow task' });
  await completableRow.getByRole('button', { name: 'Quick complete' }).click();
  const undoBanner = page.getByTestId('undo-banner');
  await expect(undoBanner).toBeVisible({ timeout: 5000 });
  await undoBanner.getByRole('button', { name: 'Undo' }).click();
  await expect(undoBanner).toBeHidden({ timeout: 5000 });

  // --- Move ---
  const moveRow = page.getByTestId('task-row').filter({ hasText: 'Edited workflow task' });
  await moveRow.getByRole('button', { name: 'Move task' }).click();
  const moveDialog = page.getByTestId('move-task-dialog');
  await expect(moveDialog).toBeVisible();
  await moveDialog.getByTestId('move-destination-select').selectOption({ label: 'Work' });
  await moveDialog.getByRole('button', { name: 'Move' }).click();
  await expect(moveDialog).toBeHidden({ timeout: 5000 });

  // --- Recycle + Undo (restore) ---
  const recycleRow = page.getByTestId('task-row').filter({ hasText: 'Edited workflow task' });
  await recycleRow.getByTestId('task-row-recycle').click();
  await expect(page.getByText('Edited workflow task')).toBeHidden({ timeout: 5000 });
  const recycleUndoBanner = page.getByTestId('undo-banner');
  await expect(recycleUndoBanner).toBeVisible({ timeout: 5000 });
  await recycleUndoBanner.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Edited workflow task')).toBeVisible({ timeout: 5000 });

  // Server-visible state check: the task genuinely moved to Work and is not recycled.
  const finalTask = [...store.tasks.values()].find((t) => t.name === 'Edited workflow task');
  expect(finalTask?.sheetId).toBe('sheet-2');
  expect(finalTask?.recycledAt).toBeNull();
}

async function runDenialWorkflow(page: import('@playwright/test').Page) {
  await freezeClock(page);
  const { sheets, tasksBySheet } = normalFixture();
  await installMockApi(page, { sheets, tasksBySheet, forceMutationStatus: 403 });
  await seedPreferences(page, { mode: 'standard', theme: 'dark' });
  await page.goto('/');
  await expect(page.getByTestId(/app-state-(ready|stale)/)).toBeVisible({ timeout: 15_000 });

  const row = page.getByTestId('task-row').first();
  await row.getByRole('button', { name: 'Quick complete' }).click();
  await expect(page.getByTestId('action-error')).toBeVisible({ timeout: 5000 });
}

// Axis 1: all nine M0.4 dimensions, `chromium-desktop` only (see
// `playwright.config.ts`'s `testMatch` scoping — every other project runs
// this same file once at its own configured viewport instead, below).
test.describe('workflow across all nine M0.4 reference dimensions (chromium-desktop)', () => {
  for (const vp of REFERENCE_VIEWPORTS) {
    test.describe(`${vp.id} (${vp.width}x${vp.height})`, () => {
      test('create, edit, quick-complete, move, recycle, and 10s Undo', async ({
        page,
      }, testInfo) => {
        test.skip(testInfo.project.name !== 'chromium-desktop', 'dimension axis runs once, here');
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await runCoreWorkflow(page);
      });

      test('a denied mutation surfaces a visible error, not a silent failure', async ({
        page,
      }, testInfo) => {
        test.skip(testInfo.project.name !== 'chromium-desktop', 'dimension axis runs once, here');
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await runDenialWorkflow(page);
      });
    });
  }
});

// Axis 2: named browser/device projects, each at its own configured
// viewport (`playwright.config.ts`). Skipped on `chromium-desktop` itself —
// that project already gets full dimensional coverage from Axis 1 above,
// so repeating an unparameterized run there would be redundant, not
// additional evidence.
test.describe('workflow at the project-configured viewport (named device/browser projects)', () => {
  test('create, edit, quick-complete, move, recycle, and 10s Undo', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'chromium-desktop', 'covered by Axis 1 above');
    await runCoreWorkflow(page);
  });

  test('a denied mutation surfaces a visible error, not a silent failure', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'chromium-desktop', 'covered by Axis 1 above');
    await runDenialWorkflow(page);
  });
});
