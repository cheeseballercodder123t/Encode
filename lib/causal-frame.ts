// ─── Causal Mad-Libs (one connected sentence instead of three boxes) ────────
//
// Three labelled textareas ("Mechanism", "Causal Link", "Anchor") leave the
// learner guessing what belongs where, and the guesses drift apart: box 1 ends
// up describing the trigger, box 2 the consequence, box 3 a definition. The
// sentence the examiner actually wants is Trigger → physical motion → direct
// effect → macro consequence, and the fastest way to get that shape is to give
// up the boxes and provide the SYNTAX of the deduction with blanks in it.
//
// The encoder writes the frame (a sentence template carrying [[1]] / [[2]] /
// [[3]] markers) when it can. When it cannot — older schemas, the offline
// generator, a thin note — the frame is derived from the stage's own scaffold
// labels as a structural chain, so the sentence mode is never unavailable.
//
// The data model does not change: the blanks ARE field1/field2/field3.

import type { Activity } from './types';

export type CausalFieldKey = 'field1' | 'field2' | 'field3';

type ScaffoldLabelKey = 'field1Label' | 'field2Label' | 'field3Label';
type ScaffoldPlaceholderKey = 'field1Placeholder' | 'field2Placeholder' | 'field3Placeholder';

const LABEL_KEY: Record<CausalFieldKey, ScaffoldLabelKey> = {
  field1: 'field1Label',
  field2: 'field2Label',
  field3: 'field3Label',
};

const PLACEHOLDER_KEY: Record<CausalFieldKey, ScaffoldPlaceholderKey> = {
  field1: 'field1Placeholder',
  field2: 'field2Placeholder',
  field3: 'field3Placeholder',
};

export interface CausalFrameSlot {
  field: CausalFieldKey;
  /** Shown inline before the blank, e.g. "Trigger". */
  label: string;
  placeholder: string;
}

export type CausalFramePart =
  | { kind: 'text'; text: string }
  | { kind: 'slot'; slot: CausalFrameSlot };

export interface CausalFrame {
  parts: CausalFramePart[];
  /** 'ai' when the encoder supplied the template, 'derived' otherwise. */
  source: 'ai' | 'derived';
  /** The stage's boundary condition, rendered as a trailing read-only clause. */
  constraint?: string;
}

const SLOT_RE = /\[\[([123])\]\]/g;

const FIELD_BY_INDEX: Record<string, CausalFieldKey> = {
  '1': 'field1',
  '2': 'field2',
  '3': 'field3',
};

/** The stage's own label/placeholder win: they are written for this stage. */
function slotFor(
  activity: Activity,
  field: CausalFieldKey,
  fallbackLabel: string,
  fallbackPlaceholder: string
): CausalFrameSlot {
  const scaffold = activity.scaffold;
  const label = (scaffold?.[LABEL_KEY[field]] || '').trim() || fallbackLabel;
  const placeholder = (scaffold?.[PLACEHOLDER_KEY[field]] || '').trim() || fallbackPlaceholder;
  return { field, label, placeholder };
}

/**
 * Parses an AI-written frame. Strict on purpose: a template with a repeated or
 * out-of-range marker, or fewer than two blanks, is not a sentence — it is a
 * formatting accident, and falling back to the structural frame is better than
 * rendering something the learner has to decode.
 */
export function parseCausalFrame(template: string | undefined, activity: Activity): CausalFrame | null {
  const raw = (template || '').trim();
  if (!raw || !raw.includes('[[')) return null;

  const parts: CausalFramePart[] = [];
  const used = new Set<CausalFieldKey>();
  let cursor = 0;
  let match: RegExpExecArray | null;
  SLOT_RE.lastIndex = 0;

  while ((match = SLOT_RE.exec(raw)) !== null) {
    const key = FIELD_BY_INDEX[match[1]];
    // A repeat would mean the same answer fills two blanks; reject the frame.
    if (used.has(key)) return null;
    used.add(key);
    const before = raw.slice(cursor, match.index);
    if (before) parts.push({ kind: 'text', text: before });
    parts.push({ kind: 'slot', slot: slotFor(activity, key, 'Answer', 'Explain in your own words…') });
    cursor = match.index + match[0].length;
  }

  const tail = raw.slice(cursor);
  if (tail) parts.push({ kind: 'text', text: tail });
  if (used.size < 2) return null;
  // A frame that is only blanks ("[[1]] [[2]]") is not syntax; derive instead.
  if (!parts.some((p) => p.kind === 'text' && p.text.trim().length > 1)) return null;

  return { parts, source: 'ai' };
}

/**
 * Structural fallback: the stage's three labels joined by causal connectives,
 * so the blanks read as one deduction instead of three unrelated answers.
 */
export function deriveCausalFrame(activity: Activity): CausalFrame {
  const first = slotFor(activity, 'field1', 'Trigger', 'What sets it off?');
  const second = slotFor(activity, 'field2', 'Mechanism', 'What physically happens?');
  const parts: CausalFramePart[] = [
    { kind: 'text', text: 'When ' },
    { kind: 'slot', slot: first },
    { kind: 'text', text: ', then ' },
    { kind: 'slot', slot: second },
  ];

  const hasThird = Boolean(activity.scaffold?.field3Label);
  if (hasThird) {
    const third = slotFor(activity, 'field3', 'Consequence', 'What does that force?');
    parts.push({ kind: 'text', text: ', which forces ' }, { kind: 'slot', slot: third });
  }
  parts.push({ kind: 'text', text: '.' });
  return { parts, source: 'derived' };
}

/** AI frame when valid, derived frame otherwise. Never null. */
export function buildCausalFrame(activity: Activity | undefined): CausalFrame | null {
  if (!activity) return null;
  const frame =
    parseCausalFrame(activity.scaffold?.causalFrame, activity) ?? deriveCausalFrame(activity);
  const rule = activity.boundaryContrast?.distinguishingRule?.trim();
  return rule ? { ...frame, constraint: rule } : frame;
}

/** The slots of a frame, in sentence order. */
export function frameSlots(frame: CausalFrame): CausalFrameSlot[] {
  return frame.parts.flatMap((p) => (p.kind === 'slot' ? [p.slot] : []));
}

/** Renders the frame with the current values — used for the answer preview. */
export function frameToSentence(frame: CausalFrame, values: Partial<Record<CausalFieldKey, string>>): string {
  const body = frame.parts
    .map((p) => (p.kind === 'text' ? p.text : (values[p.slot.field] || '').trim()))
    .join('');
  return frame.constraint ? `${body} — unless ${frame.constraint}` : body;
}
