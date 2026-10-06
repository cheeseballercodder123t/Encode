import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  REMNOTE_API_BASE,
  attachClozeHint,
  buildRemnotePushAttempts,
  generateSegregationRemnote,
  generateRemnoteHierarchy,
  pushToRemnoteApi,
  remnoteToyEmbedLine,
  sanitizeClozeHint,
} from '@/lib/remnote';
import { SegregationReport } from '@/lib/types';

const REPORT: SegregationReport = {
  topic: 'Action Potentials',
  declarativeFacts: [
    {
      id: 'f1',
      factStatement: 'The Na+/K+ pump moves 3 Na+ out and 2 K+ in per ATP.',
      question: 'Na+/K+ pump net movement?',
      clozeSuggestion: 'The pump moves {{3 Na+ out}} per ATP.',
      memoryHook: '3 out, 2 in',
    },
  ],
  conceptualMechanisms: [
    {
      id: 'm1',
      conceptName: 'Depolarization',
      whatIsIt: 'Membrane potential moves toward 0',
      whyItMatters: 'Triggers AP',
      howItWorks: 'Na+ channels open, Na+ rushes in',
      whatIfEdgeCase: 'No AP fires',
      boundaryContrast: { confusableLookalike: 'Repolarization', distinguishingRule: 'Na+ vs K+ gate' },
    },
  ],
  practiceQuestions: [
    { id: 'q1', question: 'Resting potential?', answer: '-70mV', whyCorrect: 'K+ leak sets it' },
  ],
  workedExamples: [
    { id: 'e1', title: 'Nernst', problem: 'Find EK', steps: ['Plug values', 'Solve'], takeaway: 'Gradient rules' },
  ],
};

