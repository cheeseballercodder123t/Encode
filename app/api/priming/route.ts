import { Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { generateJSONWithProvider } from "@/lib/ai-client";
import {
  isPrimingKind,
  validatePrimingDrill,
  PRIMING_KIND_BLURB,
  PRIMING_STEP_TARGET,
  type PrimingKind,
} from "@/lib/priming";

const choiceSchema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING, description: "Short id, e.g. 'a', 'b', 'c', 'd'." },
    label: { type: Type.STRING, description: "Under 8 words. No hedging, no 'it depends'." },
  },
  required: ["id", "label"],
};

const stepSchema = {
  type: Type.OBJECT,
  properties: {
    prompt: {
      type: Type.STRING,
      description:
        "The single commitment question for this probe, answerable in about ten seconds. Never 'which is correct?' — ask what MUST happen, what shape the relation MUST have, or where the density MUST flow.",
    },
    choices: {
      type: Type.ARRAY,
      description: "Exactly 4 short, concrete options a student could plausibly commit to.",
      items: choiceSchema,
    },
    correctChoiceId: {
      type: Type.STRING,
      description: "The id of the option that follows from first principles.",
    },
    trapChoiceId: {
      type: Type.STRING,
      description:
        "The id of the single most tempting intuitive-but-wrong option for THIS probe (the classic misconception for this topic). Empty string when there is no honest trap.",
    },
    trapExplanation: {
      type: Type.STRING,
      description:
        "Why the trap feels correct to human intuition, and the physical fact that kills it. One or two sentences.",
    },
    reveal: {
      type: Type.STRING,
      description:
        "The first-principles reveal for this probe: the derivation or extreme-case argument in at most three sentences. Each probe must teach its own step, never restate the one before it.",
    },
  },
  required: ["prompt", "choices", "correctChoiceId", "reveal"],
};

const primingSchema = {
  type: Type.OBJECT,
  properties: {
    kind: {
      type: Type.STRING,
      enum: ["shape", "gradient", "dimensional", "extremum"],
      description:
        "The archetype that best fits this stage: 'shape' = draw the curve before the formula. 'gradient' = locate the electron/energy source and the electron-poor sink. 'dimensional' = assemble units to pin where a variable sits. 'extremum' = push a variable to 0 or infinity to decide numerator vs denominator.",
    },
    setup: {
      type: Type.STRING,
      description:
        "The concrete physical setup in ONE sentence, naming the real quantity/system from the source (never generic).",
    },
    steps: {
      type: Type.ARRAY,
      description:
        "The probe sequence. Played in order, one commitment at a time. The count is fixed per archetype (see PROBE COUNTS) — never pad a drill out to reach it.",
      items: stepSchema,
    },
    sketch: {
      type: Type.OBJECT,
      description:
        "Shape archetype only: the curve the learner must DRAW before the probe. Omit entirely for the other three archetypes.",
      properties: {
        prompt: {
          type: Type.STRING,
          description:
            "One imperative line naming what to draw and on what axes, e.g. 'Sketch rate v₀ against [S] before you see the equation.'",
        },
        axes: { type: Type.STRING, description: "Axis labeling, e.g. 'x = [S] (mM), y = v₀ (µmol/s)'." },
        shapeLabel: {
          type: Type.STRING,
          description:
            "The shape the drawing should have had, named after the learner commits — e.g. 'saturating hyperbola (pseudo-first-order, then zero-order)'.",
        },
        shapeHint: {
          type: Type.STRING,
          description:
            "Why the relation must take that shape: the limiting behaviour at each extreme. Two sentences maximum.",
        },
      },
      required: ["prompt", "shapeLabel", "shapeHint"],
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
  required: ["kind", "setup", "steps", "principle"],
};

/**
 * The archetype table is generated from `lib/priming` so the drill the learner
 * gets can never drift from the one the selector promised.
 */
function archetypeTable(): string {
  return (Object.keys(PRIMING_STEP_TARGET) as PrimingKind[])
    .map((kind) => {
      const count = PRIMING_STEP_TARGET[kind];
      return `  ${kind.padEnd(11)} ${count} probe${count === 1 ? '' : 's'} — ${PRIMING_KIND_BLURB[kind]}`;
    })
    .join('\n');
}

function probeDirective(requestedKind: PrimingKind | undefined): string {
  if (requestedKind) {
    const count = PRIMING_STEP_TARGET[requestedKind];
    return `REQUESTED ARCHETYPE: ${requestedKind}. The learner chose it, so you MUST author exactly ${count} probe${
      count === 1 ? '' : 's'
    } in that archetype.${requestedKind === 'shape' ? ' A sketch block is REQUIRED.' : ''}`;
  }
  return 'CHOOSE THE ARCHETYPE YOURSELF, and match its probe count exactly.';
}

export async function POST(req: NextRequest) {
  try {
    const { stageTitle, framework, contextSnippet, prompt, topicSummary, kind, settings } =
      await req.json();

    const requestedKind = isPrimingKind(kind) ? kind : undefined;

    const systemPrompt = `You are the Priming Examiner. Your job is to make an equation or a mechanism NON-ARBITRARY before the learner touches it.

Pick the single warm-up archetype that best fits the material (or honor the requested one):
${archetypeTable()}

PROBE COUNTS ARE FIXED. A gradient check is exactly two commitments (source, then sink); an extremal check is exactly three (one per variable pushed to its extreme). A one-probe drill with an invented second probe for padding is worse than a one-probe drill.

RULES:
1. Every probe must be answerable by reasoning, not recall: a learner who does not know the formula should still be able to get there from the setup in about ten seconds.
2. Never ask "which is correct?" Ask what MUST happen, what shape the relation MUST have, or where the density MUST flow.
3. Every option must be concrete and committed — no "it depends", no "both", no joke options.
4. Exactly one option is right per probe. Design exactly one other option as the classic misconception for that specific step: the answer that feels obvious and is wrong.
5. Use the actual quantities, units and systems from the source. Generic physics examples are worthless here.
6. Successive probes must build on each other, not repeat: probe 2 asks the question probe 1's answer made it possible to ask.
7. SHAPE: the learner draws the curve on a canvas before answering, so 'sketch' must name what to draw, the axes, the shape the drawing should have had, and the limiting behaviour that forces it. The single probe then checks the property the drawing must satisfy.
8. GRADIENT: probe 1 locates where electron density / energy is concentrated (the source); probe 2 locates where it is missing (the electron-poor sink). The payoff is that the arrow or force then has only one possible direction.
9. The 'principle' is the payoff: one line the learner can carry to the next problem.
10. cardBack must contain a {{c1::...}} deletion.`;

    const userPrompt = `TOPIC: ${topicSummary || stageTitle}
STAGE: ${stageTitle} (${framework})
SOURCE CONTEXT: ${contextSnippet || ''}
STAGE PROMPT: ${prompt || ''}
${probeDirective(requestedKind)}

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
