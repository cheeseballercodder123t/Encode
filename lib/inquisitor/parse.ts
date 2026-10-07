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

/** Why a read was refused. The route surfaces this verbatim. */
export const REFUSAL_MESSAGES = {
  noClaim: 'Nothing to interrogate — state the claim as a sentence that could be false.',
  noVerdict: 'The verdict came back outside the three this surface accepts.',
  noProof: 'A verdict with no proof is not an answer — nothing was shown.',
  noCorrection:
    'A false verdict arrived without the construction that does hold. Nothing was shown rather than a bare "incorrect".',
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
export function normalizeInquisitorRead(raw: unknown): InquisitorParseResult {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const claim = collapse(data.claim);
  if (!claim) return refusal('noClaim');

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
    read: {
      verdict: resolved,
      claim,
      proof,
      // A tripwire belongs only to the verdict that carries one; a TRUE read
      // never renders one.
      tripwire: resolved === 'TRUE_WITH_BOUNDARY_TRIPWIRE' ? tripwire : '',
      correction: resolved === 'FALSE' ? correction : '',
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
