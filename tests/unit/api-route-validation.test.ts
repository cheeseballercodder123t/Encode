import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The request-body boundary of every `/api` route that reads a body.
 *
 * These routes used to parse their bodies by hand (`const { x } = await
 * req.json()`), which meant two failures no unit test could see:
 *
 *   - malformed JSON threw inside the handler and came back as a 500 "Failed to
 *     …" — a server error for what is a client mistake; and
 *   - free text (`notes`, `dump`, `claim`, …) reached a paid provider with no
 *     ceiling at all.
 *
 * The table below is the whole surface: one wrong-typed field per route, plus
 * malformed JSON for every route. Each case must answer 400 with a message that
 * names the offending field, and must not reach the model. The routes' own
 * "you forgot to fill this in" 400s are pinned separately, because those are the
 * sentences a learner reads and the schema deliberately leaves them in place.
 */

const generateJSON = vi.hoisted(() => vi.fn());
const streamText = vi.hoisted(() => vi.fn());

vi.mock('@/lib/ai-client', () => ({
  generateJSONWithProvider: generateJSON,
  streamTextWithProvider: streamText,
}));

import { POST as archetype } from '@/app/api/archetype/route';
import { POST as autopsy } from '@/app/api/autopsy/route';
import { POST as blurt } from '@/app/api/blurt/route';
import { POST as checkpoint } from '@/app/api/checkpoint/route';
import { POST as crisis } from '@/app/api/crisis/route';
import { POST as crucible } from '@/app/api/crucible/route';
import { POST as discrimination } from '@/app/api/discrimination/route';
import { POST as encodeStream } from '@/app/api/encode/stream/route';
import { POST as inquisitor } from '@/app/api/inquisitor/route';
import { POST as invertStep } from '@/app/api/invert-step/route';
import { POST as mutation } from '@/app/api/mutation/route';
import { POST as prerequisites } from '@/app/api/prerequisites/route';
import { POST as pretest } from '@/app/api/pretest/route';
import { POST as priming } from '@/app/api/priming/route';
import { POST as probe } from '@/app/api/probe/route';
import { POST as regenerateStage } from '@/app/api/regenerate-stage/route';
import { POST as remnote } from '@/app/api/remnote/route';
import { POST as roast } from '@/app/api/roast/route';
import { POST as segregate } from '@/app/api/segregate/route';
import { POST as sequence } from '@/app/api/sequence/route';
import { POST as synthesis } from '@/app/api/synthesis/route';
import { POST as triage } from '@/app/api/triage/route';

type Handler = (req: NextRequest) => Promise<Response>;

interface Case {
  route: string;
  handler: Handler;
  /** A body that is the right shape but has one wrong-typed or oversized field. */
  invalid: unknown;
  /** The field path the 400 must name (the schema reports `field: reason`). */
  namesField: RegExp;
}

