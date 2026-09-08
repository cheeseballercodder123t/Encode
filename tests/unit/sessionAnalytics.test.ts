import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeSessionStats,
  invalidateSessionCache,
  exportToCSV,
  exportToJSON,
} from '@/lib/services/sessionAnalytics';
import { makeSchema, makeActivity } from './fixtures';

describe('computeSessionStats', () => {
  beforeEach(() => invalidateSessionCache());

  it('computes counts, averages and template breakdown', () => {
    const acts = [
      makeActivity({ id: 'a1', templateType: 'first_principles' }),
      makeActivity({ id: 'a2', templateType: 'first_principles' }),
      makeActivity({ id: 'a3', templateType: 'memory_palace' }),
    ];
    const schema = makeSchema({
      activities: acts,
      userResponses: {
        a1: { field1: 'yes', field2: 'x', confidenceScore: 60, checkCount: 2, reflection: 'r1', feynmanReview: { grade: 'mastered', score: 90, feedback: '', xpBonus: 0 } },
        a2: { field1: 'yes', field2: '', confidenceScore: 80, checkCount: 4, reflection: '', feynmanReview: { grade: 'needs_elaboration', score: 50, feedback: '', xpBonus: 0 } },
        a3: { field1: '', field2: '' },
      },
    });

    const stats = computeSessionStats(schema);
    expect(stats.totalStages).toBe(3);
    expect(stats.answeredStages).toBe(2);
    expect(stats.avgConfidence).toBe(70);
    expect(stats.avgCheckCount).toBe(3);
    expect(stats.successRate).toBeCloseTo(0.5);
    expect(stats.reflectionsWritten).toBe(1);
    expect(stats.templateBreakdown).toEqual({ first_principles: 2, memory_palace: 1 });
  });

  it('handles an empty schema without crashing', () => {
    const stats = computeSessionStats(makeSchema({ activities: [], userResponses: {} }));
    expect(stats.totalStages).toBe(0);
    expect(stats.successRate).toBe(0);
  });

  it('memoizes per schema id+timestamp and invalidates on demand', () => {
    const schema = makeSchema();
    const first = computeSessionStats(schema);
    expect(computeSessionStats(schema)).toBe(first);

    invalidateSessionCache(schema.id);
    const second = computeSessionStats(schema);
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });
});

describe('exportToCSV', () => {
  it('emits a header and one row per answered stage', () => {
    const acts = [makeActivity({ id: 'a1' }), makeActivity({ id: 'a2' })];
    const schema = makeSchema({
      topicSummary: 'Topic with, comma and "quotes"',
      activities: acts,
      userResponses: {
        a1: { field1: 'f1', field2: 'f2', confidenceScore: 70, checkCount: 1, reflection: 'did "it"', readinessLatencyMs: 2500 },
      },
    });
    const csv = exportToCSV([schema]);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('session_id');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('""quotes""');
    expect(lines[1]).toContain('2500');
  });

  it('skips stages without a response', () => {
    const schema = makeSchema({ userResponses: {} });
    expect(exportToCSV([schema]).split('\n')).toHaveLength(1);
  });
});

describe('exportToJSON', () => {
  it('projects schemas into a stage-level JSON structure', () => {
    const schema = makeSchema();
    const parsed = JSON.parse(exportToJSON([schema]));
    expect(parsed[0].topic).toBe(schema.topicSummary);
    expect(parsed[0].stages[0].template).toBe(schema.activities[0].templateType);
    expect(parsed[0].stages[0].response.field1).toBe('answer one');
  });
});
