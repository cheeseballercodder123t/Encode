import { test, expect, type Page } from '@playwright/test';
import { MOCK_NOTES, MR_M_ENCODE_RESPONSE, P1_FIELD1, P1_FIELD2 } from './helpers/fixtures';
import {
  ENCODE_ROUTE,
  mockAiApis,
  startEncodeFromNotes,
  confirmReadiness,
  expectStage,
} from './helpers/mocks';

/**
 * Mr M mode, driven through the real workbench.
 *
 * The whole feature is a stack of additive surfaces, so the two things worth
 * pinning in the browser are the two things the unit tests cannot see: that the
 * preparation surfaces actually land on screen ABOVE the answer fields, and that
 * turning the pill off removes every one of them without touching the examiner's
 * own read — the mode being off has to mean the app as it was, not a broken
 * half-rendered stage.
 *
 * The autopsy assertion is the heart of it. The examiner's mock returns
 * `secured: false`, and the learner answers a factor of two away from the
 * exemplar, so the structural label and the arithmetic both have to appear —
 * and that arithmetic is computed in code, never asked of the model.
 */

async function openMrMStage(page: Page) {
  await mockAiApis(page);
  // Registered after mockAiApis: a later route wins, which is how every spec
  // that needs its own encode payload overrides the shared one.
  await page.route(ENCODE_ROUTE, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MR_M_ENCODE_RESPONSE),
    })
  );
  await startEncodeFromNotes(page, MOCK_NOTES);
  await confirmReadiness(page);
  await expectStage(page, 1);
}

/** The examiner's mock grades `secured: false`, so the autopsy path is live. */
async function checkWithWrongAnswer(page: Page) {
  await page.getByPlaceholder(P1_FIELD1).fill('The heat released is 0.0168 kJ.');
  await page.getByPlaceholder(P1_FIELD2).fill('I divided the two numbers I was given.');
  await page.getByRole('button', { name: /CHECK/ }).click();
}

