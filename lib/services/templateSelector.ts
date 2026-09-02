import { VisualTemplateType, EncodingMode } from '@/lib/types';

export interface TemplateCandidate {
  type: VisualTemplateType;
  name: string;
  framework: string;
  cognitiveGoal: string;
  weight: number;
  mode: EncodingMode;
  triggers: RegExp[];
  description: string;
}

export const TEMPLATE_CATALOG: TemplateCandidate[] = [
  // CONCEPTUAL TEMPLATES
  {
    type: 'first_principles',
    name: 'First-Principles Causal Chain',
    framework: 'Axiomatic Causal Reduction',
    cognitiveGoal: 'Deconstruct phenomena into irreducible physical or logical premises.',
    weight: 10,
    mode: 'conceptual',
    triggers: [/\b(axiom|foundation|physics|core rule|fundamental|origin|derivation|why does|principle)\b/i],
    description: 'Decomposes concepts into irreducible step-by-step causal mechanisms.'
  },
  {
    type: 'cause_effect',
    name: 'Perturbation & Counterfactual Domino',
    framework: 'Counterfactual System Dynamics',
    cognitiveGoal: 'Test system fragility and ripple effects under severe perturbations.',
    weight: 9,
    mode: 'conceptual',
    triggers: [/\b(system|dynamic|feedback|perturbation|consequence|impact|equilibrium|homeostasis|what happens if|drops|increases)\b/i],
    description: 'Explores what happens when a critical variable drops or spikes.'
  },
  {
    type: 'visual_blueprint',
    name: 'Dual-Coding Mental Blueprint',
    framework: "Paivio Dual-Coding & Spatial Scaffolding",
    cognitiveGoal: 'Convert abstract propositional text into rich spatial mental imagery.',
    weight: 8,
    mode: 'conceptual',
    triggers: [/\b(anatomy|cell|architecture|spatial|structure|cortex|layout|diagram|organ|device|circuit)\b/i],
    description: 'Grounds abstract theories in vivid spatial coordinates and mental diagrams.'
  },
  {
    type: 'analogy_matrix',
    name: 'Schema Bridge & Structural Analogy',
    framework: 'Gentner Structure-Mapping Theory',
    cognitiveGoal: 'Map deep relational structures from an intuitive domain to abstract theory.',
    weight: 10,
    mode: 'conceptual',
    triggers: [/\b(abstract|quantum|voltage|currency|economy|operating system|kernel|compiler|memory|distributed|algorithm)\b/i],
    description: 'Bridges complex mechanics to familiar everyday domains.'
  },
  {
    type: 'concept_hierarchy',
    name: 'Taxonomic Mind Tree',
    framework: "Ausubel Meaningful Subsumption & DAG",
    cognitiveGoal: 'Nest specific sub-mechanisms under superordinate umbrella theories.',
    weight: 8,
    mode: 'conceptual',
    triggers: [/\b(hierarchy|taxonomy|classes|subtypes|phylogeny|categories|superordinate|branches|structure)\b/i],
    description: 'Maps parent theories to child mechanisms and branch conditions.'
  },
  {
    type: 'state_transition',
    name: 'Cyclic State Machine & Feedback Loop',
    framework: 'Finite State Automata & Cyclic Synthesis',
    cognitiveGoal: 'Track cyclic stages, triggers, and reset conditions.',
    weight: 9,
    mode: 'conceptual',
    triggers: [/\b(cycle|krebs|handshake|protocol|loop|turnover|cascade|phase|repolarization|action potential|oscillation)\b/i],
    description: 'Maps multi-step sequences, biochemical cycles, and state transitions.'
  },
  {
    type: 'boundary_stress_test',
    name: 'Parameter Extremes & Failure Envelope',
    framework: 'Boundary Value Stress-Testing',
    cognitiveGoal: 'Find the breakdown limits where assumptions cease to hold.',
    weight: 8,
    mode: 'conceptual',
    triggers: [/\b(limit|infinity|zero|temperature|pressure|edge case|singularity|stress|boundary|saturation)\b/i],
    description: 'Pushes parameters to extreme asymptotes to reveal system limits.'
  },
  {
    type: 'personal_schema',
    name: 'Self-Reference & Spaced Repetition Synthesis',
    framework: 'Rogers Self-Reference Effect & SRS',
    cognitiveGoal: 'Anchor target concept into personal intuition and real-world decisions.',
    weight: 7,
    mode: 'conceptual',
    triggers: [/\b(intuition|decision|clinical|everyday|personal|heuristics|practice|exam|diagnosis)\b/i],
    description: 'Synthesizes insights into personal memory hooks and spaced flashcards.'
  },

  // MEMORIZATION TEMPLATES
  {
    type: 'taxonomic_chunking',
    name: "Miller's 7±2 Cluster Buckets",
    framework: "Miller Working Memory Chunking (1956)",
    cognitiveGoal: 'Group long lists of items into 3-5 distinct semantic clusters.',
    weight: 10,
    mode: 'memorization',
    triggers: [/\b(amino acids|elements|drugs|acids|bases|list|categories|types|classification|polar|non-polar)\b/i],
    description: 'Clusters high-volume declarative facts into working memory buckets.'
  },
  {
    type: 'mnemonic_peg',
    name: 'Phonetic Peg & Acronym Matrix',
    framework: 'Phonetic Peg System & Acrostic Encoding',
    cognitiveGoal: 'Bind ordered items to unforgettable phonetic or letter cues.',
    weight: 10,
    mode: 'memorization',
    triggers: [/\b(cranial nerves|order|sequence|acronym|mnemonics|stages|geological epochs|planets|steps in order)\b/i],
    description: 'Binds sequential terms to phonetic pegs and vibrant acronyms.'
  },
  {
    type: 'memory_palace',
    name: 'Method of Loci Spatial Journey',
    framework: 'Yates Method of Loci & Spatial Navigation',
    cognitiveGoal: 'Place items along a vivid physical architectural route.',
    weight: 9,
    mode: 'memorization',
    triggers: [/\b(pathway|sequence|anatomy|organs|history|dates|numbered list|steps|stages|palace)\b/i],
    description: 'Anchors terms in a physical mental walk with bizarre sensory imagery.'
  },
  {
    type: 'contrast_grid',
    name: '2x2 Discriminative Disambiguation Matrix',
    framework: 'Gibson Perceptual Learning & Feature Contrast',
    cognitiveGoal: 'Sharpen boundaries between confusable lookalike terms.',
    weight: 9,
    mode: 'memorization',
    triggers: [/\b(vs|versus|difference between|confusable|lookalike|contrast|distinction|trap|misconception)\b/i],
    description: '2x2 matrix separating easily confused lookalike terms and exam traps.'
  },
  {
    type: 'formula_spatial_grid',
    name: 'Formula & Equation Decomposition Line',
    framework: 'Visual Propositional Algebra & Chunking',
    cognitiveGoal: 'Break equations into variable roles, constants, and intuitive operators.',
    weight: 8,
    mode: 'memorization',
    triggers: [/\b(formula|equation|law|constant|variable|math|derivative|integral|constant|theorem)\b/i],
    description: 'Deconstructs equations into dimensional subway stations and roles.'
  }
];

