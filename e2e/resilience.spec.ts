import { test, expect } from '@playwright/test';
import { MOCK_NOTES } from './helpers/fixtures';
import {
  mockAiApis,
  startEncodeFromNotes,
  confirmReadiness,
  expectStage,
} from './helpers/mocks';

/**
 * Resilience suite: the failure paths the happy-path specs never touch.
 * - generation API errors fall back to the offline generator
 * - cancel mid-generation returns cleanly to the input view
 * - a tab closed mid-generation leaves an interrupted-generation notice
 * - reloading mid-generation boots into a clean input state
 */

test.describe('Generation resilience', () => {
  test('API 500 on /api/encode falls back to the offline generator workout', async ({ page }) => {
    await mockAiApis(page);
    // Override AFTER mockAiApis : the last registered matching route wins.
    await page.route('**/api/encode', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Provider down' }) })
    );

    await startEncodeFromNotes(page, MOCK_NOTES);

    // The offline fallback workout loads client-side and is usable end-to-end
    await confirmReadiness(page);
    await expectStage(page, 1);
    await expect(page.getByText('Offline Backup').first()).toBeVisible();
  });

  test('cancel mid-generation aborts the request and returns to the input view', async ({ page }) => {
    await mockAiApis(page);
    // Hang the request: never fulfill, so the loading view stays up.
    await page.route('**/api/encode', async () => {
      await new Promise(() => {}); // never resolves
    });

    await startEncodeFromNotes(page, MOCK_NOTES);

    // Loading view shows live progress + cancel
    await expect(page.getByTestId('gen-elapsed')).toBeVisible();
    await expect(page.getByRole('button', { name: /CANCEL GENERATION/ })).toBeVisible();

    await page.getByRole('button', { name: /CANCEL GENERATION/ }).click();

    // Back on the launchpad, notes intact
    await expect(page.getByPlaceholder(/Paste study material/)).toBeVisible();
    await expect(page.getByPlaceholder(/Paste study material/)).toHaveValue(MOCK_NOTES);
  });

  test('reloading mid-generation boots into a clean input state', async ({ page }) => {
    await mockAiApis(page);
    await page.route('**/api/encode', async () => {
      await new Promise(() => {}); // hang
    });

    await startEncodeFromNotes(page, MOCK_NOTES);
    await expect(page.getByTestId('gen-elapsed')).toBeVisible();

    // Simulate the user closing/reopening the tab mid-generation.
    await page.reload();

    // App re-mounts into the input view without crashing.
    await expect(page.getByPlaceholder(/Paste study material/)).toBeVisible();
  });

  test('a stale generation flag left by a closed tab surfaces an interrupted notice', async ({ page }) => {
    await mockAiApis(page);

    // Simulate a generation that started 60s ago and never finished.
    await page.addInitScript(() => {
      const stale = {
        startedAt: Date.now() - 60_000,
        savedAt: Date.now() - 30_000,
        sourceLabel: 'Interrupted Anatomy Notes',
        sourceType: 'notes',
      };
      window.localStorage.setItem('deepencode_generation_progress_v1', JSON.stringify(stale));
    });

    await page.goto('/');
    const banner = page.getByTestId('interrupted-gen-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Interrupted Anatomy Notes');

    // Dismiss clears it for the rest of the session.
    await banner.getByRole('button', { name: /DISMISS/ }).click();
    await expect(page.getByTestId('interrupted-gen-banner')).not.toBeVisible();
  });
});



test.describe('Examiner (evaluate) resilience', () => {
  test('evaluate outage alerts the user and the stage remains retryable', async ({ page }) => {
    await mockAiApis(page);
    await page.route('**/api/evaluate', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Checker offline' }) })
    );

    // Swallow the alert dialogs the app raises on evaluator failure.
    page.on('dialog', (dialog) => dialog.dismiss());

    await startEncodeFromNotes(page, MOCK_NOTES);
    await confirmReadiness(page);
    await expectStage(page, 1);
    await page.getByPlaceholder('STAGE1_FIELD1').fill('Sodium rushes in through voltage-gated channels.');
    await page.getByPlaceholder('STAGE1_FIELD2').fill('The membrane crossed threshold, so gates open.');

    // First check : outage -> alert (auto-dismissed), UI stays on the stage.
    await page.getByRole('button', { name: /CHECK/ }).click();
    await page.waitForTimeout(1500);

    // Recover the evaluator and retry on the same stage.
    await page.unroute('**/api/evaluate');
    await page.route('**/api/evaluate', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          grade: 'good',
          score: 76,
          xpBonus: 40,
          feedback: 'Good mechanism : tighten the threshold detail.',
        }),
      })
    );

    await page.getByRole('button', { name: /CHECK/ }).click();
    await expect(page.getByText('Good mechanism : tighten the threshold detail.')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('History pagination', () => {
  test('history drawer paginates large histories instead of mounting everything', async ({ page }) => {
    await mockAiApis(page);

    // Seed 12 saved schemas (drawer page size is 8).
    await page.addInitScript(() => {
      const schemas = Array.from({ length: 12 }, (_, i) => ({
        id: 'schema_seed_' + i,
        timestamp: Date.now() - i * 60000,
        topicSummary: 'Seeded Topic ' + (i + 1),
        mode: i % 2 === 0 ? 'conceptual' : 'memorization',
        xpEarned: 100 + i,
        activities: [],
        userResponses: {},
      }));
      window.localStorage.setItem('deepencode_saved_schemas_v2', JSON.stringify(schemas));
    });

    await page.goto('/');
    await page.locator('button[title^="View Saved Schemas History"]').click();
    await expect(page.getByText('Saved Schemas')).toBeVisible();

    // First page shows 8 of 12 and a working pager.
    await expect(page.getByText(/Page 1 \/ 2 . 12 schemas/)).toBeVisible();

    // Advance to page 2 and see the oldest seeded topic.
    await page.getByRole('button', { name: /NEXT >/ }).click();
    await expect(page.getByText(/Page 2 \/ 2 . 12 schemas/)).toBeVisible();
    await expect(page.getByText('Seeded Topic 12')).toBeVisible();
  });
});
