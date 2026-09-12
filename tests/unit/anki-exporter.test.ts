import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import JSZip from 'jszip';
import {
  calculateSM2,
  extractAnkiCardsFromSchema,
  extractWeakAnkiCardsFromSchema,
  generateAnkiTextDeck,
  generateAnkiTextDecks,
  generateAnkiApkgPackage,
  buildHierarchicalDeckName,
  clozeUserWording,
  normalizeClozeTermToAnki,
  computeActivityExportTags,
  AnkiCardItem,
} from '@/lib/anki-exporter';
import { SavedSchema, SegregationReport } from '@/lib/types';
import { classifyCardQuality, classifyDeckQuality } from '@/lib/fsrs-audit';

describe('calculateSM2', () => {
  it('starts a 1-day interval on the first successful rep', () => {
    const s = calculateSM2(4);
    expect(s.repetitions).toBe(1);
    expect(s.interval).toBe(1);
    expect(s.easeFactor).toBeCloseTo(2.5, 1);
  });

  it('moves to 6 days on the second rep, then multiplies by ease', () => {
    const first = calculateSM2(4);
    const second = calculateSM2(4, first);
    expect(second.interval).toBe(6);
    const third = calculateSM2(4, second);
    expect(third.interval).toBe(Math.round(6 * second.easeFactor));
  });

  it('resets interval and keeps repetitions at 0 after a failed grade', () => {
    const good = calculateSM2(5);
    const failed = calculateSM2(1, { ...good, repetitions: 3 });
    expect(failed.interval).toBe(1);
    expect(failed.repetitions).toBe(0);
    expect(failed.easeFactor).toBeLessThan(good.easeFactor);
  });

  it('never lets ease fall below 1.3 and clamps out-of-range grades', () => {
    let state = calculateSM2(3);
    for (let i = 0; i < 10; i++) state = calculateSM2(0, state);
    expect(state.easeFactor).toBeGreaterThanOrEqual(1.3);

    expect(calculateSM2(9).easeFactor).toBe(calculateSM2(5).easeFactor);
    expect(calculateSM2(-3).repetitions).toBe(0);
  });
});