/**
 * Recommends the top 5 diverse templates for a given text, topic, and learning mode.
 */
export function selectOptimalTemplates(
  textOrTopic: string,
  mode: EncodingMode = 'conceptual',
  requestedCount: number = 5
): TemplateCandidate[] {
  const normalizedText = (textOrTopic || '').toLowerCase();
  
  // Filter by matching mode first
  const pool = TEMPLATE_CATALOG.filter(t => t.mode === mode);
  
  // Score candidates based on trigger matches and base weights
  const scored = pool.map(candidate => {
    let score = candidate.weight;
    
    for (const trigger of candidate.triggers) {
      if (trigger.test(normalizedText)) {
        score += 15;
      }
    }
    
    return { candidate, score };
  });

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  // Take top distinct candidates
  const selected: TemplateCandidate[] = [];
  const chosenTypes = new Set<VisualTemplateType>();

  for (const item of scored) {
    if (!chosenTypes.has(item.candidate.type)) {
      chosenTypes.add(item.candidate.type);
      selected.push(item.candidate);
    }
    if (selected.length >= requestedCount) break;
  }

  // If we still need more templates to fill the requested count, pull remaining
  if (selected.length < requestedCount) {
    for (const item of pool) {
      if (!chosenTypes.has(item.type)) {
        chosenTypes.add(item.type);
        selected.push(item);
      }
      if (selected.length >= requestedCount) break;
    }
  }

  return selected.slice(0, requestedCount);
}
