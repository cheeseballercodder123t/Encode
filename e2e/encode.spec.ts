import { test, expect } from '@playwright/test';
import { MOCK_NOTES } from './helpers/fixtures';
import {
  mockAiApis,
  startEncodeFromNotes,
  confirmReadiness,
  expectStage,
  completeWorkout,
} from './helpers/mocks';

test.describe('Main encode flow', () => {
  test('notes → generation → 2 stages → examiner check → completion → saved to history', async ({ page }) => {
    await mockAiApis(page);
    await startEncodeFromNotes(page, MOCK_NOTES);

    await completeWorkout(page);

    // Auto-saved schema appears in the history drawer
    await page.locator('button[title^="View Saved Schemas History"]').click();
    await expect(page.getByText('Saved Schemas')).toBeVisible();
    await expect(page.getByText('Action Potentials').first()).toBeVisible();
  });

  test('a standard encode starts the schema at 100 XP, not 200 (defect 57)', async ({ page }) => {
    await mockAiApis(page);
    await startEncodeFromNotes(page, MOCK_NOTES);
    await expectStage(page, 1);

    // The award used to be `setXp(100); addXP(100)` — both through the same
    // reducer — so the rail total moved by 200 while the gain popup rendered
    // beside it said `+100`. This reads the number the learner reads.
    await expect(page.getByTestId('xp-total')).toContainText('0100');
    await expect(page.getByTestId('xp-total')).not.toContainText('0200');
  });

  test('quick diagnostic: prerequisites audit opens with mocked report', async ({ page }) => {
    await mockAiApis(page);
    await page.goto('/');
    await page.getByPlaceholder(/Paste study material/).fill(MOCK_NOTES);
    await page.getByRole('button', { name: /check prerequisites/i }).click();
    // ConceptPrerequisitesModal opened with the mocked report
    await expect(page.getByText('Prerequisite Audit')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Prerequisites for "Action Potentials"/ })).toBeVisible();
    await expect(page.getByText('Preliminary foundational concepts detected.')).toBeVisible();
  });

  test('quick diagnostic: roast my notes returns mocked professor report', async ({ page }) => {
    await mockAiApis(page);
    await page.goto('/');
    await page.getByPlaceholder(/Paste study material/).fill(MOCK_NOTES);
    await page.getByRole('button', { name: /roast notes/i }).click();
    await expect(page.getByText('You hand-waved the threshold.')).toBeVisible();
  });
});

test.describe('YouTube flow', () => {
  test('youtube URL → mocked video schema → single stage → completion', async ({ page }) => {
    await mockAiApis(page);
    await page.goto('/');

    await page.getByRole('button', { name: 'YouTube URL' }).click();
    await page
      .getByPlaceholder(/Paste lecture or educational video/)
      .fill('https://www.youtube.com/watch?v=aircAruvnKk');
    // YouTube path bypasses the confidence gate
    await page.getByRole('button', { name: 'Build Cognitive Schema' }).click();

    await confirmReadiness(page);
    await expectStage(page, 1);
    // The YouTube path's own baseline (120), awarded once: the same defect-57
    // doubling ran through it.
    await expect(page.getByTestId('xp-total')).toContainText('0120');
    await page.getByPlaceholder('STAGE1_FIELD1').fill('Layers learn edge detectors first.');
    await page.getByPlaceholder('STAGE1_FIELD2').fill('Backprop assigns credit to earlier layers.');
    await page.getByRole('button', { name: /FINISH/ }).click();

    await expect(page.getByText('Clean cards, ready for Anki.')).toBeVisible();
  });
});

test.describe('Offline resilience', () => {
  test('going offline after load builds the workout on this device', async ({ page, context }) => {
    await page.goto('/');

    // Kill the network after the app has loaded
    await context.setOffline(true);
    // This scenario used to pin an ALERT, because an offline generation could
    // only fail. It is now a fallback rather than a failure (defect 42): nothing
    // is reported as an error, and the on-device generator produces the session.
    const dialogs: string[] = [];
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message());
      void dialog.accept();
    });

    await page.getByPlaceholder(/Paste study material/).fill(MOCK_NOTES);
    await page.getByRole('button', { name: 'Build Cognitive Schema' }).click();

    await expect(page.getByTestId('offline-fallback-banner')).toHaveAttribute('data-workout-origin', 'offline');
    // Five deterministic stages: the generator's own workout, not a mocked model
    // payload (this spec mocks no AI routes at all).
    await expect(page.getByText('01/05')).toBeVisible();
    expect(dialogs).toEqual([]);
  });
});
