import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  extractAudioStream,
  fetchCaptionTrackText,
  isTranscriptionConfigured,
  parseCaptionTracks,
  parsePlayerResponse,
  parseTimedText,
  pickCaptionTrack,
  readYouTubeTranscriptDetailed,
  transcribeAudio,
} from '@/lib/services/transcript';
import { isTranscribableMedia } from '@/lib/media-types';

// ─── Fixtures ───────────────────────────────────────────────────────────────
// Shaped like the real watch page: the player response is embedded in the HTML
// and carries the caption track list the server reads.

function watchPage(tracks: { url: string; lang?: string; kind?: string }[], audioUrl?: string): string {
  const captionTracks = tracks.map((t) => ({
    baseUrl: t.url,
    languageCode: t.lang || 'en',
    ...(t.kind ? { kind: t.kind } : {}),
  }));
  const playerResponse = {
    playabilityStatus: { status: 'OK' },
    captions: { playerCaptionsTracklistRenderer: { captionTracks } },
    streamingData: audioUrl
      ? { adaptiveFormats: [{ itag: 251, mimeType: 'audio/webm; codecs="opus"', url: audioUrl, contentLength: '2048' }] }
      : { adaptiveFormats: [{ itag: 251, mimeType: 'audio/webm; codecs="opus"', contentLength: '2048' }] },
  };
  return `<html><script>var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};</script></html>`;
}

const TRACK_URL = 'https://www.youtube.com/api/timedtext?v=abc&lang=en&fmt=srv1';

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('TRANSCRIBE_API_KEY', '');
  vi.stubEnv('OPENAI_API_KEY', '');
  vi.stubEnv('TRANSCRIBE_API_URL', '');
  vi.stubEnv('TRANSCRIBE_MODEL', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('caption parsing', () => {
  it('reads the track list from the page HTML and from a parsed player response', () => {
    const html = watchPage([{ url: TRACK_URL }, { url: `${TRACK_URL}&kind=asr`, kind: 'asr' }]);
    expect(parseCaptionTracks(html)).toHaveLength(2);
    expect(parseCaptionTracks(parsePlayerResponse(html)!)).toHaveLength(2);
    expect(parseCaptionTracks('<html>no player response here</html>')).toHaveLength(0);
  });

  it('prefers manual English, then auto English, then anything', () => {
    const tracks = parseCaptionTracks(
      watchPage([{ url: 'a', lang: 'de' }, { url: 'b', kind: 'asr' }, { url: 'c' }])
    );
    expect(pickCaptionTrack(tracks)!.baseUrl).toBe('c');
    const asrOnly = parseCaptionTracks(watchPage([{ url: 'b', kind: 'asr' }, { url: 'd', lang: 'de' }]));
    expect(pickCaptionTrack(asrOnly)!.baseUrl).toBe('b');
    expect(pickCaptionTrack([])).toBeNull();
  });

  it('parses both timedtext dialects, with timestamps', () => {
    const xml = '<transcript><text start="0" dur="2">Hello &amp; welcome</text><text start="65.4" dur="2">Second line</text></transcript>';
    expect(parseTimedText(xml)).toBe('[00:00] Hello & welcome\n[01:05] Second line');

    const json3 = JSON.stringify({
      events: [
        { tStartMs: 0, segs: [{ utf8: 'Hello' }, { utf8: ' there' }] },
        { tStartMs: 61000, segs: [{ utf8: 'Next' }] },
        { tStartMs: 62000, segs: [] },
      ],
    });
    expect(parseTimedText(json3)).toBe('[00:00] Hello there\n[01:01] Next');
    expect(parseTimedText('')).toBe('');
  });

  it('only reports an audio stream when YouTube hands one over', () => {
    const withAudio = parsePlayerResponse(watchPage([{ url: TRACK_URL }], 'https://rr1.googlevideo.com/videoplayback?x=1'))!;
    expect(extractAudioStream(withAudio)!.mimeType).toContain('audio/webm');
    const withheld = parsePlayerResponse(watchPage([{ url: TRACK_URL }]))!;
    expect(extractAudioStream(withheld)).toBeNull();
  });

  it('retries the formats YouTube blanks out', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async (url: string) => {
      calls += 1;
      // The first format answers an empty 200 (what YouTube does when it
      // dislikes the request); the next one actually serves the track.
      if (calls > 1) {
        return new Response('<transcript><text start="0">Recovered</text></transcript>', { status: 200 });
      }
      return new Response('', { status: 200 });
    });
    const text = await fetchCaptionTrackText({ baseUrl: TRACK_URL, languageCode: 'en' });
    expect(text).toBe('[00:00] Recovered');
    expect(calls).toBeGreaterThan(1);
  });
});

