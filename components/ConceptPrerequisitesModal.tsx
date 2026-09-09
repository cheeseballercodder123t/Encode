import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-chassis/80 p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl bg-deck border border-amber/30 p-6   text-bone relative my-8"
      >
        {/* Header Badge */}
        <div className="flex items-center justify-between border-b border-steel pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber/20 border border-amber/40 flex items-center justify-center text-amber">
              <span className="text-amber font-bold font-mono">[ ! ]</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider bg-amber/20 text-amber border border-amber/30">
                  Prerequisite Audit
                </span>
                <span className="text-xs text-solder">Cognitive Load Diagnostic</span>
              </div>
              <h2 className="text-lg font-bold text-bone mt-0.5">
                {report?.topicTitle ? `Prerequisites for "${report.topicTitle}"` : "Concept Prerequisites Checklist"}
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

        {/* Warning Intro Callout */}
        <div className=" bg-amber/30 border border-amber/30 p-4 mb-6 text-sm text-amber/90 flex items-start gap-3">
          <span className="text-amber font-bold font-mono">[ ! ]</span>
          <div>
            <p className="font-semibold text-amber">
              {report?.isReadyToEncode 
                ? "Preliminary foundational concepts detected." 
                : "Cognitive Science Warning: You May Not Be Ready to Encode This Yet."}
            </p>
            <p className="text-xs text-amber/70 mt-1 leading-relaxed">
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
                className={` border transition-none-all p-4 ${
                  isKnown === true
                    ? 'bg-deck/90 border-amber/40 '
                    : isKnown === false
                    ? 'bg-amber/20 border-amber/40'
                    : 'bg-steel/40 border-steel/80 hover:border-steel'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 bg-steel text-solder border border-steel text-xs font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <h4 className="font-bold text-sm text-bone">{prereq.name}</h4>
                    </div>
                    <p className="text-xs text-solder mt-1 pl-7">{prereq.importance}</p>
                  </div>

                  {/* Yes / No Toggle Buttons */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => handleToggleKnown(prereq.id, true)}
                      className={`px-3 py-1.5  text-xs font-semibold flex items-center gap-1.5 transition-none ${
                        isKnown === true
                          ? 'bg-amber600 text-bone  '
                          : 'bg-steel text-solder hover:bg-steel border border-steel'
                      }`}
                    >
                      <span className="text-amber font-bold font-mono">[ OK ]</span>
                      <span>I know this</span>
                    </button>
                    <button
                      onClick={() => handleToggleKnown(prereq.id, false)}
                      className={`px-3 py-1.5  text-xs font-semibold flex items-center gap-1.5 transition-none ${
                        isKnown === false
                          ? 'bg-amber text-bone  '
                          : 'bg-steel text-solder hover:bg-steel border border-steel'
                      }`}
                    >
                      <span className="text-amber font-bold font-mono">[ ? ]</span>
                      <span>Not sure</span>
                    </button>
                  </div>
                </div>

                {/* Quick 3-Sentence Primer Section */}
                <div className="mt-3 pl-7">
                  <button
                    onClick={() => setExpandedPrimer(isExpanded ? null : prereq.id)}
                    className="flex items-center gap-1 text-xs text-bone400 hover:text-bone300 font-medium transition-none"
                  >
                    <span className="text-amber font-bold font-mono">[ BOOK ]</span>
                    <span>{isExpanded ? 'Hide 3-Sentence Primer' : 'Read Quick 3-Sentence Primer'}</span>
                    {isExpanded ? <span className="text-amber font-bold font-mono">[ ^ ]</span> : <span className="text-amber font-bold font-mono">[ v ]</span>}
                  </button>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-2.5 p-3 bg-steel/40 border border-steel/30 text-xs text-bone100 leading-relaxed overflow-hidden"
                      >
                        <p className="font-semibold text-bone300 mb-1 flex items-center gap-1.5">
                          <span className="text-amber font-bold font-mono">[ * ]</span>
                          Foundational Primer (First Principles):
                        </p>
                        <p>{prereq.primerSummary}</p>
                        {prereq.checkQuestion && (
                          <div className="mt-2 pt-2 border-t border-steel/40 text-[11px] text-bone200/80">
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
        <div className="mt-6 pt-4 border-t border-steel flex items-center justify-between">
          <div className="text-xs text-solder">
            {knownCount} of {totalPrereqs} prerequisites confirmed
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-solder hover:text-bone bg-steel/80 hover:bg-steel transition-none"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                playSound('success');
                onProceedToEncode();
              }}
              className="px-5 py-2.5 text-xs font-bold text-bone    hover: hover:   flex items-center gap-2 transition-none"
            >
              <span>{hasReviewedAll ? "Start Cognitive Encoding" : "Proceed to Encoding"}</span>
              <span className="text-amber font-bold font-mono">[ NEXT ]</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
