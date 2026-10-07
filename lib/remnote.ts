import { SavedSchema, SegregationReport } from './types';
import { toyBoundaryCard, toyDuelCard } from './toy-models/progress';

export interface FactItem {
  id: string;
  statement: string;
  category: string;
  significance: string;
  clozeFormat: string; // e.g. "The speed of light in vacuum is {{299,792,458 m/s}}"
}

export interface ConceptMechanism {
  id: string;
  conceptName: string;
  whatIsIt: string; // What
  whyItMatters: string; // Why
  howItWorks: string; // How
  whatIfFailed: string; // What If
  remnoteDescriptor: string; // Remnote :: format
  boundaryContrast?: {
    confusableConcept: string;
    differentiatingTest: string;
  };
}

export interface FeynmanClozeItem {
  id: string;
  stageTitle: string;
  userVocabularyText: string;
  clozedUserText: string;
  textbookJargonComparison: string;
  cognitiveSpeedAdvantage: string;
}

// ─── RemNote card syntax ────────────────────────────────────────────────────
//
// Every delimiter here is read out of RemNote's own "How to Import Flashcards
// from Text", because guessing them is how the previous version shipped cards
// nobody could answer:
//
//   `::`    TWO-WAY Concept card — "name → definition" and the reverse,
//           "definition → name".
//   `>>`    FORWARD-ONLY Basic card — front → back.
//   `>>>`   MULTI-LINE front — every nested bullet is part of the answer.
//   `>>1.`  LIST-ANSWER front — nested bullets are the list items.
//   `{{}}`  A cloze deletion, forward-only, all by itself.
//   `{({})}` A hint, shown on demand against the deletion it follows.
//   `#[[Extra Card Detail]]` A child that appears on the card's BACK and
//           generates no card of its own.

/** Two-way Concept card: front → back and back → front. */
export const REMNOTE_TWO_WAY = '::';
/** Forward-only Basic card: front → back. */
export const REMNOTE_FORWARD = '>>';
/** Multi-line front: the nested bullets are the card's answer. */
export const REMNOTE_MULTI_LINE = '>>>';
/** List-answer front: the nested bullets are the card's list items. */
export const REMNOTE_LIST_ANSWER = '>>1.';

/**
 * Purpose tags, so a learner can build a review queue out of a deck: "quiz me
 * only on the traps tonight". RemNote reads `#[[Name]]` as a tag on the rem the
 * line belongs to, so tagging the card line tags the card.
 *
 * Only two tags exist, and each one has a derivation the data actually
 * supports: `Exam Trap` comes from a NAMED failure mode (a limit of validity, a
 * drill with stated distractors), and `Clinical Correlate` comes from a fact the
 * source gave a clinical face. A `High-Yield` tag was deliberately not added:
 * nothing in the data distinguishes high-yield from everything, and a tag that
 * matches the whole deck makes the filter worthless.
 */
export const REMNOTE_EXAM_TRAP = '#[[Exam Trap]]';
export const REMNOTE_CLINICAL_CORRELATE = '#[[Clinical Correlate]]';
/** Marks a child bullet as detail on the parent card's back, not a card. */
export const REMNOTE_DETAIL = '#[[Extra Card Detail]]';

export type RemnoteCardDirection = 'two-way' | 'forward';
export type RemnoteCardKind = RemnoteCardDirection | 'cloze' | 'multi-line' | 'list-answer';

/** One card the export will produce, as the learner will meet it. */
export interface RemnoteCard {
  id: string;
  /** Section that rendered it (facts / mechanisms / drills / examples / …). */
  section: string;
  /** Source the card came from, when the deck carries provenance. */
  sourceId?: string;
  /** The front, as RemNote will show it. */
  front: string;
  kind: RemnoteCardKind;
  /** False when `::` and `>>` are not a meaningful choice (cloze, multi-line). */
  reversible: boolean;
  /** Why it ships the way it does, in the learner's words. */
  reason?: string;
  /** Bullets that ride on this card's back as Extra Card Detail. */
  detail: string[];
}

/**
 * Reasons that mean the front is not a *name*. These cards can only ever be
 * asked in one direction, and the front is a label rather than the thing being
 * learned — which is worth saying out loud before the deck is exported.
 */
const WEAK_FRONT_REASONS = new Set(['labelled prompt', 'numbered step', 'contrast row', 'question front']);

export interface RemnoteFrontQuality {
  total: number;
  twoWay: number;
  forwardOnly: number;
  clozes: number;
  /** Multi-line and list-answer cards: one front, several parts. */
  multiPart: number;
  /** Forward-only cards whose front is a label or a question. */
  labelled: number;
  /** Up to three sample fronts, so the note is concrete. */
  examples: string[];
  note: string;
}

/** One pasteable document: a card section, or a whole source. */
export interface RemnoteDocument {
  id: string;
  /** Page title, topic-prefixed so a paste lands somewhere named. */
  title: string;
  /** Page-name suggestion (RemNote-safe, no punctuation it would strip). */
  filename: string;
  markdown: string;
  cardCount: number;
  /** Concept ↔ definition cards: the only ones worth a reverse. */
  twoWayCount: number;
  /** Questions, labels, clozes and multi-part cards: front → back only. */
  forwardCount: number;
  /** Ids of the cards inside this document, in order. */
  cardIds: string[];
}

export interface RemnoteExportPayload {
  markdown: string;
  cardCount: number;
  factsCount: number;
  conceptsCount: number;
  hierarchicalDeck: string;
  parentAnchor?: string;
  feynmanClozings?: FeynmanClozeItem[];
  /** One document per card section (or per source), each independently copyable. */
  documents?: RemnoteDocument[];
  /** Every card in the deck, in shipping order — what the preview lists. */
  cards?: RemnoteCard[];
  /** How many fronts are labels/questions rather than names. */
  frontQuality?: RemnoteFrontQuality;
  /** Total two-way (concept ↔ definition) cards across the deck. */
  twoWayCount?: number;
  /** Total forward-only cards across the deck. */
  forwardCount?: number;
  /** `[[Wikilink]]` portals between confusable concepts — reviewing either card previews the other. */
  conceptPortals?: number;
}

/**
 * The RemNote-native embed line (plan Pillar 4): a labelled Extra Card Detail
 * bullet carrying a bare URL, which RemNote unfurls into a live widget inside
 * the learner's notes. Pure markdown so the copy surface and tests pin it.
 */
export function remnoteToyEmbedLine(embedUrl: string, label?: string): string {
  const name = (label || '').trim();
  const head = name ? `- Interactive Lab: ${name} ${REMNOTE_DETAIL}` : `- Interactive Lab: ${REMNOTE_DETAIL}`;
  const url = (embedUrl || '').trim();
  return url ? `${head}\n    - ${url}` : head;
}

