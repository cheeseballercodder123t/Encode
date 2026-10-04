import { describe, it, expect } from 'vitest';
import { detectSlideDeck, parseSlideDeck } from '@/lib/services/slide-deck-parser';

describe('slide-deck-parser', () => {
  it('detects and parses Google Slides presentation format', () => {
    const raw = `Presentation: Neurobiology 101
Slide 1 of 3
--- Slide Content ---
Resting Membrane Potential
- Inside of neuron is -70mV relative to outside
- Maintained by Na+/K+ ATPase pump
--- Speaker Notes ---
Emphasize 3 Na+ out for 2 K+ in.

Slide 2 of 3
--- Slide Content ---
Depolarization Phase
- Voltage-gated Na+ channels open rapidly at -55mV threshold
- Membrane potential shoots up to +30mV

Slide 3 of 3
--- Slide Content ---
Repolarization and Refractory Period
- K+ channels open, Na+ channels inactivate
- Relative refractory period prevents backward impulse`;

    expect(detectSlideDeck(raw)).toBe(true);
    const result = parseSlideDeck(raw);
    expect(result.isSlideDeck).toBe(true);
    expect(result.presentationTitle).toBe('Neurobiology 101');
    expect(result.slides).toHaveLength(3);

    expect(result.slides[0].slideNumber).toBe(1);
    expect(result.slides[0].title).toContain('Resting Membrane Potential');
    expect(result.slides[0].speakerNotes).toContain('Emphasize 3 Na+ out for 2 K+ in');

    expect(result.slides[1].slideNumber).toBe(2);
    expect(result.slides[1].title).toContain('Depolarization Phase');

    expect(result.slides[2].slideNumber).toBe(3);
    expect(result.slides[2].title).toContain('Repolarization');
  });

  it('detects simple numbered slides (Slide 1:, Slide 2:)', () => {
    const raw = `Slide 1: Krebs Cycle Overview
Occurs in the mitochondrial matrix. Acetyl-CoA combines with oxaloacetate.

Slide 2: Energy Yield
Produces 3 NADH, 1 FADH2, and 1 GTP per turn.`;

    expect(detectSlideDeck(raw)).toBe(true);
    const result = parseSlideDeck(raw);
    expect(result.isSlideDeck).toBe(true);
    expect(result.slides).toHaveLength(2);
    expect(result.slides[0].title).toBe('Slide 1: Krebs Cycle Overview');
    expect(result.slides[1].title).toBe('Slide 2: Energy Yield');
  });

  it('detects bracketed slides ([Slide 1], [Slide 2])', () => {
    const raw = `[Slide 1]
Introduction to Sorting Algorithms. QuickSort and MergeSort have O(n log n) average time complexity.

[Slide 2]
BubbleSort vs InsertionSort. Both are O(n^2) worst case but InsertionSort is O(n) on nearly sorted data.`;

    expect(detectSlideDeck(raw)).toBe(true);
    const result = parseSlideDeck(raw);
    expect(result.isSlideDeck).toBe(true);
    expect(result.slides).toHaveLength(2);
    expect(result.slides[0].slideNumber).toBe(1);
    expect(result.slides[1].slideNumber).toBe(2);
  });

  it('handles horizontal rule dividers separating slides', () => {
    const raw = `First slide explaining Ohm's law V = IR with voltage, current, and resistance.
---
Second slide explaining Kirchhoff's Voltage Law: the sum of potential differences in a closed loop is zero.`;

    expect(detectSlideDeck(raw)).toBe(false); // No explicit slide keywords
    const result = parseSlideDeck(raw);
    expect(result.isSlideDeck).toBe(true);
    expect(result.slides).toHaveLength(2);
    expect(result.slides[0].slideNumber).toBe(1);
    expect(result.slides[1].slideNumber).toBe(2);
  });

  it('gracefully returns isSlideDeck false for standard paragraphs and single slides', () => {
    expect(detectSlideDeck('')).toBe(false);
    expect(parseSlideDeck('').isSlideDeck).toBe(false);

    const singleParagraph = 'This is just a regular study note explaining mitochondria as the powerhouse of the cell.';
    expect(detectSlideDeck(singleParagraph)).toBe(false);
    expect(parseSlideDeck(singleParagraph).isSlideDeck).toBe(false);

    const singleSlide = 'Slide 1: Single Slide Content without any second slide.';
    expect(detectSlideDeck(singleSlide)).toBe(false);
    expect(parseSlideDeck(singleSlide).isSlideDeck).toBe(false);
  });
});
