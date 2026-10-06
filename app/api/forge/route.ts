import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateJSONWithProvider } from '@/lib/ai-client';
import { parseRouteBody } from '@/lib/api-validation';
import {
  buildCondenseSystemPrompt,
  buildCondenseUserPrompt,
  buildMoreCardsSystemPrompt,
  buildMoreCardsUserPrompt,
  buildSegregationSystemPrompt,
  buildSegregationUserPrompt,
  resolveSegregationSections,
  segregationSchema,
} from '@/lib/services/segregation';
import {
  ForgeMergeInput,
  ForgeSectionCounts,
  ForgeSource,
  ForgeSourceKind,
  buildCoverageReport,
  countReportSections,
  dropKnownCards,
  isEmptyForgeReport,
  mergeSegregationReports,
  normalizeSegregationReport,
  sourceYield,
  totalReportCards,
} from '@/lib/services/forge';
import { extractYouTubeId, fetchYouTubeMeta } from '@/lib/services/youtubeTranscript';
import {
  isTranscribableMedia,
  readYouTubeTranscriptDetailed,
  transcribeAudio,
} from '@/lib/services/transcript';

// ─── The Forge : sources in, deck out, no encoding ──────────────────────────
//
// This route exists for the case where the learner does not want a workout.
// Each source is run through the SAME card contract the segregate step uses,
// then everything is merged into one deduped report the export modals already
// understand. Nothing here creates stages, XP or a session.
//
// Three things are worth knowing about the source handling:
//   · a video with no readable captions is transcribed from its own audio (only
//     when there are no captions — captions are free and better), and if that
//     is impossible the source says exactly which of the two it was;
//   · an uploaded recording is transcribed the same way, which is the reliable
//     half of the same feature;
//   · sources are cut into cards THREE AT A TIME, not one after another. Twelve
//     sources used to be twelve sequential model calls under a 300s ceiling,
//     which is how a big ingest hit the timeout cliff; three in flight keeps
//     the same ceiling while cutting wall-clock to roughly a third.
//
// Two passes can extend a deck the learner already has:
//   · `more`     — the deck came back too small, so the SAME sources are re-read
//                  with every existing front handed to the model as a
//                  do-not-repeat list; only genuinely new cards come back;
//   · `retry`    — one source failed. Re-running all of them would re-pay for
//                  the ones that worked, so this re-forges ONLY the named
//                  sources and returns only their new cards.
//
// Response: with `stream: true` the route answers with newline-delimited JSON
// events (`sourceStart`, `source`, `phase`, `done`) so each source's result is
// on screen the moment it lands; otherwise it answers with the merged JSON, the
// same payload the `done` event carries.

export const maxDuration = 300;

interface ForgeSourcePayload {
  id?: string;
  kind?: string;
  label?: string;
  notes?: string;
  url?: string;
  file?: { name?: string; type?: string; size?: number; base64Data?: string } | null;
}

const MAX_SOURCES = 12;
/** Fronts sent back so the "more" pass can avoid repeating them. */
const MAX_EXISTING_FRONTS = 400;
/** Sources cut into cards at the same time. */
const SOURCE_CONCURRENCY = 3;

/**
 * What the route is being asked for:
 *   · forge    — many sources in, one deck out (the original behaviour);
 *   · more     — the deck came back too small, so extend it from the same sources;
 *   · retry    — one source failed; re-forge just that source;
 *   · condense — the deck came back too long, so fold overlapping cards together.
 */
type ForgeMode = 'forge' | 'more' | 'retry' | 'condense';

interface ResolvedSourcePayload {
  id?: string;
  label?: string;
  notes?: string;
}

interface SourceOutcome {
  input: ForgeMergeInput;
  /** What this source's text resolved to, for a later reuse pass. */
  resolved?: ResolvedSourcePayload;
  words: number;
}

