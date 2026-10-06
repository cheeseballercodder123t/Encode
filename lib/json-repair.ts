/**
 * Layered JSON repair for model output.
 *
 * Models break JSON in a handful of predictable ways: they truncate long
 * payloads, leave a trailing comma before a closing bracket, quote keys with
 * smart quotes, emit unquoted keys, swap in single-quoted strings, wrap the
 * payload in prose or fences, or insert literal newlines inside strings. Each
 * of those has a deterministic repair, so this module applies them in order
 * from most faithful to most invasive, lets every layer try every candidate,
 * and returns the parse whose repaired text is longest (most source content
 * preserved), with the least invasive pass as tiebreak:
 *
 *   1. as-is
 *   2. prose/fence stripping (existing behavior, kept verbatim)
 *   3. literal-newline / tab escaping inside strings
 *   4. smart-quote and single-quote normalization
 *   5. unquoted-key quoting + `True/False/None` keyword repair
 *   6. trailing-comma removal
 *   7. structural truncation repair (balanced-bracket close of a cut payload)
 *   8. balanced-bracket salvage of the longest parseable prefix
 *
 * Repairs are ordered by faithfulness: a repair that only removes characters
 * the model could not have meant (fences, prose) runs before one that rewrites
 * characters (quotes), and the truncation repair runs last because closing
 * brackets the model never wrote is the biggest assumption. `repairJson`
 * never throws and never returns a value for input that cannot become JSON.
 */

/** Result of a repair pass. */
export interface RepairResult {
  value: unknown;
  /** Which layer saved it — for the route log lines that make failures visible. */
  via: string;
}

/** Repair pass: returns the repaired text, or null when it does not apply. */
type RepairPass = (text: string) => string | null;

/** Strips ```json fences, BOMs and leading/trailing prose so JSON.parse succeeds. */
export function extractJson(text: string): string {
  if (!text) return '';
  let s = text.replace(/^\uFEFF/, '').trim();
  // ```json ... ``` or ``` ... ``` — including an UNCLOSED fence, which is how
  // a truncated response most often presents.
  const fenceMatch = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) return fenceMatch[1].trim();
  const openFence = s.match(/^```(?:json)?\s*([\s\S]+)$/i);
  if (openFence) s = openFence[1].trim();
  // Sometimes the model wraps the object in a single backtick.
  const tickMatch = s.match(/^`([\s\S]*)`$/);
  if (tickMatch) return tickMatch[1].trim();
  // First { or [ to last } or ] (strip "Here is the JSON:" style prose).
  // Arrays are legitimate top-level payloads and were previously dropped.
  const firstToken = s.search(/[{[]/);
  const lastBrace = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (firstToken >= 0 && lastBrace > firstToken) {
    return s.slice(firstToken, lastBrace + 1);
  }
  return s;
}

/** Escapes literal newlines/tabs inside JSON strings (models love markdown lists in strings). */
const escapeControlChars: RepairPass = (text) => {
  if (!/[\n\t]/.test(text)) return null;
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) {
        escaped = false;
        out += ch;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        out += ch;
        continue;
      }
      if (ch === '"') {
        inString = false;
        out += ch;
        continue;
      }
      if (ch === '\n') {
        out += '\\n';
        continue;
      }
      if (ch === '\t') {
        out += '\\t';
        continue;
      }
      if (ch === '\r') {
        out += '\\r';
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === '"') inString = true;
    out += ch;
  }
  return out;
};

/**
 * Normalizes smart quotes and single-quoted strings. Runs BEFORE the
 * quote-aware passes need it; the apostrophe hazard ("it's") is handled by
 * only converting a `'` that opens a VALUE/KEY position (preceded by
 * `{`, `[`, `,`, `:` or whitespace-after-those), never one inside a word.
 */
const normalizeQuotes: RepairPass = (text) => {
  if (!text.includes('\u201c') && !text.includes('\u201d') && !text.includes('\u2018') && !text.includes('\u2019') && !text.includes("'")) {
    return null;
  }
  let out = text.replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'");
  // Convert single-quoted strings to double-quoted, tracking JSON string
  // context so an apostrophe inside prose never gets touched.
  let result = '';
  let inString = false;
  for (let i = 0; i < out.length; i += 1) {
    const ch = out[i];
    if (inString) {
      if (ch === '\\') {
        result += ch + (out[i + 1] ?? '');
        i += 1;
        continue;
      }
      if (ch === '"') {
        inString = false;
        result += ch;
        continue;
      }
      result += ch;
      continue;
    }
    if (ch === '"') {
      inString = true;
      result += ch;
      continue;
    }
    if (ch === "'") {
      // Find the closing ' (no escape handling needed for model output).
      const close = out.indexOf("'", i + 1);
      if (close === -1) return null; // Unbalanced; leave for later passes.
      result += `"${out.slice(i + 1, close).replace(/"/g, '\\"')}"`;
      i = close;
      continue;
    }
    result += ch;
  }
  return result;
};

