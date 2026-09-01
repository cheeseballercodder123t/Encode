import { Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { generateJSONWithProvider } from "@/lib/ai-client";

const segregationSchema = {
  type: Type.OBJECT,
  properties: {
    topic: { type: Type.STRING },
    declarativeFacts: {
      type: Type.ARRAY,
      description: "Static dates, numbers, chemical formulas, proper nouns, and historical trivia (maps to RemNote Cloze cards).",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          factStatement: { type: Type.STRING },
          clozeSuggestion: { type: Type.STRING, description: "Card with {{}} wrapping the key item" },
          tag: { type: Type.STRING, description: "e.g. 'Date', 'Formula', 'Constant', 'Anatomy'" }
        },
        required: ["id", "factStatement", "clozeSuggestion"]
      }
    },
    conceptualMechanisms: {
      type: Type.ARRAY,
      description: "Dynamic causal chains, laws of physics/biology, reasoning frameworks, and 'How/Why' processes (maps to RemNote 4-Quadrant Descriptor cards).",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          conceptName: { type: Type.STRING },
          whatIsIt: { type: Type.STRING, description: "Definition" },
          whyItMatters: { type: Type.STRING, description: "Significance" },
          howItWorks: { type: Type.STRING, description: "Causal step-by-step mechanism" },
          whatIfEdgeCase: { type: Type.STRING, description: "What happens if this mechanism breaks or fails" },
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
    compressionRatio: {
      type: Type.STRING,
      description: "Estimated fluff reduction e.g. '62% Fluff Eliminated'"
    }
  },
  required: ["topic", "declarativeFacts", "conceptualMechanisms"]
};

export async function POST(req: NextRequest) {
  try {
    const { notes, file, settings } = await req.json();

    const hasNotes = typeof notes === 'string' && notes.trim().length > 0;
    const hasFile = file && file.base64Data && file.type;

    if (!hasNotes && !hasFile) {
      return NextResponse.json({ error: "No notes provided for segregation." }, { status: 400 });
    }

    const systemPrompt = `You are a Knowledge Graph and RemNote Taxonomy Specialist.
Your mission is to perform CONCEPT VS. FACT SEGREGATION, SEMANTIC COMPRESSION, 4-QUADRANT MATRIX EXTRACTION, and BOUNDARY EDGE-CASE GENERATION:

1. Segregate the raw input into TWO distinct buckets:
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
