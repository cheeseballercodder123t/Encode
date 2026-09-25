'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  type AnkiCardItem,
  extractAnkiCardsFromSchema,
  extractWeakAnkiCardsFromSchema,
  sanitizeExtracted,
  withInterferenceTraps,
  withHeldBackCards,
  type SanitizedDeck,
  generateAnkiApkgPackage, 
  generateAnkiTextDeck, 
  generateAnkiTextDecks, 
  syncToCustomWebhook, 
  calculateSM2, 
  SM2State,
  generateProceduralApkgPackage,
  generateProceduralAnkiTextDeck,
  buildProceduralFieldData,
  PROCEDURAL_RUNNER_JS,
  PROCEDURAL_NOTE_TYPE_NAME
} from '@/lib/anki-exporter';
import { SavedSchema, SegregationReport, ProceduralMCQArchetype } from '@/lib/types';
import { BUILT_IN_ARCHETYPES, AP_SUBJECT_GROUPS } from '@/lib/procedural-archetypes';
import { validateProceduralArchetype } from '@/lib/procedural-validator';
import { loadAISettings } from '@/lib/storage';
import { playSound } from '@/lib/audio';
import { auditDeck, splitDenseCloze } from '@/lib/fsrs-audit';
import {
  DEFAULT_ANKI_CONNECT_URL,
  loadAnkiEndpoint,
  saveAnkiEndpoint,
  pushCardsToAnki,
  formatPushStatus,
  describePushError,
} from '@/lib/anki-connect';

interface AnkiExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  schema?: Partial<SavedSchema> | null;
  report?: SegregationReport | null;
  /** The student's raw notes : MCQs are authored FROM these, not AP presets. */
  notes?: string;
  /** Pre-selected before opening : include / skip the Procedural MCQ deck. */
  includeMcq?: boolean;
}

