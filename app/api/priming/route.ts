import { Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { generateJSONWithProvider } from "@/lib/ai-client";
import { isPrimingKind, validatePrimingDrill } from "@/lib/priming";

const primingSchema = {
  type: Type.OBJECT,
  properties: {
    kind: {
      type: Type.STRING,
      enum: ["shape", "gradient", "dimensional", "extremum"],
      description:
        "The archetype that best fits this stage: 'shape' = sketch the curve before the formula. 'gradient' = locate the electron/energy source and the electron-poor sink. 'dimensional' = assemble units to pin where a variable sits. 'extremum' = push a variable to 0 or infinity to decide numerator vs denominator.",
    },
    setup: {
      type: Type.STRING,
      description:
        "The concrete physical setup in ONE sentence, naming the real quantity/system from the source (never generic).",
    },
    prompt: {
      type: Type.STRING,
      description:
        "The single commitment question, answerable in about ten seconds. Never 'which is correct?' — ask what MUST happen, or what shape the relation must have.",
    },
    choices: {
      type: Type.ARRAY,
      description: "Exactly 4 short, concrete options a student could plausibly commit to.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: "Short id, e.g. 'a', 'b', 'c', 'd'." },
          label: { type: Type.STRING, description: "Under 8 words. No hedging, no 'it depends'." },
        },
        required: ["id", "label"],
      },
    },
    correctChoiceId: {
      type: Type.STRING,
      description: "The id of the option that follows from first principles.",
    },
    trapChoiceId: {
      type: Type.STRING,
      description:
        "The id of the single most tempting intuitive-but-wrong option (the classic misconception for this topic). Empty string when there is no honest trap.",
    },
    trapExplanation: {
      type: Type.STRING,
      description:
        "Why the trap feels correct to human intuition, and the physical fact that kills it. One or two sentences.",
    },
    reveal: {
      type: Type.STRING,
      description:
        "The first-principles reveal: the derivation or the extreme-case argument in at most three sentences.",
    },
    principle: {
      type: Type.STRING,
      description:
        "The transferable rule in ONE line, phrased so it generalizes beyond this example (e.g. 'a fourth-power denominator means doubling the argument multiplies the output by 16').",
    },
    cardFront: {
      type: Type.STRING,
      description: "Cloze-ready card front built from the misconception.",
    },
    cardBack: {
      type: Type.STRING,
      description: "Cloze-ready card back; include at least one {{c1::...}} deletion.",
    },
  },
  required: ["kind", "setup", "prompt", "choices", "correctChoiceId", "reveal", "principle"],
};

export async function POST(req: NextRequest) {
  try {
    const { stageTitle, framework, contextSnippet, prompt, topicSummary, kind, settings } =
      await req.json();

    const requestedKind = isPrimingKind(kind) ? kind : undefined;

    const systemPrompt = `You are the Priming Examiner. Your job is to make an equation or a mechanism NON-ARBITRARY before the learner touches it.

Pick the single warm-up archetype that best fits the material (or honor the requested one):
  shape       — the learner sketches the qualitative curve before seeing the algebra: monotone? saturating? bell-shaped? exponential decay? oscillatory?
  gradient    — the learner locates where electron density / energy is concentrated (the source) and where it is missing (the sink), so the direction of the arrow or force follows from electrostatics instead of memory.
  dimensional — the learner assembles the units like a puzzle to discover whether a quantity enters as v or v^2, r or r^4.
  extremum    — the learner pushes a variable to 0 or to infinity and reads off whether it must live in the numerator or the denominator.

RULES:
1. The drill must be answerable by reasoning, not recall: a learner who does not know the formula should still be able to get there from the setup in about ten seconds.
2. Never ask "which is correct?" Ask what MUST happen, what shape the relation MUST have, or where the density MUST flow.
3. Every option must be concrete and committed — no "it depends", no "both", no joke options.
4. Exactly one option is right. Design exactly one other option as the classic misconception for this topic: the answer that feels obvious and is wrong.
5. Use the actual quantities, units and systems from the source. Generic physics examples are worthless here.
6. The 'principle' is the payoff: one line the learner can carry to the next problem.
7. cardBack must contain a {{c1::...}} deletion.`;

    const userPrompt = `TOPIC: ${topicSummary || stageTitle}
STAGE: ${stageTitle} (${framework})
SOURCE CONTEXT: ${contextSnippet || ''}
STAGE PROMPT: ${prompt || ''}
${requestedKind ? `REQUESTED ARCHETYPE: ${requestedKind}` : 'CHOOSE THE ARCHETYPE YOURSELF.'}

Author one warm-up and output strictly valid JSON.`;

    const parsed = await generateJSONWithProvider({
      systemPrompt,
      userPrompt,
      responseSchema: primingSchema,
      settings,
      isChecker: true,
    });

    return NextResponse.json(validatePrimingDrill(parsed));
  } catch (error: any) {
    console.error("Error in /api/priming:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to author a priming warm-up." },
      { status: 500 }
    );
  }
}
