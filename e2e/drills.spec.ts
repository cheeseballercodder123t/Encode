import { test, expect } from '@playwright/test';
import { MOCK_NOTES } from './helpers/fixtures';
import { mockAiApis, startEncodeFromNotes, confirmReadiness, expectStage } from './helpers/mocks';

/**
 * Friction-cut drills for drained days.
 *
 * - The why-ladder forces a first-layer answer down to a systemic necessity.
 * - The inverted-step drill is recognition-then-repair: find the lie the
 *   examiner planted in a 4-step chain, then write the one-sentence fix.
 *
 * Both write back into the stage's own answer, so what they teach ends up on
 * the card instead of evaporating with the modal.
 */

test.describe('Recursive why-ladder', () => {
  test('probes the answer down to bedrock and adopts the axiom', async ({ page }) => {
    await mockAiApis(page);
    await startEncodeFromNotes(page, MOCK_NOTES);
    await confirmReadiness(page);
    await expectStage(page, 1);

    await page.getByPlaceholder('STAGE1_FIELD1').fill('Sodium rushes in through voltage-gated channels.');
    await page.getByPlaceholder('STAGE1_FIELD2').fill('The membrane crossed threshold, so gates open.');

    // The ladder opens as a workbench tool and quotes the learner's own wording.
    await page.getByRole('button', { name: 'Probe deeper off' }).click();
    await expect(page.getByText('Depth ladder')).toBeVisible();
    await expect(page.getByText('layer 1 / 4')).toBeVisible();
    await expect(page.getByText('Layer 0 · your wording')).toBeVisible();

    // First probe: the examiner interrogates layer 0.
    await page.getByTestId('probe-start').click();
    await expect(
      page.getByText(/What property of the channel protein forces it to open/)
    ).toBeVisible();

    // Answer it, then probe again — the mock reports bedrock on round 2.
    await page.getByTestId('probe-answer-0').fill('The S4 segments are charged and move in the field.');
    await page.getByTestId('probe-deeper').click();

    await expect(page.getByText('[ AXIOM ] systemic necessity')).toBeVisible();
    await expect(page.getByText(/charged S4 segments are physically pulled by the field/)).toBeVisible();

    // Adopting it lands the necessity in the stage answer (this stage has no
    // anchor slot, so it appends to the mechanism field).
    await page.getByTestId('probe-adopt').click();
    await expect(page.getByPlaceholder('STAGE1_FIELD2')).toHaveValue(
      /charged S4 segments are physically pulled by the field/
    );
  });
});

test.describe('Spot the inverted step', () => {
  test('finds the planted lie and appends the one-sentence fix', async ({ page }) => {
    await mockAiApis(page);
    await startEncodeFromNotes(page, MOCK_NOTES);
    await confirmReadiness(page);
    await expectStage(page, 1);

    await page.getByPlaceholder('STAGE1_FIELD2').fill('The membrane crossed threshold, so gates open.');

    await page.getByRole('button', { name: 'Spot the flaw off' }).click();
    await page.getByTestId('invert-build').click();

    // Four steps render with equal confidence — no formatting tells give it away.
    await expect(page.getByText('Action Potential Chain')).toBeVisible();
    await expect(page.getByText('one of 4 steps is false')).toBeVisible();
    await expect(page.getByTestId('invert-step-0')).toContainText('The membrane crosses -55 mV.');
    await expect(page.getByTestId('invert-step-3')).toContainText('K+ efflux restores the resting charge.');

    // Step 3 is the lie (index 2).
    await page.getByTestId('invert-step-2').click();
    await expect(page.getByTestId('invert-verdict')).toContainText('Caught it.');
    await expect(page.getByText(/Inactivation closes the pore and ends the spike/)).toBeVisible();
    await expect(page.getByTestId('invert-step-2')).toContainText('[ the lie ]');

    await page.getByTestId('invert-fix-input').fill('Inactivation closes the pore; it never opens it.');
    await page.getByRole('button', { name: 'Add to answer' }).click();

    await expect(page.getByPlaceholder('STAGE1_FIELD2')).toHaveValue(
      /Inactivation closes the pore; it never opens it\./
    );
    // The learner's original wording survives the append.
    await expect(page.getByPlaceholder('STAGE1_FIELD2')).toHaveValue(
      /The membrane crossed threshold, so gates open\./
    );
  });
});