describe('generateSegregationRemnote (RemNote flashcards)', () => {
  it('ships one card per concept, with the quadrants as reveal-only detail', () => {
    const payload = generateSegregationRemnote(REPORT);
    const lines = payload.markdown.split('\n');

    // The concept is the card...
    expect(payload.markdown).toContain('- Depolarization :: Membrane potential moves toward 0');
    // ...and each quadrant rides on its back instead of asking for its own label
    // back ("given 'Triggers AP', name the quadrant" is unanswerable).
    expect(payload.markdown).toContain('  - Why it matters: Triggers AP #[[Extra Card Detail]]');
    expect(payload.markdown).toContain('  - What if it fails: No AP fires #[[Extra Card Detail]]');
    expect(payload.markdown).toContain('  - vs Repolarization: Na+ vs K+ gate #[[Extra Card Detail]]');
    // No quadrant tag is ever its own card again.
    for (const nonsense of ['Why it matters ::', 'Why it matters >>', 'What if it fails ::', 'vs Repolarization ::']) {
      expect(payload.markdown).not.toContain(nonsense);
    }
    // Every `#[[Extra Card Detail]]` sits on a nested bullet, never on a card.
    for (const line of lines.filter((l) => l.includes('#[[Extra Card Detail]]'))) {
      expect(line.startsWith('  - ')).toBe(true);
    }

    // A concept costs 1 card, not 5.
    expect(payload.cardCount).toBe(5);
    expect(payload.cards!.map((c) => c.kind)).toEqual(['cloze', 'forward', 'two-way', 'forward', 'multi-line']);
    expect(payload.conceptsCount).toBe(1);
  });

  it('can still ship the quadrants as their own forward-only cards', () => {
    const flat = generateSegregationRemnote(REPORT, { explanationsAsDetail: false });
    expect(flat.markdown).not.toContain('#[[Extra Card Detail]]');
    expect(flat.markdown).toContain('  - Why it matters >> Triggers AP');
    expect(flat.markdown).toContain('  - vs Repolarization >> Na+ vs K+ gate');
    // The drill's reason is IN the answer, not a second card: `Why >> K+ leak
    // sets it` was a card RemNote could only ask as `Resting potential? > Why
    // >> _____`. Inlining it is the plan's promotion of the mechanism.
    expect(flat.markdown).toContain('- Resting potential? >> -70mV (K+ leak sets it)');
    expect(flat.cardCount).toBeGreaterThan(generateSegregationRemnote(REPORT).cardCount);
  });

  it('never emits a fragment card, in either explanation mode', () => {
    // The plan's hard guarantee: no drill, trap, or confusable row may become a
    // `>>` card whose front is a label. This is the exact bug that shipped a
    // `Why >> _____` sub-card under every answered drill.
    const withDistractors: SegregationReport = {
      ...REPORT,
      practiceQuestions: [
        { id: 'q1', question: 'Resting potential?', answer: '-70mV', whyCorrect: 'K+ leak sets it', distractors: ['-55mV', '0mV'] },
      ],
    };
    for (const flat of [true, false]) {
      const payload = generateSegregationRemnote(withDistractors, { explanationsAsDetail: !flat });
      for (const fragment of ['\n  - Why >>', '\n  - Traps >>', '\n  - Confusable With >>']) {
        expect(payload.markdown).not.toContain(fragment);
      }
      // Traps always land on the card above them, never on a front of their own.
      expect(payload.markdown).not.toContain('Traps >>');
    }

    // Detail mode reveals the traps on the drill's back…
    const detail = generateSegregationRemnote(withDistractors);
    expect(detail.markdown).toContain('  - Traps: -55mV / 0mV #[[Extra Card Detail]]');
    // …and flat mode (no Extra Card Detail) keeps them on the answer instead.
    const flat = generateSegregationRemnote(withDistractors, { explanationsAsDetail: false });
    expect(flat.markdown).not.toContain('#[[Extra Card Detail]]');
    expect(flat.markdown).toContain('- Resting potential? >> -70mV (K+ leak sets it) — Traps: -55mV / 0mV');
  });

  it('picks a direction per card instead of making everything two-way', () => {
    const payload = generateSegregationRemnote(REPORT, { explanationsAsDetail: false });

    // A cloze deletion IS a one-way card in RemNote, so it carries no
    // delimiter: `::` on top of `{{}}` is what asked for the label back.
    expect(payload.markdown).toContain('- The pump moves {{3 Na+ out}}{({3 out, 2 in})} per ATP.');
    expect(payload.markdown).not.toContain('The pump moves {{3 Na+ out}}{({3 out, 2 in})} per ATP. ::');

    // A question front, a label, a numbered step and a contrast row have no
    // answerable reverse — RemNote would show the back and demand the label.
    expect(payload.markdown).toContain(
      '  - Na+/K+ pump net movement? >> The Na+/K+ pump moves 3 Na+ out and 2 K+ in per ATP.'
    );
    expect(payload.markdown).toContain('- Resting potential? >> -70mV (K+ leak sets it)');
    expect(payload.markdown).not.toContain('Why >>');

    for (const nonsense of ['Step 1 ::', 'Why it matters ::', 'Resting potential? ::', 'vs Repolarization ::']) {
      expect(payload.markdown).not.toContain(nonsense);
    }

    // The one place a reverse is a real retrieval: a concept's NAME against its
    // definition ("given this definition, name the concept").
    expect(payload.markdown).toContain('- Depolarization :: Membrane potential moves toward 0');
    expect(payload.twoWayCount).toBe(1);

    // The counts describe the delimiters that are actually in the text.
    const twoWay = payload.twoWayCount ?? 0;
    const forward = payload.forwardCount ?? 0;
    expect((payload.markdown.match(/ :: /g) || []).length).toBe(twoWay);
    expect(forward).toBe(payload.cardCount - twoWay);
    expect(payload.factsCount).toBe(1);
    expect(payload.conceptsCount).toBe(1);
  });

  it('puts a memory hook on the deletion it explains instead of on its own card', () => {
    const payload = generateSegregationRemnote(REPORT);

    // `{{deletion}}{({hint})}`: the mnemonic is on-demand on the cloze card it
    // belongs to. As "Remember >> 3 out, 2 in" it was a card whose only content
    // was the mnemonic — unanswerable without the card it was reminding you of.
    expect(payload.markdown).toContain('- The pump moves {{3 Na+ out}}{({3 out, 2 in})} per ATP.');
    expect(payload.markdown).not.toContain('Remember >>');
    expect(payload.markdown).not.toContain('Memory hook: 3 out, 2 in #[[Extra Card Detail]]');
    const cloze = payload.cards!.find((c) => c.kind === 'cloze')!;
    expect(cloze.front).toBe('The pump moves {{3 Na+ out}} per ATP.');
  });

  it('keeps a deletion the source wrote instead of burying it in the detail', () => {
    // The renderer used to cloze `howItWorks` itself to make a card of it, and
    // then — once quadrants became detail — ship that cloze on the card BACK,
    // where RemNote never asks it. A deletion the SOURCE wrote is a deliberate
    // test, so the quadrant stays a card rather than being demoted.
    const authored = generateSegregationRemnote({
      topic: REPORT.topic,
      declarativeFacts: [],
      conceptualMechanisms: [
        {
          id: 'm1',
          conceptName: 'Countercurrent multiplication',
          whatIsIt: 'A gradient built by opposing flows.',
          whyItMatters: 'Concentrates urine.',
          howItWorks: 'Active transport out of the {{thick ascending limb}}.',
          whatIfEdgeCase: 'Urine stays isotonic.',
        },
      ],
      practiceQuestions: [],
      workedExamples: [],
    });

    expect(authored.markdown).toContain('  - How it works: Active transport out of the {{thick ascending limb}}.');
    expect(authored.markdown).not.toContain('{{thick ascending limb}}. #[[Extra Card Detail]]');
    expect(authored.cards!.map((c) => c.kind)).toEqual(['two-way', 'cloze']);
    expect(authored.cards![1].front).toBe('How it works');
  });

  it('reads a quadrant as the prose it is when it becomes detail', () => {
    // `optimizeCloze` used to paint a deletion onto the latter half of any long
    // quadrant. As detail that is decoration on a reveal nobody is asked for, so
    // the line ships as plain text.
    const payload = generateSegregationRemnote(REPORT);
    const howItWorks = payload.markdown
      .split('\n')
      .find((l) => l.includes('How it works:'))!;
    expect(howItWorks).toBe('  - How it works: Na+ channels open, Na+ rushes in #[[Extra Card Detail]]');
    expect(howItWorks).not.toContain('{{');
  });

  it('splits the deck into one pasteable document per card section', () => {
    const payload = generateSegregationRemnote(REPORT);

    expect(payload.documents?.map((d) => d.id)).toEqual(['facts', 'mechanisms', 'drills', 'examples']);
    for (const doc of payload.documents || []) {
      expect(doc.cardCount).toBeGreaterThan(0);
      // Every document is standalone: its own anchor, its own named page.
      const [anchorLine, titleLine] = doc.markdown.split('\n');
      expect(anchorLine).toBe('# 🌐 The Nervous System & Cellular Electrophysiology');
      expect(titleLine).toBe(`## 📁 ${doc.title}`);
    }

    const facts = payload.documents!.find((d) => d.id === 'facts')!;
    expect(facts.title).toBe('Action Potentials — Declarative Facts');
    expect(facts.filename).toBe('Action_Potentials_Declarative_Facts');
    expect(facts.markdown).toContain('The pump moves {{3 Na+ out}}{({3 out, 2 in})} per ATP.');
    // A document holds exactly its own section: nothing leaks across.
    expect(facts.markdown).not.toContain('Why it matters');
    expect(facts.markdown).not.toContain('Step 1');
    expect(facts.markdown).toContain('### 🔢 Declarative Facts');
    expect(facts.markdown).not.toContain('### ⚡ Practice Drills');

    // Per-document counts add up to the deck the summary reports.
    expect(payload.documents!.reduce((n, d) => n + d.cardCount, 0)).toBe(payload.cardCount);
    expect(payload.documents!.reduce((n, d) => n + d.twoWayCount, 0)).toBe(payload.twoWayCount);
    expect(payload.documents!.reduce((n, d) => n + d.forwardCount, 0)).toBe(payload.forwardCount);
    // Every card belongs to exactly one document, and the ids line up.
    expect(payload.documents!.flatMap((d) => d.cardIds).sort()).toEqual(payload.cards!.map((c) => c.id).sort());

    // An empty section produces no document at all (no empty page to paste).
    const factsAndMechanisms = generateSegregationRemnote({
      ...REPORT,
      practiceQuestions: [],
      workedExamples: [],
    });
    expect(factsAndMechanisms.documents?.map((d) => d.id)).toEqual(['facts', 'mechanisms']);
  });

  it('can split the same deck per source instead of per section', () => {
    // A forge over two lectures merges into one topic, so the section split
    // alone loses which lecture a card came from. The ids the merge namespaces
    // (`src_2-f1`) are the provenance, and grouping by it keeps the sections
    // intact underneath — one document per lecture that has cards.
    const merged: SegregationReport = {
      topic: 'Renal Physiology',
      declarativeFacts: [
        { id: 'src_1-f1', factStatement: 'The loop reaches 1,200 mOsm.', clozeSuggestion: 'The loop reaches {{1,200 mOsm}}.' },
        { id: 'src_2-f1', factStatement: 'ADH inserts aquaporins.', clozeSuggestion: 'ADH inserts {{aquaporins}}.' },
      ],
      conceptualMechanisms: [
        {
          id: 'src_1-m1',
          conceptName: 'Countercurrent multiplication',
          whatIsIt: 'A gradient built by opposing flows.',
          whyItMatters: 'Concentrates urine.',
          howItWorks: 'Active transport at the thick ascending limb.',
          whatIfEdgeCase: 'Urine stays isotonic.',
        },
      ],
      practiceQuestions: [{ id: 'src_2-q1', question: 'Which limb pumps salt out?', answer: 'The thick ascending limb.' }],
      workedExamples: [],
    };
    const labels = { src_1: 'Lecture 4 slides', src_2: 'Problem set 4' };

    const payload = generateSegregationRemnote(merged, { groupBy: 'source', sourceLabels: labels });

    expect(payload.documents?.map((d) => d.id)).toEqual(['src_1', 'src_2']);
    // The source label IS the page name — "Lecture 4 slides" is what the
    // learner called that input, and it is unambiguous inside the topic.
    expect(payload.documents!.map((d) => d.title)).toEqual(['Lecture 4 slides', 'Problem set 4']);
    expect(payload.documents!.map((d) => d.filename)).toEqual(['Lecture_4_slides', 'Problem_set_4']);
    expect(payload.documents![0].cardCount).toBe(2);
    expect(payload.documents![1].cardCount).toBe(2);
    // Sections still separate the cards inside a source document.
    expect(payload.documents![0].markdown).toContain('### 🔢 Declarative Facts');
    expect(payload.documents![0].markdown).toContain('### 🧠 4-Quadrant Mechanisms');
    expect(payload.documents![0].markdown).not.toContain('aquaporins');
    expect(payload.documents![1].markdown).not.toContain('1,200 mOsm');
    // Counts are the deck's, however it is grouped.
    expect(payload.documents!.reduce((n, d) => n + d.cardCount, 0)).toBe(payload.cardCount);

    // A deck with no provenance at all cannot be split per source, so it falls
    // back to the section split rather than making one document per card.
    const unsourced = generateSegregationRemnote(REPORT, { groupBy: 'source' });
    expect(unsourced.documents?.map((d) => d.id)).toEqual(['facts', 'mechanisms', 'drills', 'examples']);

    // A card whose id carries no source prefix is named as unattributed rather
    // than silently dropped from the split.
    const mixed = generateSegregationRemnote(
      { ...merged, declarativeFacts: [...merged.declarativeFacts, { id: 'f9', factStatement: 'No provenance.', clozeSuggestion: 'No {{provenance}}.' }] },
      { groupBy: 'source', sourceLabels: labels }
    );
    expect(mixed.documents?.map((d) => d.id)).toEqual(['src_1', 'src_2', 'unattributed']);
    expect(mixed.documents![2].title).toBe('unattributed');
    expect(mixed.documents!.reduce((n, d) => n + d.cardCount, 0)).toBe(mixed.cardCount);
  });

  it('applies a per-card direction override on top of the smart rule', () => {
    const twoWay = generateSegregationRemnote(REPORT);
    expect(twoWay.markdown).toContain('- Depolarization :: Membrane potential moves toward 0');

    const forcedForward = generateSegregationRemnote(REPORT, {
      directionOverrides: { 'mechanisms:0': 'forward' },
    });
    expect(forcedForward.markdown).toContain('- Depolarization >> Membrane potential moves toward 0');
    expect(forcedForward.markdown).not.toContain('Depolarization ::');
    expect(forcedForward.twoWayCount).toBe(0);
    expect(forcedForward.forwardCount).toBe(forcedForward.cardCount);

    // And the other way, for the one line you DO want reversed.
    const forcedTwoWay = generateSegregationRemnote(REPORT, {
      explanationsAsDetail: false,
      directionOverrides: { 'facts:1': 'two-way' },
    });
    expect(forcedTwoWay.markdown).toContain(
      '- Na+/K+ pump net movement? :: The Na+/K+ pump moves 3 Na+ out and 2 K+ in per ATP.'
    );
    expect(forcedTwoWay.twoWayCount).toBe(2);
  });

  it('can flatten the whole deck to forward-only cards', () => {
    const flat = generateSegregationRemnote(REPORT, { twoWayCards: false });
    expect(flat.twoWayCount).toBe(0);
    expect(flat.markdown).not.toContain(' :: ');
    expect(flat.markdown).toContain('- Depolarization >> Membrane potential moves toward 0');
    expect(flat.forwardCount).toBe(flat.cardCount);
  });

  it('reports which fronts can only be asked one way', () => {
    const payload = generateSegregationRemnote(REPORT);
    const fq = payload.frontQuality!;

    expect(fq.total).toBe(payload.cardCount);
    expect(fq.twoWay).toBe(1);
    expect(fq.forwardOnly).toBe(payload.cardCount - 1);
    expect(fq.clozes).toBe(1);
    expect(fq.multiPart).toBe(1);
    // The two question fronts: a label is not the thing being learned.
    expect(fq.labelled).toBe(2);
    expect(fq.examples).toContain('Na+/K+ pump net movement?');
    expect(fq.note).toContain('2 of 5 cards');
    expect(fq.note).toContain('one way');

    // A deck that is all concept-definitions says so instead of nagging.
    const clean = generateSegregationRemnote({
      topic: 'T',
      declarativeFacts: [],
      conceptualMechanisms: [
        {
          id: 'm1',
          conceptName: 'Osmosis',
          whatIsIt: 'Water across a semipermeable membrane',
          whyItMatters: '',
          howItWorks: '',
          whatIfEdgeCase: '',
        },
      ],
      practiceQuestions: [],
      workedExamples: [],
    });
    expect(clean.frontQuality!.labelled).toBe(0);
    expect(clean.frontQuality!.note).toBe('Every card front is the thing being recalled.');
  });

  it('never invents a front for a fact that has neither a question nor a cloze', () => {
    const payload = generateSegregationRemnote({
      topic: REPORT.topic,
      declarativeFacts: [{ id: 'f2', factStatement: 'Threshold is -55mV.', clozeSuggestion: '' }],
      conceptualMechanisms: [],
      practiceQuestions: [],
      workedExamples: [],
    });
    // The statement rides along as a note; a card here could only be the
    // unanswerable "...(Constant) → name the label" one.
    expect(payload.markdown).toContain('- Threshold is -55mV.');
    expect(payload.cardCount).toBe(0);
    expect(payload.documents).toEqual([]);
  });

  it('keeps a cloze fact even when the fact also has a question', () => {
    const payload = generateSegregationRemnote(REPORT);
    expect(payload.markdown).toContain('The pump moves {{3 Na+ out}}{({3 out, 2 in})} per ATP.');
    expect(payload.markdown).toContain('Na+/K+ pump net movement? >>');
  });

  it('turns a worked-example step chain into one multi-line card', () => {
    const payload = generateSegregationRemnote(REPORT);
    const lines = payload.markdown.split('\n');
    const open = lines.indexOf('- Nernst — Find EK >>>');
    // `>>>` opens a multi-line card: the nested bullets are the answer's parts,
    // not four unrelated cards each asking for a fragment.
    expect(open).toBeGreaterThan(-1);
    expect(lines[open + 1]).toBe('  - Plug values');
    expect(lines[open + 2]).toBe('  - Solve');
    expect(lines[open + 3]).toBe('  - Takeaway: Gradient rules');
    const example = payload.cards!.find((c) => c.front === 'Nernst — Find EK')!;
    expect(example.kind).toBe('multi-line');
    expect(example.reversible).toBe(false);
  });

  it('renders the schema path as cards too, with the quadrant prompts one-way', () => {
    const schemaPayload = generateRemnoteHierarchy({
      topicSummary: 'T',
      activities: [
        {
          id: 'a1', stageNumber: 1, title: 'Stage 1', framework: 'F', cognitiveGoal: 'G',
          contextSnippet: 'ctx', keywords: ['K'], templateType: 'first_principles',
          prompt: 'P', scaffold: { field1Label: '', field1Placeholder: '', field2Label: '', field2Placeholder: '', exampleAnswer: '' },
        },
      ],
      researchContexts: [
        {
          id: 'r1',
          conceptAdded: 'Photosynthesis',
          explanation: 'Light in, sugar out.',
          detectedGap: 'the Calvin cycle',
          sourceTitle: 'Guyton & Hall, ch. 4',
        },
      ],
    });

    // A named concept still gets its reverse...
    expect(schemaPayload.markdown).toContain('- Photosynthesis :: Light in, sugar out.');
    // ...while the four quadrant prompts (questions) and the ordinal-led stage
    // headline stay forward-only.
    expect(schemaPayload.markdown).toContain('- 1. Stage 1 >> G');
    expect(schemaPayload.markdown).toContain('Why does it matter? (Significance)');
    expect(schemaPayload.markdown).not.toContain('Why does it matter? (Significance) ::');
    expect(schemaPayload.markdown).not.toContain('What is it? (Definition) ::');
    expect(schemaPayload.markdown).not.toContain('1. Stage 1 ::');
    // The citation is detail on the prerequisite card, not a card of its own.
    expect(schemaPayload.markdown).toContain('  - Authoritative reference: Guyton & Hall, ch. 4 #[[Extra Card Detail]]');
    expect(schemaPayload.twoWayCount).toBe(1);
    expect(schemaPayload.documents?.map((d) => d.id)).toEqual(['prerequisites', 'stages']);
  });

  it('wraps confusable pairs in [[concept portals]] and counts them', () => {
    // The plan's Pillar 3: reviewing either card previews the other concept,
    // so a lookalike pair is studied as one boundary, not two unrelated cards.
    const payload = generateSegregationRemnote({
      ...REPORT,
      confusablePairs: [
        {
          id: 'c1',
          conceptA: 'SN1 Reaction',
          conceptB: 'SN2 Reaction',
          distinguishingAxis: 'Rate law',
          boundaryCondition: 'Tertiary substrate in polar protic solvent',
          conceptAFeature: 'Unimolecular, racemization',
          conceptBFeature: 'Bimolecular, Walden inversion',
          diagnosticVignette: 'Cyanide in DMSO inverts the stereochemistry',
          diagnosticAnswer: 'SN2 — polar aprotic solvent, strong nucleophile',
        },
      ],
      workedExamples: [],
    });

    expect(payload.markdown).toContain('When does the system switch from [[SN1 Reaction]] to [[SN2 Reaction]]?');
    // Feature rows carry the portal too, and the vignette keeps its links.
    expect(payload.markdown).toContain('  - [[SN1 Reaction]] Feature: Unimolecular, racemization');
    expect(payload.markdown).toContain('Vignette: Cyanide in DMSO inverts the stereochemistry ([[SN1 Reaction]] vs [[SN2 Reaction]])');
    // Never the naive sub-descriptor trap the plan names.
    expect(payload.markdown).not.toContain('Confusable With >>');
    // Each distinct pair name is one portal.
    expect(payload.conceptPortals).toBe(2);

    // The anti-fragment guarantee the plan demands holds underneath.
    for (const line of payload.markdown.split('\n').filter((l) => l.includes('#[[Extra Card Detail]]'))) {
      expect(line.startsWith('  - ')).toBe(true);
    }

    // A pair with missing names still counts only what it actually links.
    const partial = generateSegregationRemnote({
      ...REPORT,
      confusablePairs: [{
        id: 'c2',
        conceptA: 'Depolarization',
        conceptB: '',
        distinguishingAxis: 'Ion gate',
        boundaryCondition: 'Na+ gate closes at the peak',
        conceptAFeature: 'Na+ in',
        conceptBFeature: 'K+ out',
        diagnosticVignette: '',
        diagnosticAnswer: '',
      }],
      workedExamples: [],
    });
    expect(partial.conceptPortals).toBe(1);
    // A deck with no pairs reports zero, not undefined.
    expect(generateSegregationRemnote(REPORT).conceptPortals).toBe(0);
  });

  it('pushes through the app server with RemNote\'s documented v0 auth', () => {
    const attempts = buildRemnotePushAttempts('key-123', 'user-9', generateSegregationRemnote(REPORT));
    expect(attempts.length).toBeGreaterThan(0);
    for (const attempt of attempts) {
      expect(attempt.url.startsWith(REMNOTE_API_BASE)).toBe(true);
      // RemNote authenticates with apiKey/userId headers — never a Bearer token.
      expect(attempt.headers.apiKey).toBe('key-123');
      expect(attempt.headers.userId).toBe('user-9');
      expect(JSON.stringify(attempt.headers)).not.toContain('Bearer');
      expect(JSON.stringify(attempt.body)).toContain('Na+/K+ pump net movement?');
    }
    // The browser must never call api.remnote.io itself: no CORS headers there.
    expect(attempts[0].url).toContain('api.remnote.io');
  });
});

