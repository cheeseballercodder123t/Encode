'use client';
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckSquare, Square, Brain, AlertCircle, Sparkles } from 'lucide-react';

interface Props {
  isOpen: boolean;
  stageNumber: number;
  stageTitle: string;
  previousPremise?: string;
  onConfirm: (latencyMs: number, summary: string) => void;
}

export function ReadinessModal({ isOpen, stageNumber, stageTitle, previousPremise, onConfirm }: Props) {
  const [summary, setSummary] = useState('');
  const [checked, setChecked] = useState(false);
  const [shaking, setShaking] = useState(false);
  const openedAt = useRef<number>(0);
  const shakeTimer = useRef<any>(null);

  useEffect(() => {
    if (!isOpen) { 
      setSummary(''); 
      setChecked(false); 
      setShaking(false);
      return; 
    }
    openedAt.current = Date.now();
    shakeTimer.current = setTimeout(() => setShaking(true), 10000);
    return () => {
      if (shakeTimer.current) clearTimeout(shakeTimer.current);
    };
  }, [isOpen]);

  const canConfirm = checked && summary.trim().length >= 3;

  const handleConfirm = () => {
    if (!canConfirm) return;
    const latencyMs = Date.now() - openedAt.current;
    onConfirm(latencyMs, summary.trim());
  };

  const wordCount = summary.trim() ? summary.trim().split(/\s+/).length : 0;
  const overLimit = wordCount > 18;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0, x: shaking ? [0, -8, 8, -6, 6, 0] : 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="w-full max-w-md bg-[#0F111A] border border-slate-700 rounded-2xl shadow-2xl overflow-hidden"
        >
          <div className="p-5 border-b border-slate-800 bg-[#131622] flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
              <Brain className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Readiness Check: Stage {stageNumber}</h3>
              <p className="text-xs text-slate-400">{stageTitle}</p>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {stageNumber > 1 && previousPremise && (
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3">
                <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold mb-1">Previous Stage Challenge</p>
                <p className="text-xs text-slate-300 italic">"{previousPremise}"</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm text-slate-300 font-medium">
                {stageNumber === 1 ? "In a few words, what are you setting out to understand?" : "Summarize the previous takeaway in ≤15 words:"}
              </label>
              <textarea
                value={summary}
                onChange={e => setSummary(e.target.value)}
                placeholder={stageNumber === 1 ? 'e.g., How action potentials trigger depolarization...' : 'e.g., Mitochondria act as power generators burning fuel for ATP.'}
                rows={2}
                className={`w-full bg-slate-800/50 border rounded-xl p-3 text-sm text-slate-100 placeholder-slate-500 resize-none focus:outline-none focus:ring-2 transition-colors ${
                  overLimit ? 'border-red-500/60 focus:ring-red-500/40' : 'border-slate-700 focus:ring-emerald-500/40'
                }`}
              />
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-500">Forced retrieval primes encoding</span>
                <span className={`font-mono ${overLimit ? 'text-red-400 font-bold' : 'text-slate-500'}`}>
                  {wordCount}/15 words
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setChecked(c => !c)}
              className="flex items-start gap-3 w-full text-left group p-2 rounded-xl hover:bg-slate-800/40 transition-colors"
            >
              <div className="mt-0.5 text-emerald-400 group-hover:text-emerald-300 transition-colors shrink-0">
                {checked ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                I am actively focused and ready to deduce the next cognitive schema.
              </p>
            </button>

            {shaking && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3"
              >
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <p className="text-xs text-amber-300">Retrieval practice only works when you actively generate the memory instead of rushing through.</p>
              </motion.div>
            )}
          </div>

          <div className="p-4 border-t border-slate-800 flex justify-end">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-colors shadow-lg shadow-emerald-600/20"
            >
              <Sparkles className="w-4 h-4" />
              I'm Ready →
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
