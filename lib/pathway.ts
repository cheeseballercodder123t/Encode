/**
 * Interactive pathway / circuit builder.
 *
 * The learner assembles a causal chain — the energy-payoff phase of glycolysis
 * here — by dropping the right enzyme and cofactor into each step's sockets. The
 * rules that make it a real exercise rather than a jigsaw:
 *
 *   · Fixed, declared chemistry. Every step names the enzyme and the cofactor
 *     that its source sentence requires; there is no scoring heuristic and no
 *     model call, only equality against the declared answer.
 *   · Decoys are mandatory. The palette always carries pieces that are real
 *     molecules from the same subject but belong to a different reaction, so a
 *     correct assembly cannot be reached by eliminating whatever is left.
 *   · A piece is a molecular species, not one molecule: NAD+ and ADP are
 *     consumed at several steps, so the same chip may fill several sockets.
 *   · Flow is causal and sequential. A step's product is only on offer once the
 *     steps before it are catalytically complete, so the yield readout shows
 *     what the learner has actually unlocked.
 *   · Evidence is verbatim. Every step quotes the sentence it was derived from,
 *     and the validator refuses a quote that is not literally in the source.
 */

export interface PathwayPiece {
  id: string;
  kind: 'enzyme' | 'cofactor';
  label: string;
  /** What this piece actually does, so a wrong drop can be named precisely. */
  role: string;
}

export interface PathwayStep {
  id: string;
  /** Substrate → product, with the substrate's own name spelled out. */
  label: string;
  enzymePieceId: string;
  cofactorPieceId: string;
  /** What completing this step makes available, e.g. '2 ATP'. */
  yields: string;
  /** Verbatim sentence from the source that fixes this enzyme and cofactor. */
  evidence: string;
}

export interface PathwayConfig {
  version: 1;
  type: 'energy_payoff';
  title: string;
  substrate: string;
  product: string;
  /** Yield of the whole chain per starting molecule. */
  netYield: string;
  steps: PathwayStep[];
  pieces: PathwayPiece[];
  evidence: { quote: string; supports: string }[];
  assumptions: string[];
  takeaway: string;
}

export interface PathwayPlacement {
  [stepId: string]: { enzyme?: string; cofactor?: string };
}

export interface PathwayStepState {
  id: string;
  enzymeOk: boolean;
  cofactorOk: boolean;
  complete: boolean;
}

export interface PathwayOutput {
  steps: PathwayStepState[];
  /** Steps whose causal prerequisites are met AND which are catalytically complete. */
  flowingSteps: number;
  completeCount: number;
  /** True only when every step is complete, so the product exists. */
  productFormed: boolean;
  /** Yields unlocked so far, in pathway order. */
  yields: string[];
  status: string;
  /** Deterministic, human-readable reasons the flow stopped. */
  blockers: string[];
}

export function evaluatePathway(config: PathwayConfig, placement: PathwayPlacement): PathwayOutput {
  const steps: PathwayStepState[] = config.steps.map((step) => {
    const filled = placement[step.id] || {};
    const enzymeOk = filled.enzyme === step.enzymePieceId;
    const cofactorOk = filled.cofactor === step.cofactorPieceId;
    return { id: step.id, enzymeOk, cofactorOk, complete: enzymeOk && cofactorOk };
  });

  const firstBlocked = steps.findIndex((step) => !step.complete);
  const flowingSteps = firstBlocked === -1 ? steps.length : firstBlocked;
  const yields = config.steps.slice(0, flowingSteps).map((step) => step.yields);
  const productFormed = flowingSteps === steps.length;
  const status = productFormed
    ? 'PRODUCT FORMED'
    : flowingSteps === 0
      ? 'NO FLOW'
      : `FLOW BLOCKED AT STEP ${flowingSteps + 1}`;

  const blockers: string[] = [];
  if (!productFormed) {
    const step = config.steps[flowingSteps];
    const state = steps[flowingSteps];
    const pieceName = (id?: string) => {
      const piece = config.pieces.find((candidate) => candidate.id === id);
      return piece ? `${piece.label} (${piece.role})` : 'nothing';
    };
    if (state.enzymeOk && !state.cofactorOk) blockers.push(`${step.label} has its enzyme but not the cofactor it consumes.`);
    else if (!state.enzymeOk && state.cofactorOk) blockers.push(`${step.label} has its cofactor but not the enzyme that catalyzes it.`);
    else if (!state.enzymeOk && !state.cofactorOk) blockers.push(`${step.label} has neither its enzyme nor its cofactor.`);
    // A wrong piece is named, so the learner sees the misconception, not a verdict.
    const filled = placement[step.id] || {};
    if (!state.enzymeOk && filled.enzyme) blockers.push(`${pieceName(filled.enzyme)} is not the enzyme for ${step.label}.`);
    if (!state.cofactorOk && filled.cofactor) blockers.push(`${pieceName(filled.cofactor)} is not the cofactor consumed at ${step.label}.`);
    for (const later of steps.slice(flowingSteps + 1)) {
      if (later.complete) blockers.push(`A later step is already assembled, but the chain stops before it.`);
      break;
    }
  }

  return { steps, flowingSteps, completeCount: steps.filter((step) => step.complete).length, productFormed, yields, status, blockers };
}

