import { describe, it, expect } from 'vitest';
import {
  extractJson,
  safeParseJson,
  validateEncodedSchema,
  validateEvaluationResult,
  validateBatchEvaluation,
  validateYouTubeResult,
  validateProbeResult,
  validateInvertedStepResult,
} from '../../lib/ai-output-validation';
import type { Activity } from '../../lib/types';

describe('validateProbeResult (why-ladder)', () => {
  it('carries a real question through', () => {
    const out = validateProbeResult({
      target: 'because packet loss means congestion',
      question: 'What property of router memory forces a drop rather than a delay?',
      isAxiom: false,
      depth: 1,
    });
    expect(out.isAxiom).toBe(false);
    expect(out.question).toMatch(/router memory/);
    expect(out.axiom).toBe('');
  });

  it('downgrades an axiom with no sentence so the UI never dead-ends', () => {
    const out = validateProbeResult({ isAxiom: true, axiom: '   ', question: '' });
    expect(out.isAxiom).toBe(false);
    expect(out.axiom).toBe('');
    expect(out.question.length).toBeGreaterThan(0);
  });

  it('keeps a real axiom', () => {
    const out = validateProbeResult({
      isAxiom: true,
      axiom: 'Finite queue memory forces a drop: an unbounded buffer is not physical.',
    });
    expect(out.isAxiom).toBe(true);
    expect(out.axiom).toMatch(/Finite queue memory/);
  });

  it('falls back to a usable question on a null payload', () => {
    const out = validateProbeResult(null);
    expect(out.isAxiom).toBe(false);
    expect(out.question).toMatch(/forces that to be true/);
    expect(out.depth).toBe(1);
  });
});

describe('validateInvertedStepResult (spot the lie)', () => {
  const good = {
    title: 'Vesicle fusion',
    steps: [
      { id: 's1', text: 'Calcium enters the terminal.' },
      { id: 's2', text: 'Synaptotagmin binds calcium.' },
      { id: 's3', text: 'The SNARE complex disassembles to force fusion.' },
      { id: 's4', text: 'Transmitter enters the cleft.' },
    ],
    falsifiedStepId: 's3',
    flawType: 'inverted physical process',
    whyFalsified: 'SNAREs zip together to force fusion; disassembly follows.',
    correctVersion: 'The SNARE complex zips together to force the membranes into apposition.',
  };

  it('passes a coherent drill through', () => {
    const out = validateInvertedStepResult(good);
    expect(out.steps).toHaveLength(4);
    expect(out.falsifiedStepId).toBe('s3');
    expect(out.correctVersion).toMatch(/zips together/);
  });

  it('degrades an unmatchable id to the first step rather than dead-ending', () => {
    const out = validateInvertedStepResult({ ...good, falsifiedStepId: 's9' });
    expect(out.falsifiedStepId).toBe('s1');
    expect(out.whyFalsified).toMatch(/SNAREs zip/);
  });

  it('drops empty steps and caps runaway chains', () => {
    const out = validateInvertedStepResult({
      steps: [
        { id: 'a', text: 'one' },
        { id: 'b', text: '   ' },
        { id: 'c', text: 'two' },
        { id: 'd', text: 'three' },
        { id: 'e', text: 'four' },
        { id: 'f', text: 'five' },
        { id: 'g', text: 'six' },
      ],
      falsifiedStepId: 'd',
    });
    expect(out.steps).toHaveLength(5);
    expect(out.falsifiedStepId).toBe('d');
  });

  it('returns an empty step list for a null payload (route then 502s)', () => {
    expect(validateInvertedStepResult(null).steps).toEqual([]);
  });
});

describe('extractJson', () => {
  it('strips ```json fences', () => {
    const raw = '```json\n{"a":1}\n```';
    expect(extractJson(raw)).toBe('{"a":1}');
  });

  it('strips plain ``` fences', () => {
    const raw = '```\n{"a":1}\n```';
    expect(extractJson(raw)).toBe('{"a":1}');
  });

  it('extracts the JSON object out of surrounding prose', () => {
    const raw = 'Here is the JSON you asked for:\n{"topic":"x"}\nHope that helps!';
    expect(extractJson(raw)).toBe('{"topic":"x"}');
  });

  it('strips a BOM', () => {
    expect(extractJson('\uFEFF{"a":1}')).toBe('{"a":1}');
  });

  it('returns input unchanged when there is no fence or braces', () => {
    expect(extractJson('plain text')).toBe('plain text');
  });
});

