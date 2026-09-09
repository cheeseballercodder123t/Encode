'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AnkiCardItem, 
  extractAnkiCardsFromSchema, 
  generateAnkiApkgPackage, 
  generateAnkiTextDeck, 
  syncToAnkiConnect, 
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

interface AnkiExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  schema?: Partial<SavedSchema> | null;
  report?: SegregationReport | null;
}

export function AnkiExportModal({ isOpen, onClose, schema, report }: AnkiExportModalProps) {
  const [cards, setCards] = useState<AnkiCardItem[]>([]);
  const [deckName, setDeckName] = useState<string>('DeepEncode::Cognitive_Schema');
  const [activeTab, setActiveTab] = useState<'apkg' | 'ankiconnect' | 'webhook' | 'sm2_simulator' | 'procedural' | 'audit'>('apkg');

  // FSRS Card Audit : recomputed whenever the deck changes.
  const audit = useMemo(() => auditDeck(cards), [cards]);

  // AnkiConnect
  const [ankiConnectUrl, setAnkiConnectUrl] = useState('http://127.0.0.1:8765');
  const [isSyncingAnkiConnect, setIsSyncingAnkiConnect] = useState(false);
  const [ankiConnectStatus, setAnkiConnectStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  // Webhook
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isSyncingWebhook, setIsSyncingWebhook] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  // SM-2 Simulator State
  const [simGrade, setSimGrade] = useState<number>(4);
  const [simState, setSimState] = useState<SM2State>(() => ({
    repetitions: 1,
    interval: 1,
    easeFactor: 2.5,
    nextReviewTimestamp: Date.now() + 86400000,
  }));

  const [prevIsOpen, setPrevIsOpen] = useState(false);
  const [prevReport, setPrevReport] = useState<SegregationReport | null | undefined>(undefined);
  const [prevSchema, setPrevSchema] = useState<Partial<SavedSchema> | null | undefined>(undefined);

  // ── Procedural MCQ tab state ─────────────────────────────────────────────────
  const [selectedArchetypeIds, setSelectedArchetypeIds] = useState<string[]>(() =>
    BUILT_IN_ARCHETYPES.map((a) => a.id)
  );
  const [aiArchetypes, setAiArchetypes] = useState<ProceduralMCQArchetype[]>([]);
  const [aiTopic, setAiTopic] = useState('AP Physics C: Rotational Motion');
  const [aiCount, setAiCount] = useState(3);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiGenStatus, setAiGenStatus] = useState<{ success?: boolean; message?: string } | null>(null);
  const [previewArchetypeId, setPreviewArchetypeId] = useState<string>(BUILT_IN_ARCHETYPES[0].id);

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
    const extracted = extractAnkiCardsFromSchema(schema, report);
    setCards(extracted);
    const title = report?.topic || schema?.topicSummary || 'Cognitive_Schema';
    setDeckName(`DeepEncode::${title.replace(/[^a-zA-Z0-9_]/g, '_')}`);
  } else if (!isOpen && prevIsOpen) {
    setPrevIsOpen(false);
  }

  if (!isOpen) return null;

  const handleDownloadApkg = async () => {
    playSound('click');
    try {
      const blob = await generateAnkiApkgPackage(cards, deckName);
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
    const txt = generateAnkiTextDeck(cards, deckName);
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deckName}_AnkiImport.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    playSound('success');
  };

  const handleSyncAnkiConnect = async () => {
    if (isSyncingAnkiConnect) return;
    playSound('click');
    setIsSyncingAnkiConnect(true);
    setAnkiConnectStatus(null);

    const res = await syncToAnkiConnect(ankiConnectUrl, deckName, cards);
    setAnkiConnectStatus(res);
    setIsSyncingAnkiConnect(false);
    if (res.success) playSound('success');
  };

  const handleSyncWebhook = async () => {
    if (!webhookUrl.trim() || isSyncingWebhook) return;
    playSound('click');
    setIsSyncingWebhook(true);
    setWebhookStatus(null);

    const res = await syncToCustomWebhook(webhookUrl, deckName, cards);
    setWebhookStatus(res);
    setIsSyncingWebhook(false);
    if (res.success) playSound('success');
  };

  const handleSimulateGrade = (grade: number) => {
    playSound('click');
    setSimGrade(grade);
    const updated = calculateSM2(grade, simState);
    setSimState(updated);
  };

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
        setActiveTab('procedural');
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
    const target = cards.find((c) => c.id === cardId);
    if (!target) return;
    const split = splitDenseCloze(target);
    if (!split) {
      playSound('click');
      return;
    }
    playSound('click');
    setCards((prev) => {
      const idx = prev.findIndex((c) => c.id === cardId);
      if (idx === -1) return prev;
      const next = [...prev];
      next.splice(idx, 1, ...split);
      return next;
    });
    playSound('success');
  };

  return (
    <div className="fixed inset-0 z-50 bg-chassis/80 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-chassis border border-steel/30 overflow-hidden flex flex-col max-h-[88vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-steel flex items-center justify-between ">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-steel/10 border border-steel/30 flex items-center justify-center text-bone">
              <span className="text-amber font-bold font-mono">[ ZAP ]</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-bone text-base">Anki & SM-2 Spaced Repetition Exporter</h3>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-steel/20 text-bone border border-steel/30">
                  {cards.length} Flashcards
                </span>
                {audit.length > 0 && (
                  <span
                    className="px-2 py-0.5 text-[10px] font-bold uppercase bg-amber/20 text-amber border border-amber/30 cursor-pointer"
                    onClick={() => setActiveTab('audit')}
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
            className="p-1.5 text-solder hover:text-bone hover:bg-steel transition-none cursor-pointer"
          >
            <span className="text-amber font-bold font-mono">[ X ]</span>
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="p-3 border-b border-steel bg-chassis flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('apkg')}
            className={`px-3.5 py-1.5  text-xs font-bold transition-none flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'apkg'
                ? 'bg-steel text-bone '
                : 'text-solder hover:text-bone hover:bg-deck'
            }`}
          >
            <span className="text-amber font-bold font-mono">[ DL ]</span>
            <span>Direct .apkg Package</span>
          </button>

          <button
            onClick={() => setActiveTab('ankiconnect')}
            className={`px-3.5 py-1.5  text-xs font-bold transition-none flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'ankiconnect'
                ? 'bg-steel text-bone '
                : 'text-solder hover:text-bone hover:bg-deck'
            }`}
          >
            <span className="text-amber font-bold font-mono">[ CPU ]</span>
            <span>AnkiConnect Sync</span>
          </button>

          <button
            onClick={() => setActiveTab('webhook')}
            className={`px-3.5 py-1.5  text-xs font-bold transition-none flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'webhook'
                ? 'bg-steel text-bone '
                : 'text-solder hover:text-bone hover:bg-deck'
            }`}
          >
            <span className="text-amber font-bold font-mono">[ WEB ]</span>
            <span>Web-Hook SM-2 Sync</span>
          </button>

          <button
            onClick={() => setActiveTab('sm2_simulator')}
            className={`px-3.5 py-1.5  text-xs font-bold transition-none flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'sm2_simulator'
                ? 'bg-steel text-bone '
                : 'text-solder hover:text-bone hover:bg-deck'
            }`}
          >
            <span className="text-amber font-bold font-mono">[ RESET ]</span>
            <span>SM-2 Scheduler Engine</span>
          </button>

          <button
            onClick={() => setActiveTab('procedural')}
            className={`px-3.5 py-1.5  text-xs font-bold transition-none flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'procedural'
                ? 'bg-steel text-bone '
                : 'text-solder hover:text-bone hover:bg-deck'
            }`}
          >
            <span className="text-amber font-bold font-mono">[ FLASK ]</span>
            <span>Procedural MCQ Deck (AP Chem / Stats / Phys C)</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`px-3.5 py-1.5  text-xs font-bold transition-none flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'audit'
                ? 'bg-amber text-bone '
                : 'text-solder hover:text-bone hover:bg-deck'
            }`}
          >
            <span className="text-amber font-bold font-mono">[ ! ]</span>
            <span>FSRS Card Audit</span>
            {audit.length > 0 && (
              <span className="px-1.5 py-0.5 bg-amber/30 text-[10px] font-bold text-amber">
                {audit.length}
              </span>
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* Deck Title Input */}
          <div className="p-3.5 bg-deck/80 border border-steel flex items-center gap-3">
            <span className="text-xs font-bold text-solder shrink-0">Deck Name:</span>
            <input
              type="text"
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              className="flex-1 px-3 py-1.5 bg-chassis border border-steel text-xs text-bone focus:outline-none focus:border-steel font-mono"
            />
          </div>

          {/* TAB 1: Direct .apkg Download */}
          {activeTab === 'apkg' && (
            <div className="space-y-4">
              <div className="p-4 bg-steel/30 border border-steel/30 text-xs text-bone leading-relaxed space-y-2">
                <div className="font-bold text-bone flex items-center gap-2">
                  <span className="text-amber font-bold font-mono">[ OK ]</span>
                  Ready to Export {cards.length} DeepEncode Cloze Flashcards
                </div>
                <p>
                  Downloads a structured Anki package (<code className="text-bone font-bold">.apkg</code>) pre-configured with Cloze deletion tags, Feynman personal vocabulary, and SM-2 initial scheduling metadata.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={handleDownloadApkg}
                  className="py-3 px-4 hover: hover: text-bone font-bold text-xs   flex items-center justify-center gap-2 transition-none cursor-pointer"
                >
                  <span className="text-amber font-bold font-mono">[ DL ]</span>
                  Download .apkg Package
                </button>

                <button
                  onClick={handleDownloadTxt}
                  className="py-3 px-4 bg-deck hover:bg-steel border border-steel text-bone font-bold text-xs flex items-center justify-center gap-2 transition-none cursor-pointer"
                >
                  <span className="text-amber font-bold font-mono">[ FILE ]</span>
                  Download Anki .txt (Tab-Separated)
                </button>
              </div>

              {/* Cards Preview */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-solder">Card Deck Preview ({cards.length}):</span>
                <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                  {cards.map((c, idx) => (
                    <div key={c.id || idx} className="p-3 bg-deck/60 border border-steel text-xs space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-solder">
                        <span className="font-bold text-bone">Card #{idx + 1}</span>
                        <div className="flex gap-1">
                          {c.tags.map((t) => (
                            <span key={t} className="px-1.5 py-0.5 bg-steel text-[10px] text-solder">
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
            </div>
          )}

          {/* TAB 2: AnkiConnect Desktop Sync */}
          {activeTab === 'ankiconnect' && (
            <div className="space-y-4">
              <div className="p-4 bg-amber/30 border border-amber/30 text-xs text-amber leading-relaxed space-y-2">
                <div className="font-bold text-amber flex items-center gap-2">
                  <span className="text-amber font-bold font-mono">[ CPU ]</span>
                  1-Click Local Anki Desktop Integration
                </div>
                <p>
                  Requires Anki Desktop running locally with the <code className="text-amber font-mono">AnkiConnect</code> add-on enabled on port <code className="text-amber font-mono">8765</code>.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-solder block">AnkiConnect Endpoint URL:</label>
                <input
                  type="text"
                  value={ankiConnectUrl}
                  onChange={(e) => setAnkiConnectUrl(e.target.value)}
                  className="w-full px-3.5 py-2 bg-chassis border border-steel text-xs text-bone focus:outline-none focus:border-steel font-mono"
                />
              </div>

              <button
                onClick={handleSyncAnkiConnect}
                disabled={isSyncingAnkiConnect}
                className="w-full py-3 px-4 hover: hover: text-bone font-bold text-xs   flex items-center justify-center gap-2 transition-none cursor-pointer disabled:opacity-50"
              >
                {isSyncingAnkiConnect ? (
                  <>
                    <span className="text-amber font-bold font-mono">[ BUSY ]</span>
                    Connecting & Pushing to Anki...
                  </>
                ) : (
                  <>
                    <span className="text-amber font-bold font-mono">[ SEND ]</span>
                    Push {cards.length} Cards directly to Anki Desktop
                  </>
                )}
              </button>

              {ankiConnectStatus && (
                <div className={`p-3  text-xs flex items-start gap-2 ${
                  ankiConnectStatus.success
                    ? 'bg-amber950/40 border border-amber/40 text-amber200'
                    : 'bg-hazard950/40 border border-hazard500/40 text-hazard200'
                }`}>
                  {ankiConnectStatus.success ? (
                    <span className="text-amber font-bold font-mono">[ OK ]</span>
                  ) : (
                    <span className="text-amber font-bold font-mono">[ ! ]</span>
                  )}
                  <div className="leading-relaxed">{ankiConnectStatus.message}</div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Webhook SM-2 Sync */}
          {activeTab === 'webhook' && (
            <div className="space-y-4">
              <div className="p-4 bg-steel/30 border border-steel/30 text-xs text-bone leading-relaxed space-y-2">
                <div className="font-bold text-bone flex items-center gap-2">
                  <span className="text-amber font-bold font-mono">[ WEB ]</span>
                  Web-Hook SM-2 Spaced Repetition Dispatcher
                </div>
                <p>
                  Sends the complete active recall card payload along with pre-calculated SM-2 ease factors and review timestamps directly to your server or webhook receiver.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-solder block">Webhook Receiver Endpoint URL:</label>
                <input
                  type="url"
                  placeholder="https://api.myworkspace.com/v1/anki-sync"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="w-full px-3.5 py-2 bg-chassis border border-steel text-xs text-bone focus:outline-none focus:border-steel font-mono"
                />
              </div>

              <button
                onClick={handleSyncWebhook}
                disabled={!webhookUrl.trim() || isSyncingWebhook}
                className="w-full py-3 px-4 bg-steel hover:bg-steel text-bone font-bold text-xs   flex items-center justify-center gap-2 transition-none cursor-pointer disabled:opacity-50"
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
                    ? 'bg-amber950/40 border border-amber/40 text-amber200'
                    : 'bg-hazard950/40 border border-hazard500/40 text-hazard200'
                }`}>
                  {webhookStatus.success ? (
                    <span className="text-amber font-bold font-mono">[ OK ]</span>
                  ) : (
                    <span className="text-amber font-bold font-mono">[ ! ]</span>
                  )}
                  <div className="leading-relaxed">{webhookStatus.message}</div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SM-2 Scheduler Engine Simulator */}
          {activeTab === 'sm2_simulator' && (
            <div className="space-y-4">
              <div className="p-4 bg-amber950/30 border border-amber/30 text-xs text-amber200 leading-relaxed space-y-2">
                <div className="font-bold text-amber300 flex items-center gap-2">
                  <span className="text-amber font-bold font-mono">[ RESET ]</span>
                  SuperMemo SM-2 Interval Calculation Engine
                </div>
                <p>
                  Test how recall ratings (Grade 0 through 5) dynamically compute review intervals (<code className="text-amber300 font-bold">I(n) = I(n-1) × EF</code>) and ease factors in real-time.
                </p>
              </div>

              {/* Rating Buttons */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-solder">Simulate Active Recall Performance Grade:</span>
                <div className="grid grid-cols-6 gap-2">
                  {[0, 1, 2, 3, 4, 5].map((g) => (
                    <button
                      key={g}
                      onClick={() => handleSimulateGrade(g)}
                      className={`py-2  text-xs font-bold transition-none cursor-pointer border ${
                        simGrade === g
                          ? 'bg-amber text-bone border-amber '
                          : 'bg-deck hover:bg-steel text-solder border-steel'
                      }`}
                    >
                      Grade {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* SM2 Computed State Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-deck border border-steel">
                  <span className="text-solder block text-[11px]">Repetition Count:</span>
                  <span className="font-bold text-bone text-base mt-0.5 block">{simState.repetitions}</span>
                </div>

                <div className="p-3 bg-deck border border-steel">
                  <span className="text-solder block text-[11px]">Ease Factor (EF):</span>
                  <span className="font-bold text-amber text-base mt-0.5 block">{simState.easeFactor}</span>
                </div>

                <div className="p-3 bg-deck border border-steel">
                  <span className="text-solder block text-[11px]">Review Interval:</span>
                  <span className="font-bold text-bone text-base mt-0.5 block">{simState.interval} Days</span>
                </div>

                <div className="p-3 bg-deck border border-steel">
                  <span className="text-solder block text-[11px]">Next Due Date:</span>
                  <span className="font-bold text-bone text-xs mt-1 block">
                    {new Date(simState.nextReviewTimestamp).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          )}
        {/* TAB 5: Procedural Trap-Engine MCQ Deck */}
          {activeTab === 'procedural' && (
            <div className="space-y-4">
              <div className="p-4 bg-steel/30 border border-steel/30 text-xs text-bone leading-relaxed space-y-2">
                <div className="font-bold text-bone flex items-center gap-2">
                  <span className="text-amber font-bold font-mono">[ FLASK ]</span>
                  Procedural Trap-Engine MCQ Deck : defies the Answer Recognition Trap
                </div>
                <p>
                  Exports parametric AP Chem / Stats / Physics C MCQs into a custom{' '}
                  <code className="text-bone font-bold">{PROCEDURAL_NOTE_TYPE_NAME}</code> note type.
                  Every review, the card&apos;s embedded client-side JavaScript rolls fresh numbers, computes the
                  answer + 3 AP-style conceptual traps, and gives instant interactive feedback with the full
                  step-by-step solution : <b>100% offline in Anki Desktop, AnkiDroid &amp; Anki Mobile, zero add-ons,
                  zero API keys at review time.</b>
                </p>
              </div>

              {/* AI Authoring */}
              <div className="p-4 bg-deck/60 border border-steel space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-bone">
                  <span className="text-amber font-bold font-mono">[ WAND ]</span>
                  AI-Author New Archetypes
                  <span className="text-[10px] text-solder font-normal">
                    (validated automatically; the flash-lite repairer fixes broken equations)
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="e.g. AP Physics C: Rotational Motion"
                    value={aiTopic}
                    onChange={(e) => setAiTopic(e.target.value)}
                    className="flex-1 px-3 py-2 bg-chassis border border-steel text-xs text-bone focus:outline-none focus:border-steel font-mono"
                  />
                  <select
                    value={aiCount}
                    onChange={(e) => setAiCount(Number(e.target.value))}
                    className="px-3 py-2 bg-chassis border border-steel text-xs text-bone focus:outline-none focus:border-steel cursor-pointer"
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
                    className="px-4 py-2 bg-steel hover:bg-steel text-bone font-bold text-xs flex items-center justify-center gap-2 transition-none cursor-pointer disabled:opacity-50"
                  >
                    {isGeneratingAi ? (
                      <>
                        <span className="text-amber font-bold font-mono">[ BUSY ]</span>
                        Authoring &amp; validating...
                      </>
                    ) : (
                      <>
                        <span className="text-amber font-bold font-mono">[ * ]</span>
                        Generate with AI
                      </>
                    )}
                  </button>
                </div>
                {aiGenStatus && (
                  <div className={`p-2.5  text-[11px] flex items-start gap-2 ${
                    aiGenStatus.success
                      ? 'bg-amber950/40 border border-amber/40 text-amber200'
                      : 'bg-hazard950/40 border border-hazard500/40 text-hazard200'
                  }`}>
                    {aiGenStatus.success ? (
                      <span className="text-amber font-bold font-mono">[ OK ]</span>
                    ) : (
                      <span className="text-amber font-bold font-mono">[ ! ]</span>
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
                    className="text-[10px] text-bone hover:text-bone font-bold cursor-pointer"
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
                                  ? 'bg-steel/30 border-steel/40'
                                  : 'bg-deck/50 border-steel hover:border-steel'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleArchetype(a.id)}
                                className="mt-0.5 accent-purple-500 cursor-pointer"
                              />
                              <span className="flex-1 leading-snug">
                                <span className="font-bold text-bone">{a.topic}</span>
                                <span className="block text-[10px] text-solder">{a.id}</span>
                              </span>
                              {isValid ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber950/40 border border-amber/40 text-amber300 text-[10px] font-bold shrink-0">
                                  <span className="text-amber font-bold font-mono">[ OK ]</span> Verified
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-hazard950/40 border border-hazard500/40 text-hazard300 text-[10px] font-bold shrink-0">
                                  <span className="text-amber font-bold font-mono">[ ! ]</span> Fails validation
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
                      className="px-2 py-1 bg-chassis border border-steel text-[10px] text-solder focus:outline-none cursor-pointer"
                    >
                      {availableArchetypes.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.topic}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className=" overflow-hidden border border-steel bg-chassis">
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
                  className="py-3 px-4 hover: hover: text-bone font-bold text-xs   flex items-center justify-center gap-2 transition-none cursor-pointer disabled:opacity-40"
                >
                  <span className="text-amber font-bold font-mono">[ DL ]</span>
                  Download Procedural MCQ .apkg ({selectedArchetypes.length})
                </button>
                <button
                  onClick={handleDownloadProceduralTxt}
                  disabled={selectedArchetypes.length === 0}
                  className="py-3 px-4 bg-deck hover:bg-steel border border-steel text-bone font-bold text-xs flex items-center justify-center gap-2 transition-none cursor-pointer disabled:opacity-40"
                >
                  <span className="text-amber font-bold font-mono">[ FILE ]</span>
                  Download Procedural .txt (Anki Import)
                </button>
              </div>
            </div>
          )}

          {/* TAB: FSRS Card Audit */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div className="p-4 bg-amber/30 border border-amber/30 text-xs text-amber leading-relaxed space-y-2">
                <div className="font-bold text-amber flex items-center gap-2">
                  <span className="text-amber font-bold font-mono">[ ! ]</span>
                  FSRS Card Audit : {audit.length} card{audit.length === 1 ? '' : 's'} flagged
                </div>
                <p>
                  Dense cloze sentences become <b className="text-amber">D=10 leeches</b> in FSRS, and ambiguous cues
                  force you to guess instead of recall. Fix them before exporting for cleaner spaced-repetition.
                </p>
              </div>

              {audit.length === 0 ? (
                <div className="p-6 bg-amber950/30 border border-amber/30 text-xs text-amber200 flex items-center gap-3">
                  <span className="text-amber font-bold font-mono">[ OK ]</span>
                  <span>
                    <b className="text-amber300">All clear.</b> No too-long or ambiguous cloze cards detected. Your deck is FSRS-ready.
                  </span>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {audit.map(({ card: c, issues }) => (
                    <div key={c.id} className="p-3 bg-deck/60 border border-steel text-xs space-y-2">
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
                              issue.kind === 'ambiguous' ? 'text-hazard300' : 'text-amber'
                            }`}
                          >
                            <span className="text-amber font-bold font-mono">[ ! ]</span>
                            <span>{issue.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-steel bg-chassis flex items-center justify-between text-xs text-solder">
          <span>SuperMemo SM-2 & Cloze Deletion Standard</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-steel hover:bg-steel text-bone font-bold transition-none cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
