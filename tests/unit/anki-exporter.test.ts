import { describe, it, expect } from 'vitest';
import {
  calculateSM2,
  extractAnkiCardsFromSchema,
  generateAnkiTextDeck,
} from '@/lib/anki-exporter';
import { SavedSchema, SegregationReport } from '@/lib/types';

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

  it('creates cloze cards for facts and 4-quadrant cards for mechanisms', () => {
    const cards = extractAnkiCardsFromSchema(null, report);
    expect(cards).toHaveLength(2 + 3); // facts + causal/edgecase/boundary
    expect(cards[0].isCloze).toBe(true);
    expect(cards.map(c => c.id)).toEqual(['f1', 'f2', 'mech-0-causal', 'mech-0-edgecase', 'mech-0-boundary']);
    expect(cards.find(c => c.id === 'f2')!.tags).toContain('Chemistry');
  });

  it('falls back to schema activities when no report is given', () => {
    const schema: Partial<SavedSchema> = {
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
    const cards = extractAnkiCardsFromSchema(schema, null);
    expect(cards).toHaveLength(1);
    expect(cards[0].isCloze).toBe(true);
    expect(cards[0].tags).toContain('SchemaActivity');
  });

  it('returns an empty list when given nothing', () => {
    expect(extractAnkiCardsFromSchema(null, null)).toEqual([]);
  });
});

describe('generateAnkiTextDeck', () => {
  it('emits anki import headers and tab-separated rows', () => {
    const cards = extractAnkiCardsFromSchema(null, {
      topic: 'T',
      declarativeFacts: [{ id: 'f1', factStatement: 'a\tb', clozeSuggestion: '{{c1::a}}' }],
      conceptualMechanisms: [],
    });
    const deck = generateAnkiTextDeck(cards, 'My\nDeck');
    const lines = deck.split('\n');
    expect(lines[0]).toBe('#separator:tab');
    expect(lines[3]).toBe('#deck:My Deck');
    expect(lines[3]).toBe('#deck:My Deck');
    expect(lines[6]).not.toContain('\t\t');
    expect(lines[6].split('\t')).toHaveLength(4);
  });
});
