// ─── AnkiConnect handoff (no downloads, no import dialogs) ──────────────────
//
// The .apkg download is a fine fallback, but it costs a detour: save file →
// switch apps → File ▸ Import → pick the file → confirm. The whole point of
// exporting here is to end the session the instant the card is forged, so if
// the Anki desktop app is open with the AnkiConnect add-on
// (code 2055492159) listening on 127.0.0.1:8765, the deck can be created and
// the notes added directly, from the browser, with no file system in the loop.
//
// Two failure modes get first-class, actionable error text because both look
// like "nothing happened" to the user:
//
//   - Anki closed / add-on missing  → the fetch itself rejects (connection
//     refused). Nothing to fix in this app; the message says to open Anki.
//   - CORS blocked                  → AnkiConnect's `webCorsOriginList` only
//     lists `http://localhost` by default, so any other origin (a LAN IP, a
//     hosted deploy over https) is refused by the browser. The message says
//     exactly which config key to add the origin to.
//
// Note types: this pushes into Anki's stock `Basic` (Front, Back) and `Cloze`
// (Text, Extra) models rather than the custom apkg models, because those two
// exist in every collection and need no import step to be declared.

import type { AnkiCardItem } from './anki-exporter';

export const DEFAULT_ANKI_CONNECT_URL = 'http://127.0.0.1:8765';

/** AnkiConnect API version this client speaks. */
const ANKI_CONNECT_VERSION = 6;

const ENDPOINT_KEY = 'deepencode_anki_connect_v1';

/** Anki's stock note types, always present in a default collection. */
const BASIC_MODEL = 'Basic';
const CLOZE_MODEL = 'Cloze';

export type AnkiConnectErrorKind = 'unreachable' | 'cors' | 'anki' | 'bad-response';

export class AnkiConnectError extends Error {
  kind: AnkiConnectErrorKind;
  constructor(message: string, kind: AnkiConnectErrorKind) {
    super(message);
    this.name = 'AnkiConnectError';
    this.kind = kind;
  }
}

export interface AnkiConnectNote {
  deckName: string;
  modelName: typeof BASIC_MODEL | typeof CLOZE_MODEL;
  fields: Record<string, string>;
  tags: string[];
  options: { allowDuplicate: boolean; duplicateScope: string };
}

export interface AnkiPushResult {
  deckName: string;
  /** Cards handed to AnkiConnect. */
  attempted: number;
  /** Note IDs Anki actually created. */
  added: number;
  /** Cards already present (addNotes returns null for each). */
  duplicates: number;
  /** Notes Anki refused to create. */
  failed: number;
  noteIds: number[];
}

// ─── Endpoint preference ────────────────────────────────────────────────────

/** Normalizes a user-typed endpoint: scheme added, trailing slashes trimmed. */
export function sanitizeAnkiEndpoint(raw?: string | null): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return DEFAULT_ANKI_CONNECT_URL;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withScheme.replace(/\/+$/, '');
}

export function loadAnkiEndpoint(): string {
  if (typeof window === 'undefined') return DEFAULT_ANKI_CONNECT_URL;
  try {
    return sanitizeAnkiEndpoint(window.localStorage.getItem(ENDPOINT_KEY));
  } catch {
    return DEFAULT_ANKI_CONNECT_URL;
  }
}

export function saveAnkiEndpoint(url: string): string {
  const clean = sanitizeAnkiEndpoint(url);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(ENDPOINT_KEY, clean);
    } catch {
      /* private mode / quota — the in-memory default still works */
    }
  }
  return clean;
}

// ─── Transport ──────────────────────────────────────────────────────────────

export interface AnkiInvokeOptions {
  url?: string;
  signal?: AbortSignal;
  /** Anki can be slow to answer on a large first import; 10s is generous. */
  timeoutMs?: number;
}