test.describe('Mr M mode', () => {
  test('is on by default and paints every preparation surface above the fields', async ({ page }) => {
    await openMrMStage(page);

    // The pill is the masthead toggle, and it starts lit.
    await expect(page.getByTestId('mr-m-toggle')).toHaveText('Mr M · on');

    const pre = page.getByTestId('mr-m-surface-pre');
    await expect(pre).toBeVisible();

    // The coordinate system comes first, and the law is stated as physics.
    await expect(page.getByTestId('mr-m-axiom-law')).toContainText('Energy is conserved');

    // Every letter gets a physical identity, with the misreading named.
    await expect(page.getByTestId('mr-m-ontology')).toBeVisible();
    await expect(page.getByTestId('mr-m-ontology-m')).toContainText('not the solid');

    // The multi-rule problem is a linear chain, one rule per step.
    await expect(page.getByTestId('mr-m-steps')).toBeVisible();
    await expect(page.getByTestId('mr-m-step-1')).toContainText('1 L of water has a mass of 1 kg');
    await page.getByTestId('mr-m-step-1').click();
    await expect(page.getByTestId('mr-m-step-1')).toHaveAttribute('aria-pressed', 'true');

    // The invariant is quoted verbatim; a preset moves only the readout.
    await expect(page.getByTestId('mr-m-invariant')).toHaveText('q = m c ΔT');
    await page.getByTestId('mr-m-preset-m-x2').click();
    await expect(page.getByTestId('mr-m-readout')).toHaveText('×2.00');
    await expect(page.getByTestId('mr-m-invariant')).toHaveText('q = m c ΔT');
  });

  test('a wrong answer gets a structural autopsy with the arithmetic that proves it', async ({ page }) => {
    await openMrMStage(page);
    await checkWithWrongAnswer(page);

    const autopsy = page.getByTestId('mr-m-autopsy');
    await expect(autopsy).toBeVisible();

    // The failure is named structurally, not as a verdict.
    await expect(page.getByTestId('mr-m-autopsy-trap')).toContainText('factor_of_two');

    // And the arithmetic is the exact line that makes it undeniable — computed
    // in lib/mr-m/diagnostics.ts, never asked of the model.
    await expect(page.getByTestId('mr-m-autopsy-arithmetic')).toHaveText('0.0336 ÷ 0.0168 = 2.00');
    await expect(page.getByTestId('mr-m-autopsy-reason')).toContainText('stoichiometric');
    // And the panel says which half of the autopsy is which: the figure is
    // arithmetic done on the learner's numbers, the sentence is the examiner's
    // reading. The distinction is the reason to trust the line.
    await expect(page.getByTestId('mr-m-autopsy-provenance')).toContainText(
      'not written by the model'
    );
  });

  test('the autopsy can become a real trap card, with the learner declaring the confidence', async ({ page }) => {
    await openMrMStage(page);
    await checkWithWrongAnswer(page);

    // The offer is explicit — the card is never automatic, because only the
    // learner knows how confident they were when they committed.
    await expect(page.getByTestId('mr-m-autopsy-card-flow')).toBeVisible();
    const save = page.getByTestId('mr-m-autopsy-card-save');
    await expect(save).toBeDisabled();

    // Declaring a tier is what unlocks the save — that is the honest input
    // the panel cannot supply for them.
    await page.getByTestId('mr-m-autopsy-card-tier-bet').click();
    await expect(page.getByTestId('mr-m-autopsy-card-tier-bet')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(save).toBeEnabled();
    await save.click();

    await expect(page.getByTestId('mr-m-autopsy-card-saved')).toContainText('front of your deck');

    // And it landed in the same store the Anki funnel reads: the check-time
    // answer on the front, the deterministic arithmetic on the back.
    const stored = await page.evaluate(() => {
      const raw = window.localStorage.getItem('deepencode_interference_traps_v1');
      return raw ? (JSON.parse(raw) as Array<Record<string, unknown>>) : [];
    });
    expect(stored).toHaveLength(1);
    expect(stored[0].confidenceTier).toBe('bet');
    expect(String(stored[0].cardFront)).toContain('0.0168 kJ');
    expect(String(stored[0].cardBack)).toContain('0.0336 ÷ 0.0168 = 2.00');
    expect(String(stored[0].cardBack)).toContain('{{c1::');
  });

  test('the two-way check sits beside the examiner read', async ({ page }) => {
    await openMrMStage(page);
    await checkWithWrongAnswer(page);

    await expect(page.getByTestId('mr-m-surface-post')).toBeVisible();
    const spar = page.getByTestId('mr-m-spar');
    await expect(spar).toBeVisible();
    await expect(spar).toContainText('vasa recta');

    // Both controls demand a committed line first; neither fires on an empty box.
    await expect(page.getByTestId('mr-m-spar-confirm')).toBeDisabled();
    await page.getByTestId('mr-m-spar-input').fill('Yes, exactly — it doubles.');
    await expect(page.getByTestId('mr-m-spar-confirm')).toBeEnabled();
    await page.getByTestId('mr-m-spar-confirm').click();
    await expect(page.getByTestId('mr-m-spar-locked')).toBeVisible();
  });

  test('a contradiction can be raised from the axiom panel and closed again', async ({ page }) => {
    await openMrMStage(page);
    await expect(page.getByTestId('mr-m-paradox')).toHaveCount(0);

    await page.getByTestId('mr-m-axiom-stress').click();
    await page
      .getByTestId('mr-m-axiom-stress-input')
      .fill('Why does breaking ATP release energy if breaking bonds is endothermic?');
    await page.getByTestId('mr-m-axiom-stress-submit').click();

    // An open paradox leads the stack: it is the one thing that has to be
    // visible before anything else on the stage.
    await expect(page.getByTestId('mr-m-paradox')).toBeVisible();
    await expect(page.getByTestId('mr-m-paradox')).toContainText('breaking ATP');

    // Closing it needs the sentence that did it, and then it is gone.
    await page
      .locator('[data-testid^="mr-m-paradox-input-"]')
      .fill('ATP hydrolysis releases energy because the products are more stable overall.');
    await page.locator('[data-testid^="mr-m-paradox-resolve-"]').click();
    await expect(page.getByTestId('mr-m-paradox')).toHaveCount(0);
  });

  test('turning the mode off removes every surface and leaves the examiner read intact', async ({ page }) => {
    await openMrMStage(page);
    await expect(page.getByTestId('mr-m-surface-pre')).toBeVisible();

    await page.getByTestId('mr-m-toggle').click();
    await expect(page.getByTestId('mr-m-toggle')).toHaveText('Mr M');
    await expect(page.getByTestId('mr-m-surface-pre')).toHaveCount(0);
    await expect(page.getByTestId('mr-m-axiom')).toHaveCount(0);
    await expect(page.getByTestId('mr-m-sliders')).toHaveCount(0);

    // The stage itself is untouched: the examiner still reports the delta, and
    // only the Mr M surfaces are gone.
    await checkWithWrongAnswer(page);
    await expect(page.getByText(/You nailed:/)).toBeVisible();
    await expect(page.getByTestId('mr-m-autopsy')).toHaveCount(0);
    await expect(page.getByTestId('mr-m-surface-post')).toHaveCount(0);

    // And it is a remembered preference, not a per-session flip.
    await page.reload();
    await expect(page.getByTestId('mr-m-toggle')).toHaveText('Mr M');
  });

  test('the settings switch and the masthead pill are one piece of state', async ({ page }) => {
    await openMrMStage(page);
    await expect(page.getByTestId('mr-m-toggle')).toHaveText('Mr M · on');

    // The pill is only one of the two places the toggle lives. The other is the
    // settings sheet, which spells out what the mode does.
    await page.locator('button[title^="Configure Models"]').click();
    const settingsSwitch = page.getByTestId('mr-m-settings-toggle');
    await expect(settingsSwitch).toHaveText('[ ON ]');
    await settingsSwitch.click();
    await expect(settingsSwitch).toHaveText('[ OFF ]');

    // One writer, two surfaces: closing the sheet finds the masthead already
    // agreeing, with the stages stripped back to the app as it was.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('mr-m-toggle')).toHaveText('Mr M');
    await expect(page.getByTestId('mr-m-surface-pre')).toHaveCount(0);
  });

  test('the preparation stack folds away without switching anything off', async ({ page }) => {
    await openMrMStage(page);
    await expect(page.getByTestId('mr-m-axiom')).toBeVisible();
    await expect(page.getByTestId('mr-m-fold')).toHaveText('[ fold ]');

    await page.getByTestId('mr-m-fold').click();

    // Folded, not switched off: the stack is still on the stage, reduced to one
    // line that names what is inside it.
    await expect(page.getByTestId('mr-m-surface-pre')).toBeVisible();
    await expect(page.getByTestId('mr-m-axiom')).toHaveCount(0);
    await expect(page.getByTestId('mr-m-folded-note')).toContainText('Coordinate system first');
    await expect(page.getByTestId('mr-m-fold')).toHaveAttribute('aria-expanded', 'false');

    await page.getByTestId('mr-m-fold').click();
    await expect(page.getByTestId('mr-m-axiom')).toBeVisible();
  });

  test('the chain reports what is held and resets in one click', async ({ page }) => {
    await openMrMStage(page);
    await expect(page.getByTestId('mr-m-steps-progress')).toHaveText('0 of 3 held');

    await page.getByTestId('mr-m-step-1').click();
    await page.getByTestId('mr-m-step-2').click();
    await expect(page.getByTestId('mr-m-steps-progress')).toHaveText('2 of 3 held');

    // A mis-tick used to have to be undone one box at a time.
    await page.getByTestId('mr-m-steps-reset').click();
    await expect(page.getByTestId('mr-m-steps-progress')).toHaveText('0 of 3 held');
    await expect(page.getByTestId('mr-m-step-1')).toHaveAttribute('aria-pressed', 'false');
  });

  test('the sliders return to the stage\u2019s own numbers in one control', async ({ page }) => {
    await openMrMStage(page);
    await expect(page.getByTestId('mr-m-readout')).toHaveText('×1.00');

    await page.getByTestId('mr-m-preset-m-x2').click();
    await expect(page.getByTestId('mr-m-readout')).toHaveText('×2.00');

    await page.getByTestId('mr-m-sliders-reset').click();
    await expect(page.getByTestId('mr-m-readout')).toHaveText('×1.00');
  });

  test('a challenge is recorded as a committed objection, not a tie', async ({ page }) => {
    await openMrMStage(page);
    await checkWithWrongAnswer(page);

    await page
      .getByTestId('mr-m-spar-input')
      .fill('That cannot be right: one pass of the pump builds about 200 mOsm.');
    await page.getByTestId('mr-m-spar-challenge').click();

    // The learner's own sentence is frozen into the objection and carried as an
    // open question rather than smoothed over ...
    const objection = page.getByTestId('mr-m-spar-objection');
    await expect(objection).toBeVisible();
    await expect(objection).toContainText('cannot be right');

    // ... and a challenge is never a dead end.
    await page.getByTestId('mr-m-spar-noted').click();
    await expect(page.getByTestId('mr-m-spar-locked')).toBeVisible();
  });
});
