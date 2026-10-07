import { describe, it, expect } from 'vitest';
import { FUSION_MATRIX, fusionBrief, matchFusion } from '../../lib/escalation/fusion';

/**
 * Boss level is only an escalation if the collision is REAL. Rotating numbers
 * inside one chapter leaves the learner at the same load, and a fabricated
 * cross-chapter link costs working memory on a connection that is not
 * load-bearing — which then has to be unlearned. So the matrix is data, the
 * match is conservative, and a topic with no row is served as a single-topic
 * problem rather than a made-up fusion.
 */

describe('matchFusion — a collision or nothing', () => {
  it('finds the fusion the plan names for thermochemistry', () => {
    const row = matchFusion('Thermochemistry — calorimetry and enthalpy of formation');
    expect(row?.id).toBe('thermo-collision');
    expect(row?.topics.length).toBeGreaterThanOrEqual(2);
  });

  it('finds the physiology collision from the physiology half alone', () => {
    expect(matchFusion('Action potentials and the Nernst equation')?.id).toBe(
      'electrophysiology-collision'
    );
    expect(matchFusion('The Goldman-Hodgkin-Katz equation')?.id).toBe(
      'electrophysiology-collision'
    );
  });

  it('finds the solution-chemistry collision from a titration', () => {
    expect(matchFusion('Acid–base titration and buffers')?.id).toBe('solution-collision');
  });

  it('matches on the best score, not on the first row that hits', () => {
    // Both rows can hit a mixed topic; the one with more signal wins.
    const row = matchFusion('Titration with a buffer, and the pKa of the weak acid');
    expect(row?.id).toBe('solution-collision');
  });

  it('refuses to invent a fusion for a topic with no row', () => {
    expect(matchFusion('The French Revolution and the Estates General')).toBeNull();
    expect(matchFusion('')).toBeNull();
    expect(matchFusion('   ')).toBeNull();
  });

  it('is deterministic — the same topic always resolves the same way', () => {
    const first = matchFusion('Calorimetry and piston work');
    const second = matchFusion('Calorimetry and piston work');
    expect(first?.id).toBe(second?.id);
  });

  it('accepts an empty matrix without throwing', () => {
    expect(matchFusion('Calorimetry', [])).toBeNull();
  });
});

describe('fusionBrief — the couplings are the brief', () => {
  const row = FUSION_MATRIX[0];

  it('names every topic it collides', () => {
    const brief = fusionBrief(row);
    for (const topic of row.topics) expect(brief).toContain(topic);
  });

  it('carries every coupling, because that is what stops two exercises being stapled together', () => {
    const brief = fusionBrief(row);
    for (const coupling of row.couplings) expect(brief).toContain(coupling);
    expect(brief).toContain('Do not staple two exercises together');
  });

  it('forbids hints and intermediate values, like every other generator here', () => {
    const brief = fusionBrief(row);
    expect(brief).toContain('No hints, no intermediate values');
  });

  it('every row in the matrix has a domain, topics, a problem and couplings', () => {
    for (const entry of FUSION_MATRIX) {
      expect(entry.domain.length).toBeGreaterThan(0);
      expect(entry.topics.length).toBeGreaterThanOrEqual(2);
      expect(entry.problem.length).toBeGreaterThan(40);
      expect(entry.couplings.length).toBeGreaterThanOrEqual(2);
      expect(entry.keywords.length).toBeGreaterThan(0);
    }
  });
});
