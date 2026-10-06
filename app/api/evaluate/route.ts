import { Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { generateJSONWithProvider } from "@/lib/ai-client";
import { validateEvaluationResult, validateBatchEvaluation } from "@/lib/ai-output-validation";
import { FIRST_PRINCIPLES_FEW_SHOT } from "@/lib/prompts";
import { evaluateSchema, parseRouteBody } from "@/lib/api-validation";
import { MR_M_EVALUATE_DIRECTIVE } from '@/lib/mr-m/directives';

/**
 * The examiner is a lab partner, not a grader.
 *
 * A number out of 100 ("62/100 · needs elaboration") is the single biggest
 * reason encoding reads as homework: it hands you a verdict and no way
 * forward. So this contract deliberately has no score, no grade, no XP and no
 * band. What it returns instead:
 *
 *   secured         did the physical cause-and-effect land, yes or no
 *   nailedIt        the causal links that landed, in the learner's own words
 *   missingLink     the ONE sentence to insert, written for them
 *   counterProbe    one curious question that pushes the mechanism to an edge
 *   sentenceFinisher the learner's own sentence, completed
 *
 * Everything the UI shows is either their own phrasing handed back or a single
 * question they can answer in two words. There is nothing to be graded *on*.
 */
const evaluationSchema = {
  type: Type.OBJECT,
  properties: {
    secured: {
      type: Type.BOOLEAN,
      description:
        "True when the physical cause-and-effect landed. Sloppy wording, shorthand and spoken transcripts still count: judge the mechanism, never the prose.",
    },
    nailedIt: {
      type: Type.STRING,
      description:
        "The specific causal links the learner DID get right, quoting their own words. Max one sentence. No praise padding.",
    },
    missingLink: {
      type: Type.STRING,
      description:
        "The single missing causal step, written as the sentence the learner should insert (e.g. 'S4 segments physically swing outward, which is what opens the pore'). Empty string when nothing is missing. Never a generic 'add more detail'.",
    },
    counterProbe: {
      type: Type.STRING,
      description:
        "ONE probing question that pushes their mechanism to an extreme or edge case (e.g. 'What happens if blood flow through the vasa recta surges 500%?'). It must be answerable from the mechanism they just described, or from its failure mode. This is the pressure test, not a quiz.",
    },
    sentenceFinisher: {
      type: Type.STRING,
      description:
        "Finish the learner's own last sentence for them, in their voice, in one clause. They should be able to say 'yes, that is what I meant' and be done.",
    },
    feedback: {
      type: Type.STRING,
      description:
        "Optional one-line coaching, in plain language. Never a score, never a grade, never an instruction to write more.",
    },
    depthAlert: {
      type: Type.STRING,
      description:
        "Optional one line when the Illusion of Explanatory Depth showed up (jargon used without the underlying mechanism).",
    },
    jargonBuzzer: {
      type: Type.STRING,
      description:
        "Jargon Parroting Buzzer: triggered when the learner names a process without describing what physically moves, collides, or changes shape.",
    },
    vivaCrossExamination: {
      type: Type.STRING,
      description:
        "Optional harder probe for oral-defense mode: challenge the causal direction or ask why the reverse does not happen.",
    },
    autopsy: {
      type: Type.OBJECT,
      description:
        "Mr M mode post-mortem. Populate ONLY when the system prompt carries the MR M MODE ACTIVE directive AND the mechanism did not land. Omit entirely for a secured stage.",
      properties: {
        trapId: {
          type: Type.STRING,
          description:
            "The structural failure, from this list only: 'reversed_order' | 'missing_subscript' | 'factor_of_two' | 'molar_mass_denominator' | 'unit_slip' | 'limiting_reactant_ignored' | 'mole_ratio_inverted' | 'zero_point_confusion' | 'path_vs_state_confusion' | 'sign_convention_flip'. Empty string when none fits. Never invent an id.",
        },
        structuralReason: {
          type: Type.STRING,
          description:
            "ONE sentence naming WHY this is a structural failure rather than a slip: which step of the chain cannot work. Never restate that the answer was wrong.",
        },
        whereItBreaks: {
          type: Type.STRING,
          description: "Which step of the chain actually breaks.",
        },
        correctedConstruction: {
          type: Type.STRING,
          description:
            "The corrected construction written out, so the fix is a sentence to read rather than an instruction to try again. NEVER output a number of your own: the app computes and displays the arithmetic, and a wrong figure in an autopsy teaches the wrong lesson.",
        },
      },
      required: ["structuralReason"],
    },
  },
  required: ["secured", "nailedIt", "counterProbe"],
};

const batchEvaluationSchema = {
  type: Type.OBJECT,
  properties: {
    analysis: {
      type: Type.STRING,
      description:
        "A 2-3 sentence holistic read of the mechanism the learner demonstrated across the session, in plain language. No score, no grade, no percentage.",
    },
    perStageGrades: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          stageTitle: { type: Type.STRING },
          secured: {
            type: Type.BOOLEAN,
            description: "True when this stage's causal mechanism landed.",
          },
          counterProbe: {
            type: Type.STRING,
            description: "The one edge-case question still worth answering for this stage. May be empty.",
          },
          feedback: { type: Type.STRING },
        },
        required: ["stageTitle", "secured", "feedback"],
      },
    },
  },
  required: ["analysis", "perStageGrades"],
};

