import { Type } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { generateJSONWithProvider } from '@/lib/ai-client';
import { CRUCIBLE_MINUTES, validateCruciblePlan } from '@/lib/crucible/budget';
import { fusionBrief, fusionReadiness, soloDepthBrief } from '@/lib/escalation/fusion';
import { describeLedgerFailures, verifyLedger } from '@/lib/escalation/consistency';

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
 * At boss level the brief is a COLLISION (`lib/escalation/fusion.ts`) — but only
 * when the material actually carries two chapters of that collision. With one
 * chapter present the escalation is re-aimed DEEPER inside it (`soloDepthBrief`)
 * rather than importing vocabulary the learner has never met, because a
 * "collision" with an unstudied chapter is not load, it is a problem that cannot
 * be finished.
 *
 * And no problem is served until its own arithmetic closes. A generated sprint
 * has no CAS behind it, so each problem declares its quantities and relations
 * and `lib/escalation/consistency.ts` evaluates them here. A problem whose
 * relations disagree with each other is DROPPED, with one repair pass before the
 * refusal — under a clock, an unsolvable problem costs the whole rep.
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
          ledger: {
            type: Type.OBJECT,
            description:
              'This problem\'s own arithmetic, declared so a checker can verify it: every quantity with its signed value and unit, and every relation between them as an equality in those symbols.',
            properties: {
              quantities: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    symbol: { type: Type.STRING, description: 'The symbol used in the relations, e.g. m_water.' },
                    value: { type: Type.NUMBER, description: 'Its signed numeric value.' },
                    unit: { type: Type.STRING, description: 'Its unit.' },
                  },
                  required: ['symbol', 'value'],
                },
              },
              relations: {
                type: Type.ARRAY,
                description:
                  'Equalities in symbols, e.g. lhs "q" rhs "m_water * c_water * dT". Only + - * / ^, parentheses, numbers and the declared symbols.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    lhs: { type: Type.STRING },
                    rhs: { type: Type.STRING },
                    note: { type: Type.STRING, description: 'What the relation is, e.g. energy balance.' },
                  },
                  required: ['lhs', 'rhs'],
                },
              },
            },
          },
        },
        required: ['title', 'states', 'ask'],
      },
    },
  },
  required: ['problems'],
};

/**
 * The instruction that makes the declared arithmetic mandatory.
 *
 * A sprint has no answer key, so the model's own numbers are the only thing that
 * can be checked — which means they have to be declared in a form a checker can
 * evaluate. This is quoted verbatim into the prompt, so it states the refusal
 * too: a problem whose relations do not close is dropped, not served.
 */
const LEDGER_INSTRUCTION = `DECLARE EACH PROBLEM'S ARITHMETIC. The "ledger" object is not optional: list every quantity the problem uses with its signed value and unit, then every relation between them as an equality in those symbols (only + - * / ^, parentheses, numbers and your own symbols). A checker evaluates every relation you write, and a problem whose relations do not close is DROPPED from the sprint before it is paced. If a number in the statement cannot be related to the others, it does not belong in the statement. State each declaration only once per problem and refer to the same symbol everywhere, so the ledger and the statement cannot drift apart.`;

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

    const readiness = boss ? fusionReadiness(cleanTopic, typeof sourceContext === 'string' ? sourceContext : '') : null;
    const brief = readiness
      ? readiness.ready
        ? fusionBrief(readiness.row!)
        : readiness.row
          ? soloDepthBrief(readiness)
          : ''
      : '';

    const systemPrompt = `You are the Crucible Proctor. You write problems that are solved UNDER A CLOCK, so the structure matters as much as the physics.

RULES:
1. Produce the sprint listed in "THE SPRINT" below. Every problem is multi-constraint: at least TWO physical demands that interact, so no single formula finishes it.
2. The numbers must be internally consistent, and every one of them must be derivable from the constraints you state. A problem under a clock that turns out to be unsolvable is worse than no problem at all.
3. Each problem is decomposed into STATES. A state is one rule the learner can hold in their head at once — a system demand, a supply, a conversion, a bridge. They must be sequential: solving state N must be possible from state N−1's output plus the problem's own constraints. NEVER decompose by "step 1, step 2" of a method; decompose by what the system is doing.
4. Declare each state's weight — how much of the problem it actually is. Three equal states is fine; a 5-line algebra step being called equal to a whole energy balance is not.
5. State the constraints and what is asked. Never hint at the method, never reveal an intermediate value, no answer key anywhere.
6. Keep each constraint to one sentence with its units named.

${brief || 'THE SPRINT: three problems on the topic given, escalating in the number of constraints that interact.'}

${LEDGER_INSTRUCTION}`;

    const userPromptFor = (repair: string) =>
      `TOPIC: ${cleanTopic}

SPRINT LENGTH: ${minutes} minutes total.

SOURCE CONTEXT (may be empty):
${typeof sourceContext === 'string' ? sourceContext.slice(0, 4000) : '(none)'}

Write the sprint. Output strictly valid JSON.${repair ? `

