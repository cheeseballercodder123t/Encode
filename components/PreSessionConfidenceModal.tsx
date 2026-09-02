'use client';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Brain, Star, Zap, Clock } from 'lucide-react';

interface Props {
  isOpen: boolean;
  topicPreview: string;
  onConfirm: (stars: number) => void;
  onSkip: () => void;
}

export function PreSessionConfidenceModal({ isOpen, topicPreview, onConfirm, onSkip }: Props) {
  const [hovered, setHovered] = useState(0);
  const [selected, setSelected] = useState(0);
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    if (!isOpen) { setSelected(0); setHovered(0); setCountdown(10); return; }
    const t = setInterval(() => setCountdown(c => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [isOpen]);

  useEffect(() => {
    if (countdown <= 0 && isOpen) onConfirm(selected || 3);
  }, [countdown, isOpen, selected, onConfirm]);

  const labels = ['Clueless 😅', 'Shaky 🌀', 'Decent 🤔', 'Confident 💪', 'Expert 🔥'];

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="w-full max-w-md bg-[#0F111A] border border-slate-700 rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="p-5 border-b border-slate-800 bg-[#131622] flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/30 rounded-xl">
              <Brain className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Before we begin...</h3>
              <p className="text-xs text-slate-400">Rate your current confidence so the AI calibrates scaffolding</p>
            </div>
            <div className="ml-auto flex items-center gap-1 text-slate-500 text-xs font-mono">
              <Clock className="w-3.5 h-3.5" />
              <span>{countdown}s</span>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Topic preview */}
            {topicPreview && (
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3">
                <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold mb-1">Target Material</p>
                <p className="text-sm text-slate-200 line-clamp-2">{topicPreview}</p>
              </div>
            )}

            {/* Science note */}
            <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-3">
              <p className="text-[11px] text-indigo-300 leading-relaxed">
                <span className="font-semibold text-indigo-200">Metacognitive Calibration (Nelson & Narens):</span> Assessing what you know before learning primes your memory retrieval systems.
              </p>
            </div>

            {/* Stars */}
            <div className="space-y-3">
              <p className="text-sm text-slate-300 font-medium text-center">How confident are you in this topic right now?</p>
              <div className="flex items-center justify-center gap-2.5">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSelected(n)}
                    onMouseEnter={() => setHovered(n)}
                    onMouseLeave={() => setHovered(0)}
                    className="transition-transform hover:scale-125 focus:outline-none p-1"
                  >
                    <Star
                      className={`w-8 h-8 transition-colors ${
                        n <= (hovered || selected)
                          ? 'text-amber-400 fill-amber-400'
                          : 'text-slate-700 fill-slate-800'
                      }`}
                    />
                  </button>
                ))}
              </div>
              {(hovered > 0 || selected > 0) && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center text-xs text-amber-300 font-semibold"
                >
                  {labels[(hovered || selected) - 1]}
                </motion.p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-800 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onSkip}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={() => onConfirm(selected || 3)}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold transition-colors shadow-lg shadow-indigo-600/30"
            >
              <Zap className="w-4 h-4" />
              Begin Workout
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