const CASES: Case[] = [
  { route: '/api/archetype', handler: archetype, invalid: { topic: 123 }, namesField: /topic/ },
  { route: '/api/autopsy', handler: autopsy, invalid: { learnerText: { text: 'no' } }, namesField: /learnerText/ },
  { route: '/api/blurt', handler: blurt, invalid: { blurtText: 123 }, namesField: /blurtText/ },
  { route: '/api/crisis', handler: crisis, invalid: { dump: 123 }, namesField: /dump/ },
  { route: '/api/crucible', handler: crucible, invalid: { minutes: 'twenty' }, namesField: /minutes/ },
  { route: '/api/discrimination', handler: discrimination, invalid: { concept: 123 }, namesField: /concept/ },
  { route: '/api/encode/stream', handler: encodeStream, invalid: { gear: 9 }, namesField: /gear/ },
  { route: '/api/inquisitor', handler: inquisitor, invalid: { claim: 123 }, namesField: /claim/ },
  { route: '/api/invert-step', handler: invertStep, invalid: { prompt: 123 }, namesField: /prompt/ },
  { route: '/api/mutation', handler: mutation, invalid: { tier: 4 }, namesField: /tier/ },
  { route: '/api/prerequisites', handler: prerequisites, invalid: { file: { name: 'handout.pdf' } }, namesField: /file/ },
  { route: '/api/pretest', handler: pretest, invalid: { notes: 123 }, namesField: /notes/ },
  { route: '/api/priming', handler: priming, invalid: { kind: 123 }, namesField: /kind/ },
  { route: '/api/probe', handler: probe, invalid: { layers: 'a, b, c' }, namesField: /layers/ },
  { route: '/api/regenerate-stage', handler: regenerateStage, invalid: { activity: 'stage one' }, namesField: /activity/ },
  { route: '/api/roast', handler: roast, invalid: { notes: 123 }, namesField: /notes/ },
  { route: '/api/segregate', handler: segregate, invalid: { include: 42 }, namesField: /include/ },
  { route: '/api/sequence', handler: sequence, invalid: { settings: { provider: 42 } }, namesField: /settings\.provider/ },
  { route: '/api/synthesis', handler: synthesis, invalid: { docA: 42 }, namesField: /docA/ },
  // The ceiling, not the type: `/api/triage` already answered 400 for a
  // wrong-typed `text`, but it shipped a 200k paste straight to the provider.
  { route: '/api/triage', handler: triage, invalid: { text: 'x'.repeat(200_001) }, namesField: /text/ },
  // The ceiling, not just the type: an unbounded `notes` used to be shipped to
  // the provider as-is.
  { route: '/api/roast', handler: roast, invalid: { notes: 'x'.repeat(200_001) }, namesField: /notes/ },
];

/** The two routes that answer in their own envelope rather than `{ error }`. */
const CUSTOM_ENVELOPES: Record<string, (payload: any) => void> = {
  '/api/checkpoint': (payload) => {
    expect(payload.passed).toBe(false);
    expect(payload.feedback).toMatch(/userAnswer/);
  },
  '/api/remnote': (payload) => {
    expect(payload.success).toBe(false);
    expect(payload.message).toMatch(/markdown/);
  },
};

const post = (route: string, body: string, contentType = 'application/json') =>
  new NextRequest(`http://localhost:3000${route}`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body,
  });

beforeEach(() => {
  generateJSON.mockReset();
  streamText.mockReset();
  generateJSON.mockResolvedValue({});
});

