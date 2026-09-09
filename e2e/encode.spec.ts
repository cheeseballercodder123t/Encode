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
    await page.getByPlaceholder('STAGE1_FIELD1').fill('Layers learn edge detectors first.');
    await page.getByPlaceholder('STAGE1_FIELD2').fill('Backprop assigns credit to earlier layers.');
    await page.getByRole('button', { name: 'Finish Workout' }).click();

    await expect(page.getByText('Cognitive Encoding Workout Complete!')).toBeVisible();
  });
});

test.describe('Offline resilience', () => {
  test('going offline after load falls back to the local generator', async ({ page, context }) => {
    await page.goto('/');

    // Kill the network after the app has loaded : generation must still work
    await context.setOffline(true);
    await page.getByPlaceholder(/Paste study material/).fill(MOCK_NOTES);
    await page.getByRole('button', { name: 'Build Cognitive Schema' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();

    await confirmReadiness(page);
    // The offline generator produced a workout entirely client-side
    await expectStage(page, 1);
  });
});
