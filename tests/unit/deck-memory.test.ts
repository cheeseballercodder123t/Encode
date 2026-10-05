// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  adoptDeckKeys,
  ankiCardKeys,
  cardKey,
  clearDeckMemory,
  deckSourceKey,
  describeDeckMemory,
  diffReportAgainstMemory,
  forgedSourceLedger,
  forgetDeckMemory,
  deckMemoryStoresEqual,
  keepOnlyFreshCards,
  knownKeysForTopic,
  memoryKeyForTopic,
  mergeDeckMemoryStores,
  recordDeckExport,
  recordDeckSources,
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

  it('fingerprints confusable pairs so only-new can drop them too', () => {
    // The pair ships a matrix card (id = the pair id) plus a vignette (id +
    // "-vignette"). Both were invisible to the memory before, so a re-forge
    // re-shipped them and the counts under-reported the deck.
    const withPair = report({
      confusablePairs: [
        {
          id: 'cp1',
          conceptA: 'SN1',
          conceptB: 'SN2',
          distinguishingAxis: 'Rate law',
          boundaryCondition: 'Tertiary substrate in a polar protic solvent',
          conceptAFeature: 'Unimolecular, racemization',
          conceptBFeature: 'Bimolecular, Walden inversion',
          diagnosticVignette: 'Cyanide in DMSO inverts the stereochemistry',
          diagnosticAnswer: 'SN2, polar aprotic solvent',
        },
      ],
    });

    // The memory keys exactly what the exporter writes for the pair.
    const exported = extractAnkiCardsFromSchema(null, withPair);
    expect(new Set(reportCardKeys(withPair))).toEqual(new Set(ankiCardKeys(exported)));

    // Both of the pair's cards count as one item, so it diffs like any other.
    const diff = diffReportAgainstMemory(withPair, knownKeysForTopic('Nobody'));
    expect(diff.freshIds).toContain('cp1');

    // Once the pair is known, only-new drops it — while a genuinely new fact
    // from the same forge survives.
    const known = new Set(reportCardKeys(withPair));
    const next = report({
      ...withPair,
      declarativeFacts: [
        ...withPair.declarativeFacts,
        { id: 'f3', factStatement: 'Fresh fact.', clozeSuggestion: '{{Fresh}} fact.' },
      ],
    });
    const settled = diffReportAgainstMemory(next, known);
    expect(settled.knownIds).toContain('cp1');
    expect(settled.freshIds).toEqual(['f3']);
    const trimmed = keepOnlyFreshCards(next, settled.freshIds);
    expect(trimmed.confusablePairs).toHaveLength(0);
    expect(trimmed.declarativeFacts.map((f) => f.id)).toEqual(['f3']);
  });
});

describe('merging the account\'s memory with this device\'s', () => {
  // The cloud mirror is what makes "already in your deck" true on the second
  // machine. The merge is a union (a device that was offline for a week must
  // not lose its memory to a device with one newer record), so the pure half is
  // pinned here — no Firebase, no network.
  const local = {
    'renal-physiology': {
      topic: 'Renal Physiology',
      keys: ['loop of henle reaches 1 200 mosm', 'adh inserts aquaporin 2'],
      updatedAt: 1000,
      exports: 2,
      lastSurface: 'anki',
    },
  };
  const remote = {
    'renal-physiology': {
      topic: 'Renal Physiology',
      keys: ['adh inserts aquaporin 2', 'vasa recta run parallel'],
      updatedAt: 2000,
      exports: 1,
      lastSurface: 'remnote',
    },
    'cardiac-cycle': {
      topic: 'Cardiac Cycle',
      keys: ['sa node fires first'],
      updatedAt: 1500,
      exports: 1,
    },
  };

  it('unions the fingerprints instead of letting the newer record win', () => {
    const merged = mergeDeckMemoryStores(local, remote);
    expect(new Set(merged['renal-physiology'].keys)).toEqual(
      new Set(['loop of henle reaches 1 200 mosm', 'adh inserts aquaporin 2', 'vasa recta run parallel'])
    );
    // The counter is the larger of the two, and the receipt comes from the
    // record that moved last.
    expect(merged['renal-physiology'].exports).toBe(2);
    expect(merged['renal-physiology'].lastSurface).toBe('remnote');
    expect(merged['cardiac-cycle'].keys).toEqual(['sa node fires first']);
  });

  it('keeps local-only and remote-only topics', () => {
    const merged = mergeDeckMemoryStores({ only: { topic: 'Only', keys: ['a'], updatedAt: 1, exports: 1 } }, {});
    expect(Object.keys(merged)).toEqual(['only']);
    const other = mergeDeckMemoryStores({}, { only: { topic: 'Only', keys: ['a'], updatedAt: 1, exports: 1 } });
    expect(Object.keys(other)).toEqual(['only']);
  });

  it('tells an unchanged memory from a grown one', () => {
    expect(deckMemoryStoresEqual(local, local)).toBe(true);
    expect(deckMemoryStoresEqual(local, mergeDeckMemoryStores(local, remote))).toBe(false);
    expect(deckMemoryStoresEqual(local, { ...local, extra: { topic: 'Extra', keys: ['x'], updatedAt: 1, exports: 1 } })).toBe(
      false
    );
  });

  it('unions the source ledger the same way as the fingerprints', () => {
    const ledgerA = [{ key: 'url:lecture 4', label: 'Lecture 4', cards: 12, at: 100 }];
    const ledgerB = [{ key: 'url:lecture 4', label: 'Lecture 4 (revised)', cards: 14, at: 200 }];
    const merged = mergeDeckMemoryStores(
      { t: { topic: 'T', keys: ['a'], updatedAt: 1, exports: 1, sources: ledgerA } },
      { t: { topic: 'T', keys: ['a'], updatedAt: 1, exports: 1, sources: ledgerB } }
    );
    // The fresher cut of the same lecture wins; the key is what makes them the
    // same source, so the ledger cannot grow one entry per revision.
    expect(merged.t.sources).toEqual([{ key: 'url:lecture 4', label: 'Lecture 4 (revised)', cards: 14, at: 200 }]);
    // And a ledger difference is a memory difference, or the cloud copy would
    // never be written back.
    expect(
      deckMemoryStoresEqual(
        { t: { topic: 'T', keys: ['a'], updatedAt: 1, exports: 1 } },
        { t: { topic: 'T', keys: ['a'], updatedAt: 1, exports: 1, sources: ledgerA } }
      )
    ).toBe(false);
  });
});