describe('extractAnkiCardsFromSchema', () => {
  const report: SegregationReport = {
    topic: 'T',
    declarativeFacts: [
      { id: 'f1', factStatement: 'HCl is strong', clozeSuggestion: '{{c1::HCl}} is strong' },
      { id: 'f2', factStatement: 'HF is weak', clozeSuggestion: 'HF is weak', tag: 'Chemistry' },
    ],
    conceptualMechanisms: [
      {
        id: 'm1',
        conceptName: 'Osmosis',
        whatIsIt: 'water diffusion',
        whyItMatters: 'cell turgor',
        howItWorks: 'Osmosis moves water across a membrane',
        whatIfEdgeCase: 'Lysed cells',
        boundaryContrast: { confusableLookalike: 'Diffusion', distinguishingRule: 'Solvent vs solute' },
      },
    ],
  };

  const encodedSchema: Partial<SavedSchema> = {
    topicSummary: 'Action Potentials',
    activities: [
      {
        id: 'act_1',
        stageNumber: 1,
        title: 'Depolarization',
        framework: 'F',
        cognitiveGoal: 'G',
        contextSnippet: 'Voltage-gated Na+ opens at threshold.',
        keywords: ['sodium', 'threshold'],
        templateType: 'first_principles',
        prompt: 'What opens at threshold?',
        boundaryContrast: {
          confusableLookalike: 'Potassium channel',
          distinguishingRule: 'Na+ opens at -55mV; K+ later at +30mV.',
        },
        scaffold: {
          field1Label: 'a',
          field1Placeholder: 'b',
          field2Label: 'c',
          field2Placeholder: 'd',
          exampleAnswer: 'e',
        },
      },
    ],
    userResponses: {
      act_1: {
        field1: 'Sodium rushes in at the threshold.',
        field2: 'Because the gates are voltage-sensitive.',
        confidenceScore: 80,
        feynmanReview: { grade: 'good', score: 78, feedback: 'Solid.', xpBonus: 10 },
      },
    },
  };

  it('exports USER WORDING first (cloze user sentence, back carries own words)', () => {
    const cards = extractAnkiCardsFromSchema(encodedSchema, null);
    // main (user wording cloze) + mechanism pair + boundary trap
    expect(cards.length).toBe(3);

    const main = cards.find((c) => c.id === 'act-act_1-main')!;
    expect(main.back).toContain('Because the gates are voltage-sensitive');
    // keyword "sodium" was clozed into a REAL Anki deletion ({{c1::...}})
    expect(main.front).toMatch(/\{\{c1::Sodium\}\}/i);
    expect(main.isCloze).toBe(true);

    const boundary = cards.find((c) => c.id === 'act-act_1-boundary')!;
    expect(boundary.tags).toContain('BoundaryContrast');
  });

  it('tags a skipped/blank stage Unfinished (cue card only, no fake encoding)', () => {
    const blank = {
      ...encodedSchema,
      userResponses: {
        act_1: { field1: '', field2: '', skipped: true, readinessConfirmed: true },
      },
    };
    const cards = extractAnkiCardsFromSchema(blank, null);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe('act-act_1-cue');
    expect(cards[0].tags).toContain('Unfinished');
    expect(cards[0].tags).not.toContain('BoundaryContrast');
  });

  it('creates cloze cards for facts and 4-quadrant cards when no activities given', () => {
    const cards = extractAnkiCardsFromSchema(null, report);
    expect(cards).toHaveLength(2 + 3); // facts + causal/edgecase/boundary
    expect(cards[0].isCloze).toBe(true);
    expect(cards.map(c => c.id)).toEqual(['f1', 'f2', 'mech-0-causal', 'mech-0-edgecase', 'mech-0-boundary']);
    expect(cards.find(c => c.id === 'f2')!.tags).toContain('Chemistry');
  });

  it('prefers the short question front on facts and exports drills + example steps', () => {
    const rich: SegregationReport = {
      topic: 'T',
      declarativeFacts: [
        {
          id: 'f1',
          factStatement: 'The Na+/K+ pump moves 3 Na+ out and 2 K+ in per ATP.',
          question: 'Na+/K+ pump net ion movement?',
          clozeSuggestion: 'The Na+/K+ pump moves {{3 Na+ out, 2 K+ in}} per ATP.',
          memoryHook: '3 out, 2 in — like a 3-2 exit.',
        },
      ],
      conceptualMechanisms: [],
      practiceQuestions: [
        {
          id: 'pq1',
          question: 'Resting membrane potential value?',
          answer: '-70mV',
          whyCorrect: 'K+ leak sets it near EK.',
          distractors: ['-55mV', '+30mV'],
        },
      ],
      workedExamples: [
        {
          id: 'ex1',
          title: 'Worked example: Nernst check',
          problem: 'Given [K+]out 5 and [K+]in 140, estimate EK.',
          steps: ['Plug into Nernst.', 'Read off ≈ -89mV.'],
          takeaway: 'More gradient, more negative EK.',
        },
      ],
    };
    const cards = extractAnkiCardsFromSchema(null, rich);
    // 1 fact + 1 drill + 2 steps + 1 takeaway
    expect(cards).toHaveLength(5);

    const fact = cards.find(c => c.id === 'f1')!;
    expect(fact.front).toBe('Na+/K+ pump net ion movement?');
    expect(fact.back).toContain('3 out, 2 in');

    const drill = cards.find(c => c.id === 'pq1')!;
    expect(drill.front).toBe('Resting membrane potential value?');
    expect(drill.tags).toContain('PracticeQuestion');
    expect(drill.back).toContain('-55mV');

    expect(cards.find(c => c.id === 'ex1-step-1')!.back).toBe('Plug into Nernst.');
    expect(cards.find(c => c.id === 'ex1-takeaway')!.tags).toContain('WorkedExample');
  });

  it('falls back to AI context cards tagged Unfinished when the user encoded nothing', () => {
    const rawOnly: Partial<SavedSchema> = {
      activities: [
        {
          id: 'act_1',
          stageNumber: 1,
          title: 'Stage',
          framework: 'F',
          cognitiveGoal: 'G',
          contextSnippet: 'ctx',
          keywords: ['k1', 'k2'],
          templateType: 'first_principles',
          prompt: 'What {{c1::is}} it?',
          scaffold: {
            field1Label: 'a',
            field1Placeholder: 'b',
            field2Label: 'c',
            field2Placeholder: 'd',
            exampleAnswer: 'e',
          },
        },
      ],
    };
    const cards = extractAnkiCardsFromSchema(rawOnly, null);
    // cue card exported even without a response, tagged Unfinished
    expect(cards).toHaveLength(1);
    expect(cards[0].tags).toContain('Unfinished');
    expect(cards[0].tags).toContain('SchemaActivity');
  });

  it('returns an empty list when given nothing', () => {
    expect(extractAnkiCardsFromSchema(null, null)).toEqual([]);
  });
});