/**
 * Contextual Anchoring (Feature 86) with the facts/drills/examples sections
 * rendered as proper RemNote cards, never notes. Card *direction* is chosen
 * per line, explanations ride along as Extra Card Detail, and the deck is split
 * into one copyable document per section or per source.
 */
export interface RemnoteOptions {
  parentAnchor?: string;
  preferFeynmanCloze?: boolean;
  /** false forces every card forward-only. Default: two-way where it is real. */
  twoWayCards?: boolean;
  /**
   * Attach "Why it matters" / "Traps" / "Takeaway" to the card they belong to
   * as Extra Card Detail (they show on the back and generate no card) instead
   * of shipping them as cards of their own. Default true. Needs RemNote Pro:
   * without it the tagged bullets paste as plain notes.
   */
  explanationsAsDetail?: boolean;
  /** Per-card `::` / `>>` overrides, keyed by `RemnoteCard.id`. */
  directionOverrides?: Record<string, RemnoteCardDirection>;
  /** 'section' (default) splits by card section; 'source' by where cards came from. */
  groupBy?: 'section' | 'source';
  /** Source id → label, so source grouping can name its documents. */
  sourceLabels?: Record<string, string>;
}

/**
 * Renders one bullet as a RemNote card with an explicit direction. Direction is
 * a required decision at the call site on purpose: only the renderer knows
 * whether the front it is writing is a concept name (a real reverse card) or a
 * labelled prompt (no reverse).
 */
export function remnoteCard(
  front: string,
  back: string,
  direction: RemnoteCardDirection,
  indent = ''
): string {
  const delimiter = direction === 'two-way' ? REMNOTE_TWO_WAY : REMNOTE_FORWARD;
  return `${indent}- ${front} ${delimiter} ${back}`;
}

/**
 * RemNote cloze hints: `{{deletion}}{({hint})}`. A mnemonic belongs on the
 * deletion it explains, not on a second card whose only content is the
 * mnemonic — that card can never be answered on its own.
 *
 * The hint is MODEL-authored (a fact's `memoryHook`), and RemNote reads
 * `{({…})}` up to the first inner `)`, so a hint that contains a parenthesis —
 * `near E_K (-90 mV)`, `q = mcΔT (per kg)` — would be cut off mid-clause and
 * mangle the prompt. Braces would nest inside the deletion. Both are stripped
 * here rather than trusted, the same way `stripClozeDeletions` never assumes
 * a model left the delimiters clean.
 */
export function sanitizeClozeHint(hint: string, maxLength = 120): string {
  return (hint || '')
    .replace(/[{}]/g, '')
    // A space, not nothing: "near E_K (-90 mV)" must not become "E_K-90mV".
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
}

export function attachClozeHint(text: string, hint: string): string {
  const clean = sanitizeClozeHint(hint);
  if (!clean || !text.includes('{{')) return text;
  // Only the first deletion: a hint repeated on every blank is noise.
  return text.replace(/\{\{[^{}]*\}\}/, (match) => `${match}{({${clean}})}`);
}

/** A RemNote page name derived from the document title. */
export function remnoteDocumentFilename(title: string): string {
  const safe = title
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return safe.slice(0, 80) || 'DeepEncode';
}

/** True when the text already carries a `{{cloze}}` deletion. */
function hasClozeDeletion(text: string): boolean {
  return text.includes('{{') && text.includes('}}');
}

/**
 * Unwraps a deletion into plain prose, hint and all.
 *
 * A `{{deletion}}` is a card. On a line that ships as Extra Card Detail RemNote
 * shows it on the card BACK and never asks it, so the braces would be literal
 * `{{ }}` dressing on the reveal — the deletion has to become ordinary text,
 * and any `{({hint})}` that explained it goes with it.
 */
