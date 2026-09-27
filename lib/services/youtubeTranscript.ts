import { parseCaptionTracks, parsePlayerResponse, readYouTubeCaptions } from './transcript';

// ─── YouTube source text (no AI involved) ───────────────────────────────────
// The timestamped transcript is plain HTTP: the watch page carries its own
// caption track list (manual AND auto-generated), and the track's timedtext is
// public. Both the video-schema route and the flashcards-only Forge read it
// through here, so a forge over a playlist costs one generation per video
// rather than an extra "summarise this video" pass first.
//
// Reading the track lives in `transcript.ts` — one place decides which track to
// trust, retries the formats YouTube blanks out, and (for the Forge) falls back
// to transcribing the audio when there is genuinely no caption track.

/** Pulls the 11-character video id out of any common YouTube URL shape. */
export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const cleanUrl = url.trim();

  const match = cleanUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i);
  if (match && match[1]) {
    return match[1];
  }

  if (/^[\w-]{11}$/.test(cleanUrl)) {
    return cleanUrl;
  }

  return null;
}

export interface YouTubeMeta {
  videoId: string;
  title: string;
  author: string;
  thumbnailUrl: string;
}

/** oEmbed metadata: the real title/author/thumbnail when the video is public. */
export async function fetchYouTubeMeta(videoId: string): Promise<YouTubeMeta> {
  const fallback: YouTubeMeta = {
    videoId,
    title: '',
    author: '',
    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
  };
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return fallback;
    const data = await res.json();
    return {
      videoId,
      title: data.title || '',
      author: data.author_name || '',
      thumbnailUrl: data.thumbnail_url || fallback.thumbnailUrl,
    };
  } catch {
    return fallback;
  }
}

/**
 * The video's own caption track, timestamped `[mm:ss] line`. Returns '' when
 * the video has no captions (or the page shape changed) — callers must treat
 * that as "no text available", never as "the video says nothing".
 *
 * Captions only, deliberately: a schema built from the video's title and
 * timestamps does not justify transcribing an hour of audio as a side effect.
 * The Forge, which is being asked for cards from THIS source, does pay for that
 * (see `readYouTubeTranscriptDetailed`).
 */
export async function fetchYouTubeTranscript(videoId: string, maxLines = 120): Promise<string> {
  return readYouTubeCaptions(videoId, maxLines);
}

/**
 * True when the watch page carries a caption track list at all. Lets a caller
 * say "YouTube answered, and this video really has no captions" instead of
 * blaming the network.
 */
export async function youtubeHasCaptionTracks(videoId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'Accept-Language': 'en-US,en;q=0.9', 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return false;
    const html = await res.text();
    return parseCaptionTracks(parsePlayerResponse(html) || html).length > 0;
  } catch {
    return false;
  }
}
