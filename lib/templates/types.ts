// Template-specific TypeScript interfaces and types for DeepEncode Visual Schemas

export type VisualTemplateType =
  | 'first_principles'
  | 'cause_effect'
  | 'visual_blueprint'
  | 'analogy_matrix'
  | 'concept_hierarchy'
  | 'state_transition'
  | 'boundary_stress_test'
  | 'taxonomic_chunking'
  | 'mnemonic_peg'
  | 'memory_palace'
  | 'contrast_grid'
  | 'formula_spatial_grid'
  | 'personal_schema'
  | 'interleaved_srs'
  | 'shape_association';

// Generation Effect: Partial Schema / Incomplete Mental Model Challenge
export interface GenerationChallenge {
  premisePrompt: string; // e.g., "If the cell is an industrial city factory, what is the mitochondria?"
  clue?: string; // Socratic hint to spark generation without giving the answer away
  missingRoleOrTarget: string; // e.g., "Power Plant / Generator"
  expertCompletion?: string; // The full completed schema synthesized once the user attempts generation
  isUserCompleted?: boolean;
}

// 1. First Principles Causal Chain
export interface FirstPrinciplesNode {
  id: string;
  label: string;
  subtext?: string;
  type?: 'input' | 'mechanism' | 'outcome' | 'danger';
  isPartialCloze?: boolean;
  userSuppliedAnswer?: string;
}

export interface FirstPrinciplesVisualData {
  nodes?: FirstPrinciplesNode[];
  generationChallenge?: GenerationChallenge;
  underlyingAxiom?: string;
}

// 2. Cause & Effect Perturbation / Counterfactual
export interface CauseEffectVisualData {
  nodes?: FirstPrinciplesNode[];
  normalStateDescription?: string;
  disturbanceShock?: string;
  cascadeImpact?: string;
  breakdownState?: string;
  counterfactualQuestion?: string;
  generationChallenge?: GenerationChallenge;
}

// 3. Visual Blueprint (Paivio Dual-Coding)
export interface VisualBlueprintAnchor {
  id: string;
  label: string;
  spatialPosition: 'top' | 'left' | 'center' | 'right' | 'bottom';
  sensoryDetail: string;
}

export interface VisualBlueprintVisualData {
  foregroundActor?: string;
  motionVector?: string;
  spatialAnchor?: string;
  anchors?: VisualBlueprintAnchor[];
  flowSteps?: { stepNumber: number; title: string; mechanism?: string; visualIcon?: string }[];
  nodes?: FirstPrinciplesNode[];
  generationChallenge?: GenerationChallenge;
}

// 4. Analogy Matrix (Gentner Structure Mapping)
export interface AnalogyMappingItem {
  sourceElement: string; // Familiar domain e.g. "Water Pipe Pressure"
  targetElement: string; // Target concept e.g. "Voltage / Electrical Potential"
  explanation?: string;
  isPartialTarget?: boolean;
  userMappedTarget?: string;
}

export interface AnalogyMatrixVisualData {
  sourceDomainName?: string;
  targetDomainName?: string;
  analogyMappings?: AnalogyMappingItem[];
  whereAnalogyBreaks?: string; // Critical boundary condition where analogy fails
  generationChallenge?: GenerationChallenge;
}

// 5. Concept Hierarchy Mind Tree
export interface HierarchyBranch {
  branchName: string;
  subItems: string[];
  partialMissingItem?: string;
}

export interface ConceptHierarchyVisualData {
  rootNode: string;
  branches: HierarchyBranch[];
  crossBranchConnection?: { from: string; to: string; relation: string };
  generationChallenge?: GenerationChallenge;
}

// 6. State Transition / State Machine
export interface StateTransitionStep {
  stepNumber: number;
  title: string;
  mechanism?: string;
  visualIcon?: string;
  isTriggerState?: boolean;
}

export interface StateTransitionVisualData {
  cycleName?: string;
  flowSteps?: StateTransitionStep[];
  resetCondition?: string;
  generationChallenge?: GenerationChallenge;
}

// 7. Boundary Stress Test
export interface BoundaryGaugeItem {
  variable: string;
  normalRange: string;
  extremeCase: string;
  breakdownResult: string;
  sliderDefault?: number; // 0 - 100 percentage
}

