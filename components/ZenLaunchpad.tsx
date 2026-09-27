'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileUploader } from './FileUploader';
import { FluffGuillotineModal } from './FluffGuillotineModal';
import { UploadedFileAsset, EncodingMode, EncodingGear } from '@/lib/types';
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

/**
 * The three gears, in plain language.
 *
 * Deeper is not better, it is just deeper: the generation effect holds at
 * every gear, so a minute of forging on a drained Thursday keeps the habit and
 * still produces clean cards.
 */
export const GEARS: {
  id: EncodingGear;
  label: string;
  cost: string;
  blurb: string;
  detail: string;
}[] = [
  {
    id: 1,
    label: 'Express Forge',
    cost: 'low energy · about 60s',
    blurb: 'The AI pulls out the mechanism and blanks 2-3 pivotal words. You supply just those.',
    detail:
      'Generating a single missing word buys nearly the same memory boost as writing the whole paragraph (Slamecka & Graf), so this is the full workout with the essay removed.',
  },
  {
    id: 2,
    label: 'Interactive Puzzles',
    cost: 'medium energy',
    blurb: 'Order the causal chain, hunt the planted flaw, separate the lookalike. Click and drag, zero essay.',
    detail:
      'Visual templates and discrimination gates do the retrieval for you: you are spotting and sorting the mechanism instead of describing it.',
  },
  {
    id: 3,
    label: 'Deep Crucible',
    cost: 'high energy',
    blurb: 'Full Feynman, spoken aloud, with an adversarial viva on every claim.',
    detail:
      'For the Sunday-morning session: explain it out loud and defend it. The examiner probes harder and never settles for a label.',
  },
];

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
  gear: EncodingGear;
  setGear: (g: EncodingGear) => void;
  onGenerate: () => void;
  onTeach: () => void;
  isLoading: boolean;
}

/**
 * Small-caps section heading with a short gold tick — a mark, not a rule.
 * (The full-width hairline that used to run to the edge was the single biggest
 * source of the striped look.)
 */
function RailHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center gap-2.5">
      <span className="label-caps">{children}</span>
      <span className="h-px w-6 gilt-rule" aria-hidden />
    </div>
  );
}

