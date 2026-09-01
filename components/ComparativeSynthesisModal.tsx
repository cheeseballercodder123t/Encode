'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  GitCompare, 
  FileText, 
  Upload, 
  Cloud, 
  X, 
  Sparkles, 
  Loader2, 
  AlertTriangle, 
  CheckCircle2, 
  Layers, 
  Zap, 
  BookOpen, 
  ShieldAlert, 
  ArrowRight,
  Download,
  Share2
} from 'lucide-react';
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
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-[#0F1222] border border-indigo-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-indigo-950/40 via-slate-900 to-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <GitCompare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">Multi-Document Comparative Synthesis</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Cross-Examination Engine
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Compare slides vs textbook chapters to detect contradictions, exam traps, and complementary insights
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Content Area */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/40 text-xs text-red-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <div className="flex-1 leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {!report ? (
            /* Input Setup Stage */
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Document A Card */}
                <div className="p-4 rounded-xl bg-slate-900/80 border border-indigo-500/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-indigo-400" />
                      Source Document A
                    </span>
                    {docAFile && (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-500/30 font-bold">
                        File Attached
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">Title / Label:</label>
                    <input
                      type="text"
                      value={docAName}
                      onChange={(e) => setDocAName(e.target.value)}
                      placeholder="e.g. Lecture 4 Slides"
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">Text Notes / Excerpt:</label>
                    <textarea
                      value={docASnippet}
                      onChange={(e) => setDocASnippet(e.target.value)}
                      placeholder="Paste key slide bullet points or notes here..."
                      className="w-full h-24 p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 resize-none"
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <label className="flex-1 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold text-slate-200 border border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer transition">
                      <Upload className="w-3.5 h-3.5 text-indigo-400" />
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
                      className="py-1.5 px-3 bg-indigo-950/60 hover:bg-indigo-900/60 rounded-lg text-xs font-bold text-indigo-300 border border-indigo-500/40 flex items-center gap-1.5 cursor-pointer transition"
                    >
                      <Cloud className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Google Drive</span>
                    </button>
                  </div>
                </div>

                {/* Document B Card */}
                <div className="p-4 rounded-xl bg-slate-900/80 border border-purple-500/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-purple-400" />
                      Source Document B
                    </span>
                    {docBFile && (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-500/30 font-bold">
                        File Attached
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">Title / Label:</label>
                    <input
                      type="text"
                      value={docBName}
                      onChange={(e) => setDocBName(e.target.value)}
                      placeholder="e.g. Textbook Chapter 4"
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">Text Notes / Excerpt:</label>
                    <textarea
                      value={docBSnippet}
                      onChange={(e) => setDocBSnippet(e.target.value)}
                      placeholder="Paste textbook paragraph or reference excerpt here..."
                      className="w-full h-24 p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-purple-500 resize-none"
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <label className="flex-1 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold text-slate-200 border border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer transition">
                      <Upload className="w-3.5 h-3.5 text-purple-400" />
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
                      className="py-1.5 px-3 bg-purple-950/60 hover:bg-purple-900/60 rounded-lg text-xs font-bold text-purple-300 border border-purple-500/40 flex items-center gap-1.5 cursor-pointer transition"
                    >
                      <Cloud className="w-3.5 h-3.5 text-purple-400" />
                      <span>Google Drive</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={handleRunSynthesis}
                disabled={isSynthesizing}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-bold text-xs shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-2.5 transition cursor-pointer disabled:opacity-50"
              >
                {isSynthesizing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Cross-Examining Document A vs Document B...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Comparative Schema Matrix
                  </>
                )}
              </button>
            </div>
          ) : (
            /* Results View */
            <div className="space-y-4">
              {/* Header Bar */}
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
                <div>
                  <h4 className="font-bold text-white text-sm">{report.synthesisTitle}</h4>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Synthesizing <span className="text-indigo-300 font-bold">{report.docAName}</span> against <span className="text-purple-300 font-bold">{report.docBName}</span>
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setReport(null)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white font-bold text-[11px] transition cursor-pointer"
                  >
                    Compare New Documents
                  </button>
                  {onOpenAnkiExport && (
                    <button
                      onClick={() => onOpenAnkiExport(report)}
                      className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-[11px] flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                    >
                      <Zap className="w-3.5 h-3.5 text-amber-300" />
                      Export Comparative Anki Cards
                    </button>
                  )}
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
                <button
                  onClick={() => setActiveTab('contradictions')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    activeTab === 'contradictions'
                      ? 'bg-amber-600 text-white shadow'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-200" />
                  <span>Contradictions & Traps ({report.contradictions?.length || 0})</span>
                </button>

                <button
                  onClick={() => setActiveTab('complements')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    activeTab === 'complements'
                      ? 'bg-purple-600 text-white shadow'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Complementary Deep-Dives ({report.complements?.length || 0})</span>
                </button>

                <button
                  onClick={() => setActiveTab('matrix')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    activeTab === 'matrix'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Unified 4-Quadrant Matrix ({report.unifiedMatrix?.length || 0})</span>
                </button>

                <button
                  onClick={() => setActiveTab('agreed')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    activeTab === 'agreed'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Agreed Principles ({report.agreedCorePrinciples?.length || 0})</span>
                </button>
              </div>

              {/* Tab 1: Contradictions */}
              {activeTab === 'contradictions' && (
                <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                  {report.contradictions?.map((c, idx) => (
                    <div key={c.id || idx} className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 text-xs space-y-3">
                      <div className="flex items-center justify-between">
                        <h5 className="font-bold text-amber-300 text-sm flex items-center gap-2">
                          <ShieldAlert className="w-4 h-4 text-amber-400" />
                          {c.topicOrConcept}
                        </h5>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-200 border border-amber-500/30">
                          Discrepancy #{idx + 1}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg bg-slate-900 border border-indigo-500/30">
                          <span className="font-bold text-indigo-300 block mb-1">{report.docAName}:</span>
                          <p className="text-slate-300 leading-relaxed">{c.docAClaim}</p>
                        </div>

                        <div className="p-3 rounded-lg bg-slate-900 border border-purple-500/30">
                          <span className="font-bold text-purple-300 block mb-1">{report.docBName}:</span>
                          <p className="text-slate-300 leading-relaxed">{c.docBClaim}</p>
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1">
                        <span className="font-bold text-emerald-400 block">Reconciliation & Academic Nuance:</span>
                        <p className="text-slate-200 leading-relaxed">{c.resolutionOrNuance}</p>
                      </div>

                      <div className="p-2.5 rounded-lg bg-red-950/30 border border-red-500/30 text-red-200 flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-400 mt-0.5" />
                        <div>
                          <strong className="text-red-300">Exam Trap Warning:</strong> {c.examTrapWarning}
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
                    <div key={comp.id || idx} className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/30 text-xs space-y-3">
                      <h5 className="font-bold text-purple-300 text-sm">{comp.conceptName}</h5>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {comp.uniqueInDocA && (
                          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                            <span className="font-bold text-indigo-300 block mb-1">Unique to {report.docAName}:</span>
                            <p className="text-slate-300">{comp.uniqueInDocA}</p>
                          </div>
                        )}

                        {comp.uniqueInDocB && (
                          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                            <span className="font-bold text-purple-300 block mb-1">Unique to {report.docBName}:</span>
                            <p className="text-slate-300">{comp.uniqueInDocB}</p>
                          </div>
                        )}
                      </div>

                      <div className="p-3 rounded-lg bg-slate-900 border border-purple-500/40">
                        <span className="font-bold text-purple-300 block mb-1">Synthesized Master Takeaway:</span>
                        <p className="text-slate-200 leading-relaxed">{comp.synthesizedTakeaway}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tab 3: Unified Matrix */}
              {activeTab === 'matrix' && (
                <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                  {report.unifiedMatrix?.map((mech, idx) => (
                    <div key={mech.id || idx} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 text-xs">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <h5 className="font-bold text-white text-sm">{mech.conceptName}</h5>
                        <span className="text-[10px] text-indigo-400 font-mono">Synthesized Mechanism #{idx + 1}</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div className="p-2.5 rounded bg-slate-950">
                          <span className="font-bold text-indigo-300 block mb-0.5">What is it?</span>
                          <p className="text-slate-300">{mech.whatIsIt}</p>
                        </div>
                        <div className="p-2.5 rounded bg-slate-950">
                          <span className="font-bold text-purple-300 block mb-0.5">Why it matters?</span>
                          <p className="text-slate-300">{mech.whyItMatters}</p>
                        </div>
                        <div className="p-2.5 rounded bg-slate-950">
                          <span className="font-bold text-emerald-300 block mb-0.5">How it works?</span>
                          <p className="text-slate-300">{mech.howItWorks}</p>
                        </div>
                        <div className="p-2.5 rounded bg-slate-950">
                          <span className="font-bold text-amber-300 block mb-0.5">What if (Edge case)?</span>
                          <p className="text-slate-300">{mech.whatIfEdgeCase}</p>
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
                    <div key={idx} className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs flex items-start gap-2.5 text-slate-200">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div className="leading-relaxed">{principle}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-400">
          <span>DeepEncode Multi-Document Cross-Examination Engine</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold transition cursor-pointer"
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
