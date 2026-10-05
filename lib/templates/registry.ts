import React, { lazy } from 'react';
import type { Activity } from '@/lib/types';
import type { ToyModelProgress } from '@/lib/toy-models/types';

/**
 * The props bundle every stage visual accepts. It lives here, next to the
 * registry, because `TemplateDefinition.component` has to be typed at the point
 * the component is registered — not in the renderer that happens to draw it.
 */
export interface TemplateComponentProps {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
  selectedPreset?: string;
  /**
   * Optional write-back hook. Templates that can blank one of their own cells
   * (first principles, analogy matrix, state transition) use it to put the
   * completed link into the stage answer; without it they render statically.
   */
  onAdopt?: (text: string) => void;
  toyProgress?: ToyModelProgress;
  onToyProgress?: (progress: ToyModelProgress) => void;
}

export interface TemplateDefinition {
  id: string;
  title: string;
  category: 'conceptual' | 'memorization' | 'hybrid';
  cognitiveFramework: string;
  description: string;
  /** Plain-language 1–2 sentence "why this helps YOU learn" shown in the UI. */
  learnerBenefit: string;
  /** The one specific thing the stage asks the learner to DO (generation effect). */
  learnerTask: string;
  icon: string;
  accentColor: string;
  systemPromptDirective: string;
  /**
   * The renderer for this template, code-split so a registered template that a
   * session never uses costs nothing on the first paint.
   */
  component: React.ComponentType<TemplateComponentProps>;
}

/**
 * The id → renderer table the stage renderer dispatches through. Declared once,
 * here, so the id a stage carries is the only thing that decides which visual
 * draws it — the renderer holds no table of its own. Each visual is lazy-loaded
 * for code-splitting, and the cast is needed because every template narrows its
 * own props while the renderer hands the whole shared bundle to whichever one
 * it resolved.
 */
// One shared lazy instance, so `interleaved_srs` renders the personal-schema
// template through the very same component object rather than a second copy of
// it (and React sees one code-split chunk, not two).
const PERSONAL_SCHEMA_VISUAL = lazy(() => import('@/components/stage-templates/PersonalSchemaVisual').then(m => ({ default: m.PersonalSchemaVisual })));

