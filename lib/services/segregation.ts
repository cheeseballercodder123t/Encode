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
    confusablePairs: {
      type: Type.ARRAY,
      description: "Confusable Pairs / Discrimination Matrix: 2-4 pairs of closely related concepts students confuse on exams (e.g. SN1 vs SN2, Mitosis vs Meiosis, Sympathetic vs Parasympathetic).",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          conceptA: { type: Type.STRING },
          conceptB: { type: Type.STRING },
          distinguishingAxis: { type: Type.STRING, description: "Primary dimension of contrast, e.g. 'Rate law & Intermediate' or 'Function & Neurotransmitter'" },
          boundaryCondition: { type: Type.STRING, description: "Exact trigger or condition under which the system switches from A to B" },
          conceptAFeature: { type: Type.STRING, description: "Distinctive characteristic of Concept A" },
          conceptBFeature: { type: Type.STRING, description: "Distinctive characteristic of Concept B" },
          diagnosticVignette: { type: Type.STRING, description: "Exam-style edge-case vignette testing which of the two applies" },
          diagnosticAnswer: { type: Type.STRING, description: "Which concept applies and why" }
        },
        required: ["id", "conceptA", "conceptB", "distinguishingAxis", "boundaryCondition", "conceptAFeature", "conceptBFeature", "diagnosticVignette", "diagnosticAnswer"]
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
    want.facts ? 'declarativeFacts (16-32)' : null,
    want.mechanisms ? 'conceptualMechanisms (4-8)' : null,
    want.drills ? 'practiceQuestions (12-24)' : null,
    want.examples ? 'workedExamples (2-4)' : null,
  ].filter(Boolean).join(', ');
}

/**
 * The brevity contract every card-authoring pass obeys — the first pass, and
 * the "generate more" pass that extends a deck the learner found too small.
 */
const CARD_BREVITY_RULES = `CARD BREVITY RULES (a long card is a failed card):
- factStatement: ONE atomic fact, ONE short sentence, < 25 words, single clause. Split compounds — never cram two facts into one card.
- question: SHORT drill prompt < 15 words that does NOT contain the answer. Bad: "What is the Na+/K+ pump which moves 3 Na+ out and 2 K+ in?" Good: "Na+/K+ pump net ion movement?"
- clozeSuggestion: context sentence with ONLY the key term in {{}}. The front must be guessable without seeing the answer.
- Every quadrant field (whatIsIt / whyItMatters / howItWorks / whatIfEdgeCase): 1-2 SHORT sentences, never a paragraph.
- practiceQuestions: answerable in under ~10 seconds. If it needs an essay, split it into smaller questions.
- No card front may exceed 25 words. No back may exceed 40 words.`;

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
- declarativeFacts: 16-32 atomic facts. Cover EVERY testable item in the source: each date, number, constant, formula, name, term, and definition gets its own card. If the source is small, split compound facts into separate atomic cards rather than returning fewer.
- conceptualMechanisms: 4-8 mechanisms, one per distinct process/law/framework.
- practiceQuestions: 12-24 rapid-fire Q/A drills covering different facts, numbers, steps, and discriminations.
- workedExamples: 2-4 step-by-step worked examples.
- confusablePairs: 2-4 pairs of concepts students confuse on exams (e.g. SN1 vs SN2, Mitosis vs Meiosis, Type I vs Type II error). Test the boundary condition: under what exact condition does the system switch from A to B?
If at least facts+mechs selected, hit 30-64 total cards; otherwise fill the selected sections generously. A lecture that yields fewer than 50 cards was under-mined: work through the reverse of every card, the second-order consequences, the neighbouring-term distinctions and each named step before you stop.

${CARD_BREVITY_RULES}

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

/**
 * The "generate more" contract: the learner forged a deck and said it is not
 * enough. The sources are unchanged; the job is to find what the first pass
 * missed and return ONLY that, so the batch merges onto the deck without a
 * single duplicate.
 */
