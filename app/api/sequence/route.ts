import { Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { generateJSONWithProvider } from "@/lib/ai-client";
import { validateParsonsResult } from "@/lib/ai-output-validation";

const sequenceSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "The mechanism this chain describes, 2-6 words." },
    steps: {
      type: Type.ARRAY,
      description:
        "4-6 discrete causal steps of the mechanism, listed in STRICT causal order (step 1 happens first). Each step is ONE short clause with a concrete actor and a concrete action — no 'and', no multiple ideas, no step that could swap places with its neighbour without the physics changing.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: "s1 | s2 | s3 | s4 | s5 | s6" },
          text: { type: Type.STRING },
        },
        required: ["id", "text"],
      },
    },
    pivotRule: {
      type: Type.STRING,
      description:
        "ONE sentence naming the single physical or logical necessity that fixes the order of the hardest link: why the earlier step MUST precede the later one (a conservation law, a finite resource, geometry, a rate limit). This is the rule the learner writes down when they get it wrong.",
    },
    summary: {
      type: Type.STRING,
      description: "One sentence describing the mechanism the chain encodes.",
    },
  },
  required: ["title", "steps", "pivotRule", "summary"],
};

export async function POST(req: NextRequest) {
  try {
    const { stageTitle, framework, contextSnippet, prompt, topicSummary, settings } =
      await req.json();

    if (!stageTitle && !contextSnippet) {
      return NextResponse.json({ error: "No stage to build an ordering drill from." }, { status: 400 });
    }

    const systemPrompt = `You are a cognitive science examiner building a PARSONS PROBLEM: a scrambled causal chain the learner has to re-order.

Parsons problems give almost the same learning gains as writing the mechanism from scratch, at a fraction of the typing — perfect for a drained day or a six-step mechanism. Order is not a memory trick here: the learner has to reason about what MUST precede what.

HOW TO BUILD IT:
1. Decompose the mechanism into 4-6 DISCRETE steps in strict causal order. Each step is one short clause (under 15 words) naming a concrete actor and a concrete action: "S4 segments swing outward", not "a conformational change occurs".
2. Consecutive steps must be genuinely linked: each is a consequence of the one before it. If two neighbours could swap without the physics breaking, merge or rewrite them — an ambiguous puzzle is worse than none.
3. Never state the order in the text ("first", "next", "then", "finally"), never number the steps inside the text, and never hint at position. The learner receives the steps shuffled.
4. 'pivotRule' is the payoff: the single necessity that makes the hardest link irreversible — the conservation law, finite resource, geometry, or rate limit that forces it. State it physically.
5. 'summary' is one sentence on the mechanism the chain encodes.

Do not falsify anything: unlike the inverted-step drill, every step here is TRUE. The only thing out of order is the arrangement.`;

    const userPrompt = `TOPIC: ${topicSummary || stageTitle}
STAGE: ${stageTitle} (${framework})
SOURCE CONTEXT: ${contextSnippet || ''}
STAGE PROMPT: ${prompt || ''}

Build the chain. Output strictly valid JSON with the steps in canonical order.`;

    const parsed = await generateJSONWithProvider({
      systemPrompt,
      userPrompt,
      responseSchema: sequenceSchema,
      settings,
      isChecker: false,
    });

    const validated = validateParsonsResult(parsed);
    if (validated.steps.length < 3) {
      return NextResponse.json(
        { error: "The examiner could not produce a chain with enough discrete steps. Try again." },
        { status: 502 }
      );
    }

    return NextResponse.json(validated);
  } catch (error: any) {
    console.error("Error in /api/sequence:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to build the causal ordering drill." },
      { status: 500 }
    );
  }
}
