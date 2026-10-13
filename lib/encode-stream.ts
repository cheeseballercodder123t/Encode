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
    // Three different failures used to collapse into the same opaque message:
    // the server's own JSON error, a platform error page that is not JSON at
    // all (a function killed at its time limit answers with HTML), and a JSON
    // error object with no usable `error` string. Read the body once and report
    // what is actually there — the status included, because on a deployment the
    // status is often the only thing that identifies the failure.
    const raw = await res.text().catch(() => '');
    let detail = '';
    try {
      const parsed = JSON.parse(raw);
      const candidate = parsed?.error;
      if (typeof candidate === 'string') detail = candidate;
      else if (typeof candidate?.message === 'string') detail = candidate.message;
      else if (typeof parsed?.message === 'string') detail = parsed.message;
    } catch {
      // Not JSON: a platform error page. The status is the whole story.
    }
    const status = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`;
    throw new Error(detail || `Schema generation failed (${status}).`);
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
    if (done) {
      carry += decoder.decode();
      break;
    }
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

  if (carry.trim()) {
    try {
      const event: StreamEvent = JSON.parse(carry.trim());
      if (event.type === 'result') result = event.data;
      else if (event.type === 'error') failure = event.message || 'Failed to generate schema';
    } catch {
      // Ignored: incomplete line at EOF
    }
  }

  if (failure) throw new Error(failure);
  if (result === null) {
    // A stream that stops with no `result` and no `error` is the signature of a
    // function killed at its time limit — Vercel cannot send an event on the
    // way out. Saying so is the whole difference between a learner who can act
    // on the failure and one staring at 'Failed to generate schema'.
    const seen = outlines.length;
    throw new Error(
      `The generation stopped before the schema arrived — the server ended the stream after ${seen} stage outline${seen === 1 ? '' : 's'} and never sent a result. This usually means the request outlived the deployment's function time limit. Try again.`
    );
  }
  return result;
}
