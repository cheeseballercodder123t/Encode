import LZString from 'lz-string';
import { SavedSchema } from './types';

// ─── Stateless sharing ──────────────────────────────────────────────────────
//
// A schema travels to a classmate inside the link itself: no account, no
// upload, nothing stored on a server. That is the feature, and it is also what
// puts a hard ceiling on the payload - a ceiling the old `?share=` form ran
// straight into.
//
// MEASURED (this preview, `curl -o /dev/null -w '%{http_code}'`):
//
//   GET /?share=<16,000 bytes>   200
//   GET /?share=<17,000 bytes>   431  (Request Header Fields Too Large)
//   GET /#share=<24,000 bytes>   200
//
// A query parameter travels in the request LINE, so the server refuses an
// oversized one before any route runs: the classmate gets Node's error page
// instead of the schema, and nothing in the app ever says why. A fragment
// (`#…`) is never sent to the server at all - it is the browser's own, and the
// page reads it after it loads - so the payload size stops being a server
// question. New links therefore ride in the fragment; `?share=` and `?data=`
// are still read so every link already in the wild keeps working.
//
// What remains is a practical ceiling rather than a protocol one, and the
// numbers below describe it so the UI can say something true instead of
// handing over a link that arrives in pieces.

/** The key the payload rides under, in the fragment (new) and query (old) form. */
export const SHARE_KEY = 'share';

/** Keys older links may have used for the same payload. */
export const SHARE_KEY_ALIASES = ['share', 'data'] as const;

/**
 * The whole URL's budget, in bytes.
 *
 * Below the server's own 16 KB request-line limit with a wide margin, because
 * the request line shares its allowance with every other header the browser
 * sends, and because whatever serves the app in front of Node may be stricter.
 * Past this the schema is no longer offered as a link.
 */
export const SHARE_URL_LIMIT_BYTES = 8_000;

/**
 * The size past which a link stops being comfortable to hand over.
 *
 * One chat message is ~2,000 characters, so a longer link gets split, shortened
 * or wrapped by the app it is pasted into - and half a compressed payload
 * decompresses to nothing at all. Above this the link still works, but the
 * learner is told it is long and offered a smaller one.
 */
export const SHARE_URL_COMFORT_BYTES = 2_000;

/** UTF-8 byte length, which is what a URL and a chat message are measured in. */
export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

export interface SlimShareLink {
  url: string;
  urlBytes: number;
  /** True when this smaller link is inside {@link SHARE_URL_LIMIT_BYTES}. */
  fits: boolean;
}

export interface ShareLink {
  /** The shareable URL, or '' when the schema could not be compressed. */
  url: string;
  urlBytes: number;
  /** Bytes of the compressed payload alone. */
  payloadBytes: number;
  /** Bytes of the raw JSON, for the compression readout. */
  rawBytes: number;
  /** True once the link is longer than one chat message can carry. */
  overComfort: boolean;
  /** True once the link is past what a URL should carry at all. */
  overLimit: boolean;
  /**
   * The same deck without the author's own written answers, when that is
   * actually smaller. Null when there is nothing to drop.
   */
  slim: SlimShareLink | null;
  /** True when no link at all should be offered (over the limit, no slim fit). */
  unshareable: boolean;
}

/**
 * Compresses a complete SavedSchema object into a URL-safe Base64-like string
 * using LZ-based compression.
 */
export function compressSchemaForUrl(schema: SavedSchema): string {
  try {
    // Strip large binary blobs or unnecessary temporary fields if any to keep URL concise
    const cleanSchema = {
      ...schema,
      // If activities have bulky temporary data, keep only essential schema
    };
    const jsonStr = JSON.stringify(cleanSchema);
    return LZString.compressToEncodedURIComponent(jsonStr);
  } catch (err) {
    console.error('Failed to compress schema for URL:', err);
    return '';
  }
}

/**
 * Decompresses a URL-safe compressed string back into a full SavedSchema object.
 */
