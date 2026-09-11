import JSZip from 'jszip';
import { SavedSchema, SegregationReport, ProceduralMCQArchetype, StageResponse, Activity } from './types';
import { buildAnkiCollectionSqlite, generateAnkiGuid, AnkiNoteRow } from './anki-sqlite-writer';
import { countWords, stripHtml, classifyDeckQuality } from './fsrs-audit';

export { classifyDeckQuality };

export interface SM2State {
  repetitions: number;
  interval: number; // in days
  easeFactor: number;
  nextReviewTimestamp: number;
}

export interface AnkiCardItem {
  id: string;
  front: string; // or Cloze text
  back: string;
  isCloze: boolean;
  tags: string[];
  sm2: SM2State;
}

/**
 * SM-2 Spaced Repetition Algorithm Implementation
 * @param grade Performance rating from 0 (complete blackout) to 5 (perfect recall)
 * @param previousState Previous SM2 state
 */
export function calculateSM2(grade: number, previousState?: SM2State): SM2State {
  const reps = previousState?.repetitions || 0;
  let ease = previousState?.easeFactor || 2.5;
  let interval = previousState?.interval || 1;

  // Grade must be clamped between 0 and 5
  const clampedGrade = Math.max(0, Math.min(5, grade));

  if (clampedGrade >= 3) {
    if (reps === 0) {
      interval = 1;
    } else if (reps === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * ease);
    }
    // Update Ease Factor: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    ease = ease + (0.1 - (5 - clampedGrade) * (0.08 + (5 - clampedGrade) * 0.02));
    if (ease < 1.3) ease = 1.3;
  } else {
    // Reset if failed
    interval = 1;
    ease = Math.max(1.3, ease - 0.2);
  }

  const nextReviewTimestamp = Date.now() + interval * 24 * 60 * 60 * 1000;

  return {
    repetitions: clampedGrade >= 3 ? reps + 1 : 0,
    interval,
    easeFactor: Number(ease.toFixed(2)),
    nextReviewTimestamp,
  };
}

/** Sanitizes a topic into a single Anki deck path segment (no '::' inside). */
function sanitizeTopicSegment(topic: string): string {
  return topic
    .replace(/::/g, ' - ')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[^a-zA-Z0-9 _\-.]/g, '')
    .trim()
    .slice(0, 80);
}

/** Hierarchical handoff deck: `DeepEncode::{Topic}`. */
export function buildHierarchicalDeckName(topicSummary?: string): string {
  const topic = sanitizeTopicSegment(topicSummary || '');
  return topic ? `DeepEncode::${topic}` : 'DeepEncode';
}

/** Adds LeechCandidate when FSRS would punish the card's density. */
function appendLeechTag(card: AnkiCardItem): void {
  if (countWords(`${card.front} ${card.back}`) > 15) card.tags.push('LeechCandidate');
}

/** Export tag set for one activity + response (Unfinished gate lives here). */
export function computeActivityExportTags(resp: StageResponse | undefined): string[] {
  const hasWording = Boolean(resp && !resp.skipped && (resp.field1?.trim() || resp.field2?.trim()));
  if (!hasWording || !resp) return ['DeepEncode', 'SchemaActivity', 'Unfinished'];
  const tags = ['DeepEncode', 'SchemaActivity'];
  if (resp.skipped || resp.feynmanReview?.grade === 'needs_elaboration') tags.push('Unfinished');
  return tags;
}

/**
 * Clozes the highest-value keyword inside the USER'S own sentence (mirrors the
 * RemNote `optimizeCloze` heuristic so both handoffs treat wording alike).
 */
export function clozeUserWording(text: string, keywords: string[]): string {
  if (!text || text.includes('{{c1::')) return text;
  for (const kw of keywords) {
    const clean = (kw || '').trim();
    if (clean.length > 2 && text.toLowerCase().includes(clean.toLowerCase())) {
      const regex = new RegExp(`(${clean.replace(/[-/\\^$*+?.()|[\\]{}]/g, '\\$&')})`, 'i');
      if (regex.test(text)) return text.replace(regex, '{{$1}}');
    }
  }
  const words = text.trim().split(/\s+/);
  if (words.length <= 4) return `{{${text}}}`;
  const mid = Math.ceil(words.length / 2);
  return `${words.slice(0, mid).join(' ')} {{${words.slice(mid).join(' ')}}}`;
}

/**
 * Converts RemNote/cloze-style `{{Term}}` markers into real Anki cloze
 * deletions `{{cN::Term}}` (sequential c1, c2, ...). Already-indexed markers
 * like `{{c2::X}}` are preserved untouched. Required because the .apkg hands
 * user wording to Anki's Cloze note type: bare `{{X}}` would render literally.
 */
export function normalizeClozeTermToAnki(text: string): string {
  let index = 0;
  return text.replace(/\{\{([^{}]*)\}\}/g, (match, inner: string) => {
    if (/^c\d+::/.test(inner)) return match;
    index += 1;
    return `{{c${index}::${inner}}}`;
  });
}

/**
 * Guarantees a front carries at least one REAL Anki deletion (`{{cN::...}}`).
 * Anki's Cloze note type refuses cards without one ("No cloze 1 found"), and
 * bare `{{term}}` renders as literal braces. Falls back to clozeing the last
 * half of the sentence when the text has no braces at all.
 */
function ensureAnkiCloze(text: string): string {
  const input = text || '';
  if (input.includes('{{c')) return input;
  const normalized = normalizeClozeTermToAnki(input);
  if (normalized.includes('{{c')) return normalized;
  return normalizeClozeTermToAnki(clozeUserWording(input, []));
}

