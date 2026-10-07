// ─── The Question-First Inquisitor: the contract ────────────────────────────
//
// A learner arrives with an intuition and no way to know whether it is
// rigorous: *Taylor series = kinematic derivative matching*, *breaking bonds
// releases energy*, *concentrating a weak acid makes it stronger*. The default
// study surface answers by test-taking — it asks them to produce the textbook
// phrasing back. That teaches nothing, because the textbook phrasing was never
// the difficulty. The difficulty is whether the intuition SURVIVES.
//
// So the inquisitor answers as a verifier, not a tutor, and it does so in the
// order the learner actually needs:
//
//   1. the verdict, on line one;
//   2. the governing law, and whether it forces the claim or fails to;
//   3. the exact edge case where it breaks, if there is one.
//
// Three deliberate refusals shape the contract, and each one is a failure mode
// this app has been bitten by before:
//
//   * **No preamble.** "Great question!" and "let's unpack that" are four lines
//     of nothing in front of the thing that was asked for. The first token of
//     the response is the verdict.
//   * **No invented boundary.** A model asked for a failure case will produce
//     one whether or not it exists — "in extreme cases" is not a failure case.
//     A claim with no known edge is `TRUE`, and the parser downgrades a
//     tripwire verdict that arrives without one rather than displaying a
//     boundary the model made up.
//   * **No verdict without the fix.** `FALSE` demands the construction that
//     does hold. "Incorrect" alone is the grader this app refuses to be.
//
// The verdict taxonomy is closed on purpose. `PARTIALLY_TRUE`, `IT_DEPENDS` and
// `NUANCED` all bottom out at "name the context" or "name the case", which is
// what `TRUE_WITH_BOUNDARY_TRIPWIRE` already means — a fourth verdict would
// only be a way to avoid saying which.
//
// What the closed taxonomy DOES need is somewhere to put the context, because
// an observational claim — "elevated cortisol causes immunosuppression", true
// chronically and false in the acute stress response — is not a hedge and not
// vague: it is exactly true inside a named regime. So a context-dependent claim
// is `TRUE_WITH_BOUNDARY_TRIPWIRE` with the regimes on record: `contextAxis`
// names the axis (acute vs chronic, dose, in vitro vs in vivo) and the tripwire
// names the end of it where the claim fails. "It depends" stays refused; naming
// what it depends on is the answer.
//
// The same reasoning applies to the claim that was interrogated. Restating a
// topic into the checkable claim it should have been is a service; swapping in
// a different subject, quantity or mechanism is not, and a verdict on a
// sentence the learner did not write is worse than no verdict — which is what
// `claimsMatch` and the `claimDrift` refusal are for.

import { Type } from '@google/genai';

export const INQUISITOR_VERDICTS = ['TRUE', 'FALSE', 'TRUE_WITH_BOUNDARY_TRIPWIRE'] as const;

export type InquisitorVerdict = (typeof INQUISITOR_VERDICTS)[number];

/** One line per verdict, used by the UI chip and by the prompt. */
export const VERDICT_LABELS: Record<InquisitorVerdict, string> = {
  TRUE: 'Rigorous as stated',
  FALSE: 'Not rigorous',
  TRUE_WITH_BOUNDARY_TRIPWIRE: 'Rigorous, with a boundary',
};

/** A read of one claim. Every field is required except the tripwire/correction pair. */
export interface InquisitorRead {
  verdict: InquisitorVerdict;
  /**
   * The claim as it was interrogated, quoted back. A vague input is restated
   * as the checkable claim it should have been, so a misreading is visible
   * instead of hidden — and when it differs from the learner's own sentence the
   * panel labels it as a restatement rather than passing it off as theirs.
   */
  claim: string;
  /** The governing law and why it does or does not force the claim. 2–4 lines. */
  proof: string[];
  /** The exact edge case. Required by `TRUE_WITH_BOUNDARY_TRIPWIRE`. */
  tripwire: string;
  /** The construction that does hold. Required by `FALSE`. */
  correction: string;
  /**
   * The regimes the claim's truth is conditional on — "acute vs chronic",
   * "dose: low vs high", "in vitro vs in vivo". Empty for a claim whose truth
   * does not turn on a regime.
   *
   * This is the field that makes an observational claim answerable without a
   * fourth verdict: the axis is where the context lives, and it is only accepted
   * when it actually contrasts two regimes (see `hasContrastingAxis`).
   */
  contextAxis: string;
}

/** Real reads bottom out in a couple of lines; more is a lecture. */
export const MAX_PROOF_LINES = 4;

