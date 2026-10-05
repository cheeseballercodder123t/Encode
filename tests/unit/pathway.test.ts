import { describe, expect, it } from 'vitest';
import { GLYCOLYSIS_PAYOFF, GLYCOLYSIS_PAYOFF_SOURCE, evaluatePathway, solvePathway, validatePathwayConfig, type PathwayConfig } from '@/lib/pathway';

/**
 * The pathway builder is graded by declared chemistry, not by a heuristic, so
 * these tests pin the parts that could quietly lie: every quote is literally in
 * the brief, a decoy always exists, a wrong piece is named rather than silently
 * accepted, flow is causal and sequential, and the declared answer really does
 * solve the puzzle.
 */

const clone = (): PathwayConfig => structuredClone(GLYCOLYSIS_PAYOFF);

describe('the shipped payoff example is grounded verbatim', () => {
  it('validates against its own brief and is not mutated by it', () => {
    const before = JSON.stringify(GLYCOLYSIS_PAYOFF);
    expect(validatePathwayConfig(GLYCOLYSIS_PAYOFF, GLYCOLYSIS_PAYOFF_SOURCE)).toEqual({ valid: true, issues: [] });
    expect(JSON.stringify(GLYCOLYSIS_PAYOFF)).toBe(before);
  });
  it('quotes only sentences that are literally in the brief', () => {
    for (const step of GLYCOLYSIS_PAYOFF.steps) expect(GLYCOLYSIS_PAYOFF_SOURCE.includes(step.evidence)).toBe(true);
    for (const entry of GLYCOLYSIS_PAYOFF.evidence) expect(GLYCOLYSIS_PAYOFF_SOURCE.includes(entry.quote)).toBe(true);
  });
});

describe('flow is causal and sequential', () => {
  it('an empty board produces nothing and says what is missing', () => {
    const output = evaluatePathway(GLYCOLYSIS_PAYOFF, {});
    expect(output.status).toBe('NO FLOW');
    expect(output.flowingSteps).toBe(0);
    expect(output.productFormed).toBe(false);
    expect(output.yields).toEqual([]);
    expect(output.blockers[0]).toContain('neither its enzyme nor its cofactor');
  });

  it('the declared answer forms the product and unlocks each yield in order', () => {
    const output = evaluatePathway(GLYCOLYSIS_PAYOFF, solvePathway(GLYCOLYSIS_PAYOFF));
    expect(output.status).toBe('PRODUCT FORMED');
    expect(output.productFormed).toBe(true);
    expect(output.completeCount).toBe(GLYCOLYSIS_PAYOFF.steps.length);
    expect(output.flowingSteps).toBe(GLYCOLYSIS_PAYOFF.steps.length);
    expect(output.yields).toEqual(GLYCOLYSIS_PAYOFF.steps.map((step) => step.yields));
    expect(output.blockers).toEqual([]);
  });

  it('stops at the first incomplete step and offers only the earlier yields', () => {
    const placement = solvePathway(GLYCOLYSIS_PAYOFF);
    delete placement['first-atp'].cofactor;
    const output = evaluatePathway(GLYCOLYSIS_PAYOFF, placement);
    expect(output.status).toBe('FLOW BLOCKED AT STEP 2');
    expect(output.yields).toEqual(['2 NADH']);
    expect(output.blockers.join(' ')).toContain('has its enzyme but not the cofactor');
    // The fully assembled step 3 is present but earns nothing before step 2.
    expect(output.steps[2].complete).toBe(true);
  });

  it('names the wrong piece instead of silently rejecting it', () => {
    const placement = solvePathway(GLYCOLYSIS_PAYOFF);
    placement.oxidation.enzyme = 'hexokinase';
    const output = evaluatePathway(GLYCOLYSIS_PAYOFF, placement);
    expect(output.steps[0].enzymeOk).toBe(false);
    expect(output.flowingSteps).toBe(0);
    expect(output.blockers.join(' ')).toContain('Hexokinase');
    expect(output.blockers.join(' ')).toContain('investment phase');
  });

  it('rejects a cofactor that is produced by the step rather than consumed', () => {
    const placement = solvePathway(GLYCOLYSIS_PAYOFF);
    placement['second-atp'].cofactor = 'atp';
    const output = evaluatePathway(GLYCOLYSIS_PAYOFF, placement);
    expect(output.steps[2].cofactorOk).toBe(false);
    expect(output.blockers.join(' ')).toContain('not the cofactor consumed');
  });

  it('lets a species chip fill two steps (ADP is consumed twice), and is pure and deterministic', () => {
    const placement = solvePathway(GLYCOLYSIS_PAYOFF);
    expect(placement['first-atp'].cofactor).toBe('adp');
    expect(placement['second-atp'].cofactor).toBe('adp');
    const snapshot = JSON.stringify(placement);
    expect(evaluatePathway(GLYCOLYSIS_PAYOFF, placement)).toEqual(evaluatePathway(GLYCOLYSIS_PAYOFF, placement));
    expect(JSON.stringify(placement)).toBe(snapshot);
  });
});

describe('the validator refuses invented chemistry', () => {
  it('rejects a quotation that is not in the source', () => {
    const broken = clone();
    broken.steps[0].evidence = 'a sentence nobody actually wrote';
    const result = validatePathwayConfig(broken, GLYCOLYSIS_PAYOFF_SOURCE);
    expect(result.valid).toBe(false);
    expect(result.issues.join(' ')).toContain('verbatim');
  });
  it('rejects a step naming a piece the palette does not contain', () => {
    const broken = clone();
    broken.steps[0].enzymePieceId = 'ghost';
    expect(validatePathwayConfig(broken, GLYCOLYSIS_PAYOFF_SOURCE).issues.join(' ')).toContain('not in the palette');
  });
  it('rejects an enzyme socket pointed at a cofactor', () => {
    const broken = clone();
    broken.steps[0].enzymePieceId = 'adp';
    expect(validatePathwayConfig(broken, GLYCOLYSIS_PAYOFF_SOURCE).issues.join(' ')).toContain('needs an enzyme');
  });
  it('requires a decoy, so the puzzle can never be solved by elimination', () => {
    const used = new Set(GLYCOLYSIS_PAYOFF.steps.flatMap((step) => [step.enzymePieceId, step.cofactorPieceId]));
    const broken = { ...clone(), pieces: GLYCOLYSIS_PAYOFF.pieces.filter((piece) => used.has(piece.id)) };
    expect(validatePathwayConfig(broken, GLYCOLYSIS_PAYOFF_SOURCE).issues.join(' ')).toContain('decoy');
  });
  it('rejects empty, missing and duplicate structure', () => {
    expect(validatePathwayConfig(null).valid).toBe(false);
    expect(validatePathwayConfig(undefined).valid).toBe(false);
    const broken = clone();
    broken.pieces.push({ ...broken.pieces[0] });
    expect(validatePathwayConfig(broken, GLYCOLYSIS_PAYOFF_SOURCE).issues.join(' ')).toContain('Duplicate piece id');
    const noAssumptions = { ...clone(), assumptions: [] };
    expect(validatePathwayConfig(noAssumptions, GLYCOLYSIS_PAYOFF_SOURCE).issues.join(' ')).toContain('limitations');
    const noEvidence = { ...clone(), evidence: [] };
    expect(validatePathwayConfig(noEvidence, GLYCOLYSIS_PAYOFF_SOURCE).issues.join(' ')).toContain('evidence');
  });
});
