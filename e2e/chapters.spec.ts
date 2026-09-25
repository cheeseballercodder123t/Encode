import { test, expect, type Page } from '@playwright/test';
import { YOUTUBE_CHAPTERS_RESPONSE } from './helpers/fixtures';
import { mockAiApis, confirmReadiness, expectStage } from './helpers/mocks';

/**
 * Chapter-level progress for long video sessions.
 *
 * A 90-minute lecture is not one sitting: the rail has to answer "which chapters
 * are actually encoded, and where do I pick up?" from produced work only — never
 * from watch position or a timer.
 */

async function startChapteredLecture(page: Page) {
  await mockAiApis(page);
  await page.route('**/api/youtube', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(YOUTUBE_CHAPTERS_RESPONSE),
    })
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'YouTube URL' }).click();
  await page
    .getByPlaceholder(/Paste lecture or educational video/)
    .fill('https://www.youtube.com/watch?v=aircAruvnKk');
  await page.getByRole('button', { name: 'Build Cognitive Schema' }).click();
  await confirmReadiness(page);
  await expectStage(page, 1);
}

test.describe('Chapter progress rail', () => {
  test('counts encoded chapters and resumes at the first one still open', async ({ page }) => {
    await startChapteredLecture(page);

    const rail = page.getByTestId('chapter-rail');
    await expect(rail).toBeVisible();
    await expect(page.getByTestId('chapter-summary')).toContainText('0 of 3 chapters encoded');
    await expect(page.getByTestId('chapter-summary')).toContainText('resume at 1 of 3');
    await expect(page.getByTestId('chapter-chip-1')).toContainText('07:12');

    // Encode chapter 1 for real (the examiner's mocked grade lands the response).
    await page.getByPlaceholder('YT1_FIELD1').fill('Weights are just numbers on the connections.');
    await page.getByPlaceholder('YT1_FIELD2').fill('Each weight scales how strongly a signal passes.');
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByText(/Good mechanism/).first()).toBeVisible();

    // Only produced work counts: the summary and the chip both move.
    await expect(page.getByTestId('chapter-summary')).toContainText('1 of 3 chapters encoded');
    await expect(page.getByTestId('chapter-summary')).toContainText('resume at 2 of 3');
    await expect(page.getByTestId('chapter-chip-0')).toContainText('[ OK ]');

    // Resume jumps to the next unwritten chapter.
    await page.getByTestId('chapter-resume').click();
    await expectStage(page, 2);
    await expect(page.getByTestId('chapter-chip-1')).toHaveAttribute('aria-current', 'step');
  });

  test('clicking a chapter chip jumps to that stage', async ({ page }) => {
    await startChapteredLecture(page);

    await page.getByTestId('chapter-chip-2').click();
    await expectStage(page, 3);
    await expect(page.getByPlaceholder('YT3_FIELD1')).toBeVisible();
  });
});