describe('safeParseJson', () => {
  it('parses clean JSON directly', () => {
    expect(safeParseJson('{"grade":"good"}')).toEqual({ grade: 'good' });
  });

  it('parses fenced JSON', () => {
    expect(safeParseJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
  });

  it('returns null for garbage', () => {
    expect(safeParseJson('not json at all {')).toBeNull();
  });
});

describe('validateEncodedSchema', () => {
  it('returns safe defaults for a null payload', () => {
    const result = validateEncodedSchema(null, 'conceptual');
    expect(result.topicSummary).toBe('Active Cognitive Schema');
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0].templateType).toBe('first_principles');
  });

  it('falls back to a single stage when the model returns an empty list', () => {
    const result = validateEncodedSchema({ topicSummary: 'T', activities: [] }, 'conceptual');
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0].scaffold.field1Label).toBeTruthy();
  });

  it('uses a memorization fallback template in memorization mode', () => {
    const result = validateEncodedSchema({ activities: [] }, 'memorization');
    expect(result.activities[0].templateType).toBe('memory_palace');
  });

  it('fills missing scaffold labels with safe defaults', () => {
    const raw = {
      topicSummary: 'Neurons',
      activities: [
        { id: 'a1', title: 'Spike', scaffold: null },
      ],
    };
    const result = validateEncodedSchema(raw, 'conceptual');
    const act = result.activities[0];
    expect(act.scaffold.field1Label).toBe('Mechanism');
    expect(act.scaffold.field2Label).toBe('Causal Link');
    expect(act.templateType).toBe('first_principles');
  });

  it('preserves well-formed activities and drops unusable ones', () => {
    const raw = {
      topicSummary: 'T',
      activities: [
        { id: 'ok', title: 'Good', stageNumber: 2, keywords: ['k'], scaffold: { field1Label: 'F1' } },
        'not-an-object',
        null,
      ],
    };
    const result = validateEncodedSchema(raw, 'conceptual');
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0].id).toBe('ok');
    expect(result.activities[0].stageNumber).toBe(2);
    expect((result.activities[0] as Activity).keywords).toEqual(['k']);
  });

  /**
   * A provider that does not enforce the response schema (OpenRouter's and the
   * OpenAI-compatible `json_object` mode only require *valid JSON*; only the
   * Gemini SDK is given `responseSchema`) can answer with a bare ARRAY of stages
   * instead of the declared `{ topicSummary, activities }` object. `typeof []`
   * is `'object'`, so the array used to sail past the object guard, contribute no
   * `activities`, and be replaced by the single generic fallback stage: every
   * generated stage discarded while the request still answered 200.
   */
  it('recovers the stages from a bare array root instead of falling back', () => {
    const stages = [
      { id: 's1', title: 'The Na+/K+ pump sets the gradient', templateType: 'first_principles', visualData: { nodes: [{ label: 'pump', type: 'input' }] } },
      { id: 's2', title: 'Why the spike overshoots', templateType: 'state_transition' },
    ];
    const result = validateEncodedSchema(stages, 'conceptual');
    expect(result.activities).toHaveLength(2);
    expect(result.activities[0].id).toBe('s1');
    expect(result.activities[1].templateType).toBe('state_transition');
    // Never the synthetic fallback when real stages were present.
    expect(result.activities.some((a) => a.id === 'fallback-stage-1')).toBe(false);
  });

  it('accepts `stages` as an alias for `activities`', () => {
    const result = validateEncodedSchema({ topicSummary: 'T', stages: [{ id: 'x', title: 'X' }] }, 'conceptual');
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0].id).toBe('x');
  });

  /**
   * A routed free model can leave a placeholder object in the array - the live
   * gear probe saw an element with no title and no scaffold of its own. Every
   * default below then produced a stage called "Stage 3" asking generic
   * questions, which is a stage the model never wrote and the learner cannot
   * answer with anything they were taught. Defaulting must not manufacture one.
   */
  it('drops an element the model left empty instead of defaulting it into a stage', () => {
    const raw = {
      topicSummary: 'Chapter',
      activities: [
        { id: 's1', title: 'A real stage', scaffold: { field1Label: 'Trigger' } },
        { id: 's2' },
        { id: 's3', keywords: [] },
      ],
    };
    const result = validateEncodedSchema(raw, 'conceptual');
    expect(result.activities.map((a) => a.id)).toEqual(['s1']);
  });

  it('still falls back for a bare array whose entries are all unusable', () => {
    const result = validateEncodedSchema(['nope', null, 42], 'conceptual');
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0].id).toBe('fallback-stage-1');
  });

  /**
   * `templateType` is a free string to the model, and a provider that does not
   * enforce the response schema lets it invent one. The encode probe saw
   * `cyclic_state_machine` in memorization mode (BUGS_AUDIT_REPORT.md §41),
   * which no renderer resolves — the stage would draw a First-Principles
   * diagram and the model's real visualData would never be read. An unknown id
   * is resolved to a real one instead.
   */
  it('replaces an unknown templateType with the mode default', () => {
    const conceptual = validateEncodedSchema({ activities: [{ id: 'a', templateType: 'cyclic_state_machine' }] }, 'conceptual');
    expect(conceptual.activities[0].templateType).toBe('first_principles');
    const rote = validateEncodedSchema({ activities: [{ id: 'a', templateType: 'cyclic_state_machine' }] }, 'memorization');
    expect(rote.activities[0].templateType).toBe('memory_palace');
  });

  it('resolves an unknown templateType from the payload shape when it can', () => {
    const raw = { activities: [{ id: 'a', templateType: 'flow_thing', visualData: { flowSteps: [{ title: 'S1' }] } }] };
    expect(validateEncodedSchema(raw, 'conceptual').activities[0].templateType).toBe('state_transition');
  });

  it('resolves a missing templateType from the payload shape too', () => {
    const raw = { activities: [{ id: 'a', visualData: { palaceRooms: [{ roomName: 'Foyer' }] } }] };
    expect(validateEncodedSchema(raw, 'conceptual').activities[0].templateType).toBe('memory_palace');
  });

  it('keeps a valid templateType untouched', () => {
    const raw = { activities: [{ id: 'a', templateType: 'broken_model_debug' }] };
    expect(validateEncodedSchema(raw, 'conceptual').activities[0].templateType).toBe('broken_model_debug');
  });

  it('preserves researchContexts when present', () => {
    const rc = [{ id: 'r1', detectedGap: 'g', conceptAdded: 'c', explanation: 'e' }];
    const result = validateEncodedSchema({ activities: [], researchContexts: rc }, 'conceptual');
    expect(result.researchContexts).toEqual(rc);
  });
});

