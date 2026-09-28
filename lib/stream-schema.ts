// ─── Incremental JSON schema extractor ──────────────────────────────────────
//
// A schema generation is a long single response: the model writes one JSON
// object, and the stage outlines live inside it. Waiting for the closing brace
// before showing anything is the whole reason a 40-second generation feels
// dead, so this module reads the response AS IT ARRIVES and emits the pieces
// the moment they are self-contained.
//
// It is deliberately not a JSON parser. A parser needs the whole document; this
// needs only a prefix. What it does:
//
//   · tracks brace/bracket depth and string state across chunk boundaries
//     (a chunk can split a string literal, an escape sequence, or a key from
//     its colon — every one of those cases has to be resumed, not re-derived);
//   · emits a `key` event per top-level field name, a `field` event per
//     top-level string value, an `item` event per completed element of any
//     watched array (the stage list), and a final `done` with the whole object
//     once it is genuinely closed;
//   · never invents anything. An event is emitted only from bytes that have
//     already arrived, so the outline on screen can only ever be a prefix of
//     the real response — never a guess that has to be corrected later.
//
// Everything here is pure and synchronous: feed it text, get events back. That
// makes the tricky half (split strings, nested objects inside an item) unit
// testable without a model, a network, or a stream.

export interface SchemaStreamEventMap {
  /** A top-level field name finished (`"activities":` … ). */
  key: { key: string };
  /** A top-level string field finished, e.g. `topicSummary`. */
  field: { key: string; value: string };
  /** A watched array opened (the stage list). */
  arrayStart: { key: string };
  /** One element of a watched array is complete and parseable. */
  item: { key: string; index: number; value: any };
  /** A watched array closed, with how many items it carried. */
  arrayEnd: { key: string; count: number };
  /** The root object closed and parsed cleanly. */
  done: { value: any };
  /** The stream ended in something that cannot be read (bad JSON, bad root). */
  error: { message: string };
}

export type SchemaStreamEvent = {
  [K in keyof SchemaStreamEventMap]: { type: K } & SchemaStreamEventMap[K];
}[keyof SchemaStreamEventMap];

export interface SchemaStreamOptions {
  /**
   * Which top-level arrays carry the things worth showing early. The encode
   * pipeline emits `activities` (standard) and `guidedModules` (guided path).
   */
  itemKeys?: string[];
}

const DEFAULT_ITEM_KEYS = ['activities', 'guidedModules'];

function isWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t';
}

/**
 * A string literal's raw bytes, decoded. The scanner hands out text as it
 * arrives, and what arrives is JSON-escaped (a stage title carrying a quote is
 * `\"` on the wire); decoding here keeps every consumer from having to know
 * that. A literal with no backslash — almost all of them — is returned as-is.
 */
function decodeStringLiteral(raw: string): string {
  if (!raw.includes('\\')) return raw;
  try {
    const decoded = JSON.parse(`"${raw}"`);
    return typeof decoded === 'string' ? decoded : raw;
  } catch {
    return raw;
  }
}

export interface SchemaStream {
  /** Feed the next chunk of the response. Returns whatever is now complete. */
  push(chunk: string): SchemaStreamEvent[];
  /** Flush: the response ended. */
  end(): SchemaStreamEvent[];
  /** Every byte seen so far, for the fallback parse. */
  text(): string;
  /** The parsed root object once `done` fired, otherwise null. */
  value(): any;
  /** True once the root object closed (or the stream was rejected). */
  settled(): boolean;
}

/**
 * Creates a resumable reader for one streamed JSON object.
 *
 * Usage: `const s = createSchemaStream(); const events = s.push(chunk);`
 * Events arrive in document order and each one is final — nothing is emitted
 * twice, and no event is emitted for bytes that have not arrived yet.
 */
