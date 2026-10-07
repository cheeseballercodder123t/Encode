import React, { lazy } from 'react';
import type { Activity, StageResponse } from '@/lib/types';
import type { ConfidenceTier } from '@/lib/interference-traps';
import type { MrMPayload, ParadoxEntry, PatchEntry, TrapAutopsy } from './types';
import type { AutopsyDiagnosis } from './trap-card';
import { mrMOf } from './payloads';

// ─── Mr M mode: the intervention registry ───────────────────────────────────
//
// Same shape as `lib/templates/registry.ts`, deliberately. A declarative
// metadata table plus a lazy component table plus `registerIntervention()`, so
// adding a seventh surface is "register it" and never "go edit the surface that
// draws them". One resolver (`MisterMSurface`, the sibling of
// `StageVisualRenderer`) answers only "which ids belong on this stage?".
//
// Why these are NOT entries in `TEMPLATE_REGISTRY`: a template is what a stage
// IS, chosen once per stage by the encoder. Mr M surfaces are overlays that sit
// on top of whichever template the stage already carries — a first_principles
// stage and a state_transition stage both get an axiom panel. Making them
// templates would force one instead of the other.

/**
 * The props bundle every Mr M surface accepts. It lives here, next to the
 * registry, because `InterventionDefinition.component` has to be typed at the
 * point the component is registered.
 */
// Note what is NOT here: the learner's answer fields. No surface in this
// registry reads them — the autopsy reads its own `trapDiagnosis`, which is
// computed once by the workbench — and passing them would re-render every
// panel in the stack on every keystroke in the answer fields, because a prop
// identity change is a render. The props below are all stable while the
// learner types, which is what lets each panel be memoised.
export interface InterventionProps {
  /** The stage whose mechanism is being made legible. */
  activity: Activity;
  /** The examiner's read on this stage, once a check has run. */
  feynmanResult?: StageResponse['feynmanReview'] | null;
  /**
   * The deterministic autopsy read. The structural classifier's diagnosis, or
   * the wider reading from `diagnoseDiscrepancy` — the same shape plus the
   * numeric diff's kind and crossed pairs. Present only when a layer named
   * something; null means "no clean signal", never "no mistake".
   */
  trapDiagnosis?: AutopsyDiagnosis | null;
  /** The model's narrative half of the autopsy, when it wrote one. */
  autopsy?: TrapAutopsy | null;
  /** Unresolved contradictions for this topic, newest first. */
  openParadoxes?: ParadoxEntry[];
  /** Records a contradiction the learner refuses to move past. */
  onRaiseParadox?: (statement: string) => void;
  /** Closes one, with the sentence that resolved it. */
  onResolveParadox?: (id: string, resolution: string) => void;
  /** Topic the stage belongs to — the tag a saved trap card carries. */
  topic?: string;
  /**
   * The answer text as it stood when the last check ran. A snapshot taken by
   * the workbench at check time, NOT the live fields — what the card records
   * is what was actually autopsied, and the snapshot identity only changes
   * when a check does, which is what keeps this panel memoised.
   */
  committedAnswer?: string;
  /** The stage's exemplar / expert completion, when one exists. */
  correctAnswer?: string;
  /**
   * Saves the autopsy as a real interference-trap card. The payload is built
   * in the workbench from the check-time snapshot; the panel supplies only
   * the two things only the learner knows — the tier they held and the flaw
   * in their words.
   */
  onSaveTrapCard?: (input: { tier: ConfidenceTier; flawLine: string }) => void;
  /** True when the card for THIS check result has already been saved. */
  trapCardSaved?: boolean;
  /** Every standing fault recorded against this topic, newest first. */
  patches?: PatchEntry[];
  /**
   * Stable numbering for the whole armory, so `[ PATCH #12 ]` means the same
   * record on every stage that shows it. Computed once by the workbench from
   * the full registry (see `patchNumbers` in `ledger.ts`), never here.
   */
  patchIndex?: Record<string, number>;
  /**
   * Replaces one patch's one-line statement. This is the one field in the
   * record that is the learner's own sentence, so it is kept verbatim.
   */
  onEditPatch?: (id: string, statement: string) => void;
}

export type InterventionPillar =
  | 'paradox'
  | 'patches'
  | 'axiom'
  | 'ontology'
  | 'steps'
  | 'whatif'
  | 'autopsy'
  | 'socratic';

