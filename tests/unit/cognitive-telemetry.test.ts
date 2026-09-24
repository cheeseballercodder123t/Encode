import { describe, it, expect } from 'vitest';
import {
  computeCompressionRatio,
  computeAtomicity,
  computeJargonDeflation,
  computeSessionTelemetry,
  detectTabooTerms,
  findTabooHits,
} from '@/lib/cognitive-telemetry';
import { AnkiCardItem } from '@/lib/anki-exporter';
import { Activity, StageResponse } from '@/lib/types';

function card(front: string, back: string, isCloze = false): AnkiCardItem {
  return { id: Math.random().toString(36).slice(2), front, back, isCloze, tags: [], sm2: { repetitions: 0, interval: 0, easeFactor: 2.5, nextReviewTimestamp: 0 } };
}

function act(id: string, keywords: string[] = []): Activity {
  return {
    id,
    stageNumber: 1,
    title: 'Stage',
    framework: 'f',
    cognitiveGoal: 'g',
    contextSnippet: 'ctx',
    keywords,
    templateType: 'cause_effect',
    prompt: 'p',
    scaffold: { field1Label: 'a', field1Placeholder: 'b', field2Label: 'c', field2Placeholder: 'd', exampleAnswer: 'e' },
  };
}

describe('compression ratio', () => {
  it('strips noise from a big source into a small deck', () => {
    const raw = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' '); // 200 words
    const ratio = computeCompressionRatio(raw, [card('f', 'one two'), card('f', 'three four')]);
    expect(ratio.rawWords).toBe(200);
    expect(ratio.atomicCards).toBe(2);
    expect(ratio.noiseStrippedPct).toBeGreaterThanOrEqual(95);
  });

  it('is zero with no source or no cards', () => {
    expect(computeCompressionRatio('', [card('f', 'b')]).noiseStrippedPct).toBe(0);
    expect(computeCompressionRatio('some words', []).noiseStrippedPct).toBe(0);
  });
});

describe('atomicity', () => {
  it('flags backs over the 15-word FSRS limit', () => {
    const denseBack = Array.from({ length: 18 }, (_, i) => `w${i}`).join(' ');
    const report = computeAtomicity([card('f', 'short back'), card('f', denseBack)]);
    expect(report.totalCards).toBe(2);
    expect(report.overLimit).toBe(1);
    expect(report.averageBackWords).toBeGreaterThan(0);
  });
});

describe('jargon deflation', () => {
  it('counts lexicon buzzwords the learner avoided', () => {
    const raw = 'Depolarization triggers the cascade. Depolarization opens gates. Osmosis moves water.';
    const a1 = act('a1', ['sodium']);
    const responses: Record<string, StageResponse> = {
      a1: { field1: 'Sodium rushes in through open channels because the gate senses voltage.', field2: 'The cell resets by pushing potassium out.' },
    };
    const j = computeJargonDeflation(raw, [a1], responses);
    expect(j.detected).toBeGreaterThanOrEqual(2);
    expect(j.deflated).toBeGreaterThanOrEqual(1);
    expect(j.index).toBeGreaterThanOrEqual(0);
  });

  it('returns zero index with no learner output', () => {
    const raw = 'Metabolism and homeostasis govern the cell.';
    const j = computeJargonDeflation(raw, [act('a1')], {});
    expect(j.deflated).toBe(0);
    expect(j.index).toBe(0);
  });
});

describe('taboo detection', () => {
  it('detects lexicon terms and frequent long words, skipping stage keywords', () => {
    const raw = 'Depolarization matters. Depolarization fires. Mitochondrial machinery hums. Mitochondrial DNA loops.';
    const taboo = detectTabooTerms(raw, ['depolarization'], 5);
    expect(taboo).not.toContain('depolarization'); // stage keyword is allowed
    expect(taboo.some((t) => t.includes('mitochondrial'))).toBe(true);
  });

  it('flags leaks in learner text', () => {
    const hits = findTabooHits('This drives homeostasis quickly', ['homeostasis', 'osmosis']);
    expect(hits).toEqual(['homeostasis']);
  });
});

describe('session telemetry', () => {
  it('assembles all three gauges', () => {
    const raw = 'Equilibrium is key. Equilibrium matters. Equilibrium shifts.';
    const a1 = act('a1');
    const responses: Record<string, StageResponse> = {
      a1: { field1: 'Pushes and pulls balance out.', field2: 'When one side wins the other side gives.' },
    };
    const t = computeSessionTelemetry({
      rawNotes: raw,
      activities: [a1],
      userResponses: responses,
      cards: [card('f', 'back text')],
    });
    expect(t.compression.rawWords).toBeGreaterThan(0);
    expect(t.atomicity.totalCards).toBe(1);
    expect(t.jargon.detected).toBeGreaterThanOrEqual(1);
  });
});
