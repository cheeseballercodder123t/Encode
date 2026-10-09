import { describe, it, expect } from 'vitest';
import {
  archetypeSchema,
  autopsySchema,
  blurtSchema,
  checkpointSchema,
  crisisSchema,
  crucibleSchema,
  discriminationSchema,
  encodeSchema,
  evaluateSchema,
  fileAssetSchema,
  inquisitorSchema,
  invertStepSchema,
  mutationSchema,
  prerequisitesSchema,
  pretestSchema,
  primingSchema,
  probeSchema,
  regenerateStageSchema,
  remnoteSchema,
  roastSchema,
  segregateSchema,
  sequenceSchema,
  settingsSchema,
  synthesisSchema,
  teachSchema,
  triageSchema,
  youtubeSchema,
} from '../../lib/api-validation';

// The route schemas are the security boundary for /api/*: they must accept
// every payload the real UI sends (defaults included) and reject wrong-typed,
// oversized or malformed input with a field-naming issue.

const baseSettings = { provider: 'gemini', geminiApiKey: 'k'.repeat(40) };

describe('encodeSchema', () => {
  it('accepts the full UI payload and applies defaults', () => {
    const parsed = encodeSchema.safeParse({
      notes: 'Some notes about ion channels.',
      settings: baseSettings,
      gear: 3,
      hiddenTemplates: ['mnemonic_peg'],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.mode).toBe('conceptual');
      expect(parsed.data.enableDeepResearch).toBe(true);
      expect(parsed.data.gear).toBe(3);
      expect(parsed.data.hiddenTemplates).toEqual(['mnemonic_peg']);
    }
  });

  it('accepts an empty object (every field optional/defaulted)', () => {
    const parsed = encodeSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it('rejects an out-of-range gear', () => {
    expect(encodeSchema.safeParse({ gear: 7 }).success).toBe(false);
  });

  it('rejects a non-enum mode', () => {
    expect(encodeSchema.safeParse({ mode: 'shredder' }).success).toBe(false);
  });

  it('rejects oversized notes', () => {
    expect(encodeSchema.safeParse({ notes: 'x'.repeat(200_001) }).success).toBe(false);
  });

  it('rejects a settings object with a wrong-typed key', () => {
    expect(settingsSchema.safeParse({ provider: 123 }).success).toBe(false);
  });

  it('rejects an oversized file payload', () => {
    const big = { name: 'f.pdf', type: 'application/pdf', size: 31 * 1024 * 1024, base64Data: 'a'.repeat(100) };
    expect(encodeSchema.safeParse({ file: big }).success).toBe(false);
  });
});

describe('evaluateSchema', () => {
  it('accepts both single-stage and batch payloads', () => {
    expect(evaluateSchema.safeParse({ field1Value: 'answer' }).success).toBe(true);
    expect(
      evaluateSchema.safeParse({ batchMode: true, stages: [{ title: 'S1', field1Value: 'a' }] }).success
    ).toBe(true);
  });

  it('rejects a wrong-typed strictness level', () => {
    expect(evaluateSchema.safeParse({ strictnessLevel: 'brutal' }).success).toBe(false);
  });

  it('rejects an oversized stage batch', () => {
    const stages = Array.from({ length: 31 }, (_, i) => ({ title: `s${i}` }));
    expect(evaluateSchema.safeParse({ batchMode: true, stages }).success).toBe(false);
  });
});

describe('youtubeSchema', () => {
  it('accepts a video URL payload', () => {
    const parsed = youtubeSchema.safeParse({ videoUrl: 'https://youtube.com/watch?v=abc' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.mode).toBe('conceptual');
  });

  it('rejects a missing URL', () => {
    expect(youtubeSchema.safeParse({}).success).toBe(false);
  });
});

// ─── The routes guarded for defect 44 ────────────────────────────────────────
//
// Every one of these routes used to read its body with a bare `await req.json()`,
// so a wrong-typed or unbounded field reached prompt assembly (and a paid call)
// and malformed JSON reached the handler's catch as a 500. The schemas are the
// boundary; these tests pin what they accept and what they refuse.

/** Every body-reading route, with a payload the real UI can send. */
const ACCEPTS: [string, { safeParse: (v: unknown) => { success: boolean } }, unknown][] = [
  ['triage', triageSchema, { text: 'Paste of source material.', topicSummary: 'Cells' }],
  ['roast', roastSchema, { notes: 'Notes.', file: null, settings: baseSettings }],
  ['prerequisites', prerequisitesSchema, { notes: 'Notes.', file: null }],
  ['pretest', pretestSchema, { notes: 'Notes.', file: null }],
  ['segregate', segregateSchema, { notes: 'Notes.', file: null, include: ['facts', 'drills'] }],
  ['crisis', crisisSchema, { dump: 'Three chapters, one night.', scorePct: 40 }],
  ['crucible', crucibleSchema, { topic: 'Rotational motion', minutes: 20, boss: true, sourceContext: 'excerpt' }],
  ['inquisitor', inquisitorSchema, { claim: 'Entropy always increases.', topic: 'Thermo', domain: 'Physics', contextSnippet: 'excerpt' }],
  ['autopsy', autopsySchema, { learnerText: 'My answer.', expectedText: 'The answer.', topic: 'Thermo' }],
  ['blurt', blurtSchema, { blurtText: 'Everything I remember.', schemaTitle: 'Cells', activities: [{ title: 'A', cognitiveGoal: 'g' }], researchContexts: [{ conceptAdded: 'c' }] }],
  ['checkpoint', checkpointSchema, { moduleTitle: 'M1', question: 'Why?', corePrerequisite: 'Diffusion', userAnswer: 'Because.' }],
  ['discrimination', discriminationSchema, { concept: 'SN1', lookalike: 'SN2', distinguishingRule: 'Rate law', contextSnippet: 'excerpt', topicSummary: 'Kinetics' }],
  ['archetype', archetypeSchema, { topic: 'AP Physics C', count: 3, notes: 'notes' }],
  ['mutation', mutationSchema, { topic: 'Thermo', tier: 2, boss: false, sourceContext: 'excerpt' }],
  ['regenerate-stage', regenerateStageSchema, { activity: { title: 'T', templateType: 'first_principles', prompt: 'p', contextSnippet: 'c', keywords: ['k'], stageNumber: 2 }, topicSummary: 'x', mode: 'conceptual' }],
  ['remnote', remnoteSchema, { apiKey: 'k'.repeat(40), userId: 'u', markdown: '# Card\nFront :: Back', title: 'Deck' }],
  ['synthesis', synthesisSchema, { docA: { id: 'a', name: 'A', contentSnippet: 'x' }, docB: { id: 'b', name: 'B', fileAsset: { name: 'b.pdf', type: 'application/pdf', size: 10, base64Data: 'YQ==' } } }],
  ['sequence', sequenceSchema, { stageTitle: 'S', framework: 'F', contextSnippet: 'c', prompt: 'p', topicSummary: 't' }],
  ['invert-step', invertStepSchema, { stageTitle: 'S', framework: 'F' }],
  ['priming', primingSchema, { stageTitle: 'S', kind: 'gradient' }],
  ['probe', probeSchema, { stageTitle: 'S', layers: ['first answer', 'second answer'] }],
];

describe('the defect-44 schemas accept what the UI sends', () => {
  it.each(ACCEPTS)('%s accepts its real payload', (_name, schema, payload) => {
    expect(schema.safeParse(payload).success).toBe(true);
  });

  it('every one of them accepts a bare empty body, leaving the route to answer', () => {
    // The routes keep their own "you forgot to fill this in" 400s, and each of
    // them checks emptiness itself — so an empty body must clear the boundary.
    for (const [name, schema] of ACCEPTS) {
      expect(schema.safeParse({}).success, `${name} rejects {}`).toBe(true);
    }
  });
});

describe('the defect-44 schemas refuse the shapes they must', () => {
  const REFUSES: [string, { safeParse: (v: unknown) => { success: boolean } }, unknown][] = [
    ['triage: non-string text', triageSchema, { text: 42 }],
    ['triage: oversized text', triageSchema, { text: 'x'.repeat(200_001) }],
    ['crucible: non-numeric minutes', crucibleSchema, { minutes: 'twenty' }],
    ['crucible: infinite minutes', crucibleSchema, { minutes: Infinity }],
    ['inquisitor: object claim', inquisitorSchema, { claim: { text: 'no' } }],
    ['mutation: unknown tier', mutationSchema, { tier: 4 }],
    ['probe: layers that are not a list', probeSchema, { layers: 'a, b' }],
    ['probe: too many layers', probeSchema, { layers: Array.from({ length: 41 }, (_, i) => `l${i}`) }],
    ['regenerate-stage: activity that is not a stage', regenerateStageSchema, { activity: 'stage one' }],
    ['segregate: non-list include', segregateSchema, { include: 42 }],
    ['settings: wrong-typed provider', sequenceSchema, { settings: { provider: 42 } }],
    ['file: attachment missing its payload', roastSchema, { file: { name: 'a.pdf' } }],
    ['file: oversized attachment', fileAssetSchema, { name: 'a.pdf', type: 'application/pdf', size: 31 * 1024 * 1024, base64Data: 'YQ==' }],
    ['remnote: non-string markdown', remnoteSchema, { markdown: 42 }],
    ['synthesis: docA that is not a document', synthesisSchema, { docA: 42 }],
    ['synthesis: document with an unbounded excerpt', synthesisSchema, { docA: { name: 'A', contentSnippet: 'x'.repeat(200_001) } }],
  ];

  it.each(REFUSES)('%s is refused', (_name, schema, payload) => {
    expect(schema.safeParse(payload).success).toBe(false);
  });

  it('an oversized paste is refused on every free-text route', () => {
    const tooLong = 'x'.repeat(200_001);
    for (const [name, schema] of [
      ['roast', roastSchema],
      ['pretest', pretestSchema],
      ['prerequisites', prerequisitesSchema],
      ['segregate', segregateSchema],
      ['blurt', blurtSchema],
      ['triage', triageSchema],
    ] as const) {
      expect(schema.safeParse({ notes: tooLong, blurtText: tooLong, text: tooLong }).success, name).toBe(false);
    }
  });
});

describe('the file fragment accepts an explicit null', () => {
  // `UploadedFileAsset | null` is React state, and `JSON.stringify` keeps the
  // null: pasting notes without uploading a file posts `file: null`. Rejecting
  // it turned the most ordinary request in the app into a 400.
  it('accepts null, undefined and a real attachment alike', () => {
    expect(fileAssetSchema.safeParse(null).success).toBe(true);
    expect(fileAssetSchema.safeParse(undefined).success).toBe(true);
    expect(
      fileAssetSchema.safeParse({ name: 'a.pdf', type: 'application/pdf', size: 10, base64Data: 'YQ==' }).success
    ).toBe(true);
  });

  it('is wired into every route that takes an attachment', () => {
    const attachment = null;
    expect(encodeSchema.safeParse({ notes: 'n', file: attachment }).success).toBe(true);
    expect(teachSchema.safeParse({ notes: 'n', file: attachment }).success).toBe(true);
    for (const [name, schema] of [
      ['roast', roastSchema],
      ['pretest', pretestSchema],
      ['prerequisites', prerequisitesSchema],
      ['segregate', segregateSchema],
    ] as const) {
      expect(schema.safeParse({ notes: 'n', file: attachment }).success, name).toBe(true);
    }
  });
});

describe('the routes that keep their own answer keep their own fields optional', () => {
  it('crucible, triage, blurt and the drills do not require the field the route checks', () => {
    // Required-ness lives in the route's own sentence, so the schema must not
    // pre-empt it: a missing topic is the route's 400, not a schema error.
    expect(crucibleSchema.safeParse({}).success).toBe(true);
    expect(triageSchema.safeParse({ text: '' }).success).toBe(true);
    expect(blurtSchema.safeParse({ blurtText: '   ' }).success).toBe(true);
    expect(archetypeSchema.safeParse({}).success).toBe(true);
    expect(synthesisSchema.safeParse({ docA: null, docB: null }).success).toBe(true);
  });
});