export function buildMoreCardsSystemPrompt(
  want: Record<SegregationSection, boolean>,
  sourceLabel?: string
): string {
  const wantedLabels = describeWantedSections(want);
  const sourceLine = sourceLabel
    ? `\nSOURCE: this batch is ONE of several sources being forged into a single deck ("${sourceLabel}"). Extend only from THIS source's material.\n`
    : '';

  return `You are a Knowledge Graph and RemNote Taxonomy Specialist EXTENDING a flashcard deck the learner says is too small.
Same contract as the first pass, but the mission is now COVERAGE: find the testable material the first pass skipped and turn it into additional cards.
${sourceLine}
SECTIONS TO GENERATE (generate ONLY these; set every other array to empty []):
- ${wantedLabels || '(none selected - return empty arrays)'}

THE ONE HARD RULE — NO REPEATS:
The learner's existing cards are listed under ALREADY IN THE DECK. Every card you return must test something those cards do NOT already test. Re-wording an existing card is a duplicate, not a new card. If a fact is already covered, mine a different one.

WHERE THE MISSING CARDS ARE (this is the work):
- Every number, date, unit, constant and formula the first pass skipped, one card each.
- The reverse direction of each one-way card (back -> front, symptom -> cause, effect -> trigger).
- Second-order consequences: what happens next, what limits it, what breaks it.
- Distinctions between neighbouring terms, with the exact test that separates them.
- Each named step of every process as its own drill.
- The common wrong answer for an existing card, as its own discrimination drill.
- Edge cases, exceptions and failure modes.

VOLUME: up to 20 additional cards per source when the material supports it. Returning nothing is correct only when every testable item in the source is already covered — say so by returning empty arrays rather than padding the deck with restatements.

${CARD_BREVITY_RULES}

Output strictly valid JSON in the SAME schema as the first pass.`;
}

/** The user turn for "generate more": the same source, plus what not to repeat. */
export function buildMoreCardsUserPrompt(opts: {
  notes?: string;
  hasFile?: boolean;
  fileName?: string;
  fileType?: string;
  sourceLabel?: string;
  existing?: string[];
}): string {
  let userPrompt = '';
  const label = opts.sourceLabel ? `SOURCE: ${opts.sourceLabel}\n` : '';
  if (opts.notes) {
    userPrompt += `${label}STUDENT RAW NOTES:\n\n${opts.notes.slice(0, 14000)}\n\n`;
  } else if (label) {
    userPrompt += label;
  }
  if (opts.hasFile) {
    userPrompt += `[ATTACHED FILE: ${opts.fileName || 'source'} (${opts.fileType || 'unknown'}). Re-read it for material the first pass missed.]\n\n`;
  }

  const existing = (opts.existing || []).filter(Boolean);
  if (existing.length > 0) {
    userPrompt += `ALREADY IN THE DECK (${existing.length} card${existing.length === 1 ? '' : 's'}) — do NOT repeat, re-word or trivially extend any of these:\n`;
    userPrompt += existing.map((line) => `- ${line.slice(0, 160)}`).join('\n');
    userPrompt += `\n\n`;
  }

  userPrompt += `Return ONLY cards that are new: the facts, drills, mechanisms and examples the first pass did not cover.`;
  return userPrompt;
}

/**
 * The "condense" contract: the learner thinks the deck is bloated. Merging is
 * the only move available here — nothing may be deleted, only folded together.
 */
export function buildCondenseSystemPrompt(): string {
  return `You are a Flashcard Deck Editor performing SEMANTIC CONDENSATION.
The learner believes their deck is too long and wants FEWER, DENSER cards. Your job is to MERGE, never to delete knowledge.

MERGE RULES (a condensed card must still teach everything the originals taught):
- Two or more cards asserting the same thing: keep the single best-worded one.
- Two cards that are two halves of one idea (a cause and its effect, a rule and its exception, a step and its trigger): combine them into ONE card only if the combined front stays under 25 words and the back under 40.
- Near-duplicate drills: keep the sharpest question and fold the other facts into its answer.
- The same concept at two granularities: keep the atomic version and drop the vague one.
- NEVER merge unrelated cards just to shrink the count. Coverage is preserved: after condensation the deck must still answer every question the original deck answered.
- Keep exactly ONE key term in {{}} per fact, and keep any card tagged "Contradiction" intact — it must survive.
- Every front stays under 25 words; every back under 40.

Target roughly 50-70% of the original card count, achieved purely by folding overlap. If the deck has no real overlap, return it essentially unchanged and say so in compressionRatio.

Output strictly valid JSON in the SAME schema: the same four arrays with the condensed cards and fresh sequential ids.`;
}

/** The user turn for "condense": the deck itself, plus what must survive. */
export function buildCondenseUserPrompt(deck: unknown): string {
  return `DECK TO CONDENSE (merge overlapping cards; every distinct fact must stay answerable):\n\n${JSON.stringify(deck)}\n\nReturn the condensed deck in the same JSON schema.`;
}