describe('extractWeakAnkiCardsFromSchema', () => {
  const schema: Partial<SavedSchema> = {
    topicSummary: 'Action Potentials',
    activities: [
      {
        id: 'act_1', stageNumber: 1, title: 'Depolarization', framework: 'F', cognitiveGoal: 'G',
        contextSnippet: 'Na+ opens at threshold.', keywords: ['sodium'], templateType: 'first_principles',
        prompt: 'What opens at threshold?', boundaryContrast: { confusableLookalike: 'Potassium', distinguishingRule: 'Na+ at -55mV' },
        scaffold: { field1Label: 'a', field1Placeholder: 'b', field2Label: 'c', field2Placeholder: 'd', exampleAnswer: 'e' },
      },
      {
        id: 'act_2', stageNumber: 2, title: 'Repolarization', framework: 'F', cognitiveGoal: 'G',
        contextSnippet: 'K+ channels open.', keywords: ['potassium'], templateType: 'first_principles',
        prompt: 'What happens next?', boundaryContrast: { confusableLookalike: 'Depolarization', distinguishingRule: 'K+ efflux' },
        scaffold: { field1Label: 'a', field1Placeholder: 'b', field2Label: 'c', field2Placeholder: 'd', exampleAnswer: 'e' },
      },
      {
        id: 'act_3', stageNumber: 3, title: 'Hyperpolarization', framework: 'F', cognitiveGoal: 'G',
        contextSnippet: 'Overshoot.', keywords: ['overshoot'], templateType: 'first_principles',
        prompt: 'Why overshoot?', boundaryContrast: { confusableLookalike: 'Resting', distinguishingRule: 'K+ stays open' },
        scaffold: { field1Label: 'a', field1Placeholder: 'b', field2Label: 'c', field2Placeholder: 'd', exampleAnswer: 'e' },
      },
    ],
    userResponses: {
      // act_1: mastered at score 90 — NOT weak
      act_1: { field1: 'Sodium rushes in.', field2: 'Voltage-gated.', readinessConfirmed: true, feynmanReview: { grade: 'mastered', score: 90, feedback: 'Good', xpBonus: 5 } },
      // act_2: needs_elaboration — weak
      act_2: { field1: 'Potassium.', field2: '', readinessConfirmed: true, feynmanReview: { grade: 'needs_elaboration', score: 45, feedback: 'Be precise', xpBonus: 0 } },
      // act_3: skipped — weak
      // (no response for act_3)
    },
  };

  it('filters to only weak stages (needs_elaboration + skipped)', () => {
    const weak = extractWeakAnkiCardsFromSchema(schema, null);
    const ids = weak.map(c => c.id);
    // act_1 (mastered) cards should be excluded; act_2 (needs_work) and act_3 cue should be included.
    expect(ids.some(id => id.startsWith('act-act_1-'))).toBe(false);
    expect(ids.some(id => id.startsWith('act-act_2-'))).toBe(true);
    expect(ids.some(id => id === 'act-act_3-cue')).toBe(true);
  });

  it('falls back to all cards when no activities are present', () => {
    const weak = extractWeakAnkiCardsFromSchema({ topicSummary: 'X', activities: [] }, null);
    expect(weak).toEqual([]);
  });

  it('treats low-scoring stages as weak', () => {
    const low: Partial<SavedSchema> = {
      topicSummary: 'T',
      activities: [{
        id: 'a1', stageNumber: 1, title: 'S', framework: 'F', cognitiveGoal: 'G', contextSnippet: 'c',
        keywords: ['k'], templateType: 'first_principles', prompt: 'p',
        scaffold: { field1Label: 'a', field1Placeholder: 'b', field2Label: 'c', field2Placeholder: 'd', exampleAnswer: 'e' },
      }],
      userResponses: {
        a1: { field1: 'x', field2: 'y', readinessConfirmed: true, feynmanReview: { grade: 'good', score: 30, feedback: '', xpBonus: 0 } },
      },
    };
    const weak = extractWeakAnkiCardsFromSchema(low, null);
    expect(weak.length).toBeGreaterThan(0);
  });
});

