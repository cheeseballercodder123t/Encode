import type { StageOutlineEntry } from '@/lib/stream-schema';

// ─── Client half of streamed generation ─────────────────────────────────────
//
// `/api/encode/stream` answers with newline-delimited JSON: a `phase` event
// while the outline is being written, one `outline` event per stage as its
// braces close, and a single `result` event carrying the full schema. This
// module turns that into a promise, so the caller still writes
// `const data = await requestEncodedSchema(…)` and the progressive reporting is
// a set of optional callbacks rather than a second code path to maintain.
//
// It also keeps the app honest about where the schema came from: a server that
// answers with plain JSON (an older deployment, a proxy that buffers, or the
// e2e mocks) is read as JSON and simply reports no progress events, because the
// provider has told us nothing yet.

export interface EncodeStreamHandlers {
  /** `topicSummary` as soon as the model has written it. */
  onTitle?: (title: string) => void;
  /** Called after every stage outline that lands, with the running list. */
  onOutline?: (outlines: StageOutlineEntry[], expected: number) => void;
  /** A human-readable pipeline phase. */
  onPhase?: (phase: string) => void;
}

export interface EncodeStreamArgs {
  body: Record<string, unknown>;
  signal?: AbortSignal;
  handlers?: EncodeStreamHandlers;
}

interface StreamEvent {
  type: string;
  phase?: string;
  title?: string;
  outline?: StageOutlineEntry;
  count?: number;
  expected?: number;
  data?: any;
  message?: string;
}

export async function requestEncodedSchema({ body, signal, handlers }: EncodeStreamArgs): Promise<any> {
  const res = await fetch('/api/encode/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({ ...body, stream: true }),
  });

  if (!res.ok) {
    const failure = await res.json().catch(() => null);
    throw new Error(failure?.error || 'Failed to generate schema');
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('ndjson') || !res.body) {
    // Not a stream: the same payload, delivered in one piece.
    return await res.json();
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const outlines: StageOutlineEntry[] = [];
  let carry = '';
  let result: any = null;
  let failure: string | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    carry += decoder.decode(value, { stream: true });

    let newline = carry.indexOf('\n');
    while (newline >= 0) {
      const line = carry.slice(0, newline).trim();
      carry = carry.slice(newline + 1);
      newline = carry.indexOf('\n');
      if (!line) continue;

      let event: StreamEvent;
      try {
        event = JSON.parse(line);
      } catch {
        continue; // A partial line: the next read completes it.
      }

      if (event.type === 'phase' && event.phase) handlers?.onPhase?.(event.phase);
      else if (event.type === 'title' && event.title) handlers?.onTitle?.(event.title);
      else if (event.type === 'outline' && event.outline) {
        outlines.push(event.outline);
        handlers?.onOutline?.([...outlines], event.expected || outlines.length);
      } else if (event.type === 'result') result = event.data;
      else if (event.type === 'error') failure = event.message || 'Failed to generate schema';
    }
  }

  if (failure) throw new Error(failure);
  if (result === null) throw new Error('Failed to generate schema');
  return result;
}