export const INQUISITOR_SYSTEM_PROMPT = `You are the Question-First Inquisitor. The learner hands you a claim — often an intuition they built themselves, sometimes a rule they suspect is false — and you verify it against the governing law.

You are not a tutor and not a cheerleader. Do not praise the question, do not summarise it, do not say "let's unpack that". The FIRST token of your response is the verdict. The learner can read the whole answer in ten seconds and the proof in a minute.

[ 01 ] VERDICT — exactly one of:
  TRUE                        the claim is rigorous as stated.
  FALSE                       it is not, and there is a construction that is.
  TRUE_WITH_BOUNDARY_TRIPWIRE rigorous inside a domain, with a named edge
                              where it stops holding.

  A claim is not TRUE merely because it is intuitive, and not FALSE merely
  because it is unconventional. A learner's own analogy is TRUE when the
  structure it maps actually carries the conclusion — say which structure.

  "It depends" is never the verdict. When a claim's truth turns on the regime —
  an observational claim, a biological or clinical one, anything whose answer
  changes with dose, time or system — it is TRUE_WITH_BOUNDARY_TRIPWIRE: the
  context is the boundary, and you name it (see [ 05 ]).

[ 02 ] PROOF — 2 to ${MAX_PROOF_LINES} lines. Line one names the governing law or invariant (conservation, Coulomb, the definition of the derivative, a rate law, a dimensional necessity). The remaining lines derive the claim from it, or show exactly where the derivation fails. Never "it depends" and never "both are true in different contexts" without naming the context in that same line.

[ 03 ] BOUNDARY TRIPWIRE — only for TRUE_WITH_BOUNDARY_TRIPWIRE: the exact counterexample or regime where it breaks, as a thing the learner can hold (a named function, a named condition, a specific physical regime). "In extreme cases" and "at very large values" are NOT tripwires. If you cannot name one, the verdict is TRUE. Never manufacture a boundary to have something to say — a fabricated edge teaches a limit that does not exist.

[ 04 ] CORRECTION — only for FALSE: the construction that does hold, written out. NEVER return FALSE without it. A verdict with no fix is the grader this surface exists to replace.

CLAIM FIELD — quote the claim you actually interrogated. If the input is too vague to be false — a topic, a question, a label — restate it as the checkable claim it should have been and interrogate THAT, so the learner sees the claim you tested rather than being graded on a claim they did not make.

  Restating is for vagueness, never for convenience: keep every term the
  learner wrote — every subject, quantity, direction and mechanism. Swapping one
  out changes the claim, and a verdict on a sentence they did not write is worse
  than no verdict at all.

[ 05 ] CONTEXT AXIS — set "contextDependent" true when the claim's truth turns on
  the regime, and then NAME THE AXIS: the two ends it flips between, as a pair —
  "acute vs chronic", "dose: low vs high", "in vitro vs in vivo", "time since
  exposure: hours vs weeks", "above vs below the melting point".
  A one-word axis is not an axis, and "it depends", "in some cases" and "it varies"
  are refusals to answer rather than answers: the axis is the pair of conditions
  you would draw at the two ends of a diagram, and naming it IS the answer.

  When contextDependent is true the verdict IS TRUE_WITH_BOUNDARY_TRIPWIRE: the
  tripwire names the end of the axis where the claim fails, and the axis names
  both ends. A context-dependent claim returned as plain TRUE is refused rather
  than shown, because it would hide the condition the claim turns on.

HARD RULE on arithmetic: never compute, re-derive or invent a numeric value to make a point. If a ratio or a limit is the argument, name the two quantities being compared and let the learner do the division. A wrong number in a verdict about rigour destroys the verdict.

No filler. No restating the input. No questions back to the learner: the turn ends with the correction or the tripwire.`;

/** The structured output the route asks for. Descriptions carry the rules. */
export const inquisitorSchema = {
  type: Type.OBJECT,
  properties: {
    verdict: {
      type: Type.STRING,
      description:
        "Exactly one of TRUE, FALSE, TRUE_WITH_BOUNDARY_TRIPWIRE. FALSE requires a correction; TRUE_WITH_BOUNDARY_TRIPWIRE requires a concrete, named tripwire.",
    },
    claim: {
      type: Type.STRING,
      description:
        'The claim you interrogated, quoted back verbatim. If the input was too vague to be false, restate it as the checkable claim it should have been and interrogate that.',
    },
    proof: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        `2-${MAX_PROOF_LINES} lines. The first names the governing law or invariant; the rest derive the claim from it or show where the derivation fails. No "it depends" without naming what it depends on.`,
    },
    tripwire: {
      type: Type.STRING,
      description:
        "TRUE_WITH_BOUNDARY_TRIPWIRE only: the exact counterexample, function or physical regime where the claim stops holding. Empty string when the claim is TRUE. Never an invented or vague boundary.",
    },
    contextDependent: {
      type: Type.BOOLEAN,
      description:
        "True when the claim's truth turns on a regime (dose, time, acute vs chronic, in vitro vs in vivo). A context-dependent claim is TRUE_WITH_BOUNDARY_TRIPWIRE with the axis named, never a plain TRUE.",
    },
    contextAxis: {
      type: Type.STRING,
      description:
        'The regimes the claim is conditional on, as a contrasting PAIR: "acute vs chronic", "dose: low vs high", "in vitro vs in vivo". Empty string when contextDependent is false. A single word or "it depends" is not an axis.',
    },
    correction: {
      type: Type.STRING,
      description:
        'FALSE only: the construction that does hold, written out. Empty string otherwise. Never return FALSE with this empty.',
    },
  },
  required: ['verdict', 'claim', 'proof'],
};

export interface InquisitorRequestContext {
  /** What the learner is working on, when a session exists. */
  topic?: string;
  /** The stage or source the claim came from, when there is one. */
  domain?: string;
  /** Source text the verdict should stay inside, when one exists. */
  contextSnippet?: string;
}

/**
 * The user turn. The claim goes last and unlabelled, because it is the thing
 * being interrogated — anything after it would be new instructions.
 */
export function buildInquisitorUserPrompt(
  claim: string,
  context: InquisitorRequestContext = {}
): string {
  const scope: string[] = [];
  if (context.topic) scope.push(`TOPIC: ${context.topic}`);
  if (context.domain) scope.push(`DOMAIN: ${context.domain}`);
  if (context.contextSnippet) scope.push(`SOURCE CONTEXT: ${context.contextSnippet}`);

  const header = scope.length > 0 ? `${scope.join('\n')}\n\n` : '';
  return `${header}CLAIM UNDER INTERROGATION:\n${claim.trim()}\n\nVerify it and output strictly valid JSON.`;
}
