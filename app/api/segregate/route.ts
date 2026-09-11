import { Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { generateJSONWithProvider } from "@/lib/ai-client";

const segregationSchema = {
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

export async function POST(req: NextRequest) {
  try {
    const { notes, file, settings, include } = await req.json();

    const hasNotes = typeof notes === 'string' && notes.trim().length > 0;
    const hasFile = file && file.base64Data && file.type;

    if (!hasNotes && !hasFile) {
      return NextResponse.json({ error: "No notes provided for segregation." }, { status: 400 });
    }

    // Which flashcard sections the user wants. Default : everything.
    const want = {
      facts: !Array.isArray(include) || include.includes('facts'),
      mechanisms: !Array.isArray(include) || include.includes('mechanisms'),
      drills: !Array.isArray(include) || include.includes('drills'),
      examples: !Array.isArray(include) || include.includes('examples'),
    };
    const wantedLabels = [
      want.facts ? 'declarativeFacts (12-24)' : null,
      want.mechanisms ? 'conceptualMechanisms (4-8)' : null,
      want.drills ? 'practiceQuestions (8-16)' : null,
      want.examples ? 'workedExamples (2-4)' : null,
    ].filter(Boolean).join(', ');

    const systemPrompt = `You are a Knowledge Graph and RemNote Taxonomy Specialist.
Your mission is HIGH-VOLUME FLASHCARD GENERATION with CONCEPT VS. FACT SEGREGATION, SEMANTIC COMPRESSION, 4-QUADRANT MATRIX EXTRACTION, and BOUNDARY EDGE-CASE GENERATION:

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
3. Boundary & Edge-Case Contrast: For each concept, generate a confusing lookalike and provide the exact rule to tell them apart (e.g., Cognitive Dissonance vs Confirmation Bias).
4. Output strictly valid JSON.`;

    let userPrompt = '';
    if (hasNotes) {
      userPrompt += `STUDENT RAW NOTES:\n\n${notes.slice(0, 14000)}\n\n`;
    }
    if (hasFile) {
      userPrompt += `[ATTACHED FILE: ${file.name} (${file.type}). Segregate facts and concepts.]`;
    }

    userPrompt += `Perform Fact vs. Concept Segregation and 4-Quadrant Matrix decomposition.`;

    const result = await generateJSONWithProvider({
      systemPrompt,
      userPrompt,
      responseSchema: segregationSchema,
      settings,
      // Segregation is a heavyweight generation task (26-52 cards with worked
      // examples), so it must ride the powerful generator model, not flash-lite.
      isChecker: false,
      file: hasFile ? file : null,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error in /api/segregate:", error);
    return NextResponse.json({ 
      error: error?.message || "Failed to segregate concepts and facts." 
    }, { status: 500 });
  }
}
