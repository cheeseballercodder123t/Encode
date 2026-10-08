import { test, expect, type Page } from '@playwright/test';
import LZString from 'lz-string';
import { makeSavedSchema } from './helpers/fixtures';
import type { SavedSchema } from '../lib/types';

/**
 * A schema shared as a URL, when the URL is too big for a URL.
 *
 * Bug 29: the payload travelled in the query string (`?share=…`), which means it
 * travelled in the request LINE, and the server refuses an oversized one before
 * any route runs. MEASURED on this server with `curl -o /dev/null -w
 * '%{http_code}'`:
 *
 *   GET /?share=<16,000 bytes>   ->  200
 *   GET /?share=<17,000 bytes>   ->  431 (Request Header Fields Too Large)
 *   GET /#share=<24,000 bytes>   ->  200
 *
 * So the recipient of a large shared schema saw the server's error page - and
 * nothing in the app could tell them why, because nothing in the app ever saw
 * the request. The fix moves the payload into the fragment, which the browser
 * keeps to itself and the app reads after load; these specs use the server's own
 * status code for the old form as the control, then prove the new one arrives
 * intact.
 */

/** Deterministic, unique-ish text: compressible prose would hide the sizes. */
function noise(chars: number): string {
  return Array.from({ length: Math.ceil(chars / 6) }, (_, i) =>
    (((i + 1) * 2654435761) % 4294967296).toString(36)
  ).join('').slice(0, chars);
}

/**
 * A schema whose compressed payload is ~34 KB - more than twice the request-line
 * limit measured above, so the control below fails for the right reason.
 */
function hugeSchema(): SavedSchema {
  const activities = Array.from({ length: 8 }, (_, i) => ({
    id: `large_${i + 1}`,
    stageNumber: i + 1,
    title: `Large Stage ${i + 1}`,
    framework: noise(24),
    cognitiveGoal: 'Hold the whole chain in one pass',
    contextSnippet: noise(120),
    keywords: [noise(10), noise(10)],
    templateType: 'first_principles' as const,
    prompt: noise(3000),
    scaffold: {
      field1Label: 'What is it?',
      field1Placeholder: 'Describe...',
      field2Label: 'Why does it work?',
      field2Placeholder: 'Explain...',
      exampleAnswer: 'Example answer.',
    },
  })) as SavedSchema['activities'];

  return makeSavedSchema({
    id: 'shared_large_1',
    topicSummary: 'Large Shared Schema',
    activities,
    userResponses: Object.fromEntries(
      activities.map((a) => [
        a.id,
        { field1: noise(2000), field2: noise(2000), confidenceScore: 80, checkCount: 1 },
      ])
    ),
  });
}

/** A schema whose only bulk is the author's own answers: the deck itself fits. */
function bulkyAnswersSchema(): SavedSchema {
  const activities = Array.from({ length: 4 }, (_, i) => ({
    id: `slim_${i + 1}`,
    stageNumber: i + 1,
    title: `Slim Stage ${i + 1}`,
    framework: 'cause-effect',
    cognitiveGoal: 'Build a causal model',
    contextSnippet: 'Voltage-gated channels open at threshold.',
    keywords: ['depolarization', 'sodium', 'potassium'],
    templateType: 'cause_effect' as const,
    prompt: 'Explain the mechanism in your own words.',
    scaffold: {
      field1Label: 'What Happens',
      field1Placeholder: 'Describe...',
      field2Label: 'Why It Happens',
      field2Placeholder: 'Explain...',
      exampleAnswer: 'Sodium influx depolarizes the membrane.',
    },
  })) as SavedSchema['activities'];

  return makeSavedSchema({
    id: 'shared_bulky_answers',
    topicSummary: 'Bulky Answers Schema',
    activities,
    userResponses: Object.fromEntries(
      activities.map((a) => [
        a.id,
        { field1: noise(8000), field2: noise(8000), confidenceScore: 80, checkCount: 1 },
      ])
    ),
  });
}

