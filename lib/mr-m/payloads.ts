// ─── Mr M mode: payload normalisation ───────────────────────────────────────
//
// Model output is never trusted directly. Each block is coerced into its
// contract, and a block that does not survive coercion is DROPPED rather than
// defaulted — Mr M mode's whole premise is that a surface only appears when
// there is something real to say. An empty axiom card ("[no law stated]") would
// be exactly the arbitrary noise the mode exists to remove.

import { TRAP_IDS } from './types';
import type {
  AxiomFirst,
  MachineStep,
  MrMPayload,
  OntologyCard,
  PerturbationLimitNote,
  PerturbationModel,
  PerturbationVariable,
  TrapAutopsy,
} from './types';

const TRAP_ID_SET = new Set<string>(TRAP_IDS);

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function finiteNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// The caps below are the coercer's, but they are ALSO quoted in
// `MR_M_DIRECTIVE` — the model has to be told the limit it is going to be held
// to, or it spends tokens on a thirteenth ontology card that is silently
// truncated. Exported so the prompt and the coercion can only ever agree.

/** Max symbols on one stage before the panel stops being readable. */
export const MAX_ONTOLOGY = 12;
/** Max steps in a linear decomposition — beyond this it is not linear any more. */
export const MAX_STEPS = 8;
/** Max sliders. A five-variable perturbation is a paper, not a slider row. */
export const MAX_VARIABLES = 6;

function normalizeAxiomFirst(raw: unknown): AxiomFirst | undefined {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const governingLaw = text(d.governingLaw);
  const coordinateOrigin = text(d.coordinateOrigin);
  const whyThisDefinition = text(d.whyThisDefinition);
  // The three load-bearing sentences ARE the pillar. Without all three there is
  // no coordinate system to show, only a fragment.
  if (!governingLaw || !coordinateOrigin || !whyThisDefinition) return undefined;
  return {
    governingLaw,
    coordinateOrigin,
    zeroPoint: text(d.zeroPoint) || coordinateOrigin,
    whyThisDefinition,
    calculusTranslation: text(d.calculusTranslation) || undefined,
    counterexample: text(d.counterexample) || undefined,
  };
}

function normalizeOntology(raw: unknown): OntologyCard[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const cards: OntologyCard[] = [];
  for (const item of raw) {
    const d = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const symbol = text(d.symbol);
    const physicalIdentity = text(d.physicalIdentity);
    if (!symbol || !physicalIdentity) continue;
    // One card per letter: a duplicated symbol is the same letter explained twice.
    const key = symbol.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push({
      symbol,
      physicalIdentity,
      unit: text(d.unit) || undefined,
      whatItIsNot: text(d.whatItIsNot) || undefined,
      doublesTo: text(d.doublesTo) || undefined,
    });
    if (cards.length >= MAX_ONTOLOGY) break;
  }
  return cards.length > 0 ? cards : undefined;
}

function normalizeStateMachine(raw: unknown): MachineStep[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const steps: MachineStep[] = [];
  for (const item of raw) {
    const d = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const action = text(d.action);
    const holdsInHead = text(d.holdsInHead);
    // "One rule per step" IS this pillar: a step whose rule is missing has
    // nothing to consume, so it is dropped rather than handed a placeholder
    // sentence to display. Filling this in with boilerplate would put back the
    // arbitrary noise the mode exists to remove (see the module header).
    if (!action || !holdsInHead) continue;
    steps.push({
      stepNumber: 0, // renumbered below: the order the model returned IS the order
      action,
      holdsInHead,
      output: text(d.output) || undefined,
    });
    if (steps.length >= MAX_STEPS) break;
  }
  if (steps.length === 0) return undefined;
  return steps.map((step, i) => ({ ...step, stepNumber: i + 1 }));
}

function normalizeVariables(raw: unknown): PerturbationVariable[] {
  if (!Array.isArray(raw)) return [];
  const out: PerturbationVariable[] = [];
  for (const item of raw) {
    const d = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const symbol = text(d.symbol);
    const base = finiteNumber(d.base);
    const exponent = finiteNumber(d.exponent);
    // An exponent of 0 means the variable does not enter the invariant at all,
    // so a slider for it would move a readout that provably cannot move.
    if (!symbol || base === null || exponent === null || exponent === 0) continue;
    const min = finiteNumber(d.min);
    const max = finiteNumber(d.max);
    out.push({
      symbol,
      base,
      min: min === null ? undefined : Math.min(min, base),
      max: max === null ? undefined : Math.max(max, base),
      unit: text(d.unit) || undefined,
      exponent,
    });
    if (out.length >= MAX_VARIABLES) break;
  }
  return out;
}

function normalizeLimitNotes(raw: unknown): PerturbationLimitNote[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const notes: PerturbationLimitNote[] = [];
  for (const item of raw) {
    const d = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const symbol = text(d.symbol);
    const note = text(d.note);
    if (!symbol || !note) continue;
    notes.push({ symbol, note });
  }
  return notes.length > 0 ? notes : undefined;
}

function normalizePerturbation(raw: unknown): PerturbationModel | undefined {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const invariant = text(d.invariant);
  const variables = normalizeVariables(d.variables);
  if (!invariant || variables.length === 0) return undefined;
  return { invariant, variables, limitNotes: normalizeLimitNotes(d.limitNotes) };
}

/**
 * Coerces the encoder's `visualData.mrM` block. Returns undefined when the mode
 * was off, when the model ignored the directive, or when nothing usable
 * survived — all three are the same outcome for the UI: no surfaces.
 */
export function normalizeMrM(raw: unknown): MrMPayload | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const d = raw as Record<string, unknown>;
  const payload: MrMPayload = {};
  const axiomFirst = normalizeAxiomFirst(d.axiomFirst);
  if (axiomFirst) payload.axiomFirst = axiomFirst;
  const ontology = normalizeOntology(d.ontology);
  if (ontology) payload.ontology = ontology;
  const stateMachine = normalizeStateMachine(d.stateMachine);
  if (stateMachine) payload.stateMachine = stateMachine;
  const perturbation = normalizePerturbation(d.perturbation);
  if (perturbation) payload.perturbation = perturbation;
  return Object.keys(payload).length > 0 ? payload : undefined;
}

/** Reads the block off a stage without assuming it was validated. */
export function mrMOf(activity: { visualData?: unknown } | undefined | null): MrMPayload | undefined {
  const visual = activity?.visualData as Record<string, unknown> | undefined;
  if (!visual) return undefined;
  const raw = visual.mrM;
  if (!raw || typeof raw !== 'object') return undefined;
  return raw as MrMPayload;
}

/**
 * Coerces the model's autopsy narrative. `trapId` is only accepted when it is a
 * real member of the taxonomy — an invented id would render a heading the rest
 * of the system does not know how to explain.
 */
export function normalizeAutopsy(raw: unknown): TrapAutopsy | undefined {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const structuralReason = text(d.structuralReason);
  const correctedConstruction = text(d.correctedConstruction);
  if (!structuralReason && !correctedConstruction) return undefined;
  const trapId = text(d.trapId);
  return {
    trapId: (TRAP_ID_SET.has(trapId) ? trapId : '') as TrapAutopsy['trapId'],
    structuralReason,
    correctedConstruction,
    whereItBreaks: text(d.whereItBreaks),
  };
}
