import { test, expect, type Download } from '@playwright/test';
import { mockAiApis } from './helpers/mocks';
import JSZip from 'jszip';

test.describe('Procedural Trap-Engine MCQ Exporter', () => {
  test('built-in archetypes → AI author → validate/repair → live preview → .apkg download', async ({ page }) => {
    await mockAiApis(page);
    await page.goto('/');

    // Open the Anki export modal.
    await page.locator('button[title^="Export .apkg Anki package"]').click();
    await expect(page.getByText('Anki & SM-2 Spaced Repetition Exporter')).toBeVisible();

    // Switch to the Procedural MCQ tab.
    await page.getByRole('button', { name: /Procedural MCQ Deck/ }).click();
    await expect(page.getByText(/Procedural Trap-Engine MCQ Deck/)).toBeVisible();

    // The 9 built-in archetypes are listed and verified.
    await expect(
      page.locator('label').filter({ hasText: 'AP Physics C: Simple Harmonic Motion' })
    ).toBeVisible();
    await expect(
      page.locator('label').filter({ hasText: 'AP Chemistry: Buffer pH' })
    ).toBeVisible();
    await expect(
      page.locator('label').filter({ hasText: 'AP Statistics: One-Sample Z-Statistic' })
    ).toBeVisible();
    await expect(page.getByText('Verified').first()).toBeVisible();

    // 9 built-ins + 0 AI = 9 of 9, all pre-selected.
    await expect(page.getByText(/9 of 9 selected/)).toBeVisible();

    // AI author round 1: one valid + one broken archetype.
    await page.getByPlaceholder('e.g. AP Physics C: Rotational Motion').fill('AP Physics C: SHM');
    await page.getByRole('button', { name: /Generate with AI/ }).click();
    await expect(
      page.locator('label').filter({ hasText: 'Simple Harmonic Motion (AI-authored)' })
    ).toBeVisible();
    await expect(
      page.locator('label').filter({ hasText: 'repair demo' })
    ).toBeVisible();
    await expect(
      page.locator('label').filter({ hasText: 'repair demo' }).locator('xpath=.//*[contains(text(),"Fails validation")]')
    ).toBeVisible();

    // Round 2: simulate the flash-lite repairer returning a fixed archetype.
    await page.getByRole('button', { name: /Generate with AI/ }).click();
    await expect(page.getByText(/all passed the 50-trial numerical validator/)).toBeVisible();
    // The previously-broken archetype is now verified.
    await expect(
      page.getByText('Gas Molecule Kinetic Energy (repair demo)').locator('xpath=ancestor::label')
    ).toContainText('Verified');

    // Live preview iframe runs the embedded client-side runner:
    // 4 options render, and clicking one reveals trap feedback + solution.
    const preview = page.frameLocator('iframe[title="Procedural MCQ Preview"]');
    await expect(preview.locator('.proc-option')).toHaveCount(4);
    await preview.locator('.proc-option').first().click();
    await expect(preview.locator('.proc-solution')).toBeVisible();
    // Fresh number roll produced a numeric value on the buttons.
    const firstLabel = (await preview.locator('.proc-option .proc-letter + span').first().textContent()) || '';
    expect(/[A-D]\.\s*[\d.eE+-]+/.test('A. ' + firstLabel)).toBe(true);

    // Download the .apkg (Node-side validation: zip contains collection.anki2).
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download Procedural MCQ \.apkg/ }).click();
    const download: Download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const fs = await import('fs');
    const buffer = fs.readFileSync(downloadPath!);
    const zip = await JSZip.loadAsync(buffer);
    const coll = zip.file('collection.anki2');
    expect(coll).toBeTruthy();
    const collData = await coll!.async('uint8array');
    expect(collData.length % 4096).toBe(0);
    expect(Buffer.from(collData.slice(0, 15)).toString('latin1')).toBe('SQLite format 3');
    expect(await zip.file('media')?.async('string')).toBe('{}');

    // The generated note type is embedded in the sqlite models column.
    const textDecoder = new TextDecoder();
    const hasModelName = textDecoder.decode(collData).includes('DeepEncode Procedural MCQ');
    expect(hasModelName).toBe(true);
  });

  test('procedural .txt text-import companion downloads too', async ({ page }) => {
    await mockAiApis(page);
    await page.goto('/');
    await page.locator('button[title^="Export .apkg Anki package"]').click();
    await page.getByRole('button', { name: /Procedural MCQ Deck/ }).click();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download Procedural \.txt/ }).click();
    const download: Download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const fs = await import('fs');
    const content = fs.readFileSync(downloadPath!, 'utf8');
    expect(content).toContain('#separator:tab');
    expect(content).toContain('#notetype:DeepEncode Procedural MCQ');
    expect(content).toContain('<script type="application/json"');
  });
});