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
    },
    errorAnalysis: {
      type: Type.STRING,
      description: "Targeted error analysis: 1 concise sentence highlighting the exact missing logical step or causal bridge compared to expert understanding."
    }
  },
  required: ["grade", "score", "xpBonus", "feedback"]
};

const batchEvaluationSchema = {
  type: Type.OBJECT,
  properties: {
    overallScore: {
      type: Type.INTEGER,
      description: "Aggregated overall session performance score between 0 and 100"
    },
    analysis: {
      type: Type.STRING,
      description: "A 2-3 sentence holistic evaluation comparing the student's demonstrated first-principles understanding against expected cognitive depth."
    },
    perStageGrades: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          stageTitle: { type: Type.STRING },
          grade: { type: Type.STRING, description: "'mastered' | 'good' | 'needs_elaboration'" },
          score: { type: Type.INTEGER },
          feedback: { type: Type.STRING }
        },
        required: ["stageTitle", "grade", "score", "feedback"]
      }
    }
  },
  required: ["overallScore", "analysis", "perStageGrades"]
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { batchMode, stages, settings, preSessionConfidence, topicSummary } = body;

    // Batch mode for End Session Performance Review
    if (batchMode && Array.isArray(stages)) {
      const systemPrompt = `You are the Feynman Master Evaluator & Metacognitive Assessor.
Analyze the complete multi-stage cognitive encoding workout submitted by the learner for "${topicSummary || 'Cognitive Schema'}".
Assess the student's genuine grasp across all stages. Rate overall performance (0-100), give 2-3 sentences of holistic insight, and grade each stage.
Be strict but encouraging: reward active causal deduction; penalize memorized jargon without explanation.`;

      const userPrompt = `TOPIC: ${topicSummary || 'Cognitive Workout'}
PRE-SESSION SELF-RATED CONFIDENCE: ${preSessionConfidence || 3}/5

STUDENT WORKOUT SUBMISSIONS:
${stages.map((s: any, idx: number) => `
STAGE ${idx + 1}: ${s.title} (${s.framework || 'Framework'})
- ${s.field1Label || 'Primary Concept'}: "${s.field1Value || ''}"
- ${s.field2Label || 'Mechanistic Logic'}: "${s.field2Value || ''}"
${s.field3Value ? `- ${s.field3Label || 'Anchor'}: "${s.field3Value}"` : ''}
${s.reflection ? `- Reflection: "${s.reflection}"` : ''}
`).join('\n---\n')}
`;

      const batchResult = await generateJSONWithProvider({
        systemPrompt,
        userPrompt,
        responseSchema: batchEvaluationSchema,
        settings,
        isChecker: true,
      });

      return NextResponse.json(batchResult);
    }

    // Single stage evaluation
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
      expertCompletion,
      premisePrompt
    } = body;

    if (!field1Value && !field2Value) {
      return NextResponse.json({ error: "No answers provided to evaluate." }, { status: 400 });
    }

    const systemPrompt = `You are the Feynman Cognitive Coach & Socratic Evaluator.
Your job is to rapidly assess a student's active cognitive encoding response.

EVALUATION CRITERIA:
1. Did the student explain the concept in genuine, clear first-principles language, or did they just copy-paste/parrot textbook buzzwords?
2. Did they articulate the core mechanism/causality or mnemonic connection?
3. Check for the 'Illusion of Explanatory Depth' (feeling like they understand because they recognize terms, but unable to explain the inner moving parts).
4. In 'errorAnalysis', provide 1 targeted sentence highlighting what exact mechanistic link was missed (e.g. "You identified X but omitted the trigger mechanism that causes Y").

Be encouraging, academic, and hyper-concise.
Output strictly JSON matching the evaluation schema.`;

    const userPrompt = `STAGE: ${stageTitle} (${framework})
PROMPT: ${prompt}
SOURCE CONTEXT: ${contextSnippet}
${premisePrompt ? `CHALLENGE PREMISE: ${premisePrompt}` : ''}
${expertCompletion ? `EXPERT SCHEMA COMPLETION: ${expertCompletion}` : ''}

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