describe('remnoteToyEmbedLine (plan Pillar 4)', () => {
  it('emits the labelled detail bullet with a bare URL RemNote unfurls', () => {
    expect(remnoteToyEmbedLine('https://deepencode.app/embed/toy-models/ohm', 'Ohm\u2019s law'))
      .toBe('- Interactive Lab: Ohm\u2019s law #[[Extra Card Detail]]\n    - https://deepencode.app/embed/toy-models/ohm');
  });

  it('keeps the shape honest when pieces are missing', () => {
    expect(remnoteToyEmbedLine('https://x.example/embed', '')).toBe('- Interactive Lab: #[[Extra Card Detail]]\n    - https://x.example/embed');
    expect(remnoteToyEmbedLine('  padded  ', ' L ')).toBe('- Interactive Lab: L #[[Extra Card Detail]]\n    - padded');
    // No URL, no bullet at all — an embed line without a link is clutter.
    expect(remnoteToyEmbedLine('', 'Ohm\u2019s law')).toBe('- Interactive Lab: Ohm\u2019s law #[[Extra Card Detail]]');
  });
});

describe('pushToRemnoteApi (server proxy)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts to the app\'s own route instead of calling RemNote from the browser', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, message: 'Pushed.', docId: 'doc_1' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const payload = generateSegregationRemnote({
      topic: 'T',
      declarativeFacts: [],
      conceptualMechanisms: [],
    });
    const result = await pushToRemnoteApi('key', 'user', payload);

    expect(result.success).toBe(true);
    expect(result.docId).toBe('doc_1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/remnote');
    const sent = JSON.parse(String(init?.body));
    expect(sent.apiKey).toBe('key');
    expect(sent.markdown).toBe(payload.markdown);
  });

  it('says what it pushed, including the concept portals', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, message: 'Pushed.', docId: 'doc_1' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const withPortals = generateSegregationRemnote({
      ...REPORT,
      confusablePairs: [
        {
          id: 'c1',
          conceptA: 'Depolarization',
          conceptB: 'Repolarization',
          distinguishingAxis: 'Ion gate',
          boundaryCondition: 'Na+ gate closes at the peak',
          conceptAFeature: 'Na+ in',
          conceptBFeature: 'K+ out',
          diagnosticVignette: '',
          diagnosticAnswer: '',
        },
      ],
      workedExamples: [],
    });
    const result = await pushToRemnoteApi('key', 'user', withPortals);
    expect(result.success).toBe(true);
    // facts + mechanisms + drills + the confusable section.
    expect(result.message).toContain('4 RemNote documents');
    expect(result.message).toContain('2 concept portals');

    // A deck without portals says so by omission, exactly as before.
    const plain = await pushToRemnoteApi('key', 'user', generateSegregationRemnote(REPORT));
    expect(plain.message).toContain('4 RemNote documents — one per card section.');
    expect(plain.message).not.toContain('portal');
  });

  it('creates one document per card section, titled like the copy list', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, message: 'Pushed.', docId: 'doc_1' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const payload = generateSegregationRemnote(REPORT);
    const result = await pushToRemnoteApi('key', 'user', payload);

    expect(result.success).toBe(true);
    expect(result.pushed).toBe(4);
    expect(result.failed).toBe(0);
    expect(result.message).toContain('4 RemNote documents');
    expect(fetchMock.mock.calls).toHaveLength(4);
    const titles = fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)).title);
    expect(titles).toEqual(payload.documents!.map((d) => d.title));
    // Each call carries only its own section, not the whole deck.
    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)).markdown);
    expect(bodies[0]).toContain('Declarative Facts');
    expect(bodies[0]).not.toContain('Worked Examples');
  });

  it('stops at the first refusal and says how much of the deck landed', async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      if (calls === 2) {
        return {
          ok: false,
          status: 502,
          json: async () => ({ success: false, message: 'RemNote answered HTTP 401.' }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, message: 'Pushed.', docId: `doc_${calls}` }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await pushToRemnoteApi('key', 'user', generateSegregationRemnote(REPORT));

    // A half-pushed deck must be recognisable as one: neither a success nor a
    // total failure, and it must not keep hammering a refused API.
    expect(result.success).toBe(false);
    expect(result.pushed).toBe(1);
    expect(result.failed).toBe(3);
    expect(result.message).toContain('Pushed 1 of 4');
    expect(result.message).toContain('HTTP 401');
    expect(calls).toBe(2);
  });

  it('surfaces the server\'s own failure text and points at the markdown path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 502,
        json: async () => ({ success: false, message: 'RemNote answered HTTP 401.' }),
      }))
    );

    const result = await pushToRemnoteApi('bad', '', {
      markdown: '# T',
      cardCount: 0,
      factsCount: 0,
      conceptsCount: 0,
      hierarchicalDeck: '# T',
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('HTTP 401');
  });
});

