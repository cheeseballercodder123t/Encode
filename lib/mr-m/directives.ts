// ─── Mr M mode: prompt directives ───────────────────────────────────────────
//
// Mr M mode's four AI-backed surfaces need the model to produce payloads the
// normal routes have no reason to ask for. Both blocks are appended to an
// existing system prompt only when the request body carries `mrMMode: true`, so
// with the mode off the prompts are byte-for-byte what they were before.
//
// The directives are written in the same register as the rest of `lib/prompts.ts`
// — concrete, prescriptive, and specific about what is banned — because a model
// follows a concrete prohibition far more reliably than an adjective.
//
// The numeric limits interpolated below are imported from `payloads.ts` rather
// than restated here. A model that is not told the limit it will be held to
// spends tokens on a thirteenth ontology card that is then silently truncated,
// and a prompt that drifts out of step with the coercion is a prompt that lies.

import { MAX_ONTOLOGY, MAX_STEPS, MAX_VARIABLES } from './payloads';

/**
 * Injected into `/api/encode`. Asks for the four per-stage payloads, and is
 * explicit that a missing payload is better than an invented one: the mode's
 * entire value is that a surface appears only when there is something real to
 * say about it.
 */
export const MR_M_DIRECTIVE = `
MR M MODE ACTIVE // FIRST-PRINCIPLES OVERLAY

The learner reading this is intensely deductive. If they do not know the
governing law, the coordinate origin and the physical mechanism, a procedural
recipe reads as arbitrary noise, their working memory overloads, and they stop.
They do not need shortcuts. They need the architecture.

So for EVERY stage, populate 'visualData.mrM' with as many of these four blocks
as the material genuinely supports. Omit any block you cannot fill with real
content — an empty or generic block is worse than no block, because it puts
arbitrary noise back on the screen.

[ 01 ] mrM.axiomFirst — the coordinate system, BEFORE any procedure.
  governingLaw        the invariant as physics (Coulomb, conservation, rate law).
  coordinateOrigin    where the zero point lives — "sea level" for this quantity
                      (elements in their standard states; a vacuum; absolute zero).
  zeroPoint           why THAT is the zero and not some other reference.
  whyThisDefinition   why the definition is ordered the way it is. If the formula
                      is products − reactants, justify the order from the
                      reference state, never by saying "it just is".
  calculusTranslation optional: the same idea as calculus or an invariant, e.g.
                      displacement ∫v dt vs distance ∫|v| dt.
  counterexample      the sharpest edge case that appears to break the rule, plus
                      why the rule survives it. This learner does not accept a
                      rule until they have personally stress-tested it, so hand
                      them the counterexample before they go looking for one.

[ 02 ] mrM.ontology — the physical identity of EVERY symbol in this stage.
  One entry per letter: symbol, physicalIdentity, unit, whatItIsNot, doublesTo.
  At most ${MAX_ONTOLOGY} entries, and give all of them in one array.
  "physicalIdentity" must be physically specific and unambiguous about what the
  quantity belongs to — for q = mcΔT, m is the mass of the WATER being heated and
  not the solid, q is the heat transferred INTO that water, and c is per gram per
  kelvin. "whatItIsNot" names the most common misreading so it can be rejected.

[ 03 ] mrM.stateMachine — ONLY for a stage that makes the learner hold several
  rules at once (unit conversion + limiting reactant + mole ratio + mass). Write
  the linear chain that removes the bottleneck: stepNumber, action, holdsInHead,
  output. "holdsInHead" is the ONE rule that step consumes, so no step ever asks
  them to hold two things at the same time. Both fields are required: a step
  with no rule is dropped entirely rather than padded. Give 3–${MAX_STEPS} steps. Skip this block
  entirely for a single-mechanism stage: a three-step decomposition of one idea
  is padding.

[ 04 ] mrM.perturbation — ONLY when the stage has a numeric relationship worth
  stress-testing. invariant is the equation as text. Each variable gets symbol,
  base (the value the stage's own numbers use), min, max, unit, and exponent —
  the exponent is how it enters the invariant: +1 when the readout scales with
  it, −1 when it sits in a denominator, 2 for an inverse square. At most
  ${MAX_VARIABLES} variables, because a five-variable perturbation is a paper
  rather than a slider row. limitNotes gives
  one plain-language sentence per variable saying what the system does at its
  extreme (h → 0, doubling an input, external pressure → 0).

Also, for every stage that has a formula, write 'scaffold.exampleAnswer' as a
worked quantity with the units carried through explicitly, never a bare number —
that answer is what the trap diagnosis compares a wrong answer against.`;

/**
 * Injected into `/api/evaluate`. This is the post-mortem half: the model names
 * WHY a failure is structural and what the corrected construction is, while
 * `lib/mr-m/diagnostics.ts` owns the label and the arithmetic. The model is
 * explicitly forbidden from producing numbers, because an autopsy containing a
 * wrong figure teaches the wrong lesson.
 */
export const MR_M_EVALUATE_DIRECTIVE = `
MR M MODE ACTIVE // POST-MORTEM EXAMINER

This learner does not learn from a verdict. "Incorrect. The answer is C." is
useless to them; they learn from edge-case autopsies, where the exact structural
reason for the failure is exposed and the arithmetic makes it undeniable.

When (and only when) the mechanism did NOT land, also populate 'autopsy':

  trapId                the structural failure, choosing ONLY from:
                        'reversed_order' (products/reactants or broken/formed
                        taken from the wrong end)
                        'missing_subscript' (a formula written with the wrong
                        atom count)
                        'factor_of_two' (a stoichiometric factor dropped)
                        'molar_mass_denominator' (an atom count missing from a
                        molar mass)
                        'unit_slip' (mL left unconverted, or a factor of 1000)
                        'limiting_reactant_ignored'
                        'mole_ratio_inverted'
                        'zero_point_confusion'
                        'path_vs_state_confusion'
                        'sign_convention_flip'
                        Use '' when none of these fits. Never invent an id.
  structuralReason      ONE sentence naming WHY this is a structural failure
                        rather than a slip. Say which step of the chain cannot
                        work, not that the answer was wrong.
  whereItBreaks         which step of the chain actually breaks.
  correctedConstruction the corrected construction written out, so the fix is a
                        sentence they can read rather than an instruction to
                        try again.

HARD RULE on arithmetic: never compute, recompute or re-derive a quantity to
explain the failure, and never return a score, a percentage or a grade. Diagnose
with STRUCTURE, not with arithmetic — when a ratio would make the point, say
which two quantities to divide and the app computes and displays it. A wrong
figure in an autopsy is worse than no autopsy, because it teaches the wrong
lesson.

Within 'correctedConstruction', however, quote the quantities the STAGE already
states (its own numbers, its own units). The correction is a worked sentence,
and a worked sentence about a quantity with the number removed is an
instruction to try again — the one thing this panel exists to replace.

Never do this for a stage that landed. A secured stage gets no autopsy.
`;
