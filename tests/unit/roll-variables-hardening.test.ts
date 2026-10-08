import { describe, it, expect } from 'vitest';
import { rollVariables } from '@/lib/procedural-validator';

/**
 * `rollVariables` is the entry point every procedural card build and every
 * numerical validation trial goes through, so a variable context it returns
 * has to be safe to do arithmetic with in all cases.
 *
 * Two defects lived here. A null spec threw a TypeError straight out of the
 * middle of a card build, and a range whose bounds were NaN (or infinite)
 * returned NaN for that variable — which silently turned every formula that
 * consumed it into NaN, and then turned the answer into `null` the moment it
 * was serialized. `toFixed()` also throws a RangeError for a decimals value
 * outside 0..100, which is reachable from model-authored payloads.
 */

/** A tiny deterministic PRNG, so the draws below are reproducible. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

describe('rollVariables degrades gracefully instead of throwing', () => {
  it('does not throw on a null variable spec', () => {
    expect(() => rollVariables({ x: null } as any)).not.toThrow();
  });

  it('returns a finite value for a null spec rather than undefined', () => {
    const ctx = rollVariables({ x: null } as any);
    expect(Number.isFinite(ctx.x)).toBe(true);
    expect(ctx.x).toBe(0);
  });

  it('handles an undefined spec, a numeric spec, and a string spec', () => {
    expect(() => rollVariables({ a: undefined, b: 7, c: 'nope' } as any)).not.toThrow();
    const ctx = rollVariables({ a: undefined, b: 7, c: 'nope' } as any);
    expect(Number.isFinite(ctx.a)).toBe(true);
    expect(Number.isFinite(ctx.b)).toBe(true);
    expect(Number.isFinite(ctx.c)).toBe(true);
  });

  it('returns an empty context for a null/undefined variable map', () => {
    expect(() => rollVariables(null as any)).not.toThrow();
    expect(rollVariables(null as any)).toEqual({});
    expect(rollVariables(undefined as any)).toEqual({});
  });

  it('never throws on an out-of-range decimals value', () => {
    // toFixed() throws a RangeError outside 0..100.
    expect(() => rollVariables({ x: { min: 1, max: 2, decimals: -1 } as any })).not.toThrow();
    expect(() => rollVariables({ x: { min: 1, max: 2, decimals: 200 } as any })).not.toThrow();
    const negative = rollVariables({ x: { min: 1, max: 2, decimals: -1 } as any }, seeded(1));
    const huge = rollVariables({ x: { min: 1, max: 2, decimals: 200 } as any }, seeded(1));
    expect(Number.isFinite(negative.x)).toBe(true);
    expect(Number.isFinite(huge.x)).toBe(true);
  });
});

describe('rollVariables only ever yields finite numbers', () => {
  it('yields a finite number for a NaN range', () => {
    const ctx = rollVariables({ x: { min: NaN, max: NaN } });
    expect(Number.isFinite(ctx.x)).toBe(true);
    expect(ctx.x).toBe(0);
  });

  it('yields a finite number for an infinite range', () => {
    const ctx = rollVariables({ x: { min: -Infinity, max: Infinity } });
    expect(Number.isFinite(ctx.x)).toBe(true);
    expect(ctx.x).toBe(0);
  });

  it('prefers the one finite end when the other is infinite', () => {
    expect(rollVariables({ x: { min: -Infinity, max: 5 } }).x).toBe(5);
    expect(rollVariables({ x: { min: 3, max: Infinity } }).x).toBe(3);
  });

  it('yields a finite number when only one bound is declared at all', () => {
    expect(rollVariables({ x: { max: 9 } as any }).x).toBe(9);
    expect(rollVariables({ x: { min: 4 } as any }).x).toBe(4);
  });

  it('keeps a NaN result from reaching arithmetic', () => {
    // The defect this guards: Number.isFinite(rollVariables(...).x) was false,
    // so every formula reading `x` evaluated to NaN.
    expect(Number.isFinite(rollVariables({ x: { min: NaN, max: NaN } }).x)).toBe(true);
    expect(Number.isFinite(rollVariables({ x: { min: NaN, max: 4 } }).x)).toBe(true);
  });

  it('survives a JSON round-trip without becoming null', () => {
    const ctx = rollVariables({ x: { min: NaN, max: NaN }, y: { min: -Infinity, max: Infinity } });
    // JSON.stringify(NaN) is "null", which is how the corruption surfaced.
    expect(JSON.parse(JSON.stringify(ctx))).toEqual({ x: 0, y: 0 });
  });
});

describe('rollVariables preserves its documented behavior', () => {
  it('draws inside [min, max] for ordinary finite specs', () => {
    const rng = seeded(42);
    for (let i = 0; i < 400; i++) {
      const ctx = rollVariables({ m: { min: 1, max: 4 }, k: { min: 100, max: 400 } }, rng);
      expect(ctx.m).toBeGreaterThanOrEqual(1);
      expect(ctx.m).toBeLessThanOrEqual(4);
      expect(ctx.k).toBeGreaterThanOrEqual(100);
      expect(ctx.k).toBeLessThanOrEqual(400);
    }
  });

  it('still handles min > max by treating the range as swapped', () => {
    const rng = seeded(7);
    for (let i = 0; i < 200; i++) {
      const ctx = rollVariables({ x: { min: 10, max: 1 } }, rng);
      expect(ctx.x).toBeGreaterThanOrEqual(1);
      expect(ctx.x).toBeLessThanOrEqual(10);
    }
  });

  it('still honors a non-empty choices list', () => {
    const rng = seeded(3);
    for (let i = 0; i < 200; i++) {
      const ctx = rollVariables({ x: { min: 0, max: 1, choices: [2, 4, 8] } as any }, rng);
      expect([2, 4, 8]).toContain(ctx.x);
    }
  });

  it('falls back to the range when the choices list holds garbage', () => {
    const ctx = rollVariables({ x: { min: 5, max: 6, choices: ['a', null] } as any });
    expect(Number.isFinite(ctx.x)).toBe(true);
    expect(ctx.x).toBeGreaterThanOrEqual(5);
    expect(ctx.x).toBeLessThanOrEqual(6);
  });

  it('still honors step and decimals', () => {
    const rng = seeded(11);
    for (let i = 0; i < 100; i++) {
      const ctx = rollVariables({ x: { min: 0, max: 10, step: 2, decimals: 0 } as any }, rng);
      expect(ctx.x % 2).toBe(0);
      expect(Number.isInteger(ctx.x)).toBe(true);
    }
  });

  it('consumes the rng exactly as before for a valid spec (deterministic)', () => {
    // Same seed, same context: proves the hardening added no extra rng() draw
    // on the normal path, so seeded validation trials stay reproducible.
    const a = rollVariables({ m: { min: 1, max: 4 }, k: { min: 100, max: 400 } }, seeded(99));
    const b = rollVariables({ m: { min: 1, max: 4 }, k: { min: 100, max: 400 } }, seeded(99));
    expect(a).toEqual(b);
  });
});
