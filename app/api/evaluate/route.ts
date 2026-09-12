import { Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { generateJSONWithProvider } from "@/lib/ai-client";
import { validateEvaluationResult, validateBatchEvaluation } from "@/lib/ai-output-validation";

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
      description: "1-2 sentence coaching tip. If the student used a fictional story, praise the vividness and either confirm the mechanism mapping (mastered) or offer a witty 1-sentence Story Patch correcting the character's action."
    },
    depthAlert: {
      type: Type.STRING,
      description: "Optional 1-line alert if the user exhibited the Illusion of Explanatory Depth (e.g., using jargon words without describing the underlying mechanism)."
    },
    errorAnalysis: {
      type: Type.STRING,
      description: "Targeted error analysis: 1 concise sentence highlighting the exact missing logical step or causal bridge compared to expert understanding."
    },
    jargonBuzzer: {
      type: Type.STRING,
      description: "Jargon Parroting Buzzer: Triggered when the student uses textbook buzzwords without articulating the physical/mechanical causality."
    },
    vivaCrossExamination: {
      type: Type.STRING,
      description: "Oxford Oral Defense: A lethal probing counter-question testing why the opposite, edge-case, or failure state does not occur."
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

const MNEMONIC_FREEDOM_DIRECTIVE = `MNEMONIC IMMUNITY // EVALUATOR DIRECTIVE

CORE RULE: Never penalize fictional, bizarre, or personal stories, cartoons, or slang. Leverage Structure Mapping & Self-Reference Effect.

TWO-LAYER EVALUATION:

[ 01 ] STICKINESS CHECK
- Praise vivid, absurd, or personal framing immediately. Treat invented characters, cartoons, or absurd scenarios as ELITE encoding.
- If the student leans on slang, cartoons, or personal anecdotes, note the vividness and boost engagement signal. Do not dock for non-academic tone.

[ 02 ] STRUCTURAL FIDELITY CHECK
- After praising stickiness, check ONLY whether the narrative's causal mechanisms strictly map to the target scientific logic.
- Map story actions to the underlying cause-and-effect. If the mapping is sound, award FULL MASTERY (100/100) and explain why the mapping works.
  Example: "Mastered (100/100): That mental image of the mob boss cutting the telephone wire is hilarious and physically accurate -- Atropine blocks the parasympathetic brake on the sinoatrial node. Card forged for Anki."

SCORING & FEEDBACK:
- Accurate Logic: Award full mastery (100/100).
- Flawed Logic: Never scold or lecture. Provide a concise, witty "Story Patch" adjusting the narrative actions to correct the underlying scientific mechanism.
  Example: "Love the mob boss character! Story Patch: Atropine does not hand the heart coffee to pump faster (that would be an adrenergic agonist). Have the mob boss cut the brake lines on the car instead."

BOUNDARY:
- This immunity never authorizes endorsing harmful instructions or pseudoscience; it protects creative encoding of verified academic content.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { batchMode, stages, settings, preSessionConfidence, topicSummary } = body;

    // Batch mode for End Session Performance Review
    if (batchMode && Array.isArray(stages)) {
      const systemPrompt = `You are the Feynman Master Evaluator & Metacognitive Assessor.
Analyze the complete multi-stage cognitive encoding workout submitted by the learner for "${topicSummary || 'Cognitive Schema'}".
Assess the student's genuine grasp across all stages. Rate overall performance (0-100), give 2-3 sentences of holistic insight, and grade each stage.
Be strict but encouraging: reward active causal deduction; penalize memorized jargon without explanation.

${MNEMONIC_FREEDOM_DIRECTIVE}`;

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

      return NextResponse.json(validateBatchEvaluation(batchResult));
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
      premisePrompt,
      strictnessLevel = 'feynman' // 'sherpa' | 'feynman' | 'viva'
    } = body;

    if (!field1Value && !field2Value) {
      return NextResponse.json({ error: "No answers provided to evaluate." }, { status: 400 });
    }

    let strictnessDirective = '';
    if (strictnessLevel === 'sherpa') {
      strictnessDirective = `STRICTNESS MODE: [ 01 ] SOCRATIC SHERPA (Supportive Learning)
- Grade generously (score 70-95).
- Forgive scientific jargon and focus on whether their general intuition is pointed in the right direction.
- Provide encouraging guidance and fill in small missing steps.`;
    } else if (strictnessLevel === 'viva') {
      strictnessDirective = `STRICTNESS MODE: [ 03 ] OXFORD ORAL DEFENSE / RUTHLESS VIVA (Exam Readiness)
- Zero tolerance for hand-waving, buzzwords, or skipping causal transitions.
- If they omit the underlying physical mechanism, FAIL THEM (grade: 'needs_elaboration', score: 35-60).
- Populate 'vivaCrossExamination' with a sharp, rigorous counter-question challenging their causal direction or asking: "Why doesn't the reverse happen?"
- Challenge every assumption as an elite thesis examiner.`;
    } else {
      strictnessDirective = `STRICTNESS MODE: [ 02 ] FEYNMAN STANDARD (True Understanding)
- THE JARGON BUZZER: If the student uses textbook terms (e.g. "depolarization", "AIMD", "mitosis") WITHOUT explaining the physical mechanical motion (e.g. ions rushing in, window halving), trigger 'jargonBuzzer'.
- Reward simple, visual, plain-English mechanical explanations.`;
    }

    const systemPrompt = `You are the Feynman Cognitive Coach & Socratic Evaluator.
Your job is to assess a student's active cognitive encoding response to ensure their understanding is deep enough to create high-yield RemNote flashcards.

${strictnessDirective}

EVALUATION CRITERIA:
1. Did the student explain the concept in genuine, clear first-principles language, or did they just copy-paste/parrot textbook buzzwords?
2. Did they articulate the core mechanism/causality or mnemonic connection?
3. Check for the 'Illusion of Explanatory Depth' (feeling like they understand because they recognize terms, but unable to explain the inner moving parts).
4. In 'errorAnalysis', provide 1 targeted sentence highlighting what exact mechanistic link was missed.

${MNEMONIC_FREEDOM_DIRECTIVE}

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

    return NextResponse.json(validateEvaluationResult(evaluation));
  } catch (error: any) {
    console.error("Error in /api/evaluate:", error);
    return NextResponse.json({
      error: error?.message || "Failed to evaluate response."
    }, { status: 500 });
  }
}
