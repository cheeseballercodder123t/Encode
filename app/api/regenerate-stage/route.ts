import { Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { generateJSONWithProvider } from "@/lib/ai-client";

// Allow time for single-stage regeneration
export const maxDuration = 30;

/**
 * Regenerates ONE encoding stage using the lightweight checker model
 * (gemini-3.5-flash-lite by default). Used by the "Regenerate stage" button
 * in the workbench when a stage doesn't fit the learner (not relevant,
 * too personal, wrong angle). Returns a single Activity in the exact
 * shape the encoder produces so it can be swapped in place.
 */
const stageResponseSchema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING, description: "Unique stage id, e.g. 'stage_regenerated'" },
    title: { type: Type.STRING, description: "Name of the replacement stage" },
    framework: { type: Type.STRING, description: "Cognitive science framework used" },
    cognitiveGoal: { type: Type.STRING, description: "Short purpose of this encoding step" },
    contextSnippet: { type: Type.STRING, description: "Key raw snippet or fact this stage targets" },
    keywords: {
      type: Type.ARRAY,
      description: "3-5 essential conceptual keywords the learner's answer should contain",
      items: { type: Type.STRING },
    },
    templateType: { type: Type.STRING },
    prompt: { type: Type.STRING, description: "The overarching guiding challenge" },
    boundaryContrast: {
      type: Type.OBJECT,
      properties: {
        confusableLookalike: { type: Type.STRING },
        distinguishingRule: { type: Type.STRING }
      },
      required: ["confusableLookalike", "distinguishingRule"]
    },
    scaffold: {
      type: Type.OBJECT,
      properties: {
        field1Label: { type: Type.STRING },
        field1Placeholder: { type: Type.STRING },
        field2Label: { type: Type.STRING },
        field2Placeholder: { type: Type.STRING },
        field3Label: { type: Type.STRING },
        field3Placeholder: { type: Type.STRING },
        presetOptions: { type: Type.ARRAY, items: { type: Type.STRING } },
        exampleAnswer: { type: Type.STRING }
      },
      required: ["field1Label", "field1Placeholder", "field2Label", "field2Placeholder", "exampleAnswer"]
    },
  },
  required: ["id", "title", "framework", "cognitiveGoal", "contextSnippet", "keywords", "templateType", "prompt", "scaffold"],
};

export async function POST(req: NextRequest) {
  try {
    const {
      activity,
      topicSummary,
      mode = 'conceptual',
      reason,
      settings,
    } = await req.json();

    if (!activity || !activity.title) {
      return NextResponse.json({ error: "Missing activity to regenerate." }, { status: 400 });
    }

    const reasonContext = reason
      ? `\nLEARNER REQUEST: The learner rejected the previous stage for this reason: "${reason}". Address it directly.`
      : '\nLEARNER REQUEST: The learner rejected the previous stage. Produce a clearly different angle.';

    const systemPrompt = `You are the DeepEncode stage regenerator. You rewrite ONE cognitive encoding exercise so a learner stays in flow.

Rules:
1. Keep the same underlying source material scope but attack it from a DIFFERENT angle than the rejected stage.
2. One mechanism per stage (atomic). Scaffold labels and example answers must be answerable in under 15 words.
3. Always include 'boundaryContrast' (confusableLookalike + distinguishingRule) for the stage's concept.
4. Keep 'templateType' from the original stage unless it caused the mismatch; prefer first_principles, cause_effect, analogy_matrix, contrast_grid, state_transition, memory_palace, mnemonic_peg, taxonomic_chunking, or personal_schema.
5. Mode: ${mode}. Never mention or moralize about the rejection; just output the replacement stage.
${reasonContext}`;

    const userPrompt = `TOPIC: ${topicSummary || 'Cognitive Schema'}

STAGE TO REPLACE (JSON):
${JSON.stringify({
      title: activity.title,
      templateType: activity.templateType,
      prompt: activity.prompt,
      contextSnippet: activity.contextSnippet,
      keywords: activity.keywords,
      cognitiveGoal: activity.cognitiveGoal,
    }, null, 2)}

Generate the replacement stage JSON now.`;

    const regenerated = await generateJSONWithProvider({
      systemPrompt,
      userPrompt,
      responseSchema: stageResponseSchema,
      settings,
      isChecker: true, // lightweight flash-lite path (gemini-3.5-flash-lite default)
    });

    return NextResponse.json({
      activity: {
        ...regenerated,
        stageNumber: activity.stageNumber || 1,
      },
    });
  } catch (error: any) {
    console.error("Error in /api/regenerate-stage:", error);
    return NextResponse.json({
      error: error?.message || "Failed to regenerate stage."
    }, { status: 500 });
  }
}
