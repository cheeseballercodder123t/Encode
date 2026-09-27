import { describe, it, expect } from 'vitest';
import {
  ForgeSource,
  collectCardFronts,
  countReportSections,
  dedupeKey,
  dropKnownCards,
  isEmptyForgeReport,
  mergeAdditionalCards,
  mergeSegregationReports,
  normalizeSegregationReport,
  summarizeMerge,
  totalReportCards,
} from '@/lib/services/forge';
import { SegregationReport } from '@/lib/types';

const textSource: ForgeSource = { id: 'src_1', kind: 'text', label: 'Lecture slides' };
const pdfSource: ForgeSource = { id: 'src_2', kind: 'file', label: 'handout.pdf' };
const videoSource: ForgeSource = { id: 'src_3', kind: 'youtube', label: 'youtube:renal' };

function report(overrides: Partial<SegregationReport> = {}): SegregationReport {
  return {
    topic: 'Renal Physiology',
    declarativeFacts: [
      { id: 'f1', factStatement: 'The loop of Henle reaches 1,200 mOsm.', clozeSuggestion: 'reaches {{1,200 mOsm}}' },
    ],
    conceptualMechanisms: [
      {
        id: 'm1',
        conceptName: 'Countercurrent multiplication',
        whatIsIt: 'w',
        whyItMatters: 'x',
        howItWorks: 'y',
        whatIfEdgeCase: 'z',
      },
    ],
    practiceQuestions: [{ id: 'q1', question: 'Which limb pumps salt out?', answer: 'Thick ascending limb' }],
    workedExamples: [{ id: 'e1', title: 'Free-water clearance', problem: 'Compute CH2O.', steps: ['a', 'b'] }],
    ...overrides,
  };
}

describe('normalizeSegregationReport', () => {
  it('namespaces ids with the source so two sources can never collide', () => {
    const normalized = normalizeSegregationReport(report(), 'src_7');
    expect(normalized!.declarativeFacts[0].id).toBe('src_7-f1');
    expect(normalized!.conceptualMechanisms[0].id).toBe('src_7-m1');
    expect(normalized!.practiceQuestions![0].id).toBe('src_7-q1');
    expect(normalized!.workedExamples![0].id).toBe('src_7-e1');
  });

  it('drops junk items and falls back to the cloze sentence as the fact', () => {
    const normalized = normalizeSegregationReport(
      {
        topic: 'T',
        declarativeFacts: [{ id: 'a', clozeSuggestion: 'Only a {{cloze}} here.' }, { junk: true }, null],
        conceptualMechanisms: [{ conceptName: '' }, { conceptName: 'Kept', whatIsIt: 'w' }],
        practiceQuestions: [{ question: 'no answer' }, { question: 'q', answer: 'a' }],
        workedExamples: [{ title: '', problem: '' }],
      },
      'src_1'
    );
    expect(normalized!.declarativeFacts).toHaveLength(1);
    expect(normalized!.declarativeFacts[0].factStatement).toBe('Only a {{cloze}} here.');
    expect(normalized!.conceptualMechanisms).toHaveLength(1);
    expect(normalized!.practiceQuestions).toHaveLength(1);
    expect(normalized!.workedExamples).toHaveLength(0);
  });

  it('keeps the lookalike trap, the tag and the memory hook', () => {
    const normalized = normalizeSegregationReport(
      {
        topic: 'T',
        declarativeFacts: [{ id: 'f', factStatement: 's', tag: 'Formula', memoryHook: 'hook' }],
        conceptualMechanisms: [
          {
            id: 'm',
            conceptName: 'C',
            whatIsIt: 'w',
            whyItMatters: 'x',
            howItWorks: 'y',
            whatIfEdgeCase: 'z',
            boundaryContrast: { confusableLookalike: 'L', distinguishingRule: 'R' },
          },
        ],
      },
      'src_1'
    );
    expect(normalized!.declarativeFacts[0].tag).toBe('Formula');
    expect(normalized!.declarativeFacts[0].memoryHook).toBe('hook');
    expect(normalized!.conceptualMechanisms[0].boundaryContrast).toEqual({
      confusableLookalike: 'L',
      distinguishingRule: 'R',
    });
  });

  it('returns null when nothing usable came back', () => {
    expect(normalizeSegregationReport(null)).toBeNull();
    expect(normalizeSegregationReport({ topic: 'T', declarativeFacts: [], conceptualMechanisms: [] })).toBeNull();
    expect(
      isEmptyForgeReport(report({ declarativeFacts: [], conceptualMechanisms: [], practiceQuestions: [], workedExamples: [] }))
    ).toBe(true);
    expect(isEmptyForgeReport(report())).toBe(false);
  });
});

