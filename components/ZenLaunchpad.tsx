'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileUploader } from './FileUploader';
import { FluffGuillotineModal } from './FluffGuillotineModal';
import { UploadedFileAsset, EncodingMode, EncodingGear } from '@/lib/types';
import { playSound } from '@/lib/audio';
import { parseSlideDeck } from '@/lib/services/slide-deck-parser';
import { TOY_EXAMPLES } from '@/lib/toy-models/examples';
import { BrandStar } from './BrandMark';

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
  /** Flashcards Only: sources in, deck out — no workout, no stages. */
  onForge: () => void;
  isLoading: boolean;
  onTryToyExample: (id: string) => void;
  /** Optional hands-on pathway/circuit builder entry beside the toy labs. */
  onTryPathwayBuilder?: () => void;
  /**
   * Optional question-first cockpit entry. Sits in the action row rather than
   * the lab rail because it needs no source: an interrogation starts from a
   * sentence the learner already believes.
   */
  onOpenInquisitor?: () => void;
  /**
   * Optional timed-crucible entry. Like the inquisitor it needs no source — a
   * sprint is timed against a topic, and the topic can come from the field
   * above or be named inside the sheet.
   */
  onOpenCrucible?: () => void;
  /** Optional emergency-triage entry, for the night everything is due at once. */
  onOpenTriage?: () => void;
  /** Don't accept server-rendered control clicks before state hydration. */
  ready: boolean;
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
      className="studio-segment inline-flex bg-inset border border-edge/70 rounded-full p-1"
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
  onForge,
  onTryToyExample,
  onTryPathwayBuilder,
  onOpenInquisitor,
  onOpenCrucible,
  onOpenTriage,
  ready,
  isLoading
}: ZenLaunchpadProps) {
  // Fluff Guillotine: pre-encoding semantic triage over the pasted notes.
  const [showTriage, setShowTriage] = useState(false);
  const [showSlideTray, setShowSlideTray] = useState(false);

  // Smart Mnemonic Auto-Detection
  const detectedMnemonic = useMemo(() => {
    if (!notes.trim() || mode === 'memorization') return false;
    const lower = notes.toLowerCase();
    return MEMORIZATION_TRIGGERS.some(kw => lower.includes(kw));
  }, [notes, mode]);

  // Smart Slide Deck Auto-Detection & Segmentation
  const parsedSlideDeck = useMemo(() => {
    return parseSlideDeck(notes);
  }, [notes]);

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

  const hasContent = sourceType === 'youtube'
    ? youtubeUrl.trim().length > 0
    : notes.trim().length > 0 || !!selectedFile;

  const wordCount = notes.trim() ? notes.trim().split(/\s+/).length : 0;

  return (
    <div className="studio-launchpad w-full mx-auto" inert={!ready} aria-busy={!ready}>
      <div className="studio-section-heading">
        <div><span className="studio-section-index">01 /</span><h3>Your encoding workbench</h3></div>
        <span className="studio-heading-leader" aria-hidden />
        <span className="studio-section-note">YOUR MATERIAL. YOUR PACE. YOUR AHA.</span>
      </div>
      <div className="studio-console grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] border border-edge/70 bg-deck overflow-hidden shadow-panel">
        {/* The console spends both of its pseudo-elements on corner brackets,
            so the travelling gilt rides a child of its own. Decorative only. */}
        <span className="leaf-frame" aria-hidden />

        {/* ── Writing surface ───────────────────────────────────────────── */}
        <div className="studio-writing-surface flex min-w-0 flex-col">
          <div className="studio-source-bar flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-edge/50 px-5 py-4">
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

          <div className="studio-source-body flex flex-1 flex-col gap-3 p-5 sm:p-6">
            <div className="studio-source-label">
              <label htmlFor={sourceType === 'youtube' ? 'studio-video' : 'studio-notes'}>
                {sourceType === 'youtube' ? 'A lecture worth understanding' : 'What are we making sense of today?'}
              </label>
              <span>{sourceType === 'youtube' ? 'VIDEO INPUT' : 'SOURCE INPUT'}</span>
            </div>
            {sourceType !== 'youtube' && (
              <textarea
                id="studio-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Paste study material, complex concepts, or lists to encode (e.g. Periodic Table, action potentials, Krebs cycle)... Optional when a file is attached; your notes steer what the encoder pulls from the file."
                rows={8}
                aria-label="Study notes (optional when a file is attached)"
                className="studio-notes w-full flex-1 min-h-[13rem] bg-inset border border-edge/70 focus:border-amber-500/60 text-sm text-bone placeholder-solder focus:outline-none resize-y leading-relaxed p-5 font-sans transition-colors duration-150"
              />
            )}

            {sourceType === 'youtube' && (
              <div className="space-y-2">
                <input
                  id="studio-video"
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

            {/* Slide Deck auto-detection: provides 1-click Express Forge shortcut */}
            <AnimatePresence>
              {parsedSlideDeck.isSlideDeck && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-2.5 border border-amber-500/40 bg-amber-950/20 p-3.5 rounded-lg">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                      <p className="text-[11px] leading-relaxed text-slate-ink">
                        <span className="text-amber-300 font-semibold">
                          ⚡ Lecture Deck Detected ({parsedSlideDeck.slides.length} slides
                          {parsedSlideDeck.fluffSlidesCount > 0
                            ? ` · ${parsedSlideDeck.contentSlidesCount} content, ${parsedSlideDeck.fluffSlidesCount} admin`
                            : ''}
                          {parsedSlideDeck.presentationTitle ? ` · ${parsedSlideDeck.presentationTitle}` : ''}).
                        </span>{' '}
                        DeepEncode segments every slide to forge atomic cards without quality loss.
                      </p>
                      <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            playSound('click');
                            setShowSlideTray((v) => !v);
                          }}
                          className="px-2.5 py-1.5 border border-edge/60 hover:border-amber-500/50 text-[11px] font-mono text-solder hover:text-bone rounded-full transition-colors duration-150 cursor-pointer"
                        >
                          {showSlideTray ? 'Hide Slides' : 'Inspect Slides'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            playSound('pop');
                            onForge();
                          }}
                          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-inset font-bold text-[11px] rounded-full transition-colors duration-150 cursor-pointer whitespace-nowrap shadow-gilt"
                        >
                          1-Click Anki Forge ({parsedSlideDeck.contentSlidesCount > 0 ? `${parsedSlideDeck.contentSlidesCount} Content Slides` : `${parsedSlideDeck.slides.length} Slides`})
                        </button>
                      </div>
                    </div>

                    {showSlideTray && (
                      <div className="pt-2 border-t border-edge/40 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {parsedSlideDeck.slides.map((s) => (
                          <div
                            key={s.slideNumber}
                            className="flex items-center gap-2 px-2.5 py-1.5 bg-deck/80 border border-edge/40 rounded text-[11px] font-mono"
                          >
                            <span
                              className={`shrink-0 px-1.5 py-0.5 text-[9px] font-bold rounded ${
                                s.isLikelyFluff
                                  ? 'bg-hazard-950/60 text-hazard-300 border border-hazard-500/30'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {s.isLikelyFluff ? s.fluffReason || 'ADMIN' : 'CONTENT'}
                            </span>
                            <span className="text-bone truncate flex-1">{s.title}</span>
                            <span className="text-solder text-[10px] shrink-0">{s.wordCount} words</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>


            {/* Actions: left-aligned under the writing surface. */}
            <div className="studio-actions mt-auto flex flex-wrap items-center gap-2 pt-2">
              <span className="studio-input-status font-mono text-[10px] text-solder" aria-live="polite">
                <span className={hasContent ? 'studio-status-dot' : 'studio-idle-dot'} />
                {sourceType !== 'youtube' && wordCount > 0 ? `${wordCount.toLocaleString()} words · ready to encode` : hasContent ? 'Source ready' : 'Awaiting your material'}
              </span>
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
              {onOpenInquisitor && (
                <button
                  type="button"
                  onClick={() => {
                    playSound('click');
                    onOpenInquisitor();
                  }}
                  data-testid="open-inquisitor"
                  className="px-3.5 py-2 border border-flux-500/50 text-flux-300 hover:bg-flux-500/10 text-xs rounded-full transition-colors duration-150 cursor-pointer"
                  title="Question-first inquisitor: state a claim you suspect is true and get the verdict, the governing law behind it, and the exact case where it stops holding"
                >
                  Interrogate a claim
                </button>
              )}
              {onOpenCrucible && (
                <button
                  type="button"
                  onClick={() => {
                    playSound('click');
                    onOpenCrucible();
                  }}
                  data-testid="open-crucible"
                  className="px-3.5 py-2 border border-hazard-500/50 text-hazard-200 hover:bg-hazard-500/10 text-xs rounded-full transition-colors duration-150 cursor-pointer"
                  title="Timed crucible: multi-constraint problems against a clock that is allocated across each problem's states, with pacing reported per state"
                >
                  Timed crucible
                </button>
              )}
              {onOpenTriage && (
                <button
                  type="button"
                  onClick={() => {
                    playSound('click');
                    onOpenTriage();
                  }}
                  data-testid="open-triage"
                  className="px-3.5 py-2 border border-edge/70 text-solder hover:text-bone hover:border-signal-500/50 text-xs rounded-full transition-colors duration-150 cursor-pointer"
                  title="Emergency triage: dump the whole backlog, freeze what can prove it is low-leverage, and run one 90-minute single-task runway"
                >
                  Emergency triage
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
                onClick={onForge}
                className="px-3.5 py-2 border border-gilt/45 text-amber-200 hover:bg-amber-500/10 text-xs rounded-full transition-colors duration-150 cursor-pointer"
                title="Flashcards Only: skip encoding entirely — throw in many sources (notes, PDFs, slides, YouTube lectures) and export a deck to Anki or RemNote"
              >
                Flashcards only
              </button>
              <button
                type="button"
                onClick={onGenerate}
                disabled={!hasContent || isLoading}
                className="studio-build-button bg-gradient-to-b from-amber-400 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-inset font-semibold shadow-gilt transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none cursor-pointer"
              >
                <span>{isLoading ? 'Encoding…' : 'Build cognitive schema'}</span>
                <span className="studio-build-shortcut" aria-hidden="true">CTRL / ⌘ + ENTER</span>
                <span className="studio-build-arrow" aria-hidden="true">↗</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Rail: how deep this session goes, and which modules ride along ── */}
        <aside className="studio-tuning-rail flex flex-col border-t border-edge/60 bg-chassis/40 lg:border-t-0 lg:border-l">
          <div className="p-5 sm:p-6 border-b border-edge/50">
            <RailHeading>Session depth</RailHeading>
            <p className="studio-depth-prompt">Meet your mind where it is.</p>
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
                    className={`studio-gear w-full text-left px-3.5 py-3 border transition-colors duration-150 cursor-pointer ${
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

          <details className="studio-tuning-details p-5 sm:p-6">
            <summary>
              <span className="label-caps">Fine-tune your session</span>
              <span>{Object.values(moduleState).filter((state) => state.on).length} active <span aria-hidden="true">+</span></span>
            </summary>
            <div className="space-y-1.5 mt-3">
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
          </details>
          <div className="studio-rail-note">
            {/* The seal wears the page's gold leaf: a circular wrapper, so the
                leaf's rim (`.leaf-edge::after`) becomes the travelling gilt
                edge of the plate. */}
            <span className="studio-rail-medallion leaf-edge" aria-hidden>
              <BrandStar className="studio-rail-symbol" />
            </span>
            <p>Understanding is built,<br /><em>not downloaded.</em></p>
            <span>ACTIVE ENCODING / EVERY GEAR</span>
          </div>
        </aside>
      </div>

      <div className="studio-presets">
        <div className="studio-presets-heading"><span>NEED A SPARK?</span><p>Start with a little curiosity.</p></div>
        <div className="studio-presets-grid">
          {LAUNCHPAD_PRESETS.map((preset) => (
            <button key={preset.id} type="button" onClick={() => handleApplyPreset(preset)} className="studio-preset leaf-edge">
              <span className="studio-preset-code">{preset.icon}<span aria-hidden="true">↗</span></span>
              <span className="studio-preset-title">{preset.title}</span>
              <span className="studio-preset-mode">{preset.mode === 'conceptual' ? 'UNDERSTAND' : 'REMEMBER'}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="toy-launch-strip">
        <div><span className="label-caps">Hands-on laboratories</span><p>Don’t memorize the law. Discover it.</p><span>{TOY_EXAMPLES.length} explicit teaching examples · no API key needed</span></div>
        <div role="group" aria-label="Try an interactive laboratory">
          {TOY_EXAMPLES.map((example, index) => <button type="button" key={example.id} onClick={() => onTryToyExample(example.id)}><span>0{index + 1}</span>{example.label}<span aria-hidden="true">↗</span></button>)}
          {onTryPathwayBuilder && <button type="button" data-testid="open-pathway-builder" onClick={onTryPathwayBuilder}><span>0{TOY_EXAMPLES.length + 1}</span>Energy-payoff pathway<span aria-hidden="true">↗</span></button>}
        </div>
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
