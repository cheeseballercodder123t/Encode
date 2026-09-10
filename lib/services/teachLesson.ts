import {
  Activity,
  EncodingMode,
  LessonQuestion,
  LessonSegment,
  LessonSegmentType,
  TeachLesson,
} from '@/lib/types';

// ─── TEACH ME lesson sanitizer + offline fallback builder ───────────────────
// The AI is the author, but its output is untrusted. Every field it can touch
// is coerced here into a shape TeachMeModal can render without errors.
// Mirrors the defensive style of offlineGenerator.ts / procedural-validator.ts.

const SEGMENT_TYPES: LessonSegmentType[] = [
  'concept',
  'checkpoint',
  'guidedProblem',
  'youTry',
  'memoryHook',
  'storyBeat',
  'wrapup',
];

const QUESTION_KINDS = ['mcq', 'ordering', 'matching', 'fillBlank', 'freeResponse', 'trueFalse'];

const MAX_SEGMENTS = 24;
const MAX_OPTIONS = 6;
const MAX_HINTS = 4;
const MAX_ITEMS = 8;
const MAX_STEPS = 8;
const MAX_TERMS = 8;
const MAX_CHARS = 2000;

const DEFAULT_XP: Record<LessonSegmentType, number> = {
  concept: 5,
  checkpoint: 15,
  guidedProblem: 20,
  youTry: 25,
  memoryHook: 8,
  storyBeat: 8,
  wrapup: 0,
};

