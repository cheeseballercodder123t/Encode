import { Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { generateJSONWithProvider } from "@/lib/ai-client";

const blurtingSchema = {
  type: Type.OBJECT,
  properties: {
    retrievalScore: { type: Type.INTEGER, description: "Retrieval completeness percentage (0 - 100)" },
    recalledCount: { type: Type.INTEGER },
    missedCount: { type: Type.INTEGER },
    feedback: { type: Type.STRING, description: "1-2 sentence overall coaching feedback on recall density" },
    recalledPrinciples: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          principle: { type: Type.STRING },
          studentMentioned: { type: Type.STRING, description: "Excerpt or concept matched in the blurt" }
        },
        required: ["principle"]
      }
    },
    missedPrinciples: {
      type: Type.ARRAY,
      description: "Crucial first principles or causal mechanisms completely omitted in the user's blurt",
      items: {
        type: Type.OBJECT,
        properties: {
          principle: { type: Type.STRING },
          whyCrucial: { type: Type.STRING },
          flashcardTrigger: { type: Type.STRING, description: "A quick mental trigger to recall this next time" }
        },
        required: ["principle", "whyCrucial"]
      }
    },
    suggestedBlurtRemedy: {
      type: Type.STRING,
      description: "1-sentence summary of the highest leverage gap to review."
    }
  },
  required: ["retrievalScore", "recalledCount", "missedCount", "feedback", "recalledPrinciples", "missedPrinciples"]
};

export async function POST(req: NextRequest) {
  try {
    const { 
      blurtText, 
      schemaTitle, 
      activities, 
      researchContexts, 
      settings 
    } = await req.json();

    if (!blurtText || !blurtText.trim()) {
      return NextResponse.json({ error: "Please write down your memory blurt first." }, { status: 400 });
    }

    const systemPrompt = `You are a Cognitive Psychologist evaluating a "Blurting Method" retrieval session.
The student closed their notes/schema and typed everything they could remember from memory.

Your job:
1. Compare the student's raw memory dump ("Blurt") against the target First-Principles Schema.
2. Identify what they successfully retrieved (recalledPrinciples).
3. Identify the EXACT core causal mechanisms or first principles they forgot/omitted (missedPrinciples) so they can be visually highlighted in RED.
4. Calculate an objective Retrieval Score (0 to 100).
5. Output strictly valid JSON.`;

    const targetContext = `TARGET TOPIC: ${schemaTitle}
TARGET ENCODED STAGES:
${(activities || []).map((a: any, i: number) => `Stage ${i + 1}: ${a.title} (${a.cognitiveGoal}). Keywords: ${(a.keywords || []).join(', ')}. Context: ${a.contextSnippet}`).join('\n')}

${researchContexts && researchContexts.length > 0 ? `DEEP RESEARCH PREREQUISITES:\n${researchContexts.map((r: any) => `- ${r.conceptAdded}: ${r.explanation}`).join('\n')}` : ''}`;

    const userPrompt = `${targetContext}

STUDENT'S MEMORY BLURT DUMP:
"${blurtText}"

Perform the Blurting Method differential analysis.`;

    const result = await generateJSONWithProvider({
      systemPrompt,
      userPrompt,
      responseSchema: blurtingSchema,
      settings,
      isChecker: false
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error in /api/blurt:", error);
    return NextResponse.json({ 
      error: error?.message || "Failed to analyze blurting session." 
    }, { status: 500 });
  }
}
