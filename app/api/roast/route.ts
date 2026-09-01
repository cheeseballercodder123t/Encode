import { Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { generateJSONWithProvider } from "@/lib/ai-client";

const roastResponseSchema = {
  type: Type.OBJECT,
  properties: {
    overallVerdict: {
      type: Type.STRING,
      description: "A witty, biting, yet intellectually sharp 1-2 sentence verdict from a cynical tenured professor."
    },
    preparednessScore: {
      type: Type.INTEGER,
      description: "Preparedness / Causal Rigor score between 15 and 95. (e.g. 35 for sloppy hand-wavy notes, 85 for surprisingly rigorous notes)."
    },
    professorTitle: {
      type: Type.STRING,
      description: "Humorous academic title, e.g. 'Prof. Sterling, PhD (Tenured & Disappointed)', 'Dr. Vance (Chief Inquisitor of Causal Gaps)'"
    },
    lethalQuote: {
      type: Type.STRING,
      description: "The single most devastating yet hilariously accurate one-liner roasting the student's conceptual gap."
    },
    criticisms: {
      type: Type.ARRAY,
      description: "3 to 5 targeted critiques calling out specific hand-waving, logical fallacies, or missing prerequisites.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          category: { 
            type: Type.STRING, 
            description: "Must be one of: 'logical_fallacy', 'missing_prerequisite', 'hand_waving', 'jargon_parroting', 'contradiction'" 
          },
          categoryLabel: { type: Type.STRING, description: "Short punchy label e.g. 'Hand-Waving Magic', 'Omitted Prerequisite', 'Jargon Parroting'" },
          severity: { type: Type.STRING, description: "'brutal', 'moderate', or 'mild'" },
          quoteOrTarget: { type: Type.STRING, description: "The exact quote, concept, or missing step being called out" },
          roastComment: { type: Type.STRING, description: "The witty, snarky professor roast explaining why this fails rigor" },
          fixTip: { type: Type.STRING, description: "The constructive, scientifically grounded fix required to close the gap" },
          suggestedPatch: { type: Type.STRING, description: "A concise 1-sentence addition the user can inject into their notes to fix it" }
        },
        required: ["id", "category", "categoryLabel", "severity", "quoteOrTarget", "roastComment", "fixTip"]
      }
    },
    begrudgingCompliment: {
      type: Type.STRING,
      description: "A single begrudging, sarcastic compliment (e.g. 'At least you spelled mitochondria correctly.', 'The font choice has more structure than your argument.')"
    },
    actionableRecommendations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "2 to 3 concise, high-yield conceptual items to add before encoding."
    }
  },
  required: ["overallVerdict", "preparednessScore", "professorTitle", "lethalQuote", "criticisms", "begrudgingCompliment", "actionableRecommendations"]
};

export async function POST(req: NextRequest) {
  try {
    const { notes, file, settings } = await req.json();

    const hasNotes = typeof notes === 'string' && notes.trim().length > 0;
    const hasFile = file && file.base64Data && file.type;

    if (!hasNotes && !hasFile) {
      return NextResponse.json({ 
        error: "Please enter some notes or upload a document before requesting a roast." 
      }, { status: 400 });
    }

    const systemPrompt = `You are a brilliant, world-renowned, tenured MIT/Oxford professor with zero tolerance for hand-waving, buzzword soup, or logical leaps.
You are running "ROAST MY NOTES" mode: an intellectually rigorous, comedic, and constructive critique of a student's raw study material.

Your job is NOT merely to insult—it is to use biting wit to brutally illuminate where the student's mental model is incomplete, vague, contradictory, or relying on rote memorization without causal mechanisms.

Audit the student's notes for:
1. "Hand-Waving": Using phrases like "and then it works", "etc.", or skipping the hardest mathematical/biological/engineering transition step.
2. "Omitted Prerequisites": Mentioning advanced concepts without defining the core causal laws driving them (e.g. discussing neural action potentials without mentioning ion gradients or equilibrium potentials; discussing Keynesian economics without liquidity traps).
3. "Jargon Parroting": Using high-sounding buzzwords without explaining what physically/mechanically happens.
4. "Logical Fallacies / Contradictions": Confusing cause with correlation, reversing directions of causality, or stating mutually exclusive claims.

Tone: Sarcastic, sharp, witty, academic, yet fundamentally aimed at guiding them to first-principles mastery. Never be abusive or profane—channel the intellectual sarcasm of Richard Feynman, Gordon Ramsay reviewing a lecture, and an elite thesis advisor.`;

    let userPrompt = '';
    if (hasNotes) {
      userPrompt += `STUDENT'S RAW NOTES:\n\n${notes.slice(0, 15000)}\n\n`;
    }
    if (hasFile) {
      userPrompt += `[STUDENT'S UPLOADED FILE: ${file.name} (${file.type}). Review and roast the clarity/rigor of the concepts in this document.]`;
    }

    userPrompt += `Perform the "Roast My Notes" audit. Generate valid JSON conforming to the schema.`;

    const parsedResult = await generateJSONWithProvider({
      systemPrompt,
      userPrompt,
      responseSchema: roastResponseSchema,
      settings,
      isChecker: false,
      file: hasFile ? file : null,
    });

    return NextResponse.json(parsedResult);
  } catch (error: any) {
    console.error("Error in /api/roast:", error);
    return NextResponse.json({ 
      error: error?.message || "Failed to generate notes roast." 
    }, { status: 500 });
  }
}
