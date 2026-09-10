import { Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { generateJSONWithProvider } from "@/lib/ai-client";

// TEACH ME route : Brilliant-style interactive lesson generator.
// The AI is the AUTHOR. Options from the UI are soft preferences (directives),
// not hard constraints — the model may pick its own segment types, counts,
// ordering and content, and is explicitly allowed to deviate when it improves
// pedagogy. The response schema is therefore wide, and almost nothing is
// required beyond a title + segments.

// ─── Response schema (wide on purpose) ───────────────────────────────────────

const visualSchema = {
  type: Type.OBJECT,
  description: "Optional mini-visual attached to any segment. Choose the kind that best fits; you may also invent visual ideas in prose inside 'callout'.",
  properties: {
    kind: { type: Type.STRING, description: "'steps' | 'analogy' | 'list' | 'formula' | 'diagram'. You may reuse 'steps' as a general fallback." },
    lines: { type: Type.ARRAY, description: "Ordered visual rows (e.g. causal chain, annotation list).", items: { type: Type.OBJECT, properties: { label: { type: Type.STRING, description: "Short label, <=12 words." }, detail: { type: Type.STRING } }, required: ["label"] } },
    analogyPairs: { type: Type.ARRAY, description: "Familiar → target mappings.", items: { type: Type.OBJECT, properties: { source: { type: Type.STRING }, target: { type: Type.STRING }, note: { type: Type.STRING } }, required: ["source", "target"] } },
    callout: { type: Type.STRING, description: "One vivid sentence the learner should visualize." },
  },
  required: ["kind"],
};

const questionSchema = {
  type: Type.OBJECT,
  description: "Interactive checkpoint. Pick ONE kind you have material for and fill only that kind's fields.",
  properties: {
    kind: { type: Type.STRING, description: "'mcq' | 'ordering' | 'matching' | 'fillBlank' | 'freeResponse' | 'trueFalse'. Choose freely based on the concept." },
    prompt: { type: Type.STRING },
    options: { type: Type.ARRAY, description: "For mcq/trueFalse. 2-5 options; EXACTLY ONE has correct=true. Make 1-2 options real misconception traps the notes themselves suggest (esp. the confusable lookalike from boundaryContrast if provided).", items: { type: Type.OBJECT, properties: { label: { type: Type.STRING }, correct: { type: Type.BOOLEAN }, explanation: { type: Type.STRING, description: "1-2 sentence coaching note shown after answering." } }, required: ["label", "correct"] } },
    items: { type: Type.ARRAY, description: "For ordering: list of items the learner must place in order. correctIndex = final position (0-based).", items: { type: Type.OBJECT, properties: { label: { type: Type.STRING }, correctIndex: { type: Type.INTEGER } }, required: ["label", "correctIndex"] } },
    pairs: { type: Type.ARRAY, description: "For matching: tap-to-match left/right pairs. Right sides must be unique.", items: { type: Type.OBJECT, properties: { left: { type: Type.STRING }, right: { type: Type.STRING } }, required: ["left", "right"] } },
    blanks: { type: Type.ARRAY, description: "For fillBlank: sentence fragments with one blank each.", items: { type: Type.OBJECT, properties: { before: { type: Type.STRING }, answer: { type: Type.STRING }, after: { type: Type.STRING } }, required: ["answer"] } },
    modelAnswer: { type: Type.STRING, description: "For freeResponse: the reference answer shown on reveal (1-3 sentences, Feynman-plain)." },
    hints: { type: Type.ARRAY, description: "Progressive hint ladder, gentlest first (0-3 hints).", items: { type: Type.STRING } },
  },
  required: ["kind", "prompt"],
};
const segmentSchema = {
  type: Type.OBJECT,
  description: "One lesson segment. You choose type, count, order and which fields to fill. 'concept' teaches, 'checkpoint' tests, 'guidedProblem' walks a worked example step-by-step, 'youTry' makes the learner attempt then reveal, 'memoryHook' gives a mnemonic (memorization mode), 'storyBeat' advances a narrative (story mode).",
  properties: {
    type: { type: Type.STRING, description: "'concept' | 'checkpoint' | 'guidedProblem' | 'youTry' | 'memoryHook' | 'storyBeat'. You may also use 'wrapup' for the final segment." },
    title: { type: Type.STRING, description: "Short segment title (<=8 words)." },
    body: { type: Type.STRING, description: "Teaching body text. Plain-language, concrete, zero jargon without explanation. 1-4 short paragraphs." },
    keyTerms: { type: Type.ARRAY, description: "2-6 term chips this segment introduces.", items: { type: Type.STRING } },
    visual: visualSchema,
    question: questionSchema,
    trapNote: { type: Type.STRING, description: "Optional: a 1-line 'here's the trap' note shown if the learner picks the confusable lookalike." },
    steps: { type: Type.ARRAY, description: "For guidedProblem: the worked-example steps, best in the actual reasoning order, each ONE move.", items: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, detail: { type: Type.STRING, description: "What to do/why, physically or causally concrete." } }, required: ["title", "detail"] } },
    finalAnswer: { type: Type.STRING, description: "For guidedProblem: the final closed-form result / mechanism outcome." },
    phrase: { type: Type.STRING, description: "For memoryHook: the chant / peg phrase / acronym / palace image." },
    linkedList: { type: Type.ARRAY, description: "For memoryHook: the ordered items being hooked (e.g. element names, cranial nerves).", items: { type: Type.STRING } },
    narrative: { type: Type.STRING, description: "For storyBeat: the narrative text." },
    continuation: { type: Type.STRING, description: "For storyBeat: the 'next chapter' teaser / choice the learner makes." },
    chapterTitle: { type: Type.STRING, description: "Optional chapter label to group segments in the progress rail (e.g. 'Setup', 'Breakthrough')." },
    xpValue: { type: Type.INTEGER, description: "XP for completing this segment. Defaults are fine (concept 5, checkpoint 15, guided 20, youTry 25, hooks 8)." },
  },
  required: ["type"],
};

