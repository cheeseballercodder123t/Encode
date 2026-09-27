// ─── Source text for a lecture: captions first, audio second ────────────────
//
// A lecture is not "uncaptioned" just because WE could not read it. YouTube
// serves its caption list to datacenter IPs but sometimes answers the track
// request with an empty 200, and a video with auto-generated (ASR) captions
// looks identical to one with none if you only check for a manual track. So
// reading a video goes:
//
//   1. the page's own captionTracks list, preferring manual English, then ASR,
//      then anything readable — and every track gets more than one attempt
//      (fmt=json3 / srv3 / default), because one format can come back empty
//      while another works.
//   2. only if there is genuinely nothing to read: transcribe the audio, which
//      needs a transcription endpoint configured (TRANSCRIBE_API_KEY) and an
//      audio stream YouTube is willing to hand this server. If either is
//      missing the caller is told WHICH of the two it is — an unreadable track
//      and a video with no captions are different problems, and neither is
//      "the video says nothing".
//
// Uploaded audio/video files take the same transcription path, which is the
// reliable half: your own lecture recording can always be read.

export type CaptionKind = 'manual' | 'auto';
export type TranscriptProvenance = CaptionKind | 'transcribed';

export interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
  name?: string;
}

export type TranscriptResult =
  | { status: 'ok'; text: string; provenance: TranscriptProvenance; language: string; note?: string }
  /** No caption track exists for this video at all. */
  | { status: 'no-captions'; reason: string }
  /** Caption tracks exist but none of them served any text to this server. */
  | { status: 'unreadable'; reason: string };

export const MAX_TRANSCRIPT_LINES = 160;

/** Transcription is optional: without a key the forge reports instead of fails. */
export function transcriptionEndpoint(): { url: string; key: string; model: string } | null {
  const key = (process.env.TRANSCRIBE_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  if (!key) return null;
  return {
    url: (process.env.TRANSCRIBE_API_URL || 'https://api.openai.com/v1/audio/transcriptions').trim(),
    key,
    model: (process.env.TRANSCRIBE_MODEL || 'whisper-1').trim(),
  };
}

export function isTranscriptionConfigured(): boolean {
  return transcriptionEndpoint() !== null;
}

/** The player response lives inside the watch page as `ytInitialPlayerResponse`. */
export function parsePlayerResponse(html: string): any | null {
  const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\});\s*(?:var|const|let|function|\(|<\/script>)/);
  const raw = match?.[1] || html.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\})\s*;\s*<\/script>/)?.[1];
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Caption tracks from either the raw page HTML or an already-parsed player
 * response. `kind: 'asr'` marks an auto-generated track — which is a real
 * transcript of the audio, not a lesser one.
 */
export function parseCaptionTracks(source: string | any): CaptionTrack[] {
  let list: any[] | null = null;

  if (typeof source === 'string') {
    const match = source.match(/"captionTracks":\s*(\[.*?\])/);
    if (!match) return [];
    try {
      list = JSON.parse(match[1]);
    } catch {
      return [];
    }
  } else {
    list = source?.captions?.playerCaptionsTracklistRenderer?.captionTracks || null;
  }

  if (!Array.isArray(list)) return [];
  return list
    .filter((t: any) => typeof t?.baseUrl === 'string' && t.baseUrl.length > 0)
    .map((t: any) => ({
      baseUrl: t.baseUrl,
      languageCode: typeof t.languageCode === 'string' ? t.languageCode : '',
      kind: typeof t.kind === 'string' ? t.kind : undefined,
      name: typeof t.name?.simpleText === 'string' ? t.name.simpleText : undefined,
    }));
}

/**
 * Which track to read: manual English beats auto English, which beats any
 * other readable track. Transcripts are source text for the model, so a
 * translated track is better than no text at all.
 */
export function pickCaptionTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (tracks.length === 0) return null;
  const isEn = (t: CaptionTrack) => t.languageCode.toLowerCase().startsWith('en');
  return (
    tracks.find((t) => isEn(t) && t.kind !== 'asr') ||
    tracks.find((t) => isEn(t)) ||
    tracks.find((t) => t.kind !== 'asr') ||
    tracks[0]
  );
}

