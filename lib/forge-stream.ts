import type { ForgeSectionCounts, ForgeSourceKind } from '@/lib/services/forge';

// ─── Client half of the streamed forge ──────────────────────────────────────
//
// The forge cuts sources into cards three at a time and reports each one as it
// lands, so a twelve-source ingest stops being a blank panel for three minutes.
// `/api/forge` answers with newline-delimited JSON when the caller asks to
// stream (`sourceStart`, `source`, `phase`, `done`) and with the merged payload
// otherwise; this reader hides the difference, so every call site stays
// `const data = await readForgeResponse(res, { onSource })`.
//
// The only per-source facts available at that point are the ones that need no
// merge: the source's own card counts, its status, and its words-in→cards-out
// note. The merged deck (deduped counts, conflict cards) arrives in `done`,
// which is what the panel finally renders.

export interface LiveForgeSource {
  id: string;
  label: string;
  kind: ForgeSourceKind;
  status: 'ok' | 'failed';
  counts: ForgeSectionCounts;
  note?: string;
  words?: number;
}

export interface ForgeStreamHandlers {
  /** A source was picked up by a worker (so the row can say it is running). */
  onSourceStart?: (id: string, label: string) => void;
  /** A source finished. */
  onSource?: (source: LiveForgeSource) => void;
  /** A human-readable pipeline phase. */
  onPhase?: (phase: string) => void;
}

export async function readForgeResponse(
  res: Response,
  handlers: ForgeStreamHandlers = {}
): Promise<any> {
  const contentType = res.headers.get('content-type') || '';

  if (!res.ok) {
    const failure = await res.json().catch(() => null);
    throw new Error(failure?.error || 'The forge could not build a deck.');
  }

  if (!contentType.includes('ndjson') || !res.body) {
    return await res.json();
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let carry = '';
  let payload: any = null;
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

      let event: any;
      try {
        event = JSON.parse(line);
      } catch {
        continue; // A partial line: the next read completes it.
      }

      if (event.type === 'phase' && event.phase) handlers.onPhase?.(event.phase);
      else if (event.type === 'sourceStart') handlers.onSourceStart?.(event.id, event.label);
      else if (event.type === 'source' && event.source) {
        handlers.onSource?.({
          id: event.source.id,
          label: event.source.label,
          kind: event.source.kind,
          status: event.source.status === 'ok' ? 'ok' : 'failed',
          counts: event.counts || { facts: 0, mechanisms: 0, drills: 0, examples: 0 },
          note: event.source.note,
          words: event.source.words,
        });
      } else if (event.type === 'done') payload = event.payload;
      else if (event.type === 'error') failure = event.message || 'The forge failed. Try again.';
    }
  }

  if (carry.trim()) {
    try {
      const event: any = JSON.parse(carry.trim());
      if (event.type === 'done') payload = event.payload;
      else if (event.type === 'error') failure = event.message || 'The forge failed. Try again.';
    } catch {
      // Ignored: incomplete line at EOF
    }
  }

  if (failure) throw new Error(failure);
  if (!payload) throw new Error('The forge returned no deck.');
  return payload;
}
