import { describe, expect, it } from 'vitest';
import { TOY_EXAMPLES, activityForToyExample } from '@/lib/toy-models/examples';
import { buildSkillTree, conceptMatches, encodedStageCount, gapId, isSchemaComplete, normalizeConcept } from '@/lib/course-tree';
import type { PrerequisitesReport, SavedSchema, StageResponse } from '@/lib/types';

/**
 * The skill tree is built only from data the learner actually produced: saved
 * schemas and the prerequisite audits they ran. These tests pin the two things
 * that could quietly lie — the local concept matcher (which decides whether a
 * prerequisite is already covered) and the state/edge construction.
 */

function report(topicTitle: string, names: string[]): PrerequisitesReport {
  return {
    isReadyToEncode: false,
    topicTitle,
    prerequisites: names.map((name, index) => ({
      id: `p${index}`,
      name,
      importance: `${name} is assumed throughout the source.`,
      primerSummary: `A short first-principles primer on ${name}.`,
    })),
  };
}

function schema(
  id: string,
  topicSummary: string,
  exampleIndexes: number[],
  responded: number,
  prerequisites?: PrerequisitesReport,
  timestamp = 1
): SavedSchema {
  const activities = exampleIndexes.map((index) => activityForToyExample(TOY_EXAMPLES[index]));
  const userResponses: Record<string, StageResponse> = {};
  activities.slice(0, responded).forEach((activity) => {
    userResponses[activity.id] = { field1: 'encoded it', field2: 'because the mechanism forces it' };
  });
  return { id, timestamp, topicSummary, mode: 'conceptual', xpEarned: 0, activities, userResponses, prerequisites };
}

describe('concept matching is conservative', () => {
  it('normalizes case, punctuation and stopwords', () => {
    expect(normalizeConcept('The Resting-Membrane Potential!')).toBe('resting membrane potential');
    expect(normalizeConcept('  ')).toBe('');
  });
  it('matches equal names and whole-token containment of two or more words', () => {
    expect(conceptMatches('Resting Membrane Potential', 'resting membrane potential')).toBe(true);
    expect(conceptMatches('Resting Membrane Potential', 'Membrane Potential')).toBe(true);
    expect(conceptMatches('Wave-Particle Duality', 'Wave Particle Duality')).toBe(true);
  });
  it('never links courses on a single ambiguous word or a partial overlap', () => {
    // "Energy" appears in every subject; a one-word concept cannot claim coverage.
    expect(conceptMatches('Cellular Energy Metabolism', 'Energy')).toBe(false);
    // Same shape, different mechanism: the classic false friend.
    expect(conceptMatches('Action Potential', 'Membrane Potential')).toBe(false);
    expect(conceptMatches('', 'Energy')).toBe(false);
  });
});

describe('progress is read from the learner’s own responses', () => {
  it('counts written fields and revealed labs as encoded stages', () => {
    const partial = schema('a', 'Half done', [0, 1], 1);
    expect(encodedStageCount(partial)).toBe(1);
    expect(isSchemaComplete(partial)).toBe(false);

    const lab = schema('b', 'Lab done', [5], 0);
    lab.userResponses[lab.activities[0].id] = { field1: '', field2: '', toyModelProgress: { version: 1, modelKey: 'toy-v1-x', inputs: {}, explored: true, revealed: true, updatedAt: 1 } };
    expect(isSchemaComplete(lab)).toBe(true);

    const empty = schema('c', 'Nothing yet', [0], 0);
    expect(isSchemaComplete(empty)).toBe(false);
  });
});

describe('course-level skill tree', () => {
  it('colours mastered, in-progress and locked nodes from the library alone', () => {
    const tree = buildSkillTree([
      schema('course-a', 'Predator–prey orbits', [5], 1, report('Predator–prey orbits', ['Population dynamics', 'Logistic growth']), 10),
      schema('course-b', 'Population dynamics', [1], 0, undefined, 20),
    ]);

    const courseA = tree.nodes.find((node) => node.id === 'course-a')!;
    const courseB = tree.nodes.find((node) => node.id === 'course-b')!;
    expect(courseA.state).toBe('mastered');
    expect(courseA.detail).toBe('1 of 1 stages encoded');
    expect(courseB.state).toBe('in-progress');

    // The covered prerequisite resolves to the real course — a second,
    // duplicate node for the same concept is never created.
    expect(courseA.requires).toContain('course-b');
    expect(tree.nodes).toHaveLength(3);

    // The uncovered one is the actual gap, and it carries the audit's primer.
    const locked = tree.nodes.find((node) => node.id === gapId('Logistic growth'))!;
    expect(locked.state).toBe('locked');
    expect(locked.label).toBe('Logistic growth');
    expect(locked.primer).toContain('primer on Logistic growth');
    expect(tree.gaps).toEqual([gapId('Logistic growth')]);
    expect(tree.hasAudits).toBe(true);

    // Layout: foundations at depth 0, the topic that needs them one layer up.
    expect(locked.depth).toBe(0);
    expect(courseB.depth).toBe(0);
    expect(courseA.depth).toBe(1);
    expect(tree.columns).toBe(2);
  });

  it('is deterministic and keeps the newest copy of a duplicated schema id', () => {
    const older = schema('same', 'Membrane transport', [0], 0, undefined, 1);
    const newer = schema('same', 'Membrane transport', [0], 1, undefined, 5);
    const tree = buildSkillTree([older, newer]);
    expect(tree.nodes).toHaveLength(1);
    expect(tree.nodes[0].state).toBe('mastered');
    expect(JSON.stringify(buildSkillTree([newer, older]))).toBe(JSON.stringify(buildSkillTree([older, newer])));
  });

  it('never lets a topic name itself as its own prerequisite', () => {
    const tree = buildSkillTree([schema('c', 'Action potential', [3], 1, report('Action potential', ['Action potential', 'Ion gradients']), 3)]);
    expect(tree.nodes.map((node) => node.id).sort()).toEqual([gapId('Ion gradients'), 'c'].sort());
    // The self-named entry produced no edge and no "gap" for the topic itself.
    expect(tree.gaps).toEqual([gapId('Ion gradients')]);
    expect(tree.nodes.find((node) => node.id === 'c')!.requires).toEqual([gapId('Ion gradients')]);
  });

  it('survives two topics that name each other, and empty or malformed libraries', () => {
    const cycle = buildSkillTree([
      schema('alpha', 'Alpha dynamics', [0], 1, report('Alpha dynamics', ['Beta kinetics']), 1),
      schema('beta', 'Beta kinetics', [1], 1, report('Beta kinetics', ['Alpha dynamics']), 2),
    ]);
    expect(cycle.nodes.find((node) => node.id === 'alpha')!.requires).toEqual(['beta']);
    expect(cycle.nodes.find((node) => node.id === 'beta')!.requires).toEqual(['alpha']);
    expect(Number.isFinite(cycle.columns)).toBe(true);

    const empty = buildSkillTree([]);
    expect(empty).toEqual({ nodes: [], gaps: [], columns: 0, hasAudits: false });
    const malformed = buildSkillTree([{ ...schema('x', 'No stages', [0], 0), activities: [] }, undefined as unknown as SavedSchema]);
    expect(malformed.nodes).toEqual([]);
    expect(buildSkillTree([schema('no-audit', 'Plain topic', [0], 1)]).hasAudits).toBe(false);
  });
});