export const TEMPLATE_COMPONENTS = {
  first_principles: lazy(() => import('@/components/stage-templates/FirstPrinciplesVisual').then(m => ({ default: m.FirstPrinciplesVisual }))),
  cause_effect: lazy(() => import('@/components/stage-templates/CauseEffectVisual').then(m => ({ default: m.CauseEffectVisual }))),
  visual_blueprint: lazy(() => import('@/components/stage-templates/VisualBlueprintVisual').then(m => ({ default: m.VisualBlueprintVisual }))),
  analogy_matrix: lazy(() => import('@/components/stage-templates/AnalogyMatrixVisual').then(m => ({ default: m.AnalogyMatrixVisual }))),
  concept_hierarchy: lazy(() => import('@/components/stage-templates/ConceptHierarchyVisual').then(m => ({ default: m.ConceptHierarchyVisual }))),
  state_transition: lazy(() => import('@/components/stage-templates/StateTransitionVisual').then(m => ({ default: m.StateTransitionVisual }))),
  boundary_stress_test: lazy(() => import('@/components/stage-templates/BoundaryStressTestVisual').then(m => ({ default: m.BoundaryStressTestVisual }))),
  taxonomic_chunking: lazy(() => import('@/components/stage-templates/TaxonomicChunkingVisual').then(m => ({ default: m.TaxonomicChunkingVisual }))),
  mnemonic_peg: lazy(() => import('@/components/stage-templates/MnemonicPegVisual').then(m => ({ default: m.MnemonicPegVisual }))),
  memory_palace: lazy(() => import('@/components/stage-templates/MemoryPalaceVisual').then(m => ({ default: m.MemoryPalaceVisual }))),
  contrast_grid: lazy(() => import('@/components/stage-templates/ContrastGridVisual').then(m => ({ default: m.ContrastGridVisual }))),
  formula_spatial_grid: lazy(() => import('@/components/stage-templates/FormulaSpatialVisual').then(m => ({ default: m.FormulaSpatialVisual }))),
  personal_schema: PERSONAL_SCHEMA_VISUAL,
  // `interleaved_srs` deliberately has no registry entry of its own: it is the
  // personal-schema workout driven by the interleaving scheduler, so it borrows
  // that renderer here instead of becoming a 16th choosable template.
  interleaved_srs: PERSONAL_SCHEMA_VISUAL,
  mnemonic_storyboard: lazy(() => import('@/components/stage-templates/MnemonicStoryboardVisual').then(m => ({ default: m.MnemonicStoryboardVisual }))),
  broken_model_debug: lazy(() => import('@/components/stage-templates/BrokenModelVisual').then(m => ({ default: m.BrokenModelVisual }))),
} as Record<string, React.ComponentType<TemplateComponentProps>>;
export const TEMPLATE_REGISTRY: Record<string, TemplateDefinition> = {
  first_principles: {
    id: 'first_principles',
    title: 'First Principles Deconstruction',
    category: 'conceptual',
    cognitiveFramework: 'Bloom Taxonomy - Analysis (Anderson & Krathwohl, 2001)',
    description: 'Break concepts into irreducible foundational axioms.',
    learnerBenefit: 'This forces you to rebuild the idea from its foundations so you can reason it out even when you forget the memorized version.',
    learnerTask: 'Write the irreducible starting axiom and the mechanism that must follow from it — in your own words.',
    icon: '🔬',
    accentColor: 'indigo',
    systemPromptDirective:
      'Generate a first_principles schema with causal nodes (input → mechanism → outcome). Include an underlyingAxiom.',
    component: TEMPLATE_COMPONENTS.first_principles,
  },
  cause_effect: {
    id: 'cause_effect',
    title: 'Cause & Effect Perturbation',
    category: 'conceptual',
    cognitiveFramework: 'Counterfactual Reasoning (Roese, 1997)',
    description: 'Trace cascading failures from a system disturbance.',
    learnerBenefit: 'Breaking the system on purpose shows you what each part actually does — things you can break and fix stick far better than things you only read.',
    learnerTask: 'Predict exactly what fails downstream when the disturbance hits, then say what you would change to prevent it.',
    icon: '⚡',
    accentColor: 'amber',
    systemPromptDirective:
      'Generate a cause_effect schema with disturbanceShock, cascadeImpact, breakdownState, and counterfactualQuestion.',
    component: TEMPLATE_COMPONENTS.cause_effect,
  },
  analogy_matrix: {
    id: 'analogy_matrix',
    title: 'Analogy Matrix',
    category: 'conceptual',
    cognitiveFramework: 'Gentner Structure Mapping Theory (1983)',
    description: 'Map unfamiliar concepts onto familiar domain structures.',
    learnerBenefit: 'Hooking a strange new idea onto something you already know gives your brain a ready-made retrieval path on a test.',
    learnerTask: 'Map each unfamiliar element to its familiar counterpart and state exactly where the analogy breaks.',
    icon: '🗺️',
    accentColor: 'violet',
    systemPromptDirective:
      'Generate an analogy_matrix schema with analogyMappings array and whereAnalogyBreaks critical boundary.',
    component: TEMPLATE_COMPONENTS.analogy_matrix,
  },
  concept_hierarchy: {
    id: 'concept_hierarchy',
    title: 'Concept Hierarchy Tree',
    category: 'conceptual',
    cognitiveFramework: 'Schema Theory (Piaget, 1952)',
    description: 'Organise concepts into taxonomic parent-child trees.',
    learnerBenefit: 'Putting every fact under a parent category turns a pile of details into a filing cabinet you can search mentally.',
    learnerTask: 'Place each concept under its correct parent branch and justify why it belongs there, not in a sibling branch.',
    icon: '🌳',
    accentColor: 'emerald',
    systemPromptDirective:
      'Generate a concept_hierarchy schema with hierarchyTree (rootNode + branches with subItems).',
    component: TEMPLATE_COMPONENTS.concept_hierarchy,
  },
  state_transition: {
    id: 'state_transition',
    title: 'State Transition / Process Flow',
    category: 'conceptual',
    cognitiveFramework: 'Systems Thinking (Senge, 1990)',
    description: 'Map ordered transitions across system states.',
    learnerBenefit: 'Processes are exam favorites because order matters — walking each state change in sequence locks the order into memory.',
    learnerTask: 'Write what triggers each state change and what the system looks like right after it.',
    icon: '🔄',
    accentColor: 'cyan',
    systemPromptDirective:
      'Generate a state_transition schema with flowSteps array and resetCondition.',
    component: TEMPLATE_COMPONENTS.state_transition,
  },
  boundary_stress_test: {
    id: 'boundary_stress_test',
    title: 'Boundary Stress Test',
    category: 'conceptual',
    cognitiveFramework: 'Failure Mode Analysis (Dekker, 2006)',
    description: 'Identify system limits by stressing boundary variables.',
    learnerBenefit: 'Examiners love edge cases. Knowing exactly where a rule stops working keeps you from over-applying it.',
    learnerTask: 'Push one variable to its extreme and state the threshold where the system breaks.',
    icon: '🧪',
    accentColor: 'rose',
    systemPromptDirective:
      'Generate a boundary_stress_test schema with boundaryGauges array and failureEnvelopeSummary.',
    component: TEMPLATE_COMPONENTS.boundary_stress_test,
  },
  visual_blueprint: {
    id: 'visual_blueprint',
    title: 'Visual Blueprint (Dual Coding)',
    category: 'conceptual',
    cognitiveFramework: 'Paivio Dual-Coding Theory (1971)',
    description: 'Anchor concepts to spatial imagery for dual encoding.',
    learnerBenefit: 'A picture plus words gives you two independent ways to recall the same idea — if one fails, the other still fires.',
    learnerTask: 'Invent your own spatial anchor and describe what moves, where, and what it looks like in your mind.',
    icon: '🗺️',
    accentColor: 'sky',
    systemPromptDirective:
      'Generate a visual_blueprint schema with spatial anchors and motionVector.',
    component: TEMPLATE_COMPONENTS.visual_blueprint,
  },
  contrast_grid: {
    id: 'contrast_grid',
    title: 'Contrast Grid (2×2 Disambiguation)',
    category: 'memorization',
    cognitiveFramework: 'Discrimination Learning (Skinner, 1938)',
    description: 'Disambiguate confusable concepts with a 2×2 matrix.',
    learnerBenefit: 'This grid forces you to compare two things side by side so you stop confusing them on a test.',
    learnerTask: 'Place each item in its correct quadrant and write the one rule that separates the lookalikes.',
    icon: '📊',
    accentColor: 'amber',
    systemPromptDirective:
      'Generate a contrast_grid schema with contrastMatrix (axisX, axisY, quadrants with trapWarning).',
    component: TEMPLATE_COMPONENTS.contrast_grid,
  },
  taxonomic_chunking: {
    id: 'taxonomic_chunking',
    title: 'Taxonomic Chunking',
    category: 'memorization',
    cognitiveFramework: "Miller's Law 7±2 (1956) + Chunking (Chase & Simon)",
    description: 'Group items into semantic buckets to reduce cognitive load.',
    learnerBenefit: 'Your working memory holds about 4 chunks — grouping 20 facts into 4 buckets makes them all fit.',
    learnerTask: 'Sort every item into a bucket yourself and name what the bucket members have in common.',
    icon: '📦',
    accentColor: 'emerald',
    systemPromptDirective:
      'Generate a taxonomic_chunking schema with chunkBuckets array (bucketName, items, colorHint).',
    component: TEMPLATE_COMPONENTS.taxonomic_chunking,
  },
  mnemonic_peg: {
    id: 'mnemonic_peg',
    title: 'Mnemonic Peg & Acronym',
    category: 'memorization',
    cognitiveFramework: 'Encoding Specificity (Tulving & Thomson, 1973)',
    description: 'Encode sequences via acronyms and phonetic pegs.',
    learnerBenefit: 'A silly sentence you invented is far stickier than a list someone handed you — you remember what you create.',
    learnerTask: 'Invent your own acronym or peg image linking each letter to its item.',
    icon: '🔤',
    accentColor: 'violet',
    systemPromptDirective:
      'Generate a mnemonic_peg schema with acronymLetters array (letter, word, mnemonicCue).',
    component: TEMPLATE_COMPONENTS.mnemonic_peg,
  },
  memory_palace: {
    id: 'memory_palace',
    title: 'Memory Palace (Method of Loci)',
    category: 'memorization',
    cognitiveFramework: 'Method of Loci (Yates, 1966; Legge et al., 2012)',
    description: 'Place concepts into vivid spatial rooms for recall.',
    learnerBenefit: 'Walking a familiar route in your head gives ordered facts a physical order you can retrace under pressure.',
    learnerTask: 'Invent your own room and place each item there with a bizarre image only you would think of.',
    icon: '🏛️',
    accentColor: 'indigo',
    systemPromptDirective:
      'Generate a memory_palace schema with palaceRooms array (roomName, locusNumber, itemPlaced, vividSensoryHook).',
    component: TEMPLATE_COMPONENTS.memory_palace,
  },
  formula_spatial_grid: {
    id: 'formula_spatial_grid',
    title: 'Formula Spatial Grid',
    category: 'memorization',
    cognitiveFramework: 'Symbolic Notation (Sweller, 1988 - Cognitive Load Theory)',
    description: 'Decompose formulas into symbols, roles, and dimensions.',
    learnerBenefit: 'Formulas stop being alphabet soup once every symbol has a job and a unit — you can derive instead of memorize.',
    learnerTask: 'Explain in your own words what each symbol does and what happens if it doubles.',
    icon: '⚗️',
    accentColor: 'slate',
    systemPromptDirective:
      'Generate a formula_spatial_grid schema with formulaEquation and formulaComponents (symbol, meaning, role, unitDimension).',
    component: TEMPLATE_COMPONENTS.formula_spatial_grid,
  },
  personal_schema: {
    id: 'personal_schema',
    title: 'Personal Schema & SRS',
    category: 'hybrid',
    cognitiveFramework: 'Self-Reference Effect (Rogers et al., 1977)',
    description: 'Link concepts to personal experience and spaced repetition cards.',
    learnerBenefit: 'Things tied to your own life are recalled far better than abstract facts — this stage makes the link explicit.',
    learnerTask: 'Connect the concept to one real memory from your own life and write the flashcard you would actually review.',
    icon: '🪞',
    accentColor: 'rose',
    systemPromptDirective:
      'Generate a personal_schema with selfReferenceQuestion, realWorldScenario, flashcardFront, and flashcardBack.',
    component: TEMPLATE_COMPONENTS.personal_schema,
  },
  mnemonic_storyboard: {
    id: 'mnemonic_storyboard',
    title: 'Mnemonic Storyboard & Element Grid',
    category: 'memorization',
    cognitiveFramework: 'Narrative Linking Technique & Method of Loci (Lorayne & Lucas, 1974)',
    description: 'Interactive tile grid with absurd, vivid narrative story chains for rapid table memorization.',
    learnerBenefit: 'An absurd story you extend yourself chains items together so recalling one pulls the next along with it.',
    learnerTask: 'Continue the story with your own absurd link that connects the next tile to the previous one.',
    icon: '🧪',
    accentColor: 'emerald',
    systemPromptDirective:
      'Generate a mnemonic_storyboard with questTitle, narrativeStory connecting elements, and interactive tiles (symbol, name, numberOrOrder, mnemonicHook, categoryTag).',
    component: TEMPLATE_COMPONENTS.mnemonic_storyboard,
  },
  broken_model_debug: {
    id: 'broken_model_debug',
    title: 'Socratic Sabotage (Debug Broken Model)',
    category: 'conceptual',
    cognitiveFramework: 'Error-Based Learning & Misconception Pruning (Kapur, 2016)',
    description: 'Spot and correct intentionally planted misconceptions in a sabotaged causal diagram.',
    learnerBenefit: 'Finding planted errors trains the exact skill exams test: noticing when something looks right but is subtly wrong.',
    learnerTask: 'Point at each sabotaged node, name the flaw, and write the corrected version.',
    icon: '🐛',
    accentColor: 'rose',
    systemPromptDirective:
      'Generate a broken_model_debug schema with brokenModel (scenarioTitle, flawCount, studentMisconceptionPremise, sabotagedNodes with isFlawed, expertCorrection).',
    component: TEMPLATE_COMPONENTS.broken_model_debug,
  },
};

/**
 * Adds (or replaces) one template at runtime, so shipping a new workout is
 * "register it", never "go edit the renderer's switch statement". The id is the
 * one the encoder emits as `templateType` and the one the renderer resolves, so
 * a definition registered here renders immediately.
 */
export function registerTemplate(definition: TemplateDefinition): void {
  TEMPLATE_REGISTRY[definition.id] = definition;
  // The renderer dispatches off this table, so a definition registered at
  // runtime is drawable immediately — not "registered but invisible".
  TEMPLATE_COMPONENTS[definition.id] = definition.component;
}

export function getTemplateDefinition(id: string): TemplateDefinition | undefined {
  return TEMPLATE_REGISTRY[id];
}

export function getTemplatesByCategory(category: string): TemplateDefinition[] {
  return Object.values(TEMPLATE_REGISTRY).filter(t => t.category === category);
}

export function getAllTemplates(): TemplateDefinition[] {
  return Object.values(TEMPLATE_REGISTRY);
}

