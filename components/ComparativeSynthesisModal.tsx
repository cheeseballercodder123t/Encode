'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ComparativeDocumentAsset, 
  ComparativeSchemaReport, 
  UploadedFileAsset, 
  AISettings 
} from '@/lib/types';
import { generateComparativeSchema } from '@/lib/comparative-synthesis';
import { GoogleDriveModal } from './GoogleDriveModal';
import { playSound } from '@/lib/audio';

interface ComparativeSynthesisModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AISettings;
  onOpenAnkiExport?: (report: ComparativeSchemaReport) => void;
}

export function ComparativeSynthesisModal({
  isOpen,
  onClose,
  settings,
  onOpenAnkiExport,
}: ComparativeSynthesisModalProps) {
  // Document A State
  const [docAName, setDocAName] = useState('Lecture 4 Slides');
  const [docASnippet, setDocASnippet] = useState('');
  const [docAFile, setDocAFile] = useState<UploadedFileAsset | null>(null);

  // Document B State
  const [docBName, setDocBName] = useState('Textbook Chapter 4');
  const [docBSnippet, setDocBSnippet] = useState('');
  const [docBFile, setDocBFile] = useState<UploadedFileAsset | null>(null);

  // Drive Modal Target State
  const [driveTargetDoc, setDriveTargetDoc] = useState<'A' | 'B' | null>(null);

  // Loading & Result State
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [report, setReport] = useState<ComparativeSchemaReport | null>(null);
  const [activeTab, setActiveTab] = useState<'matrix' | 'contradictions' | 'complements' | 'agreed'>('contradictions');

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, targetDoc: 'A' | 'B') => {
    const file = e.target.files?.[0];
    if (!file) return;

    playSound('click');
    const reader = new FileReader();
    reader.onload = () => {
      const resultStr = reader.result as string;
      const base64Data = resultStr.split(',')[1] || '';
      const asset: UploadedFileAsset = {
        name: file.name,
        type: file.type || 'application/pdf',
        size: file.size,
        base64Data,
        previewUrl: file.type.startsWith('image/') ? resultStr : undefined,
      };

      if (targetDoc === 'A') {
        setDocAFile(asset);
        setDocAName(file.name);
      } else {
        setDocBFile(asset);
        setDocBName(file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRunSynthesis = async () => {
    if (isSynthesizing) return;
    playSound('click');
    setIsSynthesizing(true);
    setErrorMessage(null);

    try {
      const docAAsset: ComparativeDocumentAsset = {
        id: 'doc-a',
        name: docAName || 'Document A',
        contentSnippet: docASnippet || undefined,
        fileAsset: docAFile || undefined,
      };

      const docBAsset: ComparativeDocumentAsset = {
        id: 'doc-b',
        name: docBName || 'Document B',
        contentSnippet: docBSnippet || undefined,
        fileAsset: docBFile || undefined,
      };

      const result = await generateComparativeSchema(docAAsset, docBAsset, settings);
      setReport(result);
      playSound('success');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to synthesize multi-document comparison.');
    } finally {
      setIsSynthesizing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-chassis/80 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-[#0F1222] border border-steel/30 overflow-hidden flex flex-col max-h-[88vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-steel flex items-center justify-between ">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-steel/10 border border-steel/30 flex items-center justify-center text-bone">
              <span className="text-amber font-bold font-mono">[ COMPARE ]</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-bone text-base">Multi-Document Comparative Synthesis</h3>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-steel/20 text-bone border border-steel/30">
                  Cross-Examination Engine
                </span>
              </div>
              <p className="text-xs text-solder">
                Compare slides vs textbook chapters to detect contradictions, exam traps, and complementary insights
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-solder hover:text-bone hover:bg-steel transition-none cursor-pointer"
          >
            <span className="text-amber font-bold font-mono">[ X ]</span>
          </button>
        </div>

        {/* Main Content Area */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {errorMessage && (
            <div className="p-3.5 bg-hazard950/40 border border-hazard500/40 text-xs text-hazard300 flex items-start gap-2">
              <span className="text-amber font-bold font-mono">[ ! ]</span>
              <div className="flex-1 leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {!report ? (
            /* Input Setup Stage */
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Document A Card */}
                <div className="p-4 bg-deck/80 border border-steel/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-bone uppercase tracking-wider flex items-center gap-1.5">
                      <span className="text-amber font-bold font-mono">[ FILE ]</span>
                      Source Document A
                    </span>
                    {docAFile && (
                      <span className="px-2 py-0.5 text-[10px] bg-amber950 text-amber300 border border-amber/30 font-bold">
                        File Attached
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-solder block mb-1">Title / Label:</label>
                    <input
                      type="text"
                      value={docAName}
                      onChange={(e) => setDocAName(e.target.value)}
                      placeholder="e.g. Lecture 4 Slides"
                      className="w-full px-3 py-1.5 bg-chassis border border-steel text-xs text-bone focus:outline-none focus:border-steel"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-solder block mb-1">Text Notes / Excerpt:</label>
                    <textarea
                      value={docASnippet}
                      onChange={(e) => setDocASnippet(e.target.value)}
                      placeholder="Paste key slide bullet points or notes here..."
                      className="w-full h-24 p-2.5 bg-chassis border border-steel text-xs text-bone focus:outline-none focus:border-steel resize-none"
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <label className="flex-1 py-1.5 px-2 bg-steel hover:bg-steel text-xs font-bold text-bone border border-steel flex items-center justify-center gap-1.5 cursor-pointer transition-none">
                      <span className="text-amber font-bold font-mono">[ UPLOAD ]</span>
                      <span>Upload File</span>
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        onChange={(e) => handleFileUpload(e, 'A')}
                        className="hidden"
                      />
                    </label>

                    <button
                      onClick={() => setDriveTargetDoc('A')}
                      className="py-1.5 px-3 bg-steel/60 hover:bg-steel/60 text-xs font-bold text-bone border border-steel/40 flex items-center gap-1.5 cursor-pointer transition-none"
                    >
                      <span className="text-amber font-bold font-mono">[ CLOUD ]</span>
                      <span>Google Drive</span>
                    </button>
                  </div>
                </div>

                {/* Document B Card */}
                <div className="p-4 bg-deck/80 border border-steel/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-bone uppercase tracking-wider flex items-center gap-1.5">
                      <span className="text-amber font-bold font-mono">[ BOOK ]</span>
                      Source Document B
                    </span>
                    {docBFile && (
                      <span className="px-2 py-0.5 text-[10px] bg-amber950 text-amber300 border border-amber/30 font-bold">
                        File Attached
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-solder block mb-1">Title / Label:</label>
                    <input
                      type="text"
                      value={docBName}
                      onChange={(e) => setDocBName(e.target.value)}
                      placeholder="e.g. Textbook Chapter 4"
                      className="w-full px-3 py-1.5 bg-chassis border border-steel text-xs text-bone focus:outline-none focus:border-steel"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-solder block mb-1">Text Notes / Excerpt:</label>
                    <textarea
                      value={docBSnippet}
                      onChange={(e) => setDocBSnippet(e.target.value)}
                      placeholder="Paste textbook paragraph or reference excerpt here..."
                      className="w-full h-24 p-2.5 bg-chassis border border-steel text-xs text-bone focus:outline-none focus:border-steel resize-none"
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <label className="flex-1 py-1.5 px-2 bg-steel hover:bg-steel text-xs font-bold text-bone border border-steel flex items-center justify-center gap-1.5 cursor-pointer transition-none">
                      <span className="text-amber font-bold font-mono">[ UPLOAD ]</span>
                      <span>Upload File</span>
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        onChange={(e) => handleFileUpload(e, 'B')}
                        className="hidden"
                      />
                    </label>

                    <button
                      onClick={() => setDriveTargetDoc('B')}
                      className="py-1.5 px-3 bg-steel/60 hover:bg-steel/60 text-xs font-bold text-bone border border-steel/40 flex items-center gap-1.5 cursor-pointer transition-none"
                    >
                      <span className="text-amber font-bold font-mono">[ CLOUD ]</span>
                      <span>Google Drive</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={handleRunSynthesis}
                disabled={isSynthesizing}
                className="w-full py-3.5 px-4 hover: hover: text-bone font-bold text-xs   flex items-center justify-center gap-2.5 transition-none cursor-pointer disabled:opacity-50"
              >
                {isSynthesizing ? (
                  <>
                    <span className="text-amber font-bold font-mono">[ BUSY ]</span>
                    Cross-Examining Document A vs Document B...
                  </>
                ) : (
                  <>
                    <span className="text-amber font-bold font-mono">[ * ]</span>
                    Generate Comparative Schema Matrix
                  </>
                )}
              </button>
            </div>
          ) : (
            /* Results View */
            <div className="space-y-4">
              {/* Header Bar */}
              <div className="p-3.5 bg-deck border border-steel flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
                <div>
                  <h4 className="font-bold text-bone text-sm">{report.synthesisTitle}</h4>
                  <p className="text-solder text-[11px] mt-0.5">
                    Synthesizing <span className="text-bone font-bold">{report.docAName}</span> against <span className="text-bone font-bold">{report.docBName}</span>
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setReport(null)}
                    className="px-3 py-1.5 bg-steel text-solder hover:text-bone font-bold text-[11px] transition-none cursor-pointer"
                  >
                    Compare New Documents
                  </button>
                  {onOpenAnkiExport && (
                    <button
                      onClick={() => onOpenAnkiExport(report)}
                      className="px-3 py-1.5 bg-steel hover:bg-steel text-bone font-bold text-[11px] flex items-center gap-1.5 transition-none cursor-pointer "
                    >
                      <span className="text-amber font-bold font-mono">[ ZAP ]</span>
                      Export Comparative Anki Cards
                    </button>
                  )}
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex items-center gap-2 border-b border-steel pb-2 overflow-x-auto">
                <button
                  onClick={() => setActiveTab('contradictions')}
                  className={`px-3.5 py-1.5  text-xs font-bold transition-none flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    activeTab === 'contradictions'
                      ? 'bg-amber text-bone '
                      : 'text-solder hover:text-bone hover:bg-deck'
                  }`}
                >
                  <span className="text-amber font-bold font-mono">[ ! ]</span>
                  <span>Contradictions & Traps ({report.contradictions?.length || 0})</span>
                </button>

                <button
                  onClick={() => setActiveTab('complements')}
                  className={`px-3.5 py-1.5  text-xs font-bold transition-none flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    activeTab === 'complements'
                      ? 'bg-steel text-bone '
                      : 'text-solder hover:text-bone hover:bg-deck'
                  }`}
                >
                  <span className="text-amber font-bold font-mono">[ * ]</span>
                  <span>Complementary Deep-Dives ({report.complements?.length || 0})</span>
                </button>

                <button
                  onClick={() => setActiveTab('matrix')}
                  className={`px-3.5 py-1.5  text-xs font-bold transition-none flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    activeTab === 'matrix'
                      ? 'bg-steel text-bone '
                      : 'text-solder hover:text-bone hover:bg-deck'
                  }`}
                >
                  <span className="text-amber font-bold font-mono">[ LAYERS ]</span>
                  <span>Unified 4-Quadrant Matrix ({report.unifiedMatrix?.length || 0})</span>
                </button>

                <button
                  onClick={() => setActiveTab('agreed')}
                  className={`px-3.5 py-1.5  text-xs font-bold transition-none flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    activeTab === 'agreed'
                      ? 'bg-amber600 text-bone '
                      : 'text-solder hover:text-bone hover:bg-deck'
                  }`}
                >
                  <span className="text-amber font-bold font-mono">[ OK ]</span>
                  <span>Agreed Principles ({report.agreedCorePrinciples?.length || 0})</span>
                </button>
              </div>

              {/* Tab 1: Contradictions */}
              {activeTab === 'contradictions' && (
                <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                  {report.contradictions?.map((c, idx) => (
                    <div key={c.id || idx} className="p-4 bg-amber/20 border border-amber/30 text-xs space-y-3">
                      <div className="flex items-center justify-between">
                        <h5 className="font-bold text-amber text-sm flex items-center gap-2">
                          <span className="text-amber font-bold font-mono">[ ! ]</span>
                          {c.topicOrConcept}
                        </h5>
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-amber/20 text-amber border border-amber/30">
                          Discrepancy #{idx + 1}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="p-3 bg-deck border border-steel/30">
                          <span className="font-bold text-bone block mb-1">{report.docAName}:</span>
                          <p className="text-solder leading-relaxed">{c.docAClaim}</p>
                        </div>

                        <div className="p-3 bg-deck border border-steel/30">
                          <span className="font-bold text-bone block mb-1">{report.docBName}:</span>
                          <p className="text-solder leading-relaxed">{c.docBClaim}</p>
                        </div>
                      </div>

                      <div className="p-3 bg-deck/90 border border-steel space-y-1">
                        <span className="font-bold text-amber block">Reconciliation & Academic Nuance:</span>
                        <p className="text-bone leading-relaxed">{c.resolutionOrNuance}</p>
                      </div>

                      <div className="p-2.5 bg-hazard950/30 border border-hazard500/30 text-hazard200 flex items-start gap-2">
                        <span className="text-amber font-bold font-mono">[ ! ]</span>
                        <div>
                          <strong className="text-hazard300">Exam Trap Warning:</strong> {c.examTrapWarning}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tab 2: Complements */}
              {activeTab === 'complements' && (
                <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                  {report.complements?.map((comp, idx) => (
                    <div key={comp.id || idx} className="p-4 bg-steel/20 border border-steel/30 text-xs space-y-3">
                      <h5 className="font-bold text-bone text-sm">{comp.conceptName}</h5>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {comp.uniqueInDocA && (
                          <div className="p-3 bg-deck border border-steel">
                            <span className="font-bold text-bone block mb-1">Unique to {report.docAName}:</span>
                            <p className="text-solder">{comp.uniqueInDocA}</p>
                          </div>
                        )}

                        {comp.uniqueInDocB && (
                          <div className="p-3 bg-deck border border-steel">
                            <span className="font-bold text-bone block mb-1">Unique to {report.docBName}:</span>
                            <p className="text-solder">{comp.uniqueInDocB}</p>
                          </div>
                        )}
                      </div>

                      <div className="p-3 bg-deck border border-steel/40">
                        <span className="font-bold text-bone block mb-1">Synthesized Master Takeaway:</span>
                        <p className="text-bone leading-relaxed">{comp.synthesizedTakeaway}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tab 3: Unified Matrix */}
              {activeTab === 'matrix' && (
                <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                  {report.unifiedMatrix?.map((mech, idx) => (
                    <div key={mech.id || idx} className="p-4 bg-deck border border-steel space-y-3 text-xs">
                      <div className="flex items-center justify-between border-b border-steel pb-2">
                        <h5 className="font-bold text-bone text-sm">{mech.conceptName}</h5>
                        <span className="text-[10px] text-bone font-mono">Synthesized Mechanism #{idx + 1}</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div className="p-2.5 bg-chassis">
                          <span className="font-bold text-bone block mb-0.5">What is it?</span>
                          <p className="text-solder">{mech.whatIsIt}</p>
                        </div>
                        <div className="p-2.5 bg-chassis">
                          <span className="font-bold text-bone block mb-0.5">Why it matters?</span>
                          <p className="text-solder">{mech.whyItMatters}</p>
                        </div>
                        <div className="p-2.5 bg-chassis">
                          <span className="font-bold text-amber300 block mb-0.5">How it works?</span>
                          <p className="text-solder">{mech.howItWorks}</p>
                        </div>
                        <div className="p-2.5 bg-chassis">
                          <span className="font-bold text-amber block mb-0.5">What if (Edge case)?</span>
                          <p className="text-solder">{mech.whatIfEdgeCase}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tab 4: Agreed Principles */}
              {activeTab === 'agreed' && (
                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                  {report.agreedCorePrinciples?.map((principle, idx) => (
                    <div key={idx} className="p-3.5 bg-deck border border-steel text-xs flex items-start gap-2.5 text-bone">
                      <span className="text-amber font-bold font-mono">[ OK ]</span>
                      <div className="leading-relaxed">{principle}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-steel bg-chassis flex items-center justify-between text-xs text-solder">
          <span>DeepEncode Multi-Document Cross-Examination Engine</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-steel hover:bg-steel text-bone font-bold transition-none cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* Google Drive Sub-Modal */}
      {driveTargetDoc && (
        <GoogleDriveModal
          isOpen={true}
          onClose={() => setDriveTargetDoc(null)}
          onFileImported={(asset) => {
            if (driveTargetDoc === 'A') {
              setDocAFile(asset);
              setDocAName(asset.name);
            } else {
              setDocBFile(asset);
              setDocBName(asset.name);
            }
            setDriveTargetDoc(null);
          }}
        />
      )}
    </div>
  );
}
