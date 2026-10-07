import { test, expect, type Page } from '@playwright/test';
import { CRISIS_RESPONSE, CRUCIBLE_RESPONSE, TRIAGE_DUMP } from './helpers/fixtures';
import { mockAiApis } from './helpers/mocks';

/**
 * The half of the cockpit that only exists under pressure: a clock, a standing
 * fault in front of it, and the night everything is due at once.
 *
 * What only the browser can prove here:
 *
 *  - **the clock is allocated, not merely counted.** The HUD's `target` per
 *    state is the client's own largest-remainder split of 12 minutes over the
 *    three problems and their declared weights (240s per problem, 80s per
 *    equal-weight state → `1.3m`). A countdown would prove nothing; a state
 *    table whose targets sum to the sprint is the feature;
 *  - **the summary reports pacing, not a verdict on the person.** Every state
 *    finished inside its budget renders as `ahead`, and the stress line says the
 *    pacing held — never that the learner was fast or slow;
 *  - **a repeated fracture gets in the way BEFORE the sprint**, drawn from the
 *    same persistent patch ledger the workbench records into. One hit is a slip
 *    and must stay silent, which is why the seed carries three;
 *  - **the boss banner promises only the collision the material can carry.**
 *    The topic matches a fusion row, but the material carries one chapter of
 *    it, so the route re-aims the escalation deeper inside that chapter — and
 *    the banner has to say that instead of promising a three-chapter sprint;
 *  - **the arithmetic gate reports what it actually did.** The summary shows how
 *    many served problems had their declared relations closed by a machine,
 *    which problem was dropped before the sprint was paced, and the escalation
 *    the problems were written for;
 *  - **the triage freeze is stated as arithmetic**, and an item whose weight
 *    cannot be shown is listed as withheld rather than frozen;
 *  - **the runway hides everything else**, renders one task, and counts down
 *    from the plan's own 90 minutes.
 */

/** Three hits on Thermochemistry — a standing fault, not a slip. */
const SEEDED_PATCHES = [
  {
    id: 'patch-e2e-sign',
    topic: 'Thermochemistry',
    kind: 'SIGN_FLIP',
    statement: 'Thermochemistry — anchor the convection before the arithmetic.',
    arithmeticReveal: '0.0336 ÷ -0.0336 = -1.00',
    hits: 3,
    firstSeenAt: 1,
    lastSeenAt: 2,
    learnerValue: -0.0336,
    expectedValue: 0.0336,
  },
  {
    id: 'patch-e2e-slip',
    topic: 'Thermochemistry',
    kind: 'FACTOR_OF_TWO',
    statement: 'Thermochemistry — a factor of two was dropped.',
    arithmeticReveal: '0.0336 ÷ 0.0168 = 2.00',
    // A single hit: this one must NOT be allowed in front of a new attempt.
    hits: 1,
    firstSeenAt: 1,
    lastSeenAt: 2,
    learnerValue: 0.0168,
    expectedValue: 0.0336,
  },
];

/**
 * Two clean wins in a row: the friction governor escalates to boss level, which
 * is what puts the escalation banner on the setup screen at all.
 */
const SEEDED_CLEAN_WINS = [
  { id: 'friction-e2e-2', topic: 'Thermochemistry', at: 2, secured: true, rungsUsed: 0, elapsedMs: 0, expectedMs: 0 },
  { id: 'friction-e2e-1', topic: 'Thermochemistry', at: 1, secured: true, rungsUsed: 0, elapsedMs: 0, expectedMs: 0 },
];

async function openCrucible(page: Page) {
  await mockAiApis(page);
  await page.goto('/');
  await page.getByTestId('open-crucible').click();
  await expect(page.getByRole('dialog', { name: 'Timed crucible sprint' })).toBeVisible();
}

