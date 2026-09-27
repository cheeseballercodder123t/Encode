// ─── YouTube source text (no AI involved) ───────────────────────────────────
// The timestamped transcript is plain HTTP: the watch page carries its own
// caption track list, and the track's timedtext XML is public. Both the
// video-schema route and the flashcards-only Forge read it through here, so a
// forge over a playlist costs one generation per video rather than an extra
// "summarise this video" pass first.

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
 */
export async function fetchYouTubeTranscript(videoId: string, maxLines = 120): Promise<string> {
  try {
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'Accept-Language': 'en-US,en;q=0.9', 'User-Agent': 'Mozilla/5.0' },
    });
    if (!pageRes.ok) return '';
    const pageHtml = await pageRes.text();
    const captionMatch = pageHtml.match(/"captionTracks":\s*(\[.*?\])/);
    if (!captionMatch || !captionMatch[1]) return '';
    const tracks = JSON.parse(captionMatch[1]);
    const track = tracks.find((t: any) => t.languageCode === 'en') || tracks[0];
    if (!track?.baseUrl) return '';
    const transcriptRes = await fetch(track.baseUrl);
    if (!transcriptRes.ok) return '';
    const xml = await transcriptRes.text();
    return Array.from(xml.matchAll(/<text start="([\d.]+)" dur="[\d.]+">(.*?)<\/text>/g))
      .slice(0, maxLines)
      .map((m: any) => {
        const sec = Math.floor(parseFloat(m[1]));
        const mm = String(Math.floor(sec / 60)).padStart(2, '0');
        const ss = String(sec % 60).padStart(2, '0');
        const cleanText = m[2].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
        return `[${mm}:${ss}] ${cleanText}`;
      })
      .join('\n');
  } catch {
    return '';
  }
}