describe('mergeSegregationReports', () => {
  it('merges several sources into one deck, keeping source order', () => {
    const second = report({
      topic: 'Renal Physiology II',
      declarativeFacts: [{ id: 'f9', factStatement: 'ADH inserts aquaporin-2.', clozeSuggestion: '{{aquaporin-2}}' }],
      conceptualMechanisms: [],
      practiceQuestions: [],
      workedExamples: [],
    });
    const merged = mergeSegregationReports([
      { source: textSource, report: report() },
      { source: pdfSource, report: second },
    ]);

    expect(merged.report.topic).toBe('Renal Physiology');
    expect(merged.report.declarativeFacts.map((f) => f.factStatement)).toEqual([
      'The loop of Henle reaches 1,200 mOsm.',
      'ADH inserts aquaporin-2.',
    ]);
    expect(merged.total).toBe(5);
    expect(merged.dropped).toBe(0);
    expect(merged.sources.map((s) => s.status)).toEqual(['ok', 'ok']);
  });

  it('drops duplicates that already arrived from an earlier source', () => {
    // Overlapping uploads (a slide deck and the lecture it came from) would
    // otherwise ship the same card twice.
    const overlap = report({
      declarativeFacts: [
        { id: 'dup', factStatement: 'the loop of henle reaches 1,200 mosm.', clozeSuggestion: 'dup' },
        { id: 'new', factStatement: 'Vasa recta run parallel.', clozeSuggestion: 'new' },
      ],
      conceptualMechanisms: [
        {
          id: 'dupm',
          conceptName: 'countercurrent multiplication',
          whatIsIt: 'w',
          whyItMatters: 'x',
          howItWorks: 'y',
          whatIfEdgeCase: 'z',
        },
      ],
      practiceQuestions: [{ id: 'dupq', question: 'which limb pumps salt out?', answer: 'same' }],
      workedExamples: [
        { id: 'dupe', title: 'Free-water clearance', problem: 'Compute CH2O.', steps: ['a'] },
      ],
    });
    const merged = mergeSegregationReports([
      { source: textSource, report: report() },
      { source: pdfSource, report: overlap },
    ]);

    expect(merged.report.declarativeFacts).toHaveLength(2);
    expect(merged.report.conceptualMechanisms).toHaveLength(1);
    expect(merged.report.practiceQuestions).toHaveLength(1);
    expect(merged.report.workedExamples).toHaveLength(1);
    expect(merged.dropped).toBe(4);
    expect(merged.sources[1].note).toContain('already in the deck');
  });

  it('reports a source that produced nothing without failing the deck', () => {
    const merged = mergeSegregationReports([
      { source: textSource, report: report() },
      { source: videoSource, report: null, note: 'No captions on this video.' },
    ]);

    expect(merged.total).toBe(4);
    expect(merged.sources[1]).toMatchObject({ status: 'failed', note: 'No captions on this video.' });
    expect(merged.sources[1].counts).toEqual({ facts: 0, mechanisms: 0, drills: 0, examples: 0 });
    expect(merged.report.declarativeFacts).toHaveLength(1);
  });

  it('uses the caller topic, then the first source topic, then a placeholder', () => {
    expect(mergeSegregationReports([{ source: textSource, report: report() }], 'Custom').report.topic).toBe('Custom');
    expect(mergeSegregationReports([{ source: textSource, report: null }]).report.topic).toBe('Forged Deck');
  });

  it('counts per-section cards and summarizes the merge', () => {
    const merged = mergeSegregationReports([{ source: textSource, report: report() }]);
    expect(merged.counts).toEqual({ facts: 1, mechanisms: 1, drills: 1, examples: 1 });
    expect(merged.report.compressionRatio).toBe('1 source merged · no overlap');
    expect(summarizeMerge(3, 2)).toBe('2 sources merged · 3 duplicate cards dropped');
    expect(summarizeMerge(1, 1)).toBe('1 source merged · 1 duplicate card dropped');
    expect(summarizeMerge(0, 2, 1)).toBe('2 sources merged · no overlap · 1 source conflict flagged');
  });

  it('replaces two disagreeing claims with ONE conflict card that leads the deck', () => {
    const slides = report({
      declarativeFacts: [
        { id: 'f1', factStatement: 'The half-life of the drug is 4 h.', clozeSuggestion: 'The half-life is {{4 h}}.' },
      ],
      conceptualMechanisms: [],
      practiceQuestions: [],
      workedExamples: [],
    });
    const lecture = report({
      declarativeFacts: [
        { id: 'f1', factStatement: 'The half-life of the drug is 6 h.', clozeSuggestion: 'The half-life is {{6 h}}.' },
      ],
      conceptualMechanisms: [],
      practiceQuestions: [],
      workedExamples: [],
    });

    const merged = mergeSegregationReports([
      { source: textSource, report: slides },
      { source: pdfSource, report: lecture },
    ]);

    expect(merged.contradictions).toHaveLength(1);
    expect(merged.contradictions[0].kind).toBe('numeric');
    expect(merged.contradictions[0].summary).toBe('4 h vs 6 h');

    // The two originals are gone; the single conflict card is what ships.
    expect(merged.report.declarativeFacts).toHaveLength(1);
    const card = merged.report.declarativeFacts[0];
    expect(card.id).toBe(merged.contradictions[0].card.id);
    expect(card.tag).toBe('Contradiction');
    expect(card.factStatement).toContain('4 h');
    expect(card.factStatement).toContain('6 h');
    expect(merged.counts.facts).toBe(1);
    expect(merged.total).toBe(1);

    // Each source stops claiming the card it just handed over.
    expect(merged.sources[0].counts.facts).toBe(0);
    expect(merged.sources[0].note).toContain('conflict card');
    expect(merged.sources[1].counts.facts).toBe(0);
    expect(merged.report.compressionRatio).toContain('1 source conflict flagged');
  });

  it('leaves agreeing sources alone and can be told not to look for conflicts', () => {
    const second = report({
      declarativeFacts: [
        { id: 'f1', factStatement: 'The half-life of the drug is 4 h.', clozeSuggestion: 'The half-life is {{4 h}}.' },
      ],
    });
    const merged = mergeSegregationReports([{ source: textSource, report: report() }, { source: pdfSource, report: second }]);
    expect(merged.contradictions).toEqual([]);

    const conflicting = report({
      declarativeFacts: [
        { id: 'f1', factStatement: 'The loop of Henle reaches 900 mOsm.', clozeSuggestion: 'reaches {{900 mOsm}}' },
      ],
    });
    const off = mergeSegregationReports(
      [{ source: textSource, report: report() }, { source: pdfSource, report: conflicting }],
      undefined,
      { detectConflicts: false }
    );
    expect(off.contradictions).toEqual([]);
    // Both disagreeing claims survive as separate cards when detection is off.
    expect(off.report.declarativeFacts).toHaveLength(2);
  });

  it('collapses punctuation and case when keying cards', () => {
    expect(dedupeKey('The Loop of Henle, reaches 1,200 mOsm!')).toBe('the loop of henle reaches 1 200 mosm');
  });
});

