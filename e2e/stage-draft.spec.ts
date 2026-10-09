import { test, expect } from '@playwright/test';
import { MOCK_NOTES, P1_FIELD1, P1_FIELD2 } from './helpers/fixtures';
import {
  mockAiApis,
  startEncodeFromNotes,
  confirmReadiness,
  expectStage,
  completeWorkout,
} from './helpers/mocks';

/**
 * The visible stage's typing, across a reload (defect 37).
 *
 * The fields on screen live in React state and only reach `userResponses` on
 * Submit/Skip, so a reload mid-stage used to come back to empty boxes and take
 * the unsubmitted paragraph with it — the YouTube and lab paths survived the
 * same reload because both checkpoint as they go, which is what made this one
 * look like data loss rather than a limitation.
 *
 * These specs drive the real page: type, reload, and the work is offered back
 * and restored word for word. The unit suite (`tests/unit/stage-draft.test.ts`)
 * pins the store's rules; this proves the browser actually writes and reads it.
 */

const TYPED_FIELD1 = 'Sodium rushes in through the voltage-gated channels.';
const TYPED_FIELD2 = 'The membrane crossed threshold, so the gates opened.';

test.describe('mid-stage reload keeps unsubmitted typing', () => {
  test('typing on stage 1 survives a reload and comes back on resume', async ({ page }) => {
    await mockAiApis(page);
    await startEncodeFromNotes(page, MOCK_NOTES);
    await confirmReadiness(page);
    await expectStage(page, 1);

    await page.getByPlaceholder(P1_FIELD1).fill(TYPED_FIELD1);
    await page.getByPlaceholder(P1_FIELD2).fill(TYPED_FIELD2);

    // The write is debounced, so prove it landed BEFORE the reload: surviving
    // by accident on an unload flush would not be the same guarantee.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const raw = window.localStorage.getItem('deepencode_stage_draft_v1');
          return raw ? JSON.parse(raw).field1 : null;
        })
      )
      .toBe(TYPED_FIELD1);

    await page.reload();

    // The launchpad offers the stage back, naming where the learner stopped.
    const banner = page.getByTestId('stage-draft-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('You were typing on stage 1');
    await expect(banner).toContainText('still there');

    await page.getByRole('button', { name: 'Resume stage 1' }).click();

    // And every word is back on the stage it was typed on.
    await expectStage(page, 1);
    await expect(page.getByPlaceholder(P1_FIELD1)).toHaveValue(TYPED_FIELD1);
    await expect(page.getByPlaceholder(P1_FIELD2)).toHaveValue(TYPED_FIELD2);
  });

  test('a finished session leaves no stage behind to recover', async ({ page }) => {
    await mockAiApis(page);
    await startEncodeFromNotes(page, MOCK_NOTES);
    await completeWorkout(page);

    await page.reload();

    // The session completed and was saved as a schema, so the workbench must
    // not offer a half-finished stage over the top of it.
    await expect(page.getByTestId('stage-draft-banner')).toHaveCount(0);
  });
});