/** Converts a cloze front into a Basic Q/A front: deletions become blanks. */
function clozeToBasicText(front: string): string {
  return front.replace(/\{\{c\d+::[^}]*\}\}/g, '<b>[ ? ]</b>');
}

/**
 * Canonical Anki "Default" deck options group (deck config id 1), matching the
 * exact JSON a real Anki schema-11 export writes. Anki's Rust deserializer
 * requires EVERY one of these keys — omitting any single one fails import with
 * `decoding deck config: missing field <key>` (we hit `mod`, then `autoplay`).
 *
 * Top level : id, mod, name, usn, autoplay, timer, replayq, maxTaken, new, rev, lapse, dyn
 * new       : bury, delays, initialFactor, ints, order, perDay, separate
 * rev       : bury, ease4, fuzz, hardFactor, ivlFct, maxIvl, minSpace, perDay
 * lapse     : delays, leechAction, leechFails, minInt, mult
 */
function makeDefaultDconf(modSec: number): Record<string, unknown> {
  return {
    id: 1,
    mod: modSec,
    name: 'Default',
    usn: -1,
    autoplay: true,
    timer: 0,
    replayq: true,
    maxTaken: 60,
    new: { bury: true, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 7], order: 1, perDay: 20, separate: true },
    rev: { bury: true, ease4: 1.3, fuzz: 0.05, hardFactor: 1.2, ivlFct: 1, maxIvl: 36500, minSpace: 1, perDay: 100 },
    lapse: { delays: [10], leechAction: 1, leechFails: 8, minInt: 1, mult: 0 },
    dyn: false,
  };
}

/** True when the response carries real user encoding worth exporting. */
function isEncoded(resp?: StageResponse): boolean {
  if (!resp || resp.skipped) return false;
  return Boolean(resp.field1?.trim() || resp.field2?.trim());
}

/**
 * Builds cards from ONE activity's user wording (the whole point: their own
 * phrasing encodes deeper than AI text). Front = AI cue, Back = user wording.
 */
function buildUserWordingCards(
  act: Activity,
  resp: StageResponse | undefined,
  idx: number,
  initialSM2: SM2State
): AnkiCardItem[] {
  const cards: AnkiCardItem[] = [];
  const stageTag = `Stage:${act.stageNumber ?? idx + 1}`;
  const baseTags = computeActivityExportTags(resp);
  const f1 = (resp?.field1 || '').trim();
  const f2 = (resp?.field2 || '').trim();
  const f3 = (resp?.field3 || '').trim();

  if (!isEncoded(resp)) {
    // Nothing encoded (skipped or abandoned): export the AI cue only, tagged
    // Unfinished so a filtered deck forces the student to re-encode it.
    cards.push({
      id: `act-${act.id}-cue`,
      front: `<b>${act.title}</b><br>${act.prompt}`,
      back: `<b>Not encoded yet.</b><br>${act.contextSnippet}`,
      isCloze: false,
      tags: [...baseTags, stageTag],
      sm2: { ...initialSM2 },
    });
    return cards;
  }

  // Card 1: user wording cloze (generation effect payoff). Cloze the key term
  // inside THEIR sentence; their full wording becomes the answer side.
  const userSentence = f1 || f2;
  const clozed = normalizeClozeTermToAnki(clozeUserWording(userSentence, act.keywords || []));
  const hasCloze = clozed.includes('{{');
  const otherField = f1 && f2 ? (f1 === userSentence ? f2 : f1) : '';
  const backParts: string[] = [];
  if (otherField) backParts.push(`<b>In your own words:</b> ${otherField}`);
  if (f3) backParts.push(`<b>Anchor:</b> ${f3}`);
  if (resp?.errorAnalysis) backParts.push(`<b>Checker note:</b> ${resp.errorAnalysis}`);
  if (!hasCloze) backParts.push(`<b>Full recall:</b> ${userSentence}`);

  const mainCard: AnkiCardItem = {
    id: `act-${act.id}-main`,
    front: hasCloze
      ? `<b>${act.title}</b><br>${clozed}`
      : `<b>${act.title}</b><br>${act.prompt}`,
    back: backParts.join('<br>') || `<b>In your own words:</b> ${userSentence}`,
    isCloze: hasCloze,
    tags: [...baseTags, stageTag],
    sm2: { ...initialSM2 },
  };
  appendLeechTag(mainCard);
  cards.push(mainCard);

  // Card 2 (only when both fields were answered): the mechanism recall pair.
  if (f1 && f2) {
    const mechCard: AnkiCardItem = {
      id: `act-${act.id}-mech`,
      front: `<b>${act.title}</b> — mechanism<br>${act.scaffold.field2Label}: how does it actually work?`,
      back: `<b>In your own words:</b> ${f2}<br><b>Cue:</b> ${f1}`,
      isCloze: false,
      tags: [...baseTags, stageTag],
      sm2: { ...initialSM2 },
    };
    appendLeechTag(mechCard);
    cards.push(mechCard);
  }

  // Card 3: boundary contrast trap (discriminative practice).
  if (act.boundaryContrast?.confusableLookalike && act.boundaryContrast?.distinguishingRule) {
    cards.push({
      id: `act-${act.id}-boundary`,
      front: `How do you distinguish <b>${act.title}</b> from its lookalike <i>${act.boundaryContrast.confusableLookalike}</i>?`,
      back: `<b>Distinguishing Rule:</b> ${act.boundaryContrast.distinguishingRule}`,
      isCloze: false,
      tags: ['DeepEncode', 'BoundaryContrast', stageTag],
      sm2: { ...initialSM2 },
    });
  }

  return cards;
}

