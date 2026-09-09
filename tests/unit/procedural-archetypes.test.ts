import { describe, it, expect } from 'vitest';
import { BUILT_IN_ARCHETYPES } from '@/lib/procedural-archetypes';
import {
  validateProceduralArchetype,
  validateProceduralArchetypes,
  rollVariables,
} from '@/lib/procedural-validator';
import { ProceduralMCQArchetype } from '@/lib/types';

describe('built-in procedural archetypes', () => {
  it('ships exactly 9 archetypes across 3 AP subjects', () => {
    expect(BUILT_IN_ARCHETYPES).toHaveLength(9);
    expect(new Set(BUILT_IN_ARCHETYPES.map((a) => a.id)).size).toBe(9);
  });

  BUILT_IN_ARCHETYPES.forEach((archetype) => {
    it(`validates structurally and numerically: ${archetype.topic}`, () => {
      // Generous trial count: every formula is put through 300 random draws.
      const result = validateProceduralArchetype(archetype, 300);
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    });
  });

  it('passes the batch validator with zero issues', () => {
    const report = validateProceduralArchetypes(BUILT_IN_ARCHETYPES, 300);
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('rolls variables that respect their declared ranges', () => {
    for (const archetype of BUILT_IN_ARCHETYPES) {
      const ctx = rollVariables(archetype.variables);
      for (const [name, spec] of Object.entries(archetype.variables)) {
        const value = ctx[name];
        expect(Number.isFinite(value)).toBe(true);
        if (spec.choices && spec.choices.length) {
          expect(spec.choices).toContain(value);
        } else {
          expect(value).toBeGreaterThanOrEqual(Math.min(spec.min as number, spec.max as number) - 1e-9);
          expect(value).toBeLessThanOrEqual(Math.max(spec.min as number, spec.max as number) + 1e-9);
        }
      }
    }
  });
});

describe('validator catches broken archetypes', () => {
  const good: ProceduralMCQArchetype = {
    id: 'test-good',
    topic: 'T',
    questionTemplate: 'Given m = {{m}}, find v = sqrt(k/m)?',
    variables: {
      m: { min: 1, max: 4, step: 0.5, decimals: 2 },
      k: { min: 100, max: 400, step: 10, decimals: 0 },
    },
    unit: 'm/s',
    correctFormulaJs: '(Math.sqrt(k / m)).toFixed(2)',
    traps: [
      { trapName: 'T1', formulaJs: '(Math.sqrt(k / m) * 2).toFixed(2)', explanation: 'e1' },
      { trapName: 'T2', formulaJs: '(Math.sqrt(k / m) / 3).toFixed(2)', explanation: 'e2' },
      { trapName: 'T3', formulaJs: '(Math.sqrt(k / m) + 25).toFixed(2)', explanation: 'e3' },
    ],
    stepByStepSolutionTemplate: '\\( v = \\sqrt{k/m} \\)',
  };

  it('accepts a well-formed archetype', () => {
    expect(validateProceduralArchetype(good).valid).toBe(true);
  });

  it('rejects a trap that equals the correct answer', () => {
    const broken = {
      ...good,
      id: 'test-same',
      traps: [good.traps[0], good.traps[1], { ...good.traps[2], formulaJs: good.correctFormulaJs }],
    };
    const result = validateProceduralArchetype(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/equals the correct answer/);
  });

  it('rejects formulas referencing undeclared or global identifiers', () => {
    const globalReach = { ...good, id: 'test-global', correctFormulaJs: 'window.location.href.length.toFixed(2)' };
    expect(validateProceduralArchetype(globalReach).valid).toBe(false);

    const undeclared = { ...good, id: 'test-undeclared', correctFormulaJs: '(unknownVar * 2).toFixed(2)' };
    const result = validateProceduralArchetype(undeclared);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/undeclared identifier "unknownVar"/);
  });

  it('rejects NaN-producing formulas', () => {
    const nan = { ...good, id: 'test-nan', correctFormulaJs: '(Math.sqrt(-m)).toFixed(2)' };
    const result = validateProceduralArchetype(nan);
    expect(result.valid).toBe(false);
  });

  it('rejects constant formulas (not procedural)', () => {
    const constant = { ...good, id: 'test-constant', correctFormulaJs: '(7).toFixed(2)' };
    const result = validateProceduralArchetype(constant);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/constant/);
  });

  it('rejects unbalanced LaTeX delimiters and undeclared placeholders', () => {
    const latex = { ...good, id: 'test-latex', stepByStepSolutionTemplate: '\\( unbalanced here' };
    expect(validateProceduralArchetype(latex).errors.join(' ')).toMatch(/unbalanced/);

    const missingVar = { ...good, id: 'test-missing', questionTemplate: 'Given {{speed}} find v?' };
    expect(validateProceduralArchetype(missingVar).errors.join(' ')).toMatch(/not declared/);
  });

  it('rejects colliding trap pairs and degenerate variable ranges', () => {
    const collide = {
      ...good,
      id: 'test-collide',
      traps: [good.traps[0], good.traps[1], { ...good.traps[2], formulaJs: good.traps[1].formulaJs }],
    };
    expect(validateProceduralArchetype(collide).errors.join(' ')).toMatch(/collide/);

    const degenerate = { ...good, id: 'test-degen', variables: { m: { min: 2, max: 2 }, k: { min: 100, max: 400 } } };
    expect(validateProceduralArchetype(degenerate).errors.join(' ')).toMatch(/degenerate/);
  });
});
