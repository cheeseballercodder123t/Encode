import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
              <span className="text-amber font-bold font-mono">[ ZAP ]</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider bg-steel/20 text-bone border border-steel/30">
                  The Pre-Testing Effect
                </span>
                <span className="text-xs text-solder">Productive Failure Drill</span>
              </div>
              <h2 className="text-lg font-bold text-bone mt-0.5">
                Pre-Encoding Diagnostic: {session.topic}
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

        {/* Cognitive Science Explanation */}
        <div className=" bg-steel/30 border border-steel/30 p-4 mb-6 text-xs text-bone/90 flex items-start gap-3">
          <span className="text-amber font-bold font-mono">[ BRAIN ]</span>
          <div>
            <p className="font-semibold text-bone">
              Why Guessing Before Studying Triples Retention (Bjork, 2009):
            </p>
            <p className="mt-1 leading-relaxed text-bone/70">
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
                className=" border border-steel/80 bg-steel/40 p-4 transition-none-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-bone">
                    Challenge Question #{q.questionNumber || idx + 1}
                  </span>
                  {isRevealed ? (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-amber">
                      <span className="text-amber font-bold font-mono">[ UNLOCK ]</span> Primed & Unlocked
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-amber">
                      <span className="text-amber font-bold font-mono">[ LOCK ]</span> Predict to Unlock
                    </span>
                  )}
                </div>

                <p className="text-sm font-semibold text-bone mb-3">
                  {q.questionPrompt}
                </p>

                {/* Hypothesizing Input */}
                {!isRevealed ? (
                  <div className="space-y-2">
                    <textarea
                      value={currentGuess}
                      onChange={(e) => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                      placeholder="Take a guess at the causal mechanism (don't worry about being wrong!)..."
                      className="w-full h-20 p-3 bg-deck border border-steel text-xs text-bone placeholder-slate-500 focus:outline-none focus:border-steel transition-none resize-none"
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleRevealAnswer(q.id)}
                        disabled={!currentGuess.trim()}
                        className="px-3.5 py-1.5 text-xs font-bold text-bone bg-steel hover:bg-steel disabled:opacity-50 disabled:cursor-not-allowed transition-none flex items-center gap-1.5"
                      >
                        <span className="text-amber font-bold font-mono">[ ZAP ]</span>
                        <span>Lock in Guess & Reveal First Principle</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* User's guess */}
                    <div className="p-2.5 bg-deck/80 border border-steel text-xs text-solder">
                      <span className="font-semibold text-solder">Your Initial Hypothesis:</span> {currentGuess}
                    </div>

                    {/* Common Misconception Trap */}
                    <div className="p-3 bg-amber/30 border border-amber/30 text-xs text-amber/90">
                      <span className="font-bold text-amber block mb-1">[ ! ] Common Intuitive Trap:</span>
                      {q.subtleTrap}
                    </div>

                    {/* True First Principle */}
                    <div className="p-3 bg-amber950/30 border border-amber/30 text-xs text-amber200/90">
                      <span className="font-bold text-amber block mb-1">✨ True First-Principles Mechanism:</span>
                      {q.firstPrincipleAnswer}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-steel flex items-center justify-between">
          <div className="text-xs text-solder">
            {answeredCount} of {totalQuestions} challenges primed
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-solder hover:text-bone bg-steel/80 transition-none"
            >
              Skip
            </button>
            <button
              onClick={() => {
                playSound('success');
                onPretestComplete();
              }}
              className="px-5 py-2.5 text-xs font-bold text-bone    hover: hover:   flex items-center gap-2 transition-none"
            >
              <span>{allAnswered ? "Reveal Encoded Schema" : "Continue to Schema"}</span>
              <span className="text-amber font-bold font-mono">[ NEXT ]</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
