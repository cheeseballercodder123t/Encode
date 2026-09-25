import { describe, it, expect } from 'vitest';
import { isStemContent, renderStemText, stemNotationCount } from '@/lib/stem-text';

describe('renderStemText', () => {
  it('renders sub- and superscripts', () => {
    expect(renderStemText('Q = pi*r^{4}*dP / (8*eta*L)')).toContain('r<sup>4</sup>');
    expect(renderStemText('K_{m} sets the half-saturation point')).toContain('K<sub>m</sub>');
    expect(renderStemText('r^4 scales flow')).toContain('r<sup>4</sup>');
  });

  it('renders causal arrows and comparisons', () => {
    expect(renderStemText('threshold -> Na+ influx -> depolarisation')).toBe(
      'threshold → Na+ influx → depolarisation'
    );
    expect(renderStemText('A <=> B and x <= 5, y != z')).toBe('A ⇌ B and x ≤ 5, y ≠ z');
  });

  it('renders greek letters and square roots', () => {
    expect(renderStemText('\\Delta G = \\alpha + \\beta')).toBe('Δ G = α + β');
    expect(renderStemText('v = \\sqrt{2gh}')).toBe('v = √(2gh)');
    // An unknown command is not a maths token: it stays exactly as typed.
    expect(renderStemText('\\notacommand stays')).toBe('\\notacommand stays');
  });

  it('escapes HTML instead of rendering it', () => {
    expect(renderStemText('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('leaves prose and identifiers alone', () => {
    expect(renderStemText('Sodium rushes in through voltage-gated channels.')).toBe(
      'Sodium rushes in through voltage-gated channels.'
    );
    // Braces are required for multi-character bodies: these must not be rewritten.
    expect(renderStemText('snake_case and H2O and gb2 stay put')).toBe(
      'snake_case and H2O and gb2 stay put'
    );
  });

  it('handles empty and non-string input', () => {
    expect(renderStemText('')).toBe('');
  });
});

describe('isStemContent / stemNotationCount', () => {
  it('counts each notation it can render', () => {
    expect(stemNotationCount('threshold -> spike')).toBe(1);
    expect(stemNotationCount('r^{4} and \\alpha and x <= 2')).toBe(3);
    expect(stemNotationCount('\\notacommand stays put')).toBe(0);
  });

  it('reports prose as non-STEM', () => {
    expect(isStemContent('Potassium leaves the cell to reset the membrane.')).toBe(false);
    expect(isStemContent('')).toBe(false);
  });

  it('detects stem notation in a mixed answer', () => {
    expect(isStemContent('Flow rises 16x because Q ~= r^{4}.')).toBe(true);
  });
});