function unreachableMessage(url: string, detail: string): string {
  return (
    `Can't reach AnkiConnect at ${url} (${detail}). ` +
    `Open the Anki desktop app and make sure the AnkiConnect add-on (code 2055492159) is installed — ` +
    `then retry. The deck downloads (.apkg) still work without it.`
  );
}

const CORS_HINT =
  'The browser blocked the request to AnkiConnect. Add this app\'s origin (or "*") to ' +
  'webCorsOriginList in Tools ▸ Add-ons ▸ AnkiConnect ▸ Config, then restart Anki. ' +
  'A page served over https cannot reach http://127.0.0.1:8765 at all — use the local dev server or the .apkg export.';

/**
 * Calls one AnkiConnect action. Throws {@link AnkiConnectError} with a message
 * meant to be shown to the user as-is.
 */
export async function ankiInvoke<T = any>(
  action: string,
  params: Record<string, unknown> = {},
  opts: AnkiInvokeOptions = {}
): Promise<T> {
  const url = sanitizeAnkiEndpoint(opts.url);
  const timeoutMs = opts.timeoutMs ?? 10000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, version: ANKI_CONNECT_VERSION, params }),
      signal: controller.signal,
    });
  } catch (err: any) {
    const aborted = err?.name === 'AbortError';
    const detail = aborted ? `timed out after ${timeoutMs}ms` : (err?.message || 'network error');
    // A CORS refusal surfaces as a bare TypeError in every browser, so the
    // message names both possibilities instead of guessing wrong.
    throw new AnkiConnectError(`${unreachableMessage(url, detail)} ${CORS_HINT}`, 'unreachable');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // 403 is AnkiConnect's answer when the calling origin is not in its CORS
    // allowlist — the same thing the browser reports as a bare TypeError, but
    // here we can name the fix precisely.
    if (res.status === 403) {
      throw new AnkiConnectError(
        `AnkiConnect refused this app's origin (HTTP 403). ${CORS_HINT}`,
        'cors'
      );
    }
    throw new AnkiConnectError(
      `AnkiConnect answered HTTP ${res.status} for "${action}". ${unreachableMessage(url, `HTTP ${res.status}`)}`,
      'bad-response'
    );
  }

  let payload: any;
  try {
    payload = await res.json();
  } catch {
    throw new AnkiConnectError(
      `AnkiConnect returned a non-JSON reply for "${action}" — is something else running on ${url}?`,
      'bad-response'
    );
  }

  if (payload && typeof payload.error === 'string' && payload.error) {
    throw new AnkiConnectError(`Anki refused "${action}": ${payload.error}`, 'anki');
  }
  return (payload?.result ?? null) as T;
}

// ─── Deck / note plumbing ───────────────────────────────────────────────────

export async function listAnkiDecks(opts: AnkiInvokeOptions = {}): Promise<string[]> {
  const decks = await ankiInvoke<string[]>('deckNames', {}, opts);
  return Array.isArray(decks) ? decks : [];
}

/** Creates the deck when it is missing; returns true when it had to create it. */
export async function ensureAnkiDeck(deckName: string, opts: AnkiInvokeOptions = {}): Promise<boolean> {
  const decks = await listAnkiDecks(opts);
  if (decks.includes(deckName)) return false;
  await ankiInvoke('createDeck', { deck: deckName }, opts);
  return true;
}

