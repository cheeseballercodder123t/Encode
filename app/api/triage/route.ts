import { Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { generateJSONWithProvider } from "@/lib/ai-client";
import { splitTriageUnits, validateTriageReport } from "@/lib/triage";

const triageSchema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description:
        "ONE line on the source's informational density, e.g. '72% of this handout is administrative preamble; the causal core is the three paragraphs on channel gating.'",
    },
    units: {
      type: Type.ARRAY,
      description: "Exactly one verdict per numbered unit provided by the caller.",
      items: {
        type: Type.OBJECT,
        properties: {
          index: {
            type: Type.INTEGER,
            description: "The integer index of the unit being classified, copied verbatim.",
          },
          kind: {
            type: Type.STRING,
            enum: ["kernel", "evidence", "noise"],
            description:
              "kernel = causal transition, definition, equation or load-bearing claim. evidence = experiment, datum or number supporting a kernel. noise = preamble, anecdote, rhetoric, recap, administrative text.",
          },
          note: {
            type: Type.STRING,
            description: "Under 12 words: why this unit got that label.",
          },
        },
        required: ["index", "kind"],
      },
    },
  },
  required: ["units"],
};

/** Bound the prompt: units past the cap stay classified as kernels (never dropped). */
const MAX_UNITS = 60;

export async function POST(req: NextRequest) {
  try {
    const { text, topicSummary, settings } = await req.json();

    const source = typeof text === 'string' ? text : '';
    const units = splitTriageUnits(source);
    if (units.length === 0) {
      return NextResponse.json(
        { error: "Paste the source text first — the guillotine triages what you give it." },
        { status: 400 }
      );
    }

    const window = units.slice(0, MAX_UNITS);
    const numbered = window
      .map((unit, i) => `[${i}] ${unit.replace(/\s+/g, ' ')}`)
      .join('\n\n');

    const systemPrompt = `You are the Triage Examiner. Before a learner encodes study material, you produce a SEMANTIC HEATMAP of the source so the noise can be cut away in one tap.

Label every numbered unit with exactly one kind:
  kernel   — a causal transition, a definition, an equation, or the load-bearing claim. If deleting it would break the mechanism, it is a kernel.
  evidence — an experiment, dataset or specific number that supports a kernel.
  noise    — historical preamble, professor anecdotes, rhetorical questions, "in this lecture we will...", recaps of what was just said, administrative/assignment text, motivational filler.

RULES:
1. Return one verdict per unit index, in ascending order, using the exact indices given. Never invent or skip indices.
2. Be decisive. A unit that names a process without constraining it is still a kernel; only material that carries no causal or factual payload is noise.
3. When a sentence is transitional glue ("Now consider the following", "As we saw earlier"), it is noise even if it mentions a concept.
4. Never mark material as noise merely because it is written informally — an anecdote carrying a real mechanism stays a kernel.
5. The 'note' must justify the label in under 12 words.`;

    const userPrompt = `TOPIC: ${topicSummary || 'Untitled source'}

SOURCE UNITS (${window.length} of ${units.length}):
${numbered}

Classify every unit above and output strictly valid JSON.`;

    const parsed = await generateJSONWithProvider({
      systemPrompt,
      userPrompt,
      responseSchema: triageSchema,
      settings,
      isChecker: true,
    });

    const report = validateTriageReport(parsed, source);
    return NextResponse.json(report);
  } catch (error: any) {
    console.error("Error in /api/triage:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to run the semantic triage pass." },
      { status: 500 }
    );
  }
}
