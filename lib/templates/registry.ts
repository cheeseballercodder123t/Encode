export interface TemplateDefinition {
  id: string;
  title: string;
  category: 'conceptual' | 'memorization' | 'hybrid';
  cognitiveFramework: string;
  description: string;
  icon: string;
  accentColor: string;
  systemPromptDirective: string;
}

export const TEMPLATE_REGISTRY: Record<string, TemplateDefinition> = {
  first_principles: {
    id: 'first_principles',
    title: 'First Principles Deconstruction',
    category: 'conceptual',
    cognitiveFramework: 'Bloom Taxonomy – Analysis (Anderson & Krathwohl, 2001)',
    description: 'Break concepts into irreducible foundational axioms.',
    icon: '🔬',
    accentColor: 'indigo',
    systemPromptDirective:
      'Generate a first_principles schema with causal nodes (input → mechanism → outcome). Include an underlyingAxiom.',
  },
  cause_effect: {
    id: 'cause_effect',
    title: 'Cause & Effect Perturbation',
    category: 'conceptual',
    cognitiveFramework: 'Counterfactual Reasoning (Roese, 1997)',
    description: 'Trace cascading failures from a system disturbance.',
    icon: '⚡',
    accentColor: 'amber',
    systemPromptDirective:
      'Generate a cause_effect schema with disturbanceShock, cascadeImpact, breakdownState, and counterfactualQuestion.',
  },
  analogy_matrix: {
    id: 'analogy_matrix',
    title: 'Analogy Matrix',
    category: 'conceptual',
    cognitiveFramework: 'Gentner Structure Mapping Theory (1983)',
    description: 'Map unfamiliar concepts onto familiar domain structures.',
    icon: '🗺️',
    accentColor: 'violet',
    systemPromptDirective:
      'Generate an analogy_matrix schema with analogyMappings array and whereAnalogyBreaks critical boundary.',
  },
  concept_hierarchy: {
    id: 'concept_hierarchy',
    title: 'Concept Hierarchy Tree',
    category: 'conceptual',
    cognitiveFramework: 'Schema Theory (Piaget, 1952)',
    description: 'Organise concepts into taxonomic parent-child trees.',
    icon: '🌳',
    accentColor: 'emerald',
    systemPromptDirective:
      'Generate a concept_hierarchy schema with hierarchyTree (rootNode + branches with subItems).',
  },
  state_transition: {
    id: 'state_transition',
    title: 'State Transition / Process Flow',
    category: 'conceptual',
    cognitiveFramework: 'Systems Thinking (Senge, 1990)',
    description: 'Map ordered transitions across system states.',
    icon: '🔄',
    accentColor: 'cyan',
    systemPromptDirective:
      'Generate a state_transition schema with flowSteps array and resetCondition.',
  },
  boundary_stress_test: {
    id: 'boundary_stress_test',
    title: 'Boundary Stress Test',
    category: 'conceptual',
    cognitiveFramework: 'Failure Mode Analysis (Dekker, 2006)',
    description: 'Identify system limits by stressing boundary variables.',
    icon: '🧪',
    accentColor: 'rose',
    systemPromptDirective:
      'Generate a boundary_stress_test schema with boundaryGauges array and failureEnvelopeSummary.',
  },
  visual_blueprint: {
    id: 'visual_blueprint',
    title: 'Visual Blueprint (Dual Coding)',
    category: 'conceptual',
    cognitiveFramework: 'Paivio Dual-Coding Theory (1971)',
    description: 'Anchor concepts to spatial imagery for dual encoding.',
    icon: '🗺️',
    accentColor: 'sky',
    systemPromptDirective:
      'Generate a visual_blueprint schema with spatial anchors and motionVector.',
  },
  contrast_grid: {
    id: 'contrast_grid',
    title: 'Contrast Grid (2×2 Disambiguation)',
    category: 'memorization',
    cognitiveFramework: 'Discrimination Learning (Skinner, 1938)',
    description: 'Disambiguate confusable concepts with a 2×2 matrix.',
    icon: '📊',
    accentColor: 'amber',
    systemPromptDirective:
      'Generate a contrast_grid schema with contrastMatrix (axisX, axisY, quadrants with trapWarning).',
  },
  taxonomic_chunking: {
    id: 'taxonomic_chunking',
    title: 'Taxonomic Chunking',
    category: 'memorization',
    cognitiveFramework: "Miller's Law 7±2 (1956) + Chunking (Chase & Simon)",
    description: 'Group items into semantic buckets to reduce cognitive load.',
    icon: '📦',
    accentColor: 'emerald',
    systemPromptDirective:
      'Generate a taxonomic_chunking schema with chunkBuckets array (bucketName, items, colorHint).',
  },
  mnemonic_peg: {
    id: 'mnemonic_peg',
    title: 'Mnemonic Peg & Acronym',
    category: 'memorization',
    cognitiveFramework: 'Encoding Specificity (Tulving & Thomson, 1973)',
    description: 'Encode sequences via acronyms and phonetic pegs.',
    icon: '🔤',
    accentColor: 'violet',
    systemPromptDirective:
      'Generate a mnemonic_peg schema with acronymLetters array (letter, word, mnemonicCue).',
  },
  memory_palace: {
    id: 'memory_palace',
    title: 'Memory Palace (Method of Loci)',
    category: 'memorization',
    cognitiveFramework: 'Method of Loci (Yates, 1966; Legge et al., 2012)',
    description: 'Place concepts into vivid spatial rooms for recall.',
    icon: '🏛️',
    accentColor: 'indigo',
    systemPromptDirective:
      'Generate a memory_palace schema with palaceRooms array (roomName, locusNumber, itemPlaced, vividSensoryHook).',
  },
  formula_spatial_grid: {
    id: 'formula_spatial_grid',
    title: 'Formula Spatial Grid',
    category: 'memorization',
    cognitiveFramework: 'Symbolic Notation (Sweller, 1988 – Cognitive Load Theory)',
    description: 'Decompose formulas into symbols, roles, and dimensions.',
    icon: '⚗️',
    accentColor: 'slate',
    systemPromptDirective:
      'Generate a formula_spatial_grid schema with formulaEquation and formulaComponents (symbol, meaning, role, unitDimension).',
  },
  personal_schema: {
    id: 'personal_schema',
    title: 'Personal Schema & SRS',
    category: 'hybrid',
    cognitiveFramework: 'Self-Reference Effect (Rogers et al., 1977)',
    description: 'Link concepts to personal experience and spaced repetition cards.',
    icon: '🪞',
    accentColor: 'rose',
    systemPromptDirective:
      'Generate a personal_schema with selfReferenceQuestion, realWorldScenario, flashcardFront, and flashcardBack.',
  },
  mnemonic_storyboard: {
    id: 'mnemonic_storyboard',
    title: 'Mnemonic Storyboard & Element Grid',
    category: 'memorization',
    cognitiveFramework: 'Narrative Linking Technique & Method of Loci (Lorayne & Lucas, 1974)',
    description: 'Interactive tile grid with absurd, vivid narrative story chains for rapid table memorization.',
    icon: '🧪',
    accentColor: 'emerald',
    systemPromptDirective:
      'Generate a mnemonic_storyboard with questTitle, narrativeStory connecting elements, and interactive tiles (symbol, name, numberOrOrder, mnemonicHook, categoryTag).',
  },
  broken_model_debug: {
    id: 'broken_model_debug',
    title: 'Socratic Sabotage (Debug Broken Model)',
    category: 'conceptual',
    cognitiveFramework: 'Error-Based Learning & Misconception Pruning (Kapur, 2016)',
    description: 'Spot and correct intentionally planted misconceptions in a sabotaged causal diagram.',
    icon: '🐛',
    accentColor: 'rose',
    systemPromptDirective:
      'Generate a broken_model_debug schema with brokenModel (scenarioTitle, flawCount, studentMisconceptionPremise, sabotagedNodes with isFlawed, expertCorrection).',
  },
};

export function getTemplateDefinition(id: string): TemplateDefinition | undefined {
  return TEMPLATE_REGISTRY[id];
}

export function getTemplatesByCategory(category: string): TemplateDefinition[] {
  return Object.values(TEMPLATE_REGISTRY).filter(t => t.category === category);
}

export function getAllTemplates(): TemplateDefinition[] {
  return Object.values(TEMPLATE_REGISTRY);
}
