import { describe, it, expect } from 'vitest';
import {
  ForgeSource,
  buildCoverageReport,
  collectCardFronts,
  countReportSections,
  createNearDuplicateIndex,
  deckCardKeys,
  dedupeKey,
  dropKnownCards,
  formatCount,
  isNearDuplicate,
  isEmptyForgeReport,
  mergeAdditionalCards,
  mergeSegregationReports,
  normalizeSegregationReport,
  similarity,
  sourceYield,
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

  it('drops a RE-WORDED repeat of a card the deck already has', () => {
    // The exact-key test above only catches punctuation. The model re-words
    // when it is asked not to repeat itself, and a re-worded repeat is still a
    // repeat: "can reach" is the same card as "reaches".
    const base = report({
      declarativeFacts: [
        {
          id: 'f1',
          factStatement: 'The loop of Henle reaches 1,200 mOsm at the hairpin of the medulla.',
          clozeSuggestion: 'reaches {{1,200 mOsm}}',
        },
      ],
      conceptualMechanisms: [],
      practiceQuestions: [],
      workedExamples: [],
    });
    const addition = report({
      declarativeFacts: [
        {
          id: 'a',
          factStatement: 'The loop of Henle can reach 1,200 mOsm at the hairpin of the medulla.',
          clozeSuggestion: 'x',
        },
        { id: 'b', factStatement: 'Vasa recta run parallel to the loop of Henle.', clozeSuggestion: 'y' },
      ],
      conceptualMechanisms: [],
      practiceQuestions: [],
      workedExamples: [],
    });

    // The route seeds this with the deck's raw fronts (not normalized keys).
    const { report: fresh, added, dropped } = dropKnownCards(addition, new Set(collectCardFronts(base)));
    expect(added).toBe(1);
    expect(dropped).toBe(1);
    expect(fresh.declarativeFacts.map((f) => f.id)).toEqual(['b']);
  });

  it('drops that same re-worded repeat when it arrives through mergeAdditionalCards', () => {
    // The guard has two entry points and only ONE of them used to be seeded with
    // the deck's wording: `dropKnownCards` got raw fronts, while this — the path
    // the UI's "generate more" and "re-forge" actually take — got
    // `deckCardKeys`. A normalized key has already been lowercased and
    // de-punctuated, so `protectedTokens` reads FEWER entities off the seed than
    // off the incoming card, the mismatching guard returns false, and the
    // re-worded card the sibling test above drops is appended as new. Same pair,
    // same module, opposite verdict.
    const base = report({
      declarativeFacts: [
        {
          id: 'f1',
          factStatement: 'The loop of Henle reaches 1,200 mOsm at the hairpin of the medulla.',
          clozeSuggestion: 'reaches {{1,200 mOsm}}',
        },
      ],
      conceptualMechanisms: [],
      practiceQuestions: [],
      workedExamples: [],
    });
    const addition = report({
      declarativeFacts: [
        {
          id: 'a',
          factStatement: 'The loop of Henle can reach 1,200 mOsm at the hairpin of the medulla.',
          clozeSuggestion: 'x',
        },
        { id: 'b', factStatement: 'Vasa recta run parallel to the loop of Henle.', clozeSuggestion: 'y' },
      ],
      conceptualMechanisms: [],
      practiceQuestions: [],
      workedExamples: [],
    });

    const { report: grown, added, dropped } = mergeAdditionalCards(base, addition);
    expect(dropped).toBe(1);
    expect(added).toBe(1);
    expect(grown.declarativeFacts.map((f) => f.id)).toEqual(['f1', 'b']);
  });

  it('drops a repeat of a card sitting past the 400-front prompt window', () => {
    // The route sends the model at most 400 existing fronts and seeds its own
    // drop with exactly those, so for a deck larger than that window the client
    // merge is the ONLY guard a repeat of the tail cards has. That is the case
    // this pins.
    const facts = Array.from({ length: 400 }, (_, i) => ({
      id: `f${i}`,
      factStatement: `Observation ${i}: the medullary interstitium concentrates around the vasa recta`,
      clozeSuggestion: 'x',
    }));
    facts.push({
      id: 'f400',
      factStatement: 'The vasa recta carry blood away from the loop of Henle in the medulla',
      clozeSuggestion: 'x',
    });
    const base = report({
      declarativeFacts: facts,
      conceptualMechanisms: [],
      practiceQuestions: [],
      workedExamples: [],
    });
    const addition = report({
      declarativeFacts: [
        {
          id: 'a',
          factStatement: 'The vasa recta carry blood away from the loop of Henle, deep in the medulla',
          clozeSuggestion: 'x',
        },
      ],
      conceptualMechanisms: [],
      practiceQuestions: [],
      workedExamples: [],
    });

    const { added, dropped } = mergeAdditionalCards(base, addition);
    expect(dropped).toBe(1);
    expect(added).toBe(0);
  });

  it('drops a re-forged worked example the deck already carries', () => {
    // A worked example's card text is its title AND its problem, which is also
    // what the incoming batch is keyed on — but the prompt's front list names
    // only the title, so the route's own drop can never match the pair. The
    // client merge is the guard for it, and it needs the raw text: the seed and
    // the incoming card both capitalise "Compute", and only the raw comparison
    // can see that they agree.
    const base = report({
      declarativeFacts: [],
      conceptualMechanisms: [],
      practiceQuestions: [],
      workedExamples: [
        {
          id: 'e1',
          title: 'Free-water clearance and the medullary gradient',
          problem: 'Compute the clearance when urine flow is 2 mL/min and plasma osmolarity is 300 mOsm/kg',
          steps: ['a', 'b'],
        },
      ],
    });
    const addition = report({
      declarativeFacts: [],
      conceptualMechanisms: [],
      practiceQuestions: [],
      workedExamples: [
        {
          id: 'e2',
          title: 'Free-water clearance and the medullary gradient',
          problem: 'Compute the clearance when the urine flow is 2 mL/min and the plasma osmolarity is 300 mOsm/kg',
          steps: ['a', 'b'],
        },
      ],
    });

    const { added, dropped } = mergeAdditionalCards(base, addition);
    expect(dropped).toBe(1);
    expect(added).toBe(0);
  });

  it('still keeps a card whose NUMBER changed', () => {
    // The guard is capped by protected tokens on purpose: two cards that differ
    // in a quantity are two cards, and collapsing them is silent data loss.
    const base = report({
      declarativeFacts: [
        { id: 'f1', factStatement: 'The loop of Henle reaches 1,200 mOsm at the hairpin of the medulla.', clozeSuggestion: 'x' },
      ],
      conceptualMechanisms: [],
      practiceQuestions: [],
      workedExamples: [],
    });
    const addition = report({
      declarativeFacts: [
        { id: 'a', factStatement: 'The loop of Henle reaches 600 mOsm at the hairpin of the medulla.', clozeSuggestion: 'x' },
      ],
      conceptualMechanisms: [],
      practiceQuestions: [],
      workedExamples: [],
    });

    const { added, dropped } = mergeAdditionalCards(base, addition);
    expect(dropped).toBe(0);
    expect(added).toBe(1);
  });

  it('still keeps a card naming a different entity', () => {
    const base = report({
      declarativeFacts: [
        { id: 'f1', factStatement: 'The loop of Henle reabsorbs salt and water along the ascending limb', clozeSuggestion: 'x' },
      ],
      conceptualMechanisms: [],
      practiceQuestions: [],
      workedExamples: [],
    });
    const addition = report({
      declarativeFacts: [
        { id: 'a', factStatement: 'The distal tubule reabsorbs salt and water along its whole length', clozeSuggestion: 'x' },
      ],
      conceptualMechanisms: [],
      practiceQuestions: [],
      workedExamples: [],
    });

    const { added, dropped } = mergeAdditionalCards(base, addition);
    expect(dropped).toBe(0);
    expect(added).toBe(1);
  });
});