/**
 * Extracts normalized Anki cards from a SavedSchema.
 *
 * Priority order (encoder-first handoff):
 *   1. USER WORDING per stage (field1/field2/field3 + error analysis) — the
 *      generation-effect payoff. Skipped / needs_elaboration stages export
 *      tagged `Unfinished`, dense ones tagged `LeechCandidate`.
 *   2. SegregationReport quadrant cards when present.
 */
export function extractAnkiCardsFromSchema(
  schema?: Partial<SavedSchema> | null,
  report?: SegregationReport | null
): AnkiCardItem[] {
  const initialSM2 = calculateSM2(4); // Default initialized with 1-day initial SM2 interval
  const activities: Activity[] = schema?.activities || [];

  // 1. USER WORDING — primary path. Every activity, encoded or not.
  const userCards: AnkiCardItem[] = [];
  activities.forEach((act, idx) => {
    if (!act) return;
    userCards.push(...buildUserWordingCards(act, schema?.userResponses?.[act.id], idx, initialSM2));
  });
  if (userCards.length > 0) return userCards;

  const cards: AnkiCardItem[] = [];

  // 2a. Declarative Facts (segregation report path): short Q/A front when
  // the model supplies one, so fronts never repeat the whole fact. Cloze
  // fronts are normalized so Anki always sees a real {{cN::}} deletion (bare
  // {{term}} would render as literal braces or trip "No cloze found").
  if (report?.declarativeFacts) {
    report.declarativeFacts.forEach((fact, idx) => {
      const question = (fact.question || '').trim();
      const hasQuestion = question.length > 0;
      const front = hasQuestion
        ? question
        : ensureAnkiCloze(fact.clozeSuggestion || fact.factStatement);
      const hook = fact.memoryHook ? `<br><i>Hook: ${fact.memoryHook}</i>` : '';
      cards.push({
        id: fact.id || `fact-${idx}`,
        front,
        back: `<b>Fact Detail:</b> ${fact.factStatement}${hook}`,
        isCloze: !hasQuestion && front.includes('{{c'),
        tags: ['DeepEncode', 'DeclarativeFact', fact.tag || 'General'].filter(Boolean),
        sm2: { ...initialSM2 },
      });
    });
  }

  // 2. 4-Quadrant Conceptual Mechanisms
  const mechanisms = report?.conceptualMechanisms || [];
  mechanisms.forEach((mech, idx) => {
    // Quadrant 1 + 3 Causal Cloze : if the mechanism text never mentions the
    // concept name, inject a real deletion anyway so the Cloze note type works.
    const causalBody = mech.howItWorks.includes(mech.conceptName)
      ? mech.howItWorks.replace(mech.conceptName, `{{c1::${mech.conceptName}}}`)
      : ensureAnkiCloze(mech.howItWorks);
    cards.push({
      id: `mech-${idx}-causal`,
      front: `<b>${mech.conceptName}</b> (Causal Mechanism):<br>${causalBody}`,
      back: `<b>What it is:</b> ${mech.whatIsIt}<br><b>Why it matters:</b> ${mech.whyItMatters}`,
      isCloze: causalBody.includes('{{c'),
      tags: ['DeepEncode', 'ConceptualMechanism', '4Quadrant'],
      sm2: { ...initialSM2 },
    });

    // Quadrant 4 Edge Case / What-If
    if (mech.whatIfEdgeCase) {
      cards.push({
        id: `mech-${idx}-edgecase`,
        front: `What happens if <b>${mech.conceptName}</b> fails or hits an edge case?`,
        back: mech.whatIfEdgeCase,
        isCloze: false,
        tags: ['DeepEncode', 'EdgeCase'],
        sm2: { ...initialSM2 },
      });
    }

    // Boundary Contrast Trap
    if (mech.boundaryContrast) {
      cards.push({
        id: `mech-${idx}-boundary`,
        front: `How do you distinguish <b>${mech.conceptName}</b> from its lookalike <i>${mech.boundaryContrast.confusableLookalike}</i>?`,
        back: `<b>Distinguishing Rule:</b> ${mech.boundaryContrast.distinguishingRule}`,
        isCloze: false,
        tags: ['DeepEncode', 'BoundaryContrast'],
        sm2: { ...initialSM2 },
      });
    }
  });

  // 2b. Practice Questions: rapid-fire short Q/A drills.
  (report?.practiceQuestions || []).forEach((pq, idx) => {
    const traps = (pq.distractors || []).filter(Boolean);
    const trapLine = traps.length > 0 ? `<br><i>Traps: ${traps.join(' / ')}</i>` : '';
    const whyLine = pq.whyCorrect ? `<br><b>Why:</b> ${pq.whyCorrect}` : '';
    cards.push({
      id: pq.id || `pq-${idx}`,
      front: pq.question,
      back: `<b>Answer:</b> ${pq.answer}${whyLine}${trapLine}`,
      isCloze: false,
      tags: ['DeepEncode', 'PracticeQuestion'],
      sm2: { ...initialSM2 },
    });
  });

  // 2c. Worked Examples: one card per solution step (atomic backs) plus a
  // takeaway card, so multi-step reasoning becomes several small reviews.
  (report?.workedExamples || []).forEach((ex, idx) => {
    const steps = (ex.steps || []).filter(Boolean);
    steps.forEach((step, sIdx) => {
      cards.push({
        id: ex.id ? `${ex.id}-step-${sIdx + 1}` : `example-${idx}-step-${sIdx + 1}`,
        front: `<b>${ex.title}</b> — step ${sIdx + 1}/${steps.length}:<br>${ex.problem}`,
        back: step,
        isCloze: false,
        tags: ['DeepEncode', 'WorkedExample'],
        sm2: { ...initialSM2 },
      });
    });
    if (ex.takeaway) {
      cards.push({
        id: ex.id ? `${ex.id}-takeaway` : `example-${idx}-takeaway`,
        front: `<b>${ex.title}</b>: what is the transfer rule?`,
        back: ex.takeaway,
        isCloze: false,
        tags: ['DeepEncode', 'WorkedExample'],
        sm2: { ...initialSM2 },
      });
    }
  });

  // 3. Fallback from SavedSchema Activities if report is empty
  if (cards.length === 0 && schema?.activities) {
    schema.activities.forEach((act, idx) => {
      const promptBody = ensureAnkiCloze(act.prompt);
      cards.push({
        id: act.id || `act-${idx}`,
        front: `<b>${act.title}</b>:<br>${promptBody}`,
        back: `<b>Key Concepts:</b> ${act.keywords.join(', ')}<br>${act.contextSnippet}`,
        isCloze: promptBody.includes('{{c'),
        tags: ['DeepEncode', 'SchemaActivity'],
        sm2: { ...initialSM2 },
      });
    });
  }

  return cards;
}

