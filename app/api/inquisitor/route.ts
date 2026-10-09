import { NextRequest, NextResponse } from 'next/server';
import { generateJSONWithProvider } from '@/lib/ai-client';
import { validateInquisitorRead } from '@/lib/ai-output-validation';
import {
  INQUISITOR_SYSTEM_PROMPT,
  buildInquisitorUserPrompt,
  inquisitorSchema,
} from '@/lib/inquisitor/contract';
// The body schema is imported under an alias: this file's own
// `inquisitorSchema` is the model's RESPONSE schema.
import { parseRouteBody, inquisitorSchema as inquisitorBodySchema } from '@/lib/api-validation';

/**
 * The Question-First Inquisitor route.
 *
 * One claim in, one verdict out. There is no conversation state and no history:
 * every call is a fresh interrogation of a sentence, which is what makes the
 * same endpoint serve "is this analogy rigorous?" and "wait, why does Ca(OH)2
 * end in -ide?" without a session model.
 *
 * A read the parser refuses comes back as 422 with the reason, never as a
 * repaired payload — see `validateInquisitorRead`. The client shows the reason;
 * a made-up verdict would be worse than a visible failure.
 */

/** Claims are sentences, not essays: anything longer is a source to encode. */
const MAX_CLAIM_LENGTH = 1200;

export async function POST(req: NextRequest) {
  try {
    const validatedBody = await parseRouteBody(req, inquisitorBodySchema);
    if (!validatedBody.ok) {
      return NextResponse.json({ error: validatedBody.error }, { status: validatedBody.status });
    }
    const { claim, topic, domain, contextSnippet, settings } = validatedBody.data;

    const text = typeof claim === 'string' ? claim.trim() : '';
    if (!text) {
      return NextResponse.json(
        { error: 'State the claim first — the inquisitor interrogates a sentence, not a topic.' },
        { status: 400 }
      );
    }
    if (text.length > MAX_CLAIM_LENGTH) {
      return NextResponse.json(
        { error: `That is ${text.length} characters. Interrogate one claim at a time.` },
        { status: 400 }
      );
    }

    const context = {
      topic: typeof topic === 'string' ? topic : undefined,
      domain: typeof domain === 'string' ? domain : undefined,
      contextSnippet: typeof contextSnippet === 'string' ? contextSnippet.slice(0, 4000) : undefined,
    };

    const parsed = await generateJSONWithProvider({
      systemPrompt: INQUISITOR_SYSTEM_PROMPT,
      userPrompt: buildInquisitorUserPrompt(text, context),
      responseSchema: inquisitorSchema,
      settings,
      isChecker: true,
    });

    // The learner's own sentence travels with the read, so the fidelity gate can
    // refuse a verdict about a sentence they did not write before it ever
    // reaches them.
    const result = validateInquisitorRead(parsed, text);
    if (!result.ok) {
      // Deliberately a 4xx with the gate's own wording: the model answered, and
      // the answer is not shippable. Reporting it as a server failure would
      // invite a retry loop that cannot succeed.
      return NextResponse.json({ error: result.message, refusal: result.reason }, { status: 422 });
    }

    return NextResponse.json({ ...result.read, downgraded: result.downgraded });
  } catch (error: any) {
    console.error('Error in /api/inquisitor:', error);
    return NextResponse.json(
      { error: error?.message || 'The claim could not be interrogated.' },
      { status: 500 }
    );
  }
}
