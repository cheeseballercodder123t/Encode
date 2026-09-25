import { describe, it, expect } from 'vitest';
import {
  splitTriageUnits,
  applyTriageVerdicts,
  validateTriageReport,
  triageStats,
  stripNoise,
  countTriageWords,
  TriageUnit,
} from '@/lib/triage';

const unit = (index: number, text: string, kind: TriageUnit['kind']): TriageUnit => ({
  index,
  text,
  kind,
  note: '',
});

describe('splitTriageUnits (deterministic segmentation)', () => {
  it('splits on blank lines and keeps paragraphs intact', () => {
    const source = 'First causal claim.\n\nSecond causal claim.';
    expect(splitTriageUnits(source)).toEqual(['First causal claim.', 'Second causal claim.']);
  });

  it('ignores leading/trailing whitespace and CRLF line endings', () => {
    expect(splitTriageUnits('\r\n\r\n  Alone.  \r\n\r\n')).toEqual(['Alone.']);
  });

  it('breaks an oversized paragraph into sentences so the heatmap stays granular', () => {
    const long = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} carries a claim.`).join(' ');
    const units = splitTriageUnits(long);
    expect(units.length).toBeGreaterThan(1);
    expect(units.every((u) => countTriageWords(u) < 60)).toBe(true);
  });

  it('keeps a pathological run-on paragraph as a single unit', () => {
    const runOn = Array.from({ length: 120 }, () => 'word').join(' ');
    expect(splitTriageUnits(runOn)).toEqual([runOn]);
  });

  it('returns nothing for empty input', () => {
    expect(splitTriageUnits('')).toEqual([]);
    expect(splitTriageUnits('   \n\n  ')).toEqual([]);
  });
});

describe('applyTriageVerdicts (safe degradation)', () => {
  const units = ['kernel text', 'evidence text', 'noise text'];

  it('applies verdicts by index', () => {
    const applied = applyTriageVerdicts(units, {
      units: [
        { index: 0, kind: 'kernel', note: 'defines the mechanism' },
        { index: 1, kind: 'evidence', note: 'one data point' },
        { index: 2, kind: 'noise', note: 'recap' },
      ],
    });
    expect(applied.map((u) => u.kind)).toEqual(['kernel', 'evidence', 'noise']);
    expect(applied[2].note).toBe('recap');
  });

  it('never deletes material the model failed to classify', () => {
    const applied = applyTriageVerdicts(units, { units: [{ index: 0, kind: 'noise' }] });
    expect(applied[1].kind).toBe('kernel');
    expect(applied[2].kind).toBe('kernel');
  });

  it('downgrades an unrecognized label to kernel', () => {
    const applied = applyTriageVerdicts(units, { units: [{ index: 0, kind: 'fluff' }] });
    expect(applied[0].kind).toBe('kernel');
  });

  it('tolerates garbage payloads', () => {
    expect(applyTriageVerdicts(units, null).every((u) => u.kind === 'kernel')).toBe(true);
    expect(applyTriageVerdicts(units, { units: 'nope' }).every((u) => u.kind === 'kernel')).toBe(true);
  });

  it('ignores negative and non-integer indices', () => {
    const applied = applyTriageVerdicts(units, {
      units: [
        { index: -1, kind: 'noise' },
        { index: 1.5, kind: 'noise' },
      ],
    });
    expect(applied.every((u) => u.kind === 'kernel')).toBe(true);
  });
});

describe('triageStats', () => {
  it('computes the noise share from words, not from unit count', () => {
    const stats = triageStats([
      unit(0, 'four kernel words here', 'kernel'),
      unit(1, 'noise', 'noise'),
    ]);
    // 5 words total, 1 noisy → 20% stripped, 80% density.
    expect(stats.totalWords).toBe(5);
    expect(stats.keptWords).toBe(4);
    expect(stats.noisePct).toBe(20);
    expect(stats.densityPct).toBe(80);
    expect(stats.kernel).toBe(1);
    expect(stats.noise).toBe(1);
  });

  it('is all density when there is no noise', () => {
    const stats = triageStats([unit(0, 'clean claim', 'evidence')]);
    expect(stats.noisePct).toBe(0);
    expect(stats.evidence).toBe(1);
  });

  it('handles an empty report', () => {
    expect(triageStats([])).toMatchObject({ total: 0, totalWords: 0, noisePct: 0 });
  });
});

describe('stripNoise', () => {
  const units = [
    unit(0, 'Kernel one.', 'kernel'),
    unit(1, 'Admin text.', 'noise'),
    unit(2, 'Experiment data.', 'evidence'),
  ];

  it('keeps kernels and evidence, drops noise, and rejoins with blank lines', () => {
    expect(stripNoise(units)).toBe('Kernel one.\n\nExperiment data.');
  });

  it('falls back to the original source when everything was triaged as noise', () => {
    const allNoise = [unit(0, 'a', 'noise'), unit(1, 'b', 'noise')];
    expect(stripNoise(allNoise, 'original source')).toBe('original source');
  });
});

describe('validateTriageReport', () => {
  it('segments the source and merges the verdicts', () => {
    const source = 'Real mechanism here.\n\nWelcome to lecture 4, today we will cover...';
    const report = validateTriageReport(
      {
        summary: 'Mostly preamble.',
        units: [
          { index: 0, kind: 'kernel', note: 'mechanism' },
          { index: 1, kind: 'noise', note: 'administrative' },
        ],
      },
      source
    );
    expect(report.units).toHaveLength(2);
    expect(report.units[1].kind).toBe('noise');
    expect(report.stats.noisePct).toBeGreaterThan(0);
    expect(report.summary).toBe('Mostly preamble.');
    expect(stripNoise(report.units, source)).toBe('Real mechanism here.');
  });

  it('gives a default summary for a malformed payload', () => {
    const report = validateTriageReport(null, 'Only one claim.');
    expect(report.summary).toBe('Semantic heatmap complete.');
    expect(report.units).toHaveLength(1);
    expect(report.units[0].kind).toBe('kernel');
  });
});