/**
 * Generates Anki Import Text Format (.txt/.tsv). Because Anki maps every row
 * of a file to ONE note type, cloze cards and basic cards are split into
 * separate decks/files:
 *   - cloze file: `#notetype:Cloze`, rows carry real {{cN::}} deletions.
 *   - basic file: `#notetype:Basic`, plain Front/Back rows.
 * This prevents "No cloze 1 found" when a mixed deck is imported as Cloze and
 * avoids field-count mismatches caused by an extra scheduling column.
 */
export function generateAnkiTextDecks(cards: AnkiCardItem[], deckName: string): { basic?: string; cloze?: string } {
  const safeDeck = deckName.replace(/[\n\t]/g, ' ');
  const clozeCards = cards.filter((c) => c.isCloze && c.front.includes('{{c'));
  const basicCards = cards.filter((c) => !c.isCloze || !c.front.includes('{{c'));

  const build = (noteType: 'Basic' | 'Cloze', rows: AnkiCardItem[]) => {
    const lines: string[] = [];
    lines.push(`#separator:tab`);
    lines.push(`#html:true`);
    lines.push(`#tags column:3`);
    lines.push(`#deck:${safeDeck}`);
    lines.push(`#notetype:${noteType}`);
    lines.push('');
    rows.forEach((c) => {
      const cleanFront = c.front.replace(/[\t\n]/g, ' ');
      const cleanBack = c.back.replace(/[\t\n]/g, ' ');
      const tagStr = c.tags.join(' ');
      // Cloze model fields are [Text, Extra]; Basic model fields are [Front, Back].
      lines.push(`${cleanFront}\t${cleanBack}\t${tagStr}`);
    });
    return lines.join('\n');
  };

  const result: { basic?: string; cloze?: string } = {};
  if (basicCards.length > 0) result.basic = build('Basic', basicCards);
  if (clozeCards.length > 0) result.cloze = build('Cloze', clozeCards);
  return result;
}

/** Legacy single-file wrapper : emits one deck (cloze preferred, then basic). */
export function generateAnkiTextDeck(cards: AnkiCardItem[], deckName: string): string {
  const decks = generateAnkiTextDecks(cards, deckName);
  return decks.cloze || decks.basic || '';
}

// ─── Declarative note types (real .apkg, FSRS-ready) ────────────────────────

const DECLARATIVE_CSS = `
.card { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 17px; line-height: 1.55; text-align: left; color: #e2e8f0; background: #0f111a; padding: 12px; }
.cloze, .cloze b { font-weight: 700; color: #fbbf24; }
.backextra { margin-top: 10px; padding-top: 8px; border-top: 1px solid #334155; font-size: 14px; color: #94a3b8; }
`;

/**
 * Builds the two declarative note types for handoff: `DeepEncode Basic`
 * (Front, Back, Extra) and `DeepEncode Cloze` (Text, Extra). Cloze deletions
 * behave as real clozes instead of Basic cards carrying literal {{c1::}} text.
 */
export function buildDeclarativeModels(modSec: number): Record<string, unknown> {
  const basicId = 1700000000100;
  const clozeId = 1700000000101;
  const base = {
    mod: modSec,
    usn: -1,
    did: null,
    css: DECLARATIVE_CSS,
    latexPre:
      '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n' +
      '\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n',
    latexPost: '\\end{document}',
    tags: [],
    vers: [],
  };
  return {
    [String(basicId)]: {
      ...base,
      id: basicId,
      name: 'DeepEncode Basic',
      type: 0,
      sortf: 0,
      tmpl: [
        {
          name: 'Card 1',
          ord: 0,
          qfmt: '{{Front}}',
          afmt: '{{FrontSide}}<hr id="answer">{{Back}}{{#Extra}}<div class="backextra">{{Extra}}</div>{{/Extra}}',
          bqfmt: '',
          bafmt: '',
          did: null,
        },
      ],
      flds: [
        { name: 'Front', ord: 0, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] },
        { name: 'Back', ord: 1, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] },
        { name: 'Extra', ord: 2, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] },
      ],
      req: [[0, 'any', [0]]],
    },
    [String(clozeId)]: {
      ...base,
      id: clozeId,
      name: 'DeepEncode Cloze',
      type: 1, // cloze model: Anki generates one card per {{cN::}} index
      sortf: 0,
      tmpl: [
        {
          name: 'Cloze',
          ord: 0,
          qfmt: '{{cloze:Text}}',
          afmt: '{{cloze:Text}}<hr id="answer">{{Extra}}',
          bqfmt: '',
          bafmt: '',
          did: null,
        },
      ],
      flds: [
        { name: 'Text', ord: 0, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] },
        { name: 'Extra', ord: 1, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] },
      ],
      req: [[0, 'any', [0]]],
    },
  };
}

