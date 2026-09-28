import { NextRequest } from 'next/server';
import { POST as encodePost } from '../route';
import { streamTextWithProvider } from '@/lib/ai-client';
import { createSchemaStream, toStageOutline, type StageOutlineEntry } from '@/lib/stream-schema';

// ─── Streamed encoding: the outline arrives before the schema does ──────────
//
// A full schema generation is one long model response, and the app used to show
// a spinner and a phase ticker that was cycling on a timer — a lie about
// progress, because nothing was actually known until the closing brace landed.
//
// This route does the same work in two passes and reports both honestly:
//
//   1. an OUTLINE pass — a cheap, small request for just the stage list. Its
//      JSON is read as it streams in (`lib/stream-schema.ts`), so each stage
//      title is emitted the moment its braces close. That is real progress:
//      every `outline` event on screen is a stage the schema will contain.
//   2. the FULL schema — the existing `/api/encode` handler, called in-process
//      with the same body, so there is exactly one implementation of the
//      prompts, validation, guided-path branching and fallbacks. Its result is
//      emitted as one final `result` event.
//
// The response is newline-delimited JSON (one event per line) rather than SSE,
// because the client reads it with a plain reader and never needs reconnection
// semantics. Clients that cannot read a stream get the same payload from
// `/api/encode` — this route is an enhancement, never a second source of truth.
//
// The outline pass is strictly advisory: if that call fails, is rate limited,
// or the provider cannot stream, the events simply stop early and the full
// schema still arrives. Nothing here can turn a working generation into a
// failed one.

export const maxDuration = 60;

interface OutlineBody {
  notes?: string;
  mode?: string;
  gear?: number;
  settings?: any;
  file?: any;
  enableGuidedPath?: boolean;
}

/** How many stages to ask the outline pass for, mirroring the gear contract. */
function outlineStageCount(body: OutlineBody): number {
  const notes = typeof body.notes === 'string' ? body.notes : '';
  const words = notes.trim() ? notes.trim().split(/\s+/).length : 0;
  if (body.enableGuidedPath || words > 900) return 4;
  if (body.mode === 'memorization') return 5;
  if (body.gear === 1) return 2;
  if (body.gear === 3) return 5;
  return 3;
}

function buildOutlinePrompt(body: OutlineBody, stages: number): string {
  const mode = body.mode === 'memorization' ? 'memorization' : 'conceptual';
  return `You are naming the stages of a cognitive encoding workout BEFORE it is written.

Return ONE JSON object and nothing else:
{ "topicSummary": "<one short line naming the subject>", "activities": [ { "id": "<id>", "stageNumber": 1, "title": "<stage title>", "framework": "<cognitive science framework>", "cognitiveGoal": "<short purpose>", "templateType": "<template id>" } ] }

- Exactly ${stages} activities.
- Mode: ${mode}.
- Each title must name the MECHANISM being encoded (what the stage makes the learner resolve), never a bare topic label. "The loop that reaches 1,200 mOsm without breaking thermodynamics" is a title; "Loop of Henle" is a label and is wrong.
- Each cognitiveGoal is under 12 words.
- Do not write prompts, paradoxes, scaffolds, visual data or cards. This pass only names the stages.`;
}

function buildOutlineUserPrompt(body: OutlineBody): string {
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  if (notes) return `SOURCE NOTES:\n\n${notes.slice(0, 6000)}\n\nName the stage outline.`;
  if (body.file?.name) {
    return `SOURCE FILE: ${body.file.name} (${body.file.type || 'unknown'}).\nName the stage outline for the material in it.`;
  }
  return 'Name the stage outline for this source.';
}

function ndjson(events: unknown[]): string {
  return events.map((event) => JSON.stringify(event)).join('\n') + '\n';
}

export async function POST(req: NextRequest) {
  let body: OutlineBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  // The encode handler is called with a freshly built request, so the client's
  // body can be read here first (a Request body is single-use).
  const downstream = new NextRequest(req.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: req.signal,
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => {
        try {
          controller.enqueue(encoder.encode(ndjson([event])));
        } catch {
          // The client went away mid-stream; nothing left to report to.
        }
      };

      try {
        send({ type: 'phase', phase: 'Parsing source material…' });

        // ── Pass 1: the outline, read incrementally ────────────────────────
        const stages = outlineStageCount(body);
        const outlines: StageOutlineEntry[] = [];
        try {
          const parser = createSchemaStream({ itemKeys: ['activities', 'guidedModules'] });
          let emitted = 0;
          for await (const chunk of streamTextWithProvider({
            systemPrompt: buildOutlinePrompt(body, stages),
            userPrompt: buildOutlineUserPrompt(body),
            settings: body.settings,
          })) {
            for (const event of parser.push(chunk)) {
              if (event.type === 'field' && event.key === 'topicSummary') {
                send({ type: 'title', title: event.value });
              } else if (event.type === 'item') {
                const outline = toStageOutline(event.value, event.index);
                if (!outline) continue;
                outlines.push(outline);
                emitted += 1;
                send({ type: 'outline', outline, count: emitted, expected: stages });
              }
            }
          }
        } catch (outlineError: any) {
          // Advisory only: the schema does not depend on this pass.
          console.warn('Encode stream outline pass failed:', outlineError?.message || outlineError);
        }

        // ── Pass 2: the real schema, through the existing handler ──────────
        send({
          type: 'phase',
          phase: outlines.length > 0 ? 'Writing the full schema for the outlined stages…' : 'Mapping cognitive scaffolds…',
        });
        send({ type: 'outlineEnd', count: outlines.length });

        const response = await encodePost(downstream);
        const data = await response.json();
        if (!response.ok) {
          send({ type: 'error', message: data?.error || 'Failed to generate schema' });
        } else {
          send({ type: 'result', data });
        }
      } catch (error: any) {
        if (error?.name === 'AbortError') {
          // The learner cancelled: close quietly, the client already moved on.
        } else {
          console.error('Error in /api/encode/stream:', error);
          send({ type: 'error', message: error?.message || 'Failed to generate schema' });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by the consumer.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  });
}