describe('clozeUserWording / computeActivityExportTags / buildHierarchicalDeckName', () => {
  it('clozes the first matching keyword in the user sentence', () => {
    expect(clozeUserWording('Sodium rushes in at the threshold.', ['threshold', 'sodium']))
      .toBe('Sodium rushes in at the {{threshold}}.');
  });

  it('normalizes bare {{Term}} markers into Anki {{cN::Term}} deletions', () => {
    expect(normalizeClozeTermToAnki('{{Sodium}} rushes in.'))
      .toBe('{{c1::Sodium}} rushes in.');
    expect(normalizeClozeTermToAnki('{{c2::Already}} indexed')).toBe('{{c2::Already}} indexed');
  });

  it('clozes the second half when no keyword matches', () => {
    const out = clozeUserWording('one two three four five six', ['zzz']);
    expect(out).toContain('{{');
  });

  it('leaves already-clozed text untouched', () => {
    expect(clozeUserWording('{{c1::HCl}} is strong', ['HCl'])).toBe('{{c1::HCl}} is strong');
  });

  it('tags needs_elaboration stages as Unfinished', () => {
    const tags = computeActivityExportTags({
      field1: 'x',
      field2: 'y',
      feynmanReview: { grade: 'needs_elaboration', score: 40, feedback: 'thin', xpBonus: 0 },
    });
    expect(tags).toContain('Unfinished');
  });

  it('builds a hierarchical deck name from the topic', () => {
    expect(buildHierarchicalDeckName('Action Potentials')).toBe('DeepEncode::Action Potentials');
    expect(buildHierarchicalDeckName('')).toBe('DeepEncode');
  });
});

