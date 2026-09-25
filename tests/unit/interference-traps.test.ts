import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadInterferenceTraps,
  saveInterferenceTrap,
  clearInterferenceTraps,
} from '@/lib/interference-traps';
import { buildInterferenceTrapCards, withInterferenceTraps } from '@/lib/anki-exporter';
import { AnkiCardItem } from '@/lib/anki-exporter';

/** Minimal localStorage so the store can be exercised in the node environment. */
function stubWindow() {
  const store = new Map<string, string>();
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
  return store;
}

const trap = (over: Partial<Parameters<typeof saveInterferenceTrap>[0]> = {}) => ({
  topic: 'Action Potentials',
  question: 'If the radius doubles, what happens to flow?',
  committedAnswer: 'Doubles',
  correctAnswer: 'Increases 16x',
  confidenceTier: 'bet' as const,
  flawExplanation: 'Flow scales with the fourth power of radius.',
  cardFront: 'Why does doubling a vessel radius increase flow 16x rather than 2x?',
  cardBack: 'Resistance falls with {{c1::the fourth power of radius}} (Poiseuille).',
  ...over,
});

describe('interference trap store', () => {
  afterEach(() => {
    delete (globalThis as any).window;
  });

  it('returns nothing (and stays safe) with no browser storage', () => {
    expect(loadInterferenceTraps()).toEqual([]);
    const entry = saveInterferenceTrap(trap());
    expect(entry.id).toMatch(/^trap-/);
    expect(loadInterferenceTraps()).toEqual([]);
  });

  it('persists the newest trap first', () => {
    stubWindow();
    saveInterferenceTrap(trap({ cardFront: 'First' }), 1);
    saveInterferenceTrap(trap({ cardFront: 'Second' }), 2);
    const all = loadInterferenceTraps();
    expect(all.map((t) => t.cardFront)).toEqual(['Second', 'First']);
  });

  it('de-duplicates on the card front instead of stacking repeats', () => {
    stubWindow();
    saveInterferenceTrap(trap({ cardFront: 'Same front' }), 1);
    saveInterferenceTrap(trap({ cardFront: '  same FRONT ' }), 2);
    expect(loadInterferenceTraps()).toHaveLength(1);
  });

  it('clears', () => {
    stubWindow();
    saveInterferenceTrap(trap(), 1);
    clearInterferenceTraps();
    expect(loadInterferenceTraps()).toEqual([]);
  });

  it('survives a corrupt payload', () => {
    const store = stubWindow();
    store.set('deepencode_interference_traps_v1', '{not json');
    expect(loadInterferenceTraps()).toEqual([]);
  });
});

describe('interference trap cards', () => {
  beforeEach(() => {
    stubWindow();
  });
  afterEach(() => {
    delete (globalThis as any).window;
  });

  it('builds a cloze card tagged by confidence tier', () => {
    saveInterferenceTrap(trap({ confidenceTier: 'bet' }), 1);
    const cards = buildInterferenceTrapCards();
    expect(cards).toHaveLength(1);
    expect(cards[0].isCloze).toBe(true);
    expect(cards[0].tags).toContain('InterferenceTrap');
    expect(cards[0].tags).toContain('Confidence:bet');
  });

  it('treats a back with no deletion as a basic card', () => {
    saveInterferenceTrap(trap({ cardBack: 'No deletion here at all.' }), 1);
    expect(buildInterferenceTrapCards()[0].isCloze).toBe(false);
  });

  it('ships traps at the FRONT of the deck', () => {
    saveInterferenceTrap(trap(), 1);
    const plain: AnkiCardItem = {
      id: 'plain',
      front: 'f',
      back: 'b',
      isCloze: false,
      tags: ['DeepEncode'],
      sm2: { repetitions: 0, interval: 1, easeFactor: 2.5, nextReviewTimestamp: 0 },
    };
    const deck = withInterferenceTraps([plain]);
    expect(deck).toHaveLength(2);
    expect(deck[0].tags).toContain('InterferenceTrap');
    expect(deck[1].id).toBe('plain');
  });

  it('is a no-op when there are no traps', () => {
    const plain: AnkiCardItem = {
      id: 'plain',
      front: 'f',
      back: 'b',
      isCloze: false,
      tags: ['DeepEncode'],
      sm2: { repetitions: 0, interval: 1, easeFactor: 2.5, nextReviewTimestamp: 0 },
    };
    expect(withInterferenceTraps([plain])).toHaveLength(1);
  });
});
