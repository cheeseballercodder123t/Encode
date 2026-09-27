import { describe, it, expect } from 'vitest';
import {
  CONTRADICTION_TAG,
  ClaimInput,
  buildContradictionCard,
  claimSubject,
  claimValues,
  detectContradictions,
  stripCloze,
  summarizeContradictions,
} from '@/lib/services/contradiction';

function claims(rows: [text: string, sourceLabel: string][]): ClaimInput[] {
  // sourceId is derived from the label, exactly as the forge attributes a
  // claim to the source it came from.
  return rows.map(([text, sourceLabel], i) => ({
    id: `src_${sourceLabel.replace(/[^a-z0-9]+/gi, '_')}-c${i + 1}`,
    text,
    sourceId: `src_${sourceLabel.replace(/[^a-z0-9]+/gi, '_')}`,
    sourceLabel,
  }));
}

describe('claim normalization', () => {
  it('strips both cloze shapes', () => {
    expect(stripCloze('The half-life is {{c1::4 h}} for this drug.')).toBe('The half-life is 4 h for this drug.');
    expect(stripCloze('Reaches {{1,200 mOsm}} at the hairpin.')).toBe('Reaches 1,200 mOsm at the hairpin.');
  });

  it('reads quantities with their units', () => {
    expect(claimValues('The half-life is 4 h at pH 7.4.')).toEqual(['4 h', '7.4']);
    expect(claimValues('It reaches 1,200 mOsm.')).toEqual(['1200 mosm']);
    expect(claimValues('No numbers here at all.')).toEqual([]);
  });

  it('reduces a claim to a subject key: quantities, antonyms and negations collapse', () => {
    expect(claimSubject('The half-life is 4 h.')).toBe(claimSubject('The half-life is 6 h.'));
    expect(claimSubject('Insulin lowers blood glucose.')).toBe(claimSubject('Insulin raises blood glucose.'));
    expect(claimSubject('Insulin does not lower blood glucose.')).toBe(
      claimSubject('Insulin lowers blood glucose.')
    );
    // Different subjects must not collapse.
    expect(claimSubject('The half-life is 4 h.')).not.toBe(claimSubject('The volume of distribution is 4 h.'));
  });
});

describe('detectContradictions', () => {
  it('flags the same sentence with a different quantity as a numeric conflict', () => {
    const found = detectContradictions(
      claims([
        ['The half-life of the drug is 4 h.', 'Lecture 4 slides'],
        ['The half-life of the drug is 6 h.', 'handout.pdf'],
      ])
    );
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe('numeric');
    expect(found[0].summary).toBe('4 h vs 6 h');
    expect(found[0].claims.map((c) => c.sourceLabel)).toEqual(['Lecture 4 slides', 'handout.pdf']);
    expect(found[0].claims.map((c) => c.values)).toEqual([['4 h'], ['6 h']]);
  });

  it('flags a flipped antonym as a polarity conflict', () => {
    const found = detectContradictions(
      claims([
        ['Insulin lowers blood glucose.', 'Lecture 4 slides'],
        ['Insulin raises blood glucose.', 'textbook chapter 2'],
      ])
    );
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe('polarity');
    expect(found[0].summary).toMatch(/lower|raise/);
  });

  it('flags a negation flip as a polarity conflict', () => {
    const found = detectContradictions(
      claims([
        ['The Na+/K+ pump does not reverse to cause the spike.', 'Lecture 4 slides'],
        ['The Na+/K+ pump reverses to cause the spike.', 'forum post'],
      ])
    );
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe('polarity');
    expect(found[0].summary).toContain('negated');
  });

  it('never flags a source against itself, and ignores agreeing sources', () => {
    expect(
      detectContradictions(
        claims([
          ['The half-life of the drug is 4 h.', 'Lecture 4 slides'],
          ['The half-life of the drug is 6 h.', 'Lecture 4 slides'],
        ])
      )
    ).toHaveLength(0);
    expect(
      detectContradictions(
        claims([
          ['The half-life of the drug is 4 h.', 'Lecture 4 slides'],
          ['The half-life of the drug is 4 h.', 'handout.pdf'],
        ])
      )
    ).toHaveLength(0);
  });

  it('leaves unrelated claims alone', () => {
    const found = detectContradictions(
      claims([
        ['The loop of Henle reaches 1,200 mOsm.', 'Lecture 4 slides'],
        ['ADH inserts aquaporin-2 into the collecting duct.', 'handout.pdf'],
      ])
    );
    expect(found).toHaveLength(0);
  });

  it('caps how many conflicts one deck may carry', () => {
    const rows: [string, string][] = [];
    for (let i = 1; i <= 6; i++) {
      rows.push([`The resting membrane potential of neuron ${i} is 70 mV.`, 'Lecture 4 slides']);
      rows.push([`The resting membrane potential of neuron ${i} is 90 mV.`, 'handout.pdf']);
    }
    const found = detectContradictions(claims(rows), 3);
    expect(found).toHaveLength(3);
  });
});

describe('the conflict card', () => {
  const [conflict] = detectContradictions(
    claims([
      ['The half-life of the drug is 4 h.', 'Lecture 4 slides'],
      ['The half-life of the drug is 6 h.', 'handout.pdf'],
    ])
  );

  it('asks the question without answering it, and carries both claims attributed', () => {
    expect(conflict.card.tag).toBe(CONTRADICTION_TAG);
    expect(conflict.card.question).toContain('Sources disagree');
    expect(conflict.card.question).toContain('___');
    expect(conflict.card.question).not.toContain('4 h');
    expect(conflict.card.factStatement).toContain('Lecture 4 slides');
    expect(conflict.card.factStatement).toContain('handout.pdf');
    expect(conflict.card.clozeSuggestion).toContain('{{4 h — Lecture 4 slides}}');
    expect(conflict.card.clozeSuggestion).toContain('{{6 h — handout.pdf}}');
    expect(conflict.card.memoryHook).toMatch(/before the exam/i);
  });

  it('clozes the opposing sentences when the conflict is polarity', () => {
    const [polarity] = detectContradictions(
      claims([
        ['Insulin lowers blood glucose.', 'Lecture 4 slides'],
        ['Insulin raises blood glucose.', 'textbook chapter 2'],
      ])
    );
    const { card: _built, ...rest } = polarity;
    const card = buildContradictionCard(rest);
    expect(card.clozeSuggestion).toContain('lowers blood glucose — Lecture 4 slides');
    expect(card.clozeSuggestion).toContain('raises blood glucose — textbook chapter 2');
  });

  it('summarizes for the log', () => {
    expect(summarizeContradictions([])).toBe('');
    expect(summarizeContradictions([conflict])).toBe('1 source conflict: 4 h vs 6 h');
  });
});