function makeDeckEntry(id: number, name: string, modSec: number, desc: string): Record<string, unknown> {
  return {
    id,
    name,
    desc,
    mod: modSec,
    usn: -1,
    lrnToday: [0, 0],
    revToday: [0, 0],
    newToday: [0, 0],
    timeToday: [0, 0],
    collapsed: false,
    browserCollapsed: false,
    dyn: 0,
    conf: 1,
    extendNew: 0,
    extendRev: 0,
  };
}

/**
 * Generates a REAL Anki .apkg (legacy collection.anki2, schema 11) for the
 * declarative cards: proper Basic + Cloze note types, stable GUIDs, and the
 * hierarchical `DeepEncode::{Topic}` deck. Opens cleanly in Anki Desktop /
 * AnkiDroid / AnkiMobile with zero import steps; FSRS owns all scheduling.
 */
export async function generateAnkiApkgPackage(cards: AnkiCardItem[], deckName: string): Promise<Blob> {
  const modMs = Date.now();
  const modSec = Math.floor(modMs / 1000);
  const rootDeckId = 1700000000200;
  const childDeckId = 1700000000201;
  const basicModelId = 1700000000100;
  const clozeModelId = 1700000000101;

  const conf = {
    activeDecks: [1, childDeckId],
    addToCur: true,
    collapseTime: 1200,
    curDeck: childDeckId,
    curModel: String(basicModelId),
    dueCounts: true,
    estTimes: true,
    newBury: true,
    nextPos: 1,
    newSpread: 0,
    sortBackwards: false,
    sortType: 'noteFld',
    timeLim: 0,
  };
  const decks: Record<string, unknown> = {
    '1': makeDeckEntry(1, 'Default', modSec, ''),
    [String(rootDeckId)]: makeDeckEntry(rootDeckId, 'DeepEncode', modSec, 'Encoded with DeepEncode (encoder-first handoff).'),
    [String(childDeckId)]: makeDeckEntry(childDeckId, deckName, modSec, 'Encoded with DeepEncode (encoder-first handoff).'),
  };
  const dconf: Record<string, unknown> = {
    '1': makeDefaultDconf(modSec),
  };

  const notes: (AnkiNoteRow & { _nid: number })[] = cards.map((card, i) => {
    const nid = modMs + i;
    const isCloze = card.isCloze && card.front.includes('{{c');
    return {
      guid: generateAnkiGuid(),
      mid: isCloze ? clozeModelId : basicModelId,
      tags: card.tags.join(' '),
      flds: isCloze ? [card.front, card.back] : [card.front, card.back, ''],
      sfld: stripHtml(card.front).slice(0, 120) || card.id,
      _nid: nid,
    };
  });

  const cardRows = notes.map((note, i) => ({
    nid: note._nid,
    did: childDeckId,
    ord: 0,
    due: modMs + i,
  }));

  const collectionBytes = buildAnkiCollectionSqlite({
    conf: JSON.stringify(conf),
    models: JSON.stringify(buildDeclarativeModels(modSec)),
    decks: JSON.stringify(decks),
    dconf: JSON.stringify(dconf),
    notes: notes.map(({ _nid, ...rest }) => rest),
    cards: cardRows,
    modMs,
  });

  const zip = new JSZip();
  zip.file('collection.anki2', collectionBytes);
  zip.file('media', '{}');

  // Metadata only (FSRS owns all scheduling : no fake SM-2 due dates shipped).
  const sm2Manifest = {
    generator: 'DeepEncode Cognitive AI Engine',
    deckName,
    createdTimestamp: modMs,
    cardCount: cards.length,
    noteTypes: ['DeepEncode Basic', 'DeepEncode Cloze'],
    cards: cards.map((c) => ({ id: c.id, tags: c.tags, sm2: c.sm2 })),
  };
  zip.file('deepencode_sm2_manifest.json', JSON.stringify(sm2Manifest, null, 2));

  return await zip.generateAsync({ type: 'blob' });
}

/**
 * Connects directly to local AnkiDesktop via AnkiConnect (http://127.0.0.1:8765)
 */
export async function syncToAnkiConnect(
  ankiConnectUrl: string = 'http://127.0.0.1:8765',
  deckName: string,
  cards: AnkiCardItem[]
): Promise<{ success: boolean; addedCount: number; message: string }> {
  try {
    // 1. Create deck if missing
    const createDeckRes = await fetch(ankiConnectUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'createDeck',
        version: 6,
        params: { deck: deckName },
      }),
    });

    if (!createDeckRes.ok) {
      throw new Error(`AnkiConnect HTTP ${createDeckRes.status}. Ensure Anki desktop is open with AnkiConnect plugin installed.`);
    }

    // 2. Add notes
    const notesPayload = cards.map((c) => ({
      deckName,
      modelName: c.isCloze ? 'Cloze' : 'Basic',
      fields: c.isCloze
        ? { Text: c.front, Extra: c.back }
        : { Front: c.front, Back: c.back },
      tags: c.tags,
    }));

    const addNotesRes = await fetch(ankiConnectUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'addNotes',
        version: 6,
        params: { notes: notesPayload },
      }),
    });

    const data = await addNotesRes.json();
    if (data.error) {
      throw new Error(`AnkiConnect error: ${data.error}`);
    }

    const added = (data.result || []).filter((id: number | null) => id !== null).length;
    return {
      success: true,
      addedCount: added,
      message: `Successfully pushed ${added} flashcards to Anki deck "${deckName}"!`,
    };
  } catch (err: any) {
    return {
      success: false,
      addedCount: 0,
      message: err.message || 'Could not connect to AnkiConnect. Ensure Anki desktop is running.',
    };
  }
}