/** One event on the NDJSON stream when `stream: true`. */
type ForgeEvent =
  | { type: 'sourceStart'; id: string; label: string }
  | { type: 'source'; source: ForgeMergeInput['source'] & Record<string, unknown>; counts: ForgeSectionCounts }
  | { type: 'phase'; phase: string }
  | { type: 'done'; payload: Record<string, unknown> }
  | { type: 'error'; message: string };

function cleanSource(raw: ForgeSourcePayload, index: number): ForgeSource {
  const kind: ForgeSourceKind =
    raw.kind === 'file' || raw.kind === 'youtube' ? raw.kind : 'text';
  return {
    id: (raw.id || `src_${index + 1}`).slice(0, 60),
    kind,
    label: (raw.label || '').slice(0, 120) || `Source ${index + 1}`,
  };
}

function base64ToBytes(base64: string): Uint8Array {
  const buffer = Buffer.from(base64, 'base64');
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function countWords(text: string): number {
  const matches = (text || '').match(/\S+/g);
  return matches ? matches.length : 0;
}

function totalCounts(counts: ForgeSectionCounts): number {
  return counts.facts + counts.mechanisms + counts.drills + counts.examples;
}

export async function POST(req: NextRequest) {
  // Shape check first: mode/topic/include are typed, sources are length-bounded
  // strings, report is a passthrough (it is a full deck the client already owns
  // and the route re-normalizes it below). Body stays untyped afterwards since
  // the three modes read different slices of it.
  const parsed = await parseRouteBody(
    req,
    z
      .object({
        mode: z.enum(['forge', 'more', 'retry', 'condense']).optional(),
        topic: z.string().max(300).optional(),
        include: z.record(z.string(), z.boolean()).optional(),
        sources: z
          .array(
            z.object({
              id: z.string().max(200).optional(),
              name: z.string().max(300).optional(),
              kind: z.string().max(60).optional(),
              content: z.string().max(200_000).optional(),
            })
          )
          .max(12)
          .optional(),
        only: z.array(z.string().max(200)).max(12).optional(),
        settings: z.any().optional(),
        report: z.any().optional(),
        known: z.array(z.string().max(400)).max(5_000).optional(),
      })
      .passthrough()
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const body: any = parsed.data;

  const settings = body?.settings;
  const mode: ForgeMode =
    body?.mode === 'more'
      ? 'more'
      : body?.mode === 'retry'
        ? 'retry'
        : body?.mode === 'condense'
          ? 'condense'
          : 'forge';
  const topic = typeof body?.topic === 'string' ? body.topic : '';
  const want = resolveSegregationSections(body?.include);

  // ── Condense: no sources, no raw material — the deck the learner already
  // has is folded down by an editor pass. Merging is the only allowed move. ──
  if (mode === 'condense') {
    const deck = normalizeSegregationReport(body?.report, 'condense');
    if (!deck || isEmptyForgeReport(deck)) {
      return NextResponse.json({ error: 'There is nothing to condense yet — forge a deck first.' }, { status: 400 });
    }
    try {
      const result = await generateJSONWithProvider({
        systemPrompt: buildCondenseSystemPrompt(),
        userPrompt: buildCondenseUserPrompt(deck),
        responseSchema: segregationSchema,
        settings,
        isChecker: false,
      });
      const condensed = normalizeSegregationReport(result, 'condense');
      if (!condensed) {
        return NextResponse.json(
          { error: 'The condense pass returned no usable cards — your deck is unchanged.' },
          { status: 502 }
        );
      }
      return NextResponse.json({
        mode,
        topic: deck.topic,
        report: condensed,
        total: totalReportCards(condensed),
        before: totalReportCards(deck),
        counts: countReportSections(condensed),
        sources: [],
        dropped: 0,
        contradictions: [],
        resolved: [],
      });
    } catch (error: any) {
      console.error('Forge condense failed:', error);
      return NextResponse.json(
        { error: error?.message || 'The condense pass failed — your deck is unchanged.' },
        { status: 500 }
      );
    }
  }

  // ── Retry: only the sources the learner named. Everything else was already
  // paid for, and re-running it would re-bill the transcripts too. ───────────
  const only = Array.isArray(body?.only)
    ? new Set(body.only.filter((id: any) => typeof id === 'string'))
    : null;

  const allSources: ForgeSourcePayload[] = Array.isArray(body?.sources)
    ? body.sources.slice(0, MAX_SOURCES)
    : [];
  const rawSources = only ? allSources.filter((raw, index) => only.has(cleanSource(raw, index).id)) : allSources;

  if (rawSources.length === 0) {
    return NextResponse.json(
      { error: only ? 'That source is no longer in the forge — add it again.' : 'Add at least one source to forge a deck.' },
      { status: 400 }
    );
  }

  // "Generate more" / "retry" send the fronts already in the deck, and the
  // source text it already paid to resolve — a transcript costs a model call to
  // reproduce, so a second pass over the same lecture reuses it rather than
  // re-running.
  const existingFronts: string[] = Array.isArray(body?.existing)
    ? body.existing.filter((v: any) => typeof v === 'string' && v.trim()).slice(0, MAX_EXISTING_FRONTS)
    : [];
  const reused = new Map<string, ResolvedSourcePayload>();
  if (Array.isArray(body?.resolved)) {
    for (const entry of body.resolved as ResolvedSourcePayload[]) {
      if (!entry || typeof entry !== 'object') continue;
      const id = typeof entry.id === 'string' ? entry.id : '';
      const notes = typeof entry.notes === 'string' ? entry.notes.trim() : '';
      if (!id || !notes) continue;
      reused.set(id, { id, label: entry.label, notes });
    }
  }

  /**
   * Resolves one source to text and cuts it into cards. Every source runs
   * through here, in whatever order the worker pool picks it up, so the only
   * shared state it touches is its own arguments.
   */
  const runSource = async (raw: ForgeSourcePayload, i: number): Promise<SourceOutcome> => {
    const source = cleanSource(raw, i);
    let notes = typeof raw.notes === 'string' ? raw.notes.trim() : '';
    const file = raw.file && raw.file.base64Data && raw.file.type ? raw.file : null;
    let label = source.label;
    let provenance = '';
    let resolvedForReuse: ResolvedSourcePayload | undefined;

    // ── YouTube: captions first, and only then the audio track ──────────────
    if (source.kind === 'youtube') {
      const cached = reused.get(source.id);
      if (cached?.notes) {
        // Resolved once already this session: reuse that transcript verbatim.
        label = cached.label || source.label;
        notes = cached.notes;
        provenance = 'reused the transcript from this session';
        resolvedForReuse = { id: source.id, label, notes };
      } else {
        const videoId = extractYouTubeId(raw.url || raw.notes || '');
        if (!videoId) {
          return {
            input: { source, report: null, note: 'That is not a YouTube video URL or id.' },
            words: 0,
          };
        }
        const [meta, transcript] = await Promise.all([
          fetchYouTubeMeta(videoId),
          readYouTubeTranscriptDetailed(videoId),
        ]);
        label = meta.title ? `${meta.title}${meta.author ? ` — ${meta.author}` : ''}` : `youtube:${videoId}`;

        if (transcript.status !== 'ok') {
          // Nothing readable means no source text. Generating "cards" from a
          // title would be invention, so the source is reported as unusable and
          // the reason says which problem it actually was.
          return {
            input: {
              source: { ...source, label },
              report: null,
              note: `${transcript.reason} — paste the notes or upload the recording instead.`,
            },
            words: 0,
          };
        }

        provenance =
          transcript.provenance === 'transcribed'
            ? 'transcribed from the audio (no captions)'
            : transcript.provenance === 'auto'
              ? 'auto-generated captions'
              : `captions (${transcript.language})`;
        notes = `${meta.title ? `VIDEO: ${meta.title}\n` : ''}TRANSCRIPT WITH TIMESTAMPS:\n${transcript.text}`;
        resolvedForReuse = { id: source.id, label, notes };
      }
    }

    // ── Uploaded audio/video: transcribe instead of handing a model raw bytes ─
    else if (source.kind === 'file' && file && isTranscribableMedia(file.type || '', file.name || '')) {
      const cached = reused.get(source.id);
      if (cached?.notes) {
        // Re-transcribing a recording costs real money and minutes; a follow-up
        // pass over the same source reuses the transcript it already has.
        label = cached.label || label;
        notes = cached.notes;
        provenance = 'reused the transcript from this session';
        resolvedForReuse = { id: source.id, label, notes };
      } else {
        const result = await transcribeAudio(
          base64ToBytes(file.base64Data as string),
          file.type || 'audio/mpeg',
          file.name || 'recording.mp3'
        );
        if (!result.ok) {
          return {
            input: {
              source: { ...source, label },
              report: null,
              note: `${file.name || 'the recording'} could not be transcribed: ${result.reason}.`,
            },
            words: 0,
          };
        }
        provenance = 'transcribed from the uploaded recording';
        notes = `RECORDING TRANSCRIPT (${file.name || 'recording'}):\n${result.text}`;
        resolvedForReuse = { id: source.id, label, notes };
      }
    }

    if (source.kind === 'text' && !notes) {
      return { input: { source, report: null, note: 'Empty text source.' }, words: 0 };
    }
    if (source.kind === 'file' && !file && !notes) {
      return { input: { source, report: null, note: 'The file attachment did not arrive.' }, words: 0 };
    }

    // A transcribed recording is already text: the model never needs the bytes.
    const inlineFile = file && !notes.startsWith('RECORDING TRANSCRIPT') ? file : null;
    const words = countWords(notes);

    // "Retry" re-forges a failed source from scratch, so it uses the FIRST-pass
    // contract, not the extension contract — the model is being asked for the
    // cards this source should always have produced.
    const useExtensionPrompt = mode === 'more';

    try {
      const result = await generateJSONWithProvider({
        systemPrompt: useExtensionPrompt
          ? buildMoreCardsSystemPrompt(want, label)
          : buildSegregationSystemPrompt(want, label),
        userPrompt: useExtensionPrompt
          ? buildMoreCardsUserPrompt({
              notes: notes || undefined,
              hasFile: Boolean(inlineFile),
              fileName: inlineFile?.name,
              fileType: inlineFile?.type,
              sourceLabel: label,
              existing: existingFronts,
            })
          : buildSegregationUserPrompt({
              notes: notes || undefined,
              hasFile: Boolean(inlineFile),
              fileName: inlineFile?.name,
              fileType: inlineFile?.type,
              sourceLabel: label,
            }),
        responseSchema: segregationSchema,
        settings,
        isChecker: false,
        file: inlineFile
          ? {
              name: inlineFile.name || 'source',
              type: inlineFile.type as string,
              size: inlineFile.size || 0,
              base64Data: inlineFile.base64Data as string,
            }
          : null,
      });
      const report = normalizeSegregationReport(result, source.id);
      return {
        input: {
          source: { ...source, label },
          report,
          words,
          note: report ? provenance || undefined : 'The model returned no usable cards for this source.',
        },
        resolved: resolvedForReuse,
        words,
      };
    } catch (error: any) {
      console.error(`Forge source ${source.id} failed:`, error);
      return {
        input: {
          source: { ...source, label },
          report: null,
          words,
          note: error?.message || 'Generation failed for this source.',
        },
        resolved: resolvedForReuse,
        words,
      };
    }
  };

  /** Runs every source three at a time, reporting each one as it lands. */
  const runSources = async (emit: (event: ForgeEvent) => void): Promise<SourceOutcome[]> => {
    const outcomes = new Array<SourceOutcome>(rawSources.length);
    let cursor = 0;
    const worker = async () => {
      for (;;) {
        const i = cursor;
        cursor += 1;
        if (i >= rawSources.length) return;
        const source = cleanSource(rawSources[i], i);
        emit({ type: 'sourceStart', id: source.id, label: source.label });
        const outcome = await runSource(rawSources[i], i);
        outcomes[i] = outcome;
        emit({
          type: 'source',
          source: { ...outcome.input.source, status: outcome.input.report ? 'ok' : 'failed' },
          counts: outcome.input.report ? countReportSections(outcome.input.report) : { facts: 0, mechanisms: 0, drills: 0, examples: 0 },
        });
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(SOURCE_CONCURRENCY, rawSources.length) }, () => worker())
    );
    return outcomes;
  };

  const assemble = (outcomes: SourceOutcome[]): Record<string, unknown> => {
    const inputs = outcomes.map((outcome) => outcome.input);
    const resolvedOut: ResolvedSourcePayload[] = [];
    const seenResolved = new Set<string>();
    for (const outcome of outcomes) {
      const entry = outcome.resolved;
      if (!entry?.id || !entry.notes || seenResolved.has(entry.id)) continue;
      seenResolved.add(entry.id);
      resolvedOut.push(entry);
    }

    // An extension pass extends ONE deck, so the cross-source contradiction
    // sweep stays out of it: two cards from the same source are not two sources
    // that disagree, and the deck this batch is joining was already checked.
    const isExtension = mode === 'more' || mode === 'retry';
    const merged = mergeSegregationReports(inputs, topic, isExtension ? { detectConflicts: false } : undefined);

    if (isExtension) {
      // These passes return ONLY the additional cards: the deck on screen is
      // not re-sent, so the client appends to it instead of replacing it.
      // Seeded with the RAW fronts, not their normalized keys: the duplicate
      // index needs the original text to tell "the same card, re-worded" apart
      // from "the same sentence with a different number in it".
      const known = new Set(existingFronts.filter(Boolean));
      const { report, added, dropped } = dropKnownCards(merged.report, known);
      const counts = countReportSections(report);
      return {
        mode,
        topic: merged.report.topic,
        report,
        sources: merged.sources,
        dropped: merged.dropped + dropped,
        total: added,
        counts,
        contradictions: [],
        resolved: resolvedOut,
        coverage: buildCoverageReport(counts, want, merged.sources),
      };
    }

    return {
      mode,
      topic: merged.report.topic,
      report: merged.report,
      sources: merged.sources,
      dropped: merged.dropped,
      total: merged.total,
      counts: merged.counts,
      contradictions: merged.contradictions,
      // What each source's text actually resolved to, so a follow-up "generate
      // more" pass never has to re-fetch captions or re-transcribe a recording.
      resolved: resolvedOut,
      // Which sections actually received cards, and which came back empty.
      coverage: buildCoverageReport(merged.counts, want, merged.sources),
    };
  };

  // ── Non-streaming callers get the merged JSON, exactly as before ───────────
  if (body?.stream !== true) {
    const payload = assemble(await runSources(() => {}));
    return NextResponse.json(payload);
  }

  // ── Streaming: each source's result is reported as it lands ────────────────
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ForgeEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        } catch {
          // The client left; there is nothing left to report to.
        }
      };
      try {
        const modeLabel =
          mode === 'more' ? 'Mining the same sources for cards the deck is missing…' : mode === 'retry' ? 'Re-forging the failed source…' : 'Cutting sources into cards…';
        emit({ type: 'phase', phase: modeLabel });
        const outcomes = await runSources(emit);
        emit({ type: 'phase', phase: 'Merging, deduping and checking for source conflicts…' });
        emit({ type: 'done', payload: assemble(outcomes) });
      } catch (error: any) {
        console.error('Forge stream failed:', error);
        emit({ type: 'error', message: error?.message || 'The forge failed. Try again.' });
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
    },
  });
}
