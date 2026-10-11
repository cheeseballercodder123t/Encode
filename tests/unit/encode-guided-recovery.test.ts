import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The guided path's root recovery.
 *
 * A request with a massive source (900+ words, or the Guided Path toggle) asks
 * the model for `{ topicSummary, guidedModules: [...] }`. The route reads only
 * `guidedModules`: any other root - the standard `{ activities: [...] }` the
 * model falls back to when it treats the chapter as one workout, `modules`, or
 * a bare array - misses that branch and drops into the standard validator, whose
 * subject is a stage payload. A bare array of MODULE objects then validates as
 * stages (module titles kept, every stage field defaulted), and a payload with
 * no stage key at all collapses to the single generic fallback stage - while the
 * request answers 200. This is the round-39 defect (a bare-array standard root
 * deleted every stage) on the guided root, which was never given the recovery.
 *
 * The three payloads below are the shapes the live probe produced for one
 * 8,000-word source: the model's stages arrived and none of them shipped.
 */

const generateJSON = vi.hoisted(() => vi.fn());

vi.mock('@/lib/ai-client', () => ({
  generateJSONWithProvider: generateJSON,
}));

import { POST as encode } from '@/app/api/encode/route';

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

const moduleBody = (n: number) => ({
  id: `module-${n}`,
  moduleNumber: n,
  title: `Module ${n}`,
  summary: `Milestone ${n}`,
  targetFocus: `Chunk ${n}`,
  activities: [stage(1), stage(2)],
});

const NOTES = Array.from({ length: 60 }, (_, i) => `Section ${i + 1}. The pump sets the resting potential near -70 mV and the loop of Henle multiplies the gradient to 1200 mOsm.`).join(' ');

async function call(payload: unknown) {
  generateJSON.mockResolvedValueOnce(payload);
  const req = new NextRequest('http://localhost/api/encode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: NOTES, mode: 'conceptual', enableGuidedPath: true }),
  });
  const res = await encode(req);
  return { status: res.status, data: await res.json() };
}

beforeEach(() => generateJSON.mockReset());

describe('the prompt actually sent', () => {
  it('carries the scaffold contract and the declared root shape to every provider', async () => {
    await call({ activities: [stage(1)] });
    const { systemPrompt } = generateJSON.mock.calls[0][0];
    // The schema descriptions only reach Gemini; OpenRouter and the
    // OpenAI-compatible providers read the prompt or nothing at all.
    expect(systemPrompt).toContain('SCAFFOLD CONTRACT');
    expect(systemPrompt).toMatch(/NEVER the answer/);
    expect(systemPrompt).toMatch(/RETURN SHAPE/);
    expect(systemPrompt).toContain('"activities"');
  });

  it('declares the guided root, not the standard one, for a massive source', async () => {
    await call({ guidedModules: [moduleBody(1)] });
    const { systemPrompt } = generateJSON.mock.calls[0][0];
    expect(systemPrompt).toContain('"guidedModules"');
    expect(systemPrompt).toContain('SCAFFOLD CONTRACT');
  });
});

describe('guided path root recovery', () => {
  it('keeps the model\'s stages when it answers in the standard shape', async () => {
    const { status, data } = await call({
      topicSummary: 'Countercurrent multiplication',
      activities: [stage(1), stage(2), stage(3)],
    });
    expect(status).toBe(200);
    expect(data.activities.length).toBe(3);
    expect(data.activities[0].title).toBe('Mechanism 1');
  });

  it('accepts `modules` as the module array, and titles the chapter from it', async () => {
    // Exactly the live shape: a wrapper named `modules` and no `topicSummary`.
    // Before recovery this returned the single generic fallback stage under the
    // default title 'Active Cognitive Schema'.
    const { status, data } = await call({ modules: [moduleBody(1), moduleBody(2)] });
    expect(status).toBe(200);
    expect(data.isGuidedPath).toBe(true);
    expect(data.guidedModules.length).toBe(2);
    expect(data.guidedModules[0].activities[0].title).toBe('Mechanism 1');
    expect(data.topicSummary).toBe('Module 1');
    expect(data.activities.length).toBe(2);
  });

  it('accepts `stages` as a module\'s stage list', async () => {
    const { status, data } = await call({
      topicSummary: 'Countercurrent multiplication',
      guidedPath: [{ ...moduleBody(1), stages: [stage(1), stage(2)], activities: undefined }],
    });
    expect(status).toBe(200);
    expect(data.isGuidedPath).toBe(true);
    expect(data.guidedModules[0].activities.length).toBe(2);
  });

  it('reads a wrapper whose name was invented, because its items say what they are', async () => {
    const { status, data } = await call({
      topicSummary: 'Countercurrent multiplication',
      chapterModules: [moduleBody(1), moduleBody(2)],
    });
    expect(status).toBe(200);
    expect(data.isGuidedPath).toBe(true);
    expect(data.guidedModules.length).toBe(2);
  });

  it('still degrades to the single fallback stage when nothing usable arrived', async () => {
    const { status, data } = await call({ topicSummary: 'A chapter', notes: 'nothing structured' });
    expect(status).toBe(200);
    expect(data.isGuidedPath).toBeUndefined();
    expect(data.activities.length).toBe(1);
    expect(data.activities[0].id).toBe('fallback-stage-1');
  });

  it('accepts a bare array of module objects', async () => {
    const { status, data } = await call([moduleBody(1), moduleBody(2)]);
    expect(status).toBe(200);
    expect(data.isGuidedPath).toBe(true);
    expect(data.guidedModules.length).toBe(2);
  });
});
