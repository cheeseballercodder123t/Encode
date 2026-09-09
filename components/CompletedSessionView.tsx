'use client';

import { motion } from 'motion/react';
import {
  Activity,
  SegregationReport,
  StageResponse,
  YouTubeMetadata
} from '@/lib/types';

interface CompletedSessionViewProps {
  xp: number;
  topicSummary: string;
  activities: Activity[];
  userResponses: Record<string, StageResponse>;
  youtubeData: YouTubeMetadata | null;
  copiedFormat: string | null;
  onCopy: (format: 'remnote' | 'anki' | 'markdown') => void;
  onShare: () => void;
  onStartInterleavedDrill: () => void;
  onOpenBlurting: () => void;
  onOpenSegregate: (report: SegregationReport) => void;
  onRestart: () => void;
}

/**
 * STATE 4: Completed master schema & SRS export matrix. Extracted from
 * app/page.tsx : receives everything it needs as props.
 */
export function CompletedSessionView({
  xp,
  topicSummary,
  activities,
  userResponses,
  youtubeData,
  copiedFormat,
  onCopy,
  onShare,
  onStartInterleavedDrill,
  onOpenBlurting,
  onOpenSegregate,
  onRestart
}: CompletedSessionViewProps) {
  return (
    <motion.div
      key="completed"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full flex flex-col gap-6"
    >
      {/* Completion Hero Banner */}
      <div className="p-8 to-[#0F111A] border border-steel/30   relative overflow-hidden flex flex-col items-center text-center">
        <div className="p-3 bg-amber/20 border border-amber/40 text-amber mb-3  ">
          <span className="text-amber font-bold font-mono">[ TROPHY ]</span>
        </div>
        <h2 className="text-2xl font-black text-bone tracking-tight mb-1">
          Cognitive Encoding Workout Complete!
        </h2>
        <p className="text-xs text-solder font-mono italic max-w-lg mb-4">
          You have successfully transformed passive input into durable semantic neural schema.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-1 bg-deck px-3.5 py-1.5 border border-steel">
            <span className="text-amber font-bold font-mono">[ ZAP ]</span>
            <span className="text-solder">Total XP Earned:</span>
            <span className="font-black text-amber">{xp} XP</span>
          </div>

          <div className="flex items-center gap-1 bg-deck px-3.5 py-1.5 border border-steel">
            <span className="text-amber font-bold font-mono">[ * ]</span>
            <span className="text-solder">Stages Completed:</span>
            <span className="font-bold text-amber">{activities.length} / {activities.length} (100%)</span>
          </div>

          {youtubeData && (
            <div className="flex items-center gap-1 bg-hazard950/30 border border-hazard500/40 text-hazard300 px-3 py-1.5 ">
              <span className="text-amber font-bold font-mono">[ VIDEO ]</span>
              <span>Timestamped Video Linked</span>
            </div>
          )}
        </div>
      </div>

      {/* Interleaving CTA banner on completed screen */}
      <div className="p-5 border border-steel/30  flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 bg-steel/20 border border-steel/40 text-bone shrink-0">
            <span className="text-amber font-bold font-mono">[ SHUF ]</span>
          </div>
          <div>
            <h4 className="text-sm font-bold text-bone">
              Supercharge Retention with an Interleaved Workout
            </h4>
            <p className="text-xs text-solder">
              Mix this schema with other saved subjects in rapid-fire retrieval practice.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onStartInterleavedDrill}
          className="px-5 py-2.5 hover: hover: text-bone font-bold text-xs    flex items-center gap-2 shrink-0 cursor-pointer"
        >
          <span className="text-amber font-bold font-mono">[ ZAP ]</span>
          <span>Start Interleaved Drill</span>
        </button>
      </div>

      {/* Quick Export Actions (RemNote, Anki, Markdown, Stateless URL Share) */}
      <div className="bg-chassis border border-steel p-6  flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-bone flex items-center gap-2">
            <span className="text-amber font-bold font-mono">[ SAVE ]</span>
            Port to Spaced Repetition or Share
          </h3>
          <p className="text-xs text-solder mt-0.5">Copy clean formats into RemNote, Anki, Obsidian, or generate a 100% free share link</p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {/* Blurting Method Canvas Button */}
          <button
            type="button"
            onClick={onOpenBlurting}
            className="flex items-center gap-1.5 px-3.5 py-2 hover: hover: border border-steel/40 text-bone text-xs font-bold  transition-none-all cursor-pointer "
            title="The Blurting Method: Test free recall from memory on a blank canvas. AI marks missed first principles in red."
          >
            <span className="text-amber font-bold font-mono">[ PEN ]</span>
            <span>Blurting Canvas (Active Recall)</span>
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
            className="flex items-center gap-1.5 px-3.5 py-2 hover: hover: border border-steel/40 text-bone text-xs font-bold  transition-none-all cursor-pointer "
            title="RemNote Hierarchical Matrix & API Push"
          >
            <span className="text-amber font-bold font-mono">[ SPLIT ]</span>
            <span>RemNote 4-Quadrant & API</span>
          </button>

          <button
            type="button"
            onClick={onShare}
            className="flex items-center gap-1.5 px-3.5 py-2 hover: hover: border border-steel/40 text-bone text-xs font-bold  transition-none-all cursor-pointer "
          >
            <span className="text-amber font-bold font-mono">[ SHARE ]</span>
            Share Link (Stateless)
          </button>

          <button
            onClick={() => onCopy('remnote')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-deck hover:bg-deck border border-steel text-bone text-xs font-bold transition-none-all cursor-pointer"
          >
            {copiedFormat === 'remnote' ? <span className="text-amber font-bold font-mono">[ OK ]</span> : <span className="text-amber font-bold font-mono">[ COPY ]</span>}
            Copy for RemNote
          </button>

          <button
            onClick={() => onCopy('anki')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-deck hover:bg-deck border border-steel text-bone text-xs font-bold transition-none-all cursor-pointer"
          >
            {copiedFormat === 'anki' ? <span className="text-amber font-bold font-mono">[ OK ]</span> : <span className="text-amber font-bold font-mono">[ COPY ]</span>}
            Copy Anki Cloze
          </button>

          <button
            onClick={() => onCopy('markdown')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-steel hover:bg-steel border border-steel/50 text-bone text-xs font-bold transition-none-all cursor-pointer"
          >
            {copiedFormat === 'markdown' ? <span className="text-amber font-bold font-mono">[ OK ]</span> : <span className="text-amber font-bold font-mono">[ FILE ]</span>}
            Copy Full Markdown
          </button>
        </div>
      </div>

      {/* Generated Schemas Matrix */}
      <div className="bg-chassis border border-steel overflow-hidden">
        <div className="p-5 border-b border-steel bg-deck flex items-center justify-between">
          <h3 className="font-bold text-bone text-sm flex items-center gap-2">
            <span className="text-amber font-bold font-mono">[ LAYERS ]</span>
            Your Synthesized Cognitive Schemas ({topicSummary})
          </h3>
        </div>

        <div className="divide-y divide-slate-800/80">
          {activities.map((act) => {
            const resp = userResponses[act.id] || { field1: '', field2: '', field3: '' };
            return (
              <div key={act.id} className="p-6 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-steel/20 text-bone border border-steel/40 text-[10px] font-bold uppercase tracking-wider">
                      Stage {act.stageNumber}: {act.title}
                    </span>
                    <span className="text-xs text-solder font-mono">({act.framework})</span>
                  </div>
                  {act.videoTimestamp && (
                    <span className="text-xs text-hazard400 font-mono font-bold">
                      ▶ {act.videoTimestamp.formatted}
                    </span>
                  )}
                </div>

                {act.researchContext && (
                  <div className="p-2.5 bg-amber/10 border border-amber/20 text-xs text-amber">
                    <strong>Grounded Prerequisite:</strong> {act.researchContext.conceptAdded} : {act.researchContext.explanation}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1">
                  <div className="bg-deck p-4 border border-steel">
                    <h5 className="text-[11px] font-bold text-bone uppercase mb-1">
                      {act.scaffold.field1Label}
                    </h5>
                    <p className="text-xs text-bone font-mono leading-relaxed">
                      {resp.field1}
                    </p>
                  </div>

                  <div className="bg-deck p-4 border border-steel">
                    <h5 className="text-[11px] font-bold text-bone uppercase mb-1">
                      {act.scaffold.field2Label}
                    </h5>
                    <p className="text-xs text-bone font-mono leading-relaxed">
                      {resp.field2}
                    </p>
                  </div>
                </div>

                {resp.field3 && (
                  <div className="bg-chassis/30 p-3.5 border border-dashed border-steel text-xs text-solder font-mono">
                    <span className="font-mono font-bold text-[10px] text-amber uppercase mr-2">
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

      {/* Restart Button */}
      <div className="flex justify-center mt-2 pb-12">
        <button
          onClick={onRestart}
          className="flex items-center gap-2 px-7 py-3 bg-steel border border-steel hover:bg-steel text-bone text-xs font-bold uppercase tracking-wider transition-none-colors  cursor-pointer"
        >
          <span className="text-amber font-bold font-mono">[ RESET ]</span>
          Encode Another Topic
        </button>
      </div>
    </motion.div>
  );
}
