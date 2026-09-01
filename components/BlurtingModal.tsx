import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  PenTool, 
  Brain, 
  Sparkles, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  Loader2, 
  RotateCcw,
  Zap,
  Flame
} from 'lucide-react';
import { BlurtingEvaluation, Activity, ResearchContextItem, AISettings } from '@/lib/types';
import { sound, playSound } from '@/lib/audio';

interface BlurtingModalProps {
  isOpen: boolean;
  onClose: () => void;
  schemaTitle: string;
  activities: Activity[];
  researchContexts?: ResearchContextItem[];
  settings: AISettings;
}

export const BlurtingModal: React.FC<BlurtingModalProps> = ({
  isOpen,
  onClose,
  schemaTitle,
  activities,
  researchContexts,
  settings,
}) => {
  const [blurtText, setBlurtText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [evaluation, setEvaluation] = useState<BlurtingEvaluation | null>(null);

  if (!isOpen) return null;

  const handleAnalyzeBlurt = async () => {
    if (!blurtText.trim() || isAnalyzing) return;
    setIsAnalyzing(true);
    playSound('click');

    try {
      const res = await fetch('/api/blurt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blurtText,
          schemaTitle,
          activities,
          researchContexts,
          settings,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to analyze blurt retrieval.');
      }

      const data = await res.json();
      setEvaluation(data);
      playSound('success');
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReset = () => {
    setEvaluation(null);
    setBlurtText('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-fuchsia-500/30 p-6 shadow-2xl shadow-fuchsia-500/10 text-slate-100 relative my-8"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-fuchsia-500/20 border border-fuchsia-500/40 flex items-center justify-center text-fuchsia-400">
              <PenTool className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30">
                  The Blurting Method
                </span>
                <span className="text-xs text-slate-400">Free Recall Diagnostic</span>
              </div>
              <h2 className="text-lg font-bold text-white mt-0.5">
                Blurting Canvas: {schemaTitle || "Active Topic"}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!evaluation ? (
          /* Blank Canvas Input Phase */
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-fuchsia-950/30 border border-fuchsia-500/30 text-xs text-fuchsia-200 leading-relaxed">
              <p className="font-bold text-fuchsia-300 mb-1 flex items-center gap-1.5">
                <Brain className="w-4 h-4" />
                The Rule of Pure Retrieval:
              </p>
              Close all tabs and notes. Write down absolutely everything you can remember about this concept from memory (mechanisms, formulas, key steps, edge cases). When you submit, the AI will differential-compare your blurt against the first-principles schema and highlight forgotten gaps in red.
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Your Memory Blurt Dump:
              </label>
              <textarea
                value={blurtText}
                onChange={(e) => setBlurtText(e.target.value)}
                placeholder="Start typing from memory... What are the key stages? Why does it happen? What triggers each step?"
                className="w-full h-48 p-4 rounded-xl bg-slate-950 border border-slate-700 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-fuchsia-500 transition resize-none font-mono leading-relaxed"
                autoFocus
              />
              <div className="flex justify-between items-center text-xs text-slate-400 mt-1.5">
                <span>{blurtText.trim() ? blurtText.trim().split(/\s+/).length : 0} words retrieved</span>
                <span>Active Recall Protocol</span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 transition"
              >
                Close
              </button>
              <button
                onClick={handleAnalyzeBlurt}
                disabled={!blurtText.trim() || isAnalyzing}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 shadow-lg shadow-fuchsia-500/25 flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Analyzing Retrieval Gaps...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Evaluate My Blurt & Highlight Gaps</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Analysis & Differential Gap Highlights */
          <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-1">
            {/* Score Banner */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-slate-900 via-fuchsia-950/40 to-slate-900 border border-fuchsia-500/40 flex items-center justify-between">
              <div>
                <span className="text-xs text-fuchsia-300 font-semibold uppercase tracking-wider">
                  Retrieval Completeness
                </span>
                <div className="text-2xl font-black text-white mt-0.5">
                  {evaluation.retrievalScore}% Memory Retention
                </div>
                <p className="text-xs text-slate-300 mt-1">{evaluation.feedback}</p>
              </div>
              <div className="text-right">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30">
                  {evaluation.recalledCount} Recalled • {evaluation.missedCount} Gaps
                </span>
              </div>
            </div>

            {/* Recalled Principles (Green) */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Successfully Retrieved ({evaluation.recalledPrinciples?.length || 0})
              </h4>
              <div className="space-y-2">
                {evaluation.recalledPrinciples?.map((r, i) => (
                  <div key={i} className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30 text-xs text-emerald-100 flex items-start gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                    <div>
                      <strong className="text-white">{r.principle}</strong>
                      {r.studentMentioned && (
                        <p className="text-emerald-300/80 text-[11px] mt-0.5">
                          Matched: &ldquo;{r.studentMentioned}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Forgotten / Missed Principles (Red - High Priority) */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-rose-400 mb-2 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                Forgotten First Principles ({evaluation.missedPrinciples?.length || 0})
              </h4>
              <div className="space-y-2">
                {evaluation.missedPrinciples?.map((m, i) => (
                  <div key={i} className="p-3 rounded-lg bg-rose-950/30 border border-rose-500/40 text-xs text-rose-100">
                    <div className="flex items-center justify-between mb-1">
                      <strong className="text-white font-bold">{m.principle}</strong>
                      <span className="text-[10px] font-bold text-rose-300 px-2 py-0.5 rounded bg-rose-900/50 border border-rose-700">
                        CRITICAL GAP
                      </span>
                    </div>
                    <p className="text-rose-200/90 leading-relaxed mb-2">{m.whyCrucial}</p>
                    {m.flashcardTrigger && (
                      <div className="p-2 rounded bg-slate-900/90 border border-rose-500/20 text-[11px] text-slate-300">
                        <span className="text-amber-400 font-semibold">⚡ Spaced Trigger:</span> {m.flashcardTrigger}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
              <button
                onClick={handleReset}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 flex items-center gap-1.5 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Blurt Again</span>
              </button>

              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 shadow-md transition"
              >
                Done Reviewing
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};
