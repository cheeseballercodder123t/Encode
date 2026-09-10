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
    (sourceType === 'text' && notes.trim().length > 0) ||
    (sourceType === 'file' && !!selectedFile) ||
    (sourceType === 'youtube' && youtubeUrl.trim().length > 0);

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4">
      {/* Unified Command Center Container */}
      <div className="relative bg-deck border border-steel focus-within:border-amber transition-none">
        
        {/* Top Header: Source Cassette Bay & Mode Rocker */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-steel bg-chassis">
          {/* Source Cassette Bay Tabs */}
          <div className="flex items-center">
            <span className="text-[10px] font-mono font-bold text-solder uppercase tracking-wider mr-1.5">
              SOURCE:
            </span>
            <button
              type="button"
              onClick={() => setSourceType('text')}
              className={`px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider border transition-none cursor-pointer ${
                sourceType === 'text'
                  ? 'bg-amber border-amber text-chassis'
                  : 'bg-deck border-steel text-solder'
              }`}
            >
              01:NOTES
            </button>
            <span className="text-steel font-mono text-[10px]">|</span>
            <button
              type="button"
              onClick={() => setSourceType('file')}
              className={`px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider border transition-none cursor-pointer ${
                sourceType === 'file'
                  ? 'bg-amber border-amber text-chassis'
                  : 'bg-deck border-steel text-solder'
              }`}
            >
              02:PDF
            </button>
            <span className="text-steel font-mono text-[10px]">|</span>
            <button
              type="button"
              onClick={() => setSourceType('youtube')}
              className={`px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider border transition-none cursor-pointer ${
                sourceType === 'youtube'
                  ? 'bg-amber border-amber text-chassis'
                  : 'bg-deck border-steel text-solder'
              }`}
            >
              03:YOUTUBE URL
            </button>
          </div>

          {/* Mode Rocker */}
          <button
            type="button"
            onClick={() => {
              playSound('pop');
              setMode(mode === 'conceptual' ? 'memorization' : 'conceptual');
            }}
            className={`px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider border transition-none cursor-pointer ${
              mode === 'conceptual'
                ? 'bg-deck border-steel text-bone'
                : 'bg-amber border-amber text-chassis'
            }`}
            title="Click to switch learning mode"
          >
            [ MODE: {mode === 'conceptual' ? 'DEEP CONCEPTUAL' : 'MNEMONIC'} ]
          </button>
        </div>

        {/* Input Body */}
        <div className="p-4">
          {sourceType === 'text' && (
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Paste study material, complex concepts, or lists to encode (e.g. Periodic Table, action potentials, Krebs cycle)..."
              rows={5}
              className="w-full bg-chassis border border-steel focus:border-amber text-xs text-bone placeholder-solder focus:outline-none resize-none font-mono leading-relaxed p-3 transition-none"
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
                className="w-full px-3 py-2.5 bg-chassis border border-steel focus:border-amber text-xs text-bone placeholder-solder focus:outline-none font-mono transition-none"
              />
              <p className="text-[10px] font-mono text-solder">
                // EXTRACTS KEY MOMENTS, TRANSCRIPTS, AND TURNS LECTURE CHECKPOINTS INTO ACTIVE FEYNMAN DRILLS.
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
              <div className="flex items-center justify-between gap-2 p-2.5 bg-deck border border-hazard text-xs">
                <div className="flex items-center gap-2 text-bone font-mono">
                  <span className="text-[10px] font-bold text-hazard uppercase tracking-wider whitespace-nowrap">
                    [ MNEMONIC TRIGGER ]
                  </span>
                  <span className="text-solder">List / memorization material detected. Switch to Mnemonic Mode for high-yield pegs & chunking?</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMode('memorization');
                    playSound('success');
                  }}
                  className="px-2.5 py-1 bg-amber border border-amber text-chassis text-[10px] font-mono font-bold uppercase tracking-wider transition-none cursor-pointer whitespace-nowrap"
                >
                  [ SWITCH: MNEMONIC ]
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom Action Strip */}
        <div className="flex items-center justify-between px-3 py-2.5 border-t border-steel bg-chassis">
          {/* Progressive Disclosure Toggle */}
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-solder border border-transparent hover:border-steel hover:text-bone transition-none cursor-pointer"
          >
            <span>[ STUDIO TUNING{activeSettingsCount > 0 ? `: ${activeSettingsCount}/3` : ''} {showSettings ? '-' : '+'} ]</span>
          </button>

          {/* Primary Action Button */}
          <button
            type="button"
            onClick={onTeach}
            disabled={!hasContent}
            className="flex items-center gap-2 px-4 py-2.5 bg-chassis border border-amber text-amber text-xs font-mono font-bold uppercase tracking-wider transition-none disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer hover:bg-amber hover:text-chassis"
            title="Teach Me: Brilliant-style interactive lesson that teaches the concept, then walks a problem step-by-step"
          >
            <span>[ TEACH ME ]</span>
          </button>
          <button
            type="button"
            onClick={onGenerate}
            disabled={!hasContent || isLoading}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber border border-amber text-chassis text-xs font-mono font-bold uppercase tracking-wider transition-none disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isLoading ? (
              <span>[ ENCODING... ]</span>
            ) : (
              <span>BUILD COGNITIVE SCHEMA //</span>
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
              className="border-t border-steel bg-deck px-3 py-3 space-y-2 overflow-hidden"
            >
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-solder mb-1">
                // COGNITIVE SCIENCE MODULES
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {/* Deep Research */}
                <button
                  type="button"
                  onClick={() => setEnableDeepResearch(!enableDeepResearch)}
                  className={`p-2.5 text-left border transition-none cursor-pointer ${
                    enableDeepResearch
                      ? 'bg-amber border-amber text-chassis'
                      : 'bg-chassis border-steel text-solder'
                  }`}
                >
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider block">
                    [ DEEP RESEARCH: {enableDeepResearch ? 'ON' : 'OFF'} ]
                  </span>
                  <span className={`text-[10px] font-mono block mt-0.5 ${enableDeepResearch ? 'text-chassis/70' : 'text-solder'}`}>
                    Detects & fetches omitted prerequisites
                  </span>
                </button>

                {/* Miller's Law */}
                <button
                  type="button"
                  onClick={() => setEnableGuidedPath(!enableGuidedPath)}
                  className={`p-2.5 text-left border transition-none cursor-pointer ${
                    enableGuidedPath
                      ? 'bg-amber border-amber text-chassis'
                      : 'bg-chassis border-steel text-solder'
                  }`}
                >
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider block">
                    [ MILLER 7±2: {enableGuidedPath ? 'ON' : 'OFF'} ]
                  </span>
                  <span className={`text-[10px] font-mono block mt-0.5 ${enableGuidedPath ? 'text-chassis/70' : 'text-solder'}`}>
                    Decomposes text into unlocked milestones
                  </span>
                </button>

                {/* Interleaved Switching */}
                <button
                  type="button"
                  onClick={() => setInterleaveMode(!interleaveMode)}
                  className={`p-2.5 text-left border transition-none cursor-pointer ${
                    interleaveMode
                      ? 'bg-amber border-amber text-chassis'
                      : 'bg-chassis border-steel text-solder'
                  }`}
                >
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider block">
                    [ INTERLEAVE: {interleaveMode ? 'ON' : 'OFF'} ]
                  </span>
                  <span className={`text-[10px] font-mono block mt-0.5 ${interleaveMode ? 'text-chassis/70' : 'text-solder'}`}>
                    Alternates conceptual & rote templates
                  </span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Quick Inspiration Cassette Chips */}
      <div className="flex items-center gap-2 overflow-x-auto py-1 px-1">
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-solder whitespace-nowrap">
          // QUICK INSPIRATIONS:
        </span>
        {LAUNCHPAD_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => handleApplyPreset(p)}
            className="flex items-center gap-1.5 px-2.5 py-1 border border-steel bg-chassis text-solder text-[10px] font-mono uppercase tracking-wider whitespace-nowrap transition-none hover:text-bone hover:border-solder cursor-pointer"
          >
            <span className="text-amber font-bold">[ {p.icon} ]</span>
            <span>{p.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}