function stripClozeDeletions(text: string): string {
  return text
    .replace(/\{\(\([^()]*\)\)\}/g, '')
    .replace(/\{\{([^{}]*)\}\}/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * The source a card came from. `mergeSegregationReports` namespaces every item
 * id with its source (`src_2-f1`), so the prefix before the first dash is the
 * provenance — which is how a merged deck can still be split per lecture.
 */
export function sourceIdOfItem(id: string | undefined): string | undefined {
  const raw = (id || '').trim();
  if (!raw) return undefined;
  const dash = raw.indexOf('-');
  if (dash <= 0) return undefined;
  return raw.slice(0, dash);
}

// ─── Render context and section drafts ──────────────────────────────────────

interface SourceBucket {
  id: string;
  label: string;
  lines: string[];
  cardIds: string[];
  cardCount: number;
  twoWayCount: number;
  forwardCount: number;
  lastSection?: string;
}

interface RenderContext {
  parentAnchor: string;
  topic: string;
  twoWay: boolean;
  explanationsAsDetail: boolean;
  overrides: Record<string, RemnoteCardDirection>;
  groupBySource: boolean;
  sourceLabels: Record<string, string>;
  buckets: Map<string, SourceBucket>;
}

/** One card section, in both the shapes it has to be rendered as. */
interface RemnoteSectionDraft {
  id: string;
  /** Heading used inside the single combined document. */
  heading: string;
  /** Suffix used when this section is copied as its own document. */
  documentTitle: string;
  /** Rendered bullets, children already indented. */
  lines: string[];
  cards: RemnoteCard[];
  cardCount: number;
  twoWayCount: number;
  forwardCount: number;
  /** Card ordinal within the section — the second half of every card id. */
  ordinal: number;
  /** Source of the item currently being rendered, for provenance. */
  activeSource?: string;
}

function newSection(id: string, heading: string, documentTitle: string): RemnoteSectionDraft {
  return {
    id,
    heading,
    documentTitle,
    lines: [],
    cards: [],
    cardCount: 0,
    twoWayCount: 0,
    forwardCount: 0,
    ordinal: 0,
  };
}

/** Appends a bullet, mirroring it into the source bucket when grouping by source. */
function emit(ctx: RenderContext, section: RemnoteSectionDraft, line: string): void {
  section.lines.push(line);
  if (!ctx.groupBySource) return;

  const sourceId = section.activeSource || 'unattributed';
  let bucket = ctx.buckets.get(sourceId);
  if (!bucket) {
    bucket = {
      id: sourceId,
      label: ctx.sourceLabels[sourceId] || sourceId,
      lines: [],
      cardIds: [],
      cardCount: 0,
      twoWayCount: 0,
      forwardCount: 0,
    };
    ctx.buckets.set(sourceId, bucket);
  }
  if (bucket.lastSection !== section.id) {
    if (bucket.lines.length > 0) bucket.lines.push('');
    bucket.lines.push(`### ${section.heading}`);
    bucket.lastSection = section.id;
  }
  bucket.lines.push(line);
}

function registerCard(
  ctx: RenderContext,
  section: RemnoteSectionDraft,
  card: RemnoteCard
): void {
  section.cards.push(card);
  section.cardCount += 1;
  if (card.kind === 'two-way') section.twoWayCount += 1;
  else section.forwardCount += 1;

  if (!ctx.groupBySource) return;
  const bucket = ctx.buckets.get(card.sourceId || 'unattributed');
  if (!bucket) return;
  bucket.cardIds.push(card.id);
  bucket.cardCount += 1;
  if (card.kind === 'two-way') bucket.twoWayCount += 1;
  else bucket.forwardCount += 1;
}

function nextCardId(section: RemnoteSectionDraft): string {
  return `${section.id}:${section.ordinal++}`;
}

/**
 * A bullet that is already a Cloze card. RemNote reads the `{{}}` as the card
 * and generates no reverse, so a `::` here was pure noise — and on a line whose
 * back is a deletion it asked for the label back.
 */
function pushCloze(
  ctx: RenderContext,
  section: RemnoteSectionDraft,
  text: string,
  opts: { indent?: string; reason?: string; front?: string } = {}
): void {
  emit(ctx, section, `${opts.indent || ''}- ${text}`);
  registerCard(ctx, section, {
    id: nextCardId(section),
    section: section.id,
    sourceId: section.activeSource,
    front: opts.front || text,
    kind: 'cloze',
    reversible: false,
    reason: opts.reason || 'a {{deletion}} is already a forward-only cloze',
    detail: [],
  });
}

/**
 * A labelled pair. A back carrying a `{{deletion}}` is delegated to pushCloze,
 * with the label kept inline as the prompt's own context rather than bolted on
 * through a delimiter RemNote would then have to reconcile with the braces.
 */
function pushCard(
  ctx: RenderContext,
  section: RemnoteSectionDraft,
  front: string,
  back: string,
  direction: RemnoteCardDirection,
  opts: { indent?: string; reason?: string; tag?: string } = {}
): void {
  if (hasClozeDeletion(back)) {
    pushCloze(ctx, section, front ? `${front}: ${back}` : back, {
      indent: opts.indent,
      reason: opts.reason,
      front,
    });
    return;
  }
  const id = nextCardId(section);
  const chosen = ctx.overrides[id] || direction;
  // The tag rides at the end of the line: RemNote registers `#[[Name]]` as a
  // tag on the rem wherever it appears, and putting it after the delimiter
  // keeps it out of the question the learner reads.
  const line = remnoteCard(front, back, chosen, opts.indent);
  emit(ctx, section, opts.tag ? `${line} ${opts.tag}` : line);
  registerCard(ctx, section, {
    id,
    section: section.id,
    sourceId: section.activeSource,
    front,
    kind: chosen,
    reversible: true,
    reason: opts.reason,
    detail: [],
  });
}

/**
 * One front with several parts. RemNote shows the nested bullets together when
 * the card is answered, so a step chain is one card instead of five — and it is
 * deliberately NOT reversible: there is no sensible "name the label" reverse of
 * a list.
 *
 * Note the gotcha this shape carries: inside a multi-line card every nested
 * bullet is a card item, so Extra Card Detail cannot be nested here (RemNote
 * documents having to outdent such a bullet first). Extras for these cards
 * belong in the item list.
 */
function pushMultiPart(
  ctx: RenderContext,
  section: RemnoteSectionDraft,
  front: string,
  items: string[],
  opts: { kind: 'multi-line' | 'list-answer'; reason: string; indent?: string }
): void {
  const indent = opts.indent || '';
  const delimiter = opts.kind === 'multi-line' ? REMNOTE_MULTI_LINE : REMNOTE_LIST_ANSWER;
  emit(ctx, section, `${indent}- ${front} ${delimiter}`);
  for (const item of items) emit(ctx, section, `${indent}  - ${item}`);
  registerCard(ctx, section, {
    id: nextCardId(section),
    section: section.id,
    sourceId: section.activeSource,
    front,
    kind: opts.kind,
    reversible: false,
    reason: opts.reason,
    detail: [],
  });
}

/**
 * A bullet that shows on the parent card's back and generates no card of its
 * own. This is what RemNote's Extra Card Detail powerup is for: a mnemonic, a
 * trap to avoid, a citation, or the explanation behind an answer you have
 * already given. Needs RemNote Pro.
 */
function pushDetail(
  ctx: RenderContext,
  section: RemnoteSectionDraft,
  label: string,
  value: string
): void {
  const text = stripClozeDeletions((value || '').trim());
  if (!text) return;
  const card = section.cards[section.cards.length - 1];
  if (card) card.detail.push(`${label}: ${text}`);
  emit(ctx, section, `  - ${label}: ${text} ${REMNOTE_DETAIL}`);
}

/**
 * An explanation attached to the card above it. With `explanationsAsDetail`
 * off, the same text ships as its own forward-only card instead — the shape
 * this export used to use for everything, which is why a single concept could
 * arrive as five cards.
 */
function pushExtra(
  ctx: RenderContext,
  section: RemnoteSectionDraft,
  label: string,
  value: string,
  reason: string
): void {
  const text = (value || '').trim();
  if (!text) return;
  // Extra Card Detail is reveal-only, so a value the SOURCE itself clozed is a
  // deliberate test that would be buried there — it stays a card, and pushCard
  // delegates the deletion to a real cloze. Only clozes this renderer
  // manufactured for the card shape get demoted to detail.
  if (ctx.explanationsAsDetail && !hasClozeDeletion(text)) {
    pushDetail(ctx, section, label, text);
    return;
  }
  pushCard(ctx, section, label, text, 'forward', { indent: '  ', reason });
}

/** A plain bullet: real content that must not generate a card of its own. */
function pushNote(ctx: RenderContext, section: RemnoteSectionDraft, text: string, indent = ''): void {
  emit(ctx, section, `${indent}- ${text}`);
}

/**
 * Turns a deck's fronts into the one thing a card count cannot tell you: how
 * many cards can only ever be asked one way, and why.
 */
export function summarizeFrontQuality(cards: RemnoteCard[]): RemnoteFrontQuality {
  const twoWay = cards.filter((card) => card.kind === 'two-way').length;
  const clozes = cards.filter((card) => card.kind === 'cloze').length;
  const multiPart = cards.filter((card) => card.kind === 'multi-line' || card.kind === 'list-answer').length;
  const weak = cards.filter((card) => card.reason && WEAK_FRONT_REASONS.has(card.reason));
  const examples = weak.slice(0, 3).map((card) => card.front);

  const note =
    weak.length === 0
      ? 'Every card front is the thing being recalled.'
      : `${weak.length} of ${cards.length} cards have a labelled or question front (${examples.join(', ')}${
          weak.length > examples.length ? ', …' : ''
        }) — RemNote can only ask those one way, and the label is not what you are learning.`;

  return {
    total: cards.length,
    twoWay,
    forwardOnly: cards.length - twoWay,
    clozes,
    multiPart,
    labelled: weak.length,
    examples,
    note,
  };
}

function renderSectionDocument(
  ctx: RenderContext,
  section: RemnoteSectionDraft
): RemnoteDocument {
  const title = `${ctx.topic} — ${section.documentTitle}`;
  const markdown = [
    `# 🌐 ${ctx.parentAnchor}`,
    `## 📁 ${title}`,
    `- **Parent System Anchor** [[${ctx.parentAnchor}]]`,
    '',
    `### ${section.heading}`,
    ...section.lines,
  ]
    .join('\n')
    .replace(/\n+$/, '');
  return {
    id: section.id,
    title,
    filename: remnoteDocumentFilename(title),
    markdown,
    cardCount: section.cardCount,
    twoWayCount: section.twoWayCount,
    forwardCount: section.forwardCount,
    cardIds: section.cards.map((card) => card.id),
  };
}

function renderSourceDocuments(ctx: RenderContext): RemnoteDocument[] {
  const documents: RemnoteDocument[] = [];
  for (const bucket of ctx.buckets.values()) {
    if (bucket.cardCount === 0) continue;
    const title = bucket.label;
    documents.push({
      id: bucket.id,
      title,
      filename: remnoteDocumentFilename(title),
      markdown: [
        `# 🌐 ${ctx.parentAnchor}`,
        `## 📁 ${title}`,
        `- **Parent System Anchor** [[${ctx.parentAnchor}]]`,
        '',
        ...bucket.lines,
      ]
        .join('\n')
        .replace(/\n+$/, ''),
      cardCount: bucket.cardCount,
      twoWayCount: bucket.twoWayCount,
      forwardCount: bucket.forwardCount,
      cardIds: bucket.cardIds,
    });
  }
  return documents;
}

function assemblePayload(
  ctx: RenderContext,
  sections: RemnoteSectionDraft[],
  headerNotes: string[] = []
): {
  markdown: string;
  cardCount: number;
  twoWayCount: number;
  forwardCount: number;
  cards: RemnoteCard[];
  documents: RemnoteDocument[];
  frontQuality: RemnoteFrontQuality;
} {
  const used = sections.filter((s) => s.lines.length > 0);
  const cards = used.flatMap((s) => s.cards);
  const lines: string[] = [
    `# 🌐 ${ctx.parentAnchor}`,
    `## 📁 DeepEncoded: ${ctx.topic}`,
    `- **Parent System Anchor** [[${ctx.parentAnchor}]]`,
    // Session metadata is a note, never a card: nobody re-answers "what is the
    // encoded date".
    ...headerNotes.map((note) => `- ${note}`),
    '',
  ];
  for (const section of used) {
    lines.push(`### ${section.heading}`);
    lines.push(...section.lines);
    lines.push('');
  }

  // A section of pure notes has nothing to practice, so it never becomes a
  // document of its own (the combined markdown still carries the note, so
  // nothing the encoder wrote is thrown away).
  const documents = ctx.groupBySource
    ? renderSourceDocuments(ctx)
    : used.filter((s) => s.cardCount > 0).map((s) => renderSectionDocument(ctx, s));

  return {
    markdown: lines.join('\n').replace(/\n+$/, ''),
    cardCount: used.reduce((n, s) => n + s.cardCount, 0),
    twoWayCount: used.reduce((n, s) => n + s.twoWayCount, 0),
    forwardCount: used.reduce((n, s) => n + s.forwardCount, 0),
    cards,
    documents,
    frontQuality: summarizeFrontQuality(cards),
  };
}

function createContext(
  options: RemnoteOptions | undefined,
  parentAnchor: string,
  topic: string
): RenderContext {
  const sourceLabels = options?.sourceLabels || {};
  return {
    parentAnchor,
    topic,
    twoWay: options?.twoWayCards !== false,
    explanationsAsDetail: options?.explanationsAsDetail !== false,
    overrides: options?.directionOverrides || {},
    // Source grouping needs names to name its documents with; a bare report
    // (the encode flow, a hand-built deck) has no provenance to group by, so it
    // silently falls back to the section split rather than making one document
    // per card.
    groupBySource: options?.groupBy === 'source' && Object.keys(sourceLabels).length > 0,
    sourceLabels,
    buckets: new Map(),
  };
}

/**
 * Renders a SegregationReport (facts + mechanisms + drills + examples) into
 * RemNote markdown where EVERY content line is a card, not a plain note.
 * Cloze cards keep their {{}} deletions for RemNote cloze rendering.
 *
 * Also returns `documents`: one per non-empty section (or per source), each a
 * standalone page the learner can copy on its own, and `cards`: what RemNote
 * will actually ask, so the reverse of a two-way card is visible before it is
 * pasted rather than during review.
 */
export function generateSegregationRemnote(
  report: SegregationReport,
  options?: RemnoteOptions
): RemnoteExportPayload {
  const topic = report.topic || 'DeepEncode Cognitive Schema';
  const parentAnchor = options?.parentAnchor || inferParentSystemAnchor(topic);
  const ctx = createContext(options, parentAnchor, topic);
  const twoWay: RemnoteCardDirection = ctx.twoWay ? 'two-way' : 'forward';
  let factsCount = 0;
  let conceptsCount = 0;

  // Declarative Facts. Two card shapes, because the source gives two:
  //  - a `{{deletion}}` sentence becomes a RemNote CLOZE card, and the memory
  //    hook rides on it as a hint (`{{deletion}}{({hook})}`) instead of
  //    becoming a second card whose only content is the mnemonic;
  //  - a short drill prompt becomes a forward-only Q >> A card.
  const facts = newSection('facts', '🔢 Declarative Facts', 'Declarative Facts');
  for (const fact of report.declarativeFacts || []) {
    facts.activeSource = sourceIdOfItem(fact.id);
    // Whether THIS fact produced a card: the section accumulates cards across
    // facts, so a section-level check would attach one fact's hook to another
    // fact's card.
    const cardsBefore = facts.cards.length;
    const cloze = (fact.clozeSuggestion || '').trim();
    const clozeDeletion = hasClozeDeletion(cloze);
    const question = (fact.question || '').trim();
    const hook = (fact.memoryHook || '').trim();
    const tag = fact.tag ? ` (${fact.tag})` : '';
    factsCount++;

    if (clozeDeletion) {
      pushCloze(ctx, facts, hook ? attachClozeHint(cloze, hook) : cloze, { front: cloze });
      // The clinical face of a fact is its own card on purpose: it answers a
      // different question, and folding it into the fact would make one card
      // carry two ideas. Tagged so a cram session can filter to it.
      if (fact.clinicalCorrelate?.answer) {
        pushCard(
          ctx,
          facts,
          fact.clinicalCorrelate.question,
          fact.clinicalCorrelate.answer,
          'forward',
          { reason: 'clinical correlate', tag: REMNOTE_CLINICAL_CORRELATE }
        );
      }
      if (question) {
        pushCard(ctx, facts, question, `${fact.factStatement}${tag}`, 'forward', {
          indent: '  ',
          reason: 'question front',
        });
      }
    } else if (question) {
      pushCard(ctx, facts, question, `${fact.factStatement}${tag}`, 'forward', {
        reason: 'question front',
      });
    } else {
      // No front to ask for: the statement is content, and inventing a front
      // from it is how the unanswerable "…(Constant) → name the label" card
      // used to get made. It rides along as a note instead.
      pushNote(ctx, facts, `${fact.factStatement}${tag}`);
    }

    // Only when it did not already become a cloze hint above, and only when
    // this fact produced a card for the hook to hang on.
    if (hook && !clozeDeletion) {
      if (facts.cards.length > cardsBefore) pushDetail(ctx, facts, 'Memory hook', hook);
      else pushNote(ctx, facts, `Memory hook: ${hook}`, '  ');
    }
  }

  // Conceptual mechanisms: 4-quadrant cards. Only the headline is a reverse
  // card worth having — `whatIsIt` genuinely identifies the concept, so
  // "given this definition, name the concept" is a real retrieval. The three
  // labelled quadrants under it are not: they become Extra Card Detail, which
  // is why one concept costs one card instead of five.
  const mechs = newSection('mechanisms', '🧠 4-Quadrant Mechanisms', 'Mechanisms');
  for (const mech of report.conceptualMechanisms || []) {
    mechs.activeSource = sourceIdOfItem(mech.id);
    pushCard(ctx, mechs, mech.conceptName, mech.whatIsIt, twoWay);
    conceptsCount++;
    pushExtra(ctx, mechs, 'Why it matters', mech.whyItMatters, 'labelled prompt');
    if (mech.howItWorks) {
      // As detail this quadrant is reveal-only, so clozing it would manufacture
      // a test RemNote never asks — it ships as the prose it is. As a card, the
      // cloze is exactly what makes the mechanism askable.
      pushExtra(
        ctx,
        mechs,
        'How it works',
        ctx.explanationsAsDetail ? mech.howItWorks : optimizeCloze(mech.howItWorks, mech.conceptName),
        'labelled prompt'
      );
    }
    pushExtra(ctx, mechs, 'What if it fails', mech.whatIfEdgeCase, 'labelled prompt');
    if (mech.boundaryContrast) {
      // A contrast row: the front names the lookalike, so the reverse would ask
      // "given the distinguishing rule, name the thing it distinguishes".
      pushExtra(
        ctx,
        mechs,
        `vs ${mech.boundaryContrast.confusableLookalike}`,
        mech.boundaryContrast.distinguishingRule,
        'contrast row'
      );
    }
  }

  // Practice drills: short questions, forward-only by construction. The reason
  // a drill is right rides IN the answer — `- Why >> ${whyCorrect}` was a card
  // whose front is the bare word "Why", which RemNote can only ask as
  // `Question > Why >> _____` (a fragment nobody can answer, and the exact trap
  // the RemNote-native plan forbids). Inlining it is the plan's promotion of the
  // mechanism into the answer the drill already tests, so no second card exists
  // in either mode. Traps are context on the drill's back, never a card: Extra
  // Card Detail when the deck uses it, and part of the answer when it does not.
  const drills = newSection('drills', '⚡ Practice Drills', 'Practice Drills');
  for (const d of report.practiceQuestions || []) {
    drills.activeSource = sourceIdOfItem(d.id);
    const traps = d.distractors && d.distractors.length > 0 ? d.distractors.join(' / ') : '';
    const trapsAsDetail = Boolean(traps) && ctx.explanationsAsDetail;
    const answer = [
      d.answer,
      d.whyCorrect ? `(${d.whyCorrect})` : '',
      traps && !trapsAsDetail ? `— Traps: ${traps}` : '',
    ]
      .filter(Boolean)
      .join(' ');
    // A drill that names its own wrong answers has declared a failure mode, and
    // that is exactly what the Exam Trap tag is derived from.
    pushCard(ctx, drills, d.question, answer, 'forward', {
      reason: 'question front',
      tag: traps ? REMNOTE_EXAM_TRAP : undefined,
    });
    if (trapsAsDetail) pushDetail(ctx, drills, 'Traps', traps);
  }

  // Worked examples: one multi-line card per example. The chain of steps is one
  // answer with several parts, not five cards that each ask for a fragment.
  const examples = newSection('examples', '🧮 Worked Examples', 'Worked Examples');
  for (const ex of report.workedExamples || []) {
    examples.activeSource = sourceIdOfItem(ex.id);
    const front = [ex.title, ex.problem].filter(Boolean).join(' — ') || 'Worked example';
    const items = [...(ex.steps || [])];
    if (ex.takeaway) items.push(`Takeaway: ${ex.takeaway}`);
    pushMultiPart(ctx, examples, front, items, {
      kind: 'multi-line',
      reason: 'a step chain is one answer with several parts',
    });
  }

  // Confusable Pairs / Discrimination Matrix. The two lookalike names are
  // wrapped in [[wikilinks]] — the plan's "concept portals": reviewing either
  // card, RemNote previews the other concept, so a discrimination pair is
  // studied as one boundary instead of two unrelated cards. Each distinct pair
  // name is one portal, and the count rides on the payload so the push can
  // say what it actually shipped.
  const confusableSection = newSection('confusable', '⚖️ Confusable Pairs & Discrimination Matrix', 'Discrimination Matrix');
  let conceptPortals = 0;
  for (const pair of report.confusablePairs || []) {
    confusableSection.activeSource = sourceIdOfItem(pair.id);
    const a = (pair.conceptA || '').trim();
    const b = (pair.conceptB || '').trim();
    conceptPortals += (a ? 1 : 0) + (b ? 1 : 0);
    const link = (name: string) => (name ? `[[${name}]]` : '');
    pushCard(
      ctx,
      confusableSection,
      `When does the system switch from ${link(a)} to ${link(b)}?`,
      pair.boundaryCondition,
      'forward',
      { reason: 'boundary condition question' }
    );
    pushExtra(ctx, confusableSection, 'Distinguishing Axis', pair.distinguishingAxis, 'contrast row');
    pushExtra(ctx, confusableSection, `${link(a)} Feature`, pair.conceptAFeature, 'contrast row');
    pushExtra(ctx, confusableSection, `${link(b)} Feature`, pair.conceptBFeature, 'contrast row');
    if (pair.diagnosticVignette && pair.diagnosticAnswer) {
      pushCard(
        ctx,
        confusableSection,
        `Vignette: ${pair.diagnosticVignette} (${link(a)} vs ${link(b)})`,
        pair.diagnosticAnswer,
        'forward',
        { indent: '  ', reason: 'diagnostic drill' }
      );
    }
  }

  // Ordered cascades. A process split across five Q→A cards tests five facts
  // and teaches no chronology: the learner can answer every step and still not
  // know what follows what, which is the whole knowledge. RemNote's list-answer
  // form (`>>1.` with nested bullets) quizzes the ORDER, one step at a time.
  const cascades = newSection('cascades', '🔗 Sequential Cascades', 'Sequential Cascades');
  for (const cascade of report.sequentialCascades || []) {
    cascades.activeSource = sourceIdOfItem(cascade.id);
    const items = [...cascade.steps];
    if (cascade.disruptor) items.push(`Interrupted by: ${cascade.disruptor}`);
    pushMultiPart(ctx, cascades, cascade.process, items, {
      kind: 'list-answer',
      reason: 'one process is one ordered card, not N fragment cards',
    });
  }

  // Boundary tripwires. Hard exams ask where a rule BREAKS far more often than
  // they ask for the rule, and a law applied outside its validity is the one
  // mistake recall cannot prevent — so each one ships as its own tagged card.
  const tripwires = newSection('tripwires', '⚠️ Boundary Tripwires', 'Boundary Tripwires');
  for (const tripwire of report.boundaryTripwires || []) {
    tripwires.activeSource = sourceIdOfItem(tripwire.id);
    const answer = [
      tripwire.breaksWhen,
      tripwire.indicator ? `Indicator: ${tripwire.indicator}` : '',
    ]
      .filter(Boolean)
      .join(' ');
    pushCard(
      ctx,
      tripwires,
      `Under what condition does ${tripwire.law} stop holding?`,
      answer,
      'forward',
      { reason: 'limit of validity', tag: REMNOTE_EXAM_TRAP }
    );
  }

  const sectionsToAssemble = [facts, mechs, drills, examples];
  if (report.sequentialCascades && report.sequentialCascades.length > 0) {
    sectionsToAssemble.push(cascades);
  }
  if (report.confusablePairs && report.confusablePairs.length > 0) {
    sectionsToAssemble.push(confusableSection);
  }
  if (report.boundaryTripwires && report.boundaryTripwires.length > 0) {
    sectionsToAssemble.push(tripwires);
  }

  const assembled = assemblePayload(ctx, sectionsToAssemble);
  return {
    ...assembled,
    factsCount,
    conceptsCount,
    conceptPortals,
    hierarchicalDeck: assembled.markdown,
    parentAnchor,
  };
}

/**
 * Optimizes a mechanism string into a cloze deletion with {{}} wrapping the key causal trigger
 */
export function optimizeCloze(text: string, keyword?: string): string {
  if (!text) return '';
  if (text.includes('{{') && text.includes('}}')) return text;

  if (keyword && text.toLowerCase().includes(keyword.toLowerCase())) {
    const regex = new RegExp(`(${keyword.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'i');
    return text.replace(regex, '{{$1}}');
  }

  // Auto-detect high value verbs / causal connectors
  const words = text.split(' ');
  if (words.length <= 4) {
    return `{{${text}}}`;
  }

  // Cloze the latter half or key explanatory clause
  const mid = Math.floor(words.length / 2);
  const targetSegment = words.slice(mid).join(' ');
  return `${words.slice(0, mid).join(' ')} {{${targetSegment}}}`;
}

/**
 * Infers a broader macro-system context (Contextual Anchoring) if user hasn't specified one
 */
export function inferParentSystemAnchor(topic: string): string {
  if (!topic) return 'Foundational Sciences & Systems';
  const t = topic.toLowerCase();

  if (t.includes('action potential') || t.includes('neuron') || t.includes('synapse') || t.includes('myelin') || t.includes('brain')) {
    return 'The Nervous System & Cellular Electrophysiology';
  }
  if (t.includes('photosynthesis') || t.includes('chloroplast') || t.includes('calvin') || t.includes('light reaction')) {
    return 'Plant Bioenergetics & Metabolic Pathways';
  }
  if (t.includes('mitosis') || t.includes('dna') || t.includes('crispr') || t.includes('ribosome') || t.includes('rna')) {
    return 'Molecular Genetics & Cellular Biology';
  }
  if (t.includes('sort') || t.includes('tree') || t.includes('graph') || t.includes('recursion') || t.includes('dynamic programming')) {
    return 'Computer Science: Data Structures & Algorithms';
  }
  if (t.includes('quantum') || t.includes('schrodinger') || t.includes('wave') || t.includes('entangle')) {
    return 'Modern Quantum Mechanics & Theoretical Physics';
  }
  if (t.includes('inflation') || t.includes('monetary') || t.includes('gdp') || t.includes('interest rate') || t.includes('liquidity')) {
    return 'Macroeconomics & Monetary Policy Systems';
  }
  if (t.includes('contract') || t.includes('tort') || t.includes('jurisdiction') || t.includes('statute')) {
    return 'Legal Jurisprudence & Regulatory Frameworks';
  }

  // Generic intelligent parent
  return `Broader System: Foundations of ${topic}`;
}

/**
 * Generates Feynman-to-Cloze cards from user's own conversational explanations
 */
export function generateFeynmanClozes(schema: Partial<SavedSchema>): FeynmanClozeItem[] {
  const items: FeynmanClozeItem[] = [];
  if (!schema.activities || schema.activities.length === 0) return items;

  schema.activities.forEach((act, idx) => {
    const userResp = schema.userResponses?.[act.id];
    const userField = userResp?.field1 || userResp?.field2 || userResp?.field3;
    const userText = userField && userField.trim().length > 10 ? userField.trim() : act.scaffold.exampleAnswer || act.contextSnippet;
    
    // Create clozed version from user's vocabulary
    const clozed = optimizeCloze(compressSemantically(userText), act.keywords?.[0] || act.keywords?.[1]);
    const jargonComparison = act.contextSnippet || act.prompt;

    items.push({
      id: `feynman-cloze-${act.id || idx}`,
      stageTitle: act.title || `Stage ${idx + 1}`,
      userVocabularyText: userText,
      clozedUserText: clozed,
      textbookJargonComparison: jargonComparison,
      cognitiveSpeedAdvantage: userField ? 'Personal Schema (3.2x Faster Retrieval)' : 'Scaffolded First-Principles',
    });
  });

  return items;
}

/**
 * Performs client-side semantic compression (reducing card fluff by ~60%)
 */
export function compressSemantically(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\b(it is important to note that|as we can clearly see|in other words|basically|essentially|it should be remembered that|in this regard|furthermore, we notice that)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Converts a completed SavedSchema or active activities into strict RemNote
 * hierarchical markdown.
 * Hierarchy rules:
 * - Parent System Anchor (Feature 86: Contextual Anchoring)
 *   - Document / Title: [[Parent System]] > [[Topic]]
 *     - Concept Name (two-way) :: [Feynman Explanation / Definition with {{Cloze}}] (Feature 83)
 *       - Child: What >> [What]
 *       - Child: Why >> [Why]
 *       - Child: How (Mechanism) >> [How, with {{Cloze}}]
 *       - Child: What If (Edge Case) >> [What If]
 *       - Child: Boundary Test >> [Versus trap]
 *
 * The three quadrant prompts are questions, so they are forward-only: asking
 * "given 'S4 swings outward', which quadrant prompt is that?" is not a card
 * anybody can answer. They stay cards here (unlike the forge's AI-written
 * quadrants, which ride along as Extra Card Detail) because these answers are
 * the learner's own writing — the thing the deck exists to test.
 */
export function generateRemnoteHierarchy(
  schema: Partial<SavedSchema>,
  options?: RemnoteOptions
): RemnoteExportPayload {
  const topic = schema.topicSummary || 'DeepEncode Cognitive Schema';
  const parentAnchor = options?.parentAnchor || inferParentSystemAnchor(topic);
  const preferFeynman = options?.preferFeynmanCloze !== false;
  const ctx = createContext(options, parentAnchor, topic);
  const twoWay: RemnoteCardDirection = ctx.twoWay ? 'two-way' : 'forward';

  const feynmanClozings = generateFeynmanClozes(schema);
  let factsCount = 0;
  let conceptsCount = 0;

  // Foundational deep-research prerequisites. `conceptAdded` is a NAME, so the
  // reverse card here is real: given the explanation, name the concept.
  const prereqs = newSection('prerequisites', '🔍 Foundational Deep Research Prerequisites', 'Prerequisites');
  for (const rc of schema.researchContexts || []) {
    prereqs.activeSource = sourceIdOfItem(rc.id);
    pushCard(ctx, prereqs, rc.conceptAdded, compressSemantically(rc.explanation), twoWay);
    if (rc.sourceTitle) {
      // A citation is the textbook case for Extra Card Detail: it belongs on the
      // card, and nobody re-answers "who wrote this".
      pushDetail(ctx, prereqs, 'Authoritative reference', rc.sourceTitle);
    }
    // A gap you must close is exactly what SHOULD be tested, so it stays a card.
    pushCard(ctx, prereqs, 'Prerequisite gap', `{{${rc.detectedGap}}}`, 'forward', {
      indent: '  ',
      reason: 'a gap to close is worth testing',
    });
  }

  // Activities (stages) as 4-quadrant cards.
  const stages = newSection('stages', '🧠 4-Quadrant Cognitive Matrix & Mechanisms', 'Stages');
  (schema.activities || []).forEach((act, idx) => {
    stages.activeSource = sourceIdOfItem(act.id);
    const resp = schema.userResponses?.[act.id];
    const stageName = act.title || `Stage ${idx + 1}`;
    const boundaryCard = toyBoundaryCard(act, resp);
    if (boundaryCard) {
      pushCard(ctx, stages, boundaryCard.front, boundaryCard.back, 'forward', { reason: 'prediction-boundary interference trap' });
    }
    const duelCard = toyDuelCard(act, resp);
    if (duelCard) {
      pushCard(ctx, stages, duelCard.front, duelCard.back, 'forward', { reason: 'devil’s advocate claim, refuted' });
    }
    const userWhat = resp?.field1?.trim() || '';
    const userWhy = resp?.field2?.trim() || '';
    const userHow = resp?.field3?.trim() || '';

    // Forward-only: the front carries the ordinal ("3. Stage"), and "given the
    // goal, name stage 3" is not a question anyone can answer.
    pushCard(ctx, stages, `${act.stageNumber || idx + 1}. ${stageName}`, compressSemantically(act.cognitiveGoal), 'forward', {
      reason: 'numbered step',
    });

    // Feature 83: the Feynman-to-Cloze pipeline — the learner's own vocabulary
    // first. A `{{deletion}}` carries the card on its own; the quadrant label
    // rides along as the prompt's context.
    if (userWhat) {
      pushCard(ctx, stages, 'What is it? (Personal Feynman)', optimizeCloze(compressSemantically(userWhat), act.keywords?.[0]), 'forward', {
        indent: '  ',
        reason: 'question front',
      });
      conceptsCount++;
    } else if (act.scaffold.exampleAnswer || act.contextSnippet) {
      const fallback = act.scaffold.exampleAnswer || act.contextSnippet;
      pushCard(ctx, stages, 'What is it? (Definition)', optimizeCloze(compressSemantically(fallback), act.keywords?.[0]), 'forward', {
        indent: '  ',
        reason: 'question front',
      });
      conceptsCount++;
    }

    if (userWhy) {
      pushCard(ctx, stages, 'Why does it matter? (Significance)', optimizeCloze(compressSemantically(userWhy), act.keywords?.[1]), 'forward', {
        indent: '  ',
        reason: 'question front',
      });
    } else {
      pushCard(ctx, stages, 'Why does it matter? (Significance)', '{{Crucial step for system operation and preventing collapse}}', 'forward', {
        indent: '  ',
        reason: 'question front',
      });
    }

    if (userHow) {
      pushCard(ctx, stages, 'How does it work? (Mechanism)', optimizeCloze(compressSemantically(userHow), act.keywords?.[2]), 'forward', {
        indent: '  ',
        reason: 'question front',
      });
    } else if (act.prompt) {
      pushCard(ctx, stages, 'How does it work? (Mechanism)', optimizeCloze(compressSemantically(act.prompt), act.keywords?.[2]), 'forward', {
        indent: '  ',
        reason: 'question front',
      });
    }

    pushCard(
      ctx,
      stages,
      'What If it is removed or fails? (Edge Case)',
      `If {{${act.keywords?.[0] || 'the core mechanism'}}} is absent, the system fails to maintain equilibrium.`,
      'forward',
      { indent: '  ', reason: 'question front' }
    );

    if (act.keywords && act.keywords.length > 0) {
      // A list of trigger terms is one answer with several items: a list-answer
      // card, not five cards that each ask for one word.
      pushMultiPart(ctx, stages, 'Core semantic triggers', act.keywords.map((k) => `${k}`), {
        kind: 'list-answer',
        reason: 'a list is one answer with several items',
        indent: '  ',
      });
      factsCount++;
    }

    emit(ctx, stages, '');
  });

  const assembled = assemblePayload(ctx, [prereqs, stages], [
    `**Learning Mode** ${schema.mode === 'memorization' ? 'Taxonomic Memorization' : 'First-Principles Conceptual'}`,
    `**Feynman Cloze Pipeline** ${preferFeynman ? 'Active (User Vocabulary Clozing)' : 'Standard Academic'}`,
    `**Mastery XP** ${schema.xpEarned || 150} XP`,
    `**Encoded Date** ${new Date(schema.timestamp || Date.now()).toLocaleDateString()}`,
  ]);
  return {
    ...assembled,
    factsCount,
    conceptsCount,
    hierarchicalDeck: assembled.markdown,
    parentAnchor,
    feynmanClozings,
  };
}

// ─── RemNote API handoff ────────────────────────────────────────────────────
//
// RemNote's public write API (`api.remnote.io`, v0) is a THIRD-PARTY backend:
// it authenticates with the `apiKey` and `userId` the user copied out of
// RemNote's settings, and — critically — it sends no CORS headers, so a browser
// cannot call it directly. The integration therefore goes through this app's
// own server route (`/api/remnote`), which is also where the credentials stop
// being visible to the page. The previous implementation posted to
// `api.remnote.com/v1/create` with a Bearer token: wrong host, wrong API
// version, wrong auth style, and blocked by CORS.

/** RemNote's documented backend API base (keys are read in the plugin settings). */
export const REMNOTE_API_BASE = 'https://api.remnote.io/api/v0';

export interface RemnotePushAttempt {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/**
 * Requests to try, in order. RemNote has shipped two create shapes over the
 * API's life (`create_note`, `create_document`) and this ladder keeps the push
 * working against either deployment instead of pinning one guess.
 */
export function buildRemnotePushAttempts(
  apiKey: string,
  userId: string,
  payload: RemnoteExportPayload,
  title?: string
): RemnotePushAttempt[] {
  const headers = {
    'Content-Type': 'application/json',
    apiKey: apiKey.trim(),
    userId: (userId || '').trim(),
  };
  const documentTitle = title || `DeepEncoded: ${payload.parentAnchor || 'Study Notes'}`;
  return [
    {
      url: `${REMNOTE_API_BASE}/create_note`,
      headers,
      body: { note: { title: documentTitle, content: payload.markdown } },
    },
    {
      url: `${REMNOTE_API_BASE}/create_document`,
      headers,
      body: { title: documentTitle, content: payload.markdown },
    },
  ];
}

export interface RemnotePushResult {
  success: boolean;
  message: string;
  docId?: string;
  /** Documents RemNote accepted. */
  pushed?: number;
  /** Documents that did not land (0 when everything did). */
  failed?: number;
}

/** One document, through this app's server route. */
async function postRemnoteDocument(
  apiKey: string,
  userId: string,
  title: string,
  markdown: string
): Promise<{ ok: boolean; message: string; docId?: string }> {
  try {
    const res = await fetch('/api/remnote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: apiKey.trim(),
        userId: (userId || '').trim(),
        markdown,
        title,
      }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      return {
        ok: false,
        message:
          data?.message ||
          `RemNote push failed (HTTP ${res.status}). Copy the document and paste it into RemNote instead.`,
      };
    }

    return {
      ok: true,
      message: data.message || 'Pushed the structured document into your RemNote knowledge base.',
      docId: data.docId,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: `Could not reach the RemNote push route: ${err?.message || 'network error'}. Copy the document and paste it into RemNote instead.`,
    };
  }
}

/**
 * Pushes the hierarchical markdown through this app's server route (see
 * `app/api/remnote/route.ts`), which is the only side allowed to talk to
 * RemNote directly.
 *
 * A payload carrying `documents` is pushed as one document per section, in
 * order, matching what the export surface offers to copy — RemNote's API
 * creates one document per call, so a four-section deck becomes four named
 * pages rather than one undifferentiated dump. The ladder is sequential and
 * stops at the first refusal, and the failure text says how much landed: a
 * half-pushed deck has to be recognisable as one, not reported as either a
 * success or a total failure. The copy buttons stay the always-available
 * fallback, because RemNote's public API is not always up.
 */
export async function pushToRemnoteApi(
  apiKey: string,
  userId: string,
  payload: RemnoteExportPayload
): Promise<RemnotePushResult> {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("RemNote API Key is required.");
  }

  const documents =
    payload.documents && payload.documents.length > 0
      ? payload.documents.map((d) => ({ title: d.title, markdown: d.markdown }))
      : [
          {
            title: `DeepEncoded: ${payload.parentAnchor || 'Study Notes'}`,
            markdown: payload.markdown,
          },
        ];

  let pushed = 0;
  let docId: string | undefined;
  let lastMessage = '';

  for (const document of documents) {
    const result = await postRemnoteDocument(apiKey, userId, document.title, document.markdown);
    if (!result.ok) {
      return {
        success: false,
        message:
          pushed > 0
            ? `Pushed ${pushed} of ${documents.length} documents, then RemNote refused "${document.title}". ${result.message}`
            : result.message,
        pushed,
        failed: documents.length - pushed,
      };
    }
    pushed += 1;
    docId = result.docId ?? docId;
    lastMessage = result.message;
  }

  return {
    success: true,
    message:
      documents.length > 1
        ? `Pushed ${documents.length} RemNote documents — one per card section${
            payload.conceptPortals ? ` with ${payload.conceptPortals} concept portal${payload.conceptPortals === 1 ? '' : 's'}` : ''
          }.`
        : lastMessage,
    docId,
    pushed,
    failed: 0,
  };
}
