import { test, expect } from '@playwright/test';
import { MOCK_NOTES } from './helpers/fixtures';
import { mockAiApis, startEncodeFromNotes, confirmReadiness, expectStage } from './helpers/mocks';

/**
 * STEM notation typed as ASCII.
 *
 * The raw text is what gets stored, graded and exported — the preview exists so
 * a physicist can type `r^{4}` and `->` without a formula editor, and so the
 * notation reads back as notation instead of as noise.
 */

test.describe('Formula input', () => {
  test('renders typed ASCII notation without changing the stored answer', async ({ page }) => {
    await mockAiApis(page);
    await startEncodeFromNotes(page, MOCK_NOTES);
    await confirmReadiness(page);
    await expectStage(page, 1);

    // Prose: no preview chrome at all.
    await page.getByPlaceholder('STAGE1_FIELD1').fill('Sodium rushes in through the channels.');
    await expect(page.getByTestId('stem-preview')).toHaveCount(0);

    const typed = 'Q ~= r^{4} because pressure -> flow, so \\alpha drops ^2';
    await page.getByPlaceholder('STAGE1_FIELD1').fill(typed);

    const preview = page.getByTestId('stem-preview-body');
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('≈');
    await expect(preview).toContainText('→');
    await expect(preview).toContainText('α');
    // The superscript is real markup, not a literal caret.
    await expect(preview.locator('sup')).toHaveText('4');

    // The raw ASCII is still the value the examiner receives.
    await expect(page.getByPlaceholder('STAGE1_FIELD1')).toHaveValue(typed);

    // Monospace is opt-in, never forced on a prose answer.
    await page.getByRole('button', { name: 'Formula input off' }).click();
    await expect(page.getByPlaceholder('STAGE1_FIELD1')).toHaveClass(/font-mono/);
  });
});
