import JSZip from 'jszip';
import { SavedSchema, SegregationReport, DeclarativeFactItem, ConceptualMechanismItem, ProceduralMCQArchetype } from './types';
import { buildAnkiCollectionSqlite, generateAnkiGuid, AnkiNoteRow } from './anki-sqlite-writer';

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
  const dconf = {
    '1': {
      id: 1,
      name: 'Default',
      replayq: true,
      timer: 0,
      maxTaken: 60,
      usn: -1,
      new: { bury: true, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 7], perDay: 20, separate: true },
      rev: { perDay: 100, fuzz: 0.05, ivlFct: 1, maxIvl: 36500, ease4: 1.3, bury: true, minSpace: 1 },
      lapse: { delays: [10], mult: 0, minInt: 1, leechFails: 8, leechAction: 0 },
      dyn: false,
    },
  };
  return {
    conf: JSON.stringify(conf),
    models: JSON.stringify(models),
    decks: JSON.stringify(decks),
    dconf: JSON.stringify(dconf),
  };
}

/** Sanitizes a deck name for Anki's :: path separator. */
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

