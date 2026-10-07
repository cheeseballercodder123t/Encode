import { Type } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { generateJSONWithProvider } from '@/lib/ai-client';
import {
  isMutationTier,
  mutationDirective,
  normalizeMutatedProblem,
} from '@/lib/escalation/mutation';
import { fusionBrief, matchFusion } from '@/lib/escalation/fusion';

/**
 * The constraint-mutation matrix.
 *
 * The STRONG model runs this one, and it has to: mutating a boundary condition —
 * unequal coefficients, a non-unit density, a latent-heat plateau mid-reaction —
 * means re-deriving the physics so the problem still has exactly one defensible
 * answer. That is generation, not classification.
 *
 * What the model does NOT get is the last word on whether it did it. The variant
 * is read back by `normalizeMutatedProblem`, which checks that it actually
 * carries its tier's boundary conditions and REFUSES it otherwise. A "Tier 3"
 * problem with no latent-heat term is a Tier 1 problem wearing a harder label,
 * and a learner told they solved something harder than they did is worse off
 * than one who solved an easy problem and knows it.
 */

const mutationSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: 'A short name for this variant.' },
    statement: {
      type: Type.STRING,
      description: 'The problem setup, written out as the learner will read it. No method hints, no intermediate values.',
    },
    given: {
      type: Type.ARRAY,
      description: 'Every constraint the system imposes, units included. A learner must be able to list the system\'s demands from this alone.',
      items: { type: Type.STRING },
    },
    asks: {
      type: Type.ARRAY,
      description: 'What is actually being asked for, in the order it must be found.',
      items: { type: Type.STRING },
    },
    requiredMoves: {
      type: Type.ARRAY,
      description: 'The moves this tier forces that a Tier 1 version does not.',
      items: { type: Type.STRING },
    },
    trap: {
      type: Type.STRING,
      description: 'The tempting wrong move the tier is built to punish.',
    },
  },
  required: ['statement', 'given', 'asks'],
};

/** The topic is a chapter or concept, not a source dump. */
const MAX_TOPIC_LENGTH = 300;

export async function POST(req: NextRequest) {
  try {
    const { topic, tier: rawTier, boss, sourceContext, settings } = await req.json();

    const cleanTopic = typeof topic === 'string' ? topic.trim() : '';
    if (!cleanTopic) {
      return NextResponse.json(
        { error: 'Name the chapter or concept first — the matrix mutates a topic, not a blank.' },
        { status: 400 }
      );
    }
    if (cleanTopic.length > MAX_TOPIC_LENGTH) {
      return NextResponse.json(
        { error: `That is ${cleanTopic.length} characters. Name the topic, not the source.` },
        { status: 400 }
      );
    }

    const tier = isMutationTier(rawTier) ? rawTier : boss ? 3 : 2;
    const fusion = boss ? matchFusion(cleanTopic) : null;

    const systemPrompt = [mutationDirective(tier), fusion ? fusionBrief(fusion) : '']
      .filter(Boolean)
      .join('\n\n');

    const userPrompt = `TOPIC: ${cleanTopic}

SOURCE CONTEXT (may be empty — the topic above is what must be mutated):
${typeof sourceContext === 'string' ? sourceContext.slice(0, 4000) : '(none)'}

Produce ONE problem at the tier described. Output strictly valid JSON.`;

    const parsed = await generateJSONWithProvider({
      systemPrompt,
      userPrompt,
      responseSchema: mutationSchema,
      settings,
      isChecker: false,
    });

    const result = normalizeMutatedProblem(parsed, tier);
    if (!result.ok) {
      // A 4xx rather than a repaired payload: the label is the promise, and the
      // only honest repair is to ask for a different problem.
      return NextResponse.json(
        { error: result.message, refusal: result.reason, checks: result.checks },
        { status: 422 }
      );
    }

    return NextResponse.json({
      problem: result.problem,
      checks: result.checks,
      fusion: fusion ? { id: fusion.id, domain: fusion.domain, topics: fusion.topics } : null,
    });
  } catch (error: any) {
    console.error('Error in /api/mutation:', error);
    return NextResponse.json(
      { error: error?.message || 'The constraint matrix could not generate a variant.' },
      { status: 500 }
    );
  }
}