test.describe('timed crucible', () => {
  test('allocates the clock across each problem states and reports pacing, not a score', async ({
    page,
  }) => {
    await openCrucible(page);

    // The topic bar takes the cursor: the sprint is timed against a chapter.
    await page.getByTestId('crucible-topic').fill('Thermochemistry');
    await page.getByTestId('crucible-start').click();

    // The sprint opens on the first problem, with its constraints and its ask.
    await expect(page.getByTestId('crucible-clock')).toContainText('problem 1 of 3');
    await expect(page.getByTestId('crucible-clock-value')).toContainText('left');
    await expect(page.getByTestId('crucible-constraints').locator('li')).toHaveCount(
      CRUCIBLE_RESPONSE.problems[0].constraints.length
    );
    await expect(page.getByTestId('crucible-ask')).toContainText('boundary work');

    // The HUD is the feature: a target PER STATE, not one clock for the problem.
    // 720s over 3 problems is 240s each; three equal weights is 80s apiece.
    await expect(page.getByTestId('crucible-state-0')).toContainText('System demand');
    await expect(page.getByTestId('crucible-state-target-0')).toContainText('1.3m');
    await expect(page.getByTestId('crucible-state-target-1')).toContainText('1.3m');

    // Marking a state done stamps its elapsed time and paces it.
    await page.getByTestId('crucible-state-next').click();
    await expect(page.getByTestId('crucible-state-pacing-0')).toContainText('ahead');

    // Finish the whole sprint: 3 + 3 + 2 states, in order.
    for (let i = 0; i < 7; i++) await page.getByTestId('crucible-state-next').click();

    const summary = page.getByTestId('crucible-summary');
    await expect(summary).toBeVisible();
    // Pacing, stated against the budget — no score, no grade, no speed verdict.
    await expect(page.getByTestId('crucible-summary-verdict')).toContainText(
      'All 8 states held their budget'
    );
    // And recovery is measured separately from pacing.
    await expect(page.getByTestId('crucible-stress')).toContainText('Nothing overran its budget');
    await expect(summary).toContainText('0.0m / 1.3m');

    // The gate's report, which the route returned and no surface read: how much
    // of the sprint's arithmetic a machine closed, what the check removed before
    // the sprint was paced, and the escalation the problems were written for.
    await expect(page.getByTestId('crucible-receipt')).toBeVisible();
    await expect(page.getByTestId('crucible-receipt-ledger')).toContainText(
      'numbers machine-checked: 2 of 3'
    );
    // 2 of 3 closed: the third arrived with no declared arithmetic, which is a
    // different finding from a problem that failed the check, and the receipt
    // says which one it is.
    await expect(page.getByTestId('crucible-receipt-ledger')).toContainText('served unchecked');
    await expect(page.getByTestId('crucible-receipt-dropped')).toContainText('Unequal titration');
    await expect(page.getByTestId('crucible-receipt-escalation')).toContainText('escalation: depth');
  });

  test('the boss banner promises only the collision the material can carry', async ({ page }) => {
    await mockAiApis(page);
    // Seeded before the app boots: the sheet reads the friction log on open.
    await page.addInitScript((history) => {
      window.localStorage.setItem('deepencode_friction_log_v1', JSON.stringify(history));
    }, SEEDED_CLEAN_WINS);
    await page.goto('/');

    await page.getByTestId('open-crucible').click();
    // Two clean wins in a row, so the sheet opens at boss level.
    await expect(page.getByTestId('crucible-governor')).toBeVisible();

    await page.getByTestId('crucible-topic').fill('Thermochemistry');

    // Thermochemistry belongs to a fusion row, but this material carries one of
    // that row's chapters, so the route re-aims the sprint deeper inside it. The
    // banner used to run the UNGATED row match and promise all three chapters —
    // a cross-chapter collision the paced problems are not built to contain.
    const banner = page.getByTestId('crucible-escalation');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('goes DEEPER');
    await expect(banner).toContainText('instead of colliding it with');
    await expect(page.getByTestId('crucible-governor')).not.toContainText('This sprint collides');
  });

  test('a streak earned on one chapter does not escalate another', async ({ page }) => {
    await mockAiApis(page);
    // Two clean wins, but on a DIFFERENT chapter than the one the sprint is
    // timed against. Before the streak was scoped, the log made the boss banner
    // appear on ANY topic: the read was global, and the `boss: true` that the
    // banner implied was sent to the route with it — so a chapter with nothing
    // logged against it was written harder for a reason that belonged elsewhere.
    await page.addInitScript((history) => {
      window.localStorage.setItem('deepencode_friction_log_v1', JSON.stringify(history));
    }, SEEDED_CLEAN_WINS);

    // The request carries the claim, so the claim is what gets asserted.
    let bossFlag: boolean | null = null;
    await page.route('**/api/crucible', async (route) => {
      bossFlag = Boolean(JSON.parse(route.request().postData() || '{}').boss);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(CRUCIBLE_RESPONSE),
      });
    });
    await page.goto('/');

    await page.getByTestId('open-crucible').click();
    await page.getByTestId('crucible-topic').fill('Electrochemistry');

    // Nothing has been earned on this chapter, so no escalation is claimed.
    await expect(page.getByTestId('crucible-governor')).toHaveCount(0);

    await page.getByTestId('crucible-start').click();
    await expect(page.getByTestId('crucible-clock')).toContainText('problem 1 of');
    expect(bossFlag).toBe(false);
  });

  test('a repeated fracture is warned about before the clock starts, and a slip is not', async ({
    page,
  }) => {
    await mockAiApis(page);
    // Seeded before the app boots: the sheet reads the ledger on open.
    await page.addInitScript((patches) => {
      window.localStorage.setItem('deepencode_mr_m_patches_v1', JSON.stringify(patches));
    }, SEEDED_PATCHES);
    await page.goto('/');

    await page.getByTestId('open-crucible').click();
    // Nothing is typed yet, so nothing is warned about.
    await expect(page.getByTestId('crucible-preflight')).toHaveCount(0);

    await page.getByTestId('crucible-topic').fill('Thermochemistry');

    const preflight = page.getByTestId('crucible-preflight');
    await expect(preflight).toBeVisible();
    await expect(preflight).toContainText('Pre-flight tripwire');
    await expect(preflight).toContainText('SIGN_FLIP has fired 3 times on Thermochemistry');
    await expect(preflight).toContainText('anchor the convection before the arithmetic');
    // One hit is a slip, and a wall of slips is scrolled past: the second patch
    // in the ledger must stay silent in front of a new attempt.
    await expect(preflight).not.toContainText('FACTOR_OF_TWO');
  });

  test('a sprint that is not a state machine is refused, never rendered as a clock', async ({
    page,
  }) => {
    await openCrucible(page);
    // One state per problem is not a state machine: there is nothing to pace,
    // and a HUD built from it would show a target that means nothing.
    await page.route('**/api/crucible', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          minutes: 12,
          problems: [{ title: 'One-step problem', states: [{ label: 'the whole thing' }] }],
        }),
      })
    );

    await page.getByTestId('crucible-topic').fill('Thermochemistry');
    await page.getByTestId('crucible-start').click();

    await expect(page.getByTestId('crucible-error')).toContainText('not started');
    await expect(page.getByTestId('crucible-hud')).toHaveCount(0);
  });

  test('the sheet closes on Escape like every other one', async ({ page }) => {
    await openCrucible(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Timed crucible sprint' })).toBeHidden();
  });

  test('a checkpoint is optional and is reported back against its own state', async ({ page }) => {
    // The exam room is paper and a bubble sheet. Typed equations under a clock
    // measure typing, so the only thing the sheet asks for is the intermediate
    // number — and it must be able to answer "which state was this?" without any
    // of them being required.
    await openCrucible(page);
    await expect(page.getByTestId('crucible-paper-note')).toContainText('paced on the step');

    await page.getByTestId('crucible-topic').fill('Thermochemistry');
    await page.getByTestId('crucible-start').click();
    await expect(page.getByTestId('crucible-checkpoint-note')).toBeVisible();

    // One checkpoint on the first state, one on the first state of the SECOND
    // problem: the summary has to key them by their own position in the sprint,
    // which is the index the flattened state table already uses.
    await page.getByTestId('crucible-checkpoint-0').fill('3.5');
    for (let i = 0; i < 3; i++) await page.getByTestId('crucible-state-next').click();
    await page.getByTestId('crucible-checkpoint-0').fill('7');
    // Nothing was required to get here, and nothing is required to finish.
    for (let i = 0; i < 5; i++) await page.getByTestId('crucible-state-next').click();

    const summary = page.getByTestId('crucible-summary');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('checkpoint 3.5');
    await expect(summary).toContainText('checkpoint 7');
    // Exactly the two that were typed: an untouched state shows no checkpoint
    // line at all, rather than an empty column or a dash.
    await expect(page.getByText(/^checkpoint /)).toHaveCount(2);
  });
});

