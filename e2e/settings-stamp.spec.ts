import { test, expect, type Page } from '@playwright/test';

/**
 * Defect 36 in the browser: the write paths that stamp the settings record.
 *
 * The cloud guard (`lib/settings-sync.ts`, read by `lib/auth-context.tsx`)
 * compares the account's `settingsBackup.savedAt` against this device's record,
 * and applies the account's copy only when it is newer. Two of the four writers
 * left the field absent, which reads as `0` - so a reset or a restored file was
 * outranked by an account backup from any date, and a learner who deliberately
 * cleared an API key got it back on their next sign-in. The decision itself is
 * pinned in `tests/unit/settings-sync.test.ts`, the storage layer in
 * `tests/unit/storage.test.ts`, and the restore path in `tests/unit/backup.test.ts`.
 *
 * What only a browser can prove is that the writes the *learner* performs end up
 * on disk carrying an age, through the real sheet: the reset writes now, and a
 * later save moves the stamp forward rather than reusing the old one. That is the
 * input the guard needs to be correct, and it is the half of the bug the unit
 * tests have to fake their way to.
 *
 * One honest limit, stated because it is easy to misread this file: the stamp is
 * now guaranteed twice, once at each call site and once inside the single writer
 * `saveAISettings`. Either layer alone satisfies the assertions below, so this
 * spec pins the observable behaviour but cannot tell the two apart. The mutation
 * that discriminates them - writing the record exactly as handed in, the pre-fix
 * behaviour - is run against the unit tests, where it fails five of them.
 *
 * Not covered here: the account half (the Firestore comparison) needs a signed-in
 * session, so it is unit-tested rather than driven through a browser.
 */

const SETTINGS_KEY = 'deepencode_ai_settings_v2';
/** The stamp a device would hold if it had been used before this round. */
const OLD_STAMP = Date.parse('2026-01-01T00:00:00Z');

const storedSettings = (page: Page) =>
  page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || 'null'), SETTINGS_KEY);

async function openSettings(page: Page) {
  await page.goto('/');
  await page.locator('button[title^="Configure Models"]').click();
  await expect(page.getByText('AI Engine & API Keys')).toBeVisible();
}

test.describe('every settings write carries its own age', () => {
  test('a reset to defaults is stamped now, so an older account backup cannot outrank it', async ({ page }) => {
    // A device that already holds a key and an old stamp, as a used one does.
    await page.addInitScript(
      ({ key, savedAt }) => {
        window.localStorage.setItem(
          key,
          JSON.stringify({ provider: 'openai', openaiApiKey: 'sk-the-key-they-cleared', savedAt })
        );
      },
      { key: SETTINGS_KEY, savedAt: OLD_STAMP }
    );

    await openSettings(page);
    await page.getByRole('button', { name: 'Reset to Defaults' }).click();

    const record = await storedSettings(page);
    expect(record.provider).toBe('gemini');
    expect(record.openaiApiKey).toBeUndefined();
    // The comparison the guard will make on the next sign-in: this record is
    // newer than the old one, instead of reading as "from the beginning of time".
    expect(record.savedAt).toBeGreaterThan(OLD_STAMP);
    expect(record.savedAt).toBeGreaterThan(Date.now() - 60_000);

    // And the sheet is still usable after the reset, rather than a dead panel.
    await expect(page.getByText('AI Engine & API Keys')).toBeVisible();
  });

  test('saving after a reset advances the stamp instead of reusing it', async ({ page }) => {
    await openSettings(page);
    await page.getByRole('button', { name: 'Reset to Defaults' }).click();
    const afterReset = (await storedSettings(page)).savedAt;
    expect(typeof afterReset).toBe('number');

    await page.waitForTimeout(5);
    await page.getByRole('button', { name: 'Save Configuration' }).click();

    await expect
      .poll(async () => (await storedSettings(page)).savedAt, {
        message: 'a second write must move the stamp forward',
      })
      .toBeGreaterThan(afterReset);
  });
});