describe('validateEvaluationResult', () => {
  it('coerces a valid evaluation without inventing any number', () => {
    const out = validateEvaluationResult({
      secured: true,
      feedback: 'Nice.',
      counterProbe: 'What if the pump stalls halfway?',
      sentenceFinisher: 'the pore opens because the helices moved.',
    });
    expect(out.secured).toBe(true);
    expect(out.feedback).toBe('Nice.');
    expect(out.counterProbe).toBe('What if the pump stalls halfway?');
    expect(out.sentenceFinisher).toBe('the pore opens because the helices moved.');
    // The whole point of the contract: nothing numeric survives.
    expect(Object.values(out).some((v) => typeof v === 'number')).toBe(false);
  });

  it('carries the pressure test and the finished sentence through', () => {
    const out = validateEvaluationResult({
      secured: false,
      feedback: 'Close.',
      nailedIt: 'Na+ influx and threshold crossing.',
      missingLink: 'S4 segments swing outward, which is what opens the pore.',
    });
    expect(out.nailedIt).toBe('Na+ influx and threshold crossing.');
    expect(out.missingLink).toBe('S4 segments swing outward, which is what opens the pore.');
  });

  it('falls back to errorAnalysis for the missing link', () => {
    const out = validateEvaluationResult({
      secured: true,
      feedback: 'Solid.',
      errorAnalysis: 'You skipped the physical link between voltage change and pore dilation.',
    });
    expect(out.missingLink).toBe(
      'You skipped the physical link between voltage change and pore dilation.'
    );
  });

  it('produces a safe fallback for a null payload (never grants mastery)', () => {
    const out = validateEvaluationResult(null);
    expect(out.secured).toBe(false);
  });

  it('reads a legacy grade as the boolean so old sessions keep working', () => {
    expect(validateEvaluationResult({ grade: 'mastered', score: 90 }).secured).toBe(true);
    expect(validateEvaluationResult({ grade: 'good', score: 78 }).secured).toBe(true);
    expect(validateEvaluationResult({ grade: 'needs_elaboration', score: 40 }).secured).toBe(false);
    expect(validateEvaluationResult({ grade: 'masterful', score: 99 }).secured).toBe(false);
  });

  it('keeps optional fields only when strings', () => {
    const out = validateEvaluationResult({ secured: true, depthAlert: 'watch jargon', jargonBuzzer: 42 });
    expect(out.depthAlert).toBe('watch jargon');
    expect(out.jargonBuzzer).toBeUndefined();
  });

  it('never forwards a non-string errorAnalysis into the panel', () => {
    // `errorAnalysis` is rendered as a React child by the workbench's needs-work
    // hint and stored on the stage response, so the one field whose fallback
    // used to be the raw value is pinned here: anything that is not a string is
    // dropped rather than forwarded, and a string is still carried.
    expect(validateEvaluationResult({ secured: false, errorAnalysis: { detail: 'nope' } }).errorAnalysis).toBeUndefined();
    expect(validateEvaluationResult({ secured: false, errorAnalysis: 42 }).errorAnalysis).toBeUndefined();
    expect(validateEvaluationResult({ secured: false, errorAnalysis: ['a'] }).errorAnalysis).toBeUndefined();
    expect(validateEvaluationResult({ secured: true, errorAnalysis: 'Name the link.' }).errorAnalysis).toBe('Name the link.');
  });
});

