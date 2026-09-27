import { test, expect, type Page } from '@playwright/test';
import { MOCK_NOTES, TEACH_SHORT_RESPONSE } from './helpers/fixtures';
import {
  mockAiApis,
  startEncodeFromNotes,
  confirmReadiness,
  expectStage,
  completeWorkout,
} from './helpers/mocks';

/** Serves the short (3-segment) lesson so the exits are two clicks away. */
async function mockShortLesson(page: Page) {
  await mockAiApis(page);
  await page.route('**/api/teach', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEACH_SHORT_RESPONSE),
    })
  );
}

/** Launchpad -> Teach Me pre-roll -> generated lesson, ready to play. */
async function playShortLesson(page: Page) {
  await page.goto('/');
  await page.getByPlaceholder(/Paste study material/).fill(MOCK_NOTES);
  await page.getByRole('button', { name: /teach me/i }).first().click();
  await expect(page.getByText('Lesson Pre-Roll')).toBeVisible();
  await page.getByRole('button', { name: /generate lesson/i }).click();
  await expect(page.getByText('Threshold: The Two-Minute Version')).toBeVisible();
}

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

  test('a detailed lesson shows objectives, the causal why and the misconception radar', async ({ page }) => {
    await mockShortLesson(page);
    await playShortLesson(page);

    // The brief: hook, payoff, and what the learner will be able to do.
    const intro = page.getByTestId('teach-intro');
    await expect(intro).toBeVisible();
    await expect(intro).toContainText('What flips it in a millisecond?');
    await expect(intro).toContainText('State why -55 mV is the trigger and not a coincidence');

    // Depth is visible, not just promised: the causal why and the trap.
    await expect(page.getByText('The channel protein senses the field across the membrane')).toBeVisible();
    await expect(page.getByText('The Na+/K+ pump reverses to cause the spike')).toBeVisible();
    await expect(page.getByText('The pump never reverses; the spike is pure Na+ conductance.')).toBeVisible();

    // The glossary travels with the lesson.
    await page.getByRole('button', { name: /glossary/i }).click();
    await expect(page.getByTestId('teach-glossary')).toContainText(
      'the voltage at which voltage-gated Na+ channels open'
    );
  });

  test('the lesson ends with START ENCODING / SAVE IT FOR LATER, and saving parks it for resumption', async ({ page }) => {
    await mockShortLesson(page);
    await playShortLesson(page);

    // Two short segments, then the exit panel takes over the end of the lesson.
    await expect(page.getByText('The Threshold')).toBeVisible();
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page.getByText('Where threshold stops being useful')).toBeVisible();
    await page.getByRole('button', { name: /continue/i }).click();

    const handoff = page.getByTestId('teach-encoding-handoff');
    await expect(handoff).toBeVisible();
    await expect(handoff).toContainText('Encoding is the next step, not part of this lesson');
    // The lesson's own payload is what gets encoded — no lesson body ever told
    // the learner to encode mid-lesson.
    await expect(handoff).toContainText('Why does -55 mV open the Na+ gates?');

    await expect(page.getByTestId('teach-start-encoding')).toBeVisible();
    await page.getByTestId('teach-save-for-later').click();
    await expect(page.getByTestId('teach-saved-note')).toContainText('Saved for later');

    // Closing keeps the lesson (only the explicit discard drops it), and the
    // pre-roll offers it back.
    await page.getByRole('button', { name: /close lesson/i }).click();
    await page.getByRole('button', { name: /teach me/i }).first().click();
    const banner = page.getByTestId('teach-resume-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('lesson complete');
    await expect(banner).toContainText('2 encode prompts');
    await banner.getByRole('button', { name: /resume/i }).click();
    // Resuming a finished lesson lands back on its exit panel, which is the
    // point: "later" means you can still start encoding from where you left off.
    await expect(page.getByText('Threshold is a mechanical gate, not a magic number.')).toBeVisible();
    await expect(page.getByTestId('teach-start-encoding')).toBeVisible();

    // It survives a reload: "later" can genuinely mean tomorrow. (The notes
    // field itself is not persisted, so the returned learner pastes their
    // material again — the lesson is still waiting.)
    await page.reload();
    await page.getByPlaceholder(/Paste study material/).fill(MOCK_NOTES);
    await page.getByRole('button', { name: /teach me/i }).first().click();
    await expect(page.getByTestId('teach-resume-banner')).toContainText('Threshold: The Two-Minute Version');
  });

  test('START ENCODING hands the finished lesson straight into the workbench', async ({ page }) => {
    await mockShortLesson(page);
    await playShortLesson(page);

    await page.getByRole('button', { name: /continue/i }).click();
    await page.getByRole('button', { name: /continue/i }).click();

    await page.getByTestId('teach-start-encoding').click();

    // Teach Me closes and the encode pipeline runs from the same notes.
    await expect(page.getByTestId('teach-start-encoding')).toHaveCount(0);
    await expectStage(page, 1);
  });
});