/** Timedtext XML (or json3) → `[mm:ss] line`. Both dialects are handled. */
export function parseTimedText(body: string, maxLines = MAX_TRANSCRIPT_LINES): string {
  if (!body) return '';

  const stamp = (seconds: number) => {
    const sec = Math.max(0, Math.floor(seconds));
    return `[${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}]`;
  };

  if (body.trim().startsWith('{')) {
    try {
      const data = JSON.parse(body);
      const events: any[] = Array.isArray(data?.events) ? data.events : [];
      return events
        .map((e) => {
          const text = (Array.isArray(e?.segs) ? e.segs : [])
            .map((s: any) => (typeof s?.utf8 === 'string' ? s.utf8 : ''))
            .join('')
            .replace(/\s+/g, ' ')
            .trim();
          const start = Number(e?.tStartMs || 0) / 1000;
          return text ? `${stamp(start)} ${text}` : '';
        })
        .filter(Boolean)
        .slice(0, maxLines)
        .join('\n');
    } catch {
      return '';
    }
  }

  const decode = (value: string) =>
    value
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/<[^>]*>/g, '');

  return Array.from(body.matchAll(/<text([^>]*)>([\s\S]*?)<\/text>/g))
    .map((m) => {
      const start = Number((m[1].match(/start="([\d.]+)"/) || [])[1] || 0);
      const text = decode(m[2]).replace(/\s+/g, ' ').trim();
      return text ? `${stamp(start)} ${text}` : '';
    })
    .filter(Boolean)
    .slice(0, maxLines)
    .join('\n');
}

/**
 * One track, three attempts. YouTube answers `text/html` with an empty body
 * when it dislikes the request, so an empty 200 on the first format is not
 * evidence that the video has no captions.
 */
export async function fetchCaptionTrackText(track: CaptionTrack, maxLines = MAX_TRANSCRIPT_LINES): Promise<string> {
  const base = track.baseUrl.replace(/\\u0026/g, '&');
  const url = base.startsWith('http') ? base : `https://www.youtube.com${base}`;

  for (const suffix of ['&fmt=json3', '', '&fmt=srv3']) {
    try {
      const res = await fetch(`${url}${suffix}`, {
        headers: {
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          Referer: 'https://www.youtube.com/',
        },
      });
      if (!res.ok) continue;
      const body = await res.text();
      const text = parseTimedText(body, maxLines);
      if (text) return text;
    } catch {
      // try the next format
    }
  }
  return '';
}

/** The audio-only stream, when YouTube hands this server one it can play. */
export function extractAudioStream(playerResponse: any): { url: string; mimeType: string; contentLength: number } | null {
  const formats: any[] = playerResponse?.streamingData?.adaptiveFormats || [];
  const audio = formats.filter((f) => typeof f?.mimeType === 'string' && f.mimeType.startsWith('audio/'));
  const playable = audio.find((f) => typeof f.url === 'string' && f.url.length > 0);
  if (!playable) return null;
  return {
    url: playable.url,
    mimeType: playable.mimeType,
    contentLength: Number(playable.contentLength || 0),
  };
}

const MAX_AUDIO_BYTES = 24 * 1024 * 1024; // most speech-to-text endpoints cap at 25MB

export { isTranscribableMedia } from '@/lib/media-types';

/**
 * Speech-to-text over any OpenAI-compatible endpoint (Whisper-style
 * `multipart/form-data` upload). Returns '' when transcription is not
 * configured — the caller decides whether that is fatal for the source.
 */
