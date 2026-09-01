'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Download, 
  Send, 
  Check, 
  X, 
  Sparkles, 
  Zap, 
  Layers, 
  Loader2, 
  AlertCircle, 
  Globe, 
  Calendar, 
  RotateCcw,
  CheckCircle2,
  FileText,
  ExternalLink,
  Cpu
} from 'lucide-react';
import { 
  AnkiCardItem, 
  extractAnkiCardsFromSchema, 
  generateAnkiApkgPackage, 
  generateAnkiTextDeck, 
  syncToAnkiConnect, 
  syncToCustomWebhook, 
  calculateSM2, 
  SM2State 
} from '@/lib/anki-exporter';
import { SavedSchema, SegregationReport } from '@/lib/types';
import { playSound } from '@/lib/audio';

interface AnkiExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  schema?: Partial<SavedSchema> | null;
  report?: SegregationReport | null;
}

export function AnkiExportModal({ isOpen, onClose, schema, report }: AnkiExportModalProps) {
  const [cards, setCards] = useState<AnkiCardItem[]>([]);
  const [deckName, setDeckName] = useState<string>('DeepEncode::Cognitive_Schema');
  const [activeTab, setActiveTab] = useState<'apkg' | 'ankiconnect' | 'webhook' | 'sm2_simulator'>('apkg');
  
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
  const [simState, setSimState] = useState<SM2State>({
    repetitions: 1,
    interval: 1,
    easeFactor: 2.5,
    nextReviewTimestamp: Date.now() + 86400000,
  });

  useEffect(() => {
    if (isOpen) {
      const extracted = extractAnkiCardsFromSchema(schema, report);
      setCards(extracted);
      const title = report?.topic || schema?.topicSummary || 'Cognitive_Schema';
      setDeckName(`DeepEncode::${title.replace(/[^a-zA-Z0-9_]/g, '_')}`);
    }
  }, [isOpen, schema, report]);

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

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-[#0D101D] border border-cyan-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-cyan-950/40 via-slate-900 to-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">Anki & SM-2 Spaced Repetition Exporter</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  {cards.length} Flashcards
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Export Cloze deletion flashcards into Anki or sync via SM-2 Webhooks
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="p-3 border-b border-slate-800 bg-slate-950 flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('apkg')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'apkg'
                ? 'bg-cyan-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Direct .apkg Package</span>
          </button>

          <button
            onClick={() => setActiveTab('ankiconnect')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'ankiconnect'
                ? 'bg-cyan-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-amber-300" />
            <span>AnkiConnect Sync</span>
          </button>

          <button
            onClick={() => setActiveTab('webhook')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'webhook'
                ? 'bg-cyan-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Web-Hook SM-2 Sync</span>
          </button>

          <button
            onClick={() => setActiveTab('sm2_simulator')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'sm2_simulator'
                ? 'bg-cyan-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5 text-emerald-300" />
            <span>SM-2 Scheduler Engine</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* Deck Title Input */}
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-3">
            <span className="text-xs font-bold text-slate-300 shrink-0">Deck Name:</span>
            <input
              type="text"
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-cyan-200 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          {/* TAB 1: Direct .apkg Download */}
          {activeTab === 'apkg' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-500/30 text-xs text-cyan-200 leading-relaxed space-y-2">
                <div className="font-bold text-cyan-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Ready to Export {cards.length} DeepEncode Cloze Flashcards
                </div>
                <p>
                  Downloads a structured Anki package (<code className="text-cyan-300 font-bold">.apkg</code>) pre-configured with Cloze deletion tags, Feynman personal vocabulary, and SM-2 initial scheduling metadata.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={handleDownloadApkg}
                  className="py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Download .apkg Package
                </button>

                <button
                  onClick={handleDownloadTxt}
                  className="py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-cyan-400" />
                  Download Anki .txt (Tab-Separated)
                </button>
              </div>

              {/* Cards Preview */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-400">Card Deck Preview ({cards.length}):</span>
                <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                  {cards.map((c, idx) => (
                    <div key={c.id || idx} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="font-bold text-cyan-300">Card #{idx + 1}</span>
                        <div className="flex gap-1">
                          {c.tags.map((t) => (
                            <span key={t} className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="font-mono text-[11px] text-slate-200" dangerouslySetInnerHTML={{ __html: c.front }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: AnkiConnect Desktop Sync */}
          {activeTab === 'ankiconnect' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/30 text-xs text-amber-200 leading-relaxed space-y-2">
                <div className="font-bold text-amber-300 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-amber-400" />
                  1-Click Local Anki Desktop Integration
                </div>
                <p>
                  Requires Anki Desktop running locally with the <code className="text-amber-300 font-mono">AnkiConnect</code> add-on enabled on port <code className="text-amber-300 font-mono">8765</code>.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 block">AnkiConnect Endpoint URL:</label>
                <input
                  type="text"
                  value={ankiConnectUrl}
                  onChange={(e) => setAnkiConnectUrl(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-cyan-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <button
                onClick={handleSyncAnkiConnect}
                disabled={isSyncingAnkiConnect}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
              >
                {isSyncingAnkiConnect ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Connecting & Pushing to Anki...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Push {cards.length} Cards directly to Anki Desktop
                  </>
                )}
              </button>

              {ankiConnectStatus && (
                <div className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                  ankiConnectStatus.success
                    ? 'bg-emerald-950/40 border border-emerald-500/40 text-emerald-200'
                    : 'bg-red-950/40 border border-red-500/40 text-red-200'
                }`}>
                  {ankiConnectStatus.success ? (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  )}
                  <div className="leading-relaxed">{ankiConnectStatus.message}</div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Webhook SM-2 Sync */}
          {activeTab === 'webhook' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-500/30 text-xs text-indigo-200 leading-relaxed space-y-2">
                <div className="font-bold text-indigo-300 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-indigo-400" />
                  Web-Hook SM-2 Spaced Repetition Dispatcher
                </div>
                <p>
                  Sends the complete active recall card payload along with pre-calculated SM-2 ease factors and review timestamps directly to your server or webhook receiver.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 block">Webhook Receiver Endpoint URL:</label>
                <input
                  type="url"
                  placeholder="https://api.myworkspace.com/v1/anki-sync"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-indigo-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <button
                onClick={handleSyncWebhook}
                disabled={!webhookUrl.trim() || isSyncingWebhook}
                className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
              >
                {isSyncingWebhook ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Dispatching Webhook...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Dispatch SM-2 Card Payload to Webhook
                  </>
                )}
              </button>

              {webhookStatus && (
                <div className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                  webhookStatus.success
                    ? 'bg-emerald-950/40 border border-emerald-500/40 text-emerald-200'
                    : 'bg-red-950/40 border border-red-500/40 text-red-200'
                }`}>
                  {webhookStatus.success ? (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  )}
                  <div className="leading-relaxed">{webhookStatus.message}</div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SM-2 Scheduler Engine Simulator */}
          {activeTab === 'sm2_simulator' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-xs text-emerald-200 leading-relaxed space-y-2">
                <div className="font-bold text-emerald-300 flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-emerald-400" />
                  SuperMemo SM-2 Interval Calculation Engine
                </div>
                <p>
                  Test how recall ratings (Grade 0 through 5) dynamically compute review intervals (<code className="text-emerald-300 font-bold">I(n) = I(n-1) × EF</code>) and ease factors in real-time.
                </p>
              </div>

              {/* Rating Buttons */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-300">Simulate Active Recall Performance Grade:</span>
                <div className="grid grid-cols-6 gap-2">
                  {[0, 1, 2, 3, 4, 5].map((g) => (
                    <button
                      key={g}
                      onClick={() => handleSimulateGrade(g)}
                      className={`py-2 rounded-lg text-xs font-bold transition cursor-pointer border ${
                        simGrade === g
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      Grade {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* SM2 Computed State Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 block text-[11px]">Repetition Count:</span>
                  <span className="font-bold text-white text-base mt-0.5 block">{simState.repetitions}</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 block text-[11px]">Ease Factor (EF):</span>
                  <span className="font-bold text-emerald-400 text-base mt-0.5 block">{simState.easeFactor}</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 block text-[11px]">Review Interval:</span>
                  <span className="font-bold text-cyan-400 text-base mt-0.5 block">{simState.interval} Days</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 block text-[11px]">Next Due Date:</span>
                  <span className="font-bold text-indigo-300 text-xs mt-1 block">
                    {new Date(simState.nextReviewTimestamp).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-400">
          <span>SuperMemo SM-2 & Cloze Deletion Standard</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
