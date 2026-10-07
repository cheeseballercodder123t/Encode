import { Type } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { generateJSONWithProvider } from '@/lib/ai-client';
import { CRUCIBLE_MINUTES, validateCruciblePlan } from '@/lib/crucible/budget';
import { fusionBrief, matchFusion } from '@/lib/escalation/fusion';

/**
 * The timed crucible's problem synthesizer.
 *
 * Three multi-constraint problems, each decomposed into the states the learner
 * will work through. The STRONG model writes them, because a problem whose
 * states are not actually sequential — or whose numbers are not physically
 * consistent — is worse than no problem at all under a clock.
 *
 * The model does not allocate the time. It declares each state's WEIGHT (how
 * much of the problem it is), and `validateCruciblePlan` splits the sprint's
 * clock across those weights by the largest-remainder method, so the HUD can
 * never show a plan whose states do not add up to the clock it is pacing.
 *
 * At boss level the brief is a COLLISION (`lib/escalation/fusion.ts`): the
 * governor has established that single-chapter problems no longer cost this
 * learner anything, so the load has to come from two chapters at once.
 */

const crucibleSchema = {
  type: Type.OBJECT,
  properties: {
    problems: {
      type: Type.ARRAY,
      description: 'The sprint, in the order it is to be worked.',
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'A short name for this problem.' },
          domain: { type: Type.STRING, description: 'The chapter or discipline it belongs to.' },
          constraints: {
            type: Type.ARRAY,
            description: 'The constraints the system imposes, each one a single physical demand with its units.',
            items: { type: Type.STRING },
          },
          ask: { type: Type.STRING, description: 'What is being asked for, in one sentence.' },
          states: {
            type: Type.ARRAY,
            description:
              'The working-memory states this problem must be solved through, in order, 2-5 of them. Each is one rule it is possible to hold in mind at once.',
            items: {
              type: Type.OBJECT,
              properties: {
                label: {
                  type: Type.STRING,
                  description: 'What this state does, e.g. "System demand: the heat the water requires".',
                },
                weight: {
                  type: Type.NUMBER,
                  description: 'How much of the problem this state is worth, relative to the others.',
                },
              },
              required: ['label'],
            },
          },
        },
        required: ['title', 'states', 'ask'],
      },
    },
  },
  required: ['problems'],
};

const MAX_TOPIC_LENGTH = 300;

export async function POST(req: NextRequest) {
  try {
    const { topic, minutes: rawMinutes, boss, sourceContext, settings } = await req.json();

    const cleanTopic = typeof topic === 'string' ? topic.trim() : '';
    if (!cleanTopic) {
      return NextResponse.json(
        { error: 'Name the topic first — a crucible is timed against a chapter.' },
        { status: 400 }
      );
    }
    if (cleanTopic.length > MAX_TOPIC_LENGTH) {
      return NextResponse.json(
        { error: `That is ${cleanTopic.length} characters. Name the topic, not the source.` },
        { status: 400 }
      );
    }

    const minutes =
      typeof rawMinutes === 'number' && Number.isFinite(rawMinutes)
        ? Math.min(30, Math.max(3, Math.round(rawMinutes)))
        : CRUCIBLE_MINUTES;

    const fusion = boss ? matchFusion(cleanTopic) : null;

    const systemPrompt = `You are the Crucible Proctor. You write problems that are solved UNDER A CLOCK, so the structure matters as much as the physics.

RULES:
1. Produce the sprint listed in "THE SPRINT" below. Every problem is multi-constraint: at least TWO physical demands that interact, so no single formula finishes it.
2. The numbers must be internally consistent, and every one of them must be derivable from the constraints you state. A problem under a clock that turns out to be unsolvable is worse than no problem at all.
3. Each problem is decomposed into STATES. A state is one rule the learner can hold in their head at once — a system demand, a supply, a conversion, a bridge. They must be sequential: solving state N must be possible from state N−1's output plus the problem's own constraints. NEVER decompose by "step 1, step 2" of a method; decompose by what the system is doing.
4. Declare each state's weight — how much of the problem it actually is. Three equal states is fine; a 5-line algebra step being called equal to a whole energy balance is not.
5. State the constraints and what is asked. Never hint at the method, never reveal an intermediate value, no answer key anywhere.
6. Keep each constraint to one sentence with its units named.

${fusion ? fusionBrief(fusion) : 'THE SPRINT: three problems on the topic given, escalating in the number of constraints that interact.'}`;

    const userPrompt = `TOPIC: ${cleanTopic}

SPRINT LENGTH: ${minutes} minutes total.

SOURCE CONTEXT (may be empty):
${typeof sourceContext === 'string' ? sourceContext.slice(0, 4000) : '(none)'}

Write the sprint. Output strictly valid JSON.`;

    const parsed = await generateJSONWithProvider({
      systemPrompt,
      userPrompt,
      responseSchema: crucibleSchema,
      settings,
      isChecker: false,
    });

    const plan = validateCruciblePlan(parsed, minutes);
    if (!plan) {
      return NextResponse.json(
        {
          error:
            'The proctor returned no problem with a usable state machine, so the sprint was not started. A problem without sequential states cannot be paced, and pacing is the point.',
          refusal: 'no-plan',
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      ...plan,
      boss: Boolean(boss),
      fusion: fusion ? { id: fusion.id, domain: fusion.domain, topics: fusion.topics } : null,
    });
  } catch (error: any) {
    console.error('Error in /api/crucible:', error);
    return NextResponse.json(
      { error: error?.message || 'The crucible could not be started.' },
      { status: 500 }
    );
  }
}
