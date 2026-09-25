import { Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { generateJSONWithProvider } from "@/lib/ai-client";
import { validateDiscriminationResult } from "@/lib/ai-output-validation";

const discriminationSchema = {
  type: Type.OBJECT,
  properties: {
    topic: { type: Type.STRING, description: "The topic being discriminated, 2-6 words." },
    conceptLabel: { type: Type.STRING, description: "The stage's concept, 1-4 words." },
    lookalikeLabel: {
      type: Type.STRING,
      description: "The concept it is most often confused with, 1-4 words.",
    },
    questions: {
      type: Type.ARRAY,
      description:
        "EXACTLY 2 vignettes. ONE must be an instance of conceptLabel (answerIsConcept: true) and ONE an instance of lookalikeLabel (answerIsConcept: false). Present them as two concrete edge cases, never as definitions.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: "dq1 | dq2" },
          vignette: {
            type: Type.STRING,
            description:
              "ONE concrete situation, 1-2 sentences, describing a specific reaction/patient/case/code path with observable details only. Never name the concept or the lookalike, never use their vocabulary, and never hint at which one it is.",
          },
          answerIsConcept: {
            type: Type.BOOLEAN,
            description: "true when this vignette is conceptLabel, false when it is lookalikeLabel.",
          },
          rationale: {
            type: Type.STRING,
            description: "One line naming the observable tell that settles the classification.",
          },
        },
        required: ["id", "vignette", "answerIsConcept", "rationale"],
      },
    },
    operationalRule: {
      type: Type.STRING,
      description:
        "ONE sentence: the single operational test that separates the pair (the measurement, the rate law, the timing, the mechanism's rate-determining step). State it as a test the learner could run, not as a description.",
    },
    cardFront: {
      type: Type.STRING,
      description: "A question-form cloze front for this discrimination pair.",
    },
    cardBack: {
      type: Type.STRING,
      description:
        "The answer containing exactly one {{c1::...}} deletion: the operational rule.",
    },
  },
  required: [
    "topic",
    "conceptLabel",
    "lookalikeLabel",
    "questions",
    "operationalRule",
    "cardFront",
    "cardBack",
  ],
};

export async function POST(req: NextRequest) {
  try {
    const { conceptTitle, concept, lookalike, distinguishingRule, contextSnippet, topicSummary, settings } =
      await req.json();

    const conceptLabel = String(concept || conceptTitle || '').trim();
    if (!conceptLabel) {
      return NextResponse.json({ error: 'No concept to discriminate.' }, { status: 400 });
    }

    const systemPrompt = `You are an interference examiner. You build a BLIND 2-question discrimination check that a learner must pass in under 10 seconds per question before they may export their cards.

WHY IT MATTERS: cards do not fail in spaced repetition because they were never learned, they fail because a NEIGHBOUR answers for them — SN1 for SN2, atropine for epinephrine, Type I for Type II error. That is retroactive interference, and normal self-graded review cannot see it.

HOW TO BUILD IT:
1. Write exactly TWO vignettes. One is an instance of the CONCEPT, one is an instance of the LOOKALIKE. Each is a concrete situation: a reaction with reagents and observed rate data, a patient with specific signs, a test statistic with the decision that was made, a code path with a trace.
2. Keep them BLIND: never name the concept or the lookalike inside a vignette, never use their textbook vocabulary, and never order them so the concept is obviously first. The two vignettes must be parallel in length, register and specificity, so the only way to tell them apart is the actual discriminating feature.
3. Do not leak the answer through detail counts: neither vignette may have more or fewer observables than the other.
4. 'rationale' names the observable tell that settles it, one line. It is shown only AFTER the learner answers.
5. 'operationalRule' is the payoff: ONE sentence stating the test that separates the pair — the measurement, the timing, the rate law, the rate-determining step — phrased so the learner can actually run it. Not "they differ in mechanism".
6. 'cardFront' is a question-form prompt about the pair; 'cardBack' contains exactly one {{c1::...}} deletion around the operational rule.

Never produce two vignettes of the same kind: a check where both answers are the same is not a discrimination test.`;

    const userPrompt = `TOPIC: ${topicSummary || conceptLabel}
CONCEPT: ${conceptLabel}
ITS LOOKALIKE (most commonly confused with): ${lookalike || 'the closest confusable neighbour'}
SOURCE CONTEXT: ${contextSnippet || ''}
STAGE'S OWN DISTINGUISHING RULE (may be empty, do not contradict it): ${distinguishingRule || ''}

Build the blind 2-question check. Output strictly valid JSON.`;

    const parsed = await generateJSONWithProvider({
      systemPrompt,
      userPrompt,
      responseSchema: discriminationSchema,
      settings,
      isChecker: false,
    });

    const validated = validateDiscriminationResult(parsed);
    if (validated.questions.length < 2) {
      return NextResponse.json(
        { error: 'The examiner could not produce a blind pair. Export can proceed without the gate.' },
        { status: 502 }
      );
    }

    return NextResponse.json(validated);
  } catch (error: any) {
    console.error("Error in /api/discrimination:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to build the discrimination gate." },
      { status: 500 }
    );
  }
}
