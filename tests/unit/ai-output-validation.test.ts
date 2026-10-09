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
