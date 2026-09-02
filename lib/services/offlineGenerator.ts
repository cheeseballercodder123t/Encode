import { Activity, EncodingMode, SavedSchema, VisualTemplateType } from '@/lib/types';
import { selectOptimalTemplates, TEMPLATE_CATALOG } from './templateSelector';

interface ExtractedFacts {
  topicTitle: string;
  sentences: string[];
  keyTerms: string[];
  comparisons: { a: string; b: string }[];
  steps: string[];
}

function extractTextFeatures(rawText: string): ExtractedFacts {
  const clean = (rawText || '').trim();
  const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
  
  // Extract topic title
  let topicTitle = lines[0] ? lines[0].replace(/^[#*-]\s*/, '').slice(0, 60) : 'Foundational Core Concepts';
  if (topicTitle.length < 5) topicTitle = 'Core Conceptual Foundations';

  // Extract sentences
  const sentenceRegex = /[^.!?]+[.!?]+/g;
  const matchSentences = clean.match(sentenceRegex) || [clean];
  const sentences = matchSentences.map(s => s.trim()).filter(s => s.length > 10);

  // Extract key terms (words > 5 letters or capitalized)
  const words = clean.match(/[A-Z][a-z]+|[a-z]{6,}/g) || [];
  const uniqueTerms = Array.from(new Set(words)).slice(0, 15);

  // Extract comparison pairs if "vs" or "versus" exists
  const comparisons: { a: string; b: string }[] = [];
  const vsMatch = clean.match(/([A-Za-z\s]+)\s+(?:vs|versus|compared to)\s+([A-Za-z\s]+)/i);
  if (vsMatch) {
    comparisons.push({ a: vsMatch[1].trim().slice(0, 30), b: vsMatch[2].trim().slice(0, 30) });
  }

  // Extract numbered or dash steps
  const steps = lines.filter(l => /^(?:\d+\.|\*|-)\s+/.test(l)).map(l => l.replace(/^(?:\d+\.|\*|-)\s+/, ''));

  return {
    topicTitle,
    sentences,
    keyTerms: uniqueTerms.length > 0 ? uniqueTerms : ['Mechanism', 'Equilibrium', 'Structure', 'Reaction', 'Process'],
    comparisons,
    steps: steps.length >= 3 ? steps : ['Initial Prime State', 'Catalytic Reaction', 'Equilibrium Discharge']
  };
}

/**
 * Deterministically generates a rich 5-Stage Cognitive Workout with Generation Effect partial schemas offline.
 */
export function generateOfflineWorkout(
  rawText: string,
  mode: EncodingMode = 'conceptual'
): { topicSummary: string; activities: Activity[] } {
  const features = extractTextFeatures(rawText);
  const selectedTemplates = selectOptimalTemplates(rawText || features.topicTitle, mode, 5);

  const activities: Activity[] = selectedTemplates.map((candidate, idx) => {
    const stageNum = idx + 1;
    const termA = features.keyTerms[idx % features.keyTerms.length] || 'Primary Actor';
    const termB = features.keyTerms[(idx + 1) % features.keyTerms.length] || 'Target Mechanism';
    const sentence = features.sentences[idx % features.sentences.length] || `${termA} directly regulates ${termB}.`;

    const type: VisualTemplateType = candidate.type;

    let visualData: any = {};
    let prompt = '';
    let field1Label = '';
    let field1Placeholder = '';
    let field2Label = '';
    let field2Placeholder = '';
    let field3Label = undefined;
    let field3Placeholder = undefined;
    let exampleAnswer = '';
    let presetOptions = ['Physical Plumbing', 'City Power Grid', 'Traffic Flow', 'Computer OS', 'Factory Assembly'];

    if (type === 'first_principles') {
      visualData = {
        generationChallenge: {
          premisePrompt: `What is the irreducible physical axiom or constraint that makes ${termA} behave this way?`,
          clue: "Strip away domain jargon. What is the fundamental conservation law or baseline truth?",
          missingRoleOrTarget: "Core Causal Mechanism",
          expertCompletion: `At a first-principles level, ${termA} requires energy gradient to trigger ${termB}.`
        },
        nodes: [
          { id: '1', label: `1. Axiom: ${termA} Gradient`, subtext: 'Fundamental physical constraint', type: 'input' },
          { id: '2', label: `2. Mechanism: ${termB} Activation`, subtext: 'Causal flow', type: 'mechanism' },
          { id: '3', label: `3. Inevitable Outcome`, subtext: 'Observable phenomenon', type: 'outcome' }
        ]
      };
      prompt = `Deconstruct ${termA} down to its irreducible physical or axiomatic premise.`;
      field1Label = 'Irreducible Premise / Physical Law';
      field1Placeholder = `e.g. Energy gradients must balance across ${termA}...`;
      field2Label = 'Step-by-Step Causal Mechanism';
      field2Placeholder = `e.g. As ${termA} shifts, it forces ${termB} to...`;
      field3Label = 'Inevitable Emergent Result';
      field3Placeholder = `e.g. Resulting in equilibrium discharge...`;
      exampleAnswer = `${termA} creates a potential difference that inevitably drives ${termB}.`;
    } else if (type === 'analogy_matrix') {
      visualData = {
        generationChallenge: {
          premisePrompt: `If ${termA} is like water pressure in a pipe, what corresponds to ${termB}?`,
          clue: "Think about the element that experiences the resistance or carries the current.",
          missingRoleOrTarget: "Target Conceptual Correspondence",
          expertCompletion: `${termA} acts as the driving pump, while ${termB} acts as the flow rate.`
        },
        analogyMappings: [
          { sourceElement: 'Water Pump Pressure', targetElement: termA, explanation: 'Provides driving force' },
          { sourceElement: 'Pipe Friction Resistance', targetElement: termB, explanation: 'Opposes or channels the flux' }
        ],
        whereAnalogyBreaks: `Real fluid friction generates heat, whereas ${termA} might be quantized or bounded.`
      };
      prompt = `Bridge ${termA} to a familiar everyday system using Gentner's Structure-Mapping.`;
      field1Label = 'Familiar Everyday Analogy Domain';
      field1Placeholder = `e.g. If ${termA} is like a train station junction...`;
      field2Label = 'Exact Structural Correspondence';
      field2Placeholder = `e.g. Then ${termB} represents the track switch because...`;
      exampleAnswer = `If ${termA} is a water pump, then ${termB} is the pipeline diameter regulating flow.`;
    } else if (type === 'cause_effect') {
      visualData = {
        generationChallenge: {
          premisePrompt: `What happens to the entire system if ${termA} suddenly drops to zero?`,
          clue: "Trace the immediate failure domino: does it freeze, overload, or spiral out of control?",
          missingRoleOrTarget: "Cascading Breakdown State",
          expertCompletion: `Eliminating ${termA} prevents ${termB} from stabilizing, causing complete system collapse.`
        },
        nodes: [
          { id: '1', label: `Steady State: ${termA} Active`, subtext: 'Balanced equilibrium', type: 'input' },
          { id: '2', label: `Perturbation: ${termA} Drops to 0`, subtext: 'Critical shock', type: 'mechanism' },
          { id: '3', label: `Failure State: ${termB} Collapses`, subtext: 'Runaway failure', type: 'danger' }
        ]
      };
      prompt = `Test the system dynamics: Perturb ${termA} and simulate the cascading breakdown.`;
      field1Label = 'Extreme Perturbation Shock';
      field1Placeholder = `e.g. If ${termA} is completely inhibited...`;
      field2Label = 'Cascading Domino Impact';
      field2Placeholder = `e.g. It immediately halts ${termB} synthesis...`;
      exampleAnswer = `When ${termA} drops, ${termB} loses its negative feedback loop, causing runaway depletion.`;
    } else if (type === 'boundary_stress_test') {
      visualData = {
        generationChallenge: {
          premisePrompt: `As ${termA} approaches infinity (or extreme saturation), which assumption collapses?`,
          clue: "Look for rate-limiting capacity or physical spatial limits.",
          missingRoleOrTarget: "Failure Envelope Limit",
          expertCompletion: `At extreme values of ${termA}, receptors saturate and response becomes asymptotic.`
        },
        boundaryGauges: [
          {
            variable: termA,
            normalRange: 'Standard operational baseline',
            extremeCase: 'Approaches infinite saturation or 0',
            breakdownResult: `Non-linear collapse: ${termB} is overwhelmed.`
          }
        ]
      };
      prompt = `Push ${termA} to its asymptotic limit and identify the failure envelope.`;
      field1Label = 'Parameter Limit Tested';
      field1Placeholder = `e.g. Temperature / Concentration of ${termA} -> Infinity...`;
      field2Label = 'Point of Collapse / Breakdown';
      field2Placeholder = `e.g. Transport enzymes saturate and cannot process ${termB}...`;
      exampleAnswer = `At maximum saturation of ${termA}, the linear response curve flattens into an asymptote.`;
    } else if (type === 'taxonomic_chunking') {
      visualData = {
        generationChallenge: {
          premisePrompt: `Group these key elements into 2-3 mutually exclusive working memory buckets.`,
          clue: "Use a clean binary property: active vs passive, polar vs non-polar, fast vs slow.",
          missingRoleOrTarget: "Categorical Chunking Rule",
          expertCompletion: `Bucket 1: Primary Drivers (${termA}); Bucket 2: Secondary Responders (${termB}).`
        },
        chunkBuckets: [
          { bucketName: `Category Alpha (Direct Modulators)`, items: [termA, `${termA}-Type 1`, `${termA}-Type 2`] },
          { bucketName: `Category Beta (Downstream Effectors)`, items: [termB, `${termB}-Alpha`, `${termB}-Beta`] }
        ]
      };
      prompt = `Organize the disparate terms into Miller's 7±2 semantic cluster buckets.`;
      field1Label = 'Semantic Bucket Name';
      field1Placeholder = `e.g. Category Alpha: Upstream Triggers...`;
      field2Label = 'Classified Items & Shared Rule';
      field2Placeholder = `e.g. ${termA} and ${termB} both share...`;
      exampleAnswer = `Upstream Inducers: ${termA}; Downstream Effectors: ${termB}.`;
    } else if (type === 'memory_palace') {
      visualData = {
        generationChallenge: {
          premisePrompt: `Anchor ${termA} and ${termB} in a physical room using a bizarre, exaggerated visual hook.`,
          clue: "Make it loud, violent, colorful, or hilarious. Normal images fade quickly.",
          missingRoleOrTarget: "Vivid Sensory Anchor",
          expertCompletion: `In the entrance foyer, a giant neon ${termA} statue explodes into glowing ${termB} crystals.`
        },
        palaceRooms: [
          { locusNumber: 1, roomName: 'Palace Foyer (Entrance)', itemPlaced: termA, vividSensoryHook: `Giant glowing neon ${termA} radiating pulsing heat.` },
          { locusNumber: 2, roomName: 'Living Room Hearth', itemPlaced: termB, vividSensoryHook: `Exploding fountain of sparks turning into ${termB}.` }
        ]
      };
      prompt = `Anchor ${termA} in your mental architectural route using the Method of Loci.`;
      field1Label = 'Physical Locus Room';
      field1Placeholder = `e.g. Kitchen counter / Front door foyer...`;
      field2Label = 'Bizarre Sensory Interaction';
      field2Placeholder = `e.g. A giant vibrating ${termA} that splashes glowing ${termB} liquid...`;
      exampleAnswer = `At the front door, a giant neon ${termA} statue screams whenever ${termB} passes through.`;
    } else if (type === 'contrast_grid') {
      visualData = {
        generationChallenge: {
          premisePrompt: `What is the single sharpest test that distinguishes ${termA} from ${termB}?`,
          clue: "Identify the exact trap where students confuse them on exams.",
          missingRoleOrTarget: "Discriminative Disambiguation Rule",
          expertCompletion: `${termA} operates continuously, whereas ${termB} is strictly impulse-triggered.`
        },
        contrastMatrix: {
          axisX: `${termA} vs ${termB}`,
          axisY: 'Activation State',
          quadrants: [
            { title: `High ${termA} / Active`, items: [termA], trapWarning: `Do not confuse with ${termB} pathway` },
            { title: `High ${termB} / Active`, items: [termB], trapWarning: 'Requires distinct co-factor' },
            { title: `Low ${termA} / Inhibited`, items: ['Inert State'], trapWarning: 'Baseline quiescent state' },
            { title: `Low ${termB} / Inhibited`, items: ['Suppressed State'], trapWarning: 'Refractory period' }
          ]
        }
      };
      prompt = `Disambiguate ${termA} and ${termB} on a 2x2 contrast grid to eliminate exam confusion.`;
      field1Label = 'Sharpest Distinguishing Test';
      field1Placeholder = `e.g. ${termA} is active in cytosol, whereas ${termB} requires...`;
      field2Label = 'Exam Trap Warning';
      field2Placeholder = `e.g. Common trap is confusing their direction of...`;
      exampleAnswer = `${termA} is rate-limiting and energy-dependent, while ${termB} is a passive channel.`;
    } else {
      // Default Generic Fallback
      visualData = {
        generationChallenge: {
          premisePrompt: `How would you explain the core mechanism of ${termA} in your own words?`,
          clue: "Connect the underlying cause directly to its observed effect.",
          missingRoleOrTarget: "Personal Schema Intuition",
          expertCompletion: `${termA} provides the foundational mechanism that allows ${termB} to function.`
        },
        nodes: [
          { id: '1', label: termA, subtext: 'Core input entity', type: 'input' },
          { id: '2', label: termB, subtext: 'Intermediate mechanism', type: 'mechanism' }
        ]
      };
      prompt = `Synthesize ${termA} into an intuitive mental schema.`;
      field1Label = 'Your Intuitive Understanding';
      field1Placeholder = `e.g. In my own words, ${termA} works by...`;
      field2Label = 'Key Causal Mechanism';
      field2Placeholder = `e.g. This happens because ${termB}...`;
      exampleAnswer = `${termA} triggers the transformation of ${termB} through direct conformational change.`;
    }

    return {
      id: `offline-stage-${stageNum}`,
      stageNumber: stageNum,
      title: `${candidate.name}: ${termA}`,
      framework: candidate.framework,
      cognitiveGoal: candidate.cognitiveGoal,
      contextSnippet: sentence,
      keywords: [termA, termB, 'Offline Schema', 'Generation Effect'],
      templateType: type,
      prompt,
      visualData,
      scaffold: {
        field1Label,
        field1Placeholder,
        field2Label,
        field2Placeholder,
        field3Label,
        field3Placeholder,
        presetOptions,
        exampleAnswer
      }
    };
  });

  return {
    topicSummary: `${features.topicTitle} (Offline Schema Workout)`,
    activities
  };
}
