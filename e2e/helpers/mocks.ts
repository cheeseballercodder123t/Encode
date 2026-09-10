import { expect, type Page } from '@playwright/test';
import {
  P1_FIELD1,
  P1_FIELD2,
  P2_FIELD1,
  P2_FIELD2,
  ENCODE_RESPONSE,
  YOUTUBE_RESPONSE,
  EVAL_SINGLE,
  EVAL_BATCH,
  AUDIT_SEGREGATE_RESPONSE,
  ARCHETYPE_ROUND1,
  ARCHETYPE_ROUND2,
  TEACH_RESPONSE,
} from './fixtures';

// ─── Route mocks ─────────────────────────────────────────────────────────────

/** Mocks every AI-backed API route the UI can hit. No network, no API keys. */
export async function mockAiApis(page: Page) {
  await page.route('**/api/encode', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ENCODE_RESPONSE) })
  );

  await page.route('**/api/youtube', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(YOUTUBE_RESPONSE) })
  );

  await page.route('**/api/evaluate', async (route) => {
    const body = route.request().postDataJSON() as { batchMode?: boolean } | null;
    const payload = body?.batchMode ? EVAL_BATCH : EVAL_SINGLE;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });

  await page.route('**/api/prerequisites', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ isReadyToEncode: true, topicTitle: 'Action Potentials', prerequisites: [] }),
    })
  );

  // Teach Me interactive lesson author — every entry point (launchpad,
  // per-stage workbench, completed view) hits this one route.
  await page.route('**/api/teach', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEACH_RESPONSE) })
  );

  await page.route('**/api/pretest', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        topic: 'Action Potentials',
        scientificRationale: 'Pretesting primes schema building.',
        questions: [],
      }),
    })
  );

  await page.route('**/api/segregate', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ topic: 'Action Potentials', declarativeFacts: [], conceptualMechanisms: [] }),
    })
  );

  await page.route('**/api/roast', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        overallVerdict: 'Decent notes with gaps.',
        preparednessScore: 62,
        professorTitle: 'Prof. Sterling',
        lethalQuote: 'You hand-waved the threshold.',
        criticisms: [],
        begrudgingCompliment: 'The structure is fine.',
        actionableRecommendations: ['Explain the pump.'],
      }),
    })
  );

  await page.route('**/api/blurt', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        retrievalScore: 70, recalledCount: 2, missedCount: 1, feedback: 'ok',
        recalledPrinciples: [], missedPrinciples: [],
      }),
    })
  );

  await page.route('**/api/checkpoint', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ passed: true, score: 88, feedback: 'Checkpoint passed.' }),
    })
  );

  // Procedural MCQ AI author: round 1 returns one valid + one broken archetype
  // (repair flow); every later round returns the repaired archetype.
  let archetypeCall = 0;
  await page.route('**/api/archetype', (route) => {
    archetypeCall += 1;
    const payload = archetypeCall === 1 ? ARCHETYPE_ROUND1 : ARCHETYPE_ROUND2;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });

  // Teach Me interactive lesson: the player renders TEACH_RESPONSE
  // deterministically, no API key or network needed in tests.
  await page.route('**/api/teach', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEACH_RESPONSE) })
  );

  // Regenerate-stage (friction-cut): returns a fresh stage when the learner
  // rejects a stage. Must satisfy the new boundaryContrast requirement.
  await page.route('**/api/regenerate-stage', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        activity: {
          id: 'stage_regenerated',
          title: 'Regenerated Mechanism',
          framework: 'First Principles',
          cognitiveGoal: 'Rebuild the causal core',
          contextSnippet: 'Threshold crossing flips the gates.',
          keywords: ['threshold', 'depolarization'],
          templateType: 'first_principles',
          prompt: 'Rebuild the mechanism from the ground up.',
          boundaryContrast: {
            confusableLookalike: 'Refractory period',
            distinguishingRule: 'Depolarization opens channels; refractory inactivates them.',
          },
          scaffold: {
            field1Label: 'Trigger',
            field1Placeholder: 'REGEN_FIELD1',
            field2Label: 'Mechanism',
            field2Placeholder: 'REGEN_FIELD2',
            exampleAnswer: 'Threshold opens sodium channels.',
          },
          stageNumber: 1,
        },
      }),
    })
  );
}

/**
 * Overrides the /api/segregate mock (call AFTER mockAiApis) so the
 * segregation report contains one clean, one ambiguous, and one too-long
 * cloze fact : exactly the cards the FSRS Card Audit tab is built to flag.
 */
export async function mockAuditFlow(page: Page) {
  await page.route('**/api/segregate', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(AUDIT_SEGREGATE_RESPONSE),
    })
  );
}

// ─── Flow helpers ────────────────────────────────────────────────────────────

export async function confirmReadiness(page: Page) {
  const summaryBox = page.getByPlaceholder(/How action potentials|Mitochondria act/);
  await summaryBox.fill('Potassium resets the membrane potential.');
  await page.getByRole('button', { name: /actively focused/i }).click();
  await page.getByRole('button', { name: /I'm Ready/i }).click();
}

/** Fill notes on the launchpad and start generation (no pre-session gate). */
export async function startEncodeFromNotes(page: Page, notes: string) {
  await page.goto('/');
  await page.getByPlaceholder(/Paste study material/).fill(notes);
  await page.getByRole('button', { name: 'Build Cognitive Schema' }).click();
}

export async function expectStage(page: Page, stage: number) {
  await expect(page.getByText(new RegExp(`STAGE: ${String(stage).padStart(2, '0')}/`, 'i'))).toBeVisible();
}

/** Walk both stages of the mocked workout to the completed view. */
export async function completeWorkout(page: Page) {
  await confirmReadiness(page);
  await expectStage(page, 1);
  await page.getByPlaceholder(P1_FIELD1).fill('Sodium rushes in through voltage-gated channels.');
  await page.getByPlaceholder(P1_FIELD2).fill('The membrane crossed threshold, so gates open.');

  // Ask Examiner (mocked /api/evaluate, single-stage mode)
  await page.getByRole('button', { name: 'Check' }).click();
  await page.getByText('Good mechanism : tighten the threshold detail.').waitFor();

  await page.getByRole('button', { name: /NEXT/ }).click();

  await confirmReadiness(page);
  await expectStage(page, 2);
  await page.getByPlaceholder(P2_FIELD1).fill('Channels inactivate and potassium leaves.');
  await page.getByPlaceholder(P2_FIELD2).fill('To restore the resting charge for the next spike.');
  await page.getByRole('button', { name: /FINISH/ }).click();

  await expect(page.getByText('Clean cards, ready for Anki.')).toBeVisible();
  await expect(page.getByText('Batch analysis complete: strong first-principles encoding.')).toBeVisible();

  // Close the auto-opened Session Performance Review so the page is interactive again
  await expect(page.getByText('Session Performance Review')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('Session Performance Review')).not.toBeVisible();
}
