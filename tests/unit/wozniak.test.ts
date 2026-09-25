import { describe, it, expect } from 'vitest';
import {
  splitOneIdea,
  buildSymmetricCard,
  sanitizeForWozniak,
  WOZNIAK_WORD_CEILING,
} from '@/lib/wozniak';
import { AnkiCardItem } from '@/lib/anki-exporter';

function card(overrides: Partial<AnkiCardItem> & { id?: string }): AnkiCardItem {
  return {
    id: overrides.id || 'c1',
    front: 'What is X?',
    back: 'X is Y',
    isCloze: false,
    tags: ['DeepEncode'],
    sm2: { repetitions: 0, interval: 0, easeFactor: 2.5, nextReviewTimestamp: 0 },
    ...overrides,
  } as AnkiCardItem;
}

describe('wozniak 1-idea rule', () => {
  it('splits a back joined by a clause-level "and" into two cards', () => {
    const c = card({
      back: 'The membrane crossed threshold and voltage-gated channels opened rapidly.',
    });
    const [a, b] = splitOneIdea(c);
    expect(a.back).toContain('threshold');
    expect(b.back).toContain('channels');
    expect(a.tags).toContain('WozniakSplit');
    expect(b.tags).toContain('WozniakSplit');
  });

  it('does not split a short "Na and K" list', () => {
    const c = card({ back: 'Sodium and potassium' });
    expect(splitOneIdea(c)).toHaveLength(1);
  });

  it('passes through cards without "and"', () => {
    const c = card({ back: 'Threshold opens the gate.' });
    const out = splitOneIdea(c);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('c1');
  });
});

describe('wozniak two-way cloze symmetry', () => {
  it('builds a reverse card clozing the effect of a causal link', () => {
    const c = card({ back: 'Depolarization causes voltage-gated channels to open' });
    const rev = buildSymmetricCard(c);
    expect(rev).not.toBeNull();
    expect(rev!.front).toContain('Reverse direction');
    expect(rev!.front).toContain('{{c1::');
    expect(rev!.tags).toContain('TwoWayCloze');
  });

  it('returns null for non-causal text', () => {
    expect(buildSymmetricCard(card({ back: 'The mitochondrion has two membranes' }))).toBeNull();
  });

  it('uses a cloze front body as the causal source', () => {
    const c = card({
      isCloze: true,
      front: '{{c1::Threshold crossing}} triggers the action potential',
      back: 'mechanism',
    });
    const rev = buildSymmetricCard(c);
    expect(rev).not.toBeNull();
    expect(rev!.front).toContain('Threshold crossing');
  });
});

describe('wozniak 20-word ceiling', () => {
  it('holds back a non-cloze card over the ceiling', () => {
    const longBack = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ');
    const res = sanitizeForWozniak([card({ back: longBack })], { addSymmetric: false });
    expect(res.cards).toHaveLength(0);
    expect(res.heldBack).toHaveLength(1);
    expect(res.heldBack[0].reason).toMatch(/33 words/); // 30 back + "What is X?" front
  });

  it('keeps a card exactly at the ceiling', () => {
    const words = Array.from({ length: WOZNIAK_WORD_CEILING - 3 }, (_, i) => `w${i}`).join(' ');
    const res = sanitizeForWozniak([card({ front: 'Prompt?', back: words })], { addSymmetric: false });
    expect(res.cards).toHaveLength(1);
    expect(res.heldBack).toHaveLength(0);
  });

  it('auto-splits a dense cloze via the existing splitter before holding back', () => {
    // Build a cloze front over the limit with a mid-sentence period so
    // splitDenseCloze has a sentence boundary to work with.
    const first = Array.from({ length: 14 }, (_, i) => `a${i}`).join(' ');
    const second = Array.from({ length: 14 }, (_, i) => `b${i}`).join(' ');
    const c = card({ isCloze: true, front: `${first} {{c1::threshold}}. ${second}` });
    const res = sanitizeForWozniak([c], { addSymmetric: false });
    // Splitter produces two halves; each may or may not fit, but the total
    // exported + held must account for both halves.
    expect(res.cards.length + res.heldBack.length).toBe(2);
  });
});

describe('wozniak curated-card exemption', () => {
  const longBack = Array.from({ length: 26 }, (_, i) => `w${i}`).join(' ');

  it('passes a protected card through untouched (no split, no symmetry, no ceiling)', () => {
    const c = card({
      id: 'trap',
      // Joins two ideas AND blows the ceiling : both rules must be bypassed.
      back: `${longBack} and ${longBack}`,
      tags: ['DeepEncode', 'InterferenceTrap'],
    });
    const res = sanitizeForWozniak([c], { protectTag: 'InterferenceTrap' });
    expect(res.cards).toHaveLength(1);
    expect(res.cards[0].id).toBe('trap');
    expect(res.heldBack).toHaveLength(0);
    expect(res.addedSymmetric).toBe(0);
  });

  it('still enforces the rules on unprotected cards in the same deck', () => {
    const res = sanitizeForWozniak(
      [card({ id: 'trap', tags: ['InterferenceTrap'], back: longBack }), card({ id: 'plain', back: longBack })],
      { addSymmetric: false, protectTag: 'InterferenceTrap' }
    );
    expect(res.cards.map((c) => c.id)).toEqual(['trap']);
    expect(res.heldBack).toHaveLength(1);
    expect(res.heldBack[0].card.id).toBe('plain');
  });

  it('behaves exactly as before when no protectTag is given', () => {
    const res = sanitizeForWozniak([card({ id: 'trap', tags: ['InterferenceTrap'], back: longBack })], {
      addSymmetric: false,
    });
    expect(res.cards).toHaveLength(0);
    expect(res.heldBack).toHaveLength(1);
  });
});

describe('wozniak full pass', () => {
  it('splits, adds symmetric cards, and reports counts', () => {
    const res = sanitizeForWozniak([
      card({ id: 'a', back: 'Depolarization causes the channels to open' }),
      card({ id: 'b', back: 'K+ efflux repolarizes the membrane and Na+ channels inactivate' }),
    ]);
    expect(res.addedSymmetric).toBeGreaterThanOrEqual(1);
    expect(res.cards.some((c) => c.tags.includes('TwoWayCloze'))).toBe(true);
    expect(res.cards.some((c) => c.tags.includes('WozniakSplit'))).toBe(true);
  });
});