export function createSchemaStream(options: SchemaStreamOptions = {}): SchemaStream {
  const itemKeys = new Set(options.itemKeys ?? DEFAULT_ITEM_KEYS);

  let buffer = '';
  let pos = 0;
  let depth = 0;
  let inString = false;
  let escaped = false;
  /** Index of the first character INSIDE the string currently open. */
  let stringStart = -1;
  /** Field name awaiting its value (a key string was just completed). */
  let pendingKey: string | null = null;
  /** The watched array currently open, and the depth it sits at. */
  let openArray: { key: string; depth: number } | null = null;
  /** Offsets of item objects currently open inside the watched array. */
  let itemStarts: number[] = [];
  let itemCount = 0;
  let rootStart = -1;
  let finished = false;
  let rootValue: any = null;

  function safeParse(slice: string): any | null {
    try {
      return JSON.parse(slice);
    } catch {
      return null;
    }
  }

  function scan(): SchemaStreamEvent[] {
    const events: SchemaStreamEvent[] = [];
    if (finished) return events;

    while (pos < buffer.length) {
      const ch = buffer[pos];

      // ── Inside a string: only an unescaped quote ends it ──────────────────
      if (inString) {
        if (escaped) {
          escaped = false;
          pos += 1;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          pos += 1;
          continue;
        }
        if (ch !== '"') {
          pos += 1;
          continue;
        }

        inString = false;
        const content = decodeStringLiteral(buffer.slice(stringStart, pos));

        // A completed string is a KEY when a colon follows it. If the chunk
        // ended before that colon arrived, rewind to the opening quote and
        // decide next time rather than guessing — a wrong guess here would
        // surface a stage title as a field name.
        let look = pos + 1;
        while (look < buffer.length && isWhitespace(buffer[look])) look += 1;
        if (look >= buffer.length) {
          pos = stringStart - 1;
          return events;
        }

        if (buffer[look] === ':') {
          pendingKey = content;
          events.push({ type: 'key', key: content });
          pos = look + 1;
          continue;
        }

        // A completed string VALUE at the top level (topicSummary, mode, …).
        // Values nested inside items or other objects are not our business.
        if (depth === 1 && pendingKey !== null) {
          events.push({ type: 'field', key: pendingKey, value: content });
          pendingKey = null;
        }
        pos += 1;
        continue;
      }

      // ── Containers ────────────────────────────────────────────────────────
      if (ch === '{' || ch === '[') {
        const isArray = ch === '[';
        if (depth === 0) {
          if (isArray) {
            events.push({ type: 'error', message: 'Expected a JSON object at the root of the stream.' });
            finished = true;
            return events;
          }
          rootStart = pos;
        }

        const ownerKey = pendingKey;
        depth += 1;

        if (isArray && ownerKey !== null && itemKeys.has(ownerKey) && depth === 2) {
          // `depth === 2` keeps this to the ROOT's own fields: another object in
          // the same document is free to carry an `activities` array of its own
          // (a module does), and those are not the stages being outlined.
          openArray = { key: ownerKey, depth };
          itemStarts = [];
          itemCount = 0;
          events.push({ type: 'arrayStart', key: ownerKey });
        } else if (openArray && !isArray && depth === openArray.depth + 1) {
          // The object that starts here is one element of the watched array.
          itemStarts.push(pos);
        }

        pendingKey = null;
        pos += 1;
        continue;
      }

      if (ch === '}') {
        if (openArray && depth === openArray.depth + 1 && itemStarts.length > 0) {
          // Closing one stage: everything between its braces is one item.
          const start = itemStarts.pop() as number;
          const value = safeParse(buffer.slice(start, pos + 1));
          if (value !== null && typeof value === 'object') {
            events.push({ type: 'item', key: openArray.key, index: itemCount, value });
            itemCount += 1;
          }
          depth -= 1;
          pos += 1;
          continue;
        }

        depth -= 1;
        if (depth === 0 && rootStart >= 0) {
          const whole = safeParse(buffer.slice(rootStart, pos + 1));
          if (whole === null) {
            events.push({ type: 'error', message: 'The streamed response was not valid JSON.' });
          } else {
            rootValue = whole;
            events.push({ type: 'done', value: whole });
          }
          finished = true;
        }
        pos += 1;
        continue;
      }

      // ── A string opens here: a key when a colon follows, else a value ───────
      if (ch === '"') {
        inString = true;
        escaped = false;
        stringStart = pos + 1;
        pos += 1;
        continue;
      }

      if (ch === ']') {
        if (openArray && depth === openArray.depth) {
          events.push({ type: 'arrayEnd', key: openArray.key, count: itemCount });
          openArray = null;
          itemStarts = [];
        }
        depth = Math.max(0, depth - 1);
        pos += 1;
        continue;
      }

      // Whitespace, commas, colons, scalar punctuation: nothing to extract.
      pos += 1;
    }

    return events;
  }

  return {
    push(chunk: string) {
      if (finished) return [];
      buffer += chunk || '';
      return scan();
    },
    end() {
      return scan();
    },
    text() {
      return buffer;
    },
    value() {
      return rootValue;
    },
    settled() {
      return finished;
    },
  };
}

/**
 * One-shot helper: parse a complete (or truncated) response and collect its
 * events. A truncated document still yields the items that closed before it
 * was cut off, which is exactly what a client-side fallback wants.
 */
export function parseSchemaStream(
  text: string,
  options: SchemaStreamOptions = {}
): { events: SchemaStreamEvent[]; value: any } {
  const stream = createSchemaStream(options);
  const events = [...stream.push(text), ...stream.end()];
  return { events, value: stream.value() };
}

export interface StageOutlineEntry {
  id?: string;
  stageNumber?: number;
  title: string;
  framework?: string;
  templateType?: string;
  cognitiveGoal?: string;
}

/**
 * The outline rows a streamed stage carries, reduced to what the loading view
 * shows. Anything without a title is not a stage outline — a half-written item
 * never reaches here (items are only emitted once their braces balance), but a
 * response the model wrote oddly can still arrive without one, and an untitled
 * row on screen is worse than no row.
 */
export function toStageOutline(value: any, index: number): StageOutlineEntry | null {
  if (!value || typeof value !== 'object') return null;
  const title = typeof value.title === 'string' ? value.title.trim() : '';
  if (!title) return null;
  const asText = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  return {
    id: asText(value.id),
    stageNumber: typeof value.stageNumber === 'number' ? value.stageNumber : index + 1,
    title,
    framework: asText(value.framework),
    templateType: asText(value.templateType),
    cognitiveGoal: asText(value.cognitiveGoal),
  };
}
