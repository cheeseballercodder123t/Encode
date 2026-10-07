// ─── The inquisitor's read, normalized ──────────────────────────────────────
//
// The prompt asks for a verdict, its proof, and the edge case where it breaks.
// This module decides which of those the learner is actually shown, and its job
// is to refuse rather than to repair:
//
//   * A **tripwire verdict with no tripwire** is downgraded to `TRUE`. It cannot
//     be repaired into a boundary, because the only way to repair it is to
//     invent the boundary — and a fabricated edge teaches a limit that does not
//     exist. Believing your intuition has a known boundary when nobody has
//     found one is measurably worse than believing it is simply true.
//   * A **`FALSE` with no correction** is discarded entirely (`null`). The
//     whole reason this surface exists is that "incorrect" teaches nothing;
//     shipping a verdict whose fix is missing is shipping the thing it replaces.
//   * A **read with no proof** is discarded. A verdict is a claim about rigour,
//     and an unsupported claim about rigour is indistinguishable from a coin
//     flip that got lucky.
//
// Everything here is pure and browser-free, so the route validates with it and
// the panel renders from the same rules the tests pin.
//
// The read also knows how to become a ledger entry (see `paradoxDraftFor`): a
// boundary tripwire is precisely the kind of unresolved contradiction the Mr M
// ledger already holds open on purpose.

import { INQUISITOR_VERDICTS, MAX_PROOF_LINES, type InquisitorRead, type InquisitorVerdict } from './contract';

function collapse(text: unknown): string {
  return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
}

/**
 * Verdict coercion.
 *
 * The taxonomy is closed, but models write it loosely (`TRUE WITH BOUNDARY
 * TRIPWIRE`, `TRUE_WITH_TRIPWIRE`, `PARTIALLY_TRUE`). Separators are folded and
 * the tripwire spellings resolve to the one verdict they mean. Anything that is
 * NOT one of the three — including `IT_DEPENDS`, `NUANCED`, `PARTIALLY_TRUE` —
 * is rejected rather than mapped: every one of those means "name the case",
 * and the verdict for "name the case" already exists. Mapping them silently
 * would let a hedge through as a boundary, which is the exact failure the
 * downgrade rule below exists to stop.
 */
export function coerceVerdict(raw: unknown): InquisitorVerdict | null {
  const text = collapse(raw).toUpperCase().replace(/[\s-]+/g, '_');
  if (!text) return null;
  if ((INQUISITOR_VERDICTS as readonly string[]).includes(text)) return text as InquisitorVerdict;
  if (
    text === 'TRUE_WITH_TRIPWIRE' ||
    text === 'BOUNDARY_TRIPWIRE' ||
    text === 'TRUE_WITH_BOUNDARY' ||
    text === 'TRUE_BUT_WITH_A_BOUNDARY'
  ) {
    return 'TRUE_WITH_BOUNDARY_TRIPWIRE';
  }
  return null;
}

// ─── Claim fidelity ─────────────────────────────────────────────────────────
//
// Restating a vague input is the point of the CLAIM FIELD (a topic is not a
// falsifiable sentence, so the checkable version of it has to be written before
// it can be verified). Being graded on a DIFFERENT sentence is the failure on
// the other side of that, and it is the one an observational claim invites:
// "elevated cortisol causes immunosuppression" is a sentence a model can quietly
// turn into "chronic cortisol elevation suppresses immunity", which is a true
// claim about a claim the learner did not make.
//
// So fidelity is checked mechanically: the interrogated sentence has to carry
// the learner's own content words. A restatement that only ADDS detail passes;
// one that swaps the subject, the quantity or the direction does not.

const FIDELITY_STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'is', 'are', 'was', 'were', 'and', 'or',
  'that', 'this', 'it', 'its', 'as', 'by', 'for', 'with', 'on', 'at', 'be',
  'so', 'if', 'then', 'but', 'than', 'from', 'into', 'not', 'no', 'can',
]);

function contentTokens(text: string): string[] {
  return collapse(text)
    .toLowerCase()
    .split(' ')
    .map((word) => word.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''))
    .filter((word) => word.length > 1 && !FIDELITY_STOP_WORDS.has(word));
}

/**
 * True when two sentences say the same thing — the shorter one's content words
 * being at least 80% contained in the longer one's.
 *
 * Deliberately one-directional rather than a symmetric overlap: a restatement
 * that adds the subject, the units or the regime is still the learner's claim,
 * while a restatement that drops or replaces those is not.
 */
