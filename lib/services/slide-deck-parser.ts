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

export interface DiagramOcclusionLabel {
  index: number;
  label: string;
  position?: string;
}

export interface ParsedSlide {
  slideNumber: number;
  title: string;
  body: string;
  speakerNotes?: string;
  combinedText: string;
  wordCount: number;
  isLikelyFluff?: boolean;
  fluffReason?: string;
  hasDiagram?: boolean;
  diagramLabels?: DiagramOcclusionLabel[];
}

export interface SlideDeckParseResult {
  isSlideDeck: boolean;
  presentationTitle?: string;
  slides: ParsedSlide[];
  totalWordCount: number;
  contentSlidesCount: number;
  fluffSlidesCount: number;
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
 * Extracts diagram occlusion labels from raw text with spatial slot markers.
 */
export function parseDiagramLabels(text: string): DiagramOcclusionLabel[] {
  const diagramSplit = text.split(/(?:---+\s*Diagram & Spatial Labels\s*---+|Diagram & Spatial Labels:\s*)/i);
  if (diagramSplit.length <= 1) return [];
  const rawLabels = diagramSplit[1].split(/(?:---+\s*Speaker Notes\s*---+|---+\s*Selected Text\s*---+|\n\s*#+\s*Slide|\n\s*Slide\s+\d+)/i)[0].trim();
  const labelLines = rawLabels.split('\n').map((l) => l.trim()).filter(Boolean);
  const parsedLabels: DiagramOcclusionLabel[] = [];
  labelLines.forEach((line, idx) => {
    const m = line.match(/(?:\[(?:Slot|Label)\s*(\d+)\]|(\d+)\.)[:.-]?\s*"([^"]+)"(?:\s*\(([^)]+)\))?/i);
    if (m) {
      parsedLabels.push({
        index: m[1] ? parseInt(m[1], 10) : m[2] ? parseInt(m[2], 10) : idx + 1,
        label: m[3].trim(),
        position: m[4]?.trim(),
      });
    } else {
      const bulletMatch = line.match(/^[#\-*•\d.:()]+\s*(.+?)(?:\s*\(([^)]+)\))?$/);
      if (bulletMatch && bulletMatch[1]) {
        parsedLabels.push({
          index: idx + 1,
          label: bulletMatch[1].replace(/^["']|["']$/g, '').trim(),
          position: bulletMatch[2]?.trim(),
        });
      }
    }
  });
  return parsedLabels;
}

/**
 * Parses slide content into body, optional speaker notes, and diagram labels.
 */
function parseSlideContent(rawChunk: string): {
  body: string;
  speakerNotes?: string;
  diagramLabels?: DiagramOcclusionLabel[];
} {
  const notesSplit = rawChunk.split(/(?:---+\s*Speaker Notes\s*---+|Speaker Notes:\s*)/i);
  let mainContent = notesSplit[0];
  let speakerNotes: string | undefined = undefined;

  if (notesSplit.length > 1) {
    speakerNotes = notesSplit.slice(1).join('\n').trim();
  }

  const diagramLabels = parseDiagramLabels(mainContent);
  const diagramSplit = mainContent.split(/(?:---+\s*Diagram & Spatial Labels\s*---+|Diagram & Spatial Labels:\s*)/i);
  if (diagramSplit.length > 1) {
    mainContent = diagramSplit[0];
  }

  const body = mainContent
    .replace(/---+\s*Slide Content\s*---+/gi, '')
    .trim();

  return {
    body,
    speakerNotes,
    diagramLabels: diagramLabels.length > 0 ? diagramLabels : undefined,
  };
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
 * Detects if a slide is likely low-yield fluff (course admin, agenda, end slide, or empty divider).
 */
export function detectSlideFluff(
  body: string,
  title: string,
  slideNumber: number,
  totalSlides?: number
): { isFluff: boolean; reason?: string } {
  const combined = `${title}\n${body}`.trim();
  const words = combined.split(/\s+/).filter(Boolean).length;

  // 1. Title / Course administration on first slide
  if (slideNumber === 1) {
    const hasLogistics =
      /\b(?:syllabus|welcome to|instructor:|professor:|office hours|fall\s*20\d\d|spring\s*20\d\d|course overview|lecture \d+ overview)\b/i.test(
        combined
      );
    const isVeryShort =
      words < 15 &&
      !/\b(?:voltage|membrane|enzyme|reaction|algorithm|theorem|formula|equation|circuit|cell|protein|pump)\b/i.test(
        combined
      );
    if (hasLogistics || isVeryShort) {
      return { isFluff: true, reason: 'Title / Course logistics' };
    }
  }

  // 2. Agenda / Outline / Table of Contents
  if (
    /\b(?:agenda|table of contents|lecture overview|class outline|roadmap|today's plan|schedule)\b/i.test(
      title
    ) &&
    words < 60
  ) {
    return { isFluff: true, reason: 'Agenda / Outline' };
  }

  // 3. Wrap-up, Q&A, References, Acknowledgments
  if (
    /\b(?:questions\??|q\s*&\s*a|any questions|thank you|thanks!|references|bibliography|sources|reading list|announcements|homework|reminders)\b/i.test(
      title
    )
  ) {
    return { isFluff: true, reason: 'Q&A / End slide' };
  }

  if (
    words < 15 &&
    /\b(?:questions\??|thank you|see you next class|have a great weekend)\b/i.test(combined)
  ) {
    return { isFluff: true, reason: 'Q&A / End slide' };
  }

  // 4. Section Divider / Almost empty
  if (words < 8 && !/\b(?:definition|formula|equation)\b/i.test(combined)) {
    return { isFluff: true, reason: 'Divider slide' };
  }

  return { isFluff: false };
}

/**
 * Parses full multi-slide presentation text into discrete slide models.
 */
export function parseSlideDeck(rawText: string): SlideDeckParseResult {
  const trimmed = (rawText || '').trim();
  if (!trimmed) {
    return { isSlideDeck: false, slides: [], totalWordCount: 0, contentSlidesCount: 0, fluffSlidesCount: 0 };
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
        const { body, speakerNotes, diagramLabels } = parseSlideContent(chunk);
        const title = deriveSlideTitle(body, slideNumber);
        const words = chunk.split(/\s+/).length;
        const fluffCheck = detectSlideFluff(body, title, slideNumber, hrSplit.length);
        const hasDiagram = Boolean(diagramLabels && diagramLabels.length > 0);
        return {
          slideNumber,
          title,
          body,
          speakerNotes,
          diagramLabels,
          hasDiagram,
          combinedText: chunk,
          wordCount: words,
          isLikelyFluff: fluffCheck.isFluff,
          fluffReason: fluffCheck.reason,
        };
      });

      const totalWords = slides.reduce((sum, s) => sum + s.wordCount, 0);
      return {
        isSlideDeck: true,
        presentationTitle,
        slides,
        totalWordCount: totalWords,
        contentSlidesCount: slides.filter((s) => !s.isLikelyFluff).length,
        fluffSlidesCount: slides.filter((s) => !!s.isLikelyFluff).length,
      };
    }

    return {
      isSlideDeck: false,
      presentationTitle,
      slides: [],
      totalWordCount: trimmed.split(/\s+/).length,
      contentSlidesCount: 0,
      fluffSlidesCount: 0,
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

    const { body, speakerNotes, diagramLabels } = parseSlideContent(contentText);
    const title = deriveSlideTitle(body || contentText, slideNumber);
    const combined = currentMatch[0].trim() + '\n' + contentText;
    const words = combined.split(/\s+/).length;

    const fluffCheck = detectSlideFluff(body || contentText, title, slideNumber, matches.length);
    const hasDiagram = Boolean(diagramLabels && diagramLabels.length > 0);

    slides.push({
      slideNumber,
      title,
      body: body || contentText,
      speakerNotes,
      diagramLabels,
      hasDiagram,
      combinedText: combined,
      wordCount: words,
      isLikelyFluff: fluffCheck.isFluff,
      fluffReason: fluffCheck.reason,
    });
  }

  const isSlideDeck = slides.length >= 2;
  const totalWordCount = slides.reduce((sum, s) => sum + s.wordCount, 0);

  return {
    isSlideDeck,
    presentationTitle,
    slides: isSlideDeck ? slides : [],
    totalWordCount,
    contentSlidesCount: isSlideDeck ? slides.filter((s) => !s.isLikelyFluff).length : 0,
    fluffSlidesCount: isSlideDeck ? slides.filter((s) => !!s.isLikelyFluff).length : 0,
  };
}
