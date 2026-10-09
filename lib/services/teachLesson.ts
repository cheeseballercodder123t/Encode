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
  'deepDive',
  'checkpoint',
  'guidedProblem',
  'youTry',
  'misconception',
  'selfExplain',
  'transfer',
  'memoryHook',
  'storyBeat',
  'recap',
  'wrapup',
];

const QUESTION_KINDS = ['mcq', 'ordering', 'matching', 'fillBlank', 'freeResponse', 'trueFalse'];

const MAX_SEGMENTS = 40;
const MAX_OPTIONS = 6;
const MAX_HINTS = 4;
const MAX_ITEMS = 8;
const MAX_STEPS = 8;
const MAX_TERMS = 8;
const MAX_CHARS = 2000;
const MAX_MISCONCEPTIONS = 4;
const MAX_RECAP_POINTS = 8;
const MAX_OBJECTIVES = 8;
const MAX_GLOSSARY = 16;
const MAX_SEEDS = 10;

const DEFAULT_XP: Record<LessonSegmentType, number> = {
  concept: 5,
  deepDive: 10,
  checkpoint: 15,
  guidedProblem: 20,
  youTry: 25,
  misconception: 12,
  selfExplain: 25,
  transfer: 25,
  memoryHook: 8,
  storyBeat: 8,
  recap: 5,
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
/** Misconception radar: the wrong belief plus the correction that kills it. */
function sanitizeMisconceptions(
  input: any
): NonNullable<LessonSegment['misconceptions']> {
  if (!Array.isArray(input)) return [];
  const out: NonNullable<LessonSegment['misconceptions']> = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const claim = str(item.claim || item.misconception, 400);
    const correction = str(item.correction || item.truth || item.fix, 600);
    if (!claim && !correction) continue;
    out.push({ claim, correction });
    if (out.length >= MAX_MISCONCEPTIONS) break;
  }
  return out;
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

  seg.why = str(input.why, MAX_CHARS) || undefined;

  const misconceptions = sanitizeMisconceptions(input.misconceptions);
  if (misconceptions.length > 0) seg.misconceptions = misconceptions;

  if (Array.isArray(input.recapPoints)) {
    const points = strArr(input.recapPoints, MAX_RECAP_POINTS);
    if (points.length > 0) seg.recapPoints = points;
  }

  if (input.selfExplain && typeof input.selfExplain === 'object') {
    const prompt = str(input.selfExplain.prompt, 600);
    if (prompt) {
      seg.selfExplain = {
        prompt,
        modelAnswer: str(input.selfExplain.modelAnswer, MAX_CHARS) || undefined,
        keywords: strArr(input.selfExplain.keywords, MAX_TERMS),
      };
    }
  }

  if (input.transfer && typeof input.transfer === 'object') {
    const prompt = str(input.transfer.prompt, 600);
    if (prompt) {
      seg.transfer = {
        prompt,
        modelAnswer: str(input.transfer.modelAnswer, MAX_CHARS) || undefined,
      };
    }
  }

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
    !seg.visual &&
    !seg.selfExplain &&
    !seg.transfer &&
    !seg.misconceptions?.length &&
    !seg.recapPoints?.length
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

  const objectives = strArr(lesson.objectives, MAX_OBJECTIVES);
  if (objectives.length > 0) sanitized.objectives = objectives;

  if (Array.isArray(lesson.glossary)) {
    const glossary: NonNullable<TeachLesson['glossary']> = [];
    for (const item of lesson.glossary) {
      if (!item || typeof item !== 'object') continue;
      const term = str(item.term, 120);
      const definition = str(item.definition, 800);
      if (!term || !definition) continue;
      glossary.push({ term, definition });
      if (glossary.length >= MAX_GLOSSARY) break;
    }
    if (glossary.length > 0) sanitized.glossary = glossary;
  }

  if (Array.isArray(lesson.encodingSeeds)) {
    const seeds: NonNullable<TeachLesson['encodingSeeds']> = [];
    for (const item of lesson.encodingSeeds) {
      if (!item || typeof item !== 'object') continue;
      const title = str(item.title || item.stageTitle, 180);
      const prompt = str(item.prompt || item.question, 600);
      const exemplar = str(item.exemplar || item.modelAnswer || item.exampleAnswer, MAX_CHARS);
      if (!title && !prompt) continue;
      seeds.push({ title, prompt, exemplar, keywords: strArr(item.keywords, MAX_TERMS) });
      if (seeds.length >= MAX_SEEDS) break;
    }
    if (seeds.length > 0) sanitized.encodingSeeds = seeds;
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
      tagline: 'A skeleton lesson so you can still study offline',
      objectives: [
        `State what ${t} is in plain language`,
        'Explain the mechanism well enough to teach it back',
        'Name the mistake you are most likely to make',
      ],
      segments: [
        {
          id: 'fb_concept',
          type: 'concept',
          title: 'The Core Idea',
          body: `We're going to build an intuition for ${t}, then verify it with a quick checkpoint.`,
          why: 'A mechanism you can reconstruct from first principles survives a bad night of sleep; a memorised list does not.',
          xpValue: 5,
        },
        {
          id: 'fb_deep',
          type: 'deepDive',
          title: 'What the mechanism actually does',
          body: `Write the causal chain for ${t} in order: trigger → intermediate moves → outcome. If a link is missing, that link is the thing to study next.`,
          why: 'Naming the trigger and the outcome without the middle is how a plausibly-worded but wrong answer gets built.',
          misconceptions: [
            {
              claim: `"${t} just happens"`,
              correction: 'Nothing in an exam answer is "just" anything: there is always a trigger and a sequence.',
            },
          ],
          xpValue: 10,
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
        {
          id: 'fb_recap',
          type: 'recap',
          title: 'Recap',
          recapPoints: [
            'Mechanism first, vocabulary second',
            'Every answer needs a trigger and an outcome',
            'Name the lookalike before the exam does',
          ],
          xpValue: 5,
        },
        { id: 'fb_wrap', type: 'wrapup', title: 'Wrap Up', body: `Anchor ${t} in your own words and it will stick.`, xpValue: 0 },
      ],
      encodingSeeds: [
        {
          title: t,
          prompt: `Explain the mechanism of ${t} in one sentence.`,
          exemplar: `Trigger → mechanism → outcome, for ${t}.`,
        },
      ],
    };
  }

  const gc = activity.visualData?.generationChallenge;
  const boundary = activity.boundaryContrast;
  const segments: LessonSegment[] = [
    {
      id: 'fb_concept',
      type: 'concept',
      title: activity.title || 'The Core Idea',
      body: activity.contextSnippet || activity.prompt,
      why: activity.cognitiveGoal,
      keyTerms: activity.keywords.slice(0, 8),
      xpValue: 5,
    },
    {
      id: 'fb_deep',
      type: 'deepDive',
      title: 'The mechanism, link by link',
      body: activity.prompt,
      why: boundary?.distinguishingRule
        ? `This is true up to the boundary you own: ${boundary.distinguishingRule}`
        : 'Walk the chain in order; the step you cannot state is the step you do not own yet.',
      xpValue: 10,
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

  if (boundary?.confusableLookalike) {
    segments.push({
      id: 'fb_misconception',
      type: 'misconception',
      title: 'Misconception radar',
      misconceptions: [
        {
          claim: `Confusing "${activity.title}" with "${boundary.confusableLookalike}"`,
          correction: boundary.distinguishingRule || 'Name the observable that only one of the pair produces.',
        },
      ],
      xpValue: 12,
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
    id: 'fb_selfexplain',
    type: 'selfExplain',
    title: 'Explain it back',
    selfExplain: {
      prompt: `Teach "${activity.title}" to an imaginary classmate in three sentences, without using the source's jargon.`,
      modelAnswer: gc?.expertCompletion || activity.scaffold.exampleAnswer,
      keywords: activity.keywords.slice(0, 6),
    },
    xpValue: 25,
  });

  const keywordRecap = (activity.keywords || []).slice(0, 4);
  segments.push({
    id: 'fb_recap',
    type: 'recap',
    title: 'Recap before you encode',
    recapPoints: [
      activity.scaffold.field1Label ? `${activity.scaffold.field1Label}: the trigger` : 'Name the trigger',
      activity.scaffold.field2Label ? `${activity.scaffold.field2Label}: the mechanism` : 'Walk the mechanism in order',
      boundary?.confusableLookalike ? `Boundary: ${activity.title} vs ${boundary.confusableLookalike}` : 'Name the lookalike',
      keywordRecap.length > 0 ? `Terms to keep: ${keywordRecap.join(', ')}` : 'Keep the terms plain',
    ],
    xpValue: 5,
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
    objectives: [
      `Explain ${activity.title} as a causal chain`,
      'Produce the mechanism without the source open',
      boundary?.confusableLookalike ? `Separate it from ${boundary.confusableLookalike}` : 'Separate it from its lookalike',
    ],
    segments,
    glossary: activity.keywords.slice(0, 8).map((term) => ({
      term,
      definition: `${term} — as used in ${activity.title}.`,
    })),
    encodingSeeds: [
      {
        title: activity.title || t,
        prompt: activity.prompt,
        exemplar: activity.scaffold.exampleAnswer || gc?.expertCompletion || '',
        keywords: activity.keywords.slice(0, 6),
      },
    ],
  };
}

// ─── When the caller falls back ──────────────────────────────────────────────
// Teach Me owes the learner a lesson rather than nothing when the request fails
// (defect 43), so a failure is served by buildFallbackLesson above. Which
// FAILURE it was still matters to the person reading the notice it carries:
// "the request never left this device" and "the service answered with an error"
// are different facts about the network, and only one of them is a service that
// is up and disagreeing.

/** Where the lesson on screen came from instead of the model. */
export type TeachFallbackOrigin = 'offline' | 'server';

/**
 * `offline` when nothing answered, `server` when something did.
 *
 * `fetch` rejects with a `TypeError` when the request never reached the server - 
 * offline, a DNS failure, a connection that dropped mid-flight - so there is no
 * status to report because nothing was ever there to answer. Everything else is
 * a response: an HTTP error status, or a 200 whose payload sanitized to nothing.
 */
export function classifyTeachFailure(cause: unknown): TeachFallbackOrigin {
  return cause instanceof TypeError ? 'offline' : 'server';
}