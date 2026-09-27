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
import { extractYouTubeId, fetchYouTubeMeta, fetchYouTubeTranscript } from '@/lib/services/youtubeTranscript';

// ─── The Forge : sources in, deck out, no encoding ──────────────────────────
//
// This route exists for the case where the learner does not want a workout.
// Each source is run through the SAME card contract the segregate step uses,
// then everything is merged into one deduped report the export modals already
// understand. Nothing here creates stages, XP or a session: forging flashcards
// is not encoding, and pretending otherwise would be dishonest.

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
    let file = raw.file && raw.file.base64Data && raw.file.type ? raw.file : null;
    let label = source.label;

    // YouTube: pull the video's own caption track first. It is plain HTTP, so a
    // forge over a playlist costs one generation per video and no extra pass.
    if (source.kind === 'youtube') {
      const videoId = extractYouTubeId(raw.url || raw.notes || '');
      if (!videoId) {
        inputs.push({ source, report: null, note: 'That is not a YouTube video URL or id.' });
        continue;
      }
      const meta = await fetchYouTubeMeta(videoId);
      const transcript = await fetchYouTubeTranscript(videoId);
      label = meta.title ? `${meta.title}${meta.author ? ` — ${meta.author}` : ''}` : `youtube:${videoId}`;
      if (!transcript) {
        // No captions means no source text. Generating "cards" from a title
        // would be invention, so this source is reported as unusable instead.
        inputs.push({
          source: { ...source, label },
          report: null,
          note: 'No captions on this video, so there is no source text to cut cards from. Paste the notes instead.',
        });
        continue;
      }
      notes = `${meta.title ? `VIDEO: ${meta.title}\n` : ''}TRANSCRIPT WITH TIMESTAMPS:\n${transcript}`;
    }

    if (source.kind === 'text' && !notes) {
      inputs.push({ source, report: null, note: 'Empty text source.' });
      continue;
    }
    if (source.kind === 'file' && !file) {
      inputs.push({ source, report: null, note: 'The file attachment did not arrive.' });
      continue;
    }

    try {
      const result = await generateJSONWithProvider({
        systemPrompt: buildSegregationSystemPrompt(want, label),
        userPrompt: buildSegregationUserPrompt({
          notes: notes || undefined,
          hasFile: Boolean(file),
          fileName: file?.name,
          fileType: file?.type,
          sourceLabel: label,
        }),
        responseSchema: segregationSchema,
        settings,
        isChecker: false,
        file: file
          ? {
              name: file.name || 'source',
              type: file.type as string,
              size: file.size || 0,
              base64Data: file.base64Data as string,
            }
          : null,
      });
      const report = normalizeSegregationReport(result, source.id);
      inputs.push({
        source: { ...source, label },
        report,
        note: report ? undefined : 'The model returned no usable cards for this source.',
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
  });
}