describe('validateBatchEvaluation', () => {
  it('keeps per-stage truth values and drops junk, with no score anywhere', () => {
    const out = validateBatchEvaluation({
      overallScore: 120,
      analysis: 'Solid.',
      perStageGrades: [
        { stageTitle: 'S1', secured: true, counterProbe: 'What if it stalls?', feedback: 'ok' },
        { feedback: '' },
        'junk',
      ],
    });
    expect(out.perStageGrades).toHaveLength(2);
    expect(out.perStageGrades[0].secured).toBe(true);
    expect(out.perStageGrades[0].counterProbe).toBe('What if it stalls?');
    expect(out.perStageGrades[1].secured).toBe(false);
    expect(out.perStageGrades[1].stageTitle).toBe('Stage');
    expect(Object.keys(out)).not.toContain('overallScore');
  });

  it('returns an empty read for a malformed payload', () => {
    const out = validateBatchEvaluation(null);
    expect(out.analysis).toBe('');
    expect(out.perStageGrades).toEqual([]);
  });
});

describe('validateYouTubeResult', () => {
  it('prefers the video title for the topic summary and keeps youtubeData', () => {
    const out = validateYouTubeResult({
      videoTitle: 'Cell Respiration',
      topicSummary: '',
      activities: [{ id: 'a', title: 't', scaffold: { field1Label: 'f' } }],
      youtubeData: { videoId: 'abc' },
    });
    expect(out.topicSummary).toBe('Cell Respiration');
    expect(out.youtubeData?.videoId).toBe('abc');
    expect(out.activities).toHaveLength(1);
  });

  it('builds a watchable link for the minimal payload', () => {
    const out = validateYouTubeResult({ videoId: 'vid1', activities: [] });
    // `videoUrl` is the href `YouTubePlayerEmbed` renders, so an empty string is
    // a link back to the page itself rather than the lecture.
    expect(out.youtubeData?.videoUrl).toBe('https://www.youtube.com/watch?v=vid1');
  });

  it('takes the video identity from the route, not from the model', () => {
    const out = validateYouTubeResult(
      { videoId: 'hallucinated', videoTitle: 'T', activities: [] },
      { context: { videoId: 'vid1', videoUrl: 'https://www.youtube.com/watch?v=vid1' } }
    );
    expect(out.youtubeData?.videoId).toBe('vid1');
    expect(out.youtubeData?.videoUrl).toBe('https://www.youtube.com/watch?v=vid1');
  });

  it('coerces every metadata field the UI renders', () => {
    const out = validateYouTubeResult(
      {
        videoTitle: { nope: true },
        authorName: 42,
        durationEstimated: ['x'],
        timestamps: [{ seconds: 12, label: 'intro' }, 'junk', null],
        activities: [],
      },
      {
        mode: 'conceptual',
        source: 'the transcript',
        context: {
          videoId: 'vid1',
          videoUrl: 'https://www.youtube.com/watch?v=vid1',
          oEmbedTitle: 'Real title',
          oEmbedAuthor: 'Dr X',
          thumbnailUrl: 'thumb.jpg',
        },
      }
    );
    expect(out.youtubeData?.videoId).toBe('vid1');
    expect(out.youtubeData?.title).toBe('Real title');
    expect(out.youtubeData?.authorName).toBe('Dr X');
    expect(out.youtubeData?.duration).toBe('Video Lecture');
    expect(out.youtubeData?.thumbnailUrl).toBe('thumb.jpg');
    // Only the chapter objects survive: the rail reads `seconds` off each one.
    expect(out.youtubeData?.timestamps).toEqual([{ seconds: 12, label: 'intro' }]);
  });
});
