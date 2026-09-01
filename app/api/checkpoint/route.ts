import { Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { generateJSONWithProvider } from "@/lib/ai-client";

const checkpointReviewSchema = {
  type: Type.OBJECT,
  properties: {
    passed: { 
      type: Type.BOOLEAN, 
      description: "True if the student explained the fundamental mechanism accurately in their own words, False if it contains critical misconceptions or is too vague." 
    },
    score: { 
      type: Type.INTEGER, 
      description: "Evaluation score from 0 to 100" 
    },
    feedback: { 
      type: Type.STRING, 
      description: "Concise, highly encouraging Socratic feedback explaining what was strong or what key causal link was missed." 
    },
    xpBonus: { 
      type: Type.INTEGER, 
      description: "XP bonus between 50 and 150 based on precision" 
    },
    suggestedNextFocus: { 
      type: Type.STRING, 
      description: "1-sentence bridge introducing the next module topic" 
    }
  },
  required: ["passed", "score", "feedback", "xpBonus"]
};

export async function POST(req: NextRequest) {
  try {
    const { 
      moduleTitle, 
      question, 
      corePrerequisite, 
      userAnswer, 
      settings 
    } = await req.json();

    if (!userAnswer || !userAnswer.trim()) {
      return NextResponse.json({ 
        passed: false, 
        score: 0, 
        feedback: "Please provide your explanation to pass this Feynman checkpoint.", 
        xpBonus: 0 
      });
    }

    const systemPrompt = `You are Richard Feynman acting as a compassionate but rigorous Socratic examiner.
The student is taking a Feynman Mastery Checkpoint to unlock the next chapter in their Guided Cognitive Path.

Module Title: "${moduleTitle}"
Target Prerequisite Concept: "${corePrerequisite}"
Checkpoint Question: "${question}"

Review the student's answer:
- Verify if they demonstrate genuine causal understanding rather than reciting rote jargon.
- If they explain the core "why" accurately, pass them (passed: true, score >= 70).
- If they leave out the primary causal mechanism, give constructive Socratic guidance (passed: false, score < 70) and ask them to refine it.
- Keep feedback conversational, punchy, and under 3 sentences.`;

    const userPrompt = `STUDENT ANSWER:\n"${userAnswer}"\n\nEvaluate whether this student understands "${corePrerequisite}" deeply enough to unlock the next module.`;

    const review = await generateJSONWithProvider({
      systemPrompt,
      userPrompt,
      responseSchema: checkpointReviewSchema,
      settings,
      isChecker: true
    });

    return NextResponse.json(review);
  } catch (error: any) {
    console.error("Error in /api/checkpoint:", error);
    return NextResponse.json({ 
      error: error?.message || "Failed to evaluate Feynman Checkpoint." 
    }, { status: 500 });
  }
}