/**
 * Pushes SM-2 spaced repetition card payload to custom user webhook
 */
export async function syncToCustomWebhook(
  webhookUrl: string,
  deckName: string,
  cards: AnkiCardItem[]
): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'DeepEncode Cognitive AI Studio',
        deckName,
        timestamp: Date.now(),
        cardCount: cards.length,
        cards,
      }),
    });

    if (!response.ok) {
      throw new Error(`Webhook returned status ${response.status}`);
    }

    return {
      success: true,
      message: `Successfully dispatched SM-2 payload (${cards.length} cards) to custom webhook!`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Webhook sync failed.',
    };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Procedural Trap-Engine MCQ Export
// ═════════════════════════════════════════════════════════════════════════════

export const PROCEDURAL_NOTE_TYPE_NAME = 'DeepEncode Procedural MCQ';

/**
 * Safely embeds an archetype JSON payload inside an HTML <script> tag by
 * escaping the sequence-closers so the JSON can never terminate its own
 * container or inject markup.
 */
export function buildProceduralFieldData(archetype: ProceduralMCQArchetype): string {
  const json = JSON.stringify(archetype)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
  return '<script type="application/json" id="proc-archetype-data">' + json + '</script>';
}

/**
 * The self-contained client-side runner embedded in the card FRONT template.
 * Runs natively in Anki's webview (Desktop, AnkiDroid, AnkiMobile) with zero
 * external dependencies: every review it rolls fresh variable values inside
 * the declared ranges, computes the correct answer + the 3 AP-trap
 * distractors, shuffles A-D into clickable buttons, and gives immediate
 * interactive feedback plus the full MathJax step-by-step solution.
 *
 * Constraints: ES5-safe, no template literals, and NO literal
 * double-brace sequences (Anki's template engine would eat them as field
 * placeholders : braces are built via String.fromCharCode).
 */
export const PROCEDURAL_RUNNER_JS = `
(function () {
  'use strict';
  var OPEN = String.fromCharCode(123, 123);
  var CLOSE = String.fromCharCode(125, 125);

  function rollVariable(spec) {
    var value;
    if (spec.choices && spec.choices.length > 0) {
      value = spec.choices[Math.floor(Math.random() * spec.choices.length) % spec.choices.length];
    } else {
      var lo = Math.min(spec.min, spec.max);
      var hi = Math.max(spec.min, spec.max);
      value = lo + Math.random() * (hi - lo);
      if (spec.step && spec.step > 0) {
        value = lo + Math.round((value - lo) / spec.step) * spec.step;
      }
    }
    var decimals = (typeof spec.decimals === 'number') ? spec.decimals : 2;
    return Number(value.toFixed(decimals));
  }

  function rollVariables(variables) {
    var ctx = {};
    for (var name in variables) {
      if (Object.prototype.hasOwnProperty.call(variables, name)) {
        ctx[name] = rollVariable(variables[name]);
      }
    }
    return ctx;
  }

  function evaluate(expr, varNames, ctx) {
    var fn = new Function(varNames.join(','), 'Math', '"use strict"; return (' + expr + ');');
    var args = [];
    for (var i = 0; i < varNames.length; i++) args.push(ctx[varNames[i]]);
    args.push(Math);
    return fn.apply(null, args);
  }

  function fillTemplate(template, ctx) {
    var out = template;
    for (var name in ctx) {
      if (Object.prototype.hasOwnProperty.call(ctx, name)) {
        out = out.split(OPEN + name + CLOSE).join(ctx[name]);
      }
    }
    return out;
  }

  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    }
    return list;
  }

  function typesetMath(el) {
    try {
      if (window.MathJax && typeof MathJax.typesetPromise === 'function') {
        MathJax.typesetPromise([el]);
      } else if (window.MathJax && window.MathJax.Hub && window.MathJax.Hub.Queue) {
        window.MathJax.Hub.Queue(['Typeset', window.MathJax.Hub, el]);
      }
    } catch (err) { /* MathJax absent : LaTeX renders as source, card still works. */ }
  }

  function run() {
    var dataEl = document.getElementById('proc-archetype-data');
    var root = document.getElementById('proc-mcq-root');
    if (!dataEl || !root) return;
    var archetype;
    try { archetype = JSON.parse(dataEl.textContent || dataEl.innerText); } catch (err) {
      root.textContent = 'Procedural archetype data could not be parsed.';
      return;
    }

    var varNames = [];
    for (var v in archetype.variables) {
      if (Object.prototype.hasOwnProperty.call(archetype.variables, v)) varNames.push(v);
    }
    var ctx = rollVariables(archetype.variables);
    var question = fillTemplate(archetype.questionTemplate, ctx);
    var correctValue = String(evaluate(archetype.correctFormulaJs, varNames, ctx));

    var options = [{ label: correctValue, correct: true }];
    for (var t = 0; t < archetype.traps.length; t++) {
      var trapValue;
      try { trapValue = String(evaluate(archetype.traps[t].formulaJs, varNames, ctx)); }
      catch (err) { trapValue = ':'; }
      options.push({ label: trapValue, correct: false, trap: archetype.traps[t] });
    }
    shuffle(options);

    var LETTERS = ['A', 'B', 'C', 'D'];
    root.innerHTML = '';

    var qEl = document.createElement('div');
    qEl.className = 'proc-question';
    qEl.textContent = question;
    root.appendChild(qEl);

    var optionsEl = document.createElement('div');
    optionsEl.className = 'proc-options';
    root.appendChild(optionsEl);

    var feedbackEl = document.createElement('div');
    feedbackEl.className = 'proc-feedback';
    root.appendChild(feedbackEl);

    var solutionEl = document.createElement('div');
    solutionEl.className = 'proc-solution';
    solutionEl.style.display = 'none';
    root.appendChild(solutionEl);

    var answered = false;
    options.forEach(function (option, idx) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'proc-option';
      var letter = document.createElement('span');
      letter.className = 'proc-letter';
      letter.textContent = LETTERS[idx] + '.';
      var value = document.createElement('span');
      value.textContent = option.label + ' ' + (archetype.unit || '');
      btn.appendChild(letter);
      btn.appendChild(value);

      btn.addEventListener('click', function () {
        if (answered) return;
        answered = true;
        var buttons = optionsEl.querySelectorAll('.proc-option');
        for (var b = 0; b < buttons.length; b++) {
          buttons[b].disabled = true;
        }
        if (option.correct) {
          btn.className = 'proc-option proc-correct';
          feedbackEl.textContent = 'Correct : executed, not just recognized. Fresh numbers roll next review.';
        } else {
          btn.className = 'proc-option proc-wrong';
          var trapName = option.trap ? option.trap.trapName : 'a procedural trap';
          var trapExplanation = option.trap ? fillTemplate(option.trap.explanation, ctx) : '';
          feedbackEl.innerHTML = 'You fell for the <span class="proc-trap-name"></span> trap.<br>' +
            '<span class="proc-trap-explanation"></span>';
          feedbackEl.querySelector('.proc-trap-name').textContent = trapName;
          feedbackEl.querySelector('.proc-trap-explanation').textContent = trapExplanation;
        }
        for (var b2 = 0; b2 < buttons.length; b2++) {
          if (options[b2] && options[b2].correct) {
            buttons[b2].className = 'proc-option proc-correct';
          } else if (!buttons[b2].classList.contains('proc-wrong')) {
            buttons[b2].className = 'proc-option proc-dim';
          }
        }
        solutionEl.innerHTML = '<div class="proc-solution-title">Step-by-Step Solution</div>' +
          '<div class="proc-solution-body"></div>';
        solutionEl.querySelector('.proc-solution-body').innerHTML = fillTemplate(
          archetype.stepByStepSolutionTemplate, ctx
        );
        solutionEl.style.display = 'block';
        typesetMath(solutionEl);
        typesetMath(feedbackEl);
      });

      optionsEl.appendChild(btn);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
`;