describe('transcription', () => {
  it('knows which files can be transcribed', () => {
    expect(isTranscribableMedia('audio/mpeg')).toBe(true);
    expect(isTranscribableMedia('video/mp4')).toBe(true);
    expect(isTranscribableMedia('', 'lecture.m4a')).toBe(true);
    expect(isTranscribableMedia('application/pdf', 'handout.pdf')).toBe(false);
    expect(isTranscribableMedia('image/png', 'slide.png')).toBe(false);
  });

  it('is off unless a key is configured', async () => {
    expect(isTranscriptionConfigured()).toBe(false);
    const result = await transcribeAudio(new Uint8Array([1, 2, 3]), 'audio/mpeg', 'x.mp3');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('not configured');
  });

  it('posts the bytes to the configured endpoint and reads the text back', async () => {
    vi.stubEnv('TRANSCRIBE_API_KEY', 'test-key');
    let seenUrl = '';
    vi.stubGlobal('fetch', async (url: string, init: any) => {
      seenUrl = String(url);
      expect(init.method).toBe('POST');
      return new Response('  Hello from the lecture.  ', { status: 200 });
    });
    const result = await transcribeAudio(new Uint8Array([1, 2, 3]), 'audio/mpeg', 'x.mp3');
    expect(result).toEqual({ ok: true, text: 'Hello from the lecture.' });
    expect(seenUrl).toContain('/audio/transcriptions');
  });

  it('surfaces an endpoint failure instead of pretending it worked', async () => {
    vi.stubEnv('TRANSCRIBE_API_KEY', 'test-key');
    vi.stubGlobal('fetch', async () => new Response('rate limited', { status: 429 }));
    const result = await transcribeAudio(new Uint8Array([1]), 'audio/mpeg');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('429');
  });
});

describe('the ladder: captions first, audio only when there are none', () => {
  it('reads captions and never touches the audio when a track works', async () => {
    const html = watchPage([{ url: TRACK_URL, kind: 'asr' }], 'https://audio.example.test/stream');
    const requested: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      requested.push(String(url));
      if (String(url).startsWith('https://www.youtube.com/watch')) return new Response(html, { status: 200 });
      return new Response('<transcript><text start="0">From the captions</text></transcript>', { status: 200 });
    });

    const result = await readYouTubeTranscriptDetailed('abc');
    expect(result.status).toBe('ok');
    expect(result.status === 'ok' && result.provenance).toBe('auto');
    expect(result.status === 'ok' && result.text).toBe('[00:00] From the captions');
    expect(requested.some((u) => u.includes('audio.example.test'))).toBe(false);
  });

  it('says the video HAS captions when the server merely cannot read them', async () => {
    const html = watchPage([{ url: TRACK_URL }, { url: `${TRACK_URL}&2`, kind: 'asr' }]);
    vi.stubGlobal('fetch', async (url: string) => {
      if (String(url).startsWith('https://www.youtube.com/watch')) return new Response(html, { status: 200 });
      return new Response('', { status: 200 });
    });

    const result = await readYouTubeTranscriptDetailed('abc');
    expect(result.status).toBe('unreadable');
    expect(result.status === 'unreadable' && result.reason).toContain('HAS captions (2 tracks)');
    expect(result.status === 'unreadable' && result.reason).toContain('not configured');
  });

  it('transcribes the audio when there are no captions at all', async () => {
    const html = watchPage([], 'https://rr1.googlevideo.com/videoplayback?x=1');
    vi.stubEnv('TRANSCRIBE_API_KEY', 'test-key');
    vi.stubGlobal('fetch', async (url: string) => {
      const target = String(url);
      if (target.startsWith('https://www.youtube.com/watch')) return new Response(html, { status: 200 });
      if (target.includes('googlevideo')) return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
      return new Response('Transcribed from audio.', { status: 200 });
    });

    const result = await readYouTubeTranscriptDetailed('abc');
    expect(result.status).toBe('ok');
    expect(result.status === 'ok' && result.provenance).toBe('transcribed');
    expect(result.status === 'ok' && result.text).toBe('Transcribed from audio.');
    expect(result.status === 'ok' && result.note).toContain('no captions');
  });

  it('reports no captions when the audio cannot be reached either', async () => {
    const html = watchPage([]);
    vi.stubEnv('TRANSCRIBE_API_KEY', 'test-key');
    vi.stubGlobal('fetch', async (url: string) => {
      if (String(url).startsWith('https://www.youtube.com/watch')) return new Response(html, { status: 200 });
      return new Response('', { status: 200 });
    });

    const result = await readYouTubeTranscriptDetailed('abc');
    expect(result.status).toBe('no-captions');
    expect(result.status === 'no-captions' && result.reason).toContain('no caption track');
    expect(result.status === 'no-captions' && result.reason).toContain('playable audio stream');
  });

  it('blames the network when YouTube does not answer at all', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 503 }));
    const result = await readYouTubeTranscriptDetailed('abc');
    expect(result.status).toBe('unreadable');
    expect(result.status === 'unreadable' && result.reason).toContain('did not answer');
  });
});
