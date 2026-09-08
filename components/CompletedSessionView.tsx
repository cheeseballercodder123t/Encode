'use client';

import { motion } from 'motion/react';
import {
  Award,
  Check,
  Copy,
  FileText,
  Layers,
  PenTool,
  RefreshCcw,
  Save,
  Share2,
  Shuffle,
  Sparkles,
  SplitSquareVertical,
  Video,
  Zap
} from 'lucide-react';
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
 * app/page.tsx — receives everything it needs as props.
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
      <div className="p-8 bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-[#0F111A] border border-indigo-500/30 rounded-2xl shadow-2xl relative overflow-hidden flex flex-col items-center text-center">
        <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 rounded-2xl mb-3 shadow-lg shadow-emerald-500/10">
          <Award className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-black text-white tracking-tight mb-1">
          Cognitive Encoding Workout Complete!
        </h2>
        <p className="text-xs text-slate-300 font-serif italic max-w-lg mb-4">
          You have successfully transformed passive input into durable semantic neural schema.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-1 bg-[#131622] px-3.5 py-1.5 rounded-xl border border-slate-800">
            <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
            <span className="text-slate-400">Total XP Earned:</span>
            <span className="font-black text-amber-400">{xp} XP</span>
          </div>

          <div className="flex items-center gap-1 bg-[#131622] px-3.5 py-1.5 rounded-xl border border-slate-800">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span className="text-slate-400">Stages Completed:</span>
            <span className="font-bold text-emerald-400">{activities.length} / {activities.length} (100%)</span>
          </div>

          {youtubeData && (
            <div className="flex items-center gap-1 bg-red-950/30 border border-red-500/40 text-red-300 px-3 py-1.5 rounded-xl">
              <Video className="w-3.5 h-3.5 text-red-400" />
              <span>Timestamped Video Linked</span>
            </div>
          )}
        </div>
      </div>

      {/* Interleaving CTA banner on completed screen */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-violet-950/40 to-indigo-950/30 border border-violet-500/30 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/40 text-violet-300 shrink-0">
            <Shuffle className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">
              Supercharge Retention with an Interleaved Workout
            </h4>
            <p className="text-xs text-slate-300">
              Mix this schema with other saved subjects in rapid-fire retrieval practice.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onStartInterleavedDrill}
          className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-violet-600/20 flex items-center gap-2 shrink-0 cursor-pointer"
        >
          <Zap className="w-4 h-4 fill-white" />
          <span>Start Interleaved Drill</span>
        </button>
      </div>

      {/* Quick Export Actions (RemNote, Anki, Markdown, Stateless URL Share) */}
      <div className="bg-[#0F111A] rounded-xl border border-slate-800 p-6 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Save className="w-4 h-4 text-indigo-400" />
            Port to Spaced Repetition or Share
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">Copy clean formats into RemNote, Anki, Obsidian, or generate a 100% free share link</p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {/* Blurting Method Canvas Button */}
          <button
            type="button"
            onClick={onOpenBlurting}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-fuchsia-600/20 to-pink-600/20 hover:from-fuchsia-600/30 hover:to-pink-600/30 border border-fuchsia-500/40 text-fuchsia-300 text-xs font-bold rounded-lg transition-all cursor-pointer shadow-sm"
            title="The Blurting Method: Test free recall from memory on a blank canvas. AI marks missed first principles in red."
          >
            <PenTool className="w-3.5 h-3.5 text-fuchsia-400" />
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
            className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-cyan-600/20 to-blue-600/20 hover:from-cyan-600/30 hover:to-blue-600/30 border border-cyan-500/40 text-cyan-300 text-xs font-bold rounded-lg transition-all cursor-pointer shadow-sm"
            title="RemNote Hierarchical Matrix & API Push"
          >
            <SplitSquareVertical className="w-3.5 h-3.5 text-cyan-400" />
            <span>RemNote 4-Quadrant & API</span>
          </button>

          <button
            type="button"
            onClick={onShare}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-cyan-600/20 to-indigo-600/20 hover:from-cyan-600/30 hover:to-indigo-600/30 border border-cyan-500/40 text-cyan-300 text-xs font-bold rounded-lg transition-all cursor-pointer shadow-sm"
          >
            <Share2 className="w-3.5 h-3.5 text-cyan-400" />
            Share Link (Stateless)
          </button>

          <button
            onClick={() => onCopy('remnote')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#161A28] hover:bg-[#1E2336] border border-slate-700 text-slate-200 text-xs font-bold rounded-lg transition-all cursor-pointer"
          >
            {copiedFormat === 'remnote' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-indigo-400" />}
            Copy for RemNote
          </button>

          <button
            onClick={() => onCopy('anki')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#161A28] hover:bg-[#1E2336] border border-slate-700 text-slate-200 text-xs font-bold rounded-lg transition-all cursor-pointer"
          >
            {copiedFormat === 'anki' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-purple-400" />}
            Copy Anki Cloze
          </button>

          <button
            onClick={() => onCopy('markdown')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 border border-indigo-500/50 text-white text-xs font-bold rounded-lg transition-all cursor-pointer"
          >
            {copiedFormat === 'markdown' ? <Check className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
            Copy Full Markdown
          </button>
        </div>
      </div>

      {/* Generated Schemas Matrix */}
      <div className="bg-[#0F111A] rounded-xl shadow-2xl border border-slate-800 overflow-hidden">
        <div className="p-5 border-b border-slate-800 bg-[#121520] flex items-center justify-between">
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
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
                    <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-[10px] font-bold rounded uppercase tracking-wider">
                      Stage {act.stageNumber}: {act.title}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">({act.framework})</span>
                  </div>
                  {act.videoTimestamp && (
                    <span className="text-xs text-red-400 font-mono font-bold">
                      ▶ {act.videoTimestamp.formatted}
                    </span>
                  )}
                </div>

                {act.researchContext && (
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
                    <strong>Grounded Prerequisite:</strong> {act.researchContext.conceptAdded} — {act.researchContext.explanation}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1">
                  <div className="bg-[#141724] p-4 rounded-lg border border-slate-800">
                    <h5 className="text-[11px] font-bold text-indigo-300 uppercase mb-1">
                      {act.scaffold.field1Label}
                    </h5>
                    <p className="text-xs text-slate-200 font-serif leading-relaxed">
                      {resp.field1}
                    </p>
                  </div>

                  <div className="bg-[#141724] p-4 rounded-lg border border-slate-800">
                    <h5 className="text-[11px] font-bold text-purple-300 uppercase mb-1">
                      {act.scaffold.field2Label}
                    </h5>
                    <p className="text-xs text-slate-200 font-serif leading-relaxed">
                      {resp.field2}
                    </p>
                  </div>
                </div>

                {resp.field3 && (
                  <div className="bg-black/30 p-3.5 rounded-lg border border-dashed border-slate-700 text-xs text-slate-300 font-serif">
                    <span className="font-sans font-bold text-[10px] text-emerald-400 uppercase mr-2">
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
          className="flex items-center gap-2 px-7 py-3 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors shadow-sm cursor-pointer"
        >
          <RefreshCcw className="w-4 h-4" />
          Encode Another Topic
        </button>
      </div>
    </motion.div>
  );
}
