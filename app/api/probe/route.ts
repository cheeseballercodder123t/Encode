import { Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { generateJSONWithProvider } from "@/lib/ai-client";
import { validateProbeResult } from "@/lib/ai-output-validation";

const probeSchema = {
  type: Type.OBJECT,
  properties: {
    target: {
      type: Type.STRING,
      description:
        "The exact phrase from the learner's LAST layer that is being interrogated, quoted verbatim. This is the load-bearing claim that is asserted but not yet forced by anything deeper.",
    },
    question: {
      type: Type.STRING,
      description:
        "ONE question demanding the physical, mathematical or structural property that FORCES the target to be true. Never 'can you elaborate?'. Never ask for importance.",
    },
    isAxiom: {
      type: Type.BOOLEAN,
      description:
        "True ONLY when the last layer already states a fundamental constraint that cannot be reduced further (conservation law, finite capacity/resource, geometry, dimensional necessity, electrostatics, counting/parity argument).",
    },
    axiom: {
      type: Type.STRING,
      description:
        "When isAxiom is true: the distilled systemic necessity in ONE sentence, phrased as a card back. Empty string otherwise.",
    },
  },
  required: ["target", "question", "isAxiom"],
};

export async function POST(req: NextRequest) {
  try {
    const { stageTitle, framework, contextSnippet, prompt, layers, settings, topicSummary } =
      await req.json();

    const chain: string[] = Array.isArray(layers)
      ? layers.filter((l: unknown): l is string => typeof l === 'string' && l.trim().length > 0)
      : [];

    if (chain.length === 0) {
      return NextResponse.json(
        { error: "Answer the stage first — the ladder interrogates your own wording." },
        { status: 400 }
      );
    }

    const depth = chain.length; // the layer being interrogated, 1-based

    const systemPrompt = `You are the Recursive Causal Examiner. The learner is climbing a WHY-LADDER from a surface correlation down to a fundamental necessity.

THE FAILURE YOU EXIST TO CATCH: a learner stops at the first layer of explanation and calls it understanding.
  Question: "Why does TCP reduce its window on packet loss?"
  Bad answer: "Because packet loss means network congestion."  <-- correlation, not causation
  Layer 1: Packet loss indicates buffer overflow in intermediate routers.
  Layer 2: Routers drop packets because queue memory is finite and tail-drop occurs.
  Layer 3: If sources didn't reduce rate multiplicatively the total arrival rate would exceed link capacity, so congestion collapse is the only stable outcome.

RULES:
1. Read the learner's LAST layer. Identify the single most load-bearing claim in it that is ASSERTED but not yet FORCED by anything deeper, and quote it verbatim in 'target'.
2. Ask ONE question demanding the physical or mathematical property that makes that claim true.
   BAD: "Can you elaborate?" · BAD: "Why is this important?" · BAD: restating their answer as a question.
   GOOD: "What property of the router's memory forces a drop rather than a delay?"
   GOOD: "What does the sign of the second derivative have to be for that to hold at every scale?"
3. LABELS ARE NOT MECHANISMS. If the last layer names a process instead of describing motion, quantity or constraint ("congestion", "depolarization", "entropy", "osmosis"), the question must demand the physical motion behind the label.
4. Never repeat a question already asked in the chain. Never accept a restatement of the layer above as a new layer.
5. Set isAxiom true ONLY when the last layer already IS the constraint that cannot be reduced: a conservation law, a finite resource/capacity, geometry, a dimensional necessity, an electrostatic or thermodynamic gradient, or a counting/parity argument. Then put the one-sentence systemic necessity in 'axiom' — the sentence that belongs on the back of the card — and set 'question' to a short acknowledgement that the ladder has bottomed out.
6. This is layer ${depth}. Real ladders bottom out at 2–4 layers; do not manufacture depth that is not there. If layer ${depth} genuinely is bedrock, say so with isAxiom.`;

    const askedSoFar = chain
      .map((layer, i) => `  Layer ${i + 1}: ${layer}`)
      .join('\n');

    const userPrompt = `TOPIC: ${topicSummary || stageTitle}
STAGE: ${stageTitle} (${framework})
SOURCE CONTEXT: ${contextSnippet || ''}
STAGE PROMPT: ${prompt || ''}

THE LADDER SO FAR (each layer answers the question raised about the one above it):
${askedSoFar}

Interrogate Layer ${depth} and output strictly valid JSON.`;

    const parsed = await generateJSONWithProvider({
      systemPrompt,
      userPrompt,
      responseSchema: probeSchema,
      settings,
      isChecker: true,
    });

    return NextResponse.json({ ...validateProbeResult(parsed), depth });
  } catch (error: any) {
    console.error("Error in /api/probe:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to extend the why-ladder." },
      { status: 500 }
    );
  }
}