export interface BoundaryStressTestVisualData {
  boundaryGauges?: BoundaryGaugeItem[];
  criticalThreshold?: string;
  failureEnvelopeSummary?: string;
  generationChallenge?: GenerationChallenge;
}

// 8. Taxonomic Chunking (Miller's 7±2 Law)
export interface ChunkBucketItem {
  bucketName: string;
  items: string[];
  colorHint?: string;
  categoryRule?: string;
}

export interface TaxonomicChunkingVisualData {
  chunkBuckets?: ChunkBucketItem[];
  unsortedItems?: string[]; // For interactive sorting workouts
  totalItemsCount?: number;
  generationChallenge?: GenerationChallenge;
}

// 9. Mnemonic Peg & Acronym
export interface AcronymLetterItem {
  letter: string;
  word: string;
  mnemonicCue?: string;
  phoneticRhyme?: string;
}

export interface MnemonicPegVisualData {
  acronymLetters?: AcronymLetterItem[];
  targetSequenceTitle?: string;
  generationChallenge?: GenerationChallenge;
}

// 10. Memory Palace (Method of Loci)
export interface PalaceRoomItem {
  roomName: string;
  locusNumber: number;
  itemPlaced: string;
  vividSensoryHook: string; // Bizarre, exaggerated multimodal image
  audioSpatialCue?: string;
}

export interface MemoryPalaceVisualData {
  palaceTheme?: string; // e.g. "Childhood Home", "Subway Station"
  palaceRooms?: PalaceRoomItem[];
  navigationPath?: string[];
  generationChallenge?: GenerationChallenge;
}

// 11. Contrast Grid (2x2 Disambiguation Matrix)
export interface ContrastQuadrant {
  title: string;
  items: string[];
  trapWarning?: string;
  examDistractorReason?: string;
}

export interface ContrastGridVisualData {
  axisX?: string;
  axisY?: string;
  quadrants?: ContrastQuadrant[];
  contrastMatrix?: {
    axisX?: string;
    axisY?: string;
    quadrants?: ContrastQuadrant[];
  };
  confusablePairSummary?: string;
  generationChallenge?: GenerationChallenge;
}

// 12. Formula & Spatial Grid
export interface FormulaComponentItem {
  symbol: string;
  meaning: string;
  role: 'variable' | 'constant' | 'operator' | 'state';
  unitDimension?: string;
}

export interface FormulaSpatialVisualData {
  formulaEquation?: string;
  formulaComponents?: FormulaComponentItem[];
  intuitiveInterpretation?: string;
  generationChallenge?: GenerationChallenge;
}

// 13. Personal Schema & Spaced Repetition
export interface PersonalSchemaVisualData {
  selfReferenceQuestion?: string;
  realWorldScenario?: string;
  flashcardFront?: string;
  flashcardBack?: string;
  generationChallenge?: GenerationChallenge;
}

// Unified Activity Visual Data Container
export interface ActivityVisualData {
  // Common Generation Effect wrapper
  generationChallenge?: GenerationChallenge;

  // Specific template payloads
  nodes?: FirstPrinciplesNode[];
  analogyMappings?: AnalogyMappingItem[];
  contrastMatrix?: {
    axisX?: string;
    axisY?: string;
    quadrants?: ContrastQuadrant[];
  };
  palaceRooms?: PalaceRoomItem[];
  chunkBuckets?: ChunkBucketItem[];
  acronymLetters?: AcronymLetterItem[];
  flowSteps?: StateTransitionStep[];
  hierarchyTree?: { rootNode: string; branches: HierarchyBranch[] };
  boundaryGauges?: BoundaryGaugeItem[];
  formulaComponents?: FormulaComponentItem[];
  anchors?: VisualBlueprintAnchor[];
  
  // Personal schema & SRS
  selfReferenceQuestion?: string;
  realWorldScenario?: string;
  flashcardFront?: string;
  flashcardBack?: string;

  // Rich context metadata
  sourceDomainName?: string;
  targetDomainName?: string;
  whereAnalogyBreaks?: string;
  palaceTheme?: string;
  underlyingAxiom?: string;
  formulaEquation?: string;
  unsortedItems?: string[];
  cycleName?: string;
  resetCondition?: string;
  normalStateDescription?: string;
  disturbanceShock?: string;
  cascadeImpact?: string;
  breakdownState?: string;
  counterfactualQuestion?: string;
  criticalThreshold?: string;
  failureEnvelopeSummary?: string;
}