describe('near-duplicate detection', () => {
  it('collapses a re-worded card, however the wording shifted', () => {
    expect(
      similarity(
        'The loop of Henle can reach 1,200 mOsm at the hairpin of the medulla.',
        'The loop of Henle reaches 1,200 mOsm at the hairpin of the medulla.'
      )
    ).toBeGreaterThanOrEqual(0.8);
    expect(
      isNearDuplicate(
        'ADH inserts aquaporin-2 channels into the collecting duct membrane.',
        'ADH inserts aquaporin-2 channels in the collecting duct membrane.'
      )
    ).toBe(true);
  });

  it('never collapses a card whose quantity changed', () => {
    // A different number is a different fact (and the contradiction pass, not
    // this one, is what pairs those two up).
    expect(
      isNearDuplicate(
        'The half-life of the drug is 4 h in plasma.',
        'The half-life of the drug is 6 h in plasma.'
      )
    ).toBe(false);
  });

  it('never collapses a card whose named entity changed', () => {
    expect(
      isNearDuplicate('Drug A clears faster than Drug B in renal failure.', 'Drug C clears faster than Drug B in renal failure.')
    ).toBe(false);
  });

  it('never collapses a claim whose polarity flipped', () => {
    expect(
      isNearDuplicate(
        'The thick ascending limb reabsorbs sodium without water.',
        'The thick ascending limb reabsorbs sodium and water.'
      )
    ).toBe(false);
  });

  it('only treats long-enough text as comparable', () => {
    expect(isNearDuplicate('ADH acts on the duct', 'ADH acts on that duct')).toBe(false);
    expect(isNearDuplicate('ADH acts on the duct', 'ADH acts on the duct')).toBe(true);
  });

  it('counts a collapsed re-wording in the merge and says so in the source note', () => {
    const slides = report({
      declarativeFacts: [
        {
          id: 'f1',
          factStatement: 'The loop of Henle reaches 1,200 mOsm at the hairpin of the medulla.',
          clozeSuggestion: 'reaches {{1,200 mOsm}}',
        },
      ],
      conceptualMechanisms: [],
      practiceQuestions: [],
      workedExamples: [],
    });
    const lecture = report({
      declarativeFacts: [
        {
          id: 'f1',
          factStatement: 'The loop of Henle can reach 1,200 mOsm at the hairpin of the medulla.',
          clozeSuggestion: 'can reach {{1,200 mOsm}}',
        },
      ],
      conceptualMechanisms: [],
      practiceQuestions: [],
      workedExamples: [],
    });

    const merged = mergeSegregationReports([
      { source: textSource, report: slides },
      { source: pdfSource, report: lecture },
    ]);

    expect(merged.report.declarativeFacts).toHaveLength(1);
    expect(merged.dropped).toBe(1);
    expect(merged.sources[1].note).toContain('already in the deck');
    expect(merged.sources[1].note).toContain('near-duplicate');
  });

  it('reports an exact duplicate as a duplicate, not as a near-duplicate', () => {
    const merged = mergeSegregationReports([
      { source: textSource, report: report() },
      {
        source: pdfSource,
        report: report({
          declarativeFacts: [
            { id: 'dup', factStatement: 'the loop of henle reaches 1,200 mosm.', clozeSuggestion: 'dup' },
          ],
          conceptualMechanisms: [],
          practiceQuestions: [],
          workedExamples: [],
        }),
      },
    ]);
    expect(merged.sources[1].note).toContain('already in the deck');
    expect(merged.sources[1].note).not.toContain('near-duplicate');
  });

  it('indexes exact keys in O(1) and near-duplicates by comparison', () => {
    const index = createNearDuplicateIndex(['ADH inserts aquaporin-2 channels into the collecting duct membrane.']);
    expect(index.has('adh inserts aquaporin-2 channels into the collecting duct membrane.')).toBe(true);
    expect(index.has('ADH inserts aquaporin-2 channels in the collecting duct membrane.')).toBe(true);
    expect(index.has('Vasa recta run parallel to the loop of Henle in the medulla.')).toBe(false);
    expect(index.add('Vasa recta run parallel to the loop of Henle in the medulla.')).toBe(true);
    expect(index.add('vasa recta run parallel to the loop of henle in the medulla.')).toBe(false);
  });
});

