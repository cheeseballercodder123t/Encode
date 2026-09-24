'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
    icon: 'PT-20',
    mode: 'memorization',
    notes: 'Periodic Table of Elements (Period 1 to 4): Hydrogen, Helium, Lithium, Beryllium, Boron, Carbon, Nitrogen, Oxygen, Fluorine, Neon, Sodium, Magnesium, Aluminum, Silicon, Phosphorus, Sulfur, Chlorine, Argon, Potassium, Calcium. Focus on symbols, atomic numbers, and group properties.'
  },
  {
    id: 'bio',
    title: 'Biology: Action Potentials',
    icon: 'BIO-01',
    mode: 'conceptual',
    notes: 'Neurobiology: The Action Potential. Resting membrane potential (-70mV) maintained by Na+/K+ ATPase pump. Stimulus reaches threshold (-55mV), triggering voltage-gated Na+ channels to rapidly open, causing sharp depolarization to +30mV. Voltage-gated K+ channels then open while Na+ gates inactivate, causing repolarization and transient hyperpolarization.'
  },
  {
    id: 'cs',
    title: 'CS: TCP 3-Way Handshake',
    icon: 'CS-03',
    mode: 'conceptual',
    notes: 'Computer Networking: TCP 3-Way Handshake & Congestion Control. Client sends SYN with random sequence number. Server responds with SYN-ACK acknowledging client ISN. Client replies with ACK. AIMD (Additive Increase, Multiplicative Decrease) increases window by 1 MSS per RTT, and halves window on packet drop.'
  },
  {
    id: 'pharma',
    title: 'Pharma: Autonomic Drugs',
    icon: 'RX-04',
    mode: 'memorization',
    notes: 'Autonomic Pharmacology: Cholinergic vs Adrenergic Receptor Agonists & Antagonists. Muscarinic M1, M2, M3 receptors. Nicotinic Nm and Nn receptors. Adrenergic Alpha-1, Alpha-2, Beta-1, Beta-2, Beta-3 receptor locations, second messengers, and clinical indications (Epinephrine, Norepinephrine, Atropine, Albuterol, Propranolol).'
  },
  {
    id: 'fin',
    title: 'Finance: Compound Interest',
    icon: 'FIN-05',
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
  onTeach: () => void;
  isLoading: boolean;
}