const NO_VERDICT_DIRECTIVE = `NO-VERDICT DIRECTIVE // HARD RULES

1. NEVER output a score, a percentage, a letter grade, an XP number or a band. No "78/100", no "B", no "62 — needs elaboration", no "mastered". If you catch yourself ranking them, write the mechanism instead.
2. NEVER tell them to "write more", "go deeper", "elaborate further" or "add detail" — that hands back the work without the insight. If something is missing, WRITE THE MISSING SENTENCE FOR THEM in 'missingLink'.
3. You are the person at the next bench saying "wait, then what happens to the water?" — curious, not supervisory, never a red pen.
4. Always leave them holding a mechanism, not a verdict: what already works (nailedIt), the one sentence that completes it (missingLink), the edge case that proves it (counterProbe).`;

const MNEMONIC_FREEDOM_DIRECTIVE = `MNEMONIC IMMUNITY // EVALUATOR DIRECTIVE

CORE RULE: never penalize fictional, bizarre or personal stories, cartoons or slang. Vivid framing is ELITE encoding. Check ONLY whether the narrative's causal mechanisms strictly map to the target science.

[ 01 ] STICKINESS CHECK: absurd or personal framing is a strength, not a tone problem. Say so, briefly.
[ 02 ] STRUCTURAL FIDELITY CHECK: if the mapping holds, secured = true — the mob boss cutting the telephone wire IS the parasympathetic brake on the sinoatrial node, and the card is safe to forge. If the mapping breaks, do not scold; give a concise, witty "Story Patch" that adjusts the narrative action so the physics comes out right.

BOUNDARY: this immunity never authorizes endorsing harmful instructions or pseudoscience; it protects creative encoding of verified academic content.`;