const PROCEDURAL_MODEL_CSS = `
.card { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 16px; text-align: left; color: #e2e8f0; }
.proc-topic { font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #22d3ee; margin-bottom: 8px; }
.proc-question { font-size: 16px; line-height: 1.55; margin-bottom: 14px; }
.proc-options { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.proc-option { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 10px 12px; border-radius: 10px; border: 1px solid #334155; background: #0f172a; color: #e2e8f0; font-size: 15px; cursor: pointer; }
.proc-option .proc-letter { font-weight: 800; color: #22d3ee; }
.proc-option:disabled { cursor: default; }
.proc-option.proc-correct { border-color: #22c55e; background: rgba(34, 197, 94, 0.18); }
.proc-option.proc-wrong { border-color: #ef4444; background: rgba(239, 68, 68, 0.18); }
.proc-option.proc-dim { opacity: 0.55; }
.proc-feedback { font-size: 13px; line-height: 1.5; margin-bottom: 10px; }
.proc-feedback .proc-trap-name { font-weight: 800; }
.proc-solution { border: 1px solid #334155; border-radius: 10px; padding: 12px; font-size: 14px; line-height: 1.6; background: rgba(15, 23, 42, 0.6); }
.proc-solution .proc-solution-title { font-weight: 800; color: #22d3ee; margin-bottom: 6px; }
.proc-backnote { font-size: 13px; color: #94a3b8; }
`;

/**
 * Builds the Anki schema-11 model (note type) object for procedural MCQs.
 * The interactive runner lives in qfmt; ALL interactive state stays on the
 * card front so mobile flipping never desyncs.
 */
export function buildProceduralModel(deckId: number, modSec: number): Record<string, unknown> {
  const modelId = 1700000000000;
  return {
    [String(modelId)]: {
      id: modelId,
      name: PROCEDURAL_NOTE_TYPE_NAME,
      type: 0, // standard (not cloze)
      mod: modSec,
      usn: -1,
      sortf: 1, // sort/browser column = Topic
      did: null,
      tmpl: [
        {
          name: 'Procedural MCQ',
          ord: 0,
          qfmt:
            '<div class="proc-topic">{{Topic}}</div>{{Data}}<div id="proc-mcq-root"></div>' +
            '<script>' + PROCEDURAL_RUNNER_JS + '</script>',
          afmt:
            '{{Topic}}<br><div class="proc-backnote">The interactive MCQ : fresh numbers, A-D options, trap ' +
            'feedback, and the full step-by-step solution : is generated on the <b>front</b> of this card so ' +
            'state never desyncs on mobile. Flip back to retry with new numbers.</div>',
          bqfmt: '',
          bafmt: '',
          did: null,
        },
      ],
      flds: [
        { name: 'Data', ord: 0, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] },
        { name: 'Topic', ord: 1, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] },
        { name: 'Unit', ord: 2, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] },
      ],
      css: PROCEDURAL_MODEL_CSS,
      latexPre:
        '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n' +
        '\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n',
      latexPost: '\\end{document}',
      req: [[0, 'any', [0]]],
      tags: [],
      vers: [],
    },
  };
}

