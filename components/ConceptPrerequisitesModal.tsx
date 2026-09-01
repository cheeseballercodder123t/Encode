import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldAlert, 
  CheckCircle2, 
  HelpCircle, 
  BookOpen, 
  ArrowRight, 
  Sparkles, 
  X,
  AlertTriangle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { PrerequisitesReport, PrerequisiteItem } from '@/lib/types';
import { sound, playSound } from '@/lib/audio';

interface ConceptPrerequisitesModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: PrerequisitesReport | null;
  onProceedToEncode: () => void;
  isLoading?: boolean;
}

export const ConceptPrerequisitesModal: React.FC<ConceptPrerequisitesModalProps> = ({
  isOpen,
  onClose,
  report,
  onProceedToEncode,
  isLoading = false,
}) => {
  const [knownMap, setKnownMap] = useState<Record<string, boolean>>({});
  const [expandedPrimer, setExpandedPrimer] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleToggleKnown = (id: string, known: boolean) => {
    playSound('click');
    setKnownMap(prev => ({ ...prev, [id]: known }));
    if (!known) {
      setExpandedPrimer(id); // Auto-expand primer if they say "No, I don't understand this"
    }
  };

  const totalPrereqs = report?.prerequisites?.length || 0;
  const knownCount = Object.values(knownMap).filter(Boolean).length;
  const hasReviewedAll = totalPrereqs > 0 && Object.keys(knownMap).length >= totalPrereqs;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-amber-500/30 p-6 shadow-2xl shadow-amber-500/10 text-slate-100 relative my-8"
      >
        {/* Header Badge */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Prerequisite Audit
                </span>
                <span className="text-xs text-slate-400">Cognitive Load Diagnostic</span>
              </div>
              <h2 className="text-lg font-bold text-white mt-0.5">
                {report?.topicTitle ? `Prerequisites for "${report.topicTitle}"` : "Concept Prerequisites Checklist"}
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

        {/* Warning Intro Callout */}
        <div className="rounded-xl bg-amber-950/30 border border-amber-500/30 p-4 mb-6 text-sm text-amber-200/90 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-300">
              {report?.isReadyToEncode 
                ? "Preliminary foundational concepts detected." 
                : "Cognitive Science Warning: You May Not Be Ready to Encode This Yet."}
            </p>
            <p className="text-xs text-amber-200/70 mt-1 leading-relaxed">
              According to Sweller&apos;s Cognitive Load Theory, encoding advanced causal mechanisms without foundational schema causes cognitive overload. Verify whether you understand these building blocks before proceeding.
            </p>
          </div>
        </div>

        {/* Prerequisites Checklist */}
        <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
          {report?.prerequisites?.map((prereq: PrerequisiteItem, idx: number) => {
            const isKnown = knownMap[prereq.id];
            const isExpanded = expandedPrimer === prereq.id;

            return (
              <div
                key={prereq.id || idx}
                className={`rounded-xl border transition-all p-4 ${
                  isKnown === true
                    ? 'bg-slate-900/90 border-emerald-500/40 shadow-sm'
                    : isKnown === false
                    ? 'bg-amber-950/20 border-amber-500/40'
                    : 'bg-slate-800/40 border-slate-700/80 hover:border-slate-600'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-xs font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <h4 className="font-bold text-sm text-white">{prereq.name}</h4>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 pl-7">{prereq.importance}</p>
                  </div>

                  {/* Yes / No Toggle Buttons */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => handleToggleKnown(prereq.id, true)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                        isKnown === true
                          ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>I know this</span>
                    </button>
                    <button
                      onClick={() => handleToggleKnown(prereq.id, false)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                        isKnown === false
                          ? 'bg-amber-600 text-white shadow-sm shadow-amber-600/30'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                      }`}
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>Not sure</span>
                    </button>
                  </div>
                </div>

                {/* Quick 3-Sentence Primer Section */}
                <div className="mt-3 pl-7">
                  <button
                    onClick={() => setExpandedPrimer(isExpanded ? null : prereq.id)}
                    className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-medium transition"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>{isExpanded ? 'Hide 3-Sentence Primer' : 'Read Quick 3-Sentence Primer'}</span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-2.5 p-3 rounded-lg bg-blue-950/40 border border-blue-500/30 text-xs text-blue-100 leading-relaxed overflow-hidden"
                      >
                        <p className="font-semibold text-blue-300 mb-1 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5" />
                          Foundational Primer (First Principles):
                        </p>
                        <p>{prereq.primerSummary}</p>
                        {prereq.checkQuestion && (
                          <div className="mt-2 pt-2 border-t border-blue-800/40 text-[11px] text-blue-200/80">
                            <strong>Self-Check Question:</strong> {prereq.checkQuestion}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {knownCount} of {totalPrereqs} prerequisites confirmed
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                playSound('success');
                onProceedToEncode();
              }}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-500/25 flex items-center gap-2 transition"
            >
              <span>{hasReviewedAll ? "Start Cognitive Encoding" : "Proceed to Encoding"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