describe('per-source yield sanity check', () => {
  it('names a source that under-produced for its size', () => {
    const thin = sourceYield(4200, 3);
    expect(thin.verdict).toBe('thin');
    expect(thin.expected).toBe(17);
    expect(thin.note).toBe('4,200 words in but only 3 cards out (about 17 expected)');
  });

  it('names a source that produced nothing, and says how much went in', () => {
    const silent = sourceYield(5000, 0);
    expect(silent.verdict).toBe('silent');
    expect(silent.note).toBe('5,000 words in, 0 cards out');
  });

  it('does not judge a source too small to judge', () => {
    expect(sourceYield(40, 1).verdict).toBe('unknown');
    expect(sourceYield(0, 0).verdict).toBe('unknown');
  });

  it('leaves a source that hit its volume target alone', () => {
    expect(sourceYield(500, 4).verdict).toBe('healthy');
    expect(sourceYield(500, 4).note).toBeUndefined();
  });

  it('carries the verdict onto the source row the forge renders', () => {
    const merged = mergeSegregationReports([
      {
        source: textSource,
        report: report({
          declarativeFacts: [{ id: 'f1', factStatement: 'The loop of Henle reaches 1,200 mOsm.', clozeSuggestion: 'x' }],
          conceptualMechanisms: [],
          practiceQuestions: [],
          workedExamples: [],
        }),
        words: 4200,
      },
    ]);
    expect(merged.sources[0].words).toBe(4200);
    expect(merged.sources[0].yield?.verdict).toBe('thin');
    expect(merged.sources[0].note).toContain('4,200 words in but only 1 card out');
  });

  it('formats counts deterministically, without a locale', () => {
    expect(formatCount(4200)).toBe('4,200');
    expect(formatCount(420)).toBe('420');
    expect(formatCount(1234567)).toBe('1,234,567');
  });
});