test.describe('emergency triage buffer', () => {
  async function openTriage(page: Page) {
    await mockAiApis(page);
    await page.goto('/');
    await page.getByTestId('open-triage').click();
    await expect(page.getByRole('dialog', { name: 'Emergency triage' })).toBeVisible();
  }

  test('freezes what can prove it is low-leverage, shows the arithmetic, and runs one 90-minute task', async ({
    page,
  }) => {
    await openTriage(page);

    await page.getByTestId('triage-dump').fill(TRIAGE_DUMP);
    await page.getByTestId('triage-run').click();

    await expect(page.getByTestId('triage-plan')).toBeVisible();

    // One action, named — not a ranked list of everything.
    await expect(page.getByTestId('triage-focus')).toContainText('Care of Athletes quiz');
    await expect(page.getByTestId('triage-focus')).toContainText('everything else hidden');

    // The freeze is stated as a state change with the number behind it.
    await expect(page.getByTestId('triage-frozen')).toContainText('Freezing Practice set 7');
    await expect(page.getByTestId('triage-frozen')).toContainText('0.0%');

    // The panic is dismantled with the weighting, not with reassurance.
    await expect(page.getByTestId('triage-panic')).toContainText('4/5');
    await expect(page.getByTestId('triage-panic')).toContainText('5 × 80 ÷ 100 = 4.0 points');

    // An item with no stated weight is listed as withheld, never frozen: the
    // claim "low-leverage" would have no number behind it.
    await expect(page.getByTestId('triage-withheld')).toContainText('Care of Athletes quiz');
    await expect(page.getByTestId('triage-withheld')).toContainText('no weight was stated');

    // The runway: one task on screen, and the rest of it hidden.
    await page.getByTestId('triage-runway-start').click();
    const runway = page.getByTestId('triage-runway');
    await expect(runway).toBeVisible();
    await expect(runway).toContainText('Care of Athletes quiz');
    await expect(page.getByTestId('triage-runway-clock')).toContainText(/\d{2}:\d{2}/);
    await expect(runway).toContainText('1 item frozen · not rendered here on purpose');

    // Done closes the sheet, which is the whole point of a runway.
    await page.getByTestId('triage-runway-done').click();
    await expect(page.getByRole('dialog', { name: 'Emergency triage' })).toBeHidden();
  });

  test('reopening the sheet resumes the plan and the runway instead of re-triaging', async ({
    page,
  }) => {
    // The regression this pins: the plan and the ninety-minute runway used to
    // live only in React state, so closing the sheet — or a reload forty-five
    // minutes in — destroyed both and the learner re-pasted the whole backlog.
    // A mocked route counts how many times the model is actually asked.
    let triageCalls = 0;
    await mockAiApis(page);
    // Replace the shared mock with the same payload plus a counter: `continue()`
    // would go to the network rather than falling through to the mock, so the
    // mock's own route is removed first and this is then the only handler.
    await page.unroute('**/api/crisis');
    await page.route('**/api/crisis', (route) => {
      triageCalls += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(CRISIS_RESPONSE),
      });
    });
    await page.goto('/');
    await page.getByTestId('open-triage').click();
    await expect(page.getByRole('dialog', { name: 'Emergency triage' })).toBeVisible();

    await page.getByTestId('triage-dump').fill(TRIAGE_DUMP);
    await page.getByTestId('triage-run').click();
    await expect(page.getByTestId('triage-plan')).toBeVisible();
    await page.getByTestId('triage-runway-start').click();
    await expect(page.getByTestId('triage-runway')).toBeVisible();
    expect(triageCalls).toBe(1);

    // Out of the sheet without finishing it: the night is still owed.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Emergency triage' })).toBeHidden();

    await page.getByTestId('open-triage').click();

    // Straight back onto the running runway: the plan came back and the clock
    // is the one that was started, not a fresh ninety minutes.
    await expect(page.getByTestId('triage-runway')).toBeVisible();
    await expect(page.getByTestId('triage-runway')).toContainText('Care of Athletes quiz');
    await expect(page.getByTestId('triage-runway-clock')).toContainText(/\d{2}:\d{2}/);
    // Not the raw dump: a resumed night is not a re-paste.
    await expect(page.getByTestId('triage-dump')).toHaveCount(0);
    // And the model was never asked a second time.
    expect(triageCalls).toBe(1);
  });

  test('the sheet closes on Escape like every other one', async ({ page }) => {
    await openTriage(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Emergency triage' })).toBeHidden();
  });
});
