// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  adoptDeckKeys,
  ankiCardKeys,
  cardKey,
  clearDeckMemory,
  describeDeckMemory,
  diffReportAgainstMemory,
  forgetDeckMemory,
  keepOnlyFreshCards,
  knownKeysForTopic,
  memoryKeyForTopic,
  recordDeckExport,
  reportCardKeys,
} from '@/lib/deck-memory';
import { SegregationReport } from '@/lib/types';
import { extractAnkiCardsFromSchema } from '@/lib/anki-exporter';

function report(overrides: Partial<SegregationReport> = {}): SegregationReport {
  return {
    topic: 'Renal Physiology',
    declarativeFacts: [
      {
        id: 'f1',
        factStatement: 'The loop of Henle reaches 1,200 mOsm at the hairpin.',
        clozeSuggestion: 'The loop of Henle reaches {{1,200 mOsm}} at the hairpin.',
      },
      { id: 'f2', factStatement: 'ADH inserts aquaporin-2.', clozeSuggestion: 'ADH inserts {{aquaporin-2}}.' },
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
    workedExamples: [{ id: 'e1', title: 'Free-water clearance', problem: 'Compute CH2O.', steps: ['a'] }],
    ...overrides,
  };
}

beforeEach(() => clearDeckMemory());

describe('fingerprints', () => {
  it('normalizes case, punctuation and cloze markers', () => {
    expect(cardKey('The Loop of Henle, reaches 1,200 mOsm!')).toBe('the loop of henle reaches 1 200 mosm');
    expect(cardKey('ADH inserts {{aquaporin-2}}.')).toBe(cardKey('ADH inserts aquaporin-2.'));
  });

  /**
   * The memory counts cards the EXPORTER writes, not the report's raw fields:
   * a mechanism ships several cards, an example one per step. This is what
   * makes a fingerprint read back out of Anki match the same card forged here.
   */
  it('keys exactly the fronts the Anki exporter writes', () => {
    const exported = extractAnkiCardsFromSchema(null, report());
    expect(reportCardKeys(report())).toHaveLength(exported.length);
    expect(new Set(reportCardKeys(report()))).toEqual(new Set(ankiCardKeys(exported)));
  });

  it('still fingerprints a plain fact front without its cloze markers', () => {
    const keys = reportCardKeys(report());
    expect(keys).toContain(cardKey('The loop of Henle reaches {{c1::1,200 mOsm}} at the hairpin.'));
    expect(keys).toContain(cardKey('Which limb pumps salt out?'));
  });

  it('fingerprints a fact by its short question when the model supplies one', () => {
    const withQuestion = report({
      declarativeFacts: [
        { id: 'f1', factStatement: 'Full fact text.', clozeSuggestion: 'Full {{fact}} text.', question: 'Short prompt?' },
      ],
      conceptualMechanisms: [],
      practiceQuestions: [],
      workedExamples: [],
    });
    expect(reportCardKeys(withQuestion)).toEqual([cardKey('Short prompt?')]);
  });

  it('derives the topic key from the topic text', () => {
    expect(memoryKeyForTopic('Renal Physiology')).toBe('renal physiology');
    expect(memoryKeyForTopic('')).toBe('forged-deck');
  });
});

describe('recording and diffing', () => {
  it('remembers an exported deck and reports the whole deck as known afterwards', () => {
    recordDeckExport({ topic: 'Renal Physiology', keys: reportCardKeys(report()), surface: 'anki' });
    const diff = diffReportAgainstMemory(report(), knownKeysForTopic('Renal Physiology'));
    expect(diff.known).toBe(5);
    expect(diff.fresh).toBe(0);
    expect(diff.knownIds).toEqual(['f1', 'f2', 'm1', 'q1', 'e1']);
  });

  it('counts an item as known only when every card it ships is known', () => {
    // Half a mechanism is not a mechanism: shipping it would drop the rest.
    const exported = extractAnkiCardsFromSchema(null, report());
    const mechFronts = exported.filter((c) => c.id.startsWith('mech-0-')).map((c) => cardKey(c.front));
    const partial = new Set(reportCardKeys(report()).filter((k) => !mechFronts.includes(k)));
    const diff = diffReportAgainstMemory(report(), partial);
    expect(diff.freshIds).toEqual(['m1']);
    expect(diff.knownIds).toEqual(['f1', 'f2', 'q1', 'e1']);
  });

  it('adopts Anki fingerprints without counting them as an export', () => {
    adoptDeckKeys({ topic: 'Renal Physiology', keys: reportCardKeys(report()) });
    const record = describeDeckMemory('Renal Physiology');
    expect(record!.exports).toBe(0);
    expect(record!.lastSurface).toBeUndefined();
    expect(diffReportAgainstMemory(report(), knownKeysForTopic('Renal Physiology')).known).toBe(5);
  });

  it('reports only the fingerprints that were new when adopting', () => {
    const keys = reportCardKeys(report());
    expect(adoptDeckKeys({ topic: 'Renal Physiology', keys: keys.slice(0, 2) })).toBe(2);
    expect(adoptDeckKeys({ topic: 'Renal Physiology', keys })).toBe(keys.length - 2);
    expect(adoptDeckKeys({ topic: 'Renal Physiology', keys })).toBe(0);
  });

  it('ignores an empty adoption and never invents a record for one', () => {
    expect(adoptDeckKeys({ topic: 'Renal Physiology', keys: [] })).toBe(0);
    expect(adoptDeckKeys({ topic: '', keys: ['x'] })).toBe(0);
    expect(describeDeckMemory('Renal Physiology')).toBeNull();
  });

  it('counts only the cards that are actually new', () => {
    recordDeckExport({ topic: 'Renal Physiology', keys: reportCardKeys(report()), surface: 'anki' });
    const next = report({
      declarativeFacts: [
        ...report().declarativeFacts,
        { id: 'f3', factStatement: 'Vasa recta run parallel to the loop.', clozeSuggestion: '{{Vasa recta}} run parallel.' },
      ],
    });
    const diff = diffReportAgainstMemory(next, knownKeysForTopic('Renal Physiology'));
    expect(diff.fresh).toBe(1);
    expect(diff.freshIds).toEqual(['f3']);
    expect(diff.known).toBe(5);
  });

  it('keeps memory per topic, so another subject is untouched', () => {
    recordDeckExport({ topic: 'Renal Physiology', keys: reportCardKeys(report()), surface: 'anki' });
    expect(knownKeysForTopic('Pharmacology').size).toBe(0);
    expect(diffReportAgainstMemory(report(), knownKeysForTopic('Pharmacology')).fresh).toBe(5);
  });

  it('unions keys instead of duplicating them on a re-export', () => {
    const keys = reportCardKeys(report());
    recordDeckExport({ topic: 'Renal Physiology', keys, surface: 'anki' });
    const again = recordDeckExport({
      topic: 'Renal Physiology',
      keys: reportCardKeys(report()),
      surface: 'RemNote push',
    });
    expect(again!.keys).toHaveLength(keys.length);
    expect(again!.exports).toBe(2);
    expect(again!.lastSurface).toBe('RemNote push');
    expect(describeDeckMemory('Renal Physiology')!.exports).toBe(2);
  });

  it('accepts already-extracted Anki cards as well as a report', () => {
    recordDeckExport({ topic: 'Renal Physiology', keys: ankiCardKeys([{ front: 'Which limb pumps salt out?' }]) });
    const diff = diffReportAgainstMemory(report(), knownKeysForTopic('Renal Physiology'));
    expect(diff.knownIds).toEqual(['q1']);
    expect(diff.fresh).toBe(4);
  });

  it('ignores an empty export and an empty topic', () => {
    expect(recordDeckExport({ topic: 'Renal Physiology', keys: [] })).toBeNull();
    expect(recordDeckExport({ topic: '   ', keys: ['x'] })).toBeNull();
  });

  it('forgets a topic on request', () => {
    recordDeckExport({ topic: 'Renal Physiology', keys: reportCardKeys(report()) });
    forgetDeckMemory('Renal Physiology');
    expect(knownKeysForTopic('Renal Physiology').size).toBe(0);
    expect(describeDeckMemory('Renal Physiology')).toBeNull();
  });
});

describe('shipping only the new cards', () => {
  it('drops exactly the known cards from every section', () => {
    recordDeckExport({ topic: 'Renal Physiology', keys: reportCardKeys(report()) });
    const next = report({
      declarativeFacts: [
        ...report().declarativeFacts,
        { id: 'f3', factStatement: 'Fresh fact.', clozeSuggestion: '{{Fresh}} fact.' },
      ],
      practiceQuestions: [
        { id: 'q1', question: 'Which limb pumps salt out?', answer: 'Thick ascending limb' },
        { id: 'q2', question: 'Which hormone inserts aquaporin-2?', answer: 'ADH' },
      ],
    });
    const diff = diffReportAgainstMemory(next, knownKeysForTopic('Renal Physiology'));
    const trimmed = keepOnlyFreshCards(next, diff.freshIds);

    expect(trimmed.declarativeFacts.map((f) => f.id)).toEqual(['f3']);
    expect(trimmed.practiceQuestions!.map((q) => q.id)).toEqual(['q2']);
    expect(trimmed.conceptualMechanisms).toHaveLength(0);
    expect(trimmed.workedExamples).toHaveLength(0);
  });

  it('returns the deck untouched when there is nothing fresh to keep', () => {
    const original = report();
    expect(keepOnlyFreshCards(original, [])).toBe(original);
  });
});