/** The declared answer: every step's declared enzyme and cofactor. */
export function solvePathway(config: PathwayConfig): PathwayPlacement {
  return Object.fromEntries(config.steps.map((step) => [step.id, { enzyme: step.enzymePieceId, cofactor: step.cofactorPieceId }]));
}

export interface PathwayValidationResult { valid: boolean; issues: string[] }

/**
 * Structural and evidentiary checks. `source` is optional because an example
 * ships with its own brief; when given, every quote must be literally present.
 */
export function validatePathwayConfig(config: PathwayConfig | undefined | null, source?: string): PathwayValidationResult {
  const issues: string[] = [];
  if (!config || typeof config !== 'object') return { valid: false, issues: ['No pathway configuration.'] };
  const sourceText = typeof source === 'string' ? source : undefined;

  if (!config.title?.trim()) issues.push('Pathway needs a title.');
  if (!config.netYield?.trim()) issues.push('Pathway needs a declared net yield.');
  if (!config.takeaway?.trim()) issues.push('Pathway needs a boundary takeaway.');
  if (!Array.isArray(config.steps) || config.steps.length < 2) issues.push('A pathway needs at least two coupled steps.');
  if (!Array.isArray(config.pieces) || config.pieces.length === 0) issues.push('A pathway needs a palette of pieces.');

  const steps = Array.isArray(config.steps) ? config.steps : [];
  const pieces = Array.isArray(config.pieces) ? config.pieces : [];
  const pieceIds = new Set<string>();
  for (const piece of pieces) {
    if (!piece?.id) { issues.push('Every piece needs an id.'); continue; }
    if (pieceIds.has(piece.id)) issues.push(`Duplicate piece id: ${piece.id}`);
    pieceIds.add(piece.id);
    if (!piece.label?.trim()) issues.push(`Piece ${piece.id} needs a label.`);
    if (!piece.role?.trim()) issues.push(`Piece ${piece.id} needs a role describing what it does.`);
  }

  const stepIds = new Set<string>();
  const usedPieces = new Set<string>();
  for (const step of steps) {
    if (!step?.id) { issues.push('Every step needs an id.'); continue; }
    if (stepIds.has(step.id)) issues.push(`Duplicate step id: ${step.id}`);
    stepIds.add(step.id);
    const enzyme = pieces.find((piece) => piece.id === step.enzymePieceId);
    const cofactor = pieces.find((piece) => piece.id === step.cofactorPieceId);
    if (!enzyme) issues.push(`Step ${step.id} names enzyme ${step.enzymePieceId}, which is not in the palette.`);
    else if (enzyme.kind !== 'enzyme') issues.push(`Step ${step.id} needs an enzyme but ${step.enzymePieceId} is a ${enzyme.kind}.`);
    if (!cofactor) issues.push(`Step ${step.id} names cofactor ${step.cofactorPieceId}, which is not in the palette.`);
    else if (cofactor.kind !== 'cofactor') issues.push(`Step ${step.id} needs a cofactor but ${step.cofactorPieceId} is a ${cofactor.kind}.`);
    if (!step.yields?.trim()) issues.push(`Step ${step.id} must declare what completing it yields.`);
    if (!step.evidence?.trim()) issues.push(`Step ${step.id} needs verbatim evidence.`);
    else if (sourceText && !sourceText.includes(step.evidence)) issues.push(`Step ${step.id} evidence is not a verbatim quotation of the source.`);
    usedPieces.add(step.enzymePieceId);
    usedPieces.add(step.cofactorPieceId);
  }

  // Without a decoy the puzzle is an elimination game, not a test of the chemistry.
  if (pieces.length > 0 && usedPieces.size >= pieces.length) issues.push('The palette needs at least one decoy piece that no step uses.');
  if (config.evidence?.length) {
    for (const entry of config.evidence) {
      if (!entry?.quote?.trim()) issues.push('Every evidence entry needs a quotation.');
      else if (sourceText && !sourceText.includes(entry.quote)) issues.push(`Evidence is not a verbatim quotation of the source: ${entry.quote}`);
    }
  } else {
    issues.push('Pathway needs source evidence.');
  }
  if (!Array.isArray(config.assumptions) || config.assumptions.length === 0) issues.push('Pathway needs its limitations stated.');

  return { valid: issues.length === 0, issues };
}