/** Everything a surface is allowed to gate on. Pure, so the table stays testable. */
export interface InterventionContext {
  activity: Activity;
  /** Mr M mode is on. Chosen off ⇒ `resolveInterventions` returns nothing. */
  enabled: boolean;
  feynmanResult?: StageResponse['feynmanReview'] | null;
  trapDiagnosis?: AutopsyDiagnosis | null;
  autopsy?: TrapAutopsy | null;
  /** True when this topic has at least one contradiction still open. */
  hasOpenParadox?: boolean;
  /** True when this topic carries at least one recorded patch. */
  hasPatches?: boolean;
}

export interface InterventionDefinition {
  id: string;
  pillar: InterventionPillar;
  title: string;
  /** The one thing this surface owes the learner — shown as the panel's purpose line. */
  learnerTask: string;
  /** When it belongs on screen. */
  appliesWhen: (ctx: InterventionContext) => boolean;
  /** The renderer, code-split so an unused surface costs nothing on first paint. */
  component: React.ComponentType<InterventionProps>;
}

const AXIOM_FIRST_PANEL = lazy(() =>
  import('@/components/mr-m/AxiomFirstPanel').then((m) => ({ default: m.AxiomFirstPanel }))
);
const ONTOLOGY_CARDS = lazy(() =>
  import('@/components/mr-m/OntologyCards').then((m) => ({ default: m.OntologyCards }))
);
const STATE_MACHINE_RAIL = lazy(() =>
  import('@/components/mr-m/StateMachineRail').then((m) => ({ default: m.StateMachineRail }))
);
const PERTURBATION_SLIDERS = lazy(() =>
  import('@/components/mr-m/PerturbationSliders').then((m) => ({ default: m.PerturbationSliders }))
);
const TRAP_AUTOPSY = lazy(() =>
  import('@/components/mr-m/TrapAutopsy').then((m) => ({ default: m.TrapAutopsy }))
);
const SOCRATIC_SPAR = lazy(() =>
  import('@/components/mr-m/SocraticSpar').then((m) => ({ default: m.SocraticSpar }))
);
const PARADOX_LEDGER_PANEL = lazy(() =>
  import('@/components/mr-m/ParadoxLedgerPanel').then((m) => ({ default: m.ParadoxLedgerPanel }))
);
const PATCH_REGISTRY = lazy(() =>
  import('@/components/mr-m/PatchRegistry').then((m) => ({ default: m.PatchRegistry }))
);

/**
 * The id → renderer table `MisterMSurface` dispatches through. Declared once,
 * here, so the id is the only thing that decides which panel draws.
 */
export const MR_M_COMPONENTS: Record<string, React.ComponentType<InterventionProps>> = {
  paradox_ledger: PARADOX_LEDGER_PANEL,
  patch_registry: PATCH_REGISTRY,
  axiom_first: AXIOM_FIRST_PANEL,
  ontology_cards: ONTOLOGY_CARDS,
  state_machine_steps: STATE_MACHINE_RAIL,
  perturbation_sliders: PERTURBATION_SLIDERS,
  trap_autopsy: TRAP_AUTOPSY,
  socratic_spar: SOCRATIC_SPAR,
};

/** Reads a stage's Mr M payload without assuming it was normalised. */
export function payloadFor(activity: Activity): MrMPayload | undefined {
  return mrMOf(activity);
}

/** Three steps is the point at which a chain stops fitting in working memory. */
const MIN_MACHINE_STEPS = 3;

/**
 * Registry order IS render order. The paradox ledger leads because an open
 * contradiction is the one thing that must be visible before anything else on
 * the stage; the autopsy and the spar trail, because they are post-check.
 */
