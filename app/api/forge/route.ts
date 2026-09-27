import { NextRequest, NextResponse } from 'next/server';
import { generateJSONWithProvider } from '@/lib/ai-client';
import {
  buildSegregationSystemPrompt,
  buildSegregationUserPrompt,
  resolveSegregationSections,
  segregationSchema,
} from '@/lib/services/segregation';
import {
  ForgeMergeInput,
  ForgeSource,
  ForgeSourceKind,
  mergeSegregationReports,
  normalizeSegregationReport,
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

  const rawSources: ForgeSourcePayload[] = Array.isArray(body?.sources) ? body.sources.slice(0, MAX_SOURCES) : [];
  const settings = body?.settings;
  const topic = typeof body?.topic === 'string' ? body.topic : '';
  const want = resolveSegregationSections(body?.include);

  if (rawSources.length === 0) {
    return NextResponse.json({ error: 'Add at least one source to forge a deck.' }, { status: 400 });
  }

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
    }

    // ── Uploaded audio/video: transcribe instead of handing a model raw bytes ─
    else if (source.kind === 'file' && file && isTranscribableMedia(file.type || '', file.name || '')) {
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
        systemPrompt: buildSegregationSystemPrompt(want, label),
        userPrompt: buildSegregationUserPrompt({
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

  const merged = mergeSegregationReports(inputs, topic);

  // The forge never fails as a whole: a source that broke is reported in
  // `sources` and the deck still ships with everything that worked.
  return NextResponse.json({
    topic: merged.report.topic,
    report: merged.report,
    sources: merged.sources,
    dropped: merged.dropped,
    total: merged.total,
    counts: merged.counts,
    contradictions: merged.contradictions,
  });
}
