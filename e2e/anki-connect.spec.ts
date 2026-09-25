import { test, expect, type Page } from '@playwright/test';
import { MOCK_NOTES } from './helpers/fixtures';
import { mockAiApis, startEncodeFromNotes, confirmReadiness, expectStage } from './helpers/mocks';

/**
 * AnkiConnect handoff: the session ends the millisecond the card is forged.
 *
 * AnkiConnect itself is a local HTTP server (127.0.0.1:8765), so the whole
 * integration can be driven from the real UI with the server mocked at the
 * network level — including the CORS preflight the browser sends, and the
 * origin refusal AnkiConnect answers with when `webCorsOriginList` doesn't
 * include this app.
 */

const DECK = 'DeepEncode::Action Potentials';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface AnkiMockOptions {
  /** Return null for every note (Anki's "already in the collection" answer). */
  allDuplicates?: boolean;
  /** Pretend the origin is not in AnkiConnect's webCorsOriginList. */
  refuseOrigin?: boolean;
  deckExists?: boolean;
}

async function mockAnkiConnect(page: Page, opts: AnkiMockOptions = {}) {
  const calls: { action: string; params: any }[] = [];

  await page.route(
    (url) => url.hostname === '127.0.0.1' && url.port === '8765',
    async (route) => {
      const request = route.request();

      if (opts.refuseOrigin) {
        // A 403 with no CORS headers is exactly what the browser reports as a
        // cross-origin refusal: the fetch rejects and nothing is readable.
        await route.fulfill({ status: 403 });
        return;
      }

      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: CORS_HEADERS });
        return;
      }

      const body = request.postDataJSON();
      calls.push(body);

      const result = (() => {
        switch (body.action) {
          case 'deckNames':
            return opts.deckExists ? ['Default', DECK] : ['Default'];
          case 'createDeck':
            return 1;
          case 'modelNames':
            return ['Basic', 'Cloze'];
          case 'addNotes':
            return opts.allDuplicates ? body.params.notes.map(() => null) : body.params.notes.map((_: unknown, i: number) => 200 + i);
          default:
            return null;
        }
      })();

      await route.fulfill({
        status: 200,
        headers: CORS_HEADERS,
        contentType: 'application/json',
        body: JSON.stringify({ result, error: null }),
      });
    }
  );

  return calls;
}

async function encodeStageOne(page: Page) {
  await mockAiApis(page);
  await startEncodeFromNotes(page, MOCK_NOTES);
  await confirmReadiness(page);
  await expectStage(page, 1);
  await page.getByPlaceholder('STAGE1_FIELD1').fill('Sodium rushes in through voltage-gated channels.');
  await page.getByPlaceholder('STAGE1_FIELD2').fill('The membrane crossed threshold, so the gates snap open.');
}

test.describe('AnkiConnect handoff', () => {
  test('Cmd/Ctrl+Shift+A forges the current stage into Anki without leaving the forge', async ({ page }) => {
    const calls = await mockAnkiConnect(page);
    await encodeStageOne(page);

    await page.keyboard.press('Control+Shift+A');

    const status = page.getByTestId('anki-stage-status');
    await expect(status).toBeVisible();
    await expect(status).toContainText('[ANKI: +');

    // Deck creation is idempotent, the notes carry the hierarchical deck name,
    // and the stage's own wording is what landed.
    const createDeck = calls.find((c) => c.action === 'createDeck');
    expect(createDeck?.params.deck).toBe(DECK);

    const addNotes = calls.find((c) => c.action === 'addNotes')!;
    expect(addNotes).toBeTruthy();
    expect(addNotes.params.notes.length).toBeGreaterThan(0);
    expect(addNotes.params.notes[0].deckName).toBe(DECK);
    expect(addNotes.params.notes[0].options.allowDuplicate).toBe(false);
    expect(JSON.stringify(addNotes.params.notes)).toContain('voltage-gated channels');
  });

  test('a second push reports duplicates instead of doubling the deck', async ({ page }) => {
    await mockAnkiConnect(page, { allDuplicates: true, deckExists: true });
    await encodeStageOne(page);

    await page.getByRole('button', { name: 'Anki push' }).click();

    const status = page.getByTestId('anki-stage-status');
    await expect(status).toContainText('[ANKI: +0 CARDS FORGED');
    await expect(status).toContainText('already in deck');
  });

  test('a refused origin explains the CORS fix instead of failing silently', async ({ page }) => {
    await mockAnkiConnect(page, { refuseOrigin: true });
    await encodeStageOne(page);

    await page.getByRole('button', { name: 'Anki push' }).click();

    const status = page.getByTestId('anki-stage-status');
    await expect(status).toBeVisible();
    await expect(status).toContainText('AnkiConnect');
    await expect(status).toContainText('webCorsOriginList');
  });

  test('the export modal pushes the sanitized deck through the same client', async ({ page }) => {
    const calls = await mockAnkiConnect(page);
    await mockAiApis(page);
    await page.goto('/');

    // Seed a session so the export modal has cards to push.
    await page.getByPlaceholder(/Paste study material/).fill(MOCK_NOTES);
    await page.getByRole('button', { name: 'Build Cognitive Schema' }).click();
    await confirmReadiness(page);
    await expectStage(page, 1);
    await page.getByPlaceholder('STAGE1_FIELD1').fill('Sodium rushes in through voltage-gated channels.');
    await page.getByPlaceholder('STAGE1_FIELD2').fill('The membrane crossed threshold, so the gates snap open.');

    await page.locator('button[title^="Export .apkg Anki package"]').click();
    await expect(page.getByText('Anki & SM-2 Spaced Repetition Exporter')).toBeVisible();

    await page.getByRole('button', { name: /Push \d+ to Anki/ }).click();

    const status = page.getByTestId('anki-push-status');
    await expect(status).toBeVisible();
    await expect(status).toContainText('[ANKI: +');
    expect(calls.some((c) => c.action === 'addNotes')).toBe(true);
  });
});