export function decompressSchemaFromUrl(compressed: string): SavedSchema | null {
  try {
    if (!compressed || compressed.trim().length === 0) return null;
    const jsonStr = LZString.decompressFromEncodedURIComponent(compressed);
    if (!jsonStr) return null;
    
    const parsed = JSON.parse(jsonStr) as SavedSchema;
    if (!parsed || (!parsed.activities && !parsed.guidedModules)) {
      return null;
    }
    return parsed;
  } catch (err) {
    console.error('Failed to decompress schema from URL:', err);
    return null;
  }
}

/**
 * The payload out of whatever the URL carries it in: the fragment first (where
 * this module writes it), then the query string the older links used.
 *
 * `location.hash` arrives with its leading `#`, and a fragment can hold other
 * keys, so it is parsed as its own search string rather than sliced.
 *
 * Accepts the pieces instead of reading `window` so the reader is testable and
 * the caller stays in charge of where its URL lives.
 */
export function readSharedPayload(search: string, hash: string): string | null {
  // `+` IS a legitimate character of the LZString URL-safe alphabet (the decoder
  // reads it back verbatim), but `URLSearchParams` follows the form-encoding rule
  // and turns every `+` into a space. Without this re-encode, a payload that
  // happens to contain one is silently corrupted on the way in - which is what an
  // older `?share=` link does today whenever its payload carries a `+`.
  const asLiteral = (value: string) => value.replace(/\+/g, '%2B');
  const fromHash = new URLSearchParams(asLiteral(hash.replace(/^#/, '')));
  const fromSearch = new URLSearchParams(asLiteral(search));
  for (const key of SHARE_KEY_ALIASES) {
    const value = fromHash.get(key) || fromSearch.get(key);
    if (value) return value;
  }
  return null;
}

/** The origin + path a link should point at, or '' off the browser. */
function currentBase(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin + window.location.pathname;
}

/**
 * The same schema minus the author's own written answers.
 *
 * This is the honest way to make an oversized schema shareable: what a
 * classmate needs is the deck - the stages, prompts, scaffolds and visual data
 * - not the author's field-1/field-2 text, which they are supposed to produce
 * themselves. Only `userResponses` is dropped, so the receiving view still
 * opens with every exercise intact (an empty answer set is exactly what a
 * freshly encoded session has).
 */
export function slimSchemaForShare(schema: SavedSchema): SavedSchema {
  return { ...schema, userResponses: {} };
}

function linkFor(compressed: string, base: string): { url: string; urlBytes: number } {
  const url = compressed ? `${base}#${SHARE_KEY}=${compressed}` : '';
  return { url, urlBytes: utf8Bytes(url) };
}

/**
 * Everything the share sheet needs to describe - and, when it cannot, to refuse
 * to offer - a link: the URL, its size, whether that size is a problem, and a
 * slim alternative.
 */
export function buildShareLink(schema: SavedSchema): ShareLink {
  const base = currentBase();
  const rawBytes = utf8Bytes(JSON.stringify(schema));

  const full = compressSchemaForUrl(schema);
  const fullLink = linkFor(full, base);

  const slimCompressed = full ? compressSchemaForUrl(slimSchemaForShare(schema)) : '';
  const slimLink = linkFor(slimCompressed, base);
  // Only offered when it is a real reduction: "share without your answers" is
  // noise when there are no answers in the payload.
  const slim =
    full && slimCompressed && slimLink.urlBytes < fullLink.urlBytes
      ? { ...slimLink, fits: slimLink.urlBytes <= SHARE_URL_LIMIT_BYTES }
      : null;

  const overLimit = fullLink.urlBytes > SHARE_URL_LIMIT_BYTES;

  return {
    url: fullLink.url,
    urlBytes: fullLink.urlBytes,
    payloadBytes: utf8Bytes(full),
    rawBytes,
    overComfort: fullLink.urlBytes > SHARE_URL_COMFORT_BYTES,
    overLimit,
    slim,
    unshareable: overLimit && !(slim?.fits ?? false),
  };
}

/**
 * Generates the full shareable URL for the current window location.
 *
 * Kept as the one-line entry point the share sheet already used; the size
 * accounting above is what a caller should read when it needs to explain
 * itself.
 */
export function generateStatelessShareUrl(schema: SavedSchema): string {
  return buildShareLink(schema).url;
}