describe('extending a forged deck ("generate more" / "condense")', () => {
  it('counts every section and the whole deck', () => {
    expect(countReportSections(report())).toEqual({ facts: 1, mechanisms: 1, drills: 1, examples: 1 });
    expect(totalReportCards(report())).toBe(4);
    expect(
      totalReportCards(report({ declarativeFacts: [], conceptualMechanisms: [], practiceQuestions: [], workedExamples: [] }))
    ).toBe(0);
  });

  it('lists one front per card, in the order the deck ships', () => {
    expect(collectCardFronts(report())).toEqual([
      'The loop of Henle reaches 1,200 mOsm.',
      'Countercurrent multiplication',
      'Which limb pumps salt out?',
      'Free-water clearance',
    ]);
  });

  it('drops cards the deck already has, however they are punctuated', () => {
    const addition = report({
      declarativeFacts: [
        // The same fact, re-worded enough to be a repeat rather than a copy.
        { id: 'a', factStatement: 'THE LOOP OF HENLE REACHES 1 200 MOSM', clozeSuggestion: 'x' },
        { id: 'b', factStatement: 'ADH inserts aquaporin-2 into the collecting duct.', clozeSuggestion: 'y' },
      ],
      conceptualMechanisms: [],
      practiceQuestions: [],
      workedExamples: [],
    });
    const known = new Set(collectCardFronts(report()).map(dedupeKey));
    const { report: fresh, added, dropped } = dropKnownCards(addition, known);

    expect(added).toBe(1);
    expect(dropped).toBe(1);
    expect(fresh.declarativeFacts.map((f) => f.id)).toEqual(['b']);
  });

  it('drops repeats inside the new batch too', () => {
    const addition = report({
      declarativeFacts: [
        { id: 'a', factStatement: 'Vasa recta run parallel to the loop.', clozeSuggestion: 'x' },
        { id: 'b', factStatement: 'Vasa recta run parallel to the loop.', clozeSuggestion: 'y' },
      ],
      conceptualMechanisms: [],
      practiceQuestions: [],
      workedExamples: [],
    });
    const { added, dropped } = dropKnownCards(addition, new Set());
    expect(added).toBe(1);
    expect(dropped).toBe(1);
  });

  it('appends to the deck without reordering it or re-labelling the topic', () => {
    const base = report();
    const addition = report({
      topic: 'Something else entirely',
      declarativeFacts: [{ id: 'n1', factStatement: 'Vasa recta run parallel to the loop.', clozeSuggestion: 'x' }],
      conceptualMechanisms: [],
      practiceQuestions: [{ id: 'n2', question: 'What drives the medullary gradient?', answer: 'The loop.' }],
      workedExamples: [],
    });
    const { report: grown, added, dropped } = mergeAdditionalCards(base, addition);

    expect(added).toBe(2);
    expect(dropped).toBe(0);
    expect(grown.topic).toBe('Renal Physiology');
    expect(grown.declarativeFacts.map((f) => f.id)).toEqual(['f1', 'n1']);
    expect(grown.practiceQuestions!.map((q) => q.id)).toEqual(['q1', 'n2']);
    // The base deck is left untouched.
    expect(base.declarativeFacts).toHaveLength(1);
    expect(base.practiceQuestions).toHaveLength(1);
  });

  it('returns the deck unchanged when the batch has nothing new', () => {
    const base = report();
    const duplicate = report({
      declarativeFacts: [
        { id: 'dup', factStatement: 'the loop of henle reaches 1,200 mOsm.', clozeSuggestion: 'x' },
      ],
      conceptualMechanisms: [],
      practiceQuestions: [],
      workedExamples: [],
    });
    const { report: unchanged, added, dropped } = mergeAdditionalCards(base, duplicate);
    expect(added).toBe(0);
    expect(dropped).toBe(1);
    expect(unchanged).toBe(base);
  });
});
