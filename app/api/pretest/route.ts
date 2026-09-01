import { Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { generateJSONWithProvider } from "@/lib/ai-client";

const pretestSchema = {
  type: Type.OBJECT,
  properties: {
    topic: { type: Type.STRING },
    scientificRationale: { 
      type: Type.STRING, 
      description: "Short scientific reminder of the Pre-Testing Effect (Productive Failure primes synaptic plasticity in the hippocampus)." 
    },
    questions: {
      type: Type.ARRAY,
      description: "Exactly 3 probing, predictive questions based on the notes before they read the schema.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          questionNumber: { type: Type.INTEGER },
          questionPrompt: { type: Type.STRING, description: "A probing challenge forcing them to hypothesize the underlying mechanism" },
          subtleTrap: { type: Type.STRING, description: "The common intuitive misconception students fall for" },
          firstPrincipleAnswer: { type: Type.STRING, description: "The true causal first-principles answer revealed after guessing" },
          whyAttemptingMatters: { type: Type.STRING, description: "Why failing to guess this correctly activates deep learning" }
        },
        required: ["id", "questionNumber", "questionPrompt", "subtleTrap", "firstPrincipleAnswer"]
      }
    }
  },
  required: ["topic", "scientificRationale", "questions"]
};

export async function POST(req: NextRequest) {
  try {
    const { notes, file, settings } = await req.json();

    const hasNotes = typeof notes === 'string' && notes.trim().length > 0;
    const hasFile = file && file.base64Data && file.type;

    if (!hasNotes && !hasFile) {
      return NextResponse.json({ error: "No notes provided for pre-testing." }, { status: 400 });
    }

    const systemPrompt = `You are a Cognitive Neuroscientist specializing in THE PRE-TESTING EFFECT and PRODUCTIVE FAILURE (Kornell, Hays, & Bjork, 2009; Kapur, 2016).

Attempting to answer a question before learning the material—even if the student fails completely—primes the brain's semantic networks and dramatically increases subsequent retention when the correct explanation is revealed.

Generate exactly 3 difficult, mechanistic "Pre-Test" questions that force the student to guess/hypothesize about the material in their notes.
Include the counter-intuitive trap, the first-principle answer to be shown after they attempt, and the cognitive rationale.`;

    let userPrompt = '';
    if (hasNotes) {
      userPrompt += `STUDENT RAW NOTES:\n\n${notes.slice(0, 14000)}\n\n`;
    }
    if (hasFile) {
      userPrompt += `[ATTACHED FILE: ${file.name} (${file.type}). Build 3 Pre-Test questions from this file.]`;
    }

    userPrompt += `Generate 3 Pre-Testing Effect questions. Output strictly valid JSON.`;

    const parsedResult = await generateJSONWithProvider({
      systemPrompt,
      userPrompt,
      responseSchema: pretestSchema,
      settings,
      isChecker: false,
      file: hasFile ? file : null,
    });

    return NextResponse.json(parsedResult);
  } catch (error: any) {
    console.error("Error in /api/pretest:", error);
    return NextResponse.json({ 
      error: error?.message || "Failed to generate Pre-Test questions." 
    }, { status: 500 });
  }
}