export function claimsMatch(a: string, b: string): boolean {
  const first = new Set(contentTokens(a));
  const second = new Set(contentTokens(b));
  if (first.size === 0 || second.size === 0) return false;
  const [smaller, larger] = first.size <= second.size ? [first, second] : [second, first];
  let hits = 0;
  // `Array.from` rather than iterating the Set directly: the repo compiles
  // without `downlevelIteration`, and every other set walk here does the same.
  for (const token of Array.from(smaller)) if (larger.has(token)) hits += 1;
  return hits / smaller.size >= 0.8;
}

// ─── The context axis ───────────────────────────────────────────────────────

/**
 * A hedge dressed as an axis. These are the exact phrasings the prompt tells
 * the model not to use, so seeing one means the context was never named.
 */
const HEDGE_AXIS = /\bit depends\b|\bin some cases\b|\bin certain cases\b|\bit varies\b|\bdepends on the (?:situation|context|circumstances)\b/i;

/**
 * Regime pairs that are a real axis even without an explicit contrast word.
 *
 * "Acute and chronic" names the axis; nothing about the phrase says "vs", and
 * refusing it would reject exactly the answer this field exists to collect.
 */
const CONTRAST_PAIRS: [RegExp, RegExp][] = [
  [/\bacute\b|\bimmediate\b|\bfast\b|\bshort[- ]term\b/i, /\bchronic\b|\bdelayed\b|\bslow\b|\blong[- ]term\b/i],
  [/\blow\b|\bsmall\b|\bdeficient\b/i, /\bhigh\b|\blarge\b|\bexcess\b/i],
  [/\babove\b|\bover\b|\bbeyond\b|\bsupra\b/i, /\bbelow\b|\bunder\b|\bsub\b/i],
  [/\bbefore\b|\bearly\b|\bupstream\b/i, /\bafter\b|\blate\b|\bdownstream\b/i],
  [/\bin vitro\b|\bin silico\b/i, /\bin vivo\b|\bin situ\b/i],
];

/**
 * Does this axis actually contrast two regimes?
 *
 * Conservative on purpose, because the whole value of the field is that it
 * cannot be filled with a shrug. An axis needs TWO ends: either an explicit
 * contrast (`vs`, `versus`), two or more separated clauses (a semicolon or a
 * comma with something either side), or one of the regime pairs above. A single
 * word is not an axis — "dose" is a variable, not a boundary — and a hedge is
 * refused outright.
 */
export function hasContrastingAxis(axis: string): boolean {
  const text = collapse(axis);
  if (!text) return false;
  if (HEDGE_AXIS.test(text)) return false;
  const words = text.split(' ').filter((word) => word.length > 1);
  if (words.length < 2) return false;
  if (/\bvs\.?\b|\bversus\b/i.test(text)) return true;
  const clauses = text.split(/\s*[;,/]\s*/).filter((clause) => clause.trim().length > 2);
  if (clauses.length >= 2) return true;
  return CONTRAST_PAIRS.some(([left, right]) => left.test(text) && right.test(text));
}

/** Why a read was refused. The route surfaces this verbatim. */
export const REFUSAL_MESSAGES = {
  noClaim: 'Nothing to interrogate — state the claim as a sentence that could be false.',
  noVerdict: 'The verdict came back outside the three this surface accepts.',
  noProof: 'A verdict with no proof is not an answer — nothing was shown.',
  noCorrection:
    'A false verdict arrived without the construction that does hold. Nothing was shown rather than a bare "incorrect".',
  noContextAxis:
    'This read says the claim depends on the context without naming the context. Nothing was shown rather than a verdict that hides the condition it turns on.',
  claimDrift:
    'The verdict was about a different sentence than the one you wrote, so nothing was shown. Rewrite the claim as the single checkable sentence you meant.',
} as const;

export type RefusalReason = keyof typeof REFUSAL_MESSAGES;

export interface InquisitorRefusal {
  ok: false;
  reason: RefusalReason;
  message: string;
}

export interface InquisitorSuccess {
  ok: true;
  read: InquisitorRead;
  /** True when a tripwire verdict was downgraded because no tripwire arrived. */
  downgraded: boolean;
  /**
   * True when the interrogated sentence is not the learner's own — a restatement
   * of a vague input. The panel labels it, so the learner can see which sentence
   * the verdict is actually about. Always false when the caller passed no claim.
   */
  claimRestated: boolean;
}

export type InquisitorParseResult = InquisitorSuccess | InquisitorRefusal;

function refusal(reason: RefusalReason): InquisitorRefusal {
  return { ok: false, reason, message: REFUSAL_MESSAGES[reason] };
}

/**
 * Normalizes one model read into what the learner sees, or refuses.
 *
 * `downgraded` is reported rather than silent: the panel says the claim is true
 * *as far as the model could take it*, which is a different statement from
 * "verified with a boundary", and the learner should be able to tell them apart.
 */