export async function POST(req: NextRequest) {
  try {
    const parsed = await parseRouteBody(req, evaluateSchema);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }
    const body = parsed.data;
    const { batchMode, stages, settings, topicSummary } = body;

    // Batch mode for the end-of-session read.
    if (batchMode && Array.isArray(stages)) {
      const systemPrompt = `You are the Feynman lab partner reading a completed multi-stage encoding workout for "${topicSummary || 'Cognitive Schema'}".

Say what mechanism the learner actually demonstrated across the session, stage by stage, and name the one edge case worth probing in each. Do NOT rank them.

This is the depth that counts as a mechanism:

${FIRST_PRINCIPLES_FEW_SHOT}

${NO_VERDICT_DIRECTIVE}

${MNEMONIC_FREEDOM_DIRECTIVE}`;

      const userPrompt = `TOPIC: ${topicSummary || 'Cognitive Workout'}

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

    // Single stage read.
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
      tabooTerms = [],
      strictnessLevel = 'feynman', // 'sherpa' | 'feynman' | 'viva'
      mrMMode = false,
    } = body;

    if (!field1Value && !field2Value) {
      return NextResponse.json({ error: "No answers provided to evaluate." }, { status: 400 });
    }

    // Strictness is a TONE knob, never a severity knob. It changes how hard the
    // counter-probe leans, not how harshly the learner is judged.
    let strictnessDirective = '';
    if (strictnessLevel === 'sherpa') {
      strictnessDirective = `PROBE TONE: [ 01 ] GENTLE
- Assume the mechanism is basically there and probe the one thing that would wobble it.
- Fill in missing steps yourself in 'missingLink' rather than asking them to supply them.
- The counterProbe should be a friendly "okay, but then what about...?"`;
    } else if (strictnessLevel === 'viva') {
      strictnessDirective = `PROBE TONE: [ 03 ] ORAL DEFENSE
- The counterProbe is the sharp one: push a variable to an extreme, invert the causal direction, or ask why the failure mode does not happen.
- Also populate 'vivaCrossExamination' with a second, harder challenge.
- Still never rank them, never score them, and never ask them to rewrite.`;
    } else {
      strictnessDirective = `PROBE TONE: [ 02 ] STANDARD
- THE JARGON BUZZER: if a textbook term appears ("depolarization", "AIMD", "mitosis") WITHOUT the physical motion (ions rushing, window halving), populate 'jargonBuzzer' and write the physical sentence for them in 'missingLink'.
- Plain, visual, mechanical explanations are what you are listening for.`;
    }

    // Taboo enforcement: the learner was shown these terms as banned. The
    // examiner flags them for the same reason the workbench does — naming a
    // process is not explaining it.
    const tabooList: string[] = Array.isArray(tabooTerms)
      ? tabooTerms.filter((t: unknown): t is string => typeof t === 'string' && t.trim().length > 0)
      : [];
    const tabooDirective = tabooList.length > 0
      ? `\nTABOO CONSTRAINT:\n- The learner was told NOT to use these terms: ${tabooList.join(', ')}.\n- Any use of them WITHOUT an accompanying physical/causal description is jargon parroting: populate 'jargonBuzzer' and write the physical wording for them in 'missingLink'.\n- A correct use that also explains the underlying motion is fine — the ban is on the label substituting for the mechanism.`
      : '';

    // Mr M mode's post-mortem half: the model writes WHY the failure is
    // structural and what the corrected construction is, while the structural
    // label and the arithmetic are computed deterministically on the client.
    // With the flag off this is the empty string, so the examiner's prompt is
    // exactly what it was before the feature existed.
    const mrMEvaluateNote = mrMMode ? `\n\n${MR_M_EVALUATE_DIRECTIVE}` : '';

    const systemPrompt = `You are the Feynman lab partner reading a learner's encoding answer. Their goal was to own the mechanism well enough that the flashcard writes itself at the end — so your job is to find the leak in their mental model and hand them the sentence that seals it.

A name is not an explanation. This is the line you are reading for:

${FIRST_PRINCIPLES_FEW_SHOT}

${strictnessDirective}
${tabooDirective}
${mrMEvaluateNote}

Read for the physical motion: does A force B, or are the two just named next to each other? Recognising a term without knowing its inner moving parts is the Illusion of Explanatory Depth, and that is the leak. Messy shorthand, spoken transcripts, slang and cartoons are all fine — judge the mechanism, never the prose.

Always fill 'nailedIt' (the causal links that landed, in their own words) and 'sentenceFinisher' (their own sentence, completed). Keep 'missingLink' to the ONE exact causal step that is missing, written as the sentence they should insert — never a vague request to add more.

${NO_VERDICT_DIRECTIVE}

${MNEMONIC_FREEDOM_DIRECTIVE}

Output strictly JSON matching the evaluation schema.`;

    const userPrompt = `STAGE: ${stageTitle} (${framework})
PROMPT: ${prompt}
SOURCE CONTEXT: ${contextSnippet}
${premisePrompt ? `CHALLENGE PREMISE: ${premisePrompt}` : ''}
${expertCompletion ? `EXPERT SCHEMA COMPLETION: ${expertCompletion}` : ''}

LEARNER'S SUBMISSION:
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