describe('every body-reading /api route validates its body', () => {
  for (const testCase of CASES) {
    it(`${testCase.route} answers 400 naming the field for a wrong-typed body`, async () => {
      const res = await testCase.handler(post(testCase.route, JSON.stringify(testCase.invalid)));
      expect(res.status).toBe(400);
      const payload = await res.json();
      const message = payload.error || payload.message || payload.feedback;
      // The schema message must name the field, not just say "invalid input".
      expect(message).toMatch(testCase.namesField);
    });

    it(`${testCase.route} answers 400 instead of 500 for malformed JSON`, async () => {
      const res = await testCase.handler(post(testCase.route, '{"notes": '));
      expect(res.status).toBe(400);
      const payload = await res.json();
      const message = payload.error || payload.message || payload.feedback;
      expect(message).toMatch(/JSON/i);
    });
  }

  it('never spends a model call on a body it rejected', async () => {
    for (const testCase of CASES) {
      await testCase.handler(post(testCase.route, JSON.stringify(testCase.invalid)));
      await testCase.handler(post(testCase.route, 'not json at all'));
    }
    expect(generateJSON).not.toHaveBeenCalled();
    expect(streamText).not.toHaveBeenCalled();
  });

  it('/api/checkpoint keeps its own envelope on a schema failure', async () => {
    const res = await checkpoint(post('/api/checkpoint', JSON.stringify({ userAnswer: 42 })));
    expect(res.status).toBe(400);
    CUSTOM_ENVELOPES['/api/checkpoint'](await res.json());
  });

  it('/api/remnote keeps its own envelope on a schema failure', async () => {
    const res = await remnote(post('/api/remnote', JSON.stringify({ markdown: 42 })));
    expect(res.status).toBe(400);
    CUSTOM_ENVELOPES['/api/remnote'](await res.json());
  });

  // The routes' own empty-input sentences are the ones a learner reads: the
  // schema bounds the shape but never pre-empts "paste the source text first".
  it('/api/triage still says what to paste', async () => {
    const res = await triage(post('/api/triage', '{}'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Paste the source text first/);
  });

  it('/api/roast still asks for material', async () => {
    const res = await roast(post('/api/roast', '{}'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/enter some notes or upload a document/);
  });

  it('/api/crucible still asks for a topic', async () => {
    const res = await crucible(post('/api/crucible', JSON.stringify({ topic: '   ' })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Name the topic first/);
  });

  it('/api/sequence still asks for a stage', async () => {
    const res = await sequence(post('/api/sequence', '{}'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/No stage to build an ordering drill from/);
  });

  it('/api/synthesis still asks for both documents', async () => {
    const res = await synthesis(post('/api/synthesis', JSON.stringify({ docA: null, docB: { id: 'b', name: 'B' } })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Both Document A and Document B/);
  });

  it('/api/remnote still asks for a key and content', async () => {
    const res = await remnote(post('/api/remnote', '{}'));
    expect(res.status).toBe(400);
    const payload = await res.json();
    expect(payload.success).toBe(false);
    expect(payload.message).toMatch(/API key and some content/);
  });
});

describe('the file fragment accepts the client\u2019s "no upload" value', () => {
  // `UploadedFileAsset | null` is React state: pasting notes and uploading
  // nothing posts `file: null`, which the first cut of the schema rejected —
  // the most ordinary request in the app answered 400.
  const encode = [
    { route: '/api/roast', handler: roast },
    { route: '/api/pretest', handler: pretest },
    { route: '/api/prerequisites', handler: prerequisites },
    { route: '/api/segregate', handler: segregate },
  ];

  for (const { route, handler } of encode) {
    it(`${route} accepts file: null (guard passes, body reaches the route's own checks)`, async () => {
      generateJSON.mockResolvedValue({});
      const res = await handler(post(route, JSON.stringify({ notes: 'Notes about ion channels.', file: null })));
      // Nothing here asserts the model call: this proves the body cleared the
      // schema boundary, so the request is the route's, not a 400 about `file`.
      expect(res.status).not.toBe(400);
    });
  }
});

/**
 * `/api/archetype` exists to VALIDATE model-authored archetypes and hand the
 * errors to a repair model. The provider response is untrusted — OpenRouter's
 * `json_object` mode does not enforce the declared response schema — so a
 * wrong-typed field or a null element is exactly the input the route must
 * survive. It used to throw out of the validator (`.trim()` on a number) and
 * out of the id normalizer (`a.id` on null), answering 500 and skipping the
 * repair pass entirely.
 */
describe('/api/archetype survives a malformed model response', () => {
  const validBody = JSON.stringify({ topic: 'AP Chemistry: Buffer pH', count: 1, settings: { provider: 'gemini' } });

  it('reports wrong-typed fields instead of answering 500', async () => {
    generateJSON.mockResolvedValue({
      archetypes: [
        {
          id: 'ai-x',
          topic: 123,
          questionTemplate: null,
          variables: { m: null },
          unit: null,
          correctFormulaJs: 5,
          traps: [null, null, null],
          stepByStepSolutionTemplate: {},
        },
      ],
    });
    const res = await archetype(post('/api/archetype', validBody));
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.validationReport.ok).toBe(false);
  });

  it('does not crash on a null archetype entry', async () => {
    generateJSON.mockResolvedValue({ archetypes: [null] });
    const res = await archetype(post('/api/archetype', validBody));
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.validationReport.ok).toBe(false);
  });
});