export function normalizeInquisitorRead(
  raw: unknown,
  submittedClaim: string = ''
): InquisitorParseResult {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const claim = collapse(data.claim);
  if (!claim) return refusal('noClaim');

  // Fidelity first, before anything is built from the claim: a proof of a
  // sentence the learner did not write is the failure this check exists for, and
  // it has to fire before the proof is worth reading.
  const submitted = collapse(submittedClaim);
  if (submitted && !claimsMatch(claim, submitted)) return refusal('claimDrift');

  const verdict = coerceVerdict(data.verdict);
  if (!verdict) return refusal('noVerdict');

  const proof: string[] = [];
  const seen = new Set<string>();
  const rawProof = Array.isArray(data.proof) ? data.proof : [];
  for (const line of rawProof) {
    const text = collapse(line);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    proof.push(text);
    if (proof.length >= MAX_PROOF_LINES) break;
  }
  if (proof.length === 0) return refusal('noProof');

  const tripwire = collapse(data.tripwire);
  const correction = collapse(data.correction);
  const contextDependent = data.contextDependent === true;
  const contextAxis = collapse(data.contextAxis);

  // The context axis is checked BEFORE the downgrade, because a claim the model
  // itself calls context-dependent has exactly one honest shape: a bounded
  // verdict with the regimes named. Downgrading it to TRUE would hide the
  // condition the claim turns on, which is the one thing this field exists to
  // stop. A plain TRUE that arrived with contextDependent set is refused rather
  // than repaired, for the same reason a tripwire verdict with no tripwire is.
  if (contextDependent) {
    if (verdict !== 'TRUE_WITH_BOUNDARY_TRIPWIRE') return refusal('noContextAxis');
    if (!hasContrastingAxis(contextAxis)) return refusal('noContextAxis');
    if (!tripwire) return refusal('noContextAxis');
  }

  // The two repairs, in order of how much they matter.
  let resolved: InquisitorVerdict = verdict;
  let downgraded = false;
  if (verdict === 'TRUE_WITH_BOUNDARY_TRIPWIRE' && !tripwire) {
    resolved = 'TRUE';
    downgraded = true;
  }
  if (verdict === 'FALSE' && !correction) return refusal('noCorrection');

  return {
    ok: true,
    downgraded,
    // A restatement is any read whose sentence is not the learner's own, now
    // that it has already been shown to carry their content words. The panel
    // labels it, so "what was interrogated" is never passed off as "what you
    // wrote".
    claimRestated: Boolean(submitted) && submitted.toLowerCase() !== claim.toLowerCase(),
    read: {
      verdict: resolved,
      claim,
      proof,
      // A tripwire belongs only to the verdict that carries one; a TRUE read
      // never renders one.
      tripwire: resolved === 'TRUE_WITH_BOUNDARY_TRIPWIRE' ? tripwire : '',
      correction: resolved === 'FALSE' ? correction : '',
      // Same rule for the axis: it belongs to the bounded verdict, and a stray
      // one on a plain read is not rendered.
      contextAxis: resolved === 'TRUE_WITH_BOUNDARY_TRIPWIRE' ? contextAxis : '',
    },
  };
}

/** A draft entry for the Mr M paradox ledger. */
export interface ParadoxDraft {
  topic: string;
  statement: string;
}

/**
 * The bridge into the existing paradox ledger.
 *
 * A boundary tripwire IS a live contradiction: the claim holds, and there is a
 * named case where it does not. This learner cannot shrug at that and memorise
 * around it — the ledger exists precisely to hold such a thing in plain sight
 * until a sentence closes it. A plain `TRUE` has nothing to hold open, and a
 * `FALSE` is already resolved by its correction, so both yield null. Nothing
 * is raised automatically: the panel offers the draft and the learner commits
 * it, the same way the autopsy offers a trap card and never writes one.
 */
export function paradoxDraftFor(read: InquisitorRead, topic: string): ParadoxDraft | null {
  if (read.verdict !== 'TRUE_WITH_BOUNDARY_TRIPWIRE') return null;
  const statement = collapse(`${read.claim} — yet ${read.tripwire}`);
  if (!read.tripwire.trim() || !statement) return null;
  return { topic: collapse(topic) || 'Untitled', statement };
}

/** A short line for the ledger panel and for logs. */
export function describeInquisitorRead(read: InquisitorRead): string {
  if (read.verdict === 'TRUE_WITH_BOUNDARY_TRIPWIRE') return 'Rigorous, with one boundary to close.';
  if (read.verdict === 'FALSE') return 'Not rigorous as stated — the correction is below.';
  return 'Rigorous as stated.';
}