/** One segmented control row. Replaces the old 9-tab bracket buttons. */
function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex bg-inset border border-edge rounded-md p-0.5"
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => {
              playSound('click');
              onChange(opt.value);
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-[5px] transition-colors duration-150 cursor-pointer whitespace-nowrap ${
              active
                ? 'bg-amber-500 text-inset font-semibold shadow-panel'
                : 'text-slate-ink hover:text-bone'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
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
  onTeach,
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
    notes.trim().length > 0 ||
    !!selectedFile ||
    (sourceType === 'youtube' && youtubeUrl.trim().length > 0);

  const wordCount = notes.trim() ? notes.trim().split(/\s+/).length : 0;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-5">
      {/* Command center */}
      <div className="bg-deck border border-edge rounded-lg shadow-panel overflow-hidden">
        {/* Header: source + mode */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-edge">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-solder">
              Source
            </span>
            <SegmentedControl
              ariaLabel="Input source"
              value={sourceType}
              onChange={(t) => setSourceType(t)}
              options={[
                { value: 'text', label: 'Notes' },
                { value: 'file', label: 'PDF / Image' },
                { value: 'youtube', label: 'YouTube URL' },
              ]}
            />
          </div>

          {/* Mode switch: readable two-state control */}
          <div
            role="group"
            aria-label="Learning mode"
            className="inline-flex bg-inset border border-edge rounded-md p-0.5"
          >
            {([
              { v: 'conceptual' as EncodingMode, label: 'Conceptual' },
              { v: 'memorization' as EncodingMode, label: 'Mnemonic' },
            ]).map(({ v, label }) => {
              const active = mode === v;
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={active}
                  title={v === 'memorization' ? 'Chunking + mnemonic pegs for lists and taxonomies' : 'First-principles causal encoding for mechanisms'}
                  onClick={() => {
                    playSound('pop');
                    setMode(v);
                  }}
                  className={`px-3 py-1.5 text-xs rounded-[5px] transition-colors duration-150 cursor-pointer ${
                    active
                      ? 'bg-deck text-amber-300 font-semibold shadow-panel border border-amber-500/30'
                      : 'text-slate-ink hover:text-bone'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Input body */}
        <div className="p-4 space-y-3">
          {sourceType !== 'youtube' && (
            <div className="space-y-2.5">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Paste study material, complex concepts, or lists to encode (e.g. Periodic Table, action potentials, Krebs cycle)... Optional when a file is attached — your notes steer what the encoder pulls from the file."
                rows={6}
                aria-label="Study notes (optional when a file is attached)"
                className="w-full bg-inset border border-edge focus:border-amber-500/60 text-sm text-bone placeholder-solder focus:outline-none resize-y rounded-md leading-relaxed p-3.5 font-sans transition-colors duration-150"
              />
              <FileUploader
                onFileLoaded={onFileLoaded}
                selectedFile={selectedFile}
                compact={sourceType === 'text'}
              />
            </div>
          )}

          {sourceType === 'youtube' && (
            <div className="py-1 space-y-2">
              <input
                type="url"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=... (Paste lecture or educational video)"
                aria-label="YouTube video URL"
                className="w-full px-3.5 py-2.5 bg-inset border border-edge focus:border-amber-500/60 text-sm text-bone placeholder-solder focus:outline-none rounded-md font-mono transition-colors duration-150"
              />
              <p className="text-[11px] text-solder">
                Extracts key moments and transcripts, then turns lecture checkpoints into active Feynman drills.
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
              className="overflow-hidden"
            >
              <div className="mx-4 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 bg-hazard-950/40 border border-hazard-500/40 rounded-md">
                <div className="text-sm">
                  <span className="font-semibold text-hazard-300">Memorization material detected. </span>
                  <span className="text-slate-ink">Switch to Mnemonic mode for high-yield pegs &amp; chunking?</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMode('memorization');
                    playSound('success');
                  }}
                  className="px-3 py-1.5 bg-hazard-500 hover:bg-hazard-400 text-inset text-xs font-semibold rounded-md transition-colors duration-150 cursor-pointer whitespace-nowrap self-start sm:self-auto"
                >
                  Switch to Mnemonic
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-edge bg-inset/60">
          {/* Progressive disclosure toggle */}
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            aria-expanded={showSettings}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-ink hover:text-bone rounded-md border border-transparent hover:border-edge transition-colors duration-150 cursor-pointer"
          >
            <span>Tuning</span>
            {activeSettingsCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-amber-500/15 text-amber-300 text-[10px] font-semibold rounded-full border border-amber-500/30">
                {activeSettingsCount}
              </span>
            )}
            <span className="text-solder" aria-hidden>{showSettings ? '−' : '+'}</span>
          </button>

          <div className="flex items-center gap-2.5">
            {wordCount > 0 && (
              <span className="hidden sm:inline text-[11px] font-mono text-solder" aria-label={`${wordCount} words`}>
                {wordCount.toLocaleString()} words
              </span>
            )}
            <button
              type="button"
              onClick={onTeach}
              disabled={!hasContent}
              className="px-4 py-2.5 bg-transparent border border-flux-500/50 text-flux-300 hover:bg-flux-500/10 text-sm font-medium rounded-md transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title="Teach Me: Brilliant-style interactive lesson that teaches the concept, then walks a problem step-by-step"
            >
              Teach me first
            </button>
            <button
              type="button"
              onClick={onGenerate}
              disabled={!hasContent || isLoading}
              className="px-5 py-2.5 bg-amber-500 border border-amber-500 hover:bg-amber-400 hover:border-amber-400 text-inset text-sm font-semibold rounded-md shadow-panel transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {isLoading ? 'Encoding…' : 'Build cognitive schema'}
            </button>
          </div>
        </div>

        {/* Collapsible Tuning Drawer */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="border-t border-edge overflow-hidden"
            >
              <div className="px-4 py-4 space-y-3 bg-inset/40">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-solder">
                  Cognitive science modules
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {([
                    {
                      on: enableDeepResearch,
                      toggle: () => setEnableDeepResearch(!enableDeepResearch),
                      title: 'Deep Research',
                      desc: 'Detects & fetches omitted prerequisites',
                    },
                    {
                      on: enableGuidedPath,
                      toggle: () => setEnableGuidedPath(!enableGuidedPath),
                      title: "Miller's 7±2 Guided Path",
                      desc: 'Decomposes text into unlocked milestones',
                    },
                    {
                      on: interleaveMode,
                      toggle: () => setInterleaveMode(!interleaveMode),
                      title: 'Interleaving',
                      desc: 'Alternates conceptual & rote templates',
                    },
                  ] as const).map((m) => (
                    <button
                      key={m.title}
                      type="button"
                      onClick={m.toggle}
                      aria-pressed={m.on}
                      className={`p-3 text-left rounded-md border transition-colors duration-150 cursor-pointer ${
                        m.on
                          ? 'bg-amber-500/10 border-amber-500/50'
                          : 'bg-deck border-edge hover:border-slate-ink/40'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className={`text-sm font-semibold ${m.on ? 'text-amber-300' : 'text-bone'}`}>
                          {m.title}
                        </span>
                        <span
                          aria-hidden
                          className={`shrink-0 w-7 h-4 rounded-full relative transition-colors duration-150 ${
                            m.on ? 'bg-amber-500' : 'bg-edge'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 w-3 h-3 rounded-full bg-inset transition-all duration-150 ${
                              m.on ? 'left-3.5' : 'left-0.5'
                            }`}
                          />
                        </span>
                      </span>
                      <span className="text-[11px] text-solder block mt-1 leading-snug">
                        {m.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Quick-start presets */}
      <div className="flex items-center gap-2 overflow-x-auto py-1 px-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-solder whitespace-nowrap">
          Quick start:
        </span>
        {LAUNCHPAD_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => handleApplyPreset(p)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-edge bg-deck text-slate-ink text-xs rounded-full whitespace-nowrap transition-colors duration-150 hover:text-bone hover:border-slate-ink/50 cursor-pointer"
          >
            <span className="font-mono text-[10px] text-amber-300 font-semibold">{p.icon}</span>
            <span>{p.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
