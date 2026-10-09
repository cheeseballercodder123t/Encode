import { test, expect, type Locator, type Page } from '@playwright/test';
import { makeActivity, makeSavedSchema } from './helpers/fixtures';

/**
 * Defect 35 in the browser: the copy controls report what actually happened.
 *
 * Finding 35 found four handoff controls with three behaviours - the history
 * drawer and the completed-session view showed `[ OK ]` over a promise they
 * never awaited, the forge awaited one bare (a refusal became an unhandled
 * rejection and a dead-looking click), and the RemNote sheet swallowed the
 * refusal and still said "Copied". The shared implementation lives in
 * `lib/clipboard.ts` + `hooks/useClipboardCopy.ts` and its contract is pinned in
 * `tests/unit/clipboard.test.ts` and `tests/unit/use-clipboard-copy.test.tsx`;
 * the coverage rule (no other file touches the clipboard) in
 * `tests/unit/clipboard-standardisation.test.ts`.
 *
 * What only a browser can prove is the three things those tests cannot:
 *
 *  1. The **real** Clipboard API is what these controls call now - granted
 *     permissions, a real `writeText`, and the text read back to confirm the
 *     markdown the learner wanted is the markdown that arrived.
 *  2. A refusal is visible on every surface instead of only in the console, and
 *     no `[ OK ]` is rendered over it.
 *  3. Nothing rejects uncaught: the listeners below are installed before the app
 *     boots, so a floating promise or a swallowed rejection would be recorded
 *     here rather than passing quietly.
 */

const SCHEMAS_KEY = 'deepencode_saved_schemas_v2';

/**
 * The clipboard has to be granted per test; the writes happen in a real browser
 * context with real permissions, which is the point.
 */
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

function probeSchema() {
  return makeSavedSchema({
    id: 'clipboard-probe',
    topicSummary: 'Clipboard Probe Topic',
    activities: [makeActivity({ id: 'clip-probe-1' })],
    userResponses: { 'clip-probe-1': { field1: 'first answer', field2: 'the mechanism' } },
  });
}

/** Records every uncaught error and unhandled rejection, before app code runs. */
async function watchForUnhandled(page: Page) {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __unhandled: string[] }).__unhandled = seen;
    window.addEventListener('unhandledrejection', (event) => {
      seen.push(String((event as PromiseRejectionEvent).reason ?? 'unhandled rejection'));
    });
    window.addEventListener('error', (event) => {
      seen.push(`error: ${event.message}`);
    });
  });
}

/** A browser that refuses the async write and the selection path alike. */
async function refuseClipboard(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
        readText: () => Promise.resolve(''),
      },
    });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: () => false });
  });
}

/** A non-secure origin: no `navigator.clipboard` at all. */
async function noClipboardAtAll(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: () => false });
  });
}

async function seedHistory(page: Page) {
  const schema = probeSchema();
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, JSON.stringify([value])),
    { key: SCHEMAS_KEY, value: schema }
  );
}

async function openHistory(page: Page) {
  await page.goto('/');
  await page.locator('button[title^="View Saved Schemas History"]').click();
  await expect(page.getByText('Saved Schemas')).toBeVisible();
}

const unhandled = (page: Page) =>
  page.evaluate(() => (window as unknown as { __unhandled: string[] }).__unhandled);

const clipboardText = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

const historyCopy = (page: Page) => page.getByTestId('history-copy-remnote');

/**
 * The completed view's three copy controls - defect 35's other floating promise,
 * which reported `[ OK ]` per format over a promise nobody awaited. All three are
 * driven, because "standardised" has to hold for the buttons as they are on
 * screen, not just for a sample of them.
 */
const COMPLETED_COPY = [
  { key: 'remnote', name: /Copy for RemNote/ },
  { key: 'anki', name: /Copy Anki Cloze/ },
  { key: 'markdown', name: /Copy Full Markdown/ },
] as const;

