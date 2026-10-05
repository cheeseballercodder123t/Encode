import type { SavedSchema, StageResponse } from './types';

/**
 * Course-level prerequisite skill tree.
 *
 * The app already asks one question per topic — "what foundations does this
 * assume?" — and the learner answers it: /api/prerequisites returns 2 to 4
 * named concepts, and every saved schema that ran that audit carries the list.
 * This module turns those persisted lists into one graph across the whole
 * library, so a learner can see what is done, what is half-done, and which
 * foundations they still have to build before a topic will hold.
 *
 * Three deliberate constraints, matching the rest of the codebase:
 *
 *   · No model call and no invented data. Every node comes from a saved schema
 *     or a prerequisite the learner already paid for; every edge is a
 *     prerequisite the audit actually named for that topic.
 *   · Coverage is decided locally and conservatively. A prerequisite is
 *     "covered" only when a saved topic matches its name by normalization or by
 *     whole-token containment of at least two significant words — never by a
 *     fuzzy score, so a shared word like "energy" cannot link unrelated work.
 *   · Progress is read from the learner's own responses, never from a flag: a
 *     stage counts as encoded when it carries written work or a revealed toy
 *     model, which is exactly what the exporters treat as finished.
 */

export type SkillState = 'mastered' | 'in-progress' | 'locked';

export interface SkillNode {
  id: string;
  kind: 'course' | 'prereq';
  label: string;
  state: SkillState;
  /** Course: how many stages carry work. Prereq: why it matters. */
  detail: string;
  /** Node ids that must be met before this one. */
  requires: string[];
  /** Layout column: 0 is the foundation layer, higher sits on top of it. */
  depth: number;
  /** Prereq only: the audit's own primer for the concept. */
  primer?: string;
}

export interface SkillTree {
  nodes: SkillNode[];
  /** Locked prerequisite concepts with no covering course, alphabetically. */
  gaps: string[];
  /** Number of layout columns a renderer needs. */
  columns: number;
  /** True when at least one saved schema carried a prerequisite audit. */
  hasAudits: boolean;
}

const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'in', 'on', 'to', 'for', 'with', 'by', 'its', 'their', 'from', 'into', 'at', 'as']);

/** Lowercase, strip punctuation, drop stopwords — a stable comparison key. */
export function normalizeConcept(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .split(/[\s-]+/)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token))
    .join(' ')
    .trim();
}

/**
 * Conservative match between a course topic and a prerequisite concept name.
 *
 * Equal after normalization, or one name's significant tokens are fully
 * contained in the other's AND the shorter name has at least two of them. That
 * second condition is the important one: single-word concepts are too ambiguous
 * to link courses automatically ("Energy", "Cell", "Stress" all appear across
 * unrelated subjects), so a one-word prerequisite never claims coverage.
 */
export function conceptMatches(topic: string, concept: string): boolean {
  const a = normalizeConcept(topic);
  const b = normalizeConcept(concept);
  if (!a || !b) return false;
  if (a === b) return true;
  const tokensA = new Set(a.split(' '));
  const tokensB = new Set(b.split(' '));
  const [shorter, longer] = tokensA.size <= tokensB.size ? [tokensA, tokensB] : [tokensB, tokensA];
  if (shorter.size < 2) return false;
  for (const token of shorter) if (!longer.has(token)) return false;
  return true;
}

/** A stage counts as encoded when it carries written work or a revealed lab. */
export function hasStageWork(response?: StageResponse): boolean {
  if (!response) return false;
  if (response.toyModelProgress?.revealed === true) return true;
  return [response.field1, response.field2, response.field3].some((value) => typeof value === 'string' && value.trim().length > 0);
}

export function encodedStageCount(schema: SavedSchema): number {
  return (schema.activities || []).filter((activity) => hasStageWork(schema.userResponses?.[activity.id])).length;
}

export function isSchemaComplete(schema: SavedSchema): boolean {
  const activities = schema.activities || [];
  return activities.length > 0 && activities.every((activity) => hasStageWork(schema.userResponses?.[activity.id]));
}

/** Stable id for a prerequisite concept that has no course in the library. */
export function gapId(concept: string): string {
  return `prereq:${normalizeConcept(concept)}`;
}

