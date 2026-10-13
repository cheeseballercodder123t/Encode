import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The declared function budget has to be bigger than the deadlines the routes
 * spend.
 *
 * On Vercel the platform kills a function at its `maxDuration` and the client
 * simply sees the stream end — no `result`, no `error`, nothing. While the
 * route's own deadlines were larger than its budget, the platform ALWAYS won
 * that race: the app's timeout could never fire, so a slow generation reported
 * the opaque 'Failed to generate schema' instead of whatever had actually
 * happened. The observed instance: a deployed page whose stream ended with no
 * result event and no error event at all.
 *
 * The first block pins the nesting as arithmetic, so it cannot regress without
 * a budget or deadline change failing a test. The second block pins the one
 * deadline that was declared (AI_TIMEOUT_MS.stream) but never applied: the
 * advisory outline pass ran unbounded, free to consume the whole function
 * budget before the pass that actually matters had run a single token — when
 * the platform then killed the function, a 200 that had promised "the full
 * schema still arrives" delivered nothing.
 */

const generateJSON = vi.hoisted(() => vi.fn());
const streamText = vi.hoisted(() => vi.fn());

vi.mock('@/lib/ai-client', () => ({
  generateJSONWithProvider: generateJSON,
  streamTextWithProvider: streamText,
}));

import { POST as streamEncode } from '@/app/api/encode/stream/route';
import { maxDuration as encodeBudget } from '@/app/api/encode/route';
import { maxDuration as streamBudget } from '@/app/api/encode/stream/route';
import { maxDuration as regenerateBudget } from '@/app/api/regenerate-stage/route';
import { AI_TIMEOUT_MS } from '@/lib/ai-hardening';

const stage = (n: number) => ({
  id: `stage-${n}`,
  stageNumber: n,
  title: `Mechanism ${n}`,
  framework: 'Bloom Taxonomy - Analysis',
  cognitiveGoal: `Resolve mechanism ${n}`,
  contextSnippet: `Raw fact ${n} from the chapter.`,
  keywords: ['pump', 'gradient', 'permeability'],
  templateType: 'first_principles',
  prompt: `Why does mechanism ${n} hold?`,
  paradox: `How is mechanism ${n} possible at all?`,
  scaffold: {
    field1Label: 'Trigger',
    field1Placeholder: 'What sets it off?',
    field2Label: 'Mechanism',
    field2Placeholder: 'What physically moves?',
    exampleAnswer: 'The pump builds the gradient.',
  },
});

function encodeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/encode/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      notes: 'The loop of Henle multiplies the medullary gradient to 1,200 mOsm without breaking thermodynamics.',
      mode: 'conceptual',
    }),
  });
}

function eventsOf(text: string): any[] {
  return text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe('declared function budgets nest the deadlines the routes spend', () => {
  it('/api/encode outlives its own generation deadline', () => {
    expect(encodeBudget * 1000).toBeGreaterThan(AI_TIMEOUT_MS.generate);
  });

  it('/api/encode/stream outlives the outline pass plus the schema pass', () => {
    expect(streamBudget * 1000).toBeGreaterThanOrEqual(AI_TIMEOUT_MS.stream + AI_TIMEOUT_MS.generate);
  });

  it('/api/regenerate-stage outlives the checker deadline', () => {
    expect(regenerateBudget * 1000).toBeGreaterThan(AI_TIMEOUT_MS.checker);
  });
});

describe('the advisory outline pass is bounded', () => {
  beforeEach(() => {
    generateJSON.mockReset();
    streamText.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cuts a stalled outline pass at its deadline and still delivers the schema', async () => {
    vi.useFakeTimers();
    let seenSignal: AbortSignal | undefined;
    // A provider that streams nothing and never ends — what a stalled upstream
    // connection looks like. It only stops when its signal is aborted.
    streamText.mockImplementation((opts: { signal?: AbortSignal }) => {
      seenSignal = opts.signal;
      return (async function* () {
        await new Promise((_, reject) => {
          opts.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
      })();
    });
    generateJSON.mockResolvedValue({ topicSummary: 'Loop of Henle', activities: [stage(1)] });

    const res = await streamEncode(encodeRequest());
    expect(res.status).toBe(200);
    const textPromise = res.text();
    await vi.advanceTimersByTimeAsync(AI_TIMEOUT_MS.stream + 1);
    const events = eventsOf(await textPromise);

    // The deadline reached the transport, so the abandoned pass was cancelled
    // rather than left running beside the one that replaced it.
    expect(seenSignal?.aborted).toBe(true);
    // And the pass that actually matters still ran and shipped.
    expect(generateJSON).toHaveBeenCalledTimes(1);
    expect(events.some((event) => event.type === 'result')).toBe(true);
  });

  it('leaves a healthy outline pass alone and streams its outlines', async () => {
    streamText.mockImplementation(() =>
      (async function* () {
        yield '{"topicSummary":"Loop of Henle","activities":[{"stageNumber":1,"title":"Multiply the gradient"}]}';
      })()
    );
    generateJSON.mockResolvedValue({ topicSummary: 'Loop of Henle', activities: [stage(1)] });

    const res = await streamEncode(encodeRequest());
    const events = eventsOf(await res.text());

    expect(events.some((event) => event.type === 'outline')).toBe(true);
    expect(events.some((event) => event.type === 'result')).toBe(true);
  });
});
