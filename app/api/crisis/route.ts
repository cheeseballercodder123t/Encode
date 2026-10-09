import { Type } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { generateJSONWithProvider } from '@/lib/ai-client';
import { parseRouteBody, crisisSchema } from '@/lib/api-validation';
import {
  buildTriagePlan,
  mergeCrisisReads,
  runwayAction,
  splitCrisisItems,
  ASSUMED_SCORE_PCT,
} from '@/lib/crisis/buffer';

/**
 * The executive-function emergency triage buffer.
 *
 * The WEAK model runs this one, because the operation is reading, not reasoning:
 * pull a task name, a weight and a deadline phrase out of a panicking dump. The
 * arithmetic that the whole intervention rests on — the marginal grade risk that
 * makes a freeze defensible — is computed in TypeScript from the numbers the
 * model found, and a weight the model invents never survives, because
 * `mergeCrisisReads` only accepts a field the deterministic reading did not
 * already have and `gradeRiskPct` refuses a weight it cannot use.
 *
 * A model failure is not a route failure. The deterministic split and parse
 * stand on their own, and the plan is built from them with `readError` set: the
 * night this feature exists for is not the night to refuse service because a
 * provider is down.
 */

const crisisReadSchema = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      description: 'Exactly one read per numbered item. Never invent an index that was not given.',
      items: {
        type: Type.OBJECT,
        properties: {
          index: {
            type: Type.INTEGER,
            description: 'The integer index of the item being read, copied verbatim.',
          },
          title: {
            type: Type.STRING,
            description: 'The task, named cleanly and briefly (under 12 words).',
          },
          weightPct: {
            type: Type.NUMBER,
            description:
              'The share of the final grade this is worth, as a number of percent, ONLY when the dump states it. Omit entirely when it does not.',
          },
          dueLabel: {
            type: Type.STRING,
            description:
              'The deadline exactly as the dump writes it ("due tomorrow", "Oct 14"). Omit entirely when the dump gives none.',
          },
          ungraded: {
            type: Type.BOOLEAN,
            description: 'True only when the dump itself says this carries no grade.',
          },
        },
        required: ['index'],
      },
    },
  },
  required: ['items'],
};

/** A dump is a night's backlog, not a transcript. */
const MAX_DUMP_LENGTH = 6000;

export async function POST(req: NextRequest) {
  try {
    const parsed = await parseRouteBody(req, crisisSchema);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }
    const { dump, scorePct, settings } = parsed.data;

    const text = typeof dump === 'string' ? dump.trim() : '';
    if (!text) {
      return NextResponse.json(
        { error: 'Dump the backlog first — everything that is due, in your own words and any order.' },
        { status: 400 }
      );
    }
    if (text.length > MAX_DUMP_LENGTH) {
      return NextResponse.json(
        { error: `That is ${text.length} characters. Paste the list, not the essay.` },
        { status: 400 }
      );
    }

    const lines = splitCrisisItems(text);
    if (lines.length === 0) {
      return NextResponse.json(
        { error: 'Nothing readable was found in that dump. One task per line is enough.' },
        { status: 400 }
      );
    }

    const now = Date.now();
    const assumedScore =
      typeof scorePct === 'number' && Number.isFinite(scorePct)
        ? Math.min(100, Math.max(0, scorePct))
        : ASSUMED_SCORE_PCT;

    const systemPrompt = `You are the Triage Reader. The learner is behind and panicking. You do not reassure them and you do not sequence anything — you only READ the list they dumped and report what is in it, so a deterministic engine can rank it.

For every numbered item:
  · "title" — the task, named cleanly in under 12 words.
  · "weightPct" — the share of the final grade, as a NUMBER OF PERCENT, and ONLY when the dump states it. "Worth 10%" is 10. "10 points" is NOT a percentage — omit. If no weight is stated, OMIT THE FIELD ENTIRELY. Do not estimate, do not infer one from the task's size or type, and do not guess.
  · "dueLabel" — the deadline exactly as written. Omit when there is none. Never compute a date.
  · "ungraded" — true only when the dump itself says the item carries no grade ("optional", "not graded", "practice").

RULES:
1. One read per index given, ascending, using the exact indices. Never invent or skip an index.
2. Never do arithmetic and never state a number the dump does not contain.
3. A missing weight is the correct answer for most items. An invented weight would let the engine freeze the wrong work.`;

    const numbered = lines
      .map((line, index) => `[${index}] ${line.replace(/\s+/g, ' ')}`)
      .join('\n');

    const userPrompt = `ITEMS (${lines.length}):\n${numbered}\n\nRead every item above and output strictly valid JSON.`;

    let tasks;
    let readError: string | undefined;

    try {
      const parsed = await generateJSONWithProvider({
        systemPrompt,
        userPrompt,
        responseSchema: crisisReadSchema,
        settings,
        isChecker: true,
      });
      tasks = mergeCrisisReads(lines, parsed?.items, now);
    } catch (error: any) {
      // The split and the parse are the deterministic half and they are already
      // done; losing the ranking because the reader is unavailable would be
      // backwards on exactly the night this exists for.
      console.warn('Triage reader failed; using the deterministic parse:', error?.message);
      readError = 'The list could not be read line by line, so it was parsed from its own wording.';
      tasks = mergeCrisisReads(lines, [], now);
    }

    const plan = buildTriagePlan(tasks, { now, scorePct: assumedScore });

    return NextResponse.json({
      ...plan,
      assumedScorePct: assumedScore,
      runway: runwayAction(plan),
      ...(readError ? { readError } : {}),
    });
  } catch (error: any) {
    console.error('Error in /api/crisis:', error);
    return NextResponse.json(
      { error: error?.message || 'The backlog could not be triaged.' },
      { status: 500 }
    );
  }
}