/**
 * Builds the library-wide skill tree. Pure and deterministic: the same library
 * always yields the same nodes in the same order, so tests can pin it.
 */
export function buildSkillTree(schemas: SavedSchema[]): SkillTree {
  // Newest wins when an id appears twice (localStorage cache plus IndexedDB
  // hydration can both carry it), and an empty schema is not a course.
  const byId = new Map<string, SavedSchema>();
  for (const schema of schemas || []) {
    if (!schema || !Array.isArray(schema.activities) || schema.activities.length === 0) continue;
    const id = String(schema.id || schema.topicSummary || '');
    if (!id) continue;
    const existing = byId.get(id);
    if (!existing || (schema.timestamp || 0) >= (existing.timestamp || 0)) byId.set(id, schema);
  }
  const courses = [...byId.values()];

  const nodes = new Map<string, SkillNode>();
  const hasAudits = courses.some((schema) => (schema.prerequisites?.prerequisites?.length ?? 0) > 0);

  for (const schema of courses) {
    const total = schema.activities.length;
    const done = encodedStageCount(schema);
    nodes.set(schema.id, {
      id: schema.id,
      kind: 'course',
      label: schema.topicSummary || 'Untitled schema',
      state: done === total ? 'mastered' : 'in-progress',
      detail: `${done} of ${total} stages encoded`,
      requires: [],
      depth: 0,
    });
  }

  for (const schema of courses) {
    const course = nodes.get(schema.id)!;
    for (const item of schema.prerequisites?.prerequisites ?? []) {
      if (!item?.name) continue;
      // A topic that names itself is a quirk of the audit, not a gap: the
      // learner is demonstrably working on it right now.
      if (normalizeConcept(item.name) === normalizeConcept(schema.topicSummary)) continue;
      // A prerequisite the learner has already built gets a real edge to the
      // course that covers it; the course's own colour is then the state of
      // that foundation. Only an uncovered concept becomes a locked leaf.
      const covering = courses
        .filter((candidate) => candidate.id !== schema.id && conceptMatches(candidate.topicSummary, item.name))
        .sort((a, b) => (Number(isSchemaComplete(b)) - Number(isSchemaComplete(a))) || (b.timestamp || 0) - (a.timestamp || 0));
      if (covering.length > 0) {
        if (!course.requires.includes(covering[0].id)) course.requires.push(covering[0].id);
        continue;
      }
      const id = gapId(item.name);
      if (!nodes.has(id)) {
        nodes.set(id, {
          id,
          kind: 'prereq',
          label: item.name,
          state: 'locked',
          detail: item.importance || 'Named as a prerequisite by the source audit.',
          requires: [],
          depth: 0,
          primer: item.primerSummary,
        });
      }
      if (!course.requires.includes(id)) course.requires.push(id);
    }
  }

  // Depth: a course sits one layer above the deepest thing it requires. A
  // memorized walk breaks any cycle (two topics that name each other) instead of
  // recursing forever, and the cycle is visible as an edge either way.
  const depthOf = (id: string, seen: Set<string>): number => {
    const node = nodes.get(id);
    if (!node) return 0;
    if (node.kind === 'prereq' || node.requires.length === 0) return 0;
    if (seen.has(id)) return 0;
    seen.add(id);
    const depth = node.requires.reduce((max, child) => Math.max(max, depthOf(child, seen) + (nodes.get(child)?.kind === 'course' ? 1 : 0)), 0);
    seen.delete(id);
    return depth;
  };
  for (const node of nodes.values()) node.depth = depthOf(node.id, new Set());

  const stateRank: Record<SkillState, number> = { locked: 0, 'in-progress': 1, mastered: 2 };
  const nodesArr = [...nodes.values()].sort(
    (a, b) => a.depth - b.depth || stateRank[a.state] - stateRank[b.state] || a.label.localeCompare(b.label)
  );
  const gaps = nodesArr.filter((node) => node.state === 'locked').map((node) => node.id);
  const columns = nodesArr.reduce((max, node) => Math.max(max, node.depth + 1), 0);
  return { nodes: nodesArr, gaps, columns, hasAudits };
}
