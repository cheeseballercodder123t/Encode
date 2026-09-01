import JSZip from 'jszip';
import { SavedSchema, SegregationReport, DeclarativeFactItem, ConceptualMechanismItem } from './types';

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

/**
 * Extracts normalized Anki cards from a SavedSchema or SegregationReport
 */
export function extractAnkiCardsFromSchema(
  schema?: Partial<SavedSchema> | null,
  report?: SegregationReport | null
): AnkiCardItem[] {
  const cards: AnkiCardItem[] = [];
  const initialSM2 = calculateSM2(4); // Default initialized with 1-day initial SM2 interval

  // 1. Declarative Facts
  if (report?.declarativeFacts) {
    report.declarativeFacts.forEach((fact, idx) => {
      cards.push({
        id: fact.id || `fact-${idx}`,
        front: fact.clozeSuggestion || fact.factStatement,
        back: `<b>Fact Detail:</b> ${fact.factStatement}`,
        isCloze: fact.clozeSuggestion.includes('{{'),
        tags: ['DeepEncode', 'DeclarativeFact', fact.tag || 'General'].filter(Boolean),
        sm2: { ...initialSM2 },
      });
    });
  }

  // 2. 4-Quadrant Conceptual Mechanisms
  const mechanisms = report?.conceptualMechanisms || [];
  mechanisms.forEach((mech, idx) => {
    // Quadrant 1 + 3 Causal Cloze
    cards.push({
      id: `mech-${idx}-causal`,
      front: `<b>${mech.conceptName}</b> (Causal Mechanism):<br>${mech.howItWorks.replace(
        mech.conceptName,
        `{{c1::${mech.conceptName}}}`
      )}`,
      back: `<b>What it is:</b> ${mech.whatIsIt}<br><b>Why it matters:</b> ${mech.whyItMatters}`,
      isCloze: true,
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

  // 3. Fallback from SavedSchema Activities if report is empty
  if (cards.length === 0 && schema?.activities) {
    schema.activities.forEach((act, idx) => {
      cards.push({
        id: act.id || `act-${idx}`,
        front: `<b>${act.title}</b>:<br>${act.prompt}`,
        back: `<b>Key Concepts:</b> ${act.keywords.join(', ')}<br>${act.contextSnippet}`,
        isCloze: act.prompt.includes('{{'),
        tags: ['DeepEncode', 'SchemaActivity'],
        sm2: { ...initialSM2 },
      });
    });
  }

  return cards;
}

/**
 * Generates Anki Import Text Format (.txt/.tsv) with Cloze headers
 */
export function generateAnkiTextDeck(cards: AnkiCardItem[], deckName: string): string {
  const lines: string[] = [];
  lines.push(`#separator:tab`);
  lines.push(`#html:true`);
  lines.push(`#tags column:4`);
  lines.push(`#deck:${deckName.replace(/[\n\t]/g, ' ')}`);
  lines.push(`#notetype:${cards.some((c) => c.isCloze) ? 'Cloze' : 'Basic'}`);
  lines.push('');

  cards.forEach((c) => {
    const cleanFront = c.front.replace(/\t/g, ' ').replace(/\n/g, '<br>');
    const cleanBack = c.back.replace(/\t/g, ' ').replace(/\n/g, '<br>');
    const tagStr = c.tags.join(' ');
    lines.push(`${cleanFront}\t${cleanBack}\t${c.sm2.interval}\t${tagStr}`);
  });

  return lines.join('\n');
}

/**
 * Generates an Anki .apkg zip package containing the text deck, manifest, and SM-2 metadata
 */
export async function generateAnkiApkgPackage(cards: AnkiCardItem[], deckName: string): Promise<Blob> {
  const zip = new JSZip();
  const textDeck = generateAnkiTextDeck(cards, deckName);

  // 1. Media mapping file
  zip.file('media', '{}');

  // 2. Anki Import Deck File
  zip.file('deck.txt', textDeck);

  // 3. Metadata JSON for SM-2 Spaced Repetition engine
  const sm2Manifest = {
    generator: 'DeepEncode Cognitive AI Engine',
    deckName,
    createdTimestamp: Date.now(),
    cardCount: cards.length,
    cards: cards.map((c) => ({
      id: c.id,
      front: c.front,
      back: c.back,
      tags: c.tags,
      sm2: c.sm2,
    })),
  };
  zip.file('deepencode_sm2_manifest.json', JSON.stringify(sm2Manifest, null, 2));

  // Generate zip binary
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