export async function transcribeAudio(
  bytes: Uint8Array,
  mimeType: string,
  fileName = 'lecture.mp3'
): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const endpoint = transcriptionEndpoint();
  if (!endpoint) {
    return {
      ok: false,
      reason:
        'audio transcription is not configured on this deployment (add a speech-to-text key in Settings → Environment)',
    };
  }
  if (bytes.byteLength === 0) return { ok: false, reason: 'the audio file was empty' };
  if (bytes.byteLength > MAX_AUDIO_BYTES) {
    return { ok: false, reason: `the recording is ${Math.round(bytes.byteLength / 1024 / 1024)}MB, over the 24MB transcription limit` };
  }

  try {
    const form = new FormData();
    const type = mimeType || 'audio/mpeg';
    form.append('file', new Blob([bytes as unknown as BlobPart], { type }), fileName);
    form.append('model', endpoint.model);
    form.append('response_format', 'text');

    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${endpoint.key}` },
      body: form,
    });
    const body = await res.text();
    if (!res.ok) {
      return { ok: false, reason: `the transcription endpoint answered ${res.status}: ${body.slice(0, 160)}` };
    }
    // `response_format: text` returns the transcript raw; JSON is accepted too.
    let text = body;
    if (body.trim().startsWith('{')) {
      try {
        text = JSON.parse(body)?.text || '';
      } catch {
        text = '';
      }
    }
    text = text.trim();
    return text ? { ok: true, text } : { ok: false, reason: 'the transcription came back empty' };
  } catch (error: any) {
    return { ok: false, reason: `the transcription request failed: ${error?.message || 'network error'}` };
  }
}

/** Fetches a playable audio stream and transcribes it. Used only as a fallback. */
export async function transcribeYouTubeAudio(
  playerResponse: any,
  maxSeconds = 0
): Promise<{ ok: true; text: string; note: string } | { ok: false; reason: string }> {
  if (!isTranscriptionConfigured()) {
    return {
      ok: false,
      reason: 'audio transcription is not configured on this deployment (add a speech-to-text key in Settings → Environment)',
    };
  }
  const stream = extractAudioStream(playerResponse);
  if (!stream) {
    return {
      ok: false,
      reason:
        'YouTube did not hand this server a playable audio stream, so the audio cannot be transcribed from here — upload the recording instead',
    };
  }
  if (stream.contentLength && stream.contentLength > MAX_AUDIO_BYTES) {
    return {
      ok: false,
      reason: `the audio is ${Math.round(stream.contentLength / 1024 / 1024)}MB, over the 24MB transcription limit`,
    };
  }

  try {
    const res = await fetch(stream.url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Range: `bytes=0-${MAX_AUDIO_BYTES - 1}` },
    });
    if (!res.ok) return { ok: false, reason: `the audio stream answered ${res.status}` };
    const bytes = new Uint8Array(await res.arrayBuffer());
    const result = await transcribeAudio(bytes, stream.mimeType, 'youtube-lecture.webm');
    if (!result.ok) return result;
    const minutes = Math.round(bytes.byteLength / 1024 / 1024);
    return {
      ok: true,
      text: result.text,
      note: `transcribed from the audio track (${minutes}MB, no captions)`,
    };
  } catch (error: any) {
    return { ok: false, reason: `the audio download failed: ${error?.message || 'network error'}` };
  }
}

/**
 * The full ladder for a YouTube video: captions → (only if there are none, or
 * none of them can be read) audio transcription. Never invents text.
 */
export async function readYouTubeTranscriptDetailed(
  videoId: string,
  maxLines = MAX_TRANSCRIPT_LINES
): Promise<TranscriptResult> {
  let html = '';
  let pageFailed = false;
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
    });
    if (res.ok) html = await res.text();
    else pageFailed = true;
  } catch {
    pageFailed = true;
  }

  const playerResponse = html ? parsePlayerResponse(html) : null;
  const tracks = parseCaptionTracks(playerResponse || html);

  if (tracks.length > 0) {
    const ordered = [pickCaptionTrack(tracks)!, ...tracks.filter((t) => t !== pickCaptionTrack(tracks))];
    for (const track of ordered) {
      const text = await fetchCaptionTrackText(track, maxLines);
      if (text) {
        return {
          status: 'ok',
          text,
          provenance: track.kind === 'asr' ? 'auto' : 'manual',
          language: track.languageCode || 'unknown',
        };
      }
    }
    const transcribed = await transcribeYouTubeAudio(playerResponse);
    if (transcribed.ok) {
      return { status: 'ok', text: transcribed.text, provenance: 'transcribed', language: 'audio', note: transcribed.note };
    }
    return {
      status: 'unreadable',
      reason: `this video HAS captions (${tracks.length} track${tracks.length === 1 ? '' : 's'}) but this server could not read any of them, and ${transcribed.reason}`,
    };
  }

  if (pageFailed) {
    return { status: 'unreadable', reason: 'YouTube did not answer this server at all, so the video could not be read' };
  }

  const transcribed = await transcribeYouTubeAudio(playerResponse);
  if (transcribed.ok) {
    return { status: 'ok', text: transcribed.text, provenance: 'transcribed', language: 'audio', note: transcribed.note };
  }
  return {
    status: 'no-captions',
    reason: `no caption track on this video, and ${transcribed.reason}`,
  };
}

/**
 * Captions only (no transcription): what a caller that just wants context
 * wants. Returns '' when nothing could be read, exactly as before — use
 * `readYouTubeTranscriptDetailed` when the difference between "this video has
 * no captions" and "this server could not read them" matters.
 */
export async function readYouTubeCaptions(videoId: string, maxLines = MAX_TRANSCRIPT_LINES): Promise<string> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
    });
    if (!res.ok) return '';
    const html = await res.text();
    const tracks = parseCaptionTracks(parsePlayerResponse(html) || html);
    const first = pickCaptionTrack(tracks);
    if (!first) return '';
    const ordered = [first, ...tracks.filter((t) => t !== first)];
    for (const track of ordered) {
      const text = await fetchCaptionTrackText(track, maxLines);
      if (text) return text;
    }
    return '';
  } catch {
    return '';
  }
}
