'use client';

import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  SegregationReport,
  StageResponse,
  YouTubeMetadata
} from '@/lib/types';
import type { CognitiveTelemetry } from '@/lib/cognitive-telemetry';

export interface HandoffStats {
  totalCards: number;
  fsrsReady: number;
  leechCandidates: number;
  unfinished: number;
  boundaryTraps: number;
  /** Real measurements of encoding quality — this is the trophy, not XP. */
  telemetry: CognitiveTelemetry;
  /** Cards the Wozniak ceiling held out of the export until chunked. */
  heldBackCount: number;
}

interface CompletedSessionViewProps {
  /**
   * Session XP. Accepted but deliberately not rendered: the trophy is the
   * handoff report (cards, telemetry), not a points total.
   */
  xp?: number;
  topicSummary: string;
  activities: Activity[];
  userResponses: Record<string, StageResponse>;
  youtubeData: YouTubeMetadata | null;
  copiedFormat: string | null;
  handoffStats: HandoffStats;
  onDownloadApkg: () => void;
  onCopy: (format: 'remnote' | 'anki' | 'markdown') => void;
  onShare: () => void;
  onOpenBlurting: () => void;
  onOpenSegregate: (report: SegregationReport) => void;
  onTeach: () => void;
  onRestart: () => void;
  // Continue-this-topic: if the schema has unfinished/low stages, show a button
  // to resume encoding at the first unfinished stage instead of restarting.
  onContinue?: () => void;
  hasIncompleteStages?: boolean;
}

/** One measured claim about the handoff. Mono numbers, calm pill, no shouting. */
function StatChip({
  token,
  label,
  value,
  tone = 'bone',
  extra,
}: {
  token: string;
  label: string;
  value: ReactNode;
  tone?: 'bone' | 'gold' | 'signal' | 'hazard' | 'muted';
  extra?: ReactNode;
}) {
  const toneStyles: Record<string, string> = {
    bone: 'text-bone',
    gold: 'text-amber-200',
    signal: 'text-signal-300',
    hazard: 'text-hazard-300',
    muted: 'text-solder',
  };
  const tokenStyles: Record<string, string> = {
    bone: 'text-slate-ink',
    gold: 'text-amber-300',
    signal: 'text-signal-400',
    hazard: 'text-hazard-400',
    muted: 'text-solder',
  };
  return (
    <div className="flex items-center gap-2 bg-inset/70 border border-edge/60 rounded-full px-3.5 py-1.5">
      <span className={`font-mono text-[10px] tracking-[0.14em] ${tokenStyles[tone]}`}>{token}</span>
      <span className="text-solder">{label}</span>
      <span className={`font-mono font-semibold ${toneStyles[tone]}`}>{value}</span>
      {extra}
    </div>
  );
}

/**
 * STATE 4: Completed master schema & SRS export matrix. Extracted from
 * app/page.tsx : receives everything it needs as props.
 *
 * Identity-first: the trophy is the CLEAN HANDOFF ("I convert messy notes to
 * clean cards"), not XP. Primary CTA is the one-click FSRS-ready .apkg.
 */