function clampInt(value: any, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : NaN;
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function str(value: any, max = MAX_CHARS): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function strArr(value: any, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const s = str(item, 240);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function sanitizeQuestion(input: any): LessonQuestion | null {
  if (!input || typeof input !== 'object') return null;
  const rawKind = str(input.kind, 40);
  let kind = QUESTION_KINDS.includes(rawKind) ? rawKind : '';

  // Kind is optional: derive it from whatever payload the AI actually shipped.
  if (!kind) {
    if (Array.isArray(input.options)) kind = 'mcq';
    else if (Array.isArray(input.items)) kind = 'ordering';
    else if (Array.isArray(input.pairs)) kind = 'matching';
    else if (Array.isArray(input.blanks)) kind = 'fillBlank';
    else if (str(input.modelAnswer, 40)) kind = 'freeResponse';
    else return null;
  }

  const prompt = str(input.prompt, 600);
  if (!prompt) return null;

  const q: LessonQuestion = {
    kind: kind as LessonQuestion['kind'],
    prompt,
  };

  if (kind === 'mcq' || kind === 'trueFalse') {
    const rawOptions = Array.isArray(input.options) ? input.options : [];
    let opts: NonNullable<LessonQuestion['options']> = rawOptions.slice(0, MAX_OPTIONS)
      .filter((o: any) => o && typeof o === 'object' && str(o.label, 300))
      .map((o: any, i: number) => ({
        id: str(o.id, 40) || `opt_${i + 1}`,
        label: str(o.label, 300),
        correct: Boolean(o.correct),
        explanation: str(o.explanation || o.feedback, 500),
      }));
    if (opts.length >= 2 && !opts.some((o) => o.correct)) {
      // AI forgot to flag a correct answer : pick defensively so the player
      // stays functional instead of bricking the checkpoint.
      opts[0].correct = true;
      if (!opts[0].explanation) {
        opts[0].explanation = 'Correct answer (flagged by fallback).';
      }
    }
    if (kind === 'trueFalse' && opts.length === 0) {
      opts = [
        { id: 'opt_t', label: 'True', correct: true, explanation: '' },
        { id: 'opt_f', label: 'False', correct: false, explanation: '' },
      ];
    }
    q.options = opts;
  } else if (kind === 'ordering') {
    q.items = (Array.isArray(input.items) ? input.items : [])
      .slice(0, MAX_ITEMS)
      .filter((it: any) => it && typeof it === 'object' && str(it.label, 300))
      .map((it: any, i: number) => ({
        id: str(it.id, 40) || `item_${i + 1}`,
        label: str(it.label, 300),
        correctIndex: clampInt(it.correctIndex, 0, MAX_ITEMS - 1, i),
      }));
  } else if (kind === 'matching') {
    const rawPairs = Array.isArray(input.pairs) ? input.pairs : [];
    const mappedPairs: NonNullable<LessonQuestion['pairs']> = rawPairs
      .slice(0, MAX_ITEMS)
      .filter((p: any) => p && typeof p === 'object' && str(p.left, 240) && str(p.right, 240))
      .map((p: any, i: number) => ({
        id: str(p.id, 40) || `pair_${i + 1}`,
        left: str(p.left, 240),
        right: str(p.right, 240),
      }));
    // Strip pairs with duplicated right sides : they can't be matched uniquely.
    const seen = new Set<string>();
    const dedupedPairs = mappedPairs.filter((p) => {
      const key = p.right.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    q.pairs = dedupedPairs;
  } else if (kind === 'fillBlank') {
    q.blanks = (Array.isArray(input.blanks) ? input.blanks : [])
      .slice(0, MAX_ITEMS)
      .filter((b: any) => b && typeof b === 'object' && str(b.answer, 160))
      .map((b: any, i: number) => ({
        id: str(b.id, 40) || `blank_${i + 1}`,
        before: str(b.before, 300),
        answer: str(b.answer, 160),
        after: str(b.after, 300),
      }));
    if (!q.blanks || q.blanks.length === 0) return null;
  } else if (kind === 'freeResponse') {
    q.modelAnswer = str(input.modelAnswer, MAX_CHARS);
    if (!q.modelAnswer) return null;
  }

  q.hints = strArr(input.hints, MAX_HINTS);
  return q;
}
function sanitizeVisual(input: any): LessonSegment['visual'] {
  if (!input || typeof input !== 'object') return undefined;
  const kinds = ['steps', 'analogy', 'list', 'formula', 'diagram'];
  const kind = kinds.includes(str(input.kind, 30)) ? str(input.kind, 30) : 'steps';

  const visual: NonNullable<LessonSegment['visual']> = {
    kind: kind as 'steps',
    callout: str(input.callout, 400) || undefined,
  };

  if (Array.isArray(input.lines)) {
    visual.lines = input.lines
      .slice(0, 12)
      .filter((l: any) => l && typeof l === 'object' && str(l.label, 240))
      .map((l: any) => ({ label: str(l.label, 240), detail: str(l.detail, 600) || undefined }));
  }
  if (Array.isArray(input.analogyPairs)) {
    visual.analogyPairs = input.analogyPairs
      .slice(0, 8)
      .filter((p: any) => p && typeof p === 'object' && str(p.source, 240) && str(p.target, 240))
      .map((p: any) => ({
        source: str(p.source, 240),
        target: str(p.target, 240),
        note: str(p.note, 600) || undefined,
      }));
  }
  return visual;
}

export function sanitizeSegment(input: any, idx: number): LessonSegment | null {
  if (!input || typeof input !== 'object') return null;

  const typeRaw = str(input.type, 40);
  const type = (SEGMENT_TYPES as readonly string[]).includes(typeRaw) ? (typeRaw as LessonSegmentType) : 'concept';

  const seg: LessonSegment = {
    id: str(input.id, 60) || `seg_${idx + 1}`,
    type,
    title: str(input.title, 180) || undefined,
    body: str(input.body, MAX_CHARS) || undefined,
    keyTerms: strArr(input.keyTerms, MAX_TERMS),
    trapNote: str(input.trapNote, 600) || undefined,
    chapterTitle: str(input.chapterTitle, 120) || undefined,
    phrase: str(input.phrase, 500) || undefined,
    narrative: str(input.narrative, MAX_CHARS) || undefined,
    continuation: str(input.continuation, MAX_CHARS) || undefined,
    finalAnswer: str(input.finalAnswer, MAX_CHARS) || undefined,
    linkedList: strArr(input.linkedList, MAX_TERMS),
    xpValue: clampInt(input.xpValue, 0, 60, DEFAULT_XP[type]),
  };

  const visual = sanitizeVisual(input.visual);
  if (visual) seg.visual = visual;

  if (Array.isArray(input.steps)) {
    seg.steps = input.steps
      .slice(0, MAX_STEPS)
      .filter((s: any) => s && typeof s === 'object' && str(s.title, 240) && str(s.detail, 800))
      .map((s: any) => ({ title: str(s.title, 240), detail: str(s.detail, 800) }));
  }

  const question = sanitizeQuestion(input.question);
  if (question) seg.question = question;

  // Fallback defluff : a body-less non-interactive segment teaches nothing.
  if (
    !seg.body &&
    !seg.question &&
    !seg.steps?.length &&
    !seg.phrase &&
    !seg.narrative &&
    !seg.visual
  ) {
    return null;
  }
  return seg;
}
/**
 * Coerces raw AI output into a render-safe TeachLesson. Returns null for
 * completely unusable payloads (caller falls back to buildFallbackLesson).
 */
export function sanitizeLesson(input: any): TeachLesson | null {
  if (!input || typeof input !== 'object') return null;

  const lesson = input.lesson && typeof input.lesson === 'object' ? input.lesson : input;
  const rawSegments = Array.isArray(lesson.segments) ? lesson.segments : [];
  if (rawSegments.length === 0 && !str(lesson.title, 120)) return null;

  const segments: LessonSegment[] = [];
  for (let i = 0; i < rawSegments.length && segments.length < MAX_SEGMENTS; i++) {
    const seg = sanitizeSegment(rawSegments[i], i);
    if (seg) segments.push(seg);
  }

  const title = str(lesson.title, 160) || 'Interactive Lesson';
  const sanitized: TeachLesson = {
    title,
    tagline: str(lesson.tagline, 300) || undefined,
    estimatedMin: clampInt(lesson.estimatedMin, 1, 60, Math.max(1, Math.round(segments.length * 0.7))),
    segments,
  };

  if (lesson.intro && typeof lesson.intro === 'object') {
    const hook = str(lesson.intro.hook, 600);
    const why = str(lesson.intro.whyItMatters, 600);
    if (hook || why) sanitized.intro = { hook: hook || undefined, whyItMatters: why || undefined };
  }

  if (lesson.masteryCheck && typeof lesson.masteryCheck === 'object') {
    const prompt = str(lesson.masteryCheck.prompt, 800);
    if (prompt) {
      const mc = lesson.masteryCheck;
      sanitized.masteryCheck = {
        prompt,
        keywords: strArr(mc.keywords, MAX_TERMS),
        modelAnswer: str(mc.modelAnswer, MAX_CHARS) || undefined,
        hints: strArr(mc.hints, MAX_HINTS),
      };
    }
  }

  if (lesson.wrapup && typeof lesson.wrapup === 'object') {
    const summary = str(lesson.wrapup.summary, MAX_CHARS);
    const cta = str(lesson.wrapup.callToAction, 400);
    const conn = str(lesson.wrapup.connectionPrompt, 600);
    if (summary || cta || conn) {
      sanitized.wrapup = {
        summary: summary || undefined,
        callToAction: cta || undefined,
        connectionPrompt: conn || undefined,
      };
    }
  }

  return sanitized;
}
// ─── Deterministic offline fallback ──────────────────────────────────────────
// When the AI is unreachable, teach from the schema itself (the firing order
// is exactly the Generation Effect arc : premise → clue → mechanism → verify).

export function buildFallbackLesson(
  topicSummary: string,
  mode: EncodingMode = 'conceptual',
  activity?: Activity
): TeachLesson {
  const t = str(topicSummary, 160) || 'This Topic';

  if (!activity) {
    return {
      title: `${t} : Core Lesson`,
      segments: [
        {
          id: 'fb_concept',
          type: 'concept',
          title: 'The Core Idea',
          body: `We're going to build an intuition for ${t}, then verify it with a quick checkpoint.`,
          xpValue: 5,
        },
        {
          id: 'fb_ck',
          type: 'checkpoint',
          title: 'Quick Check',
          question: {
            kind: 'trueFalse',
            prompt: 'Once you can explain the mechanism of a concept in plain language, you understand it.',
            options: [
              { id: 't', label: 'True', correct: true, explanation: 'Explaining in plain language is the Feynman test.' },
              { id: 'f', label: 'False', correct: false, explanation: 'Jargon repetition is not understanding.' },
            ],
          },
          xpValue: 15,
        },
        { id: 'fb_wrap', type: 'wrapup', title: 'Wrap Up', body: `Anchor ${t} in your own words and it will stick.`, xpValue: 0 },
      ],
    };
  }

  const gc = activity.visualData?.generationChallenge;
  const segments: LessonSegment[] = [
    {
      id: 'fb_concept',
      type: 'concept',
      title: activity.title || 'The Core Idea',
      body: activity.contextSnippet || activity.prompt,
      keyTerms: activity.keywords.slice(0, 8),
      xpValue: 5,
    },
  ];

  if (gc?.premisePrompt) {
    segments.push({
      id: 'fb_hook',
      type: 'storyBeat',
      title: 'The Premise',
      narrative: gc.premisePrompt,
      continuation: gc.clue || 'Now work out the missing piece.',
      xpValue: 8,
    });
  }

  const confusable = activity.boundaryContrast?.confusableLookalike;
  const trapDistractor = confusable || 'A vague paraphrase that sounds right';
  segments.push({
    id: 'fb_ck',
    type: 'checkpoint',
    title: 'Checkpoint',
    question: {
      kind: 'mcq',
      prompt: `Which statement best captures the mechanism of "${activity.title}"?`,
      options: [
        { id: 'a', label: activity.scaffold.exampleAnswer || 'The mechanistic explanation', correct: true, explanation: activity.boundaryContrast?.distinguishingRule || 'This is the first-principles mechanism.' },
        { id: 'b', label: trapDistractor, correct: false, explanation: 'Trap : this is the confusable lookalike — watch the boundary rule.' },
        { id: 'c', label: 'It just happens automatically', correct: false, explanation: 'Too vague : every mechanism has a trigger and a sequence.' },
      ],
      hints: [activity.boundaryContrast?.distinguishingRule as string].filter(Boolean),
    },
    trapNote: 'Confusable lookalike detected.',
    xpValue: 15,
  });

  if (gc?.expertCompletion && gc?.missingRoleOrTarget) {
    segments.push({
      id: 'fb_guided',
      type: 'guidedProblem',
      title: 'Worked Example',
      steps: [
        { title: 'Start from the premise', detail: gc.premisePrompt || gc.missingRoleOrTarget },
        { title: 'Follow the clue', detail: gc.clue || 'Apply the mechanism step by step.' },
        { title: 'Complete the mechanism', detail: gc.missingRoleOrTarget },
      ],
      finalAnswer: gc.expertCompletion,
      xpValue: 20,
    });
  }

  segments.push({
    id: 'fb_youtry',
    type: 'youTry',
    title: 'Your Turn',
    question: {
      kind: 'freeResponse',
      prompt: activity.scaffold.field1Label || 'Explain the mechanism in your own words.',
      modelAnswer: gc?.expertCompletion || activity.scaffold.exampleAnswer,
      hints: [activity.boundaryContrast?.distinguishingRule || ''],
    },
    xpValue: 25,
  });

  segments.push({
    id: 'fb_wrap',
    type: 'wrapup',
    title: 'Wrap Up',
    body: `You reconstructed "${activity.title}" from the mechanism up.`,
    xpValue: 0,
  });

  return {
    title: `${t} : Core Lesson`,
    tagline: `Taught from the ${mode === 'memorization' ? 'mnemonic' : 'conceptual'} schema`,
    segments,
  };
}