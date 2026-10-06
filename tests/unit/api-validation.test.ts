import { describe, it, expect } from 'vitest';
import {
  encodeSchema,
  evaluateSchema,
  settingsSchema,
  youtubeSchema,
} from '../../lib/api-validation';

// The route schemas are the security boundary for /api/*: they must accept
// every payload the real UI sends (defaults included) and reject wrong-typed,
// oversized or malformed input with a field-naming issue.

const baseSettings = { provider: 'gemini', geminiApiKey: 'k'.repeat(40) };

describe('encodeSchema', () => {
  it('accepts the full UI payload and applies defaults', () => {
    const parsed = encodeSchema.safeParse({
      notes: 'Some notes about ion channels.',
      settings: baseSettings,
      gear: 3,
      hiddenTemplates: ['mnemonic_peg'],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.mode).toBe('conceptual');
      expect(parsed.data.enableDeepResearch).toBe(true);
      expect(parsed.data.gear).toBe(3);
      expect(parsed.data.hiddenTemplates).toEqual(['mnemonic_peg']);
    }
  });

  it('accepts an empty object (every field optional/defaulted)', () => {
    const parsed = encodeSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it('rejects an out-of-range gear', () => {
    expect(encodeSchema.safeParse({ gear: 7 }).success).toBe(false);
  });

  it('rejects a non-enum mode', () => {
    expect(encodeSchema.safeParse({ mode: 'shredder' }).success).toBe(false);
  });

  it('rejects oversized notes', () => {
    expect(encodeSchema.safeParse({ notes: 'x'.repeat(200_001) }).success).toBe(false);
  });

  it('rejects a settings object with a wrong-typed key', () => {
    expect(settingsSchema.safeParse({ provider: 123 }).success).toBe(false);
  });

  it('rejects an oversized file payload', () => {
    const big = { name: 'f.pdf', type: 'application/pdf', size: 31 * 1024 * 1024, base64Data: 'a'.repeat(100) };
    expect(encodeSchema.safeParse({ file: big }).success).toBe(false);
  });
});

describe('evaluateSchema', () => {
  it('accepts both single-stage and batch payloads', () => {
    expect(evaluateSchema.safeParse({ field1Value: 'answer' }).success).toBe(true);
    expect(
      evaluateSchema.safeParse({ batchMode: true, stages: [{ title: 'S1', field1Value: 'a' }] }).success
    ).toBe(true);
  });

  it('rejects a wrong-typed strictness level', () => {
    expect(evaluateSchema.safeParse({ strictnessLevel: 'brutal' }).success).toBe(false);
  });

  it('rejects an oversized stage batch', () => {
    const stages = Array.from({ length: 31 }, (_, i) => ({ title: `s${i}` }));
    expect(evaluateSchema.safeParse({ batchMode: true, stages }).success).toBe(false);
  });
});

describe('youtubeSchema', () => {
  it('accepts a video URL payload', () => {
    const parsed = youtubeSchema.safeParse({ videoUrl: 'https://youtube.com/watch?v=abc' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.mode).toBe('conceptual');
  });

  it('rejects a missing URL', () => {
    expect(youtubeSchema.safeParse({}).success).toBe(false);
  });
});
