import { describe, it, expect } from 'vitest';
import { compileFormula, validateProceduralArchetype } from '../../lib/procedural-validator';
import type { ProceduralMCQArchetype } from '../../lib/types';

/**
 * `compileFormula` is the app's formula sandbox: it compiles a model-authored
 * (or hand-authored) expression and is documented as exposing "only the
 * declared variable names and `Math`" — "No window, document, fetch, eval, or
 * globals of any kind are reachable."
 *
 * The identifier allowlist alone did not hold that contract. It inspects the
 * expression AFTER string/template literals are stripped and SKIPS property
 * names, so both the `constructor` property and any name hidden inside a string
 * were invisible to it. Every value in JS reaches `Function` through
 * `.constructor`, and the resulting function runs with the REAL global scope —
 * so a formula could reach `process`/`require` on the server (the
 * `/api/archetype` route validates model output there) and `window`/`fetch` in
 * the browser (the export modal validates there). These tests pin each path
 * shut.
 */
describe('compileFormula sandbox', () => {
  /** A formula that compiles AND, when called, returns something truthy. */
  function escapes(formula: string): boolean {
    const compiled = compileFormula(formula, []);
    if ('error' in compiled) return false;
    try {
      const value = (compiled as any).fn(undefined, Math);
      return value !== null && value !== undefined && value !== false;
    } catch {
      // Reaching a *different* failure than the sandbox does not count as an
      // escape; only a successfully executed expression does.
      return false;
    }
  }

  it('still compiles the arithmetic the built-in archetypes use', () => {
    const ok = compileFormula('(A * Math.sqrt(k / m)).toFixed(2)', ['A', 'k', 'm']);
    expect('fn' in ok).toBe(true);
    expect(compileFormula('(pKa + Math.log10(ratio)).toFixed(2)', ['pKa', 'ratio'])).toHaveProperty('fn');
    expect(compileFormula('Math.exp((Ea / 8.314) * (1 / T1 - 1 / T2))', ['Ea', 'T1', 'T2'])).toHaveProperty('fn');
  });

  it('still rejects a bare global identifier', () => {
    expect(compileFormula('window', [])).toHaveProperty('error');
    expect(compileFormula('process', [])).toHaveProperty('error');
    expect(compileFormula('eval("1")', [])).toHaveProperty('error');
  });

  it('rejects the `constructor` escape chain', () => {
    expect(escapes("({}).constructor.constructor('return 6*7')()")).toBe(false);
    expect(escapes("(0).constructor.constructor('return 1')()")).toBe(false);
    expect(escapes("Math.constructor('return 1+1')()")).toBe(false);
    // Any member named constructor, wherever it sits in the chain.
    expect(compileFormula('Math.max.constructor', [])).toHaveProperty('error');
    expect(compileFormula('(A).constructor', ['A'])).toHaveProperty('error');
  });

  it('rejects computed member access that would hide the name in a string', () => {
    expect(compileFormula('Math["constructor"]', [])).toHaveProperty('error');
    expect(compileFormula('({})["constr" + "uctor"]', [])).toHaveProperty('error');
    expect(escapes('Math["constructor"]("return 1")()')).toBe(false);
  });

  it('rejects template-literal interpolation, which is code the stripper never saw', () => {
    expect(compileFormula('`${({}).constructor.constructor("return 6*7")()}`', [])).toHaveProperty('error');
  });

  it('rejects prototype access', () => {
    expect(compileFormula('A.__proto__', ['A'])).toHaveProperty('error');
    expect(compileFormula('A.prototype', ['A'])).toHaveProperty('error');
    expect(compileFormula('A.__defineGetter__', ['A'])).toHaveProperty('error');
  });

  it('rejects a statement separator', () => {
    expect(compileFormula('1; return 2', [])).toHaveProperty('error');
    expect(compileFormula('A; process.exit()', ['A'])).toHaveProperty('error');
  });

  it('a code-executing archetype is rejected by the validator, not run', () => {
    const archetype: ProceduralMCQArchetype = {
      id: 'evil',
      topic: 't',
      questionTemplate: 'What is {{A}}?',
      unit: 'units',
      correctFormulaJs: "(({}).constructor.constructor('return 6*7')()).toFixed(0)",
      stepByStepSolutionTemplate: 'It is {{A}}.',
      variables: { A: { min: 1, max: 5 } },
      traps: [
        { trapName: 't1', formulaJs: '(A + 1).toFixed(0)', explanation: 'e1' },
        { trapName: 't2', formulaJs: '(A + 2).toFixed(0)', explanation: 'e2' },
        { trapName: 't3', formulaJs: '(A + 3).toFixed(0)', explanation: 'e3' },
      ],
    } as ProceduralMCQArchetype;
    const result = validateProceduralArchetype(archetype);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/constructor|prototype|numeric expression/i);
  });
});