describe('the source ledger (memory-aware ingest)', () => {
  const slideSource = {
    kind: 'file' as const,
    label: 'lecture-4-slides.pdf',
  };
  const videoSource = { kind: 'youtube' as const, label: 'https://youtu.be/abc', url: 'https://youtu.be/abc' };
  const notesSource = {
    kind: 'text' as const,
    label: 'The loop of Henle reaches 1,200 mOsm…',
    notes: 'The loop of Henle reaches 1,200 mOsm at the hairpin. ' + 'x'.repeat(900),
  };

  it('fingerprints a source by what it is, not by the id this session minted', () => {
    // A URL is its own identity — the query string may carry tracking, but the
    // video is the same video.
    expect(deckSourceKey(videoSource)).toBe(deckSourceKey({ ...videoSource, label: 'renamed' }));
    // A file is its name: re-attaching the same PDF is the same ingest.
    expect(deckSourceKey(slideSource)).toBe(deckSourceKey({ ...slideSource }));
    expect(deckSourceKey(slideSource)).not.toBe(deckSourceKey({ kind: 'file', label: 'lecture-5-slides.pdf' }));
    // Notes are their opening words, so an edited tail is still one source and
    // a different lecture is not.
    const edited = deckSourceKey({
      ...notesSource,
      notes: notesSource.notes.slice(0, 400) + ' A completely rewritten second half.',
    });
    expect(edited).toBe(deckSourceKey(notesSource));
    expect(deckSourceKey({ kind: 'text', label: 'other', notes: 'Cardiac output is stroke volume times rate.' })).not.toBe(
      deckSourceKey(notesSource)
    );
  });

  it('remembers which sources built a deck, and finds them again by key', () => {
    recordDeckSources({
      topic: 'Renal Physiology',
      sources: [
        { key: deckSourceKey(slideSource), label: slideSource.label, cards: 12 },
        { key: deckSourceKey(videoSource), label: videoSource.label, cards: 4 },
      ],
      timestamp: 5000,
    });

    const ledger = forgedSourceLedger();
    expect(ledger.get(deckSourceKey(slideSource))).toMatchObject({
      label: 'lecture-4-slides.pdf',
      cards: 12,
      topic: 'Renal Physiology',
    });
    expect(ledger.get(deckSourceKey(videoSource))?.cards).toBe(4);
    // A source never cut here is not in the ledger: the panel only offers to
    // skip what it has actually seen.
    expect(ledger.has(deckSourceKey(notesSource))).toBe(false);
    // Recording the source alone must not claim any cards were exported.
    expect(describeDeckMemory('Renal Physiology')?.keys).toEqual([]);
  });

  it('updates a re-forged source in place instead of stacking entries', () => {
    recordDeckSources({
      topic: 'Renal Physiology',
      sources: [{ key: deckSourceKey(slideSource), label: slideSource.label, cards: 12 }],
      timestamp: 1000,
    });
    const after = recordDeckSources({
      topic: 'Renal Physiology',
      sources: [{ key: deckSourceKey(slideSource), cards: 15 }],
      timestamp: 9000,
    });
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ cards: 15, at: 9000, label: 'lecture-4-slides.pdf' });

    // The same lecture in a different topic is a second entry under its own
    // topic, and the ledger's freshness rule picks the newer cut.
    recordDeckSources({
      topic: 'Acid-Base',
      sources: [{ key: deckSourceKey(slideSource), label: 'lecture-4-slides.pdf', cards: 3 }],
      timestamp: 20000,
    });
    expect(forgedSourceLedger().get(deckSourceKey(slideSource))).toMatchObject({ cards: 3, topic: 'Acid-Base' });
  });

  it('forgets the ledger with the topic', () => {
    recordDeckSources({
      topic: 'Renal Physiology',
      sources: [{ key: deckSourceKey(slideSource), label: 'slides', cards: 1 }],
    });
    forgetDeckMemory('Renal Physiology');
    expect(forgedSourceLedger().size).toBe(0);
  });
});