export function AnkiExportModal({ isOpen, onClose, schema, report, notes, includeMcq }: AnkiExportModalProps) {
  // The Wozniak-enforced deck. Extraction is raw, then sanitized: 1-idea split,
  // two-way cloze symmetry, 20-word ceiling. Everything downstream (preview,
  // audit, downloads, webhook) reads this deck, so the count you see is the
  // count you ship.
  const [deck, setDeck] = useState<SanitizedDeck>({ cards: [], heldBack: [], addedSymmetric: 0, before: 0 });
  // Set after a manual FSRS split, which rewrites the deck in place.
  const [manualCards, setManualCards] = useState<AnkiCardItem[] | null>(null);
  // Ceiling overflow is excluded by default (Wozniak: chunk it first); this
  // explicit opt-in ships them tagged `WozniakOverflow` instead of losing them.
  const [includeHeldBack, setIncludeHeldBack] = useState(false);
  const [deckName, setDeckName] = useState<string>('DeepEncode::Cognitive_Schema');
  // Three tabs only : Export (apkg/txt + audit), MCQ Deck, Sync (Webhook).
  const [activeTab, setActiveTab] = useState<'export' | 'mcq' | 'sync'>('export');

  // Weak-export toggle: when on, only unfinished / low-scoring stages are exported.
  const [exportWeakOnly, setExportWeakOnly] = useState(false);
  const weakDeck = useMemo(() => {
    if (!exportWeakOnly) return null;
    const weak = extractWeakAnkiCardsFromSchema(schema, report);
    // No weak stages → the toggle is a no-op, never an empty deck. Traps from
    // the prediction gate belong in a weak-only deck too: they are, by
    // definition, the things the learner already got wrong once.
    return weak.length > 0 ? sanitizeExtracted(withInterferenceTraps(weak)) : null;
  }, [exportWeakOnly, schema, report]);

  const activeDeck = weakDeck ?? deck;
  const baseCards = manualCards ?? activeDeck.cards;
  const displayCards = useMemo(
    () => (includeHeldBack ? withHeldBackCards({ ...activeDeck, cards: baseCards }, true) : baseCards),
    [activeDeck, baseCards, includeHeldBack]
  );

  // FSRS Card Audit : recomputed whenever the displayed deck changes.
  const audit = useMemo(() => auditDeck(displayCards), [displayCards]);

  // Webhook
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isSyncingWebhook, setIsSyncingWebhook] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  // AnkiConnect : one-tap push straight into a running Anki desktop app, so
  // finishing an encode never detours through a file system.
  const [ankiEndpoint, setAnkiEndpoint] = useState<string>(DEFAULT_ANKI_CONNECT_URL);
  const [isPushing, setIsPushing] = useState(false);
  const [pushStatus, setPushStatus] = useState<{ ok: boolean; message: string } | null>(null);

  // Hydration-safe: localStorage is read after mount, not during render.
  /* eslint-disable react-hooks/set-state-in-effect -- external-system read on open */
  useEffect(() => {
    if (isOpen) setAnkiEndpoint(loadAnkiEndpoint());
  }, [isOpen]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const [prevIsOpen, setPrevIsOpen] = useState(false);
  const [prevReport, setPrevReport] = useState<SegregationReport | null | undefined>(undefined);
  const [prevSchema, setPrevSchema] = useState<Partial<SavedSchema> | null | undefined>(undefined);

  // ── Procedural MCQ tab state ─────────────────────────────────────────────────
  // Start with NOTHING selected : the point is MCQs authored from the student's
  // own notes, not the built-in AP presets. Presets stay available but opt-in.
  const [selectedArchetypeIds, setSelectedArchetypeIds] = useState<string[]>([]);
  const [aiArchetypes, setAiArchetypes] = useState<ProceduralMCQArchetype[]>([]);
  const [aiTopic, setAiTopic] = useState('');
  const [aiCount, setAiCount] = useState(3);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiGenStatus, setAiGenStatus] = useState<{ success?: boolean; message?: string } | null>(null);
  const [previewArchetypeId, setPreviewArchetypeId] = useState<string>('');

  const availableArchetypes = useMemo<ProceduralMCQArchetype[]>(
    () => [...BUILT_IN_ARCHETYPES, ...aiArchetypes],
    [aiArchetypes]
  );
  // Cache 50-trial validation results so typing in the authoring box never
  // re-executes every formula on each keystroke.
  const validArchetypeIds = useMemo(() => {
    const result = new Set<string>();
    for (const a of availableArchetypes) {
      if (validateProceduralArchetype(a).valid) result.add(a.id);
    }
    return result;
  }, [availableArchetypes]);

  if (isOpen && (!prevIsOpen || prevReport !== report || prevSchema !== schema)) {
    setPrevIsOpen(true);
    setPrevReport(report);
    setPrevSchema(schema);
    setDeck(sanitizeExtracted(withInterferenceTraps(extractAnkiCardsFromSchema(schema, report))));
    setManualCards(null);
    setIncludeHeldBack(false);
    const title = report?.topic || schema?.topicSummary || 'Cognitive_Schema';
    setDeckName(`DeepEncode::${title.replace(/[^a-zA-Z0-9_]/g, '_')}`);
    // MCQs default to the CURRENT session topic + notes, not AP presets.
    setAiTopic(report?.topic || schema?.topicSummary || '');
    // The user pre-selected the MCQ deck beforehand : pre-check every valid
    // built-in archetype (and keep any AI-authored ones already picked) so the
    // deck is ready to preview + export the moment the modal opens.
    const builtInIds = BUILT_IN_ARCHETYPES.filter((a) => validateProceduralArchetype(a).valid).map((a) => a.id);
    setSelectedArchetypeIds((prev) =>
      includeMcq === false ? [] : [...new Set([...builtInIds, ...prev])]
    );
    setPreviewArchetypeId((prev) => prev || builtInIds[0] || '');
  } else if (!isOpen && prevIsOpen) {
    setPrevIsOpen(false);
  }

  const handlePushToAnki = useCallback(async () => {
    if (isPushing || displayCards.length === 0) return;
    playSound('click');
    setIsPushing(true);
    setPushStatus(null);
    try {
      // Persist whatever endpoint the user typed, normalized.
      const endpoint = saveAnkiEndpoint(ankiEndpoint);
      setAnkiEndpoint(endpoint);
      const result = await pushCardsToAnki(displayCards, deckName, { url: endpoint });
      setPushStatus({
        ok: true,
        message: `${formatPushStatus(result)} — ${result.added} of ${result.attempted} card${
          result.attempted === 1 ? '' : 's'
        } landed in ${result.deckName}.`,
      });
      playSound('success');
    } catch (err) {
      setPushStatus({ ok: false, message: describePushError(err) });
      playSound('wrong');
    } finally {
      setIsPushing(false);
    }
  }, [ankiEndpoint, deckName, displayCards, isPushing]);

  // Cmd/Ctrl+Shift+A from anywhere in the modal pushes. The capture-phase
  // listener (plus stopPropagation for this combo only) keeps the workbench's
  // own shortcut from also firing at the stage behind the modal.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        e.stopPropagation();
        void handlePushToAnki();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [isOpen, handlePushToAnki]);

  if (!isOpen) return null;

  const handleDownloadApkg = async () => {
    playSound('click');
    try {
      const blob = await generateAnkiApkgPackage(displayCards, deckName);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${deckName}.apkg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      playSound('success');
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleDownloadTxt = () => {
    playSound('click');
    const decks = generateAnkiTextDecks(displayCards, deckName);
    // CloZe + Basic are split into separate files so each maps to a single
    // note type (Anki refuses "No cloze found" or field-count mismatches).
    const files: { name: string; content: string }[] = [];
    if (decks.cloze) files.push({ name: `${deckName}_Cloze.txt`, content: decks.cloze });
    if (decks.basic) files.push({ name: `${deckName}_Basic.txt`, content: decks.basic });

    files.forEach(({ name, content }) => {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
    playSound('success');
  };

  const handleSyncWebhook = async () => {
    if (!webhookUrl.trim() || isSyncingWebhook) return;
    playSound('click');
    setIsSyncingWebhook(true);
    setWebhookStatus(null);

    const res = await syncToCustomWebhook(webhookUrl, deckName, displayCards);
    setWebhookStatus(res);
    setIsSyncingWebhook(false);
    if (res.success) playSound('success');
  };

  const handleSimulateGrade = null; // removed : SM-2 simulator tab dropped for simplicity

  // ── Procedural MCQ tab handlers ──────────────────────────────────────────
  const selectedArchetypes = availableArchetypes.filter((a) => selectedArchetypeIds.includes(a.id));
  const previewArchetype =
    availableArchetypes.find((a) => a.id === previewArchetypeId) || availableArchetypes[0];

  const toggleArchetype = (id: string) => {
    playSound('click');
    setSelectedArchetypeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const buildPreviewSrcdoc = (archetype: ProceduralMCQArchetype): string => {
    const css =
      `.card{font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;color:#e2e8f0;padding:14px;}` +
      `.proc-topic{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#22d3ee;margin-bottom:8px;}` +
      `.proc-question{font-size:16px;line-height:1.55;margin-bottom:14px;}` +
      `.proc-options{display:flex;flex-direction:column;gap:8px;margin-bottom:12px;}` +
      `.proc-option{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:10px 12px;border-radius:10px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:15px;cursor:pointer;}` +
      `.proc-option .proc-letter{font-weight:800;color:#22d3ee;}` +
      `.proc-option:disabled{cursor:default;}` +
      `.proc-option.proc-correct{border-color:#22c55e;background:rgba(34,197,94,.18);}` +
      `.proc-option.proc-wrong{border-color:#ef4444;background:rgba(239,68,68,.18);}` +
      `.proc-option.proc-dim{opacity:.55;}` +
      `.proc-feedback{font-size:13px;line-height:1.5;margin-bottom:10px;}` +
      `.proc-solution{border:1px solid #334155;border-radius:10px;padding:12px;font-size:14px;line-height:1.6;background:rgba(15,23,42,.6);}` +
      `.proc-solution .proc-solution-title{font-weight:800;color:#22d3ee;margin-bottom:6px;}`;
    const body =
      `<body style="background:#0D101D;color:#e2e8f0;">` +
      `<div class="proc-topic">${archetype.topic}</div>` +
      `${buildProceduralFieldData(archetype)}<div id="proc-mcq-root"></div>` +
      `<script>${PROCEDURAL_RUNNER_JS}<\/script></body>`;
    return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>${body}</html>`;
  };

  const handleGenerateArchetypes = async () => {
    if (!aiTopic.trim() || isGeneratingAi) return;
    playSound('click');
    setIsGeneratingAi(true);
    setAiGenStatus(null);
    try {
      const res = await fetch('/api/archetype', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: aiTopic,
          count: aiCount,
          // MCQs are authored FROM the student's notes when available.
          notes: notes?.trim() ? notes : undefined,
          settings: loadAISettings(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiGenStatus({ success: false, message: data.error || 'AI authoring failed.' });
        return;
      }
      const generated: ProceduralMCQArchetype[] = Array.isArray(data.archetypes) ? data.archetypes : [];
      const report = data.validationReport || { ok: true, issues: [] };
      setAiArchetypes((prev) => {
        const merged = [...prev];
        generated.forEach((g) => {
          const idx = merged.findIndex((m) => m.id === g.id);
          if (idx >= 0) merged[idx] = g;
          else merged.push(g);
        });
        return merged;
      });
      // Auto-select only the valid AI archetypes; keep invalid ones visible but excluded.
      const failedIds = new Set(
        (report.issues || []).map((i: { archetypeId: string }) => i.archetypeId)
      );
      setSelectedArchetypeIds((prev) => [
        ...new Set([...prev, ...generated.map((g) => g.id).filter((id) => !failedIds.has(id))]),
      ]);
      setAiGenStatus({
        success: true,
        message: `AI authored ${generated.length} archetype(s)${
          report.ok ? ' : all passed the 50-trial numerical validator.' : ' : some failed validation and need repair.'
        }`,
      });
      if (generated.length > 0) {
        setPreviewArchetypeId(generated[0].id);
        setActiveTab('mcq');
      }
    } catch (err: any) {
      console.error(err);
      setAiGenStatus({ success: false, message: err?.message || 'AI authoring request failed.' });
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleDownloadProceduralApkg = async () => {
    if (selectedArchetypes.length === 0) return;
    playSound('click');
    try {
      const blob = await generateProceduralApkgPackage(
        selectedArchetypes,
        `DeepEncode::Procedural_MCQ`
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'DeepEncode_Procedural_MCQ.apkg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      playSound('success');
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleDownloadProceduralTxt = () => {
    if (selectedArchetypes.length === 0) return;
    playSound('click');
    const txt = generateProceduralAnkiTextDeck(selectedArchetypes, 'DeepEncode::Procedural_MCQ');
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'DeepEncode_Procedural_MCQ.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    playSound('success');
  };

  const handleAutoSplit = (cardId: string) => {
    const target = baseCards.find((c) => c.id === cardId);
    if (!target) return;
    const split = splitDenseCloze(target);
    if (!split) {
      playSound('click');
      return;
    }
    playSound('click');
    const idx = baseCards.findIndex((c) => c.id === cardId);
    if (idx === -1) return;
    const next = [...baseCards];
    next.splice(idx, 1, ...split);
    setManualCards(next);
    playSound('success');
  };

  /** Flipping the weak-only toggle discards any manual split on the old deck. */
  const handleToggleWeakOnly = (checked: boolean) => {
    setExportWeakOnly(checked);
    setManualCards(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-chassis/80 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-chassis border border-edge/30 overflow-hidden flex flex-col max-h-[88vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-edge flex items-center justify-between ">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-inset/10 border border-edge/30 flex items-center justify-center text-bone">
              <span className="text-amber font-bold font-mono">[ ZAP ]</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-bone text-base">Anki & SM-2 Spaced Repetition Exporter</h3>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-inset/20 text-bone border border-edge/30">
                  {displayCards.length} Flashcards
                </span>
                {audit.length > 0 && (
                  <span
                    className="px-2 py-0.5 text-[10px] font-bold uppercase bg-amber/20 text-amber border border-amber/30 cursor-pointer"
                    onClick={() => setActiveTab('export')}
                  >
                    {audit.length} need audit
                  </span>
                )}
              </div>
              <p className="text-xs text-solder">
                Export Cloze deletion flashcards into Anki or sync via SM-2 Webhooks
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-solder hover:text-bone hover:bg-inset transition-none cursor-pointer"
          >
            <span className="text-amber font-bold font-mono">[ X ]</span>
          </button>
        </div>

        {/* Modal Navigation Tabs : Export / MCQ Deck / Sync */}
        <div className="p-3 border-b border-edge bg-chassis flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('export')}
            className={`px-3.5 py-1.5 min-h-[44px] text-xs font-bold transition-none flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'export'
                ? 'bg-inset text-bone '
                : 'text-solder hover:text-bone hover:bg-deck'
            }`}
          >
            <span className="text-amber font-bold font-mono">[ DL ]</span>
            <span>Export .apkg / .txt</span>
            {audit.length > 0 && (
              <span className="px-1.5 py-0.5 bg-amber/30 text-[10px] font-bold text-amber">{audit.length}</span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('mcq')}
            className={`px-3.5 py-1.5 min-h-[44px] text-xs font-bold transition-none flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'mcq'
                ? 'bg-inset text-bone '
                : 'text-solder hover:text-bone hover:bg-deck'
            }`}
          >
            <span className="text-amber font-bold font-mono">[ MCQ ]</span>
            <span>Procedural MCQ Deck (from your notes)</span>
          </button>

          <button
            onClick={() => setActiveTab('sync')}
            className={`px-3.5 py-1.5 min-h-[44px] text-xs font-bold transition-none flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'sync'
                ? 'bg-inset text-bone '
                : 'text-solder hover:text-bone hover:bg-deck'
            }`}
          >
            <span className="text-amber font-bold font-mono">[ SYNC ]</span>
            <span>Sync (Webhook)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* Deck Title Input */}
          <div className="p-3.5 bg-deck/80 border border-edge flex items-center gap-3">
            <span className="text-xs font-bold text-solder shrink-0">Deck Name:</span>
            <input
              type="text"
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              className="flex-1 px-3 py-1.5 bg-chassis border border-edge text-xs text-bone focus:outline-none focus:border-edge font-mono"
            />
          </div>

          {/* TAB 1: Export (.apkg + .txt + card preview + FSRS audit) */}
          {activeTab === 'export' && (
            <div className="space-y-4">
              {/* Weak-export toggle: only export unfinished / low-scoring stages. */}
              <label className="flex items-center gap-2.5 p-3 bg-deck/60 border border-edge cursor-pointer hover:border-solder">
                <input
                  type="checkbox"
                  checked={exportWeakOnly}
                  onChange={e => handleToggleWeakOnly(e.target.checked)}
                  className="w-4 h-4 accent-amber cursor-pointer"
                />
                <span className="text-xs text-bone font-medium">
                  Export only unfinished / low-scoring stages
                  {exportWeakOnly && displayCards.length !== deck.cards.length
                    ? <span className="text-amber"> · {displayCards.length} of {deck.cards.length}</span>
                    : null}
                </span>
              </label>

              {/* Wozniak enforcement pass : what the sanitizer changed. */}
              <div
                className={`p-3.5 border text-xs leading-relaxed space-y-2 ${
                  activeDeck.heldBack.length > 0
                    ? 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                    : 'bg-inset/40 border-edge text-slate-ink'
                }`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-semibold text-amber-300 text-[11px] uppercase tracking-widest">
                    <span className="font-mono">[ WOZNIAK ]</span> Enforcement pass
                  </span>
                  <span className="font-mono text-[11px] text-solder">
                    {activeDeck.before} raw → {displayCards.length} atomic
                  </span>
                </div>
                <p className="text-solder">
                  The 1-idea rule, two-way cloze symmetry, and the 20-word information ceiling are applied
                  to every card before it reaches Anki.
                  {activeDeck.addedSymmetric > 0
                    ? ` Added ${activeDeck.addedSymmetric} reverse-direction card${activeDeck.addedSymmetric === 1 ? '' : 's'}.`
                    : ''}
                </p>

                {activeDeck.heldBack.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <div className="p-2.5 bg-chassis/60 border border-amber-500/30">
                      <span className="font-semibold text-amber-300">
                        {activeDeck.heldBack.length} card fragment{activeDeck.heldBack.length === 1 ? '' : 's'} held back
                      </span>
                      <span className="text-solder">
                        {' '}— auto-splitting could not bring them under the 20-word ceiling, so they are out of
                        the export until you chunk them in the workbench.
                      </span>
                      <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-solder">
                        {activeDeck.heldBack.map((h, i) => (
                          <li key={`${h.card.id}-${i}`}>
                            [ ! ] {h.card.front.replace(/<[^>]*>/g, '').slice(0, 64)} — {h.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeHeldBack}
                        onChange={(e) => setIncludeHeldBack(e.target.checked)}
                        className="w-4 h-4 accent-amber cursor-pointer"
                      />
                      <span className="text-bone">
                        Export them anyway (tagged{' '}
                        <code className="text-amber font-mono">WozniakOverflow</code>)
                      </span>
                    </label>
                  </div>
                )}
              </div>

              <div className="p-4 bg-inset/30 border border-edge/30 text-xs text-bone leading-relaxed space-y-2">
                <div className="font-bold text-bone flex items-center gap-2">
                  <span className="text-signal font-bold font-mono">[ OK ]</span>
                  Ready to Export {displayCards.length} DeepEncode Cloze Flashcards
                </div>
                <p>
                  Downloads a structured Anki package (<code className="text-bone font-bold">.apkg</code>) pre-configured with Cloze deletion tags, Feynman personal vocabulary, and SM-2 initial scheduling metadata.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={handleDownloadApkg}
                  className="py-3 px-4 bg-deck hover:bg-inset border border-edge text-bone font-bold text-xs flex items-center justify-center gap-2 transition-colors duration-150 cursor-pointer"
                >
                  <span className="text-amber font-bold font-mono">[ DL ]</span>
                  Download .apkg Package
                </button>

                <button
                  onClick={handleDownloadTxt}
                  className="py-3 px-4 bg-deck hover:bg-inset border border-edge text-bone font-bold text-xs flex items-center justify-center gap-2 transition-none cursor-pointer"
                >
                  <span className="text-amber font-bold font-mono">[ FILE ]</span>
                  Download Anki .txt (Tab-Separated)
                </button>
              </div>

              {/* AnkiConnect: straight into a running Anki, no file system. */}
              <div className="p-4 bg-deck/60 border border-edge space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-semibold text-[11px] uppercase tracking-widest text-amber-300">
                    <span className="font-mono">[ ANKI ]</span> One-tap push
                  </span>
                  <span className="font-mono text-[11px] text-solder">Cmd/Ctrl+Shift+A</span>
                </div>
                <p className="text-xs text-solder leading-relaxed">
                  Creates the deck and adds {displayCards.length} card{displayCards.length === 1 ? '' : 's'} directly
                  through AnkiConnect. Requires the Anki desktop app open with the AnkiConnect add-on
                  (code <code className="text-bone font-mono">2055492159</code>) — duplicates are skipped, never re-added.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    aria-label="AnkiConnect endpoint"
                    value={ankiEndpoint}
                    onChange={(e) => setAnkiEndpoint(e.target.value)}
                    placeholder={DEFAULT_ANKI_CONNECT_URL}
                    className="flex-1 px-3 py-2 bg-chassis border border-edge text-xs text-bone focus:outline-none focus:border-solder font-mono"
                  />
                  <button
                    onClick={handlePushToAnki}
                    disabled={isPushing || displayCards.length === 0}
                    className="px-4 py-2 bg-amber/15 hover:bg-amber/25 border border-amber/50 text-amber font-bold text-xs flex items-center justify-center gap-2 transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    <span className="font-mono">[ ZAP ]</span>
                    {isPushing ? 'Forging…' : `Push ${displayCards.length} to Anki`}
                  </button>
                </div>
                {pushStatus && (
                  <div
                    data-testid="anki-push-status"
                    className={`p-3 border text-xs leading-relaxed ${
                      pushStatus.ok
                        ? 'bg-signal-950/40 border-signal/40 text-signal-300'
                        : 'bg-hazard-950/40 border-hazard/40 text-hazard-300'
                    }`}
                  >
                    <span className="font-mono font-bold">{pushStatus.ok ? '[ OK ]' : '[ ! ]'}</span> {pushStatus.message}
                  </div>
                )}
              </div>

              {/* Cards Preview */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-solder">Card Deck Preview ({displayCards.length}):</span>
                <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                  {displayCards.map((c, idx) => (
                    <div key={c.id || idx} className="p-3 bg-deck/60 border border-edge text-xs space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-solder">
                        <span className="font-bold text-bone">Card #{idx + 1}</span>
                        <div className="flex gap-1">
                          {c.tags.map((t) => (
                            <span key={t} className="px-1.5 py-0.5 bg-inset text-[10px] text-solder">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="font-mono text-[11px] text-bone" dangerouslySetInnerHTML={{ __html: c.front }} />
                    </div>
                  ))}
                </div>
              </div>

              {/* FSRS Card Audit (inline; badge count on the tab) */}
              <div className="space-y-2 pt-2 border-t border-edge/60">
                <div className={`p-4 border text-xs leading-relaxed space-y-2 ${
                  audit.length > 0
                    ? 'bg-amber-950/40 border-amber/40 text-amber-300'
                    : 'bg-signal-950/40 border-signal/40 text-signal-300'
                }`}>
                  <div className="font-bold flex items-center gap-2">
                    <span className="font-bold font-mono">[ ! ]</span>
                    FSRS Card Audit : {audit.length} card{audit.length === 1 ? '' : 's'} flagged
                  </div>
                  {audit.length > 0 ? (
                    <p>Dense cloze sentences become <b>D=10 leeches</b> in FSRS. Split them below for cleaner spaced-repetition.</p>
                  ) : (
                    <p><b>All clear.</b> No too-long or ambiguous cloze cards detected. Your deck is FSRS-ready.</p>
                  )}
                </div>

                {audit.length > 0 && (
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {audit.map(({ card: c, issues }) => (
                      <div key={c.id} className="p-3 bg-deck/60 border border-edge text-xs space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="font-mono text-[11px] text-bone leading-relaxed" dangerouslySetInnerHTML={{ __html: c.front }} />
                          <button
                            onClick={() => handleAutoSplit(c.id)}
                            disabled={!issues.some((i) => i.kind === 'too_long')}
                            className="shrink-0 px-2.5 py-1 bg-amber/20 hover:bg-amber/30 border border-amber/40 text-amber font-bold flex items-center gap-1.5 transition-none cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            title={issues.some((i) => i.kind === 'too_long') ? 'Auto-split into two atomic cards' : 'Only too-long cards can be split'}
                          >
                            <span className="text-amber font-bold font-mono">[ SPLIT ]</span>
                            <span>Split</span>
                          </button>
                        </div>
                        <div className="space-y-1">
                          {issues.map((issue, idx) => (
                            <div
                              key={idx}
                              className={`flex items-start gap-2 ${
                                issue.kind === 'ambiguous' ? 'text-hazard' : 'text-amber'
                              }`}
                            ><span className="text-amber font-bold font-mono">[ ! ]</span>
                                <span>{issue.message}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Sync (Webhook) */}
          {activeTab === 'sync' && (
            <div className="grid grid-cols-1 gap-4">
              {/* Webhook */}
              <div className="space-y-4">
                <div className="p-4 bg-inset/30 border border-edge/30 text-xs text-bone leading-relaxed space-y-2">
                  <div className="font-bold text-bone flex items-center gap-2">
                    <span className="text-amber font-bold font-mono">[ WEB ]</span>
                    Custom Webhook
                  </div>
                  <p>
                    Sends the complete card payload with pre-calculated SM-2 ease factors and review timestamps to your server.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-solder block">Webhook Receiver Endpoint URL:</label>
                  <input
                    type="url"
                    placeholder="https://api.myworkspace.com/v1/anki-sync"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    className="w-full px-3.5 py-2 bg-chassis border border-edge text-xs text-bone focus:outline-none focus:border-edge font-mono"
                  />
                </div>

                <button
                  onClick={handleSyncWebhook}
                  disabled={!webhookUrl.trim() || isSyncingWebhook}
                  className="w-full py-3 px-4 bg-inset hover:bg-deck text-bone font-bold text-xs flex items-center justify-center gap-2 transition-colors duration-150 cursor-pointer disabled:opacity-50"
                >
                  {isSyncingWebhook ? (
                    <>
                      <span className="text-amber font-bold font-mono">[ BUSY ]</span>
                      Dispatching Webhook...
                    </>
                ) : (
                  <>
                    <span className="text-amber font-bold font-mono">[ SEND ]</span>
                    Dispatch SM-2 Card Payload to Webhook
                  </>
                )}
              </button>

              {webhookStatus && (
                <div className={`p-3  text-xs flex items-start gap-2 ${
                  webhookStatus.success
                    ? 'bg-signal-950/40 border border-signal/40 text-signal-300'
                    : 'bg-hazard-950/40 border border-hazard/40 text-hazard-300'
                }`}>
                  {webhookStatus.success ? (
                    <span className="text-signal font-bold font-mono">[ OK ]</span>
                  ) : (
                    <span className="text-hazard font-bold font-mono">[ ! ]</span>
                  )}
                  <div className="leading-relaxed">{webhookStatus.message}</div>
                </div>
              )}
            </div>
            </div>
          )}

        {/* TAB 2: Procedural MCQ Deck (authored from the student's notes) */}
          {activeTab === 'mcq' && (
            <div className="space-y-4">
              <div className="p-4 bg-inset/30 border border-edge/30 text-xs text-bone leading-relaxed space-y-2">
                <div className="font-bold text-bone flex items-center gap-2">
                  <span className="text-flux font-bold font-mono">[ FLASK ]</span>
                  Procedural Trap-Engine MCQ Deck
                </div>
                <p>
                  Parametric multiple-choice archetypes written from the notes you provided (not generic presets).
                  Every review, the card&apos;s embedded client-side JavaScript rolls fresh numbers, computes the
                  answer + 3 conceptual traps, and gives instant interactive feedback with the full
                  step-by-step solution : <b>100% offline in Anki Desktop, AnkiDroid &amp; Anki Mobile, zero add-ons,
                  zero API keys at review time.</b>
                </p>
              </div>

              {/* AI Authoring */}
              <div className="p-4 bg-deck/60 border border-edge space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-bone">
                  <span className="text-flux font-bold font-mono">[ WAND ]</span>
                  Author MCQs from this session&apos;s notes
                  <span className="text-[10px] text-solder font-normal">
                    (validated automatically; broken equations are repaired)
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="e.g. AP Physics C: Rotational Motion"
                    value={aiTopic}
                    onChange={(e) => setAiTopic(e.target.value)}
                    className="flex-1 px-3 py-2 bg-chassis border border-edge text-xs text-bone focus:outline-none focus:border-edge font-mono"
                  />
                  <select
                    value={aiCount}
                    onChange={(e) => setAiCount(Number(e.target.value))}
                    className="px-3 py-2 bg-chassis border border-edge text-xs text-bone focus:outline-none focus:border-edge cursor-pointer"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} archetype{n > 1 ? 's' : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleGenerateArchetypes}
                    disabled={isGeneratingAi || !aiTopic.trim()}
                    className="px-4 py-2 bg-inset hover:bg-deck text-bone font-bold text-xs flex items-center justify-center gap-2 transition-colors duration-150 cursor-pointer disabled:opacity-50"
                  >
                    {isGeneratingAi ? (
                      <>
                        <span className="text-flux-300 font-bold font-mono">[ BUSY ]</span>
                        Authoring &amp; validating...
                      </>
                    ) : (
                      <>
                        <span className="text-flux font-bold font-mono">[ * ]</span>
                        Generate with AI
                      </>
                    )}
                  </button>
                </div>
                {aiGenStatus && (
                  <div className={`p-2.5  text-[11px] flex items-start gap-2 ${
                    aiGenStatus.success
                      ? 'bg-signal-950/40 border border-signal/40 text-signal-300'
                      : 'bg-hazard-950/40 border border-hazard/40 text-hazard-300'
                  }`}>
                    {aiGenStatus.success ? (
                      <span className="text-signal font-bold font-mono">[ OK ]</span>
                    ) : (
                      <span className="text-hazard font-bold font-mono">[ ! ]</span>
                    )}
                    <div className="leading-relaxed">{aiGenStatus.message}</div>
                  </div>
                )}
              </div>

              {/* Archetype Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-solder">
                    Archetypes ({selectedArchetypes.length} of {availableArchetypes.length} selected):
                  </span>
                  <button
                    onClick={() => setSelectedArchetypeIds(availableArchetypes.map((a) => a.id))}
                    className="text-[10px] text-solder hover:text-bone font-bold cursor-pointer"
                  >
                    Select all
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                  {AP_SUBJECT_GROUPS.map((group) => (
                    <div key={group.subject} className="space-y-1.5">
                      <div className="text-[10px] font-black uppercase tracking-widest text-solder">
                        {group.subject}
                      </div>
                      {availableArchetypes
                        .filter((a) => group.archetypeIds.includes(a.id) || a.topic.startsWith(group.subject))
                        .map((a) => {
                          const isValid = validArchetypeIds.has(a.id);
                          const checked = selectedArchetypeIds.includes(a.id);
                          return (
                            <label
                              key={a.id}
                              className={`flex items-start gap-2 p-2.5  border cursor-pointer text-xs transition-none ${
                                checked
                                  ? 'bg-inset/30 border-edge/40'
                                  : 'bg-deck/50 border-edge hover:border-edge'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleArchetype(a.id)}
                                className="mt-0.5 accent-amber cursor-pointer"
                              />
                              <span className="flex-1 leading-snug">
                                <span className="font-bold text-bone">{a.topic}</span>
                                <span className="block text-[10px] text-solder">{a.id}</span>
                              </span>
                              {isValid ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-signal-950/40 border border-signal/40 text-signal-300 text-[10px] font-bold shrink-0">
                                  <span className="text-signal font-bold font-mono">[ OK ]</span> Verified
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-hazard-950/40 border border-hazard/40 text-hazard-300 text-[10px] font-bold shrink-0">
                                  <span className="text-hazard font-bold font-mono">[ ! ]</span> Fails validation
                                </span>
                              )}
                            </label>
                          );
                        })}
                    </div>
                  ))}
                </div>
              </div>
          {/* Live Preview */}
              {previewArchetype && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-solder">Live Browser Preview (front of card):</span>
                    <select
                      value={previewArchetype.id}
                      onChange={(e) => setPreviewArchetypeId(e.target.value)}
                      className="px-2 py-1 bg-chassis border border-edge text-[10px] text-solder focus:outline-none cursor-pointer"
                    >
                      {availableArchetypes.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.topic}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className=" overflow-hidden border border-edge bg-chassis">
                    <iframe
                      title="Procedural MCQ Preview"
                      srcDoc={buildPreviewSrcdoc(previewArchetype)}
                      className="w-full h-72"
                      sandbox="allow-scripts"
                    />
                  </div>
                  <p className="text-[10px] text-solder">
                    Click an option: correct → green, wrong → red with the exact AP trap you fell for, plus the
                    full LaTeX step-by-step solution (rendered by Anki&apos;s built-in MathJax).
                  </p>
                </div>
              )}

              {/* Export Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={handleDownloadProceduralApkg}
                  disabled={selectedArchetypes.length === 0}
                  className="py-3 px-4 bg-deck hover:bg-inset border border-edge text-bone font-bold text-xs flex items-center justify-center gap-2 transition-colors duration-150 cursor-pointer disabled:opacity-40"
                >
                  <span className="text-amber font-bold font-mono">[ DL ]</span>
                  Download Procedural MCQ .apkg ({selectedArchetypes.length})
                </button>
                <button
                  onClick={handleDownloadProceduralTxt}
                  disabled={selectedArchetypes.length === 0}
                  className="py-3 px-4 bg-deck hover:bg-inset border border-edge text-bone font-bold text-xs flex items-center justify-center gap-2 transition-none cursor-pointer disabled:opacity-40"
                >
                  <span className="text-amber font-bold font-mono">[ FILE ]</span>
                  Download Procedural .txt (Anki Import)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-edge bg-chassis flex items-center justify-between text-xs text-solder">
          <span>SuperMemo SM-2 &amp; Cloze Deletion Standard</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-inset hover:bg-deck text-bone font-bold transition-colors duration-150 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
