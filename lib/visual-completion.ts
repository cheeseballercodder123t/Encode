// ─── Interactive diagram completion ─────────────────────────────────────────
//
// A diagram the learner only LOOKS at is a passive visual aid: recognition
// without production, which is exactly the illusion of competence this app
// exists to break. Each template already ships the pieces of its own answer
// (a blanked mapping, a rate-limiting trigger, a cloze node), so the visual can
// be turned into the exercise itself: the familiar side stays, the target side
// is empty, and the learner has to produce the missing link before the diagram
// will show it to them.
//
// One deterministic slot per template — never a random pick, so the same stage
// blanks the same cell on every render, and a reload cannot change the task.
// The ground truth is already in the payload (the learner could read it); this
// is a self-test, and the reward for producing it is that it lands in the card.

import type { Activity } from './types';

export type CompletionKind = 'analogy_target' | 'transition_trigger' | 'causal_node';

export interface CompletionSlot {
  kind: CompletionKind;
  /** What the learner is asked, in one sentence. */
  prompt: string;
  /** The ground truth the blank is hiding. */
  answer: string;
  /** Optional nudge (the stage's own clue/hint text). */
  hint?: string;
  /** Index into the template's own array, so the template can blank the right cell. */
  index: number;
}

/** Case/space/punctuation-insensitive comparison key. */
export function normalizeAnswer(value: string): string {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'is', 'are', 'and', 'or', 'that', 'this',
  'it', 'as', 'by', 'for', 'with', 'from', 'into', 'on', 'at', 'be', 'its',
]);

/**
 * Loose grading: the learner is producing a mechanism, not matching a string.
 * Exact match, containment, or a strong overlap of the answer's content words
 * all count — anything else is a miss, and a miss is the point.
 */
export function gradeCompletion(typed: string, answer: string): boolean {
  const a = normalizeAnswer(answer);
  const t = normalizeAnswer(typed);
  if (!t || !a) return false;
  if (t === a) return true;
  if (a.length >= 6 && (t.includes(a) || a.includes(t))) return true;

  const tokens = (s: string) => s.split(' ').filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  const wanted = tokens(a);
  if (wanted.length === 0) return false;
  const got = new Set(tokens(t));
  const hits = wanted.filter((w) => got.has(w) || [...got].some((g) => g.length > 3 && w.startsWith(g))).length;
  return hits / wanted.length >= 0.6;
}

function asText(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Picks the blank for this stage's template:
 *   - analogy_matrix   : the mapping flagged `isPartialTarget` (the encoder's own
 *                        hole), else the last mapping that actually has a target.
 *   - state_transition : the step flagged `isTriggerState` (the rate-limiting
 *                        transition), else the middle step.
 *   - anything else    : the `mechanism` node of the first-principles chain, else
 *                        a node flagged `isPartialCloze`.
 * Returns null when the payload has nothing to blank, so templates fall back to
 * their static rendering instead of inventing a question.
 */
export function buildCompletion(activity: Activity | undefined): CompletionSlot | null {
  if (!activity) return null;
  const visual: any = activity.visualData || {};
  const template = activity.templateType || '';

  if (template === 'analogy_matrix' || visual.analogyMappings) {
    const mappings: any[] = Array.isArray(visual.analogyMappings) ? visual.analogyMappings : [];
    const flagged = mappings.findIndex((m) => m?.isPartialTarget);
    const withTarget = mappings.map((m, i) => ({ m, i })).filter(({ m }) => asText(m?.targetElement));
    const pick = flagged >= 0 ? flagged : withTarget.length > 0 ? withTarget[withTarget.length - 1].i : -1;
    const chosen = pick >= 0 ? mappings[pick] : null;
    if (!chosen || !asText(chosen.targetElement) || !asText(chosen.sourceElement)) return null;
    const familiar = asText(visual.sourceDomainName) || 'the familiar system';
    return {
      kind: 'analogy_target',
      index: pick,
      prompt: `In ${familiar}, what does “${asText(chosen.sourceElement)}” map to in the target domain?`,
      answer: asText(chosen.targetElement),
      hint: asText(chosen.explanation) || asText(visual.whereAnalogyBreaks) || undefined,
    };
  }

  if (template === 'state_transition' || visual.flowSteps) {
    const steps: any[] = Array.isArray(visual.flowSteps) ? visual.flowSteps : [];
    if (steps.length === 0) return null;
    const flagged = steps.findIndex((s) => s?.isTriggerState);
    const pick = flagged >= 0 ? flagged : Math.floor(steps.length / 2);
    const step = steps[pick];
    const answer = asText(step?.mechanism) || asText(step?.title);
    if (!answer) return null;
    return {
      kind: 'transition_trigger',
      index: pick,
      prompt: `What has to happen for the cycle to enter “${asText(step?.title) || `step ${pick + 1}`}”?`,
      answer,
      hint: asText(visual.resetCondition) || undefined,
    };
  }

  const nodes: any[] = Array.isArray(visual.nodes) ? visual.nodes : [];
  if (nodes.length === 0) return null;
  const flagged = nodes.findIndex((n) => n?.isPartialCloze);
  const mechanism = nodes.findIndex((n) => n?.type === 'mechanism');
  const pick = flagged >= 0 ? flagged : mechanism >= 0 ? mechanism : Math.floor(nodes.length / 2);
  const node = nodes[pick];
  const answer = asText(node?.label) || asText(node?.subtext);
  if (!answer) return null;
  const before = pick > 0 ? asText(nodes[pick - 1]?.label) : '';
  const after = pick < nodes.length - 1 ? asText(nodes[pick + 1]?.label) : '';
  return {
    kind: 'causal_node',
    index: pick,
    prompt: `Fill the blanked node: ${before || 'input'} → ? → ${after || 'outcome'}`,
    answer,
    hint: asText(node?.subtext) || undefined,
  };
}
