// ─── Slide Deck Parser & Auto-Segmenter ──────────────────────────────────────
//
// Students frequently paste multi-slide lecture presentations (e.g. from Google
// Slides, PowerPoint, PDF text dumps, or Gemini chats).
// Draining 20-40 slides into a single monolithic model prompt causes the model to
// either aggressively summarize or miss subtle mechanisms.
//
// This parser segments multi-slide lecture notes into clean, discrete slide units
// with isolated titles, slide numbers, body text, and speaker notes so the
// Flashcard Forge can forge high-resolution cards per slide concurrently.

export interface ParsedSlide {
  slideNumber: number;
  title: string;
  body: string;
  speakerNotes?: string;
  combinedText: string;
  wordCount: number;
}

export interface SlideDeckParseResult {
  isSlideDeck: boolean;
  presentationTitle?: string;
  slides: ParsedSlide[];
  totalWordCount: number;
}

const SLIDE_HEADER_REGEX = /(?:^|\n)\s*(?:---+)?\s*(?:Slide\s+(\d+)(?:\s*(?:of|\/)\s*\d+)?|\[Slide\s+(\d+)\]|#+\s*Slide\s+(\d+))(?:\s*---+|\s*[:.-])?\s*/gi;

/**
 * Quick detector to test if text contains multi-slide presentation structure.
 */
export function detectSlideDeck(text: string): boolean {
  if (!text || text.trim().length < 30) return false;
  const matches = [...text.matchAll(new RegExp(SLIDE_HEADER_REGEX))];
  return matches.length >= 2;
}

/**
 * Extracts optional presentation title from common header lines.
 */
function extractPresentationTitle(text: string): { title?: string; remainingText: string } {
  const titleMatch = text.match(/^(?:Presentation|Lecture|Deck|Topic):\s*([^\n]+)/i);
  if (titleMatch) {
    const title = titleMatch[1].trim();
    const remainingText = text.slice(titleMatch[0].length).trim();
    return { title, remainingText };
  }
  return { remainingText: text };
}

/**
 * Parses slide content into body and optional speaker notes.
 */
function parseSlideContent(rawChunk: string): { body: string; speakerNotes?: string } {
  const notesSplit = rawChunk.split(/(?:---+\s*Speaker Notes\s*---+|Speaker Notes:\s*)/i);
  let body = notesSplit[0]
    .replace(/---+\s*Slide Content\s*---+/gi, '')
    .trim();
  let speakerNotes: string | undefined = undefined;

  if (notesSplit.length > 1) {
    speakerNotes = notesSplit.slice(1).join('\n').trim();
  }

  return { body, speakerNotes };
}

/**
 * Derives a clean, concise title from the slide body.
 */
function deriveSlideTitle(body: string, slideNumber: number): string {
  const cleaned = body
    .replace(/---+\s*Slide Content\s*---+/gi, '')
    .trim();
  const lines = cleaned.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const stripped = line.replace(/^[#\-*•\d.:()]+\s*/, '').replace(/---+/g, '').trim();
    if (stripped.length > 2 && stripped.length <= 60 && !/^slide content/i.test(stripped)) {
      return `Slide ${slideNumber}: ${stripped}`;
    }
  }
  return `Slide ${slideNumber}`;
}

/**
 * Parses full multi-slide presentation text into discrete slide models.
 */
export function parseSlideDeck(rawText: string): SlideDeckParseResult {
  const trimmed = (rawText || '').trim();
  if (!trimmed) {
    return { isSlideDeck: false, slides: [], totalWordCount: 0 };
  }

  const { title: presentationTitle, remainingText } = extractPresentationTitle(trimmed);

  // Find all slide header boundaries in remainingText
  const matches = [...remainingText.matchAll(new RegExp(SLIDE_HEADER_REGEX))];

  if (matches.length < 2) {
    // Check fallback: horizontal dividers separating slides
    const hrSplit = remainingText.split(/\n\s*---+\s*\n/).map((c) => c.trim()).filter(Boolean);
    if (hrSplit.length >= 2 && hrSplit.every((chunk) => chunk.length > 10)) {
      const slides: ParsedSlide[] = hrSplit.map((chunk, idx) => {
        const slideNumber = idx + 1;
        const { body, speakerNotes } = parseSlideContent(chunk);
        const title = deriveSlideTitle(body, slideNumber);
        const words = chunk.split(/\s+/).length;
        return {
          slideNumber,
          title,
          body,
          speakerNotes,
          combinedText: chunk,
          wordCount: words,
        };
      });

      const totalWords = slides.reduce((sum, s) => sum + s.wordCount, 0);
      return {
        isSlideDeck: true,
        presentationTitle,
        slides,
        totalWordCount: totalWords,
      };
    }

    return {
      isSlideDeck: false,
      presentationTitle,
      slides: [],
      totalWordCount: trimmed.split(/\s+/).length,
    };
  }

  const slides: ParsedSlide[] = [];

  for (let i = 0; i < matches.length; i++) {
    const currentMatch = matches[i];
    const startIndex = currentMatch.index + currentMatch[0].length;
    const endIndex = i + 1 < matches.length ? matches[i + 1].index : remainingText.length;
    const contentText = remainingText.slice(startIndex, endIndex).trim();

    const slideNumber = currentMatch[1]
      ? parseInt(currentMatch[1], 10)
      : currentMatch[2]
      ? parseInt(currentMatch[2], 10)
      : currentMatch[3]
      ? parseInt(currentMatch[3], 10)
      : i + 1;

    const { body, speakerNotes } = parseSlideContent(contentText);
    const title = deriveSlideTitle(body || contentText, slideNumber);
    const combined = currentMatch[0].trim() + '\n' + contentText;
    const words = combined.split(/\s+/).length;

    slides.push({
      slideNumber,
      title,
      body: body || contentText,
      speakerNotes,
      combinedText: combined,
      wordCount: words,
    });
  }

  const isSlideDeck = slides.length >= 2;
  const totalWordCount = slides.reduce((sum, s) => sum + s.wordCount, 0);

  return {
    isSlideDeck,
    presentationTitle,
    slides: isSlideDeck ? slides : [],
    totalWordCount,
  };
}
