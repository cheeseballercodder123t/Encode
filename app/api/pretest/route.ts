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
      description: "Exactly 3 predict-observe-explain gates based on the notes, answered BEFORE the schema is generated.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          questionNumber: { type: Type.INTEGER },
          questionPrompt: {
            type: Type.STRING,
            description: "A concrete PREDICTION prompt: commit to what must happen, e.g. 'A increases 4x — what must B do to hold equilibrium?' Never an open 'explain why' question."
          },
          options: {
            type: Type.ARRAY,
            description: "EXACTLY 4 mutually exclusive concrete predictions. Short: a number, a relation, or one clause each.",
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING, description: "a | b | c | d" },
                label: { type: Type.STRING }
              },
              required: ["id", "label"]
            }
          },
          correctOptionId: { type: Type.STRING, description: "The id of the true prediction." },
          trapOptionId: {
            type: Type.STRING,
            description: "The id of the single most tempting INTUITIVE wrong option — the misconception a confident student picks."
          },
          subtleTrap: { type: Type.STRING, description: "Why the trap option feels obviously true to human common sense" },
          firstPrincipleAnswer: { type: Type.STRING, description: "The true causal first-principles answer revealed after committing" },
          whyAttemptingMatters: { type: Type.STRING, description: "Why the prediction error (if it fires) primes deep encoding" },
          trapCardFront: {
            type: Type.STRING,
            description: "Cloze-killer question for the interference trap card, e.g. 'Why does breaking an ATP phosphate bond NOT release energy by itself?'"
          },
          trapCardBack: {
            type: Type.STRING,
            description: "The card back with exactly one real Anki deletion, e.g. 'Breaking bonds requires energy input; energy is released only when {{c1::new, lower-energy bonds form with surrounding water molecules}}.'"
          }
        },
        required: ["id", "questionNumber", "questionPrompt", "options", "correctOptionId", "trapOptionId", "subtleTrap", "firstPrincipleAnswer"]
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

Attempting to answer a question before learning the material:even if the student fails completely:primes the brain's semantic networks and dramatically increases subsequent retention when the correct explanation is revealed.

Build exactly 3 PREDICT–OBSERVE–EXPLAIN gates that the student answers BEFORE seeing the schema.

EACH GATE MUST BE A COMMITMENT, NOT AN ESSAY:
- 'questionPrompt' is a concrete prediction: a quantity changes by a factor, a parameter goes to an extreme, a step is reversed. 'A system has parameters A and B; A increases by 4x — what must B do to hold equilibrium?'
- 'options' are exactly 4 mutually exclusive concrete predictions. Short — a number, a relation, or one clause each ('Quadruples', 'Doubles', 'Halves', 'Quarters'). No option may be a joke or a non-answer.
- 'correctOptionId' is the true prediction. 'trapOptionId' is the single most tempting INTUITIVE wrong one — the answer that feels obviously true to common sense but is physically false:
    Physics: 'if it moves right, the net force points right' · Chemistry: 'bond breaking releases energy' · Physiology: 'breathing is driven by the need for oxygen'
- 'subtleTrap' explains why that wrong option feels true. 'firstPrincipleAnswer' gives the true mechanism revealed after they commit.
- 'trapCardFront' / 'trapCardBack' are the interference-trap Anki card that kills this specific misconception for good: a question that forces the distinction, and a back containing exactly ONE real {{c1::...}} deletion.

Prefer equations, proportionalities and extreme-case reasoning over trivia. The student should be able to commit in under 10 seconds.`;

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
      isChecker: true,
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