export function CompletedSessionView({
  topicSummary,
  activities,
  userResponses,
  youtubeData,
  copiedFormat,
  handoffStats,
  onDownloadApkg,
  onCopy,
  onShare,
  onOpenBlurting,
  onOpenSegregate,
  onTeach,
  onRestart,
  onContinue,
  hasIncompleteStages,
}: CompletedSessionViewProps) {
  const {
    totalCards,
    fsrsReady,
    leechCandidates,
    unfinished,
    boundaryTraps,
    telemetry,
    heldBackCount,
  } = handoffStats;
  const { compression, atomicity, jargon } = telemetry;
  const hasCompression = compression.rawWords > 0 && compression.atomicCards > 0;
  return (
    <motion.div
      key="completed"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full flex flex-col gap-5"
    >
      {/* Identity Trophy Hero : the clean handoff is the reward. Lit from the
          top, like the rest of the hall, so it reads as the one lit object. */}
      <div className="relative overflow-hidden flex flex-col items-center text-center gap-4 rounded-2xl border border-gilt/30 bg-deck shadow-raised px-6 py-10 sm:px-10">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-[radial-gradient(600px_180px_at_50%_100%,rgba(210,164,85,0.12),transparent_70%)]"
        />
        <div className="relative flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border border-gilt/35 bg-amber-500/[0.08]">
          <span className="h-1.5 w-1.5 rotate-45 bg-gradient-to-br from-amber-300 to-amber-600" aria-hidden />
          <span className="font-mono text-[10px] tracking-[0.2em] text-amber-200">[ CARDS ]</span>
        </div>
        <h2 className="relative font-display text-[30px] leading-tight text-bone">
          Clean cards, ready for Anki.
        </h2>
        <p className="relative text-xs text-solder italic max-w-lg">
          You converted messy notes into {totalCards} cards encoded in your own words.
        </p>

        {/* Handoff quality report : replaces XP as the trophy */}
        <div className="relative flex flex-wrap items-center justify-center gap-2 text-xs font-mono">
          <StatChip
            token="[ OK ]"
            label="FSRS-Ready:"
            value={`${fsrsReady} / ${totalCards}`}
            tone="signal"
          />
          <StatChip token="[ TRAP ]" label="Boundary Traps:" value={boundaryTraps} tone="gold" />

          {unfinished > 0 && (
            <StatChip token="[ ? ]" label="Unfinished:" value={unfinished} tone="muted" />
          )}

          {leechCandidates > 0 && (
            <StatChip token="[ LEECH ]" label="Dense (tagged):" value={leechCandidates} tone="hazard" />
          )}

          {hasCompression && (
            <StatChip
              token="[ ZIP ]"
              label="Compression:"
              value={`${compression.rawWords.toLocaleString()} words → ${compression.atomicCards} cards`}
              extra={<span className="text-amber-200">{compression.noiseStrippedPct}% noise stripped</span>}
            />
          )}

          <StatChip
            token="[ ATOM ]"
            label="Atomicity:"
            value={`${atomicity.averageBackWords} words/card`}
            extra={
              atomicity.overLimit > 0 ? (
                <span className="text-hazard-300">{atomicity.overLimit} over 15</span>
              ) : (
                <span className="text-signal-300">all atomic</span>
              )
            }
          />

          {jargon.detected > 0 && (
            <StatChip
              token="[ JARGON ]"
              label="Deflation:"
              value={`${jargon.deflated}/${jargon.detected} buzzwords replaced`}
              extra={<span className="text-amber-200">{jargon.index}%</span>}
            />
          )}

          {heldBackCount > 0 && (
            <StatChip token="[ DENSE ]" label="Held back (over 20 words):" value={heldBackCount} tone="gold" />
          )}
        </div>

        {/* Primary CTA : one-click FSRS-ready handoff */}
        <div className="relative flex flex-col items-center gap-2.5 mt-2 w-full max-w-md">
          <button
            type="button"
            onClick={onDownloadApkg}
            disabled={totalCards === 0}
            className="w-full py-3.5 rounded-full bg-gradient-to-b from-amber-400 to-amber-600 text-inset text-xs font-semibold uppercase tracking-[0.16em] shadow-gilt hover:from-amber-300 hover:to-amber-500 transition-colors duration-150 disabled:opacity-40 disabled:shadow-none cursor-pointer"
            title="Real .apkg (Basic + Cloze note types) : open directly in Anki, FSRS owns scheduling"
          >
            [ DL ] Download FSRS-Ready .apkg ({totalCards} cards)
          </button>
          <p className="text-[10px] text-solder font-mono leading-relaxed">
            {'// '}
            {heldBackCount > 0
              ? `${heldBackCount} dense card fragment${heldBackCount === 1 ? '' : 's'} stayed out of this deck. Open the exporter to chunk or force-include them.`
              : unfinished + leechCandidates > 0
                ? `${unfinished + leechCandidates} card${unfinished + leechCandidates === 1 ? '' : 's'} tagged Unfinished/LeechCandidate : build a filtered deck from those tags on day 1.`
                : 'Zero leeches, zero unfinished : textbook-clean handoff.'}
          </p>
        </div>
      </div>

      {/* Quick Export Actions (RemNote, Anki, Markdown, Stateless URL Share) */}
      <div className="rounded-2xl border border-edge/70 bg-deck shadow-panel p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2.5 font-display text-[19px] leading-tight text-bone">
            <span className="font-mono text-[10px] tracking-[0.18em] text-amber-300">[ SAVE ]</span>
            Port to Spaced Repetition or Share
          </h3>
          <p className="text-xs text-solder mt-1.5 leading-relaxed">
            Copy clean formats into RemNote, Anki, Obsidian, or generate a 100% free share link
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Blurting Method Canvas Button */}
          <button
            type="button"
            onClick={onOpenBlurting}
            className="flex items-center gap-2 px-3.5 py-2 rounded-full border border-edge/70 bg-inset text-bone text-xs hover:border-gilt/40 hover:bg-white/[0.04] transition-colors duration-150 cursor-pointer"
            title="The Blurting Method: Test free recall from memory on a blank canvas. AI marks missed first principles in red."
          >
            <span className="font-mono text-[10px] tracking-[0.14em] text-amber-300">[ PEN ]</span>
            <span>Blurting Canvas (Active Recall)</span>
          </button>

          {/* Teach Me : re-teach the whole saved schema as an interactive lesson */}
          <button
            type="button"
            onClick={onTeach}
            className="flex items-center gap-2 px-3.5 py-2 rounded-full border border-flux-500/45 bg-flux-500/[0.08] text-flux-200 text-xs hover:bg-flux-500/[0.14] transition-colors duration-150 cursor-pointer"
            title="Teach Me: Brilliant-style interactive lesson that re-teaches this schema, concept then problem"
          >
            <span className="font-mono text-[10px] tracking-[0.14em] text-flux-300">[ TEACH ]</span>
            <span>Teach Me (Interactive Lesson)</span>
          </button>

          {/* RemNote 4-Quadrant Matrix & API Push */}
          <button
            type="button"
            onClick={() => {
              onOpenSegregate({
                topic: topicSummary,
                compressionRatio: '65% Semantic Fluff Eliminated',
                declarativeFacts: [],
                conceptualMechanisms: activities.map(act => ({
                  id: act.id,
                  conceptName: act.title,
                  whatIsIt: userResponses[act.id]?.field1 || act.cognitiveGoal,
                  whyItMatters: userResponses[act.id]?.field2 || act.prompt,
                  howItWorks: act.contextSnippet,
                  whatIfEdgeCase: act.scaffold.exampleAnswer || 'If key boundary conditions fail, system collapses into disordered state.',
                  boundaryContrast: {
                    confusableLookalike: `Superficial misinterpretation of ${act.title}`,
                    distinguishingRule: `True ${act.title} requires active first-principles mechanism.`
                  }
                }))
              });
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-full border border-edge/70 bg-inset text-bone text-xs hover:border-gilt/40 hover:bg-white/[0.04] transition-colors duration-150 cursor-pointer"
            title="RemNote Hierarchical Matrix & API Push"
          >
            <span className="font-mono text-[10px] tracking-[0.14em] text-amber-300">[ SPLIT ]</span>
            <span>RemNote 4-Quadrant & API</span>
          </button>

          <button
            type="button"
            onClick={onShare}
            className="flex items-center gap-2 px-3.5 py-2 rounded-full border border-edge/70 bg-inset text-bone text-xs hover:border-gilt/40 hover:bg-white/[0.04] transition-colors duration-150 cursor-pointer"
          >
            <span className="font-mono text-[10px] tracking-[0.14em] text-amber-300">[ SHARE ]</span>
            Share Link (Stateless)
          </button>

          <button
            type="button"
            onClick={() => onCopy('remnote')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-full border border-edge/70 bg-deck text-bone text-xs hover:border-gilt/40 hover:bg-white/[0.04] transition-colors duration-150 cursor-pointer"
          >
            {copiedFormat === 'remnote' ? <span className="font-mono text-[10px] tracking-[0.14em] text-signal-300">[ OK ]</span> : <span className="font-mono text-[10px] tracking-[0.14em] text-amber-300">[ COPY ]</span>}
            Copy for RemNote
          </button>

          <button
            type="button"
            onClick={() => onCopy('anki')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-full border border-edge/70 bg-deck text-bone text-xs hover:border-gilt/40 hover:bg-white/[0.04] transition-colors duration-150 cursor-pointer"
          >
            {copiedFormat === 'anki' ? <span className="font-mono text-[10px] tracking-[0.14em] text-signal-300">[ OK ]</span> : <span className="font-mono text-[10px] tracking-[0.14em] text-amber-300">[ COPY ]</span>}
            Copy Anki Cloze
          </button>

          <button
            type="button"
            onClick={() => onCopy('markdown')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-full border border-edge/70 bg-inset text-bone text-xs hover:border-gilt/40 hover:bg-white/[0.04] transition-colors duration-150 cursor-pointer"
          >
            {copiedFormat === 'markdown' ? <span className="font-mono text-[10px] tracking-[0.14em] text-signal-300">[ OK ]</span> : <span className="font-mono text-[10px] tracking-[0.14em] text-amber-300">[ FILE ]</span>}
            Copy Full Markdown
          </button>
        </div>
      </div>

      {/* Generated Schemas Matrix */}
      <div className="rounded-2xl border border-edge/70 bg-deck shadow-panel overflow-hidden">
        <div className="px-5 sm:px-6 py-5 flex items-center justify-between gap-3 border-b border-edge/50 bg-chassis/40">
          <h3 className="flex items-center gap-2.5 font-display text-[19px] leading-tight text-bone min-w-0">
            <span className="font-mono text-[10px] tracking-[0.18em] text-amber-300">[ LAYERS ]</span>
            <span className="truncate">Your Synthesized Cognitive Schemas ({topicSummary})</span>
          </h3>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {activities.map((act) => {
            const resp = userResponses[act.id] || { field1: '', field2: '', field3: '' };
            return (
              <div
                key={act.id}
                className="rounded-2xl border border-edge/60 bg-chassis/40 p-5 flex flex-col gap-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-amber-200 border border-gilt/35 bg-amber-500/[0.07] rounded-full px-2.5 py-1 shrink-0">
                      Stage {act.stageNumber}: {act.title}
                    </span>
                    <span className="text-xs text-solder font-mono">({act.framework})</span>
                  </div>
                  {act.videoTimestamp && (
                    <span className="text-xs text-hazard-300 font-mono">
                      ▶ {act.videoTimestamp.formatted}
                    </span>
                  )}
                </div>

                {act.researchContext && (
                  <div className="p-3 rounded-xl bg-amber-500/[0.05] border border-gilt/25 text-xs text-slate-ink leading-relaxed">
                    <span className="text-amber-200 font-medium">Grounded prerequisite · </span>
                    {act.researchContext.conceptAdded} : {act.researchContext.explanation}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div className="rounded-xl border border-edge/60 bg-inset/70 p-4">
                    <h5 className="label-caps mb-2">
                      {act.scaffold.field1Label}
                    </h5>
                    <p className="text-xs text-bone font-mono leading-relaxed">
                      {resp.field1}
                    </p>
                  </div>

                  <div className="rounded-xl border border-edge/60 bg-inset/70 p-4">
                    <h5 className="label-caps mb-2">
                      {act.scaffold.field2Label}
                    </h5>
                    <p className="text-xs text-bone font-mono leading-relaxed">
                      {resp.field2}
                    </p>
                  </div>
                </div>

                {resp.field3 && (
                  <div className="rounded-xl border border-dashed border-edge/60 bg-chassis/40 p-3.5 text-xs text-solder font-mono leading-relaxed">
                    <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-amber-300 mr-2">
                      {act.scaffold.field3Label || 'Anchor'}:
                    </span>
                    {resp.field3}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Restart / Continue Button */}
      <div className="flex flex-wrap justify-center items-center gap-3 mt-2 pb-12">
        {hasIncompleteStages && onContinue ? (
          <button
            type="button"
            onClick={onContinue}
            className="flex items-center gap-2 px-7 py-3 rounded-full bg-gradient-to-b from-amber-400 to-amber-600 text-inset text-xs font-semibold uppercase tracking-[0.16em] shadow-gilt hover:from-amber-300 hover:to-amber-500 transition-colors duration-150 cursor-pointer"
          >
            <span className="font-mono text-[10px] tracking-[0.14em]">[ ▶ CONTINUE ]</span>
            Continue where you left off
          </button>
        ) : null}
        <button
          type="button"
          onClick={onRestart}
          className="flex items-center gap-2 px-7 py-3 rounded-full bg-inset border border-edge/70 text-bone text-xs uppercase tracking-[0.16em] hover:border-gilt/40 hover:bg-white/[0.04] transition-colors duration-150 cursor-pointer"
        >
          <span className="font-mono text-[10px] tracking-[0.14em] text-amber-300">[ RESET ]</span>
          Encode Another Topic
        </button>
      </div>
    </motion.div>
  );
}
