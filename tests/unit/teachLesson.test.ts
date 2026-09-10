import { describe, it, expect } from 'vitest';
import { buildFallbackLesson, sanitizeLesson, sanitizeSegment } from '@/lib/services/teachLesson';
import { makeActivity } from './fixtures';
import { LessonSegment } from '@/lib/types';

function makeSegment(overrides: Partial<LessonSegment> = {}): LessonSegment {
  return {
    id: 's1',
    type: 'concept',
    title: 'Concept',
    body: 'Some body text.',
    xpValue: 5,
    ...overrides,
  };
}

describe('sanitizeSegment', () => {
  it('keeps a valid concept segment', () => {
    const seg = sanitizeSegment({ type: 'concept', title: 'T', body: 'B' }, 0);
    expect(seg).not.toBeNull();
    expect(seg!.type).toBe('concept');
    expect(seg!.body).toBe('B');
  });

  it('falls back unknown segment types to concept', () => {
    const seg = sanitizeSegment({ type: 'weird_custom_type', title: 'X', body: 'Y' }, 0);
    expect(seg!.type).toBe('concept');
  });

  it('drops segments with no renderable content', () => {
    const seg = sanitizeSegment({ type: 'concept' }, 0);
    expect(seg).toBeNull();
  });

  it('coerces xpValue into range and applies type defaults', () => {
    const seg = sanitizeSegment({ type: 'youTry', body: 'B', xpValue: 9999 }, 0);
    expect(seg!.xpValue).toBeLessThanOrEqual(60);
  });

  it('derives mcq kind from options when kind is omitted', () => {
    const seg = sanitizeSegment({
      type: 'checkpoint',
      question: {
        prompt: 'Pick one',
        options: [
          { label: 'A', correct: true },
          { label: 'B', correct: false },
        ],
      },
    }, 0);
    expect(seg!.question!.kind).toBe('mcq');
  });

  it('flags a fallback correct option when the AI ships none', () => {
    const seg = sanitizeSegment({
      type: 'checkpoint',
      question: {
        kind: 'mcq',
        prompt: 'Q',
        options: [{ label: 'A' }, { label: 'B' }],
      },
    }, 0);
    expect(seg!.question!.options!.some((o) => o.correct)).toBe(true);
    expect(seg!.question!.options![0].correct).toBe(true);
  });

  it('generates stable ids for options lacking one', () => {
    const seg = sanitizeSegment({
      type: 'checkpoint',
      question: {
        kind: 'mcq',
        prompt: 'Q',
        options: [{ label: 'A', correct: true }, { label: 'B', correct: false }],
      },
    }, 0);
    const ids = seg!.question!.options!.map((o) => o.id);
    expect(ids).toEqual(['opt_1', 'opt_2']);
  });

  it('derives ordering kind from items and fillBlank from blanks', () => {
    const ordering = sanitizeSegment({
      type: 'checkpoint',
      question: { prompt: 'Order these', items: [{ label: 'first', correctIndex: 0 }] },
    }, 0);
    expect(ordering!.question!.kind).toBe('ordering');

    const fill = sanitizeSegment({
      type: 'checkpoint',
      question: { prompt: 'Fill', blanks: [{ answer: 'x' }] },
    }, 0);
    expect(fill!.question!.kind).toBe('fillBlank');
  });

  it('drops empty fillBlank questions', () => {
    const seg = sanitizeSegment({
      type: 'checkpoint',
      question: { kind: 'fillBlank', prompt: 'Fill', blanks: [{ answer: '' }] },
    }, 0);
    expect(seg).toBeNull();
  });
});

describe('sanitizeLesson', () => {
  it('wraps a bare object into a lesson', () => {
    const lesson = sanitizeLesson({ title: 'Bare', segments: [makeSegment()] });
    expect(lesson).not.toBeNull();
    expect(lesson!.title).toBe('Bare');
    expect(lesson!.segments).toHaveLength(1);
  });

  it('reads the .lesson wrapper when present', () => {
    const lesson = sanitizeLesson({ lesson: { title: 'Wrapped', segments: [makeSegment(), makeSegment({ id: 's2' })] } });
    expect(lesson!.segments).toHaveLength(2);
  });

  it('returns null for empty / unusable payloads', () => {
    expect(sanitizeLesson(null)).toBeNull();
    expect(sanitizeLesson({})).toBeNull();
    expect(sanitizeLesson({ lesson: { segments: [] } })).toBeNull();
    expect(sanitizeLesson({ segments: [] })).toBeNull();
  });

  it('caps segments at MAX_SEGMENTS and strips junk ones', () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      i % 2 === 0 ? makeSegment({ id: `seg_${i}` }) : { id: `junk_${i}` },
    );
    const lesson = sanitizeLesson({ title: 'Big', segments: many });
    expect(lesson!.segments.length).toBeLessThanOrEqual(24);
  });

  it('preserves masteryCheck and wrapup when present', () => {
    const lesson = sanitizeLesson({
      title: 'WithMastery',
      segments: [makeSegment()],
      masteryCheck: { prompt: 'Prove it', keywords: ['a', 'b'] },
      wrapup: { summary: 'Done', callToAction: 'Next' },
    });
    expect(lesson!.masteryCheck!.prompt).toBe('Prove it');
    expect(lesson!.masteryCheck!.keywords).toEqual(['a', 'b']);
    expect(lesson!.wrapup!.callToAction).toBe('Next');
  });
});

describe('buildFallbackLesson', () => {
  it('produces a deterministic multi-segment lesson from an activity', () => {
    const activity = makeActivity({
      id: 'act-x',
      title: 'Action Potential',
      contextSnippet: 'Resting is -70mV.',
      scaffold: {
        field1Label: 'What Happens',
        field1Placeholder: 'STAGE1_FIELD1',
        field2Label: 'Why It Happens',
        field2Placeholder: 'STAGE1_FIELD2',
        exampleAnswer: 'Sodium influx depolarizes the membrane.',
      },
      visualData: {
        generationChallenge: {
          premisePrompt: 'If the cell is a battery...',
          clue: 'threshold is -55mV',
          missingRoleOrTarget: 'Na+ channels open',
          expertCompletion: 'Full mechanism.',
        },
      },
      boundaryContrast: {
        confusableLookalike: 'Passive diffusion',
        distinguishingRule: 'Active voltage-gated opening vs passive leak.',
      },
    });

    const lesson = buildFallbackLesson('Action Potentials', 'conceptual', activity);
    expect(lesson.title).toContain('Action Potentials');
    expect(lesson.segments.length).toBeGreaterThanOrEqual(4);

    // The checkpoint trap distractor should use the confusable lookalike.
    const ck = lesson.segments.find((s) => s.type === 'checkpoint');
    expect(ck).toBeDefined();
    const trapOption = ck!.question!.options!.find((o) => o.label === 'Passive diffusion');
    expect(trapOption).toBeDefined();
    expect(trapOption!.correct).toBe(false);
  });

  it('still builds a lesson without visualData or boundaryContrast', () => {
    const activity = makeActivity({ id: 'plain', title: 'Plain', contextSnippet: 'x' });
    const lesson = buildFallbackLesson('Plain', 'conceptual', activity);
    expect(lesson.segments.length).toBeGreaterThanOrEqual(3);
    expect(lesson.segments.some((s) => s.type === 'youTry')).toBe(true);
  });

  it('builds a generic lesson when no activity is provided', () => {
    const lesson = buildFallbackLesson('Some Topic', 'conceptual');
    expect(lesson.segments.length).toBeGreaterThanOrEqual(2);
    expect(lesson.segments[0].type).toBe('concept');
  });
});