/** One segmented control row: source selection and learning mode share it. */
function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  sound = 'click',
}: {
  options: { value: T; label: string; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
  sound?: 'click' | 'pop';
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex bg-inset border border-edge/70 rounded-full p-1"
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            title={opt.title}
            onClick={() => {
              playSound(sound);
              onChange(opt.value);
            }}
            className={`px-3 py-1.5 text-xs rounded-full transition-colors duration-150 cursor-pointer whitespace-nowrap ${
              active
                ? 'bg-gradient-to-b from-amber-400 to-amber-600 text-inset font-semibold shadow-gilt'
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

const MODULES = [
  {
    key: 'deepResearch' as const,
    title: 'Deep research',
    desc: 'Detects and fetches omitted prerequisites',
  },
  {
    key: 'guidedPath' as const,
    title: "Miller's 7±2 guided path",
    desc: 'Decomposes long text into unlocked milestones',
  },
  {
    key: 'interleave' as const,
    title: 'Interleaving',
    desc: 'Alternates conceptual and rote templates',
  },
];

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
  gear,
  setGear,
  onGenerate,
  onTeach,
  isLoading
}: ZenLaunchpadProps) {
  // Fluff Guillotine: pre-encoding semantic triage over the pasted notes.
  const [showTriage, setShowTriage] = useState(false);

  // Smart Mnemonic Auto-Detection
  const detectedMnemonic = useMemo(() => {
    if (!notes.trim() || mode === 'memorization') return false;
    const lower = notes.toLowerCase();
    return MEMORIZATION_TRIGGERS.some(kw => lower.includes(kw));
  }, [notes, mode]);

  const moduleState: Record<(typeof MODULES)[number]['key'], { on: boolean; toggle: () => void }> = {
    deepResearch: { on: enableDeepResearch, toggle: () => setEnableDeepResearch(!enableDeepResearch) },
    guidedPath: { on: enableGuidedPath, toggle: () => setEnableGuidedPath(!enableGuidedPath) },
    interleave: { on: interleaveMode, toggle: () => setInterleaveMode(!interleaveMode) },
  };

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
    <div className="w-full max-w-5xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_19rem] border border-edge/70 bg-deck rounded-2xl overflow-hidden shadow-panel">

        {/* ── Writing surface ───────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-edge/50 px-4 py-3">
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
            <SegmentedControl
              ariaLabel="Learning mode"
              sound="pop"
              value={mode}
              onChange={(m) => setMode(m)}
              options={[
                {
                  value: 'conceptual',
                  label: 'Conceptual',
                  title: 'First-principles causal encoding for mechanisms',
                },
                {
                  value: 'memorization',
                  label: 'Mnemonic',
                  title: 'Chunking plus mnemonic pegs for lists and taxonomies',
                },
              ]}
            />
          </div>

          <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
            {sourceType !== 'youtube' && (
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Paste study material, complex concepts, or lists to encode (e.g. Periodic Table, action potentials, Krebs cycle)... Optional when a file is attached; your notes steer what the encoder pulls from the file."
                rows={8}
                aria-label="Study notes (optional when a file is attached)"
                className="w-full flex-1 min-h-[10rem] bg-inset border border-edge/70 focus:border-amber-500/60 text-sm text-bone placeholder-solder focus:outline-none resize-y rounded-lg leading-relaxed p-4 font-sans transition-colors duration-150 shadow-panel"
              />
            )}

            {sourceType === 'youtube' && (
              <div className="space-y-2">
                <input
                  type="url"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=... (Paste lecture or educational video)"
                  aria-label="YouTube video URL"
                  className="w-full px-4 py-2.5 bg-inset border border-edge/70 focus:border-amber-500/60 text-sm text-bone placeholder-solder focus:outline-none rounded-lg font-mono transition-colors duration-150"
                />
                <p className="text-[11px] text-solder leading-relaxed">
                  Extracts key moments and transcripts, then turns lecture checkpoints into active Feynman drills.
                </p>
              </div>
            )}

            <FileUploader
              onFileLoaded={onFileLoaded}
              selectedFile={selectedFile}
              compact={sourceType === 'text'}
            />

            {/* Mnemonic auto-detection: a note under the source, not a banner. */}
            <AnimatePresence>
              {detectedMnemonic && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-2.5 border border-hazard-500/35 bg-hazard-950/25 p-3.5 sm:flex-row sm:items-center sm:justify-between rounded-lg">
                    <p className="text-[11px] leading-relaxed text-slate-ink">
                      <span className="text-hazard-300 font-semibold">This reads like a list.</span>{' '}
                      Mnemonic mode chunks it and builds pegs instead of chasing a mechanism.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('memorization');
                        playSound('success');
                      }}
                      className="self-start sm:self-auto shrink-0 px-3 py-1.5 border border-hazard-500/50 text-hazard-200 hover:bg-hazard-500/10 text-[11px] rounded-full transition-colors duration-150 cursor-pointer whitespace-nowrap"
                    >
                      Switch to Mnemonic
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Examples: quiet tiles, not pills. */}
            <div className="mt-1">
              <RailHeading>Examples</RailHeading>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {LAUNCHPAD_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleApplyPreset(p)}
                    className="flex items-baseline gap-2.5 px-3 py-2 text-left bg-chassis/60 border border-edge/60 hover:border-gilt/40 hover:bg-white/[0.03] rounded-lg transition-colors duration-150 cursor-pointer"
                  >
                    <span className="font-mono text-[10px] font-semibold text-amber-300 shrink-0">{p.icon}</span>
                    <span className="text-xs text-slate-ink truncate">{p.title}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Actions: left-aligned under the writing surface. */}
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
              {wordCount > 0 && (
                <span
                  className="font-mono text-[11px] text-solder"
                  aria-label={`${wordCount} words`}
                >
                  {wordCount.toLocaleString()} words
                </span>
              )}
              <span className="flex-1" aria-hidden />
              {notes.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    playSound('click');
                    setShowTriage(true);
                  }}
                  className="px-3.5 py-2 border border-edge/70 text-solder hover:text-bone hover:border-hazard-500/50 text-xs rounded-full transition-colors duration-150 cursor-pointer"
                  title="Fluff Guillotine: triage the source into causal kernels, evidence and throat-clearing, then strip the noise before encoding"
                >
                  Strip noise
                </button>
              )}
              <button
                type="button"
                onClick={onTeach}
                disabled={!hasContent}
                className="px-3.5 py-2 border border-flux-500/50 text-flux-300 hover:bg-flux-500/10 text-xs rounded-full transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="Teach Me: interactive lesson that teaches the concept, then walks a problem step-by-step"
              >
                Teach me first
              </button>
              <button
                type="button"
                onClick={onGenerate}
                disabled={!hasContent || isLoading}
                className="px-6 py-2.5 rounded-full bg-gradient-to-b from-amber-400 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-inset text-xs font-semibold shadow-gilt transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none cursor-pointer"
              >
                {isLoading ? 'Encoding…' : 'Build cognitive schema'}
              </button>
            </div>
          </div>
        </div>

        {/* ── Rail: how deep this session goes, and which modules ride along ── */}
        <aside className="flex flex-col border-t border-edge/60 bg-chassis/40 lg:border-t-0 lg:border-l">
          <div className="p-5 border-b border-edge/50">
            <RailHeading>Session depth</RailHeading>
            <div role="group" aria-label="Session depth" className="space-y-1.5">
              {GEARS.map((g) => {
                const active = g.id === gear;
                return (
                  <button
                    key={g.id}
                    type="button"
                    aria-pressed={active}
                    title={g.detail}
                    onClick={() => {
                      playSound('click');
                      setGear(g.id);
                    }}
                    className={`w-full text-left px-3.5 py-3 rounded-xl border transition-colors duration-150 cursor-pointer ${
                      active
                        ? 'border-gilt/40 bg-amber-500/[0.07]'
                        : 'border-transparent hover:bg-white/[0.03]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className={`h-1.5 w-1.5 shrink-0 rotate-45 ${
                          active ? 'bg-amber-400' : 'border border-solder/60'
                        }`}
                      />
                      <span className={`font-mono text-[10px] font-semibold ${active ? 'text-amber-300' : 'text-solder'}`}>
                        G{g.id}
                      </span>
                      <span className={`text-[13px] font-semibold ${active ? 'text-amber-200' : 'text-bone'}`}>
                        {g.label}
                      </span>
                    </span>
                    <span className="mt-1 block pl-4 font-mono text-[10px] text-solder">{g.cost}</span>
                    {active && (
                      <span className="mt-1.5 block pl-4 text-[11px] leading-snug text-slate-ink">
                        {g.blurb}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-5">
            <RailHeading>Tuning</RailHeading>
            <div className="space-y-1.5">
              {MODULES.map((m) => {
                const state = moduleState[m.key];
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={state.toggle}
                    aria-pressed={state.on}
                    title={m.desc}
                    className={`w-full text-left flex items-start gap-3 px-3.5 py-3 rounded-xl border transition-colors duration-150 cursor-pointer ${
                      state.on
                        ? 'border-gilt/35 bg-amber-500/[0.06]'
                        : 'border-transparent hover:bg-white/[0.03]'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`mt-0.5 h-3 w-3 shrink-0 rotate-45 rounded-[2px] border ${
                        state.on
                          ? 'border-amber-400 bg-gradient-to-br from-amber-300 to-amber-600'
                          : 'border-solder/60'
                      }`}
                    />
                    <span className="min-w-0">
                      <span className={`block text-[13px] ${state.on ? 'text-bone font-medium' : 'text-slate-ink'}`}>
                        {m.title}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-snug text-solder">{m.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      </div>

      {/* Fluff Guillotine: heatmap the source, then strip the noise in one tap. */}
      <FluffGuillotineModal
        isOpen={showTriage}
        onClose={() => setShowTriage(false)}
        notes={notes}
        onApply={(cleaned) => {
          if (cleaned.trim()) setNotes(cleaned);
          setShowTriage(false);
        }}
      />
    </div>
  );
}
