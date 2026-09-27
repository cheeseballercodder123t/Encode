import { NextRequest, NextResponse } from 'next/server';
import { generateJSONWithProvider } from '@/lib/ai-client';
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
  ForgeSource,
  ForgeSourceKind,
  countReportSections,
  dedupeKey,
  dropKnownCards,
  isEmptyForgeReport,
  mergeSegregationReports,
  normalizeSegregationReport,
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
// Two things are worth knowing about the source handling:
//   · a video with no readable captions is transcribed from its own audio (only
//     when there are no captions — captions are free and better), and if that
//     is impossible the source says exactly which of the two it was;
//   · an uploaded recording is transcribed the same way, which is the reliable
//     half of the same feature.
//
// Merging also reports cross-source contradictions (see lib/services/forge.ts):
// a deck that quietly keeps whichever claim arrived first teaches a coin flip.

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

/**
 * What the route is being asked for:
 *   · forge    — many sources in, one deck out (the original behaviour);
 *   · more     — the deck came back too small, so extend it from the same sources;
 *   · condense — the deck came back too long, so fold overlapping cards together.
 */
type ForgeMode = 'forge' | 'more' | 'condense';

interface ResolvedSourcePayload {
  id?: string;
  label?: string;
  notes?: string;
}

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

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const settings = body?.settings;
  const mode: ForgeMode = body?.mode === 'more' ? 'more' : body?.mode === 'condense' ? 'condense' : 'forge';
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

  const rawSources: ForgeSourcePayload[] = Array.isArray(body?.sources) ? body.sources.slice(0, MAX_SOURCES) : [];
  if (rawSources.length === 0) {
    return NextResponse.json({ error: 'Add at least one source to forge a deck.' }, { status: 400 });
  }

  // "Generate more" sends the fronts already in the deck, and the source text
  // it already paid to resolve — a transcript costs a model call to reproduce,
  // so a second pass over the same lecture reuses it rather than re-running.
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

  const resolved: ResolvedSourcePayload[] = [];
  const inputs: ForgeMergeInput[] = [];

  for (let i = 0; i < rawSources.length; i++) {
    const raw = rawSources[i];
    const source = cleanSource(raw, i);
    let notes = typeof raw.notes === 'string' ? raw.notes.trim() : '';
    const file = raw.file && raw.file.base64Data && raw.file.type ? raw.file : null;
    let label = source.label;
    let provenance = '';

    // ── YouTube: captions first, and only then the audio track ──────────────
    if (source.kind === 'youtube') {
      const cached = reused.get(source.id);
      if (cached?.notes) {
        // Resolved once already this session: reuse that transcript verbatim.
        label = cached.label || source.label;
        notes = cached.notes;
        provenance = 'reused the transcript from this session';
        resolved.push({ id: source.id, label, notes });
      } else {
        const videoId = extractYouTubeId(raw.url || raw.notes || '');
        if (!videoId) {
          inputs.push({ source, report: null, note: 'That is not a YouTube video URL or id.' });
          continue;
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
          inputs.push({
            source: { ...source, label },
            report: null,
            note: `${transcript.reason} — paste the notes or upload the recording instead.`,
          });
          continue;
        }

        provenance =
          transcript.provenance === 'transcribed'
            ? 'transcribed from the audio (no captions)'
            : transcript.provenance === 'auto'
              ? 'auto-generated captions'
              : `captions (${transcript.language})`;
        notes = `${meta.title ? `VIDEO: ${meta.title}\n` : ''}TRANSCRIPT WITH TIMESTAMPS:\n${transcript.text}`;
        resolved.push({ id: source.id, label, notes });
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
        resolved.push({ id: source.id, label, notes });
      } else {
        const result = await transcribeAudio(
          base64ToBytes(file.base64Data as string),
          file.type || 'audio/mpeg',
          file.name || 'recording.mp3'
        );
        if (!result.ok) {
          inputs.push({
            source: { ...source, label },
            report: null,
            note: `${file.name || 'the recording'} could not be transcribed: ${result.reason}.`,
          });
          continue;
        }
        provenance = 'transcribed from the uploaded recording';
        notes = `RECORDING TRANSCRIPT (${file.name || 'recording'}):\n${result.text}`;
        resolved.push({ id: source.id, label, notes });
      }
    }

    if (source.kind === 'text' && !notes) {
      inputs.push({ source, report: null, note: 'Empty text source.' });
      continue;
    }
    if (source.kind === 'file' && !file && !notes) {
      inputs.push({ source, report: null, note: 'The file attachment did not arrive.' });
      continue;
    }

    // A transcribed recording is already text: the model never needs the bytes.
    const inlineFile = file && !notes.startsWith('RECORDING TRANSCRIPT') ? file : null;

    try {
      const result = await generateJSONWithProvider({
        systemPrompt:
          mode === 'more'
            ? buildMoreCardsSystemPrompt(want, label)
            : buildSegregationSystemPrompt(want, label),
        userPrompt:
          mode === 'more'
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
      inputs.push({
        source: { ...source, label },
        report,
        note: report
          ? provenance || undefined
          : 'The model returned no usable cards for this source.',
      });
    } catch (error: any) {
      console.error(`Forge source ${source.id} failed:`, error);
      inputs.push({
        source: { ...source, label },
        report: null,
        note: error?.message || 'Generation failed for this source.',
      });
    }
  }

  // A "more" pass extends ONE deck, so the cross-source contradiction sweep
  // stays out of it: two cards from the same source are not two sources that
  // disagree, and the deck this batch is joining was already checked.
  const merged = mergeSegregationReports(
    inputs,
    topic,
    mode === 'more' ? { detectConflicts: false } : undefined
  );

  // "Generate more" returns ONLY the additional cards: the deck on screen is
  // not re-sent, so the client appends to it instead of replacing it.
  if (mode === 'more') {
    const known = new Set(existingFronts.map((front) => dedupeKey(front)).filter(Boolean));
    const { report, added, dropped } = dropKnownCards(merged.report, known);
    return NextResponse.json({
      mode,
      topic: merged.report.topic,
      report,
      sources: merged.sources,
      dropped: merged.dropped + dropped,
      total: added,
      counts: countReportSections(report),
      contradictions: [],
      resolved,
    });
  }

  // The forge never fails as a whole: a source that broke is reported in
  // `sources` and the deck still ships with everything that worked.
  return NextResponse.json({
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
    resolved,
  });
}
