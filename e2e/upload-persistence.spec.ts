import { test, expect, type Page } from '@playwright/test';
import { mockAiApis } from './helpers/mocks';

/**
 * The attached file, through a real reload (defect 41).
 *
 * The launchpad mirrors a picked file into IndexedDB session state
 * (`hooks/useInputSource.ts`, `session_state`/`last_upload`) so a reload does not
 * cost the learner the handout they just attached. The unit suite
 * (`tests/unit/input-source-upload.test.tsx`) pins the ordering that made that
 * unreliable - a pick landing inside the window of the hydration read - by
 * holding the read open; a real browser's IndexedDB cannot be made slow on
 * demand, so these tests prove the other half: the write reaches the store and
 * the exact bytes come back after a genuine navigation.
 */

/** A 1×1 PNG — the smallest real image the picker's `accept` list takes. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
/** What `FileReader.readAsDataURL` produces for it, which is what the preview renders. */
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

const PROBE_NAME = 'renal-handout-probe.png';

/** The previous session's upload, left in the store for the late read to find. */
const STALE_NAME = 'yesterday-upload.png';
const STALE_BASE64 = Buffer.from('stale-upload-bytes').toString('base64');
const STALE = {
  name: STALE_NAME,
  type: 'image/png',
  size: 18,
  base64Data: STALE_BASE64,
  previewUrl: `data:image/png;base64,${STALE_BASE64}`,
};

/** The file input the picker's own button drives. */
const fileInput = (page: Page) => page.locator('#multimodal-file-input').first();

/** The attached-file row, once a file is selected. */
const preview = (page: Page) => page.getByAltText(PROBE_NAME).first();
const fileName = (page: Page) => page.getByText(PROBE_NAME, { exact: true }).first();

/** The launchpad goes `inert` until the persisted prefs load; wait for it. */
const ready = (page: Page) => expect(page.locator('.studio-launchpad').first()).not.toHaveAttribute('aria-busy', 'true');

/**
 * The session-state record as it actually sits in IndexedDB — read with a
 * version-less open, which is safe because the hook's own hydration read opened
 * and created this database on mount.
 */
async function storedUpload(page: Page): Promise<{ name: string; base64Data: string } | null> {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('deepencode_indexeddb_v1');
        open.onerror = () => resolve(null);
        // The app's own open is versioned (2); a probe that held a connection
        // open would make that upgrade wait forever, so every exit closes.
        open.onblocked = () => resolve(null);
        open.onsuccess = () => {
          const db = open.result;
          const done = (value: { name: string; base64Data: string } | null) => {
            db.close();
            resolve(value);
          };
          if (!db.objectStoreNames.contains('session_state')) {
            done(null);
            return;
          }
          const request = db.transaction('session_state', 'readonly').objectStore('session_state').get('last_upload');
          request.onsuccess = () => done((request.result as { name: string; base64Data: string } | null) ?? null);
          request.onerror = () => done(null);
        };
      })
  ) as Promise<{ name: string; base64Data: string } | null>;
}

const attach = async (page: Page, name = PROBE_NAME) => {
  await fileInput(page).setInputFiles({
    name,
    mimeType: 'image/png',
    buffer: Buffer.from(PNG_BASE64, 'base64'),
  });
};

/**
 * Makes the app's own IndexedDB open wait, so the hook's hydration read is still
 * in flight when the learner picks - the window defect 41 lived in - and
 * optionally leaves a previous session's upload in the store for that late read
 * to find.
 *
 * It delays by holding a real connection rather than by patching a handler: the
 * init script opens the database itself and keeps that connection for `holdMs`.
 * On a fresh profile the script's open CREATES the store at version 1, so the
 * app's own version-2 open needs an upgrade and the browser blocks it until the
 * held connection closes. Every event handler is the browser's own - which
 * matters, because `idb` resolves its open through
 * `request.addEventListener('success', …)`, and shadowing `onsuccess` on the
 * instance silently starves that listener instead of delaying it. The app's
 * connection is simply late, which is exactly the condition under test.
 *
 * The seed is written once per tab: a reload re-runs this script, and re-seeding
 * would overwrite the very file the reload is supposed to restore.
 */