/** Quotes bare keys (`{key: 1}` → `{"key": 1}`) and repairs Python-style keywords. */
const quoteBareKeys: RepairPass = (text) => {
  if (!/[A-Za-z_$][A-Za-z0-9_$]*\s*:/.test(text)) return null;
  let out = text;
  // A bare key is an identifier followed by optional space then a colon, NOT
  // inside a string. Track string state while replacing.
  let result = '';
  let inString = false;
  for (let i = 0; i < out.length; i += 1) {
    const ch = out[i];
    if (inString) {
      if (ch === '\\') {
        result += ch + (out[i + 1] ?? '');
        i += 1;
        continue;
      }
      if (ch === '"') inString = false;
      result += ch;
      continue;
    }
    if (ch === '"') {
      inString = true;
      result += ch;
      continue;
    }
    const match = out.slice(i).match(/^[A-Za-z_$][A-Za-z0-9_$]*(\s*:)/);
    if (match) {
      result += `"${out.slice(i, i + match[0].length - match[1].length)}"${match[1]}`;
      i += match[0].length - 1;
      continue;
    }
    result += ch;
  }
  // Python-style booleans/null leak through from code-flavored models.
  out = result.replace(/:\s*True\b/g, ': true').replace(/:\s*False\b/g, ': false').replace(/:\s*None\b/g, ': null');
  return out;
};

/** Removes trailing commas before `}` or `]`. */
const removeTrailingCommas: RepairPass = (text) => {
  if (!/,\s*[}\]]/.test(text)) return null;
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === ',') {
      let look = i + 1;
      while (look < text.length && /\s/.test(text[look])) look += 1;
      const next = text[look];
      if (next === '}' || next === ']') continue; // Drop the comma; keep scanning (the closer is emitted next loop).
      out += ch;
      continue;
    }
    out += ch;
  }
  return out;
};

/**
 * Closes a truncated payload: appends the brackets/quotes that would have
 * been written. `{`/`[` push, `}`/`]` pop, strings track their own state, so
 * `{"a": [1, 2` → `{"a": [1, 2]}` and `{"a": "he` → `{"a": "he"}`. A dangling
 * `"key":` with no value becomes `"key": null` — the shape survives, and the
 * validators downstream already null-guard every field.
 */
const closeTruncated: RepairPass = (text) => {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  /** A string that ends the payload with no colon after it was a dangling key. */
  let danglingKey = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
        let look = i + 1;
        while (look < text.length && /\s/.test(text[look])) look += 1;
        danglingKey = look >= text.length;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      danglingKey = false;
      continue;
    }
    if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  let out = text;
  if (inString) out += '"';
  // A trailing comma, a dangling `"key":`, or a dangling `"key"` each needs
  // repair before the closes, or the shape loses its last field.
  const trimmed = out.trimEnd();
  if (/,\s*$/.test(trimmed)) out = trimmed.replace(/,\s*$/, '') + (out.slice(trimmed.length));
  else if (/:\s*$/.test(trimmed)) out = trimmed + ' null' + (out.slice(trimmed.length));
  else if (danglingKey && !inString) out = trimmed + ': null' + (out.slice(trimmed.length));
  while (stack.length > 0) out += stack.pop();
  return out !== text ? out : null;
};

/**
 * Salvages the longest parseable prefix when nothing else worked: walks the
 * text, tracks structure, and at each complete element boundary tries
 * `closeTruncated` on the slice. More invasive than closing the whole
 * payload because it DISCARDS trailing content.
 */
