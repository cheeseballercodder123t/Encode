// ─── Mr M mode: payload contracts ───────────────────────────────────────────
//
// Mr M mode is a learning-style overlay for one learner: an intensely
// deductive, first-principles thinker who cannot hold a procedural recipe that
// has no physical mechanism attached to it. These are the payloads the encoder
// emits for it, and the shapes every surface in `components/mr-m/` renders.
//
// Everything here is plain data with no imports, so `lib/templates/types.ts`
// can reference `MrMPayload` on `ActivityVisualData` without creating an import
// cycle back through `lib/types.ts`.
//
// Design rule for the whole feature: a payload that is missing is *silent*.
// Every block is optional, and a surface whose payload is absent does not
// render — there is no placeholder state and no invented content.

/** The coordinate system a stage's procedure sits inside. */
export interface AxiomFirst {
  /** The governing law, stated as physics rather than as a rule to memorise. */
  governingLaw: string;
  /** Where the zero point lives — "sea level" for this quantity. */
  coordinateOrigin: string;
  /** Why *this* is the zero and not something else. */
  zeroPoint: string;
  /** Why the definition is ordered the way it is (products − reactants, broken − formed). */
  whyThisDefinition: string;
  /** The same idea translated into calculus or an invariant, when one exists. */
  calculusTranslation?: string;
  /** The sharpest counterexample to the stated law, and why the law survives it. */
  counterexample?: string;
}

/** The physical identity of one letter in the stage's formula. */
export interface OntologyCard {
  symbol: string;
  /** What this quantity physically IS — "the mass of the water, not the solid". */
  physicalIdentity: string;
  unit?: string;
  /** The most common misreading, named so it can be rejected. */
  whatItIsNot?: string;
  /** What happens to the readout when this doubles. */
  doublesTo?: string;
}

/** One rule-consuming step in a linear decomposition. */
export interface MachineStep {
  stepNumber: number;
  /** What the learner does at this step. */
  action: string;
  /** The ONE rule this step consumes, so working memory never holds two. */
  holdsInHead: string;
  /** What they are holding when the step finishes. */
  output?: string;
}

export interface PerturbationVariable {
  symbol: string;
  /** The value the stage's own numbers use — the slider's home position. */
  base: number;
  min?: number;
  max?: number;
  unit?: string;
  /**
   * How this variable enters the invariant: `+1` when the readout scales with
   * it, `-1` when it sits in a denominator, `2` for an inverse square.
   */
  exponent: number;
}

export interface PerturbationLimitNote {
  symbol: string;
  /** What the system does at this variable's extreme, in plain language. */
  note: string;
}

export interface PerturbationModel {
  /** The invariant being stressed, shown to the learner unchanged. */
  invariant: string;
  variables: PerturbationVariable[];
  limitNotes?: PerturbationLimitNote[];
}

/** Everything Mr M mode adds to one stage. Absent blocks are simply not rendered. */
export interface MrMPayload {
  axiomFirst?: AxiomFirst;
  ontology?: OntologyCard[];
  stateMachine?: MachineStep[];
  perturbation?: PerturbationModel;
}

// ─── Trap taxonomy ──────────────────────────────────────────────────────────
//
// A wrong answer is diagnosed by its STRUCTURAL failure mode, never by a
// verdict. "Incorrect. The answer is C." teaches nothing; "you dropped the
// subscript, and here is the arithmetic that shows it" is permanent.

export const TRAP_IDS = [
  'reversed_order',
  'missing_subscript',
  'factor_of_two',
  'molar_mass_denominator',
  'unit_slip',
  'limiting_reactant_ignored',
  'mole_ratio_inverted',
  'zero_point_confusion',
  'path_vs_state_confusion',
  'sign_convention_flip',
] as const;

export type TrapId = (typeof TRAP_IDS)[number];

/** Human labels for the autopsy heading. */
export const TRAP_LABELS: Record<TrapId, string> = {
  reversed_order: 'Order reversed',
  missing_subscript: 'Subscript dropped',
  factor_of_two: 'Factor of two lost',
  molar_mass_denominator: 'Atom count in the denominator',
  unit_slip: 'Unit converted wrong',
  limiting_reactant_ignored: 'Limiting reactant ignored',
  mole_ratio_inverted: 'Mole ratio inverted',
  zero_point_confusion: 'Zero point confused',
  path_vs_state_confusion: 'Path vs state confused',
  sign_convention_flip: 'Sign convention flipped',
};

/** What `classifyTrap` is allowed to look at. All pure text. */
export interface TrapInput {
  /** The learner's own words across the stage's answer fields. */
  learnerText: string;
  /** The exemplar / expert completion for the stage, when one exists. */
  expectedText: string;
  /** The stage's source context and prompt — where the correct formula lives. */
  sourceText?: string;
}

/** The deterministic half of a trap-aware autopsy. */
export interface TrapDiagnosis {
  trapId: TrapId;
  /** Why this is structural rather than a slip, in one sentence. */
  structuralReason: string;
  /**
   * The arithmetic the learner can check for themselves, e.g.
   * `0.0336 ÷ 0.0168 = 2.00`. Empty when the trap is not numeric.
   */
  arithmeticReveal: string;
  /** Which step of the chain actually breaks. */
  whereItBreaks: string;
}

/** The model's narrative half, returned alongside the examiner's read. */
export interface TrapAutopsy {
  trapId: TrapId | '';
  /** Why the mistake is structural, in one sentence. */
  structuralReason: string;
  /** The corrected construction, written out. */
  correctedConstruction: string;
  /** Which step of the chain fails. */
  whereItBreaks: string;
}

// ─── Paradox ledger ─────────────────────────────────────────────────────────
//
// Some learners can shrug at a contradiction and memorise around it. This one
// cannot: an unresolved paradox halts everything downstream. So contradictions
// are first-class records — raised, held, and explicitly resolved — instead of
// being lost at the bottom of a chat.

export interface ParadoxEntry {
  id: string;
  topic: string;
  /** The contradiction in the learner's own words. */
  statement: string;
  raisedAt: number;
  resolvedAt?: number;
  /** The sentence that closed it. */
  resolution?: string;
}