async function openShareSheetFor(page: Page, schema: SavedSchema) {
  await page.addInitScript((s) => {
    (window as any).localStorage.setItem('deepencode_saved_schemas_v2', JSON.stringify([s]));
  }, schema);
  await page.goto('/');
  await page.locator('button[title^="View Saved Schemas History"]').click();
  await expect(page.getByRole('dialog', { name: 'Saved schemas' })).toBeVisible();
  await page.locator('button[title="Share stateless URL"]').first().click();
  const sheet = page.getByRole('dialog').filter({ hasText: 'Stateless URL Sharing' });
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe('a large schema survives the trip', () => {
  test('the old query-string link is refused by the server; the fragment link arrives whole', async ({ page }) => {
    const schema = hugeSchema();
    const payload = LZString.compressToEncodedURIComponent(JSON.stringify(schema));
    // The premise, asserted rather than assumed: this payload is past the
    // request-line limit measured above, so the control below is the real bug.
    expect(new TextEncoder().encode(payload).length).toBeGreaterThan(17_000);

    // 1. The control - the transport this bug report is about. The server
    //    refuses the request before any route runs: no app, no message.
    const rejected = await page.goto(`/?share=${payload}`);
    expect(rejected?.status()).toBe(431);

    // 2. The fix. The payload rides after the `#`, so the browser never puts it
    //    in the request line and the page loads normally.
    const loaded = await page.goto(`/#share=${payload}`);
    expect(loaded?.status()).toBe(200);
    await expect(page.getByText('Classmate Shared Schema Loaded')).toBeVisible();
    // The topic appears both in the import banner and in the library label.
    await expect(page.getByText('Large Shared Schema').first()).toBeVisible();

    // 3. Whole, not truncated: the imported deck reaches the library with every
    //    stage and the longest field intact.
    await page.getByRole('button', { name: 'Save to History' }).click();
    // Found by topic, not by id: saving an imported share gives it a fresh local
    // id, which is what keeps it from colliding with the sender's record.
    const stored = await page.evaluate(() => {
      const list = JSON.parse(window.localStorage.getItem('deepencode_saved_schemas_v2') || '[]');
      const found = list.find((s: { topicSummary: string }) => s.topicSummary === 'Large Shared Schema');
      return found
        ? {
            stages: found.activities?.length ?? 0,
            firstPrompt: found.activities?.[0]?.prompt?.length ?? 0,
            answers: Object.keys(found.userResponses || {}).length,
          }
        : null;
    });
    expect(stored).not.toBeNull();
    expect(stored!.stages).toBe(8);
    expect(stored!.answers).toBe(8);
    // The compressed round trip is lossless, so the field length is exact.
    expect(stored!.firstPrompt).toBe(3000);
  });
});

test.describe('the share sheet stops offering a link that cannot work', () => {
  test('a schema too bulky for any link is refused, with the file as the way out', async ({ page }) => {
    const sheet = await openShareSheetFor(page, hugeSchema());

    // The sheet says so, in the learner's terms, instead of handing over a URL
    // that a chat app will split in half.
    const tooLong = sheet.getByTestId('share-too-long');
    await expect(tooLong).toBeVisible();
    await expect(tooLong).toContainText('[ TOO LONG ]');
    await expect(tooLong).toContainText(/restore/i);
    // And it does NOT offer the link: no copy target exists to be pasted.
    await expect(sheet.getByTestId('share-link-input')).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: /Copy Share URL/ })).toHaveCount(0);

    // The option it does offer works: a schema file the receiver restores.
    const download = page.waitForEvent('download');
    await sheet.getByTestId('share-save-file').click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^deepencode-schema-large-shared-schema\.json$/);
  });

  test('bulky answers become a slim link that still carries every exercise', async ({ page }) => {
    const schema = bulkyAnswersSchema();
    const sheet = await openShareSheetFor(page, schema);

    // Over the limit, but not a dead end: the deck without the author's own
    // written answers fits, and the sheet says so before it offers it.
    await expect(sheet.getByTestId('share-too-long')).toBeVisible();
    const linkInput = sheet.getByTestId('share-link-input');
    await expect(linkInput).toBeVisible();
    const fullUrl = await linkInput.inputValue();
    expect(new TextEncoder().encode(fullUrl).length).toBeGreaterThan(8_000);

    await sheet.getByTestId('share-slim-toggle').click();
    await expect(linkInput).not.toHaveValue(fullUrl);
    const slimUrl = await linkInput.inputValue();
    expect(new TextEncoder().encode(slimUrl).length).toBeLessThan(
      new TextEncoder().encode(fullUrl).length
    );
    expect(new TextEncoder().encode(slimUrl).length).toBeLessThanOrEqual(8_000);
    // It is a link, not a file, and it is the fragment form.
    expect(slimUrl).toContain('#share=');
    expect(slimUrl).not.toContain('?share=');

    // The payload is the deck with no answers: every exercise is still there.
    const decoded = await page.evaluate((url: string) => {
      const payload = new URL(url).hash.replace(/^#share=/, '');
      return payload;
    }, slimUrl);
    expect(decoded.length).toBeGreaterThan(0);
    const roundTripped = LZString.decompressFromEncodedURIComponent(decoded);
    const parsed = JSON.parse(roundTripped!);
    expect(parsed.activities).toHaveLength(4);
    expect(parsed.userResponses).toEqual({});
    expect(parsed.topicSummary).toBe('Bulky Answers Schema');
  });
});