const teachResponseSchema = {
  type: Type.OBJECT,
  properties: {
    lesson: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "Catchy, specific lesson title." },
        tagline: { type: Type.STRING, description: "One line promising the payoff, e.g. 'Repair the pump and you'll never forget the threshold.'" },
        estimatedMin: { type: Type.INTEGER, description: "Estimated minutes to complete." },
        intro: {
          type: Type.OBJECT,
          properties: {
            hook: { type: Type.STRING, description: "A curiosity-gap question or scenario that frames the lesson (Brilliant-style)." },
            whyItMatters: { type: Type.STRING, description: "One real-world / exam payoff." },
          },
          required: [],
        },
        segments: { type: Type.ARRAY, items: segmentSchema, description: "The lesson body. 4-14 segments. Teach first (concept), then work a problem (guidedProblem), then let them try (youTry), interleaving checkpoints. In memorization mode lean on memoryHook + rehearsal checkpoints." },
        masteryCheck: {
          type: Type.OBJECT,
          description: "Final interactive check : can they produce the mechanism themselves?",
          properties: {
            prompt: { type: Type.STRING },
            keywords: { type: Type.ARRAY, description: "Keywords their answer should hit.", items: { type: Type.STRING } },
            modelAnswer: { type: Type.STRING },
            hints: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["prompt"],
        },
        wrapup: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            callToAction: { type: Type.STRING, description: "What to do next (e.g. 'Now encode this stage — you're pre-warmed.')." },
            connectionPrompt: { type: Type.STRING, description: "A transfer question linking the lesson back to the learner's own notes or the next stage." },
          },
          required: [],
        },
      },
      required: ["title", "segments"],
    },
    generatedWith: { type: Type.STRING, description: "Optional description of the pedagogical approach you chose (visible only to developers)." },
  },
  required: ["lesson"],
};
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      topicSummary,
      mode = 'conceptual',
      scope = 'notes',
      notes,
      file,
      activities = [],
      stageIndex = 0,
      userResponses = {},
      researchContexts = [],
      options = {},
      settings,
    } = body;

    // Soft option defaults (mirror DEFAULT_TEACH_OPTIONS in lib/types.ts).
    const opts = {
      style: typeof options.style === 'string' ? options.style : 'brilliant',
      storyMode: options.storyMode !== false,
      checkpoints: typeof options.checkpoints === 'number' ? options.checkpoints : 4,
      lessonDepth: typeof options.lessonDepth === 'number' ? options.lessonDepth : 2,
      difficulty: typeof options.difficulty === 'string' ? options.difficulty : 'standard',
      humor: typeof options.humor === 'number' ? options.humor : 3,
      includeAnalogy: options.includeAnalogy !== false,
      includeMemoryHooks: options.includeMemoryHooks !== false,
      allowFreeResponse: options.allowFreeResponse !== false,
      maxSteps: typeof options.maxSteps === 'number' ? options.maxSteps : 14,
    };

    // Resolve the teaching target.
    let targetTitle = String(topicSummary || 'This Topic').slice(0, 200);
    let stage: any = null;
    if (scope === 'stage' && Array.isArray(activities) && activities[stageIndex]) {
      stage = activities[stageIndex];
      targetTitle = stage.title || targetTitle;
    }
    const activeActs = scope === 'notes' ? [] : activities;

    const styleDirectives: Record<string, string> = {
      brilliant: `STYLE: BRILLIANT INTERACTIVE. Hook with a tiny scenario, teach ONE mechanism in plain physical/causal language, immediately test with a puzzle, then scale into a real worked problem. Short punchy segments with constant micro-interactions.`,
      socratic: `STYLE: SOCRATIC SHERPA. Teach by asking one sharp question at a time; every teaching segment ends with a question the learner must answer to proceed, and your modelAnswer/hints reveal the reasoning in dialog form.`,
      storyteller: `STYLE: STORYTELLER. Personify the components and narrate the mechanism as a plot with stakes. Every concept maps onto characters/events; every problem is a plot twist the learner resolves.`,
      professor: `STYLE: CLEAR PROFESSOR LECTURE. Rigorous but warm: formal definitions first, then motivation, then a fully worked example, then a test. Minimal flair, maximal clarity.`,
      meme: `STYLE: MEME BRAINROT (but accurate). Absurd personifications, internet humor, exaggerated stakes. Accuracy is NON-NEGOTIABLE — humor must never distort the mechanism.`,
    };
    const styleDirective = styleDirectives[opts.style] || styleDirectives.brilliant;

    const difficultyDirective =
      opts.difficulty === 'intro'
        ? `DIFFICULTY: INTRO. Build from zero assumptions, define every term, use only intuitive moves, gentle checkpoints with generous hints.`
        : opts.difficulty === 'viva'
          ? `DIFFICULTY: VIVA / OXFORD ORAL DEFENSE. Ruthless edge cases: why doesn't the reverse happen? Include boundary-stress problems and failure-state reasoning. Trap options aggressively test the confusable lookalike.`
          : `DIFFICULTY: STANDARD. Assume basic familiarity, teach mechanism deeply, include a boundary-condition checkpoint.`;

    const humorBar = `HUMOR LEVEL: ${Math.max(0, Math.min(5, opts.humor))}/5. ${opts.humor >= 3 ? 'Lean into personality — you may be silly, vivid or absurd so long as the mechanism stays precise.' : opts.humor >= 1 ? 'Light warmth only; stay serious.' : 'Zero jokes. Technically crisp the whole way.'}`;

    const storyDirective = opts.storyMode
      ? `Turn the whole lesson into a story: give the mechanism characters/stakes and keep a storyBeat arc running. Every checkpoint advances the plot.`
      : `Keep it focused and direct; you may still personify for one vivid sentence per concept.`;
    const analogyDirective = opts.includeAnalogy
      ? `Weave analogy into concept segments (familiar-domain → target-domain mappings) whenever a clean one exists.`
      : `Use fewer analogies — go straight at the mechanism.`;
    const memoryDirective = opts.includeMemoryHooks
      ? `Include memoryHook segments (chants, pegs, palaces, acronyms) even in conceptual lessons, as memory glue.`
      : `Only add memory hooks where they are the actual mechanism.`;
    const responseDirective = opts.allowFreeResponse
      ? `Use freeResponse checkpoints and youTry segments — production (typing) beats selection.`
      : `Prefer discrete interactions (mcq/ordering/matching/fillBlank) over open text.`;

    const freedomDirective = `AUTHORITY & FREEDOM (READ FIRST):
You are the lesson AUTHOR and you outrank any template. The segment list below is a toolbox, not a checklist.
- Pick segment types, counts, ordering and content yourself. Reuse, skip, or invent combinations freely.
- Aim for ${Math.max(4, Math.min(14, opts.maxSteps))} segments total (you may go shorter if the idea is atomic, or slightly longer if the concept genuinely needs it).
- Include roughly ${Math.max(0, Math.min(8, opts.checkpoints))} interactive checkpoints across the lesson (your call how to distribute them).
- ${storyDirective}
- ${analogyDirective}
- ${memoryDirective}
- ${responseDirective}
- Prefer Feynman-plain language over textbook jargon; when a technical term is needed, define it inline in the same sentence.
- If you think a different structure teaches better than the style directive requests, DEVIATE and note it in 'generatedWith'.`;
const modeDirective =
      mode === 'memorization'
        ? `MODE: GRANDMASTER OF MEMORY & MNEMONIC ARCHITECT (Joshua Foer, Dominic O'Brien, Harry Lorayne). Target is ROTE & TAXONOMIC material (tables, lists, sequences, classifications). Teach through absurd, bizarre, sensory narrative linking; chunk with Miller 7±2 law; give mnemonics, pegs, acronyms and memory-palace journeys. Lead each memoryHook with a chant-like phrase and list the linked items in order. Accuracy of each item is sacred — humor must never corrupt a fact.`
        : `MODE: CONCEPTUAL MECHANISM BUILDER (Feynman standard). The learner must be able to explain the MECHANISM — the actual physical/causal moving parts — in plain language. When jargon appears, define it immediately after. Boundary conditions and failure modes are core teaching material, not footnotes.`;

    const scopeDirective =
      scope === 'stage'
        ? `SCOPE: SINGLE STAGE. Teach exactly this one stage's mechanism and how to solve its specific prompt. Sketch what the expected answer looks like, then let the learner reconstruct it (youTry should mirror the stage's field labels).`
        : scope === 'schema'
          ? `SCOPE: FULL SAVED SCHEMA. Teach the whole multi-stage arc: build each pillar stage as a concept, tie them together with a synthesis chapter, and end by connecting back to the schema's core question.`
          : `SCOPE: SOURCE NOTES. Teach straight from the raw study material as if tutoring from these notes. Structure the lesson around the ideas that actually appear, in a sensible learning order.`;

    const systemPrompt = `You are the DeepEncode TEACHER — a Brilliant-style interactive lesson designer fused with a cognitive scientist.

${modeDirective}

${scopeDirective}

${styleDirective}

${difficultyDirective}

${humorBar}

${freedomDirective}

STRUCTURE GUIDANCE (a school, not a rule):
- Begin with an intro.hook — a tiny scenario that creates a curiosity gap — then whyItMatters.
- Teach, then DO: concept segments build understanding, then a guidedProblem walks a full worked example one move at a time, then youTry makes the learner produce one themselves.
- Interleave checkpoints so no stretch runs more than ~2 segments without a test.
- Reuse the learner's own context where provided: contextSnippet, generationChallenge premise/clue/expertCompletion, scaffold labels, keywords, boundaryContrast. Your checkpoint traps should preferentially target the confusable lookalike; its distinguishingRule is your best explanation text.
- If the learner already mastered a stage (marked in userResponses), you may compress it to a quick recap or skip it — don't re-teach what's proven.
- The lesson must be completable in ${Math.max(1, Math.min(15, opts.lessonDepth * 4))} minutes: segments stay atomic, bodies stay tight.

Output ONLY the JSON object matching teachResponseSchema.`;
let userPrompt = `TARGET: ${targetTitle}
MODE: ${mode}
SCOPE: ${scope}
`;

    if (scope === 'notes' && notes) {
      userPrompt += `\nSOURCE NOTES:\n${String(notes).slice(0, 16000)}\n`;
    }
    if (scope === 'notes' && file && file.name) {
      userPrompt += `\n[ATTACHED MULTIMODAL FILE: ${file.name} (${file.type}, ${Math.round((file.size || 0) / 1024)} KB). Extract every key fact, mechanism, formula and list — this is your primary source.]\n`;
    }
    if (activeActs.length > 0) {
      userPrompt += `\nENCODED SCHEMA CONTEXT:\n${activeActs
        .map((a: any, i: number) => {
          const stageNum = a.stageNumber || i + 1;
          return `STAGE ${stageNum}: ${a.title} [${a.framework}]
  Goal: ${a.cognitiveGoal}
  Context: ${(a.contextSnippet || '').slice(0, 600)}
  Keywords: ${(a.keywords || []).join(', ')}
  Prompt: ${(a.prompt || '').slice(0, 500)}
  Field1: ${a.scaffold?.field1Label} / Field2: ${a.scaffold?.field2Label}
  Example answer: ${(a.scaffold?.exampleAnswer || '').slice(0, 300)}
  Boundary: confusable="${a.boundaryContrast?.confusableLookalike || ''}" rule="${a.boundaryContrast?.distinguishingRule || ''}"
  Generation challenge: premise="${(a.visualData?.generationChallenge?.premisePrompt || '').slice(0, 300)}" clue="${(a.visualData?.generationChallenge?.clue || '').slice(0, 300)}" missing="${(a.visualData?.generationChallenge?.missingRoleOrTarget || '').slice(0, 300)}" expert="${(a.visualData?.generationChallenge?.expertCompletion || '').slice(0, 500)}"`;
        })
        .join('\n\n')}\n`;

      const masteredIds = Object.entries(userResponses)
        .filter(([, r]: [string, any]) => r?.feynmanReview?.grade === 'mastered' || (r?.checkCount ?? 0) >= 2)
        .map(([id]) => id);
      if (masteredIds.length > 0) {
        userPrompt += `\nALREADY MASTERED BY THIS LEARNER: ${masteredIds.join(', ')} (compress to rapid recap or skip).\n`;
      }
    }
    if (researchContexts && researchContexts.length > 0) {
      userPrompt += `\nPREREQUISITE CONTEXT:\n${researchContexts
        .map((r: any, i: number) => `${i + 1}. ${r.conceptAdded}: ${r.explanation}`)
        .join('\n')}\n`;
    }

    userPrompt += `\nOPTIONS (soft preferences):\n${JSON.stringify(opts, null, 2)}\n
Author the lesson now. Teach the concept, then how to do a problem like it.`;

    const result = await generateJSONWithProvider({
      systemPrompt,
      userPrompt,
      responseSchema: teachResponseSchema,
      settings,
      isChecker: false,
      file: scope === 'notes' ? file : null,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error in /api/teach:', error);
    return NextResponse.json({
      error: error?.message || 'Failed to generate lesson. Please try again.',
    }, { status: 500 });
  }
}