const holdIndexedDBOpen = (
  page: Page,
  options: { holdMs?: number; seed?: typeof STALE | null } = {}
) =>
  page.addInitScript(
    ({ hold, seed }) => {
      const alreadySeeded = Boolean(sessionStorage.getItem('deepencode-e2e-seeded'));
      const request = indexedDB.open('deepencode_indexeddb_v1');
      request.onupgradeneeded = () => {
        // The store has to exist at version 1 for the seed to be there when the
        // app's own upgrade runs; the app adds the rest of the stores itself.
        if (!request.result.objectStoreNames.contains('session_state')) {
          request.result.createObjectStore('session_state');
        }
      };
      request.onerror = () => {};
      request.onsuccess = () => {
        const held = request.result;
        const release = () => window.setTimeout(() => held.close(), hold);
        if (!seed || alreadySeeded) {
          release();
          return;
        }
        const tx = held.transaction('session_state', 'readwrite');
        tx.objectStore('session_state').put(seed, 'last_upload');
        tx.oncomplete = () => {
          sessionStorage.setItem('deepencode-e2e-seeded', '1');
          release();
        };
        tx.onabort = release;
      };
    },
    { hold: options.holdMs ?? 4000, seed: options.seed ?? null }
  );

test.describe('the attached file survives a reload (defect 41)', () => {
  test('a picked file is persisted, and comes back with its exact bytes after a reload', async ({ page }) => {
    await mockAiApis(page);
    await page.goto('/');
    await ready(page);

    await attach(page);

    // It is on screen, rendering the picked image itself (not a placeholder).
    await expect(fileName(page)).toBeVisible();
    await expect(preview(page)).toHaveAttribute('src', PNG_DATA_URL);

    // And it reached the store rather than only React state: this is the write
    // the pre-fix hook dropped when a pick landed inside the hydration window.
    await expect
      .poll(() => storedUpload(page), { timeout: 10_000 })
      .toMatchObject({
        name: PROBE_NAME,
        base64Data: PNG_BASE64,
      });

    await page.reload();
    await ready(page);

    // The bytes, not merely the name: a reload that restored the wrong file -
    // the previous session's upload - would still have a row here.
    await expect(preview(page)).toHaveAttribute('src', PNG_DATA_URL);
    await expect(fileName(page)).toBeVisible();
  });

  test('a pick that lands while the hydration read is still open beats the stored upload and survives the reload', async ({ page }) => {
    // The defect itself, in a real browser: the read has not answered yet when
    // the pick arrives, and what it finally answers with is the previous
    // session's upload. That is the only condition under which the old guard
    // dropped the pick's write and then let the stored value win.
    await holdIndexedDBOpen(page, { holdMs: 4000, seed: STALE });
    await mockAiApis(page);
    await page.goto('/');
    await ready(page);

    // The pick lands inside the window; nothing here waits for the read.
    await attach(page);
    await expect(preview(page)).toHaveAttribute('src', PNG_DATA_URL);

    // By now the late read has answered. Pre-fix this is where the pick lost:
    // the store ends up holding the seeded upload, because the pick's write was
    // dropped and the read's value was then written in its place. The poll
    // budget covers the deliberately late `indexedDB.open` in this test.
    await expect
      .poll(() => storedUpload(page), { timeout: 15_000 })
      .toMatchObject({
        name: PROBE_NAME,
        base64Data: PNG_BASE64,
      });
    // And the version that arrived late was never put on screen.
    await expect(preview(page)).toHaveAttribute('src', PNG_DATA_URL);
    await expect(page.getByText(STALE_NAME, { exact: true })).toHaveCount(0);

    await page.reload();
    await ready(page);
    await expect(preview(page)).toHaveAttribute('src', PNG_DATA_URL);
    await expect(page.getByText(STALE_NAME, { exact: true })).toHaveCount(0);
    await expect(fileName(page)).toBeVisible();
  });

  test('the newest pick wins, including over a file restored by the reload before it', async ({ page }) => {
    // The clobber direction: a stored upload must never outrank a pick the
    // learner makes after it is restored.
    await mockAiApis(page);
    await page.goto('/');
    await ready(page);

    await attach(page, 'first-upload.png');
    await expect(page.getByText('first-upload.png', { exact: true }).first()).toBeVisible();
    await page.reload();
    await ready(page);
    await expect(page.getByText('first-upload.png', { exact: true }).first()).toBeVisible();

    // Pick a second file over the restored one.
    await attach(page);
    await expect(fileName(page)).toBeVisible();
    await expect(page.getByText('first-upload.png', { exact: true })).toHaveCount(0);

    await expect
      .poll(() => storedUpload(page), { timeout: 10_000 })
      .toMatchObject({
        name: PROBE_NAME,
        base64Data: PNG_BASE64,
      });

    await page.reload();
    await ready(page);

    // The second pick is what survived - not the file the reload had restored.
    await expect(preview(page)).toHaveAttribute('src', PNG_DATA_URL);
    await expect(page.getByText('first-upload.png', { exact: true })).toHaveCount(0);
  });
});
