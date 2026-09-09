import React, { useState } from 'react';
import { motion } from 'motion/react';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-chassis/80 p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl bg-deck border border-steel/30 p-6   text-bone relative my-8"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-steel pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-steel/20 border border-steel/40 flex items-center justify-center text-bone">
              <span className="text-amber font-bold font-mono">[ PEN ]</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider bg-steel/20 text-bone border border-steel/30">
                  The Blurting Method
                </span>
                <span className="text-xs text-solder">Free Recall Diagnostic</span>
              </div>
              <h2 className="text-lg font-bold text-bone mt-0.5">
                Blurting Canvas: {schemaTitle || "Active Topic"}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-solder hover:text-bone hover:bg-steel transition-none"
          >
            <span className="text-amber font-bold font-mono">[ X ]</span>
          </button>
        </div>

        {!evaluation ? (
          /* Blank Canvas Input Phase */
          <div className="space-y-4">
            <div className="p-3.5 bg-steel/30 border border-steel/30 text-xs text-bone leading-relaxed">
              <p className="font-bold text-bone mb-1 flex items-center gap-1.5">
                <span className="text-amber font-bold font-mono">[ BRAIN ]</span>
                The Rule of Pure Retrieval:
              </p>
              Close all tabs and notes. Write down absolutely everything you can remember about this concept from memory (mechanisms, formulas, key steps, edge cases). When you submit, the AI will differential-compare your blurt against the first-principles schema and highlight forgotten gaps in red.
            </div>

            <div>
              <label className="block text-xs font-semibold text-solder mb-1.5">
                Your Memory Blurt Dump:
              </label>
              <textarea
                value={blurtText}
                onChange={(e) => setBlurtText(e.target.value)}
                placeholder="Start typing from memory... What are the key stages? Why does it happen? What triggers each step?"
                className="w-full h-48 p-4 bg-chassis border border-steel text-sm text-bone placeholder-slate-500 focus:outline-none focus:border-steel transition-none resize-none font-mono leading-relaxed"
                autoFocus
              />
              <div className="flex justify-between items-center text-xs text-solder mt-1.5">
                <span>{blurtText.trim() ? blurtText.trim().split(/\s+/).length : 0} words retrieved</span>
                <span>Active Recall Protocol</span>
              </div>
            </div>

            <div className="pt-4 border-t border-steel flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-solder hover:text-bone bg-steel transition-none"
              >
                Close
              </button>
              <button
                onClick={handleAnalyzeBlurt}
                disabled={!blurtText.trim() || isAnalyzing}
                className="px-5 py-2.5 text-xs font-bold text-bone    hover: hover:   flex items-center gap-2 transition-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAnalyzing ? (
                  <>
                    <span className="text-amber font-bold font-mono">[ BUSY ]</span>
                    <span>Analyzing Retrieval Gaps...</span>
                  </>
                ) : (
                  <>
                    <span className="text-amber font-bold font-mono">[ * ]</span>
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
            <div className="p-4 border border-steel/40 flex items-center justify-between">
              <div>
                <span className="text-xs text-bone font-semibold uppercase tracking-wider">
                  Retrieval Completeness
                </span>
                <div className="text-2xl font-black text-bone mt-0.5">
                  {evaluation.retrievalScore}% Memory Retention
                </div>
                <p className="text-xs text-solder mt-1">{evaluation.feedback}</p>
              </div>
              <div className="text-right">
                <span className="px-3 py-1 text-xs font-bold bg-steel/20 text-bone border border-steel/30">
                  {evaluation.recalledCount} Recalled • {evaluation.missedCount} Gaps
                </span>
              </div>
            </div>

            {/* Recalled Principles (Green) */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber mb-2 flex items-center gap-1.5">
                <span className="text-amber font-bold font-mono">[ OK ]</span>
                Successfully Retrieved ({evaluation.recalledPrinciples?.length || 0})
              </h4>
              <div className="space-y-2">
                {evaluation.recalledPrinciples?.map((r, i) => (
                  <div key={i} className="p-3 bg-amber950/20 border border-amber/30 text-xs text-amber100 flex items-start gap-2">
                    <span className="w-2 h-2 bg-amber mt-1.5 flex-shrink-0" />
                    <div>
                      <strong className="text-bone">{r.principle}</strong>
                      {r.studentMentioned && (
                        <p className="text-amber300/80 text-[11px] mt-0.5">
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
              <h4 className="text-xs font-bold uppercase tracking-wider text-hazard400 mb-2 flex items-center gap-1.5">
                <span className="text-amber font-bold font-mono">[ ! ]</span>
                Forgotten First Principles ({evaluation.missedPrinciples?.length || 0})
              </h4>
              <div className="space-y-2">
                {evaluation.missedPrinciples?.map((m, i) => (
                  <div key={i} className="p-3 bg-hazard950/30 border border-hazard500/40 text-xs text-hazard100">
                    <div className="flex items-center justify-between mb-1">
                      <strong className="text-bone font-bold">{m.principle}</strong>
                      <span className="text-[10px] font-bold text-hazard300 px-2 py-0.5 bg-hazard900/50 border border-hazard700">
                        CRITICAL GAP
                      </span>
                    </div>
                    <p className="text-hazard200/90 leading-relaxed mb-2">{m.whyCrucial}</p>
                    {m.flashcardTrigger && (
                      <div className="p-2 bg-deck/90 border border-hazard500/20 text-[11px] text-solder">
                        <span className="text-amber font-semibold">[ ZAP ] Spaced Trigger:</span> {m.flashcardTrigger}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-steel flex justify-between items-center">
              <button
                onClick={handleReset}
                className="px-4 py-2 text-xs font-semibold text-solder hover:text-bone bg-steel hover:bg-steel flex items-center gap-1.5 transition-none"
              >
                <span className="text-amber font-bold font-mono">[ RESET ]</span>
                <span>Blurt Again</span>
              </button>

              <button
                onClick={onClose}
                className="px-5 py-2.5 text-xs font-bold text-bone    hover: hover:  transition-none"
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