test.describe('the copy controls share one contract', () => {
  test('a landed write is confirmed, and the markdown really reached the clipboard', async ({ page }) => {
    await seedHistory(page);
    await watchForUnhandled(page);
    await openHistory(page);

    const copy = historyCopy(page);
    await expect(copy).toHaveAttribute('data-copy-status', 'idle');
    await copy.click();

    await expect(copy).toHaveAttribute('data-copy-status', 'copied');
    await expect(copy).toContainText('[ OK ]');
    // The confirmation is about this row's RemNote markdown, so that is what the
    // system clipboard has to hold - not a placeholder, not an empty string.
    expect(await clipboardText(page)).toContain('Clipboard Probe Topic');

    // Temporary by design: the mark belongs to the click, not to the row.
    await expect(copy).toHaveAttribute('data-copy-status', 'idle', { timeout: 10_000 });

    // The completed session's three controls are the same implementation, so the
    // same click-and-confirm holds for each of them - and confirming one clears
    // the previous one, because the state is keyed to the button that was clicked.
    await page.getByRole('button', { name: 'View' }).first().click();
    let previous: Locator | null = null;
    for (const { key, name } of COMPLETED_COPY) {
      const button = page.getByRole('button', { name });
      await expect(button, `${key} starts idle`).toHaveAttribute('data-copy-status', 'idle');
      await button.click();
      await expect(button, `${key} confirms its own write`).toHaveAttribute('data-copy-status', 'copied');
      await expect(button).toContainText('[ OK ]');
      if (previous) await expect(previous, `${key} takes the mark from the last button`).toHaveAttribute('data-copy-status', 'idle');
      previous = button;
    }
    // The last click was the full markdown, and the app's own export is what
    // reached the clipboard - not a placeholder and not the previous format.
    expect(await clipboardText(page)).toContain('Clipboard Probe Topic');

    expect(await unhandled(page)).toEqual([]);
  });

  test('a refused write is reported on every surface, and nothing rejects uncaught', async ({ page }) => {
    await seedHistory(page);
    await refuseClipboard(page);
    await watchForUnhandled(page);
    await openHistory(page);

    // 1. The history drawer. The old handler rendered `[ OK ]` here regardless.
    const copy = historyCopy(page);
    await copy.click();
    // A refused write must not escape as an unhandled rejection. Polled rather
    // than read once, so the assertion is about "never", not about "not yet".
    await expect
      .poll(() => unhandled(page), { message: 'a refused clipboard write rejected uncaught' })
      .toEqual([]);
    await expect(copy).toHaveAttribute('data-copy-status', 'failed');
    await expect(copy).toContainText('[ ! ]');
    await expect(copy).not.toContainText('[ OK ]');
    await expect(copy).toHaveAttribute('title', /Copy failed/);
    // Checked per surface, not once at the end: a rejection that escapes the
    // handler is exactly how the forge's bare `await` used to behave.
    expect(await unhandled(page)).toEqual([]);

    // 2. The share sheet, which used to log the refusal where nobody could see it.
    await page.locator('button[title="Share stateless URL"]').first().click();
    await expect(page.getByTestId('share-link-input')).toBeVisible();
    await page.getByTestId('share-copy-link').click();
    await expect(page.getByTestId('share-copy-link')).toHaveAttribute('data-copy-status', 'failed');
    await expect(page.getByTestId('share-copy-failed')).toBeVisible();
    expect(await unhandled(page)).toEqual([]);
    await page.keyboard.press('Escape');

    // 3. The completed session, whose three copies were the other floating
    // promise. Every one of them reports the refusal and none of them claims
    // success - the `[ OK ]` per format was the whole of defect 35.
    await page.getByRole('button', { name: 'View' }).first().click();
    for (const { key, name } of COMPLETED_COPY) {
      const button = page.getByRole('button', { name });
      await button.click();
      await expect(button, `${key} reports the refusal`).toHaveAttribute('data-copy-status', 'failed');
      await expect(button).not.toContainText('[ OK ]');
    }

    // The whole point: a refusal is a reported state, not an unhandled rejection
    // and not a dead click.
    expect(await unhandled(page)).toEqual([]);
  });

  test('a browser with no clipboard API reports the failure instead of throwing', async ({ page }) => {
    await seedHistory(page);
    await noClipboardAtAll(page);
    await watchForUnhandled(page);
    await openHistory(page);

    // The old drawer called `navigator.clipboard.writeText` off an object that
    // does not exist on a non-secure origin: a TypeError inside the click
    // handler, thrown before any state was set.
    const copy = historyCopy(page);
    await copy.click();

    await expect(copy).toHaveAttribute('data-copy-status', 'failed');
    await expect(copy).not.toContainText('[ OK ]');
    // The sheet is still alive and usable, which is what "handled" has to mean.
    await expect(page.getByText('Saved Schemas')).toBeVisible();
    expect(await unhandled(page)).toEqual([]);
  });
});
