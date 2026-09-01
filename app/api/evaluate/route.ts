import { Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { generateJSONWithProvider } from "@/lib/ai-client";

const evaluationSchema = {
  type: Type.OBJECT,
  properties: {
    grade: {
      type: Type.STRING,
      description: "One of: 'mastered', 'good', 'needs_elaboration'"
    },
    score: {
      type: Type.INTEGER,
      description: "A score between 50 and 100 based on cognitive depth and clarity"
    },
    xpBonus: {
      type: Type.INTEGER,
      description: "Bonus XP earned (25 for needs_elaboration, 40 for good, 60 for mastered)"
    },
    feedback: {
      type: Type.STRING,
      description: "A concise 1-2 sentence coaching tip acknowledging what was explained well and pointing out any shallow hand-waving or missing nuance."
    },
    depthAlert: {
      type: Type.STRING,
      description: "Optional 1-line alert if the user exhibited the Illusion of Explanatory Depth (e.g., using jargon words without describing the underlying mechanism)."
    }
  },
  required: ["grade", "score", "xpBonus", "feedback"]
};

export async function POST(req: NextRequest) {
  try {
    const {
      stageTitle,
      framework,
      prompt,
      contextSnippet,
      field1Label,
      field1Value,
      field2Label,
      field2Value,
      field3Label,
      field3Value,
      settings
    } = await req.json();

    if (!field1Value && !field2Value) {
      return NextResponse.json({ error: "No answers provided to evaluate." }, { status: 400 });
    }

    const systemPrompt = `You are the Feynman Cognitive Coach & Socratic Evaluator.
Your job is to rapidly assess a student's active cognitive encoding response.

EVALUATION CRITERIA:
1. Did the student explain the concept in genuine, clear first-principles language, or did they just copy-paste/parrot textbook buzzwords?
2. Did they articulate the core mechanism/causality or mnemonic connection?
3. Check for the 'Illusion of Explanatory Depth' (feeling like they understand because they recognize terms, but unable to explain the inner moving parts).

Be encouraging, academic, and hyper-concise (1-2 sentences maximum).
Output strictly JSON matching the evaluation schema.`;

    const userPrompt = `STAGE: ${stageTitle} (${framework})
PROMPT: ${prompt}
SOURCE CONTEXT: ${contextSnippet}

STUDENT'S SUBMISSION:
- ${field1Label}: "${field1Value || ''}"
- ${field2Label}: "${field2Value || ''}"
${field3Label && field3Value ? `- ${field3Label}: "${field3Value}"` : ''}`;

    const evaluation = await generateJSONWithProvider({
      systemPrompt,
      userPrompt,
      responseSchema: evaluationSchema,
      settings,
      isChecker: true, // Uses lightweight gemini-2.5-flash-lite or configured checker model
    });

    return NextResponse.json(evaluation);
  } catch (error: any) {
    console.error("Error in /api/evaluate:", error);
    return NextResponse.json({
      error: error?.message || "Failed to evaluate response."
    }, { status: 500 });
  }
}
