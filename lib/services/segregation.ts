import { Type } from '@google/genai';

// ─── Concept vs. fact segregation (shared contract) ──────────────────────────
// The 4-quadrant matrix generator lives in two places: the encode-then-segregate
// flow (`/api/segregate`) and the flashcards-only Forge (`/api/forge`), which
// runs the SAME contract once per source and merges the results. Keeping the
// schema and the prompt in one module is what makes a forged deck and a
// segregated deck the same artifact, so the verified export funnel (Wozniak,
// FSRS audit, RemNote rendering) treats them identically.

export type SegregationSection = 'facts' | 'mechanisms' | 'drills' | 'examples';

export const SEGREGATION_SECTIONS: SegregationSection[] = ['facts', 'mechanisms', 'drills', 'examples'];

export const segregationSchema = {
  type: Type.OBJECT,
  properties: {
    topic: { type: Type.STRING },
    declarativeFacts: {
      type: Type.ARRAY,
      description: "Atomic facts: 12-24 items. Each factStatement is ONE short sentence (< 25 words) covering a single testable item. question is a SHORT front-side prompt (< 15 words) that does NOT repeat the answer. clozeSuggestion wraps ONLY the key term in {{}} with the rest as context.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          factStatement: { type: Type.STRING, description: "ONE atomic fact, single short sentence, no compound clauses" },
          question: { type: Type.STRING, description: "Short drill prompt under 15 words, e.g. 'Na+/K+ pump net ion movement?'" },
          clozeSuggestion: { type: Type.STRING, description: "Context sentence with ONLY the key term in {{}}" },
          tag: { type: Type.STRING, description: "e.g. 'Date', 'Formula', 'Constant', 'Anatomy', 'Definition'" },
          memoryHook: { type: Type.STRING, description: "One crisp line on why this matters or how to remember it" }
        },
        required: ["id", "factStatement", "clozeSuggestion"]
      }
    },
    conceptualMechanisms: {
      type: Type.ARRAY,
      description: "Deep causal mechanisms: 4-8 items, one per distinct process/law/framework in the source. Each quadrant field is 1-2 SHORT sentences, never a paragraph.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          conceptName: { type: Type.STRING },
          whatIsIt: { type: Type.STRING, description: "Definition in ONE short sentence" },
          whyItMatters: { type: Type.STRING, description: "Significance in ONE short sentence" },
          howItWorks: { type: Type.STRING, description: "Causal chain in 1-2 short sentences: trigger -> steps -> outcome" },
          whatIfEdgeCase: { type: Type.STRING, description: "Failure mode in ONE short sentence" },
          boundaryContrast: {
            type: Type.OBJECT,
            properties: {
              confusableLookalike: { type: Type.STRING, description: "Similar concept students confuse this with (e.g. Cognitive Dissonance vs Confirmation Bias)" },
              distinguishingRule: { type: Type.STRING, description: "The sharp test to differentiate between the two" }
            },
            required: ["confusableLookalike", "distinguishingRule"]
          }
        },
        required: ["id", "conceptName", "whatIsIt", "whyItMatters", "howItWorks", "whatIfEdgeCase"]
      }
    },
    practiceQuestions: {
      type: Type.ARRAY,
      description: "Rapid-fire recall drills: 8-16 short Q/A cards. Each question is answerable in under ~10 seconds and tests a different fact, number, step, or discrimination from the source.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          question: { type: Type.STRING, description: "Short front-side question under 20 words" },
          answer: { type: Type.STRING, description: "Concise correct answer, one line where possible" },
          whyCorrect: { type: Type.STRING, description: "One-line reason the answer is right" },
          distractors: {
            type: Type.ARRAY,
            description: "2-3 common wrong answers for self-testing",
            items: { type: Type.STRING }
          }
        },
        required: ["id", "question", "answer"]
      }
    },
    workedExamples: {
      type: Type.ARRAY,
      description: "Worked examples: 2-4 items walking a concrete problem from the source step-by-step. Each step is one atomic line.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          title: { type: Type.STRING },
          problem: { type: Type.STRING, description: "Problem setup in 1-2 short sentences" },
          steps: {
            type: Type.ARRAY,
            description: "3-6 atomic solution steps",
            items: { type: Type.STRING }
          },
          takeaway: { type: Type.STRING, description: "Transfer rule in one line" }
        },
        required: ["id", "title", "problem", "steps"]
      }
    },
    compressionRatio: {
      type: Type.STRING,
      description: "Estimated fluff reduction e.g. '62% Fluff Eliminated'"
    }
  },
  required: ["topic", "declarativeFacts", "conceptualMechanisms", "practiceQuestions", "workedExamples"]
};

