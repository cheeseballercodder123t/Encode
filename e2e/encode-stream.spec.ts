import { test, expect } from '@playwright/test';
import { MOCK_NOTES, ENCODE_RESPONSE } from './helpers/fixtures';
import { mockAiApis, startEncodeFromNotes, confirmReadiness, expectStage } from './helpers/mocks';

/**
 * Streamed generation, on the wire.
 *
 * `/api/encode/stream` exists because an encode is one long JSON response, and
 * the loading view had nothing true to say until its closing brace arrived: the
 * route runs a cheap outline pass first, streams each stage title the moment
 * its braces close, and hands the full schema over behind it. Two things about
 * that are easy to break and invisible to every other spec:
 *
 *  - the launchpad must actually POST there. `mockAiApis` intercepts BOTH
 *    paths, so a revert to the plain route would leave the whole suite green
 *    while the feature stopped running — the specs would be driving the
 *    fallback and never notice.
 *  - the client reader has to accept the real wire format (newline-delimited
 *    JSON with a `result` event at the end), not only the plain-JSON body that
 *    `mockAiApis` serves.
 *
 * Timing caveat: `route.fulfill` delivers a body in one piece, so these outline
 * events land in the same task as the result and the stage lozenges never get
 * a paint of their own. The outline arithmetic itself is pinned by
 * `tests/unit/stream-schema.test.ts`, which can feed the parser one chunk at a
 * time — the thing a browser test cannot control.
 */

const OUTLINES = ENCODE_RESPONSE.activities.map((activity, index) => ({
  type: 'outline',
  outline: {
    id: activity.id,
    stageNumber: index + 1,
    title: activity.title,
    framework: activity.framework,
    cognitiveGoal: activity.cognitiveGoal,
  },
  count: index + 1,
  expected: ENCODE_RESPONSE.activities.length,
}));

const STREAM_EVENTS = [
  { type: 'phase', phase: 'Parsing source material…' },
  { type: 'title', title: ENCODE_RESPONSE.topicSummary },
  ...OUTLINES,
  { type: 'outlineEnd', count: OUTLINES.length },
  { type: 'phase', phase: 'Writing the full schema for the outlined stages…' },
  { type: 'result', data: ENCODE_RESPONSE },
];

const ndjson = (events: unknown[]) => events.map((event) => JSON.stringify(event)).join('\n') + '\n';

test.describe('Streamed generation', () => {
  test('the launchpad streams the outline and the schema over the NDJSON route', async ({ page }) => {
    const posted: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/api/encode')) {
        posted.push(new URL(request.url()).pathname);
      }
    });

    await mockAiApis(page);
    // Registered after mockAiApis : the last matching route wins.
    await page.route('**/api/encode/stream', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson; charset=utf-8',
        body: ndjson(STREAM_EVENTS),
      })
    );

    await startEncodeFromNotes(page, MOCK_NOTES);

    // The streamed payload produced the real workout, not the offline fallback.
    await confirmReadiness(page);
    await expectStage(page, 1);
    await expect(page.getByText(ENCODE_RESPONSE.topicSummary).first()).toBeVisible();

    expect(posted).toContain('/api/encode/stream');
    expect(posted).not.toContain('/api/encode');
  });

  test('a proxy that buffers the stream into plain JSON is still read', async ({ page }) => {
    // A deployment that predates the stream, or any proxy that buffers NDJSON,
    // answers this route with one JSON body. The reader has to fall back to it
    // rather than failing the generation.
    await mockAiApis(page);
    await page.route('**/api/encode/stream', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ENCODE_RESPONSE),
      })
    );

    await startEncodeFromNotes(page, MOCK_NOTES);
    await confirmReadiness(page);
    await expectStage(page, 1);
    await expect(page.getByText('Offline Backup')).toHaveCount(0);
  });

  test('a stream that reports an error surfaces it instead of hanging', async ({ page }) => {
    await mockAiApis(page);
    await page.route('**/api/encode/stream', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson; charset=utf-8',
        body: ndjson([
          { type: 'phase', phase: 'Parsing source material…' },
          { type: 'error', message: 'Provider down' },
        ]),
      })
    );

    let dialogMessage = '';
    page.on('dialog', async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });

    await page.goto('/');
    await page.getByPlaceholder(/Paste study material/).fill(MOCK_NOTES);
    await page.getByRole('button', { name: 'Build Cognitive Schema' }).click();

    expect(dialogMessage).toContain('Provider down');
    await expect(page.getByPlaceholder(/Paste study material/)).toBeVisible();
  });
});