describe('coverage report', () => {
  it('names the requested sections that received no cards', () => {
    const want = { facts: true, mechanisms: true, drills: true, examples: false };
    const coverage = buildCoverageReport({ facts: 4, mechanisms: 2, drills: 0, examples: 0 }, want);

    expect(coverage.gaps).toEqual(['drills']);
    expect(coverage.note).toContain('0 cards for drills');
    expect(coverage.sections.find((s) => s.section === 'examples')?.requested).toBe(false);
  });

  it('confirms a complete deck instead of inventing a gap', () => {
    const coverage = buildCoverageReport(
      { facts: 4, mechanisms: 2, drills: 3, examples: 1 },
      { facts: true, mechanisms: true, drills: true, examples: true }
    );
    expect(coverage.gaps).toEqual([]);
    expect(coverage.note).toBe('Every requested section received cards.');
  });

  it('names the sources that contributed nothing at all', () => {
    const merged = mergeSegregationReports([
      { source: textSource, report: report() },
      { source: videoSource, report: null, note: 'No captions.' },
    ]);
    const coverage = buildCoverageReport(merged.counts, undefined, merged.sources);
    expect(coverage.silentSources).toEqual(['youtube:renal']);
  });

  it('names which source owns a gap instead of only which section is empty', () => {
    const want = { facts: true, mechanisms: true, drills: true, examples: true };
    const coverage = buildCoverageReport(
      { facts: 4, mechanisms: 2, drills: 0, examples: 3 },
      want,
      [
        { id: 'src_1', label: 'Lecture 4 slides', status: 'ok', counts: { facts: 4, mechanisms: 2, drills: 0, examples: 3 } },
        { id: 'src_2', label: 'Problem set 4', status: 'ok', counts: { facts: 0, mechanisms: 0, drills: 0, examples: 0 } },
        { id: 'src_3', label: 'youtube:renal', status: 'failed', counts: { facts: 0, mechanisms: 0, drills: 0, examples: 0 } },
      ] as any
    );

    expect(coverage.gaps).toEqual(['drills']);
    expect(coverage.gapOwners).toHaveLength(1);
    // The attribution is what turns "0 cards for drills" into an instruction:
    // both lectures came back without a single drill, so asking the same two
    // sources again is the wrong move.
    expect(coverage.gapOwners[0].section).toBe('drills');
    expect(coverage.gapOwners[0].silentIn).toEqual(['Lecture 4 slides', 'Problem set 4']);
    expect(coverage.gapOwners[0].note).toContain('no source produced drills');
    expect(coverage.gapOwners[0].note).toContain('ask again only if the material really contains it');
    // A source that failed before the model saw it is not blamed for a section:
    // it never got to answer, and its row already says so.
    expect(coverage.gapOwners[0].silentIn).not.toContain('youtube:renal');

    // With no source detail at all the gap is still reported, just unnamed.
    const bare = buildCoverageReport({ facts: 1, mechanisms: 0, drills: 0, examples: 0 }, want);
    expect(bare.gapOwners[0].silentIn).toEqual([]);
    expect(bare.gapOwners.map((gap) => gap.section)).toEqual(['mechanisms', 'drills', 'examples']);
    expect(bare.gapOwners[1].note).toBe(
      'no source produced drills — ask again only if the material really contains it'
    );
    expect(bare.gaps).toEqual(['mechanisms', 'drills', 'examples']);
  });

  it('carries source labels onto the merged deck so a split export can title pages', () => {
    const merged = mergeSegregationReports([
      { source: textSource, report: report() },
      { source: videoSource, report: null, note: 'No captions.' },
    ]);

    // Only the sources that were actually cut are named: a failed source has no
    // cards for a document to hold.
    expect(merged.report.sourceLabels).toEqual({ [textSource.id]: textSource.label });
  });

  it('keeps provenance when a grown deck is appended to', () => {
    const merged = mergeSegregationReports([{ source: textSource, report: report() }]);
    const more = mergeAdditionalCards(merged.report, {
      topic: merged.report.topic,
      declarativeFacts: [{ id: 'src_1-f9', factStatement: 'Loop diuretics block NKCC2.', clozeSuggestion: 'Loop diuretics block {{NKCC2}}.' }],
      conceptualMechanisms: [],
      practiceQuestions: [],
      workedExamples: [],
      sourceLabels: { src_1: 'Lecture 4 slides' },
    });

    expect(more.report.sourceLabels).toEqual(merged.report.sourceLabels);
    expect(more.report.declarativeFacts.some((f) => f.factStatement.includes('NKCC2'))).toBe(true);
  });
});