describe('generateAnkiApkgPackage (declarative, FSRS-perfect)', () => {
  it('builds a zip with a real collection.anki2 that sqlite3 validates (schema-11)', async () => {
    const apkgSchema: Partial<SavedSchema> = {
      topicSummary: 'Action Potentials',
      activities: [
        {
          id: 'act_apkg',
          stageNumber: 1,
          title: 'Depolarization',
          framework: 'F',
          cognitiveGoal: 'G',
          contextSnippet: 'Na+ opens at threshold.',
          keywords: ['sodium'],
          templateType: 'first_principles',
          prompt: 'What opens at threshold?',
          boundaryContrast: {
            confusableLookalike: 'K+ channel',
            distinguishingRule: 'Na+ opens at -55mV.',
          },
          scaffold: {
            field1Label: 'a',
            field1Placeholder: 'b',
            field2Label: 'c',
            field2Placeholder: 'd',
            exampleAnswer: 'e',
          },
        },
      ],
      userResponses: {
        act_apkg: { field1: 'Sodium rushes in.', field2: 'Voltage flips the gates.' },
      },
    };
    const cards = extractAnkiCardsFromSchema(apkgSchema, null);
    const blob = await generateAnkiApkgPackage(cards, 'DeepEncode::Action Potentials');
    expect(blob.size).toBeGreaterThan(0);

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const bytes = await zip.file('collection.anki2')!.async('uint8array');
    expect(bytes).toBeDefined();
    // Text-deck replaced by a real .apkg : no #separator import header.
    expect(await zip.file('deck.txt')?.async('string')).toBeUndefined();
    expect(await zip.file('media')?.async('string')).toBe('{}');

    let python = '';
    for (const candidate of ['python', 'python3', 'py']) {
      const probe = spawnSync(candidate, ['-c', 'import sqlite3; print("ok")'], { encoding: 'utf8' });
      if (probe.status === 0 && probe.stdout.includes('ok')) {
        python = candidate;
        break;
      }
    }
    if (!python) {
      console.warn('Python with sqlite3 not available : skipping declarative apkg cross-validation.');
      return;
    }

    const dir = mkdtempSync(join(tmpdir(), 'anki-decl-'));
    const path = join(dir, 'collection.anki2');
    writeFileSync(path, bytes);
    try {
      const script = `
import sqlite3, json
conn = sqlite3.connect(${JSON.stringify(path)})
cur = conn.cursor()
assert cur.execute('PRAGMA integrity_check').fetchall() == [('ok',)], 'integrity'
assert cur.execute('PRAGMA user_version').fetchone()[0] == 11, 'user_version'
col = cur.execute('SELECT models, decks, dconf FROM col WHERE id=1').fetchone()
models = json.loads(col[0])
names = {m['name']: m for m in models.values()}
assert 'DeepEncode Basic' in names and 'DeepEncode Cloze' in names, names
assert names['DeepEncode Basic']['type'] == 0
assert names['DeepEncode Cloze']['type'] == 1  # real cloze model, not Basic-with-braces
dconf = json.loads(col[2])
cfg = dconf['1']
# Anki's DeckConfig deserializer requires every key a real export writes :
# omitting any one fails with "decoding deck config: missing field <key>"
# (we previously hit 'mod', then 'autoplay').
expected_top = {'id', 'mod', 'name', 'usn', 'autoplay', 'timer', 'replayq', 'maxTaken', 'new', 'rev', 'lapse', 'dyn'}
assert expected_top <= set(cfg.keys()), sorted(expected_top - set(cfg.keys()))
assert isinstance(cfg['mod'], int) and cfg['mod'] > 0, cfg
assert isinstance(cfg['autoplay'], bool), cfg
expected_new = {'bury', 'delays', 'initialFactor', 'ints', 'order', 'perDay', 'separate'}
assert expected_new <= set(cfg['new'].keys()), sorted(expected_new - set(cfg['new'].keys()))
expected_rev = {'bury', 'ease4', 'fuzz', 'hardFactor', 'ivlFct', 'maxIvl', 'minSpace', 'perDay'}
assert expected_rev <= set(cfg['rev'].keys()), sorted(expected_rev - set(cfg['rev'].keys()))
expected_lapse = {'delays', 'leechAction', 'leechFails', 'minInt', 'mult'}
assert expected_lapse <= set(cfg['lapse'].keys()), sorted(expected_lapse - set(cfg['lapse'].keys()))
decks = json.loads(col[1])
deck_names = [d['name'] for d in decks.values()]
assert 'DeepEncode::Action Potentials' in deck_names, deck_names
notes = cur.execute('SELECT mid, flds, tags FROM notes').fetchall()
cards = cur.execute('SELECT count(*) FROM cards').fetchone()[0]
assert cards == len(notes), (len(notes), cards)
cloze_mid = next(mid for mid, m in models.items() if m['name'] == 'DeepEncode Cloze')
assert any(mid == int(cloze_mid) for mid, flds, tags in notes), notes
assert any('Unfinished' not in tags for mid, flds, tags in notes), notes
print('PYTHON_OK')
`;
      const result = spawnSync(python, ['-c', script], { encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr || result.stdout);
      expect(result.stdout).toContain('PYTHON_OK');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('generateAnkiTextDecks / generateAnkiTextDeck', () => {
  it('emits a cloze deck with real deletions and 3 tab-separated columns', () => {
    const cards = extractAnkiCardsFromSchema(null, {
      topic: 'T',
      declarativeFacts: [{ id: 'f1', factStatement: 'a\tb', clozeSuggestion: '{{c1::a}}' }],
      conceptualMechanisms: [],
    });
    const decks = generateAnkiTextDecks(cards, 'My\nDeck');
    expect(decks.cloze).toBeDefined();
    expect(decks.basic).toBeUndefined();

    const lines = decks.cloze!.split('\n');
    expect(lines[0]).toBe('#separator:tab');
    expect(lines[3]).toBe('#deck:My Deck');
    expect(lines[4]).toBe('#notetype:Cloze');
    expect(lines[6]).toContain('{{c1::a}}');
    expect(lines[6].split('\t')).toHaveLength(3);
  });

  it('splits mixed decks into separate Basic + Cloze files (no "cloze not found")', () => {
    const cards: AnkiCardItem[] = [
      {
        id: 'cloze1', front: 'The {{c1::Na/K pump}} moves 3 out', back: '3 Na out', isCloze: true,
        tags: ['DeepEncode'], sm2: { repetitions: 0, interval: 1, easeFactor: 2.5, nextReviewTimestamp: 0 },
      },
      {
        id: 'basic1', front: 'Resting potential?', back: '-70mV', isCloze: false,
        tags: ['DeepEncode'], sm2: { repetitions: 0, interval: 1, easeFactor: 2.5, nextReviewTimestamp: 0 },
      },
    ];
    const decks = generateAnkiTextDecks(cards, 'Blend');
    expect(decks.cloze).toBeDefined();
    expect(decks.basic).toBeDefined();
    expect(decks.cloze!).toContain('#notetype:Cloze');
    expect(decks.basic!).toContain('#notetype:Basic');
    // Cloze file never contains the plain card
    expect(decks.cloze!).not.toContain('Resting potential?');
    // Basic file never contains cloze deletions text
    expect(decks.basic!).toContain('Resting potential?');
  });

  it('legacy single-file wrapper returns cloze deck when present', () => {
    const cards: AnkiCardItem[] = [
      {
        id: 'cloze1', front: 'The {{c1::Na/K pump}} moves 3 out', back: '3 Na out', isCloze: true,
        tags: ['DeepEncode'], sm2: { repetitions: 0, interval: 1, easeFactor: 2.5, nextReviewTimestamp: 0 },
      },
    ];
    const deck = generateAnkiTextDeck(cards, 'Deck');
    expect(deck).toContain('#notetype:Cloze');
  });
});
