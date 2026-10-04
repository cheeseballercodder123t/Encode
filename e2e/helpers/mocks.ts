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
  PROBE_RESPONSE,
  PROBE_AXIOM_RESPONSE,
  INVERT_RESPONSE,
  PRETEST_RESPONSE,
  TRIAGE_RESPONSE,
  PRIMING_RESPONSE,
  PRIMING_RESPONSES,
  SEQUENCE_RESPONSE,
  DISCRIMINATION_RESPONSE,
} from './fixtures';

// ─── Route mocks ─────────────────────────────────────────────────────────────

// Both encode entry points.
//
// The app streams (`/api/encode/stream`, newline-delimited JSON with the stage
// outlines as they land) and falls back to plain JSON, so a spec that wants to
// control the generation payload has to intercept BOTH paths — a URL glob for
// the plain route alone would silently stop matching the request the UI now
// makes, and the spec would be testing the real route's offline fallback.
/**
 * Rewrites a mocked forge payload so its source rows carry the ids the client
 * actually sent.
 *
 * The real route echoes `{...source}` straight back, and the client keys the
 * forge log, the retry buttons and the deck-memory source ledger off those ids.
 * A fixture with invented ids (`src_4`) therefore drifts from the app: the
 * ledger can no longer match a source it just cut, and a retry addresses a
 * source the request never contained.
 */
export function forgePayloadForRequest(payload: any, request: { postDataJSON: () => any }) {
  const sent = (request.postDataJSON() as { sources?: { id?: string; label?: string }[] } | null)?.sources || [];
  if (!payload || !Array.isArray(payload.sources) || sent.length === 0) return payload;
  return {
    ...payload,
    sources: payload.sources.map((source: any, index: number) =>
      sent[index]?.id ? { ...source, id: sent[index].id } : source
    ),
  };
}

export const ENCODE_ROUTE = (url: URL) =>
  url.pathname === '/api/encode' || url.pathname === '/api/encode/stream';

/** Mocks every AI-backed API route the UI can hit. No network, no API keys. */
export async function mockAiApis(page: Page) {
  await page.route(ENCODE_ROUTE, (route) =>
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

  // Recursive why-ladder: first probe interrogates the wording, the next
  // reports bedrock so the ladder can be walked to its axiom in one test.
  let probeCall = 0;
  await page.route('**/api/probe', (route) => {
    probeCall += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(probeCall === 1 ? PROBE_RESPONSE : PROBE_AXIOM_RESPONSE),
    });
  });  await page.route('**/api/invert-step', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(INVERT_RESPONSE),
    })
  );

  // Parsons ordering drill: the canonical chain the learner must reconstruct.
  await page.route('**/api/sequence', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SEQUENCE_RESPONSE),
    })
  );

  // Pre-export discrimination gate: one vignette per side of the pair.
  await page.route('**/api/discrimination', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(DISCRIMINATION_RESPONSE),
    })
  );

  // Fluff Guillotine: the pre-encoding semantic heatmap pass.
  await page.route('**/api/triage', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TRIAGE_RESPONSE),
    })
  );

  // Priming warm-ups: the learner picks the archetype, so the mock serves the
  // payload for the requested kind (auto falls back to the extremum sweep).
  await page.route('**/api/priming', (route) => {
    const body = route.request().postDataJSON() as { kind?: string } | null;
    const payload = (body?.kind && PRIMING_RESPONSES[body.kind]) || PRIMING_RESPONSE;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
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

  // Predict–Observe–Explain gate: one commitment with a concrete trap option.
  await page.route('**/api/pretest', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(PRETEST_RESPONSE),
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

/**
 * Retired readiness gate.
 *
 * The workout used to open behind a modal that asked you to summarise the
 * previous stage in <=15 words and tick an "I am actively focused" box before
 * the screen would load. That was homework, not encoding, and it is gone: the
 * workbench paints immediately. The helper stays so every spec keeps reading
 * as a plain linear flow (notes -> stages -> examiner -> completion), it just
 * no longer has to clear anything.
 */
export async function confirmReadiness(_page: Page) {
  return;
}

/** Fill notes on the launchpad and start generation (no pre-session gate). */
export async function startEncodeFromNotes(page: Page, notes: string) {
  await page.goto('/');
  const notesBox = page.getByPlaceholder(/Paste study material/);
  const build = page.getByRole('button', { name: 'Build Cognitive Schema' });
  await notesBox.fill(notes);
  // On a cold dev server the input event can land before React has hydrated,
  // so onChange never sees it and the button stays disabled forever. The
  // status line mirrors React state, so give it a moment to reflect the fill,
  // and re-fill once if the event was lost to that race.
  const ready = page.getByText(/words · ready to encode/);
  try {
    await expect(ready).toBeVisible({ timeout: 3000 });
  } catch {
    await notesBox.fill(notes);
    await expect(ready).toBeVisible({ timeout: 5000 });
  }
  await build.click();
}

export async function expectStage(page: Page, stage: number) {
  // The workbench header renders a zero-padded stage chip (e.g. "01/02").
  await expect(page.getByText(new RegExp(`${String(stage).padStart(2, '0')}/[0-9]+`))).toBeVisible();
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

  // Exact name : /NEXT/ also matches the check button's "... TRY AGAIN OR NEXT" label.
  await page.getByRole('button', { name: 'NEXT →' }).click();

  await confirmReadiness(page);
  await expectStage(page, 2);
  await page.getByPlaceholder(P2_FIELD1).fill('Channels inactivate and potassium leaves.');
  await page.getByPlaceholder(P2_FIELD2).fill('To restore the resting charge for the next spike.');
  await page.getByRole('button', { name: /FINISH/ }).click();

  await expect(page.getByText('Clean cards, ready for Anki.')).toBeVisible();
  await expect(page.getByText('Batch analysis complete: strong first-principles encoding.')).toBeVisible();

  // Close the auto-opened session readout so the page is interactive again.
  // It is a readout now, not a performance review: mechanisms secured + open.
  await expect(page.getByText('SESSION READOUT')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('SESSION READOUT')).not.toBeVisible();
}
