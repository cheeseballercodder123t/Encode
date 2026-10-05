import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeLibraryStats,
  computeSessionStats,
  invalidateSessionCache,
  exportToCSV,
  exportToJSON,
  paginateSessions,
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
        a1: { field1: 'yes', field2: 'x', confidenceScore: 60, checkCount: 2, reflection: 'r1', feynmanReview: { secured: true, feedback: '' } },
        a2: { field1: 'yes', field2: '', confidenceScore: 80, checkCount: 4, reflection: '', feynmanReview: { secured: false, feedback: '' } },
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

describe('computeLibraryStats', () => {
  beforeEach(() => invalidateSessionCache());

  it('adds up every session in the same vocabulary as a single one', () => {
    const first = makeSchema({
      id: 's1',
      timestamp: 1,
      activities: [
        makeActivity({ id: 'a1', templateType: 'first_principles' }),
        makeActivity({ id: 'a2', templateType: 'memory_palace' }),
      ],
      userResponses: {
        a1: { field1: 'yes', field2: 'x', confidenceScore: 60, checkCount: 2, reflection: 'r1', feynmanReview: { secured: true, feedback: '' } },
        a2: { field1: 'yes', field2: 'y', confidenceScore: 80, checkCount: 4 },
      },
    });
    const second = makeSchema({
      id: 's2',
      timestamp: 2,
      activities: [makeActivity({ id: 'b1', templateType: 'first_principles' })],
      userResponses: {
        b1: { field1: '', field2: '', confidenceScore: 100, checkCount: 6, feynmanReview: { secured: false, feedback: '' } },
      },
    });

    const stats = computeLibraryStats([first, second]);
    expect(stats.totalStages).toBe(3);
    expect(stats.answeredStages).toBe(2);
    // Averaged over the three responses that carried a score, not the sessions.
    expect(stats.avgConfidence).toBe(80);
    expect(stats.avgCheckCount).toBe(4);
    // One landed of the two checked: a fraction, not a percentage.
    expect(stats.successRate).toBeCloseTo(0.5);
    expect(stats.reflectionsWritten).toBe(1);
    expect(stats.templateBreakdown).toEqual({ first_principles: 2, memory_palace: 1 });
  });

  it('returns zeroes for an empty library instead of NaN', () => {
    const stats = computeLibraryStats([]);
    expect(stats.totalStages).toBe(0);
    expect(stats.avgConfidence).toBe(0);
    expect(stats.avgCheckCount).toBe(0);
    expect(stats.successRate).toBe(0);
    expect(stats.templateBreakdown).toEqual({});
  });

  it('memoizes on the library array and drops the cache on invalidation', () => {
    const schemas = [makeSchema()];
    const first = computeLibraryStats(schemas);
    expect(computeLibraryStats(schemas)).toBe(first);

    invalidateSessionCache();
    const second = computeLibraryStats(schemas);
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });

  it('recomputes when the library is replaced by a different history', () => {
    const one = computeLibraryStats([makeSchema({ id: 'x', timestamp: 1 })]);
    const two = computeLibraryStats([makeSchema({ id: 'x', timestamp: 1 }), makeSchema({ id: 'y', timestamp: 2 })]);
    expect(one).not.toBe(two);
    expect(two.totalStages).toBe(one.totalStages * 2);
  });
});

describe('paginateSessions', () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);

  it('slices one page and reports the page count', () => {
    expect(paginateSessions(items, 1, 10)).toEqual({ items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], page: 1, totalPages: 3 });
    expect(paginateSessions(items, 3, 10).items).toEqual([21, 22, 23, 24, 25]);
  });

  it('clamps a page past the end instead of rendering an empty log', () => {
    const page = paginateSessions(items, 99, 10);
    expect(page.page).toBe(3);
    expect(page.items).toEqual([21, 22, 23, 24, 25]);
  });

  it('always reports at least one page', () => {
    expect(paginateSessions([], 1, 10)).toEqual({ items: [], page: 1, totalPages: 1 });
  });

  it('never divides by a nonsense page size', () => {
    const page = paginateSessions(items, 1, 0);
    expect(page.totalPages).toBe(25);
    expect(page.items).toEqual([1]);
  });
});

describe('exportToCSV', () => {
  it('emits a header and one row per answered stage', () => {
    const acts = [makeActivity({ id: 'a1' }), makeActivity({ id: 'a2' })];
    const schema = makeSchema({
      topicSummary: 'Topic with, comma and "quotes"',
      activities: acts,
      userResponses: {
        a1: {
          field1: 'f1',
          field2: 'f2',
          confidenceScore: 70,
          checkCount: 1,
          reflection: 'did "it"',
          feynmanReview: { secured: true, feedback: '' },
        },
      },
    });
    const csv = exportToCSV([schema]);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('session_id');
    // The old per-stage grade and score columns are gone with the verdict they
    // carried; what the export reports is whether the mechanism landed.
    expect(lines[0]).toContain('mechanism_landed');
    expect(lines[0]).not.toContain('grade');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('""quotes""');
    expect(lines[1]).toContain('yes');
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
