import { describe, it, expect } from 'vitest';
import {
  extractJson,
  safeParseJson,
  validateEncodedSchema,
  validateEvaluationResult,
  validateBatchEvaluation,
  validateYouTubeResult,
} from '../../lib/ai-output-validation';
import type { Activity } from '../../lib/types';

describe('extractJson', () => {
  it('strips ```json fences', () => {
    const raw = '```json\n{"a":1}\n```';
    expect(extractJson(raw)).toBe('{"a":1}');
  });

  it('strips plain ``` fences', () => {
    const raw = '```\n{"a":1}\n```';
    expect(extractJson(raw)).toBe('{"a":1}');
  });

  it('extracts the JSON object out of surrounding prose', () => {
    const raw = 'Here is the JSON you asked for:\n{"topic":"x"}\nHope that helps!';
    expect(extractJson(raw)).toBe('{"topic":"x"}');
  });

  it('strips a BOM', () => {
    expect(extractJson('\uFEFF{"a":1}')).toBe('{"a":1}');
  });

  it('returns input unchanged when there is no fence or braces', () => {
    expect(extractJson('plain text')).toBe('plain text');
  });
});

describe('safeParseJson', () => {
  it('parses clean JSON directly', () => {
    expect(safeParseJson('{"grade":"good"}')).toEqual({ grade: 'good' });
  });

  it('parses fenced JSON', () => {
    expect(safeParseJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
  });

  it('returns null for garbage', () => {
    expect(safeParseJson('not json at all {')).toBeNull();
  });
});
describe('validateEncodedSchema', () => {
  it('returns safe defaults for a null payload', () => {
    const result = validateEncodedSchema(null, 'conceptual');
    expect(result.topicSummary).toBe('Active Cognitive Schema');
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0].templateType).toBe('first_principles');
  });

  it('falls back to a single stage when the model returns an empty list', () => {
    const result = validateEncodedSchema({ topicSummary: 'T', activities: [] }, 'conceptual');
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0].scaffold.field1Label).toBeTruthy();
  });

  it('uses a memorization fallback template in memorization mode', () => {
    const result = validateEncodedSchema({ activities: [] }, 'memorization');
    expect(result.activities[0].templateType).toBe('memory_palace');
  });

  it('fills missing scaffold labels with safe defaults', () => {
    const raw = {
      topicSummary: 'Neurons',
      activities: [
        { id: 'a1', title: 'Spike', scaffold: null },
      ],
    };
    const result = validateEncodedSchema(raw, 'conceptual');
    const act = result.activities[0];
    expect(act.scaffold.field1Label).toBe('Mechanism');
    expect(act.scaffold.field2Label).toBe('Causal Link');
    expect(act.templateType).toBe('first_principles');
  });

  it('preserves well-formed activities and drops unusable ones', () => {
    const raw = {
      topicSummary: 'T',
      activities: [
        { id: 'ok', title: 'Good', stageNumber: 2, keywords: ['k'], scaffold: { field1Label: 'F1' } },
        'not-an-object',
        null,
      ],
    };
describe('validateEvaluationResult', () => {
  it('coerces a valid evaluation', () => {
    const out = validateEvaluationResult({ grade: 'good', score: 78, xpBonus: 40, feedback: 'Nice.' });
    expect(out.grade).toBe('good');
    expect(out.score).toBe(78);
    expect(out.xpBonus).toBe(40);
    expect(out.feedback).toBe('Nice.');
  });

  it('downgrades an invalid grade to needs_elaboration', () => {
    const out = validateEvaluationResult({ grade: 'masterful', score: 99, feedback: 'wow' });
    expect(out.grade).toBe('needs_elaboration');
  });

  it('clamps out-of-range scores', () => {
    const out = validateEvaluationResult({ grade: 'mastered', score: 500, xpBonus: -20, feedback: 'x' });
    expect(out.score).toBe(100);
    expect(out.xpBonus).toBe(0);
  });

  it('produces a safe fallback for a null payload (never grants mastery)', () => {
    const out = validateEvaluationResult(null);
    expect(out.grade).toBe('needs_elaboration');
    expect(out.feedback.length).toBeGreaterThan(0);
  });

  it('keeps optional fields only when strings', () => {
    const out = validateEvaluationResult({ grade: 'good', score: 70, feedback: 'f', depthAlert: 'watch jargon', jargonBuzzer: 42 });
    expect(out.depthAlert).toBe('watch jargon');
    expect(out.jargonBuzzer).toBeUndefined();
  });
});

describe('validateBatchEvaluation', () => {
  it('sanitizes per-stage grades and clamps the overall score', () => {
    const out = validateBatchEvaluation({
      overallScore: 120,
      analysis: 'Solid.',
      perStageGrades: [
        { stageTitle: 'S1', grade: 'good', score: 80, feedback: 'ok' },
        { grade: 'bogus', score: 200, feedback: '' },
        'junk',
      ],
    });
    expect(out.overallScore).toBe(100);
    expect(out.perStageGrades).toHaveLength(2);
    expect(out.perStageGrades[1].grade).toBe('needs_elaboration');
    expect(out.perStageGrades[1].score).toBe(100);
    expect(out.perStageGrades[1].stageTitle).toBe('Stage');
  });

  it('returns empty grades for a malformed payload', () => {
    const out = validateBatchEvaluation(null);
    expect(out.overallScore).toBe(0);
    expect(out.perStageGrades).toEqual([]);
  });
});

describe('validateYouTubeResult', () => {
  it('prefers the video title for the topic summary and keeps youtubeData', () => {
    const out = validateYouTubeResult({
      videoTitle: 'Cell Respiration',
      topicSummary: '',
      activities: [{ id: 'a', title: 't', scaffold: { field1Label: 'f' } }],
      youtubeData: { videoId: 'abc' },
    });
    expect(out.topicSummary).toBe('Cell Respiration');
    expect(out.youtubeData?.videoId).toBe('abc');
    expect(out.activities).toHaveLength(1);
  });

  it('builds minimal youtubeData from a bare videoId', () => {
    const out = validateYouTubeResult({ videoId: 'vid1', activities: [] });
    expect(out.youtubeData?.videoUrl).toContain('vid1');
  });
});
    const result = validateEncodedSchema(raw, 'conceptual');
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0].id).toBe('ok');
    expect(result.activities[0].stageNumber).toBe(2);
    expect((result.activities[0] as Activity).keywords).toEqual(['k']);
  });

  it('preserves researchContexts when present', () => {
    const rc = [{ id: 'r1', detectedGap: 'g', conceptAdded: 'c', explanation: 'e' }];
    const result = validateEncodedSchema({ activities: [], researchContexts: rc }, 'conceptual');
    expect(result.researchContexts).toEqual(rc);
  });
});