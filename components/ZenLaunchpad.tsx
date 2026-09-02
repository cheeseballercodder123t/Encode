'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  Brain, 
  Hash, 
  SlidersHorizontal, 
  ChevronDown, 
  ChevronUp, 
  FileText, 
  Video, 
  PenTool, 
  ArrowRight, 
  Loader2, 
  Zap,
  Check,
  RotateCcw
} from 'lucide-react';
import { FileUploader } from './FileUploader';
import { UploadedFileAsset, EncodingMode } from '@/lib/types';
import { playSound } from '@/lib/audio';

const MEMORIZATION_TRIGGERS = [
  'periodic table', 'elements', 'amino acid', 'cranial nerve', 'bones', 
  'anatomy', 'drugs', 'pharma', 'acronym', 'mnemonic', 'list of', 
  'strong acids', 'weak acids', 'organic chemistry reactions', 'epochs'
];

export interface PresetItem {
  id: string;
  title: string;
  icon: string;
  mode: EncodingMode;
  notes: string;
}

export const LAUNCHPAD_PRESETS: PresetItem[] = [
  {
    id: 'ptable',
    title: 'Periodic Table (First 20)',
    icon: '🧪',
    mode: 'memorization',
    notes: 'Periodic Table of Elements (Period 1 to 4): Hydrogen, Helium, Lithium, Beryllium, Boron, Carbon, Nitrogen, Oxygen, Fluorine, Neon, Sodium, Magnesium, Aluminum, Silicon, Phosphorus, Sulfur, Chlorine, Argon, Potassium, Calcium. Focus on symbols, atomic numbers, and group properties.'
  },
  {
    id: 'bio',
    title: 'Biology: Action Potentials',
    icon: '⚡',
    mode: 'conceptual',
    notes: 'Neurobiology: The Action Potential. Resting membrane potential (-70mV) maintained by Na+/K+ ATPase pump. Stimulus reaches threshold (-55mV), triggering voltage-gated Na+ channels to rapidly open, causing sharp depolarization to +30mV. Voltage-gated K+ channels then open while Na+ gates inactivate, causing repolarization and transient hyperpolarization.'
  },
  {
    id: 'cs',
    title: 'CS: TCP 3-Way Handshake',
    icon: '🌐',
    mode: 'conceptual',
    notes: 'Computer Networking: TCP 3-Way Handshake & Congestion Control. Client sends SYN with random sequence number. Server responds with SYN-ACK acknowledging client ISN. Client replies with ACK. AIMD (Additive Increase, Multiplicative Decrease) increases window by 1 MSS per RTT, and halves window on packet drop.'
  },
  {
    id: 'pharma',
    title: 'Pharma: Autonomic Drugs',
    icon: '💊',
    mode: 'memorization',
    notes: 'Autonomic Pharmacology: Cholinergic vs Adrenergic Receptor Agonists & Antagonists. Muscarinic M1, M2, M3 receptors. Nicotinic Nm and Nn receptors. Adrenergic Alpha-1, Alpha-2, Beta-1, Beta-2, Beta-3 receptor locations, second messengers, and clinical indications (Epinephrine, Norepinephrine, Atropine, Albuterol, Propranolol).'
  },
  {
    id: 'fin',
    title: 'Finance: Compound Interest',
    icon: '📈',
    mode: 'conceptual',
    notes: 'Quantitative Finance: Continuous Compounding & Time Value of Money. As the compounding frequency n approaches infinity in A = P(1 + r/n)^(nt), the formula converges to A = Pe^(rt). Risk-free discounting and the Sharpe ratio as risk-adjusted excess returns over standard deviation.'
  }
];

interface ZenLaunchpadProps {
  notes: string;
  setNotes: (val: string) => void;
  mode: EncodingMode;
  setMode: (mode: EncodingMode) => void;
  sourceType: 'text' | 'file' | 'youtube';
  setSourceType: (type: 'text' | 'file' | 'youtube') => void;
  selectedFile: UploadedFileAsset | null;
  onFileLoaded: (file: UploadedFileAsset | null) => void;
  youtubeUrl: string;
  setYoutubeUrl: (url: string) => void;
  enableDeepResearch: boolean;
  setEnableDeepResearch: (val: boolean) => void;
  enableGuidedPath: boolean;
  setEnableGuidedPath: (val: boolean) => void;
  interleaveMode: boolean;
  setInterleaveMode: (val: boolean) => void;
  onGenerate: () => void;
  isLoading: boolean;
}

