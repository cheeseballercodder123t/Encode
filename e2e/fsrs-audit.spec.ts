import { test, expect } from '@playwright/test';
import { mockAiApis, mockAuditFlow } from './helpers/mocks';

// â”€â”€â”€ FSRS Card Audit e2e â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Drives the real app flow: notes â†’ Segregate and export (mocked /api/segregate
// returns one clean + one ambiguous + one too-long cloze fact) â†’ Export to
// Anki â†’ FSRS Card Audit tab. Verifies the warnings render and that the
// auto-split button grows the deck by one card.

test.describe('FSRS Card Audit (inline in Export tab)', () => {
  test('flags ambiguous + too-long clozes and auto-splits the dense one', async ({ page }) => {
    await mockAiApis(page);
    await mockAuditFlow(page);
    await page.goto('/');

    // Enter notes then hit "Segregate and export" (calls /api/segregate).
    await page.getByPlaceholder(/Paste study material/).fill('Acid-base equilibria and the electron transport chain.');
    await page.getByRole('button', { name: /segregate and export/i }).click();

    // The export-choice modal appears â€” choose Anki.
    await expect(page.getByText(/Segregation Complete/i)).toBeVisible();
    await page.getByRole('button', { name: /\.APKG \+ SM-2/ }).click();

    // The Anki modal opens. The audit badge shows in the header because the
    // segregation report produced 2 flagged cards.
    await expect(page.getByText('Anki & SM-2 Spaced Repetition Exporter')).toBeVisible();
    await expect(page.getByText('2 need audit')).toBeVisible();

    // The FSRS Card Audit is inline in the Export tab (no separate tab anymore).
    await expect(page.getByText(/FSRS Card Audit : 2 cards flagged/)).toBeVisible();
    await expect(page.getByText(/FSRS Card Audit : \d+ cards flagged/)).toBeVisible();

    // The ambiguous cue ({{Na+ or K+}}) is flagged.
    await expect(page.getByText(/Ambiguous retrieval cue/)).toBeVisible();

    // The too-long cloze is flagged AND offers an enabled Split button.
    // The ambiguous card's own Split button is disabled, so target the
    // enabled one directly via CSS :enabled.
    await expect(page.getByText(/This card is too dense/)).toBeVisible();
    const splitButton = page.locator('button:enabled', { hasText: 'Split' });
    await expect(splitButton).toBeVisible();

    // Deck had 3 cards before the split.
    await expect(page.getByText('3 Flashcards')).toBeVisible();

    // Click Split â†’ the too-long card becomes two atomic cards (deck grows by 1).
    await splitButton.click();
    await expect(page.getByText('4 Flashcards')).toBeVisible();
  });

  test('shows "All clear" when no cards are flagged', async ({ page }) => {
    await mockAiApis(page); // /api/segregate returns empty report
    await page.goto('/');

    await page.getByPlaceholder(/Paste study material/).fill('Acid-base equilibria.');
    await page.getByRole('button', { name: /segregate and export/i }).click();
    await expect(page.getByText(/Segregation Complete/i)).toBeVisible();
    await page.getByRole('button', { name: /\.APKG \+ SM-2/ }).click();

    await expect(page.getByText('Anki & SM-2 Spaced Repetition Exporter')).toBeVisible();

    // No audit badge when nothing is flagged.
    await expect(page.getByText(/need audit/)).not.toBeVisible();

    // The inline audit renders the "All clear" state.
    await expect(page.getByText(/All clear/)).toBeVisible();
  });
});
