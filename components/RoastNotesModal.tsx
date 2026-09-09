'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
    if (score < 40) return { text: 'text-hazard400', bg: 'bg-hazard500/20', border: 'border-hazard500/40', label: 'Critical Academic CPR Required' };
    if (score < 70) return { text: 'text-amber', bg: 'bg-amber/20', border: 'border-amber/40', label: 'Passable (If Grader Has Cataracts)' };
    return { text: 'text-amber', bg: 'bg-amber/20', border: 'border-amber/40', label: 'Suspiciously Rigorous' };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-chassis/85 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-3xl bg-deck border border-hazard500/40 overflow-hidden my-6 flex flex-col max-h-[90vh]"
      >
        {/* Animated Fire Header */}
        <div className="p-4 sm:p-6 border-b border-hazard500/30 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 flex items-center justify-center   shrink-0">
              <span className="text-amber font-bold font-mono">[ FLAME ]</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-bone flex items-center gap-1.5">
                  <span>Roast My Notes</span>
                </h2>
                <span className="px-2 py-0.5 bg-hazard500/20 text-hazard300 border border-hazard500/30 text-[10px] font-black uppercase tracking-wider">
                  Strict Professor Mode
                </span>
              </div>
              <p className="text-xs text-solder mt-0.5 flex items-center gap-1">
                <span className="text-amber font-bold font-mono">[ CAP ]</span>
                <span>{report?.professorTitle || "Office Hours with Tenured Faculty"}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-solder hover:text-bone p-2 bg-steel/80 hover:bg-steel transition-none-colors cursor-pointer text-xs"
          >
            [ X ]
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-bone">
          {loading ? (
            <div className="py-16 text-center space-y-4">
              <div className="w-14 h-14 mx-auto bg-hazard500/20 border border-hazard500/40 flex items-center justify-center ">
                <span className="text-amber font-bold font-mono">[ FLAME ]</span>
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-bone">
                  Professor is sharpening red pen...
                </h3>
                <p className="text-xs text-solder max-w-sm mx-auto">
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
                    <div className={`p-4  border ${scoreConfig.border} ${scoreConfig.bg} flex flex-col justify-between space-y-2`}>
                      <span className="text-[10px] font-bold text-solder uppercase tracking-wider">
                        Rigor & Preparedness Score
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-4xl font-black ${scoreConfig.text}`}>
                          {report.preparednessScore}%
                        </span>
                        <span className="text-xs text-solder font-medium">/ 100</span>
                      </div>
                      <span className={`text-[11px] font-bold ${scoreConfig.text}`}>
                        {scoreConfig.label}
                      </span>
                    </div>
                  );
                })()}

                {/* Lethal Quote */}
                <div className="md:col-span-2 p-4 bg-chassis border border-steel flex flex-col justify-between space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-hazard400 font-bold">
                    <span className="text-amber font-bold font-mono">[ QUOTE ]</span>
                    <span>Professor&apos;s Core Verdict</span>
                  </div>
                  <p className="text-xs sm:text-sm text-bone font-medium italic leading-relaxed">
                    &ldquo;{report.overallVerdict}&rdquo;
                  </p>
                  <div className="pt-2 border-t border-steel text-[11px] text-amber/90 font-mono">
                    [ FLAME ] &ldquo;{report.lethalQuote}&rdquo;
                  </div>
                </div>
              </div>

              {/* Critiques Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-solder flex items-center gap-1.5">
                    <span className="text-amber font-bold font-mono">[ ! ]</span>
                    <span>Identified Gaps & Flawed Assumptions ({report.criticisms.length})</span>
                  </h4>
                  <span className="text-[11px] text-solder">
                    Click patch to inject into notes
                  </span>
                </div>

                <div className="space-y-3">
                  {report.criticisms.map((critique) => {
                    const isPatched = injectedIds.includes(critique.id);
                    return (
                      <div
                        key={critique.id}
                        className="p-4 bg-chassis border border-steel hover:border-steel transition-none-all space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wide bg-hazard500/20 text-hazard300 border border-hazard500/30">
                              {critique.categoryLabel}
                            </span>
                            <span className={`px-2 py-0.5  text-[10px] font-bold uppercase ${
                              critique.severity === 'brutal' 
                                ? 'bg-hazard500/20 text-hazard300 border border-hazard500/30' 
                                : 'bg-amber/20 text-amber border border-amber/30'
                            }`}>
                              {critique.severity === 'brutal' ? '[ FLAME ] Fatal Gap' : '[ ! ] Vague'}
                            </span>
                          </div>

                          {critique.suggestedPatch && (
                            <button
                              type="button"
                              onClick={() => handleInjectSingle(critique)}
                              disabled={isPatched}
                              className={`flex items-center gap-1 px-2.5 py-1  text-xs font-bold transition-none-all cursor-pointer ${
                                isPatched
                                  ? 'bg-amber/20 text-amber300 border border-amber/40'
                                  : 'bg-steel hover:bg-steel text-bone border border-steel'
                              }`}
                            >
                              {isPatched ? (
                                <>
                                  <span className="text-amber font-bold font-mono">[ OK ]</span>
                                  <span>Injected</span>
                                </>
                              ) : (
                                <>
                                  <span className="text-amber font-bold font-mono">[ + ]</span>
                                  <span>Inject Fix</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        {/* Called out quote */}
                        {critique.quoteOrTarget && (
                          <div className="text-xs bg-deck border border-steel p-2 text-solder font-mono">
                            <span className="text-solder">Target: </span>
                            &ldquo;{critique.quoteOrTarget}&rdquo;
                          </div>
                        )}

                        {/* Snarky comment */}
                        <p className="text-xs sm:text-sm text-amber/90 leading-relaxed font-medium">
                          {critique.roastComment}
                        </p>

                        {/* First Principles Fix Tip */}
                        <div className="p-2.5 bg-steel/30 border border-steel/30 text-xs space-y-1">
                          <span className="text-[10px] font-black uppercase text-bone block">
                            💡 First Principles Fix:
                          </span>
                          <p className="text-bone leading-normal">
                            {critique.fixTip}
                          </p>
                          {critique.suggestedPatch && (
                            <div className="pt-1 text-[11px] text-solder italic">
                              <strong className="text-solder font-semibold not-italic">Suggested text: </strong>
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
                <div className="p-3.5 bg-chassis border border-steel flex items-center gap-3 text-xs">
                  <span className="text-lg">😏</span>
                  <div>
                    <span className="text-[10px] font-bold text-solder uppercase tracking-wider block">
                      Begrudging Silver Lining
                    </span>
                    <span className="text-solder italic">
                      &ldquo;{report.begrudgingCompliment}&rdquo;
                    </span>
                  </div>
                </div>
              )}

              {/* Actionable Recommendations */}
              {report.actionableRecommendations?.length > 0 && (
                <div className="p-4 bg-chassis border border-steel space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-solder block">
                    Core Conceptual Injections Recommended:
                  </span>
                  <ul className="space-y-1 text-xs text-solder list-disc list-inside">
                    {report.actionableRecommendations.map((rec, i) => (
                      <li key={i} className="leading-relaxed">{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="py-12 text-center text-solder text-xs">
              No roast report generated yet.
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {report && (
          <div className="p-4 sm:p-5 bg-chassis border-t border-steel flex flex-col sm:flex-row items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-solder hover:text-bone bg-deck border border-steel cursor-pointer"
            >
              Close & Edit Manually
            </button>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={handleApplyAll}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 hover: hover: text-bone font-bold text-xs   transition-none-all cursor-pointer"
              >
                <span className="text-amber font-bold font-mono">[ * ]</span>
                <span>Auto-Patch Notes & Encode</span>
              </button>

              <button
                type="button"
                onClick={onProceedToEncode}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-steel hover:bg-steel text-bone font-bold text-xs border border-steel cursor-pointer"
              >
                <span>Encode As-Is</span>
                <span className="text-amber font-bold font-mono">[ NEXT ]</span>
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
