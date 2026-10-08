import { test, expect } from '@playwright/test';
import { mockAiApis } from './helpers/mocks';

/**
 * The audit sheet's Split control, driven where it actually has work to do.
 *
 * `e2e/fsrs-audit.spec.ts` proves the over-ceiling cloze is HELD BACK by the
 * Wozniak pass, which is why its own fixture can never offer an enabled Split
 * button: a 33-word front never survives the 20-word front+back ceiling split
 * into pieces, it is withheld. A curated card does survive - traps and conflict
 * cards ride through the ceiling untouched (`lib/anki-exporter.ts`'s
 * PROTECTED_CARD_TAGS) - so this spec uses one to put a 33-word cloze in the
 * shipped deck and press Split on it.
 *
 * What it pins: ONE click has to bring every piece under the 15-word limit.
 * The pre-fix splitter could only ever return two halves, and two halves of 33
 * words are 17 and 16 - still flagged, so the button never cleared the flag it
 * exists to clear. Against that code this spec fails with `Expected "5
 * Flashcards", Received "4 Flashcards"` (two halves instead of three pieces).
 */
const SEGREGATE_RESPONSE = {
  topic: 'AP Chemistry: Acid-Base Equilibria',
  declarativeFacts: [
    {
      id: 'fact-clean',
      factStatement: 'HCl is a strong acid.',
      clozeSuggestion: '{{c1::HCl}} is a strong acid.',
      tag: 'Chemistry',
    },
    {
      id: 'fact-ambiguous',
      factStatement: 'The cation is Na+ or K+.',
      clozeSuggestion: 'The cation is {{c1::Na+ or K+}}.',
      tag: 'Chemistry',
    },
    {
      // A curated card: PROTECTED_CARD_TAGS keeps the Wozniak ceiling from
      // re-cutting it, so the 33-word front ships as-is and the audit keeps
      // flagging it until the learner presses Split.
      id: 'fact-long',
      factStatement: 'The proton gradient drives ATP synthase.',
      clozeSuggestion:
        'The {{c1::mitochondrial}} electron transport chain produces a large amount of ATP via oxidative phosphorylation across the inner mitochondrial membrane, and the resulting proton gradient drives ATP synthase to regenerate the primary energy currency',
      tag: 'InterferenceTrap',
    },
  ],
  conceptualMechanisms: [],
};

test('the Split control brings every piece under the word limit in one click', async ({ page }) => {
  await mockAiApis(page);
  await page.route('**/api/segregate', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SEGREGATE_RESPONSE),
    })
  );
  await page.goto('/');

  await page.getByPlaceholder(/Paste study material/).fill('Acid-base equilibria and the electron transport chain.');
  await page.getByRole('button', { name: /segregate and export/i }).click();
  await expect(page.getByText(/Segregation Complete/i)).toBeVisible();
  await page.getByRole('button', { name: /\.APKG \+ SM-2/ }).click();
  await expect(page.getByText('Anki & SM-2 Spaced Repetition Exporter')).toBeVisible();

  const badge = page.getByText(/^\d+ Flashcards$/);
  const before = Number((await badge.innerText()).split(' ')[0]);
  await expect(page.getByText(/This card is too dense/)).toBeVisible();

  // The dense card ships WITH the tag the completion screen tells the learner
  // to filter on. Asserted through the sheet's own tag chips because this is
  // the flow where the tag was missing: the declarative-facts path never
  // called the tagger, so a deck built from a segregation report carried none
  // of the `LeechCandidate` tags the trophy's "Dense (tagged)" number counted
  // (BUGS_AUDIT_REPORT.md §12, defect 24). Exactly one card is over 15 words
  // front+back here, and it is this 33-word one.
  await expect(page.getByText('LeechCandidate', { exact: true })).toHaveCount(1);

  const enabledSplit = page.locator('button:enabled', { hasText: 'Split' });
  await expect(enabledSplit).toHaveCount(1);
  await enabledSplit.click();

  // One 33-word card became three pieces: +2 cards.
  await expect(badge).toHaveText(`${before + 2} Flashcards`);
  // Nothing is too dense any more, and the control is gone rather than
  // still offering a split that cannot help.
  await expect(page.getByText(/This card is too dense/)).toHaveCount(0);
  await expect(page.locator('button:enabled', { hasText: 'Split' })).toHaveCount(0);
});