/** Anki tags cannot carry whitespace or quotes. */
export function sanitizeAnkiTags(tags: string[]): string[] {
  return tags
    .map((t) =>
      String(t)
        .replace(/"/g, '')
        .replace(/\s+/g, '_')
        .replace(/[^\w:.\-]/g, '')
        .slice(0, 60)
    )
    .filter(Boolean);
}

/**
 * Maps one extracted card onto an AnkiConnect note.
 *
 * Cloze only when the front really carries a `{{cN::}}` deletion: Anki rejects
 * a Cloze note without one ("No cloze 1 found"), which would fail the whole
 * batch, so anything else is sent as a plain Basic front/back.
 */
export function mapCardToNote(card: AnkiCardItem, deckName: string): AnkiConnectNote {
  const isRealCloze = Boolean(card.isCloze) && /\{\{c\d+::/.test(card.front);
  const note: AnkiConnectNote = {
    deckName,
    modelName: isRealCloze ? CLOZE_MODEL : BASIC_MODEL,
    fields: isRealCloze
      ? { Text: card.front, Extra: card.back }
      : { Front: card.front, Back: card.back },
    tags: sanitizeAnkiTags(card.tags || []),
    // Never silently duplicate: the push reports what already exists instead.
    options: { allowDuplicate: false, duplicateScope: 'deck' },
  };
  return note;
}

async function assertNoteTypes(notes: AnkiConnectNote[], opts: AnkiInvokeOptions): Promise<void> {
  const needed = [...new Set(notes.map((n) => n.modelName))];
  if (needed.length === 0) return;
  const models = await ankiInvoke<string[]>('modelNames', {}, opts);
  const available = Array.isArray(models) ? models : [];
  const missing = needed.filter((m) => !available.includes(m));
  if (missing.length > 0) {
    throw new AnkiConnectError(
      `Anki has no note type named ${missing.map((m) => `"${m}"`).join(', ')}. ` +
        `Restore the stock Basic/Cloze note types (Tools ▸ Manage Note Types), or export the .apkg instead.`,
      'anki'
    );
  }
}

/**
 * Creates the deck if needed, then adds every card. Duplicates are counted,
 * never re-added, so pressing the shortcut twice is safe.
 */
export async function pushCardsToAnki(
  cards: AnkiCardItem[],
  deckName: string,
  opts: AnkiInvokeOptions = {}
): Promise<AnkiPushResult> {
  const base: AnkiPushResult = {
    deckName,
    attempted: cards.length,
    added: 0,
    duplicates: 0,
    failed: 0,
    noteIds: [],
  };
  if (cards.length === 0) return base;

  await ensureAnkiDeck(deckName, opts);
  const notes = cards.map((c) => mapCardToNote(c, deckName));
  await assertNoteTypes(notes, opts);

  const raw = await ankiInvoke<Array<number | null>>('addNotes', { notes }, opts);
  if (!Array.isArray(raw)) {
    throw new AnkiConnectError(
      'AnkiConnect did not return per-note results from addNotes — nothing was verified as added.',
      'bad-response'
    );
  }

  const noteIds = raw.filter((id): id is number => typeof id === 'number');
  const skipped = raw.filter((id) => id === null).length;
  return {
    ...base,
    added: noteIds.length,
    duplicates: skipped,
    failed: Math.max(0, notes.length - raw.length),
    noteIds,
  };
}

/**
 * One-line status the UI can flash verbatim: `[ANKI: +2 CARDS FORGED]`.
 *
 * `overflow` names the cards the Wozniak ceiling held back that were pushed
 * anyway (tagged `WozniakOverflow`) — the rule stays visible instead of the
 * push quietly shipping a smaller deck than the learner thinks it did.
 */
export function formatPushStatus(
  result: AnkiPushResult,
  extra: { overflow?: number } = {}
): string {
  const noun = result.added === 1 ? 'CARD' : 'CARDS';
  const parts = [`+${result.added} ${noun} FORGED`];
  if (result.duplicates > 0) parts.push(`${result.duplicates} already in deck`);
  if (result.failed > 0) parts.push(`${result.failed} refused`);
  if (extra.overflow && extra.overflow > 0) {
    parts.push(`${extra.overflow} over the 20-word ceiling (tagged WozniakOverflow)`);
  }
  return `[ANKI: ${parts.join(' · ')}]`;
}

/** Human-readable failure text for the UI (never a raw stack trace). */
export function describePushError(err: unknown): string {
  if (err instanceof AnkiConnectError) return err.message;
  return `Anki push failed: ${(err as Error)?.message || 'unknown error'}`;
}
