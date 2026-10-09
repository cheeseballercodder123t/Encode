import { Type } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { generateJSONWithProvider } from '@/lib/ai-client';
import { validateAutopsyNarrative } from '@/lib/ai-output-validation';
import { parseRouteBody, autopsySchema } from '@/lib/api-validation';
import { diagnoseDiscrepancy } from '@/lib/mr-m/autopsy';
import { DISCREPANCY_LABELS } from '@/lib/mr-m/types';

/**
 * The diagnostic error autopsy.
 *
 * The division of labour is the whole point of this route and it is enforced
 * rather than promised: the fracture is DIAGNOSED and MEASURED in TypeScript
 * (`lib/mr-m/autopsy.ts`) before the model is called at all, and the model is
 * handed the finding and asked only to explain it. The plan's rule is that
 * arithmetic is never asked of a model, so there is no number in this prompt
 * for the model to derive — and the validator refuses a narrative that asserts
 * a different magnitude than the one that was computed.
 *
 * A run with no clean signal is refused (422) rather than narrated. "I looked
 * and could not name the fracture" is a real answer; a confident paragraph
 * about a discrepancy nobody measured is the arbitrary noise this feature
 * exists to remove.
 *
 * A model failure is NOT a route failure. The deterministic half — the label,
 * the arithmetic, the step that breaks — is already complete and is returned on
 * its own, with `narrative` empty. The arithmetic is the evidence; the prose is
 * the reading.
 */

const autopsyNarrativeSchema = {
  type: Type.OBJECT,
  properties: {
    narrative: {
      type: Type.STRING,
      description:
        'Why this failure is structural rather than a slip, in one or two sentences, addressed to the learner as "you". Quote the given arithmetic if useful; never compute a new number.',
    },
    correction: {
      type: Type.STRING,
      description:
        'The corrected construction, written out as the line that should have been written instead.',
    },
  },
  required: ['narrative'],
};

/** The learner's answer, not their essay: anything longer is a source to encode. */
const MAX_TEXT_LENGTH = 4000;

export async function POST(req: NextRequest) {
  try {
    const parsed = await parseRouteBody(req, autopsySchema);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }
    const { learnerText, expectedText, sourceText, topic, settings } = parsed.data;

    const learner = typeof learnerText === 'string' ? learnerText.trim() : '';
    if (!learner) {
      return NextResponse.json(
        { error: 'There is nothing to autopsy yet — submit the answer that missed.' },
        { status: 400 }
      );
    }
    if (learner.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `That is ${learner.length} characters. The autopsy reads an answer, not a document.` },
        { status: 400 }
      );
    }

    const expected = typeof expectedText === 'string' ? expectedText.trim() : '';
    const source = typeof sourceText === 'string' ? sourceText.slice(0, MAX_TEXT_LENGTH) : '';

    const reading = diagnoseDiscrepancy({
      learnerText: learner,
      expectedText: expected,
      sourceText: source,
    });

    if (!reading) {
      // Deliberately a 4xx with the engine's own wording: the answer missed, and
      // no structural or numeric signature explains it. Reporting a server
      // failure would invite a retry that cannot succeed, and narrating around
      // the gap would invent a diagnosis.
      return NextResponse.json(
        {
          error:
            'No structural fracture could be named from these two answers, so the autopsy stays silent rather than guessing. A committed reformulation of the question usually gives it something to read.',
          refusal: 'no-signal',
        },
        { status: 422 }
      );
    }

    const allowedFactors = reading.terms.length > 0 ? [reading.terms[0].folded] : [];

    const systemPrompt = `You are the Autopsy Narrator. The structural fracture below was already DIAGNOSED AND MEASURED by a deterministic engine. Your job is to explain it — never to find it, and never to measure it.

THE DIAGNOSIS (computed, and not yours to change):
  kind: [ ${DISCREPANCY_LABELS[reading.kind]} ]
  what it means structurally: ${reading.structuralReason}
  the arithmetic: ${reading.arithmeticReveal || '(no numeric reveal for this fracture)'}
  where the chain breaks: ${reading.whereItBreaks}

RULES:
1. NEVER do arithmetic. Every number you need is above. Do not derive, round or invent a magnitude. If you state the size of the error, it is exactly the factor or sign shown in "the arithmetic" line, no other.
2. Explain the MECHANISM, not the verdict. "This is wrong because you were careless" is the sentence this panel exists to replace.
3. If the arithmetic line is empty, do not describe a magnitude at all.
4. Address the learner directly as "you". No preamble, no praise, no restating the question.
5. "correction" is the construction that holds, written out as the line that should have been written instead — not advice about what to do differently.`;

    const userPrompt = `TOPIC: ${typeof topic === 'string' && topic.trim() ? topic.trim() : 'Untitled'}

WHAT THEY ANSWERED:
${learner}

WHAT HOLDS:
${expected || '(no exemplar was recorded for this stage)'}

SOURCE CONTEXT:
${source || '(none)'}

Explain the fracture above. Output strictly valid JSON.`;

    try {
      const parsed = await generateJSONWithProvider({
        systemPrompt,
        userPrompt,
        responseSchema: autopsyNarrativeSchema,
        settings,
        isChecker: true,
      });

      const result = validateAutopsyNarrative(parsed, allowedFactors);
      return NextResponse.json({
        ...reading,
        narrative: result.narrative.narrative,
        correction: result.narrative.correction,
        ...(result.ok ? {} : { refusal: result.refused, narrativeError: result.message }),
      });
    } catch (narrativeError: any) {
      // The measured half stands on its own — it is the part that cannot be
      // wrong, and losing it because the prose call failed would be backwards.
      console.warn('Autopsy narrative failed; returning the computed reading:', narrativeError?.message);
      return NextResponse.json({
        ...reading,
        narrative: '',
        correction: '',
        narrativeError: 'The written explanation could not be generated. The measured diagnosis above stands.',
      });
    }
  } catch (error: any) {
    console.error('Error in /api/autopsy:', error);
    return NextResponse.json(
      { error: error?.message || 'The autopsy could not run.' },
      { status: 500 }
    );
  }
}