/**
 * Cloze hints are MODEL-authored text pasted into `{({…})}`, and RemNote reads
 * that delimiter up to its first inner `)`. A hint like `near E_K (-90 mV)` or
 * `q = mcΔT (per kg)` therefore used to be cut off mid-clause and mangle the
 * prompt — the hint has to be sanitised, not trusted, the same way the rest of
 * this renderer treats model output.
 */
describe('cloze hint sanitisation', () => {
  it('strips parentheses that would close the hint delimiter early', () => {
    expect(sanitizeClozeHint('near E_K (-90 mV)')).toBe('near E_K -90 mV');
    expect(sanitizeClozeHint('q = mcΔT (per kg)')).toBe('q = mcΔT per kg');
  });

  it('keeps the words apart instead of gluing them together', () => {
    expect(sanitizeClozeHint('ATP(adenosine)')).toBe('ATP adenosine');
  });

  it('drops braces so a hint can never nest inside the deletion', () => {
    expect(sanitizeClozeHint('{{not a cloze}}')).toBe('not a cloze');
  });

  it('caps the hint length and collapses whitespace', () => {
    expect(sanitizeClozeHint('  a   b  ')).toBe('a b');
    expect(sanitizeClozeHint('x'.repeat(200)).length).toBe(120);
  });

  it('attaches a balanced delimiter even for a previously delimiter-breaking hint', () => {
    const line = attachClozeHint('The pump moves {{3 Na+ out}} per ATP.', 'near E_K (-90 mV)');
    expect(line).toBe('The pump moves {{3 Na+ out}}{({near E_K -90 mV})} per ATP.');
    // Exactly one opening and one closing hint delimiter: nothing to mis-parse.
    expect(line.match(/\{\(\{/g)).toHaveLength(1);
    expect(line.match(/\}\)\}/g)).toHaveLength(1);
  });

  it('leaves a hint-free line untouched and hints only the first deletion', () => {
    expect(attachClozeHint('No deletion here.', 'anything')).toBe('No deletion here.');
    const two = attachClozeHint('{{a}} then {{b}}', 'hint');
    expect(two).toBe('{{a}}{({hint})} then {{b}}');
  });
});
