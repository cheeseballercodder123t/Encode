import { test, expect } from '@playwright/test';
import { mockAiApis, mockAuditFlow } from './helpers/mocks';

// â”€â”€â”€ FSRS Card Audit e2e â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Drives the real app flow: notes â†’ Segregate and export (mocked /api/segregate
// returns one clean + one ambiguous + one too-long cloze fact) â†’ Export to


test.describe('FSRS Card Audit (inline in Export tab)', () => {
  test('holds back the over-ceiling cloze and audits what actually ships', async ({ page }) => {
    await mockAiApis(page);
    await mockAuditFlow(page);
    await page.goto('/');

    // Enter notes then hit "Segregate and export" (calls /api/segregate).
    await page.getByPlaceholder(/Paste study material/).fill('Acid-base equilibria and the electron transport chain.');
    await page.getByRole('button', { name: /segregate and export/i }).click();

    // The export-choice modal appears â€” choose Anki.
    await expect(page.getByText(/Segregation Complete/i)).toBeVisible();
    await page.getByRole('button', { name: /\.APKG \+ SM-2/ }).click();

    // The Anki modal opens on the Wozniak-enforced deck.
    await expect(page.getByText('Anki & SM-2 Spaced Repetition Exporter')).toBeVisible();
    // Wozniak enforcement runs before the audit: the clean cloze and the
    // ambiguous one ship, the over-ceiling one is held back.
    await expect(page.getByText('2 Flashcards')).toBeVisible();
    await expect(page.getByText('1 need audit')).toBeVisible();
    await expect(page.getByText(/\[ WOZNIAK \] Enforcement pass/)).toBeVisible();
    await expect(page.getByText(/3 raw . 2 atomic/)).toBeVisible();
    await expect(page.getByText(/2 card fragments held back/)).toBeVisible();

    // The FSRS Card Audit is inline in the Export tab (no separate tab anymore).
    await expect(page.getByText(/FSRS Card Audit : 1 card flagged/)).toBeVisible();

    // The ambiguous cue ({{Na+ or K+}}) is flagged.
    await expect(page.getByText(/Ambiguous retrieval cue/)).toBeVisible();

    // Nothing in the SHIPPED deck is too dense anymore : that is the point of
    // the enforcement pass, so no enabled Split button is offered.
    await expect(page.getByText(/This card is too dense/)).not.toBeVisible();
    await expect(page.locator('button:enabled', { hasText: 'Split' })).not.toBeVisible();

    // The explicit opt-in puts the held-back fragments back into the deck.
    await page.getByText(/Export them anyway/).click();
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