function buildProceduralColJson(deckId: number, deckName: string, modSec: number) {
  const modelId = 1700000000000;
  const conf = {
    activeDecks: [1, deckId],
    addToCur: true,
    collapseTime: 1200,
    curDeck: deckId,
    curModel: String(modelId),
    dueCounts: true,
    estTimes: true,
    newBury: true,
    nextPos: 1,
    newSpread: 0,
    sortBackwards: false,
    sortType: 'noteFld',
    timeLim: 0,
  };
  const models = buildProceduralModel(deckId, modSec);
  const decks: Record<string, unknown> = {
    '1': {
      id: 1,
      name: 'Default',
      desc: '',
      mod: modSec,
      usn: -1,
      lrnToday: [0, 0],
      revToday: [0, 0],
      newToday: [0, 0],
      timeToday: [0, 0],
      collapsed: false,
      browserCollapsed: false,
      dyn: 0,
      conf: 1,
      extendNew: 0,
      extendRev: 0,
    },
    [String(deckId)]: {
      id: deckId,
      name: deckName,
      desc: 'Procedural trap-engine MCQ deck generated by DeepEncode.',
      mod: modSec,
      usn: -1,
      lrnToday: [0, 0],
      revToday: [0, 0],
      newToday: [0, 0],
      timeToday: [0, 0],
      collapsed: false,
      browserCollapsed: false,
      dyn: 0,
      conf: 1,
      extendNew: 0,
      extendRev: 0,
    },
  };
  const dconf: Record<string, unknown> = {
    '1': makeDefaultDconf(modSec),
  };
  return {
    conf: JSON.stringify(conf),
    models: JSON.stringify(models),
    decks: JSON.stringify(decks),
    dconf: JSON.stringify(dconf),
  };
}

/** Sanitizes a deck name for Anki's :: path separator (procedural path). */
function sanitizeDeckName(deckName: string): string {
  return deckName.replace(/[\\/:]/g, '_').replace(/[^a-zA-Z0-9 _\-.]/g, '').slice(0, 120) || 'DeepEncode_Procedural_MCQ';
}

/**
 * Generates an Anki text-import deck (.txt/.tsv) with the procedural note
 * type. One row per archetype; the front carries the embedded JSON runner.
 */
export function generateProceduralAnkiTextDeck(
  archetypes: ProceduralMCQArchetype[],
  deckName: string
): string {
  const lines: string[] = [];
  lines.push(`#separator:tab`);
  lines.push(`#html:true`);
  lines.push(`#tags column:4`);
  lines.push(`#deck:${sanitizeDeckName(deckName)}`);
  lines.push(`#notetype:${PROCEDURAL_NOTE_TYPE_NAME}`);
  lines.push('');

  archetypes.forEach((archetype) => {
    const data = buildProceduralFieldData(archetype).replace(/\t/g, ' ').replace(/\n/g, '');
    const topic = (archetype.topic || '').replace(/\t/g, ' ').replace(/\n/g, '');
    const tags = `DeepEncode ProceduralMCQ ${archetype.topic.split(':')[0].replace(/[^a-zA-Z0-9_]/g, '')}`;
    // Data, Topic, Unit, Tags
    lines.push(`${data}\t${topic}\t${archetype.unit || ''}\t${tags}`);
  });

  return lines.join('\n');
}

/**
 * Generates a real Anki .apkg package for the procedural archetypes:
 * a `collection.anki2` SQLite database (legacy schema 11) carrying the
 * custom "DeepEncode Procedural MCQ" note type and one note per archetype,
 * plus `media`, a `deck.txt` text-import companion, and the SM-2 manifest.
 * Opens cleanly in Anki Desktop / AnkiDroid / AnkiMobile with zero add-ons,
 * and the interactive runner is fully offline at review time.
 */
export async function generateProceduralApkgPackage(
  archetypes: ProceduralMCQArchetype[],
  deckName: string
): Promise<Blob> {
  if (archetypes.length === 0) {
    throw new Error('No procedural archetypes selected for export.');
  }
  const safeDeck = sanitizeDeckName(deckName);
  const deckId = 1700000000001;
  const modelId = 1700000000000;
  const modMs = Date.now();
  const modSec = Math.floor(modMs / 1000);

  const colJson = buildProceduralColJson(deckId, safeDeck, modSec);

  const notes: AnkiNoteRow[] = archetypes.map((archetype, i) => ({
    guid: generateAnkiGuid(),
    mid: modelId,
    tags: `DeepEncode ProceduralMCQ ${archetype.topic.split(':')[0].replace(/[^a-zA-Z0-9_]/g, '')}`,
    flds: [buildProceduralFieldData(archetype), archetype.topic, archetype.unit || ''],
    sfld: archetype.topic,
  }));

  const cards = notes.map((note, i) => ({
    nid: modMs + i,
    did: deckId,
    ord: 0,
    due: modMs + i,
  }));

  const collectionBytes = buildAnkiCollectionSqlite({
    conf: colJson.conf,
    models: colJson.models,
    decks: colJson.decks,
    dconf: colJson.dconf,
    notes,
    cards,
    modMs,
  });

  const zip = new JSZip();
  zip.file('collection.anki2', collectionBytes);
  zip.file('media', '{}');
  zip.file('deck.txt', generateProceduralAnkiTextDeck(archetypes, safeDeck));

  const sm2Manifest = {
    generator: 'DeepEncode Cognitive AI Engine',
    deckName: safeDeck,
    createdTimestamp: modMs,
    noteType: PROCEDURAL_NOTE_TYPE_NAME,
    cardCount: archetypes.length,
    archetypes: archetypes.map((a) => ({ id: a.id, topic: a.topic })),
  };
  zip.file('deepencode_sm2_manifest.json', JSON.stringify(sm2Manifest, null, 2));

  return await zip.generateAsync({ type: 'blob' });
}

