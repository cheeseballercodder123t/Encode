import { describe, it, expect } from 'vitest';
import { buildChapterSummary } from '@/lib/chapters';
import { Activity, StageResponse } from '@/lib/types';

function chapter(index: number, title: string, formatted?: string, seconds?: number): Activity {
  return {
    id: `ch-${index}`,
    stageNumber: index + 1,
    title,
    framework: 'First Principles',
    cognitiveGoal: 'Explain it.',
    contextSnippet: 'context',
    keywords: [],
    templateType: 'first_principles',
    prompt: 'prompt',
    scaffold: {
      field1Label: 'Trigger',
      field1Placeholder: 'x',
      field2Label: 'Mechanism',
      field2Placeholder: 'y',
      exampleAnswer: 'z',
    },
    videoTimestamp: formatted ? { seconds: seconds ?? 0, formatted, label: title } : undefined,
  };
}

const chapters = [
  chapter(0, 'Visualising Weights', '00:00', 0),
  chapter(1, 'Gradient Descent', '07:12', 432),
  chapter(2, 'Backpropagation', '15:40', 940),
];

const encoded = (field1: string): StageResponse => ({ field1, field2: '' });

describe('buildChapterSummary', () => {
  it('marks the encoded chapters done and keeps the rest pending', () => {
    const summary = buildChapterSummary(chapters, { 'ch-0': encoded('weights are scalars') }, 1);
    expect(summary.total).toBe(3);
    expect(summary.done).toBe(1);
    expect(summary.chapters.map((c) => c.status)).toEqual(['done', 'current', 'pending']);
    expect(summary.chapters[1].label).toBe('07:12 · Gradient Descent');
    expect(summary.chapters[1].seconds).toBe(432);
  });

  it('points the resume line at the first unencoded chapter', () => {
    const summary = buildChapterSummary(chapters, { 'ch-0': encoded('a'), 'ch-1': encoded('b') }, 1);
    expect(summary.done).toBe(2);
    expect(summary.resumeIndex).toBe(2);
    expect(summary.summaryLine).toBe('2 of 3 chapters encoded · resume at 3 of 3');
  });

  it('counts a graded-but-not-committed chapter as produced work', () => {
    // The response record only stores the raw fields on mastery, so a chapter
    // the learner answered and had graded must still register.
    const summary = buildChapterSummary(
      chapters,
      {
        'ch-0': {
          field1: '',
          field2: '',
          checkCount: 1,
          feynmanReview: { grade: 'good', score: 78, feedback: 'solid', xpBonus: 10 },
        },
      },
      0
    );
    expect(summary.done).toBe(1);
    expect(summary.chapters[0].status).toBe('done');
  });

  it('treats a skipped or empty chapter as not encoded', () => {
    const summary = buildChapterSummary(
      chapters,
      {
        'ch-0': { field1: 'done', field2: '', skipped: true },
        'ch-1': { field1: '   ', field2: '' },
        'ch-2': encoded('real work'),
      },
      0
    );
    expect(summary.done).toBe(1);
    expect(summary.chapters[2].done).toBe(true);
    expect(summary.resumeIndex).toBe(0);
  });

  it('reports completion when every chapter is encoded', () => {
    const summary = buildChapterSummary(
      chapters,
      { 'ch-0': encoded('a'), 'ch-1': encoded('b'), 'ch-2': encoded('c') },
      0
    );
    expect(summary.summaryLine).toBe('3 of 3 chapters encoded · session complete');
    // Resume stays on the last chapter rather than wrapping to the start.
    expect(summary.resumeIndex).toBe(2);
  });

  it('degrades gracefully with no chapters at all', () => {
    const summary = buildChapterSummary(undefined, undefined, 0);
    expect(summary.chapters).toEqual([]);
    expect(summary.summaryLine).toBe('No chapters yet');
  });

  it('falls back to the stage title when the video has no timestamp', () => {
    const summary = buildChapterSummary([chapter(0, 'Untimed Chapter')], {}, 0);
    expect(summary.chapters[0].label).toBe('Untimed Chapter');
    expect(summary.chapters[0].seconds).toBeUndefined();
  });
});
