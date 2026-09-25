import { test, expect } from '@playwright/test';
import { MOCK_NOTES } from './helpers/fixtures';
import { mockAiApis, startEncodeFromNotes, confirmReadiness, expectStage } from './helpers/mocks';

/**
 * Friction-cut loop: the examiner no longer answers with a polite paragraph.
 * It names what landed and the ONE missing causal step, and the workbench
 * offers an inline field that appends that sentence to the mechanism answer —
 * so fixing a "needs work" grade is one typed line, not a rewrite.
 */
test.describe('Delta feedback & gap patching', () => {
  test('examiner returns nailedIt + missingLink and the inline field appends it', async ({ page }) => {
    await mockAiApis(page);
    await startEncodeFromNotes(page, MOCK_NOTES);
    await confirmReadiness(page);
    await expectStage(page, 1);

    const field1 = page.getByPlaceholder('STAGE1_FIELD1');
    const field2 = page.getByPlaceholder('STAGE1_FIELD2');
    await field1.fill('Sodium rushes in through voltage-gated channels.');
    await field2.fill('The membrane crossed threshold, so gates open.');

    await page.getByRole('button', { name: /CHECK/ }).click();

    // Both delta lines render instead of one vague paragraph.
    await expect(page.getByText(/You nailed:/)).toBeVisible();
    await expect(page.getByText(/S4 segments physically swing outward/).first()).toBeVisible();

    // The gap is patchable in place: type one sentence, press Enter.
    const patch = page.getByTestId('missing-link-input');
    await expect(patch).toBeVisible();
    await expect(patch).toHaveAttribute('placeholder', /Insert the missing link here/);
    await patch.fill('S4 segments swing outward and the pore opens.');
    await patch.press('Enter');

    // It lands in the mechanism answer, appended rather than replacing it.
    await expect(field2).toHaveValue(/The membrane crossed threshold, so gates open\./);
    await expect(field2).toHaveValue(/S4 segments swing outward and the pore opens\./);
    await expect(patch).toHaveValue('');
  });

  test('taboo strip bans the source jargon and flags leaks live', async ({ page }) => {
    await mockAiApis(page);
    await startEncodeFromNotes(page, MOCK_NOTES);
    await confirmReadiness(page);
    await expectStage(page, 1);

    await expect(page.getByText('Taboo terms')).toBeVisible();
    await expect(page.getByText(/none leaked yet/)).toBeVisible();

    // "channels" is the source's most repeated ≥8-char term, so it is banned
    // (the stage's own keywords are exempt : those are what you SHOULD say).
    await expect(page.getByText('channels', { exact: true })).toBeVisible();
    await page.getByPlaceholder('STAGE1_FIELD1').fill('The channels do something.');
    await expect(page.getByText(/1 leaked/)).toBeVisible();
  });
});
