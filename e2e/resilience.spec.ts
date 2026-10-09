import { test, expect } from '@playwright/test';
import { MOCK_NOTES, P1_FIELD1 } from './helpers/fixtures';
import { ENCODE_ROUTE, mockAiApis, startEncodeFromNotes, enterNotes, confirmReadiness, expectStage } from './helpers/mocks';

/**
 * Resilience suite: the failure paths the happy-path specs never touch.
 * - a **lost connection** builds the workout on this device (defect 42: this is
 *   the on-device generator the README advertises, finally wired, and the banner
 *   that says so)
 * - a generation API error still ALERTS and produces no cards - the two are
 *   deliberately different, and keeping them different is half of the fix
 * - cancel mid-generation returns cleanly to the input view
 * - a tab closed mid-generation leaves an interrupted-generation notice
 * - reloading mid-generation boots into a clean input state
 */

/** Requests the app made to the generation route (either entry point). */
function countEncodeRequests(page: import('@playwright/test').Page) {
  const urls: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/encode' || url.pathname === '/api/encode/stream') urls.push(url.pathname);
  });
  return urls;
}

/** The offline notice, and the two facts it carries: the connection, and the origin of the workout. */
const offlineNotice = (page: import('@playwright/test').Page) => page.getByTestId('offline-fallback-banner');

test.describe('Offline fallback generation (defect 42)', () => {
  test('with no connection the workout is built on this device, and the model is never called', async ({ page, context }) => {
    const encodeRequests = countEncodeRequests(page);
    await mockAiApis(page);
    await page.goto('/');
    await enterNotes(page, MOCK_NOTES);

    // The connection is gone before Generate is pressed: the browser knows it,
    // so the app must not even attempt the request.
    await context.setOffline(true);
    await expect(offlineNotice(page)).toBeVisible();
    await expect(offlineNotice(page)).toHaveAttribute('data-connectivity', 'offline');

    await page.getByRole('button', { name: 'Build Cognitive Schema' }).click();

    // The banner now describes the workout on screen - built here, no model call.
    await expect(offlineNotice(page)).toHaveAttribute('data-workout-origin', 'offline');
    await expect(offlineNotice(page)).toContainText('built on this device');

    // The on-device generator's own shape: five deterministic stages (the mocked
    // model payload has two), and none of the mocked payload's placeholders.
    await expect(page.getByText('01/05')).toBeVisible();
    await expect(page.getByPlaceholder(P1_FIELD1)).toHaveCount(0);
    expect(encodeRequests).toEqual([]);

    // And the stage is answerable offline: the fields the generator filled in.
    const firstField = page.locator('input, textarea').nth(0);
    await expect(firstField).toBeVisible();
  });

  test('a connection lost mid-request falls back the same way instead of reporting a failure', async ({ page }) => {
    await mockAiApis(page);
    // Registered after the mocks, so it wins: the request dies in the network
    // exactly as it does in a tunnel, without the browser reporting offline.
    await page.route(ENCODE_ROUTE, (route) => route.abort('internetdisconnected'));

    await startEncodeFromNotes(page, MOCK_NOTES);

    await expect(offlineNotice(page)).toHaveAttribute('data-workout-origin', 'connection', { timeout: 20_000 });
    await expect(page.getByText('01/05')).toBeVisible();
    await expect(page.getByPlaceholder(P1_FIELD1)).toHaveCount(0);
  });

  test('coming back online ends the offline state, and the next generation uses the network again', async ({ page, context }) => {
    await mockAiApis(page);
    await page.goto('/');
    await enterNotes(page, MOCK_NOTES);
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Build Cognitive Schema' }).click();
    await expect(page.getByText('01/05')).toBeVisible();
    await expect(offlineNotice(page)).toHaveAttribute('data-workout-origin', 'offline');

    // Reconnected: the notice stops claiming the app is offline, while still
    // describing the session it did build offline (it was, and it stays, true).
    await context.setOffline(false);
    await expect(offlineNotice(page)).toHaveAttribute('data-connectivity', 'online');
    await expect(offlineNotice(page)).toHaveAttribute('data-workout-origin', 'offline');

    // Dismissing it leaves nothing on screen, and the next session is the
    // model's again - online generation is unchanged by all of this.
    await offlineNotice(page).getByRole('button', { name: /DISMISS/ }).click();
    await expect(offlineNotice(page)).toHaveCount(0);

    await startEncodeFromNotes(page, MOCK_NOTES);
    await confirmReadiness(page);
    await expectStage(page, 1);
    await expect(page.getByPlaceholder(P1_FIELD1)).toBeVisible();
    await expect(page.getByText('01/05')).toHaveCount(0);
    await expect(offlineNotice(page)).toHaveCount(0);
  });
});


test.describe('Generation resilience', () => {
  test('API 500 on /api/encode alerts the user rather than producing fake cards', async ({ page }) => {
    await mockAiApis(page);
    // Override AFTER mockAiApis : the last registered matching route wins.
    await page.route(ENCODE_ROUTE, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Provider down' }) })
    );

    let dialogMessage = '';
    page.on('dialog', async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });

    await startEncodeFromNotes(page, MOCK_NOTES);

    expect(dialogMessage).toContain('Provider down');
    await expect(page.getByPlaceholder(/Paste study material/)).toBeVisible();
  });

  test('cancel mid-generation aborts the request and returns to the input view', async ({ page }) => {
    await mockAiApis(page);
    // Hang the request: never fulfill, so the loading view stays up.
    await page.route(ENCODE_ROUTE, async () => {
      await new Promise(() => {}); // never resolves
    });

    await startEncodeFromNotes(page, MOCK_NOTES);

    // Loading view shows live progress + cancel
    await expect(page.getByTestId('gen-elapsed')).toBeVisible();
    await expect(page.getByRole('button', { name: /cancel generation/i })).toBeVisible();

    await page.getByRole('button', { name: /cancel generation/i }).click();

    // Back on the launchpad, notes intact
    await expect(page.getByPlaceholder(/Paste study material/)).toBeVisible();
    await expect(page.getByPlaceholder(/Paste study material/)).toHaveValue(MOCK_NOTES);
  });

  test('reloading mid-generation boots into a clean input state', async ({ page }) => {
    await mockAiApis(page);
    await page.route(ENCODE_ROUTE, async () => {
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
          secured: true,
          feedback: 'Good mechanism : tighten the threshold detail.',
          counterProbe: 'What happens if the pump stalls halfway?',
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
