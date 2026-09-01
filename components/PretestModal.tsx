import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Zap, 
  HelpCircle, 
  CheckCircle2, 
  ArrowRight, 
  Sparkles, 
  X,
  AlertCircle,
  Brain,
  Lock,
  Unlock
} from 'lucide-react';
import { PretestSession, PretestQuestion } from '@/lib/types';
import { sound, playSound } from '@/lib/audio';

interface PretestModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: PretestSession | null;
  onPretestComplete: () => void;
}

export const PretestModal: React.FC<PretestModalProps> = ({
  isOpen,
  onClose,
  session,
  onPretestComplete,
}) => {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  if (!isOpen || !session) return null;

  const totalQuestions = session.questions.length;
  const answeredCount = Object.keys(revealed).length;
  const allAnswered = totalQuestions > 0 && answeredCount >= totalQuestions;

  const handleRevealAnswer = (qId: string) => {
    playSound('correct');
    setRevealed(prev => ({ ...prev, [qId]: true }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-indigo-500/30 p-6 shadow-2xl shadow-indigo-500/10 text-slate-100 relative my-8"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  The Pre-Testing Effect
                </span>
                <span className="text-xs text-slate-400">Productive Failure Drill</span>
              </div>
              <h2 className="text-lg font-bold text-white mt-0.5">
                Pre-Encoding Diagnostic: {session.topic}
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

        {/* Cognitive Science Explanation */}
        <div className="rounded-xl bg-indigo-950/30 border border-indigo-500/30 p-4 mb-6 text-xs text-indigo-200/90 flex items-start gap-3">
          <Brain className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-indigo-300">
              Why Guessing Before Studying Triples Retention (Bjork, 2009):
            </p>
            <p className="mt-1 leading-relaxed text-indigo-200/70">
              {session.scientificRationale || "Generating an initial hypothesis activates semantic retrieval pathways in the brain. Even if you guess incorrectly, your neural network is primed to absorb the first-principles causal mechanism."}
            </p>
          </div>
        </div>

        {/* Questions List */}
        <div className="space-y-6 max-h-[50vh] overflow-y-auto pr-1">
          {session.questions.map((q: PretestQuestion, idx: number) => {
            const isRevealed = revealed[q.id];
            const currentGuess = answers[q.id] || '';

            return (
              <div 
                key={q.id || idx}
                className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-4 transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-indigo-400">
                    Challenge Question #{q.questionNumber || idx + 1}
                  </span>
                  {isRevealed ? (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                      <Unlock className="w-3.5 h-3.5" /> Primed & Unlocked
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-400">
                      <Lock className="w-3.5 h-3.5" /> Predict to Unlock
                    </span>
                  )}
                </div>

                <p className="text-sm font-semibold text-white mb-3">
                  {q.questionPrompt}
                </p>

                {/* Hypothesizing Input */}
                {!isRevealed ? (
                  <div className="space-y-2">
                    <textarea
                      value={currentGuess}
                      onChange={(e) => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                      placeholder="Take a guess at the causal mechanism (don't worry about being wrong!)..."
                      className="w-full h-20 p-3 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition resize-none"
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleRevealAnswer(q.id)}
                        disabled={!currentGuess.trim()}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-1.5"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>Lock in Guess & Reveal First Principle</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* User's guess */}
                    <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs text-slate-400">
                      <span className="font-semibold text-slate-300">Your Initial Hypothesis:</span> {currentGuess}
                    </div>

                    {/* Common Misconception Trap */}
                    <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-500/30 text-xs text-amber-200/90">
                      <span className="font-bold text-amber-400 block mb-1">⚠️ Common Intuitive Trap:</span>
                      {q.subtleTrap}
                    </div>

                    {/* True First Principle */}
                    <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-xs text-emerald-200/90">
                      <span className="font-bold text-emerald-400 block mb-1">✨ True First-Principles Mechanism:</span>
                      {q.firstPrincipleAnswer}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {answeredCount} of {totalQuestions} challenges primed
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800/80 transition"
            >
              Skip
            </button>
            <button
              onClick={() => {
                playSound('success');
                onPretestComplete();
              }}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 shadow-lg shadow-indigo-500/25 flex items-center gap-2 transition"
            >
              <span>{allAnswered ? "Reveal Encoded Schema" : "Continue to Schema"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
