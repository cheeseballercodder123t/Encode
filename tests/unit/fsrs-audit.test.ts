import { describe, it, expect } from 'vitest';
import {
  stripHtml,
  countWords,
  isAmbiguousCloze,
  auditAnkiCard,
  auditDeck,
  splitDenseCloze,
  TOO_LONG_WORD_LIMIT,
} from '@/lib/fsrs-audit';
import { AnkiCardItem } from '@/lib/anki-exporter';

function clozeCard(front: string, id = 'c1'): AnkiCardItem {
  return {
    id,
    front,
    back: 'back',
    isCloze: true,
    tags: ['DeepEncode'],
    sm2: { repetitions: 0, interval: 1, easeFactor: 2.5, nextReviewTimestamp: 0 },
  };
}

describe('stripHtml', () => {
  it('removes tags and converts <br> to spaces', () => {
    expect(stripHtml('Hello<br>world<b>!</b>')).toBe('Hello world !');
  });
  it('decodes common entities', () => {
    expect(stripHtml('a &amp; b &lt; c')).toBe('a & b < c');
  });
});

describe('countWords', () => {
  it('counts words ignoring HTML', () => {
    expect(countWords('<b>Hello</b> world')).toBe(2);
  });
  it('counts cloze inner text as words, not markers', () => {
    expect(countWords('{{c1::HCl}} is strong')).toBe(3);
  });
  it('returns 0 for empty strings', () => {
    expect(countWords('   ')).toBe(0);
  });
});

describe('isAmbiguousCloze', () => {
  it('flags "or" inside a deletion', () => {
    expect(isAmbiguousCloze('The ion is {{c1::Na+ or K+}}.')).toBe(true);
  });
  it('flags pipe and slash separators', () => {
    expect(isAmbiguousCloze('{{c1::A|B}}')).toBe(true);
    expect(isAmbiguousCloze('{{c1::A/B}}')).toBe(true);
  });
  it('flags comma-separated candidates', () => {
    expect(isAmbiguousCloze('{{c1::A, B, or C}}')).toBe(true);
  });
  it('flags two deletions sharing the same index', () => {
    expect(isAmbiguousCloze('{{c1::X}} and {{c1::Y}}')).toBe(true);
  });
  it('accepts a clean single deletion', () => {
    expect(isAmbiguousCloze('The formula is {{c1::HCl}}.')).toBe(false);
  });
  it('flags same-index reuse across deletions', () => {
    expect(isAmbiguousCloze('{{c1::X}} reacts with {{c1::Y}}')).toBe(true);
  });
  it('accepts distinct indices', () => {
    expect(isAmbiguousCloze('{{c1::X}} reacts with {{c2::Y}}')).toBe(false);
  });
  it('does not flag a lone comma inside a number or phrase', () => {
    expect(isAmbiguousCloze('The volume is {{c1::2,500 mL}}.')).toBe(false);
  });
});

describe('auditAnkiCard', () => {
  it('flags a too-long cloze', () => {
    const longFront =
      'The {{c1::mitochondrial}} electron transport chain produces a large amount of ATP via oxidative phosphorylation across the inner mitochondrial membrane';
    const card = clozeCard(longFront);
    const issues = auditAnkiCard(card);
    expect(issues.some((i) => i.kind === 'too_long')).toBe(true);
  });
  it('flags an ambiguous cloze', () => {
    const card = clozeCard('The ion is {{c1::Na+ or K+}}.');
    const issues = auditAnkiCard(card);
    expect(issues.some((i) => i.kind === 'ambiguous')).toBe(true);
  });
  it('passes a short clean cloze', () => {
    const card = clozeCard('The formula is {{c1::HCl}}.');
    expect(auditAnkiCard(card)).toEqual([]);
  });
  it('does not flag length on basic (non-cloze) cards', () => {
    const card: AnkiCardItem = {
      ...clozeCard(''),
      isCloze: false,
      front: 'A very long question with many words that exceeds the limit significantly',
    };
    expect(auditAnkiCard(card).some((i) => i.kind === 'too_long')).toBe(false);
  });
});

describe('auditDeck', () => {
  it('returns only flagged cards, worst first', () => {
    const cards = [
      clozeCard('The formula is {{c1::HCl}}.'),
      clozeCard('The ion is {{c1::Na+ or K+}}.'),
      clozeCard(
        'The {{c1::mitochondrial}} electron transport chain produces a large amount of ATP via oxidative phosphorylation across the inner mitochondrial membrane'
      ),
    ];
    const result = auditDeck(cards);
    expect(result).toHaveLength(2);
    // Ambiguous has severity 1000 → sorts first.
    expect(result[0].issues.some((i) => i.kind === 'ambiguous')).toBe(true);
  });
});

describe('splitDenseCloze', () => {
  it('returns null for non-cloze cards', () => {
    const card: AnkiCardItem = { ...clozeCard(''), isCloze: false };
    expect(splitDenseCloze(card)).toBeNull();
  });
  it('returns null for short clozes', () => {
    expect(splitDenseCloze(clozeCard('The formula is {{c1::HCl}}.'))).toBeNull();
  });
  it('splits a long cloze into two shorter clozes', () => {
    const longFront =
      'The {{c1::mitochondrial}} electron transport chain produces a large amount of ATP via oxidative phosphorylation across the inner mitochondrial membrane';
    const card = clozeCard(longFront);
    const split = splitDenseCloze(card);
    expect(split).not.toBeNull();
    const [a, b] = split!;
    expect(a.isCloze && b.isCloze).toBe(true);
    expect(countWords(a.front)).toBeLessThanOrEqual(TOO_LONG_WORD_LIMIT + 2);
    expect(countWords(b.front)).toBeLessThanOrEqual(TOO_LONG_WORD_LIMIT + 2);
    // The single source marker is preserved on whichever half it landed on,
    // and the two halves together still cover the full original text.
    const markerCount = (a.front.match(/\{\{c\d+::/g) || []).length + (b.front.match(/\{\{c\d+::/g) || []).length;
    expect(markerCount).toBe(1);
    expect(`${a.front} ${b.front}`).toContain('mitochondrial');
  });
  it('preserves the original card id with a split suffix', () => {
    const longFront =
      'The {{c1::mitochondrial}} electron transport chain produces a large amount of ATP via oxidative phosphorylation across the inner mitochondrial membrane';
    const card = clozeCard(longFront, 'fact-1');
    const [a, b] = splitDenseCloze(card)!;
    expect(a.id).toBe('fact-1-split-a');
    expect(b.id).toBe('fact-1-split-b');
  });
});