/** Which arrays to fill; everything else must come back empty. */
export function resolveSegregationSections(include?: string[]): Record<SegregationSection, boolean> {
  const requested = Array.isArray(include) ? include : null;
  return {
    facts: !requested || requested.includes('facts'),
    mechanisms: !requested || requested.includes('mechanisms'),
    drills: !requested || requested.includes('drills'),
    examples: !requested || requested.includes('examples'),
  };
}

export function describeWantedSections(want: Record<SegregationSection, boolean>): string {
  return [
    want.facts ? 'declarativeFacts (12-24)' : null,
    want.mechanisms ? 'conceptualMechanisms (4-8)' : null,
    want.drills ? 'practiceQuestions (8-16)' : null,
    want.examples ? 'workedExamples (2-4)' : null,
  ].filter(Boolean).join(', ');
}

/**
 * The card-authoring contract. `sourceLabel` names which upload produced this
 * batch when several sources are forged into one deck, so the model can keep
 * cross-source overlap low (the Forge dedupes it afterwards either way).
 */
export function buildSegregationSystemPrompt(
  want: Record<SegregationSection, boolean>,
  sourceLabel?: string
): string {
  const wantedLabels = describeWantedSections(want);
  const sourceLine = sourceLabel
    ? `\nSOURCE: this batch is ONE of several sources being forged into a single deck ("${sourceLabel}"). Write cards only from THIS source's material; the merging pass drops anything duplicated across sources.\n`
    : '';

  return `You are a Knowledge Graph and RemNote Taxonomy Specialist.
Your mission is HIGH-VOLUME FLASHCARD GENERATION with CONCEPT VS. FACT SEGREGATION, SEMANTIC COMPRESSION, 4-QUADRANT MATRIX EXTRACTION, and BOUNDARY EDGE-CASE GENERATION:
${sourceLine}
SECTIONS TO GENERATE (generate ONLY these; set every other array to empty []):
- ${wantedLabels || '(none selected - return empty arrays)'}

VOLUME TARGETS (hit every minimum — under-producing is a failure):
- declarativeFacts: 12-24 atomic facts. Cover EVERY testable item in the source: each date, number, constant, formula, name, term, and definition gets its own card. If the source is small, split compound facts into separate atomic cards rather than returning fewer.
- conceptualMechanisms: 4-8 mechanisms, one per distinct process/law/framework.
- practiceQuestions: 8-16 rapid-fire Q/A drills covering different facts, numbers, steps, and discriminations.
- workedExamples: 2-4 step-by-step worked examples.
If at least facts+mechs selected, hit 26-52 total cards; otherwise fill the selected sections generously.

CARD BREVITY RULES (a long card is a failed card):
- factStatement: ONE atomic fact, ONE short sentence, < 25 words, single clause. Split compounds — never cram two facts into one card.
- question: SHORT drill prompt < 15 words that does NOT contain the answer. Bad: "What is the Na+/K+ pump which moves 3 Na+ out and 2 K+ in?" Good: "Na+/K+ pump net ion movement?"
- clozeSuggestion: context sentence with ONLY the key term in {{}}. The front must be guessable without seeing the answer.
- Every quadrant field (whatIsIt / whyItMatters / howItWorks / whatIfEdgeCase): 1-2 SHORT sentences, never a paragraph.
- practiceQuestions: answerable in under ~10 seconds. If it needs an essay, split it into smaller questions.
- No card front may exceed 25 words. No back may exceed 40 words.

1. Segregate the raw input into TWO distinct buckets (when both selected):
   - Declarative Facts: Static memorization items (dates, constants, formulas, proper nouns) -> formatted with {{cloze}} deletions.
   - Conceptual Mechanisms: Deep dynamic processes -> formatted into the strict 4-Quadrant Matrix (What, Why, How, What-If).
2. Semantic Compression: Eliminate 60% of fluffy filler words, keeping only atomic, high-impact statements.
3. Boundary & Edge-Case Contrast: For each concept, generate a confusing lookalike and provide the exact rule to tell them apart (e.g. Cognitive Dissonance vs Confirmation Bias).
4. Output strictly valid JSON.`;
}

/** The user-side turn: raw notes, an attached file, or both. */
export function buildSegregationUserPrompt(opts: {
  notes?: string;
  hasFile?: boolean;
  fileName?: string;
  fileType?: string;
  sourceLabel?: string;
}): string {
  let userPrompt = '';
  const label = opts.sourceLabel ? `SOURCE: ${opts.sourceLabel}\n` : '';
  if (opts.notes) {
    userPrompt += `${label}STUDENT RAW NOTES:\n\n${opts.notes.slice(0, 14000)}\n\n`;
  } else if (label) {
    userPrompt += label;
  }
  if (opts.hasFile) {
    userPrompt += `[ATTACHED FILE: ${opts.fileName || 'source'} (${opts.fileType || 'unknown'}). Segregate facts and concepts.]`;
  }
  userPrompt += `Perform Fact vs. Concept Segregation and 4-Quadrant Matrix decomposition.`;
  return userPrompt;
}