export function ZenLaunchpad({
  notes,
  setNotes,
  mode,
  setMode,
  sourceType,
  setSourceType,
  selectedFile,
  onFileLoaded,
  youtubeUrl,
  setYoutubeUrl,
  enableDeepResearch,
  setEnableDeepResearch,
  enableGuidedPath,
  setEnableGuidedPath,
  interleaveMode,
  setInterleaveMode,
  onGenerate,
  isLoading
}: ZenLaunchpadProps) {
  const [showSettings, setShowSettings] = useState(false);

  // Smart Mnemonic Auto-Detection
  const detectedMnemonic = useMemo(() => {
    if (!notes.trim() || mode === 'memorization') return false;
    const lower = notes.toLowerCase();
    return MEMORIZATION_TRIGGERS.some(kw => lower.includes(kw));
  }, [notes, mode]);

  const activeSettingsCount = [enableDeepResearch, enableGuidedPath, interleaveMode].filter(Boolean).length;

  const handleApplyPreset = (preset: PresetItem) => {
    playSound('click');
    setSourceType('text');
    setMode(preset.mode);
    setNotes(preset.notes);
  };

  const hasContent = 
    (sourceType === 'text' && notes.trim().length > 0) ||
    (sourceType === 'file' && !!selectedFile) ||
    (sourceType === 'youtube' && youtubeUrl.trim().length > 0);

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4">
      {/* Unified Command Center Container */}
      <div className="relative rounded-2xl bg-gradient-to-b from-[#121524] to-[#0A0C16] border border-slate-800/90 shadow-2xl shadow-indigo-950/20 focus-within:border-indigo-500/50 focus-within:ring-2 focus-within:ring-indigo-500/10 transition-all">
        
        {/* Top Header: Source Selector & Mode Pill */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/80 bg-slate-900/40 rounded-t-2xl">
          {/* Source Tabs */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSourceType('text')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                sourceType === 'text'
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>Notes / Text</span>
            </button>

            <button
              type="button"
              onClick={() => setSourceType('file')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                sourceType === 'file'
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>PDF / Slides</span>
            </button>

            <button
              type="button"
              onClick={() => setSourceType('youtube')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                sourceType === 'youtube'
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>YouTube URL</span>
            </button>
          </div>

          {/* Mode Switcher Pill */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                playSound('pop');
                setMode(mode === 'conceptual' ? 'memorization' : 'conceptual');
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
                mode === 'conceptual'
                  ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/25'
                  : 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
              }`}
              title="Click to switch learning mode"
            >
              {mode === 'conceptual' ? (
                <>
                  <Brain className="w-3 h-3 text-indigo-400" />
                  <span>Deep Conceptual Mode</span>
                </>
              ) : (
                <>
                  <Hash className="w-3 h-3 text-amber-400" />
                  <span>Mnemonic Memorization</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Input Body */}
        <div className="p-4">
          {sourceType === 'text' && (
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Paste study material, complex concepts, or lists to encode (e.g. Periodic Table, action potentials, Krebs cycle)..."
              rows={5}
              className="w-full bg-transparent border-0 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-0 resize-none font-sans leading-relaxed"
            />
          )}

          {sourceType === 'file' && (
            <div className="py-2">
              <FileUploader onFileLoaded={onFileLoaded} selectedFile={selectedFile} />
            </div>
          )}

          {sourceType === 'youtube' && (
            <div className="py-2 space-y-2">
              <input
                type="url"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=... (Paste lecture or educational video)"
                className="w-full px-4 py-3 rounded-xl bg-slate-900/90 border border-slate-700/80 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[11px] text-slate-500">
                Extracts key moments, transcripts, and turns lecture checkpoints into active Feynman drills.
              </p>
            </div>
          )}
        </div>

        {/* Smart Mnemonic Detection Alert */}
        <AnimatePresence>
          {detectedMnemonic && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-4 pb-3"
            >
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs">
                <div className="flex items-center gap-2 text-amber-300">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>List / Memorization material detected. Switch to Mnemonic Mode for high-yield pegs & chunking?</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMode('memorization');
                    playSound('success');
                  }}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-[11px] font-bold transition-colors cursor-pointer"
                >
                  Switch to Mnemonic Mode
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom Action Strip */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800/80 bg-slate-950/60 rounded-b-2xl">
          {/* Progressive Disclosure Toggle */}
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
            <span>Studio Tuning</span>
            {activeSettingsCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold flex items-center justify-center">
                {activeSettingsCount}
              </span>
            )}
            {showSettings ? <ChevronUp className="w-3.5 h-3.5 ml-0.5" /> : <ChevronDown className="w-3.5 h-3.5 ml-0.5" />}
          </button>

          {/* Primary Action Button */}
          <button
            type="button"
            onClick={onGenerate}
            disabled={!hasContent || isLoading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Encoding Schema...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-indigo-200" />
                <span>Build Cognitive Schema</span>
                <ArrowRight className="w-4 h-4 text-indigo-200" />
              </>
            )}
          </button>
        </div>

        {/* Collapsible Studio Tuning Drawer */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="border-t border-slate-800 bg-[#0E101D] px-4 py-3 space-y-2 rounded-b-2xl overflow-hidden"
            >
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Cognitive Science Modules
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {/* Deep Research */}
                <button
                  type="button"
                  onClick={() => setEnableDeepResearch(!enableDeepResearch)}
                  className={`flex items-start gap-2 p-2.5 rounded-xl text-left border transition-all ${
                    enableDeepResearch
                      ? 'bg-indigo-950/40 border-indigo-500/50 text-indigo-200'
                      : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:bg-slate-900/80'
                  }`}
                >
                  <div className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center border ${
                    enableDeepResearch ? 'bg-indigo-600 border-indigo-400 text-white' : 'border-slate-700'
                  }`}>
                    {enableDeepResearch && <Check className="w-3 h-3" />}
                  </div>
                  <div>
                    <span className="text-xs font-bold block">Deep Research</span>
                    <span className="text-[10px] text-slate-400">Detects & fetches omitted prerequisites</span>
                  </div>
                </button>

                {/* Miller's Law */}
                <button
                  type="button"
                  onClick={() => setEnableGuidedPath(!enableGuidedPath)}
                  className={`flex items-start gap-2 p-2.5 rounded-xl text-left border transition-all ${
                    enableGuidedPath
                      ? 'bg-indigo-950/40 border-indigo-500/50 text-indigo-200'
                      : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:bg-slate-900/80'
                  }`}
                >
                  <div className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center border ${
                    enableGuidedPath ? 'bg-indigo-600 border-indigo-400 text-white' : 'border-slate-700'
                  }`}>
                    {enableGuidedPath && <Check className="w-3 h-3" />}
                  </div>
                  <div>
                    <span className="text-xs font-bold block">Miller's 7±2 Chunking</span>
                    <span className="text-[10px] text-slate-400">Decomposes text into unlocked milestones</span>
                  </div>
                </button>

                {/* Interleaved Switching */}
                <button
                  type="button"
                  onClick={() => setInterleaveMode(!interleaveMode)}
                  className={`flex items-start gap-2 p-2.5 rounded-xl text-left border transition-all ${
                    interleaveMode
                      ? 'bg-indigo-950/40 border-indigo-500/50 text-indigo-200'
                      : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:bg-slate-900/80'
                  }`}
                >
                  <div className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center border ${
                    interleaveMode ? 'bg-indigo-600 border-indigo-400 text-white' : 'border-slate-700'
                  }`}>
                    {interleaveMode && <Check className="w-3 h-3" />}
                  </div>
                  <div>
                    <span className="text-xs font-bold block">Interleaved Switching</span>
                    <span className="text-[10px] text-slate-400">Alternates conceptual & rote templates</span>
                  </div>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Floating Inspiration Chips */}
      <div className="flex items-center gap-2 overflow-x-auto py-1 px-1 scrollbar-none">
        <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">
          Quick Inspirations:
        </span>
        {LAUNCHPAD_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => handleApplyPreset(p)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs font-medium whitespace-nowrap transition-all cursor-pointer active:scale-95"
          >
            <span>{p.icon}</span>
            <span>{p.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}