${repair}` : ''}`;

    /**
     * Which problems survived the arithmetic gate, and why the others did not.
     *
     * A problem whose declared relations disagree with each other is dropped
     * rather than served: under a clock, one unsolvable problem costs the whole
     * rep, and the learner spends it proving the problem is wrong.
     */
    const gate = (payload: unknown) => {
      const raw = Array.isArray((payload as any)?.problems) ? (payload as any).problems : [];
      const kept: unknown[] = [];
      const rejected: { title: string; reason: string }[] = [];
      let verified = 0;
      for (const problem of raw) {
        const verification = verifyLedger(
          (problem as any)?.ledger?.quantities,
          (problem as any)?.ledger?.relations
        );
        if (!verification.ok) {
          rejected.push({
            title:
              typeof (problem as any)?.title === 'string'
                ? (problem as any).title
                : 'an untitled problem',
            reason: describeLedgerFailures(verification),
          });
          continue;
        }
        if (verification.verified) verified += 1;
        kept.push(problem);
      }
      return { kept, rejected, verified };
    };

    const parsed = await generateJSONWithProvider({
      systemPrompt,
      userPrompt: userPromptFor(''),
      responseSchema: crucibleSchema,
      settings,
      isChecker: false,
    });

    let { kept, rejected, verified } = gate(parsed);

    // One repair pass, and only when there is something to repair. The failing
    // relations travel back verbatim, because they are the defect report.
    if (rejected.length > 0) {
      const repaired = await generateJSONWithProvider({
        systemPrompt,
        userPrompt: userPromptFor(
          `YOUR PREVIOUS SPRINT WAS REJECTED IN PART BY AN ARITHMETIC CHECK.\n\n${rejected
            .map((entry) => `  · ${entry.title}: ${entry.reason}`)
            .join('\n')}\n\nRewrite the sprint so every declared relation is true of the quantities you declare. Do not change the physics to make the arithmetic close — recompute the numbers instead.`
        ),
        responseSchema: crucibleSchema,
        settings,
        isChecker: false,
      });
      const second = gate(repaired);
      if (second.rejected.length < rejected.length) {
        kept = second.kept;
        rejected = second.rejected;
        verified = second.verified;
      }
    }

    const plan = validateCruciblePlan({ problems: kept }, minutes);
    if (!plan) {
      return NextResponse.json(
        {
          error:
            rejected.length > 0
              ? `No problem survived the arithmetic check, so the sprint was not started. ${rejected
                  .map((entry) => entry.reason)
                  .join(' · ')}`
              : 'The proctor returned no problem with a usable state machine, so the sprint was not started. A problem without sequential states cannot be paced, and pacing is the point.',
          refusal: rejected.length > 0 ? 'inconsistent-numbers' : 'no-plan',
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      ...plan,
      boss: Boolean(boss),
      ledger: { verifiedProblems: verified, checkedProblems: plan.problems.length },
      rejectedProblems: rejected.map((entry) => `${entry.title}: ${entry.reason}`),
      escalation: readiness
        ? {
            mode: readiness.ready ? 'collision' : readiness.row ? 'depth' : 'siloed',
            reason: readiness.reason,
          }
        : null,
      fusion:
        readiness?.row && readiness.ready
          ? { id: readiness.row.id, domain: readiness.row.domain, topics: readiness.present }
          : null,
    });
  } catch (error: any) {
    console.error('Error in /api/crucible:', error);
    return NextResponse.json(
      { error: error?.message || 'The crucible could not be started.' },
      { status: 500 }
    );
  }
}