const salvagePrefix: RepairPass = (text) => {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  /** Offsets just past complete elements — the only places a cut can parse. */
  const boundaries: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
        // A completed string is a boundary (value or key end).
        boundaries.push(i + 1);
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{' || ch === '[') {
      stack.push(ch === '{' ? '}' : ']');
      continue;
    }
    if (ch === '}' || ch === ']') {
      stack.pop();
      boundaries.push(i + 1);
      continue;
    }
    // A value boundary outside strings: number/true/false/null end.
    const value = text.slice(i).match(/^(?:\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)(?=[,}\]\s]|$)/);
    if (value) {
      boundaries.push(i + value[0].length);
      i += value[0].length - 1;
    }
  }
  // Longest prefix first: salvage keeps as much of the generation as possible.
  for (const cut of [...boundaries].reverse()) {
    const slice = text.slice(0, cut).trimEnd();
    if (!slice) continue;
    // The slice may already be balanced (cumulative candidates arrive
    // pre-closed) — that is still a salvageable prefix, so try it bare before
    // asking closeTruncated to add anything.
    try {
      JSON.parse(slice);
      return slice;
    } catch {
      // Not balanced as-is; try closing it.
    }
    const repaired = closeTruncated(slice);
    if (repaired) {
      try {
        JSON.parse(repaired);
        return repaired;
      } catch {
        // Keep walking back toward shorter prefixes.
      }
    }
  }
  return null;
};

/** Ordered from most faithful to most invasive. */
const PASSES: { name: string; pass: RepairPass }[] = [
  { name: 'control-chars', pass: escapeControlChars },
  { name: 'quotes', pass: normalizeQuotes },
  { name: 'bare-keys', pass: quoteBareKeys },
  { name: 'trailing-commas', pass: removeTrailingCommas },
  { name: 'truncation-close', pass: closeTruncated },
  { name: 'prefix-salvage', pass: salvagePrefix },
];

/**
 * One repair outcome: the repaired text, the pass that produced it, and its
 * position in the ladder. `contentLength` — the repaired text's own length —
 * is the faithfulness metric: repairs only append closing structure or
 * escape characters and never invent string content, so a longer VALID
 * repair keeps more of what the model actually wrote. A null-fill repair is
 * always shorter than the real value it replaced, so it can never outrank
 * the honest repair of the same field. Measuring the immediate candidate
 * instead would be wrong: passes run cumulatively, so a candidate's length
 * includes characters earlier passes inserted.
 */
interface RepairedCandidate {
  text: string;
  via: string;
  order: number;
}

/**
 * Attempts to repair malformed model JSON. Returns null when nothing
 * parseable can be produced — the caller then decides between a retry,
 * a fallback model, or a validated degradation.
 *
 * Ladder: as-is → every repair pass, applied cumulatively to every candidate
 * (raw and prose-stripped — fences plus trailing commas co-occur). All
 * layers always run, and the winner is the parse whose repaired text is
 * longest (most source content preserved), with the least invasive pass as
 * tiebreak. Running the whole ladder instead of stopping at the first parse
 * is what keeps a null-filled field from beating the real content the raw
 * text still carried.
 */
export function repairJson(raw: string): RepairResult | null {
  const text = typeof raw === 'string' ? raw : '';
  if (!text.trim()) return null;

  const trimmed = text.trim();
  const stripped = extractJson(text);

  // Perfect faithfulness: if either form already parses, done.
  for (const candidate of [trimmed, stripped]) {
    if (!candidate) continue;
    try {
      return { value: JSON.parse(candidate), via: 'as-is' };
    } catch {
      // Repair passes next.
    }
  }

  const seen = new Set<string>();
  let working: string[] = [];
  for (const candidate of [trimmed, stripped]) {
    if (candidate && !seen.has(candidate)) {
      seen.add(candidate);
      working.push(candidate);
    }
  }

  const produced: RepairedCandidate[] = [];
  PASSES.forEach(({ name, pass }, order) => {
    const next: string[] = [];
    for (const candidate of working) {
      const repaired = pass(candidate);
      if (repaired === null || repaired === candidate || seen.has(repaired)) continue;
      seen.add(repaired);
      next.push(repaired);
      produced.push({ text: repaired, via: name, order });
    }
    if (next.length > 0) working = [...next, ...working];
  });

  let best: { value: unknown; via: string; contentLength: number; order: number } | null = null;
  for (const candidate of produced) {
    try {
      const value = JSON.parse(candidate.text);
      if (
        best === null ||
        candidate.text.length > best.contentLength ||
        (candidate.text.length === best.contentLength && candidate.order < best.order)
      ) {
        best = { value, via: candidate.via, contentLength: candidate.text.length, order: candidate.order };
      }
    } catch {
      // This repair still is not valid JSON; another candidate may be.
    }
  }
  return best ? { value: best.value, via: best.via } : null;
}
