import { Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { generateJSONWithProvider } from "@/lib/ai-client";
import { validateInvertedStepResult } from "@/lib/ai-output-validation";

const invertSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "The mechanism this drill tests, 2-6 words." },
    steps: {
      type: Type.ARRAY,
      description:
        "EXACTLY 4 steps of the mechanism in strict causal order. Each step is one short sentence with a concrete actor and a concrete action. Exactly ONE of these steps is falsified.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: "s1 | s2 | s3 | s4" },
          text: { type: Type.STRING },
        },
        required: ["id", "text"],
      },
    },
    falsifiedStepId: {
      type: Type.STRING,
      description: "The id of the single falsified step. Must be one of s1-s4.",
    },
    flawType: {
      type: Type.STRING,
      description:
        "Short label for the kind of lie: 'reversed causality' | 'inverted physical process' | 'wrong quantity' | 'wrong actor' | 'wrong sequence'.",
    },
    whyFalsified: {
      type: Type.STRING,
      description:
        "1-2 sentences: what the falsified step claims, and the honest mechanism it contradicts. This is the reveal.",
    },
    correctVersion: {
      type: Type.STRING,
      description: "The honest wording of the falsified step, one sentence.",
    },
  },
  required: ["title", "steps", "falsifiedStepId", "flawType", "whyFalsified", "correctVersion"],
};

export async function POST(req: NextRequest) {
  try {
    const { stageTitle, framework, contextSnippet, prompt, topicSummary, settings } =
      await req.json();

    if (!stageTitle && !contextSnippet) {
      return NextResponse.json({ error: "No stage to build a drill from." }, { status: 400 });
    }

    const systemPrompt = `You are an adversarial STEM examiner building a DISCRIMINATIVE REPAIR drill.

The learner is mentally drained. Rather than writing 100 words from a blank box, they read a 4-step explanation, spot the one step that contains a fatal flaw, and write a targeted one-sentence fix. Critical evaluation with a surgical fix.

HOW TO BUILD IT:
1. Write the mechanism as EXACTLY 4 causal steps. Strict causal order. Each step names a concrete actor and a concrete action ("S4 segments swing outward", not "a conformational change occurs"). Steps must chain: each one must be a consequence of the one before it.
2. Falsify EXACTLY ONE step. Choose the single step whose corruption is most diagnostically interesting — the one where the intuitive-but-wrong version feels obviously true to a student who memorised rather than understood. Techniques: reverse the causal direction, invert a physical process (zip vs unzip, fuse vs disassemble, open vs close, gain vs lose), swap a quantity or exponent, or misattribute the actor.
   Good lie: "The SNARE complex disassembles to allow vesicle fusion." (SNAREs zip TOGETHER to force fusion; disassembly happens afterwards, driven by NSF.)
   Good lie: "Breaking the phosphate bond releases the energy used by the cell." (Breaking bonds costs energy; release comes from forming lower-energy bonds with water.)
   BAD lie: obvious nonsense, a typo, or an absurd claim nobody would believe. The lie must be believable.
3. Never falsify more than one step, and never make the lie so severe that the other three steps stop describing the real mechanism.
4. Return the FINAL four steps with the lie already substituted in place. The learner must not be able to tell which one it is from formatting, ordering or hedging language — every step must read with equal confidence.
5. 'whyFalsified' is the reveal: what the falsified step claims, why it is tempting, and what is actually true.
6. 'correctVersion' is the honest wording of that step, one sentence.

Do NOT add hedging words like "supposedly" or "incorrectly" to the falsified step.`;

    const userPrompt = `TOPIC: ${topicSummary || stageTitle}
STAGE: ${stageTitle} (${framework})
SOURCE CONTEXT: ${contextSnippet || ''}
STAGE PROMPT: ${prompt || ''}

Build the drill. Output strictly valid JSON.`;

    const parsed = await generateJSONWithProvider({
      systemPrompt,
      userPrompt,
      responseSchema: invertSchema,
      settings,
      isChecker: false,
    });

    const validated = validateInvertedStepResult(parsed);
    if (validated.steps.length < 2) {
      return NextResponse.json(
        { error: "The examiner could not produce a coherent step chain. Try again." },
        { status: 502 }
      );
    }

    return NextResponse.json(validated);
  } catch (error: any) {
    console.error("Error in /api/invert-step:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to build the inverted-step drill." },
      { status: 500 }
    );
  }
}