/**
 * The energy-payoff phase of glycolysis, grounded in the brief below. Every
 * quote in the config is a literal substring of that brief, which the test suite
 * re-checks the same way the toy labs do.
 */
export const GLYCOLYSIS_PAYOFF_SOURCE =
  'Glycolysis energy payoff. In the payoff phase, glyceraldehyde-3-phosphate is oxidized to 1,3-bisphosphoglycerate by glyceraldehyde-3-phosphate dehydrogenase, which reduces NAD+ to NADH. '
  + 'Phosphoglycerate kinase then transfers a phosphate from 1,3-bisphosphoglycerate to ADP, forming ATP and 3-phosphoglycerate. '
  + 'Finally, pyruvate kinase transfers the phosphate from phosphoenolpyruvate to ADP, forming a second ATP and pyruvate. '
  + 'Each step is catalyzed by its own enzyme; NAD+ and ADP are the cofactors consumed. '
  + 'Hexokinase and phosphofructokinase belong to the investment phase, before the payoff steps.';

export const GLYCOLYSIS_PAYOFF: PathwayConfig = {
  version: 1,
  type: 'energy_payoff',
  title: 'Energy payoff · build the chain that makes ATP',
  substrate: 'Glyceraldehyde-3-phosphate (×2 per glucose)',
  product: 'Pyruvate',
  netYield: '2 ATP · 2 NADH · 2 pyruvate per glucose',
  steps: [
    {
      id: 'oxidation',
      label: 'G3P → 1,3-bisphosphoglycerate',
      enzymePieceId: 'gapdh',
      cofactorPieceId: 'nad',
      yields: '2 NADH',
      evidence: 'glyceraldehyde-3-phosphate is oxidized to 1,3-bisphosphoglycerate by glyceraldehyde-3-phosphate dehydrogenase',
    },
    {
      id: 'first-atp',
      label: '1,3-bisphosphoglycerate → 3-phosphoglycerate',
      enzymePieceId: 'pgk',
      cofactorPieceId: 'adp',
      yields: '2 ATP',
      evidence: 'Phosphoglycerate kinase then transfers a phosphate from 1,3-bisphosphoglycerate to ADP, forming ATP',
    },
    {
      id: 'second-atp',
      label: 'Phosphoenolpyruvate → pyruvate',
      enzymePieceId: 'pyruvate-kinase',
      cofactorPieceId: 'adp',
      yields: '2 ATP',
      evidence: 'pyruvate kinase transfers the phosphate from phosphoenolpyruvate to ADP, forming a second ATP and pyruvate',
    },
  ],
  pieces: [
    { id: 'gapdh', kind: 'enzyme', label: 'Glyceraldehyde-3-phosphate dehydrogenase', role: 'oxidizes G3P and reduces NAD+' },
    { id: 'pgk', kind: 'enzyme', label: 'Phosphoglycerate kinase', role: 'moves a phosphate onto ADP at step 2' },
    { id: 'pyruvate-kinase', kind: 'enzyme', label: 'Pyruvate kinase', role: 'moves the phosphate onto ADP at the final step' },
    { id: 'nad', kind: 'cofactor', label: 'NAD+', role: 'the electron acceptor reduced to NADH' },
    { id: 'adp', kind: 'cofactor', label: 'ADP', role: 'phosphorylated to ATP at both payoff steps' },
    { id: 'hexokinase', kind: 'enzyme', label: 'Hexokinase', role: 'phosphorylates glucose in the investment phase, not here' },
    { id: 'atp', kind: 'cofactor', label: 'ATP', role: 'produced by these steps; not consumed in the payoff phase' },
    { id: 'fad', kind: 'cofactor', label: 'FAD', role: 'an electron carrier used elsewhere, not in glycolysis' },
  ],
  evidence: [
    { quote: 'glyceraldehyde-3-phosphate dehydrogenase, which reduces NAD+ to NADH', supports: 'Step 1 enzyme and cofactor' },
    { quote: 'NAD+ and ADP are the cofactors consumed', supports: 'Only NAD+ and ADP are consumed in the payoff phase' },
    { quote: 'Hexokinase and phosphofructokinase belong to the investment phase', supports: 'Why hexokinase is a decoy here' },
  ],
  assumptions: [
    'This works the payoff phase of one glucose, which runs twice per molecule of glucose; per-step yields are shown for the two trioses together.',
    'The investment phase (2 ATP spent, 2 G3P produced) is deliberately out of scope, so the chain starts at G3P.',
    'A cofactor chip is a molecular species, not a single molecule: ADP is consumed at two separate steps.',
    'Enzyme kinetics, regulation and reversibility are not modelled — only which enzyme and cofactor each step requires.',
  ],
  takeaway: 'The payoff phase is a chain of substrate-level phosphorylations: no step makes ATP until the one before it has completed, and each step needs its own enzyme.',
};
