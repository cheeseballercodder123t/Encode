import { describe, it, expect } from 'vitest';
import {
  FUSION_MATRIX,
  fusionBrief,
  fusionReadiness,
  matchFusion,
  soloDepthBrief,
} from '../../lib/escalation/fusion';

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

/**
 * Breadth: a row is a collision of two or three chapters, so a row match alone
 * does not license the collision. One lecture is one chapter, and a "collision"
 * whose second chapter the learner has never met is not extra load — it is a
 * problem that cannot be finished. The readiness read measures how many of the
 * row's own topics the material actually carries, and the escalation is re-aimed
 * DEEPER inside the one chapter when the second is missing.
 */
describe('fusionReadiness — a collision needs two chapters, present', () => {
  const thermo = FUSION_MATRIX[0];

  it('refuses the collision when the material carries one chapter only', () => {
    const readiness = fusionReadiness(
      'Calorimetry (q = mcΔT)',
      'a lecture on measuring heat with a coffee-cup calorimeter and q = mcΔT'
    );

    expect(readiness.row?.id).toBe('thermo-collision');
    expect(readiness.ready).toBe(false);
    expect(readiness.present).toHaveLength(1);
    expect(readiness.present[0]).toBe(thermo.topics[0]);
    // The chapters the collision WOULD have required are named, not hidden: the
    // learner is told which second chapter the material does not carry.
    expect(readiness.absent).toEqual([thermo.topics[1], thermo.topics[2]]);
    expect(readiness.matchedTopics).toBe(1);
    expect(readiness.totalTopics).toBe(thermo.topics.length);
    expect(readiness.reason).toContain('DEEPER');
    expect(readiness.reason).not.toContain('can collide');
  });

  it('serves the collision when two chapters are present', () => {
    const readiness = fusionReadiness(
      'Calorimetry and heats of formation',
      'formation enthalpies of zinc oxide'
    );

    expect(readiness.row?.id).toBe('thermo-collision');
    expect(readiness.ready).toBe(true);
    expect(readiness.matchedTopics).toBeGreaterThanOrEqual(2);
    expect(readiness.present).toContain(thermo.topics[0]);
    expect(readiness.present).toContain(thermo.topics[1]);
    expect(readiness.reason).toContain('can collide');
    // And it says WHICH chapters, because the learner has to see the collision.
    expect(readiness.reason).toContain(thermo.topics[0]);
    expect(readiness.reason).toContain(thermo.topics[1]);
  });

  it('counts a chapter the CONTEXT carries even when the topic string names one', () => {
    // A learner who types "calorimetry" while their notes cover boundary work
    // has the second chapter, and refusing on the topic string alone would
    // under-serve exactly the case the collision is for.
    const readiness = fusionReadiness(
      'Calorimetry',
      'the lecture also covers boundary work with a piston'
    );

    expect(readiness.row?.id).toBe('thermo-collision');
    expect(readiness.ready).toBe(true);
    expect(readiness.present).toContain(thermo.topics[0]);
    expect(readiness.present).toContain(thermo.topics[2]);
  });

  it('reports no collision at all when no row matches, rather than inventing one', () => {
    const readiness = fusionReadiness('The French Revolution', 'the Estates General');

    expect(readiness.row).toBeNull();
    expect(readiness.ready).toBe(false);
    expect(readiness.present).toEqual([]);
    expect(readiness.absent).toEqual([]);
    expect(readiness.reason).toContain('No collision is on file');
  });

  it('is deterministic and never throws on empty input', () => {
    const first = fusionReadiness('', '');
    const second = fusionReadiness('', '');
    expect(first.row).toBeNull();
    expect(first.ready).toBe(false);
    expect(first.reason).toBe(second.reason);

    const typed = fusionReadiness('Calorimetry and piston work', '');
    expect(typed.ready).toBe(fusionReadiness('Calorimetry and piston work', '').ready);
  });

  it('never reports ready without two chapters, for every row in the matrix', () => {
    // `ready` and `present.length` are the same fact stated twice, and a row
    // that could make them disagree would serve a one-chapter "collision".
    for (const row of FUSION_MATRIX) {
      const readiness = fusionReadiness(row.domain, row.problem);
      expect(readiness.row?.id).toBe(row.id);
      expect(readiness.ready).toBe(readiness.present.length >= 2);
      expect(readiness.ready).toBe(readiness.matchedTopics >= 2);
      expect(readiness.present.length + readiness.absent.length).toBe(row.topics.length);
      if (!readiness.ready) expect(readiness.reason).toContain('DEEPER');
    }
  });
});

describe('soloDepthBrief — the load rises inside the chapter the learner has', () => {
  const thermo = FUSION_MATRIX[0];
  const oneChapter = fusionReadiness(
    'Calorimetry (q = mcΔT)',
    'a lecture on measuring heat with a coffee-cup calorimeter and q = mcΔT'
  );
  const brief = soloDepthBrief(oneChapter);

  it('names the chapter being deepened', () => {
    expect(oneChapter.present[0]).toBe(thermo.topics[0]);
    expect(brief).toContain(thermo.topics[0].toUpperCase());
    expect(brief).toContain('BOSS-LEVEL DEPTH');
  });

  it('forbids inventing the chapter the material does not carry', () => {
    expect(brief).toContain('Do NOT invent a second chapter');
    expect(brief).not.toContain('COLLIDE:');
    // The chapters it refuses to import are named, so the refusal is checkable.
    expect(brief).toContain(thermo.topics[1]);
    expect(brief).toContain(thermo.topics[2]);
  });

  it('raises the load by construction rather than by distractor vocabulary', () => {
    expect(brief).toContain('two constructions that must agree');
    expect(brief).toContain('DISTRACTOR');
    expect(brief).toContain('No hints, no intermediate values');
  });

  it('falls back to a named topic and a named gap when the read is empty', () => {
    // With no row there is no present topic and no absent list; the brief still
    // has to read as a brief rather than as a sentence with a hole in it.
    const empty = soloDepthBrief(fusionReadiness('The French Revolution', 'the Estates General'));
    expect(empty).toContain('BOSS-LEVEL DEPTH');
    expect(empty).toContain('a second chapter');
    expect(empty).not.toContain('undefined');
  });
});
