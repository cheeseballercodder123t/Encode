'use client';
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Brain, Star, TrendingUp, TrendingDown, Minus, Sparkles, X, BarChart2, Loader2 } from 'lucide-react';

interface PerStageGrade {
  stageTitle: string;
  grade: 'mastered' | 'good' | 'needs_elaboration';
  score: number;
  feedback: string;
}

export interface EndSessionReviewData {
  overallScore: number;
  analysis: string;
  perStageGrades: PerStageGrade[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  preSessionConfidence: number;
  sessionData: EndSessionReviewData | null;
  isLoading: boolean;
  topicSummary: string;
}

const GRADE_COLORS: Record<string, string> = {
  mastered: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  good: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  needs_elaboration: 'text-red-400 bg-red-500/10 border-red-500/30',
};

const GRADE_LABELS: Record<string, string> = {
  mastered: 'Mastered',
  good: 'Good',
  needs_elaboration: 'Needs Work',
};

export function EndSessionReviewModal({ isOpen, onClose, preSessionConfidence, sessionData, isLoading, topicSummary }: Props) {
  const confidenceLabel = ['Clueless', 'Shaky', 'Decent', 'Confident', 'Expert'][preSessionConfidence - 1] || '';
  const confidenceNorm = Math.round((preSessionConfidence / 5) * 100);
  const aiScore = sessionData?.overallScore || 0;
  const delta = aiScore - confidenceNorm;

  const DeltaIcon = delta > 10 ? TrendingUp : delta < -10 ? TrendingDown : Minus;
  const deltaColor = delta > 10 ? 'text-emerald-400' : delta < -10 ? 'text-red-400' : 'text-slate-400';
  const deltaLabel = delta > 10
    ? 'You underestimated yourself — your actual grasp is stronger than you thought!'
    : delta < -10
    ? 'You overestimated your knowledge — this is common and normal. Revisit the weaker stages.'
    : 'Your self-assessment was well-calibrated. Solid metacognitive awareness.';

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 30 }}
          className="w-full max-w-2xl bg-[#0F111A] border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          <div className="p-5 border-b border-slate-800 bg-[#131622] flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/30 rounded-xl">
              <Brain className="w-5 h-5 text-indigo-400 animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Session Performance Review</h3>
              <p className="text-xs text-slate-400 line-clamp-1">{topicSummary}</p>
            </div>
            <button onClick={onClose} className="ml-auto p-2 text-slate-500 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 p-5 space-y-5">
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                <p className="text-sm">Analyzing your session with the Feynman evaluator...</p>
              </div>
            )}

            {!isLoading && sessionData && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 space-y-3">
                    <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Your Pre-session Confidence</p>
                    <div className="flex items-center gap-1.5">
                      {[1,2,3,4,5].map(n => (
                        <Star key={n} className={`w-5 h-5 ${n <= preSessionConfidence ? 'text-amber-400 fill-amber-400' : 'text-slate-700 fill-slate-800'}`} />
                      ))}
                    </div>
                    <div>
                      <p className="text-2xl font-black text-amber-400">{preSessionConfidence}<span className="text-base font-normal text-slate-500">/5</span></p>
                      <p className="text-xs text-slate-400">{confidenceLabel}</p>
                    </div>
                  </div>

                  <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 space-y-3">
                    <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">AI Performance Score</p>
                    <div className="w-full bg-slate-700/50 rounded-full h-2">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${aiScore}%` }}
                        transition={{ duration: 1, ease: 'easeOut' }}
                        className={`h-2 rounded-full ${aiScore >= 80 ? 'bg-emerald-500' : aiScore >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                      />
                    </div>
                    <div>
                      <p className="text-2xl font-black text-white">{aiScore}<span className="text-base font-normal text-slate-500">/100</span></p>
                      <p className="text-xs text-slate-400">{aiScore >= 80 ? 'Excellent grasp' : aiScore >= 60 ? 'Solid foundation' : 'Needs more encoding'}</p>
                    </div>
                  </div>
                </div>

                <div className={`flex items-start gap-3 rounded-2xl p-4 border ${delta > 10 ? 'bg-emerald-500/5 border-emerald-500/20' : delta < -10 ? 'bg-red-500/5 border-red-500/20' : 'bg-slate-800/30 border-slate-700/50'}`}>
                  <DeltaIcon className={`w-5 h-5 mt-0.5 shrink-0 ${deltaColor}`} />
                  <div>
                    <p className={`text-sm font-semibold ${deltaColor}`}>
                      {delta > 10 ? `+${delta} pts above your estimate` : delta < -10 ? `${Math.abs(delta)} pts below your estimate` : 'Calibration: On target'}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{deltaLabel}</p>
                  </div>
                </div>

                <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">AI Analysis</p>
                  </div>
                  <p className="text-sm text-slate-200 leading-relaxed font-serif">{sessionData.analysis}</p>
                </div>

                {sessionData.perStageGrades && sessionData.perStageGrades.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <BarChart2 className="w-4 h-4 text-slate-400" />
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Stage Breakdown</p>
                    </div>
                    <div className="space-y-2">
                      {sessionData.perStageGrades.map((g, i) => (
                        <div key={i} className="flex items-start gap-3 bg-slate-800/30 border border-slate-700/40 rounded-xl p-3">
                          <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border shrink-0 ${GRADE_COLORS[g.grade] || 'text-slate-300'}`}>
                            {GRADE_LABELS[g.grade] || g.grade}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-slate-200 font-medium truncate">{g.stageTitle}</p>
                            <p className="text-xs text-slate-400 mt-0.5 font-serif">{g.feedback}</p>
                          </div>
                          <span className="text-sm font-black text-slate-300 shrink-0">{g.score}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="p-4 border-t border-slate-800 flex justify-end">
            <button onClick={onClose} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold transition-colors cursor-pointer">
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
