import { Type } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { generateJSONWithProvider } from '@/lib/ai-client';
import {
  isMutationTier,
  mutationDirective,
  normalizeMutatedProblem,
} from '@/lib/escalation/mutation';
import { fusionBrief, fusionReadiness, soloDepthBrief } from '@/lib/escalation/fusion';
import {
  describeLedgerFailures,
  ledgerRepairPrompt,
  verifyLedger,
} from '@/lib/escalation/consistency';

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
 *
 * Two further gates sit in front of the learner, and both exist because of what a
 * language model cannot do rather than because of what it says:
 *
 *   * BREADTH. A boss-level brief is a COLLISION of two or three chapters, and a
 *     collision is only served when the learner's material actually carries two
 *     of them (`fusionReadiness`). With one chapter present the escalation is
 *     re-aimed DEEPER inside that chapter rather than importing a chapter the
 *     learner has never met; with no row on file it stays plainly single-topic.
 *   * ARITHMETIC. There is no CAS behind a generated problem, so a Tier 3
 *     variant must DECLARE its numbers and its relations, and every relation is
 *     evaluated here (`lib/escalation/consistency.ts`). A problem whose own
 *     arithmetic does not close gets one repair pass with the defect report, and
 *     then a refusal — never a served problem that cannot be solved.
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
    // The declared arithmetic is a FIELD of the problem, not a sibling of its
    // schema: the generator has to return it with the problem, and a key the
    // response schema does not carry is a field the model is never asked for.
    ledger: {
      type: Type.OBJECT,
      description:
        'The problem\'s own arithmetic, declared so it can be CHECKED: every quantity you used, and the relations between them. A problem whose relations do not close is not served.',
      properties: {
        quantities: {
          type: Type.ARRAY,
          description: 'Every quantity in the problem, with the symbol used in the relations below.',
          items: {
            type: Type.OBJECT,
            properties: {
              symbol: { type: Type.STRING, description: 'The symbol, e.g. m_water or dT.' },
              value: { type: Type.NUMBER, description: 'Its numeric value, signed, in the unit below.' },
              unit: { type: Type.STRING, description: 'The unit, e.g. g or kJ.' },
            },
            required: ['symbol', 'value'],
          },
        },
        relations: {
          type: Type.ARRAY,
          description:
            'Equalities in symbols, e.g. lhs "q" rhs "m_water * c_water * dT". Only + - * / ^, parentheses, numbers and the symbols declared above.',
          items: {
            type: Type.OBJECT,
            properties: {
              lhs: { type: Type.STRING, description: 'The left side, as an expression in the declared symbols.' },
              rhs: { type: Type.STRING, description: 'The right side, as an expression in the declared symbols.' },
              note: { type: Type.STRING, description: 'What the relation is, e.g. energy balance.' },
            },
            required: ['lhs', 'rhs'],
          },
        },
      },
    },
  },
  required: ['statement', 'given', 'asks'],
};

/** The instruction that makes the declared arithmetic mandatory at the top tier. */
const LEDGER_INSTRUCTION = `DECLARE YOUR ARITHMETIC. The "ledger" object is not optional for a Tier 3 problem: list every quantity you used with its signed value and unit, then every relation between them as an equality in those symbols (only + - * / ^, parentheses, numbers and your own symbols). A checker evaluates every relation you write, and a problem whose relations do not close is rejected before the learner ever sees it. If a number in your statement cannot be related to the others, it does not belong in the statement.`;

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
    const context = typeof sourceContext === 'string' ? sourceContext.slice(0, 4000) : '';

    // Breadth first: what the material can actually carry decides which brief
    // goes out, and the learner is told which one it was. A collision that the
    // material cannot support is not an escalation.
    const readiness = boss ? fusionReadiness(cleanTopic, context) : null;
    const brief = readiness
      ? readiness.ready
        ? fusionBrief(readiness.row!)
        : readiness.row
          ? soloDepthBrief(readiness)
          : ''
      : '';

    const systemPrompt = [mutationDirective(tier), LEDGER_INSTRUCTION, brief]
      .filter(Boolean)
      .join('\n\n');

    const userPromptFor = (repair: string) =>
      `TOPIC: ${cleanTopic}\n\nSOURCE CONTEXT (may be empty — the topic above is what must be mutated):\n${context || '(none)'}\n\nProduce ONE problem at the tier described. Output strictly valid JSON.${repair ? `\n\n${repair}` : ''}`;

    const parsed = await generateJSONWithProvider({
      systemPrompt,
      userPrompt: userPromptFor(''),
      responseSchema: mutationSchema,
      settings,
      isChecker: false,
    });

    let result = normalizeMutatedProblem(parsed, tier);
    let ledger = verifyLedger(
      (parsed as any)?.ledger?.quantities,
      (parsed as any)?.ledger?.relations
    );

    // One repair pass, and only when the problem itself is sound but its
    // arithmetic is not. A tier that failed its boundary gates is not repaired
    // by arithmetic — that is a different problem, and it is refused below.
    if (result.ok && !ledger.ok) {
      const repaired = await generateJSONWithProvider({
        systemPrompt,
        userPrompt: userPromptFor(ledgerRepairPrompt(ledger)),
        responseSchema: mutationSchema,
        settings,
        isChecker: false,
      });
      const repairedResult = normalizeMutatedProblem(repaired, tier);
      const repairedLedger = verifyLedger(
        (repaired as any)?.ledger?.quantities,
        (repaired as any)?.ledger?.relations
      );
      if (repairedResult.ok && repairedLedger.ok) {
        result = repairedResult;
        ledger = repairedLedger;
      }
    }

    if (!result.ok) {
      // A 4xx rather than a repaired payload: the label is the promise, and the
      // only honest repair is to ask for a different problem.
      return NextResponse.json(
        { error: result.message, refusal: result.reason, checks: result.checks },
        { status: 422 }
      );
    }

    // A declared chain that does not close is a problem the learner cannot
    // finish, and at Tier 3 the declaration is mandatory: an unverified Tier 3
    // multi-physics problem is exactly the one that turns out to be unsolvable
    // under a clock.
    if (!ledger.ok) {
      return NextResponse.json(
        {
          error: `The variant's own arithmetic does not close, so it was not served: ${describeLedgerFailures(ledger)}`,
          refusal: 'inconsistent-numbers',
          ledgerFailures: ledger.failures.map((failure) => failure.detail || failure.label),
        },
        { status: 422 }
      );
    }
    if (tier === 3 && !ledger.verified) {
      return NextResponse.json(
        {
          error:
            'A Tier 3 variant arrived with no declared arithmetic, so its numbers could not be checked. Under a clock an unverifiable multi-physics problem is worse than a hard one, so nothing was served.',
          refusal: 'unverified-numbers',
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      problem: result.problem,
      checks: result.checks,
      ledger: {
        verified: ledger.verified,
        checked: ledger.checks.length,
        failures: ledger.failures.length,
      },
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
    console.error('Error in /api/mutation:', error);
    return NextResponse.json(
      { error: error?.message || 'The constraint matrix could not generate a variant.' },
      { status: 500 }
    );
  }
}
