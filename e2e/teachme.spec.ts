import { test, expect } from '@playwright/test';
import { MOCK_NOTES } from './helpers/fixtures';
import {
  mockAiApis,
  startEncodeFromNotes,
  confirmReadiness,
  expectStage,
  completeWorkout,
} from './helpers/mocks';

test.describe('Teach Me interactive lesson', () => {
  test('launchpad TEACH ME opens the pre-roll, plays a concept and a checkpoint, XP increases', async ({ page }) => {
    await mockAiApis(page);
    await page.goto('/');
    await page.getByPlaceholder(/Paste study material/).fill(MOCK_NOTES);

    // Pre-roll opens: style chips + sliders + generate button
    await page.getByRole('button', { name: /teach me/i }).first().click();
    await expect(page.getByText('Lesson Pre-Roll')).toBeVisible();
    await page.getByRole('button', { name: /generate lesson/i }).click();

    // Segment 1/6: first concept renders from the mocked lesson
    await expect(page.getByText('The Resting Membrane')).toBeVisible();
    await expect(page.getByText('1/6')).toBeVisible();
    await expect(page.getByText('XP 0')).toBeVisible();

    // Continue to the second concept, then the MCQ checkpoint
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page.getByText('Firing the Threshold')).toBeVisible();
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page.getByText('What triggers the rapid depolarization phase?')).toBeVisible();

    // Wrong pick shows trap feedback; then retry for the correct pick
    await page.getByRole('button', { name: /passive k\+ leak alone/i }).click();
    await expect(page.getByText('Confusable lookalike detected.')).toBeVisible();
    await page.getByRole('button', { name: /try again/i }).click();
    await page.getByRole('button', { name: /voltage-gated na\+ channels opening/i }).click();
    await expect(page.getByText('XP 15')).toBeVisible();

    // Continue into the guided worked example
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page.getByText('Worked Example')).toBeVisible();
    await expect(page.getByText('Walk through one full cycle.')).toBeVisible();
  });

  test('per-stage TEACH ME THIS teaches the stuck stage with its mechanism context', async ({ page }) => {
    await mockAiApis(page);
    await startEncodeFromNotes(page, MOCK_NOTES);
    await confirmReadiness(page);
    await expectStage(page, 1);

    await page.getByRole('button', { name: /teach me this/i }).click();
    await expect(page.getByText('Lesson Pre-Roll')).toBeVisible();
    await page.getByRole('button', { name: /generate lesson/i }).click();
    await expect(page.getByText('The Resting Membrane')).toBeVisible();
  });

  test('completed-session TEACH ME re-teaches the full encoded schema', async ({ page }) => {
    await mockAiApis(page);
    await startEncodeFromNotes(page, MOCK_NOTES);
    await completeWorkout(page);

    await page.getByRole('button', { name: /teach me \(interactive lesson\)/i }).click();
    await expect(page.getByText('Lesson Pre-Roll')).toBeVisible();
    await page.getByRole('button', { name: /generate lesson/i }).click();
    await expect(page.getByText('Action Potentials: The Voltage Story')).toBeVisible();
  });
});