export const MR_M_INTERVENTIONS: InterventionDefinition[] = [
  {
    id: 'paradox_ledger',
    pillar: 'paradox',
    title: 'Open contradictions',
    learnerTask:
      'Every contradiction you have not resolved yet, held on screen instead of left behind.',
    appliesWhen: (ctx) => ctx.hasOpenParadox === true,
    component: MR_M_COMPONENTS.paradox_ledger,
  },
  {
    id: 'patch_registry',
    pillar: 'patches',
    title: 'Standing faults',
    learnerTask:
      'The fractures that have fired more than once on this topic, and the one-line patch that closes each.',
    // One hit is a slip, and a wall of slips reads as noise. A patch has to have
    // fired at least twice before it is allowed in front of a new attempt — the
    // repeat threshold lives in the ledger, not here, so the panel and the
    // warning it draws can never disagree about what counts as standing.
    appliesWhen: (ctx) => ctx.hasPatches === true,
    component: MR_M_COMPONENTS.patch_registry,
  },
  {
    id: 'axiom_first',
    pillar: 'axiom',
    title: 'Coordinate system first',
    learnerTask:
      'The governing law and the zero point, before any procedure appears.',
    appliesWhen: (ctx) => !!payloadFor(ctx.activity)?.axiomFirst,
    component: MR_M_COMPONENTS.axiom_first,
  },
  {
    id: 'ontology_cards',
    pillar: 'ontology',
    title: 'What each letter physically is',
    learnerTask:
      'The physical identity of every symbol in this formula, so nothing is numerology.',
    appliesWhen: (ctx) => (payloadFor(ctx.activity)?.ontology?.length ?? 0) > 0,
    component: MR_M_COMPONENTS.ontology_cards,
  },
  {
    id: 'state_machine_steps',
    pillar: 'steps',
    title: 'Linear decomposition',
    learnerTask:
      'Step 1 → Step 2 → Step 3, one rule per step, so working memory never bottlenecks.',
    appliesWhen: (ctx) => (payloadFor(ctx.activity)?.stateMachine?.length ?? 0) >= MIN_MACHINE_STEPS,
    component: MR_M_COMPONENTS.state_machine_steps,
  },
  {
    id: 'perturbation_sliders',
    pillar: 'whatif',
    title: 'What-if perturbation',
    learnerTask:
      'Drive the invariant to its limits: double an input, halve another, push one to zero.',
    appliesWhen: (ctx) => (payloadFor(ctx.activity)?.perturbation?.variables.length ?? 0) > 0,
    component: MR_M_COMPONENTS.perturbation_sliders,
  },
  {
    id: 'trap_autopsy',
    pillar: 'autopsy',
    title: 'Structural autopsy',
    learnerTask:
      'The exact structural reason this answer broke, with the arithmetic to check it yourself.',
    // A failed check is the trigger — but a surface with nothing to say stays
    // off screen, so a deterministic read OR a written autopsy is required.
    appliesWhen: (ctx) =>
      ctx.feynmanResult?.secured === false && !!(ctx.trapDiagnosis || ctx.autopsy?.structuralReason),
    component: MR_M_COMPONENTS.trap_autopsy,
  },
  {
    id: 'socratic_spar',
    pillar: 'socratic',
    title: 'Two-way check',
    learnerTask:
      'Confirm or challenge the read, then take one step. Dialogue, not a lecture.',
    appliesWhen: (ctx) => !!ctx.feynmanResult?.counterProbe,
    component: MR_M_COMPONENTS.socratic_spar,
  },
];

/**
 * Adds (or replaces) one intervention at runtime, so shipping a new surface is
 * "register it", never "go edit MisterMSurface". Kept for symmetry with
 * `registerTemplate`; the resolver reads both tables, so a definition
 * registered here draws immediately.
 */
export function registerIntervention(definition: InterventionDefinition): void {
  MR_M_COMPONENTS[definition.id] = definition.component;
  const existing = MR_M_INTERVENTIONS.findIndex((i) => i.id === definition.id);
  if (existing >= 0) {
    MR_M_INTERVENTIONS[existing] = definition;
  } else {
    MR_M_INTERVENTIONS.push(definition);
  }
}

export function getIntervention(id: string): InterventionDefinition | undefined {
  return MR_M_INTERVENTIONS.find((i) => i.id === id);
}

export function getAllInterventions(): InterventionDefinition[] {
  return [...MR_M_INTERVENTIONS];
}

/**
 * The surfaces that belong on this stage, in registry order. Pure: the same
 * context always resolves to the same list, and the mode being off resolves to
 * an empty one — which is what makes "off means untouched" a property of the
 * resolver rather than a promise each panel has to keep.
 */
export function resolveInterventions(ctx: InterventionContext): InterventionDefinition[] {
  if (!ctx.enabled) return [];
  return MR_M_INTERVENTIONS.filter((intervention) => {
    try {
      return intervention.appliesWhen(ctx);
    } catch {
      // A payload that a surface cannot read must never take the stage down
      // with it; an unreadable block simply resolves to no surface.
      return false;
    }
  });
}
