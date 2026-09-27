// ─── Uploaded media → transcription ─────────────────────────────────────────
// A lecture recording is a source like any other, but it cannot be handed to a
// model as bytes: it goes through speech-to-text first. Which files that
// applies to is the one thing the client (file picker) and the server (forge
// route) both have to agree on, so it lives here rather than in either.

const MEDIA_MIME_PREFIXES = ['audio/', 'video/'];
const MEDIA_EXTENSIONS = /\.(mp3|m4a|wav|ogg|oga|opus|flac|aac|webm|mp4|mov|mkv)$/i;

/** Browser file-picker filter, kept in sync with the type check below. */
export const MEDIA_ACCEPT_ATTRIBUTE =
  'audio/*,video/mp4,video/webm,video/quicktime,.m4a,.mp3,.wav,.ogg,.opus,.flac';

export function isTranscribableMedia(mimeType: string, name = ''): boolean {
  const type = (mimeType || '').toLowerCase();
  if (MEDIA_MIME_PREFIXES.some((prefix) => type.startsWith(prefix))) return true;
  return MEDIA_EXTENSIONS.test(name || '');
}