/**
 * The forge is where model output becomes a report, so the two new shapes have
 * to survive normalization (ids namespaced, caps enforced, a one-step "cascade"
 * rejected) and the merge (deduped by process/law, not shipped twice).
 */
describe('cascades and tripwires through the forge', () => {
  const raw = {
    topic: 'Cell Signalling',
    declarativeFacts: [],
    conceptualMechanisms: [],
    sequentialCascades: [
      { id: 'c1', process: 'GPCR signal transduction', steps: ['bind', 'exchange GDP for GTP', 'dissociate'] },
      { id: 'c2', process: 'Only one step', steps: ['alone'] },
    ],
    boundaryTripwires: [
      { id: 't1', law: "Ohm's law", breaksWhen: 'non-ohmic components', indicator: 'nonlinear I–V' },
      { id: 't2', law: '', breaksWhen: 'nothing' },
    ],
  };

  it('namespaces ids, keeps real cascades and drops a one-step sequence', () => {
    const report = normalizeSegregationReport(raw, 'src_2');
    expect(report?.sequentialCascades).toHaveLength(1);
    expect(report!.sequentialCascades![0].id).toBe('src_2-c1');
    expect(report!.sequentialCascades![0].steps).toHaveLength(3);
  });

  it('keeps only tripwires that name both the law and the failure', () => {
    const report = normalizeSegregationReport(raw, 'src_2');
    expect(report?.boundaryTripwires).toHaveLength(1);
    expect(report!.boundaryTripwires![0]).toMatchObject({
      id: 'src_2-t1',
      law: "Ohm's law",
      indicator: 'nonlinear I–V',
    });
  });

  it('carries a clinical correlate only when both halves are present', () => {
    const withPair = normalizeSegregationReport(
      {
        ...raw,
        declarativeFacts: [
          { id: 'f1', factStatement: 'A fact.', clozeSuggestion: 'A {{fact}}.', clinicalCorrelate: { question: 'Where?', answer: 'In practice.' } },
          { id: 'f2', factStatement: 'Another.', clozeSuggestion: 'Another {{fact}}.', clinicalCorrelate: { question: 'Where?' } },
        ],
      },
      'src_3'
    );
    expect(withPair!.declarativeFacts[0].clinicalCorrelate).toEqual({ question: 'Where?', answer: 'In practice.' });
    expect(withPair!.declarativeFacts[1].clinicalCorrelate).toBeUndefined();
  });

  it('does not treat a cascade-only report as empty', () => {
    const report = normalizeSegregationReport(
      { topic: 'T', declarativeFacts: [], conceptualMechanisms: [], sequentialCascades: raw.sequentialCascades },
      'src_4'
    );
    expect(report).not.toBeNull();
    expect(isEmptyForgeReport(report!)).toBe(false);
  });

  it('fingerprints the new cards so a re-forge does not re-ship them', () => {
    const report = normalizeSegregationReport(raw, 'src_2')!;
    const keys = deckCardKeys(report);
    expect(keys.has(dedupeKey('GPCR signal transduction'))).toBe(true);
    expect(keys.has(dedupeKey("Ohm's law"))).toBe(true);
    expect(collectCardFronts(report)).toContain('GPCR signal transduction');
  });
});
