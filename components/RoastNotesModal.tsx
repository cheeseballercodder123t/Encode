'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Flame, 
  Sparkles, 
  AlertTriangle, 
  CheckCircle2, 
  HelpCircle, 
  ArrowRight, 
  Plus, 
  Check, 
  Quote, 
  RotateCcw,
  Zap,
  GraduationCap
} from 'lucide-react';
import { RoastReport, RoastCriticism } from '@/lib/types';
import { playSound } from '@/lib/audio';

interface RoastNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: RoastReport | null;
  loading: boolean;
  onInjectPatch: (patch: string) => void;
  onApplyAllPatchesAndEncode: (patches: string[]) => void;
  onProceedToEncode: () => void;
  onRetryRoast?: () => void;
}

export default function RoastNotesModal({
  isOpen,
  onClose,
  report,
  loading,
  onInjectPatch,
  onApplyAllPatchesAndEncode,
  onProceedToEncode,
  onRetryRoast,
}: RoastNotesModalProps) {
  const [injectedIds, setInjectedIds] = useState<string[]>([]);
  const [copiedQuote, setCopiedQuote] = useState(false);

  if (!isOpen) return null;

  const handleInjectSingle = (critique: RoastCriticism) => {
    if (!critique.suggestedPatch && !critique.fixTip) return;
    const textToInject = critique.suggestedPatch || critique.fixTip;
    onInjectPatch(textToInject);
    setInjectedIds(prev => [...prev, critique.id]);
    playSound('pop');
  };

  const handleApplyAll = () => {
    if (!report?.criticisms) return;
    const patches = report.criticisms
      .map(c => c.suggestedPatch || c.fixTip)
      .filter(Boolean) as string[];
    
    playSound('success');
    onApplyAllPatchesAndEncode(patches);
  };

  const getScoreColor = (score: number) => {
    if (score < 40) return { text: 'text-rose-400', bg: 'bg-rose-500/20', border: 'border-rose-500/40', label: 'Critical Academic CPR Required' };
    if (score < 70) return { text: 'text-amber-400', bg: 'bg-amber-500/20', border: 'border-amber-500/40', label: 'Passable (If Grader Has Cataracts)' };
    return { text: 'text-emerald-400', bg: 'bg-emerald-500/20', border: 'border-emerald-500/40', label: 'Suspiciously Rigorous' };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-3xl bg-slate-900 border border-orange-500/40 rounded-2xl shadow-2xl overflow-hidden my-6 flex flex-col max-h-[90vh]"
      >
        {/* Animated Fire Header */}
        <div className="p-4 sm:p-6 bg-gradient-to-r from-orange-950/80 via-red-950/60 to-slate-900 border-b border-orange-500/30 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-orange-600 to-red-600 flex items-center justify-center shadow-lg shadow-orange-600/30 shrink-0">
              <Flame className="w-6 h-6 text-amber-200 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-slate-100 flex items-center gap-1.5">
                  <span>Roast My Notes</span>
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 text-[10px] font-black uppercase tracking-wider">
                  Strict Professor Mode
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                <GraduationCap className="w-3.5 h-3.5 text-orange-400" />
                <span>{report?.professorTitle || "Office Hours with Tenured Faculty"}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 transition-colors cursor-pointer text-xs"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-slate-200">
          {loading ? (
            <div className="py-16 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center animate-bounce">
                <Flame className="w-7 h-7 text-orange-400" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-100">
                  Professor is sharpening red pen...
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Hunting for hand-wavy assumptions, missing causal links, and buzzword fluff in your notes.
                </p>
              </div>
            </div>
          ) : report ? (
            <>
              {/* Verdict & Score Banner */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Score Card */}
                {(() => {
                  const scoreConfig = getScoreColor(report.preparednessScore);
                  return (
                    <div className={`p-4 rounded-2xl border ${scoreConfig.border} ${scoreConfig.bg} flex flex-col justify-between space-y-2`}>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Rigor & Preparedness Score
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-4xl font-black ${scoreConfig.text}`}>
                          {report.preparednessScore}%
                        </span>
                        <span className="text-xs text-slate-400 font-medium">/ 100</span>
                      </div>
                      <span className={`text-[11px] font-bold ${scoreConfig.text}`}>
                        {scoreConfig.label}
                      </span>
                    </div>
                  );
                })()}

                {/* Lethal Quote */}
                <div className="md:col-span-2 p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-orange-400 font-bold">
                    <Quote className="w-3.5 h-3.5" />
                    <span>Professor&apos;s Core Verdict</span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-200 font-medium italic leading-relaxed">
                    &ldquo;{report.overallVerdict}&rdquo;
                  </p>
                  <div className="pt-2 border-t border-slate-900 text-[11px] text-amber-300/90 font-mono">
                    🔥 &ldquo;{report.lethalQuote}&rdquo;
                  </div>
                </div>
              </div>

              {/* Critiques Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    <span>Identified Gaps & Flawed Assumptions ({report.criticisms.length})</span>
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    Click patch to inject into notes
                  </span>
                </div>

                <div className="space-y-3">
                  {report.criticisms.map((critique) => {
                    const isPatched = injectedIds.includes(critique.id);
                    return (
                      <div
                        key={critique.id}
                        className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition-all space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide bg-orange-500/20 text-orange-300 border border-orange-500/30">
                              {critique.categoryLabel}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              critique.severity === 'brutal' 
                                ? 'bg-red-500/20 text-red-300 border border-red-500/30' 
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}>
                              {critique.severity === 'brutal' ? '🔥 Fatal Gap' : '⚠️ Vague'}
                            </span>
                          </div>

                          {critique.suggestedPatch && (
                            <button
                              type="button"
                              onClick={() => handleInjectSingle(critique)}
                              disabled={isPatched}
                              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                isPatched
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                              }`}
                            >
                              {isPatched ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span>Injected</span>
                                </>
                              ) : (
                                <>
                                  <Plus className="w-3 h-3 text-indigo-400" />
                                  <span>Inject Fix</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        {/* Called out quote */}
                        {critique.quoteOrTarget && (
                          <div className="text-xs bg-slate-900 border border-slate-800 p-2 rounded-lg text-slate-300 font-mono">
                            <span className="text-slate-500">Target: </span>
                            &ldquo;{critique.quoteOrTarget}&rdquo;
                          </div>
                        )}

                        {/* Snarky comment */}
                        <p className="text-xs sm:text-sm text-amber-200/90 leading-relaxed font-medium">
                          {critique.roastComment}
                        </p>

                        {/* First Principles Fix Tip */}
                        <div className="p-2.5 rounded-lg bg-indigo-950/30 border border-indigo-500/30 text-xs space-y-1">
                          <span className="text-[10px] font-black uppercase text-indigo-400 block">
                            💡 First Principles Fix:
                          </span>
                          <p className="text-indigo-200 leading-normal">
                            {critique.fixTip}
                          </p>
                          {critique.suggestedPatch && (
                            <div className="pt-1 text-[11px] text-slate-300 italic">
                              <strong className="text-slate-400 font-semibold not-italic">Suggested text: </strong>
                              {critique.suggestedPatch}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Begrudging Compliment */}
              {report.begrudgingCompliment && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-3 text-xs">
                  <span className="text-lg">😏</span>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Begrudging Silver Lining
                    </span>
                    <span className="text-slate-300 italic">
                      &ldquo;{report.begrudgingCompliment}&rdquo;
                    </span>
                  </div>
                </div>
              )}

              {/* Actionable Recommendations */}
              {report.actionableRecommendations?.length > 0 && (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                    Core Conceptual Injections Recommended:
                  </span>
                  <ul className="space-y-1 text-xs text-slate-300 list-disc list-inside">
                    {report.actionableRecommendations.map((rec, i) => (
                      <li key={i} className="leading-relaxed">{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="py-12 text-center text-slate-400 text-xs">
              No roast report generated yet.
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {report && (
          <div className="p-4 sm:p-5 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-900 border border-slate-800 cursor-pointer"
            >
              Close & Edit Manually
            </button>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={handleApplyAll}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white font-bold text-xs shadow-lg shadow-orange-600/20 transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Auto-Patch Notes & Encode</span>
              </button>

              <button
                type="button"
                onClick={onProceedToEncode}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 cursor-pointer"
              >
                <span>Encode As-Is</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
