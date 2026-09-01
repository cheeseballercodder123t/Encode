import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  SplitSquareVertical, 
  Layers, 
  FileText, 
  Copy, 
  Check, 
  Send, 
  Loader2, 
  Sparkles, 
  X, 
  Compass, 
  AlertTriangle, 
  ExternalLink,
  ShieldAlert,
  Hash,
  Download,
  GitFork,
  BookOpen,
  Zap,
  CheckCircle2
} from 'lucide-react';
import { 
  SegregationReport, 
  DeclarativeFactItem, 
  ConceptualMechanismItem,
  SavedSchema,
  AISettings
} from '@/lib/types';
import { 
  generateRemnoteHierarchy, 
  pushToRemnoteApi, 
  compressSemantically,
  optimizeCloze,
  inferParentSystemAnchor,
  FeynmanClozeItem
} from '@/lib/remnote';
import { sound, playSound } from '@/lib/audio';

interface SegregationRemnoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: SegregationReport | null;
  activeSchema?: Partial<SavedSchema>;
  settings: AISettings;
}

export const SegregationRemnoteModal: React.FC<SegregationRemnoteModalProps> = ({
  isOpen,
  onClose,
  report,
  activeSchema,
  settings,
}) => {
  const topicTitle = report?.topic || activeSchema?.topicSummary || 'Cognitive Schema';
  const [parentSystemAnchor, setParentSystemAnchor] = useState(() => inferParentSystemAnchor(topicTitle));
  const [preferFeynmanCloze, setPreferFeynmanCloze] = useState(true);
  const [activeTab, setActiveTab] = useState<'matrix' | 'feynman_cloze' | 'facts' | 'remnote_export' | 'api_push'>('matrix');
  const [copied, setCopied] = useState(false);
  const [remnoteApiKey, setRemnoteApiKey] = useState('');
  const [remnoteUserId, setRemnoteUserId] = useState('');
  const [isPushing, setIsPushing] = useState(false);
  const [pushStatus, setPushStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  if (!isOpen) return null;

  // Generate Remnote markdown either from segregation report or active schema
  const remnotePayload = generateRemnoteHierarchy(
    activeSchema || {
      topicSummary: report?.topic,
      activities: report?.conceptualMechanisms?.map((c, i) => ({
        id: c.id || `mech-${i}`,
        stageNumber: i + 1,
        title: c.conceptName,
        framework: '4-Quadrant Cognitive Matrix',
        cognitiveGoal: c.whatIsIt,
        contextSnippet: c.howItWorks,
        keywords: [c.conceptName, 'Mechanism', 'Equilibrium'],
        templateType: 'causal_chain',
        prompt: c.howItWorks,
        scaffold: {
          field1Label: 'What is it?',
          field1Placeholder: '',
          field2Label: 'Why does it matter?',
          field2Placeholder: '',
          exampleAnswer: c.whatIfEdgeCase
        }
      }))
    },
    {
      parentAnchor: parentSystemAnchor,
      preferFeynmanCloze: preferFeynmanCloze,
    }
  );

  const handleCopyMarkdown = () => {
    playSound('click');
    navigator.clipboard.writeText(remnotePayload.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handlePushRemnote = async () => {
    if (!remnoteApiKey.trim() || isPushing) return;
    setIsPushing(true);
    setPushStatus(null);
    playSound('click');

    try {
      const res = await pushToRemnoteApi(remnoteApiKey, remnoteUserId, remnotePayload);
      setPushStatus(res);
      if (res.success) {
        playSound('success');
      }
    } catch (err: any) {
      setPushStatus({
        success: false,
        message: err?.message || 'Error communicating with RemNote API.',
      });
    } finally {
      setIsPushing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-4xl rounded-2xl bg-slate-900 border border-cyan-500/30 p-6 shadow-2xl shadow-cyan-500/10 text-slate-100 relative my-8"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <SplitSquareVertical className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  RemNote Hierarchical & Feynman Engine
                </span>
                <span className="text-xs text-slate-400">
                  {report?.compressionRatio || "62% Semantic Fluff Eliminated"}
                </span>
              </div>
              <h2 className="text-lg font-bold text-white mt-0.5">
                {topicTitle ? `Deconstruction: ${topicTitle}` : "Concept vs Fact Segregator"}
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

        {/* Feature 86: Contextual Anchoring (Parent-Child Enforcement) Banner */}
        <div className="mb-4 p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2.5">
            <GitFork className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
            <div>
              <span className="font-bold text-indigo-300">Contextual Anchoring (Parent-Child Enforcement):</span>
              <p className="text-slate-300 text-[11px] mt-0.5">
                What broader macro-system does <strong className="text-white">&ldquo;{topicTitle}&rdquo;</strong> belong to? This sets the top-level parent document in your knowledge graph.
              </p>
            </div>
          </div>
          <div className="w-full sm:w-auto min-w-[260px]">
            <input
              type="text"
              value={parentSystemAnchor}
              onChange={(e) => setParentSystemAnchor(e.target.value)}
              placeholder="e.g. The Nervous System"
              className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-indigo-500/40 text-xs text-indigo-200 focus:outline-none focus:border-indigo-400 transition"
            />
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-5 overflow-x-auto">
          <button
            onClick={() => setActiveTab('matrix')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'matrix'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>4-Quadrant Matrix ({report?.conceptualMechanisms?.length || activeSchema?.activities?.length || 0})</span>
          </button>

          {/* Feature 83: The Feynman-to-Cloze Pipeline Tab */}
          <button
            onClick={() => setActiveTab('feynman_cloze')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'feynman_cloze'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-300" />
            <span>Feynman-to-Cloze Pipeline ({remnotePayload.feynmanClozings?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('facts')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'facts'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Hash className="w-3.5 h-3.5" />
            <span>Declarative Facts ({report?.declarativeFacts?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('remnote_export')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'remnote_export'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>RemNote Markdown</span>
          </button>

          <button
            onClick={() => setActiveTab('api_push')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'api_push'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Push to API</span>
          </button>
        </div>

        {/* Tab 1: 4-Quadrant Matrix (What, Why, How, What-If) + Boundary Contrasts */}
        {activeTab === 'matrix' && (
          <div className="space-y-4 max-h-[54vh] overflow-y-auto pr-1">
            {report?.conceptualMechanisms?.map((concept: ConceptualMechanismItem, idx: number) => (
              <div key={concept.id || idx} className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
                <div className="flex items-center justify-between border-b border-slate-700/60 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-cyan-500/20 text-cyan-400 text-xs font-bold flex items-center justify-center border border-cyan-500/30">
                      {idx + 1}
                    </span>
                    <h3 className="font-bold text-sm text-white">{concept.conceptName}</h3>
                  </div>
                  <span className="text-[11px] font-mono text-cyan-300/80">RemNote Concept ::</span>
                </div>

                {/* 4 Quadrants Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs mb-3">
                  {/* Quadrant 1: What */}
                  <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                    <span className="font-bold text-cyan-400 block mb-1">1. What is it? (Definition):</span>
                    <p className="text-slate-300 leading-relaxed">{concept.whatIsIt}</p>
                  </div>

                  {/* Quadrant 2: Why */}
                  <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                    <span className="font-bold text-indigo-400 block mb-1">2. Why it matters (Significance):</span>
                    <p className="text-slate-300 leading-relaxed">{concept.whyItMatters}</p>
                  </div>

                  {/* Quadrant 3: How */}
                  <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                    <span className="font-bold text-emerald-400 block mb-1">3. How it works (Causal Mechanism):</span>
                    <p className="text-slate-300 leading-relaxed">{concept.howItWorks}</p>
                  </div>

                  {/* Quadrant 4: What If */}
                  <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                    <span className="font-bold text-amber-400 block mb-1">4. What If (Edge Case / Failure):</span>
                    <p className="text-slate-300 leading-relaxed">{concept.whatIfEdgeCase}</p>
                  </div>
                </div>

                {/* Boundary & Edge-Case Contrast Generator */}
                {concept.boundaryContrast && (
                  <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-500/30 text-xs text-rose-100">
                    <div className="flex items-center gap-1.5 font-bold text-rose-400 mb-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Boundary Contrast (Lookalike Trap):</span>
                    </div>
                    <p className="mb-1">
                      <strong>Confusable Lookalike:</strong> <span className="text-rose-200">{concept.boundaryContrast.confusableLookalike}</span>
                    </p>
                    <p className="text-[11px] text-rose-300/80">
                      <strong>Differentiating Test:</strong> {concept.boundaryContrast.distinguishingRule}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Feature 83: Tab 2 - The Feynman-to-Cloze Pipeline */}
        {activeTab === 'feynman_cloze' && (
          <div className="space-y-4 max-h-[54vh] overflow-y-auto pr-1">
            <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-xs text-emerald-200">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-amber-300" />
                  The Feynman-to-Cloze Pipeline
                </span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferFeynmanCloze}
                    onChange={(e) => setPreferFeynmanCloze(e.target.checked)}
                    className="accent-emerald-500"
                  />
                  <span className="text-[11px] font-bold text-white">Prioritize My Vocabulary for Clozes</span>
                </label>
              </div>
              <p className="text-[11px] text-emerald-300/80 leading-relaxed">
                Spaced repetition is <strong>exponentially faster and more durable</strong> when flashcards are generated from your own plain-English explanations rather than dense academic jargon. Reviewing in your own words eliminates the illusion of competence.
              </p>
            </div>

            {remnotePayload.feynmanClozings?.map((feynman: FeynmanClozeItem, idx: number) => (
              <div key={feynman.id || idx} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center border border-emerald-500/30">
                      {idx + 1}
                    </span>
                    <h4 className="font-bold text-white text-sm">{feynman.stageTitle}</h4>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 border border-emerald-500/30 text-emerald-300">
                    {feynman.cognitiveSpeedAdvantage}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* User's Feynman Clozed Flashcard */}
                  <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/40">
                    <span className="font-bold text-emerald-400 block mb-1.5 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      Generated Flashcard (Your Personal Schema):
                    </span>
                    <p className="font-mono text-[11px] text-emerald-200 bg-slate-950/80 p-2.5 rounded border border-emerald-900/50 leading-relaxed">
                      {feynman.clozedUserText}
                    </p>
                  </div>

                  {/* Textbook Academic Jargon */}
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 opacity-75">
                    <span className="font-bold text-slate-400 block mb-1.5">
                      Dense Academic Textbook Equivalent:
                    </span>
                    <p className="text-[11px] text-slate-400 italic bg-slate-900/60 p-2.5 rounded border border-slate-800 leading-relaxed">
                      {feynman.textbookJargonComparison}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 3: Declarative Facts & Cloze Optimizer */}
        {activeTab === 'facts' && (
          <div className="space-y-3 max-h-[54vh] overflow-y-auto pr-1">
            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700 text-xs text-slate-300">
              <span className="font-bold text-white">Declarative Memory Items:</span> Isolated facts, formulas, and constants optimized with <code className="text-cyan-300 bg-slate-900 px-1 py-0.5 rounded">{"{{cloze deletions}}"}</code> for RemNote flashcards.
            </div>

            {report?.declarativeFacts?.map((fact: DeclarativeFactItem, idx: number) => (
              <div key={fact.id || idx} className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-start justify-between gap-3 text-xs">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {fact.tag && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-cyan-300 border border-slate-700 uppercase">
                        {fact.tag}
                      </span>
                    )}
                    <span className="text-slate-400 text-[11px]">Fact #{idx + 1}</span>
                  </div>
                  <p className="text-slate-200 mb-1">{fact.factStatement}</p>
                  <p className="font-mono text-cyan-300/90 text-[11px] bg-slate-950 p-2 rounded border border-slate-800/80">
                    {fact.clozeSuggestion}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 4: Native RemNote Hierarchical Markdown Export */}
        {activeTab === 'remnote_export' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-400">
                <span>{remnotePayload.cardCount} Flashcards generated</span> • <span>Parent System: <code className="text-indigo-300">{parentSystemAnchor}</code></span>
              </div>
              <button
                onClick={handleCopyMarkdown}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-cyan-600 hover:bg-cyan-500 flex items-center gap-1.5 transition shadow-sm cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "Copied to Clipboard!" : "Copy RemNote Markdown"}</span>
              </button>
            </div>

            <textarea
              readOnly
              value={remnotePayload.markdown}
              className="w-full h-72 p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-cyan-200 leading-relaxed focus:outline-none resize-none"
            />

            <p className="text-[11px] text-slate-400">
              💡 <strong>RemNote Tip:</strong> Open RemNote, press <kbd className="bg-slate-800 px-1 rounded text-white">Ctrl+V</kbd> (or <kbd className="bg-slate-800 px-1 rounded text-white">Cmd+V</kbd>) into any page. RemNote will instantly parse the parent-child bullets, <code className="text-cyan-300">::</code> concept-descriptors, and <code className="text-cyan-300">{"{{}}"}</code> cloze cards!
            </p>
          </div>
        )}

        {/* Tab 5: Push directly to RemNote API */}
        {activeTab === 'api_push' && (
          <div className="space-y-5 max-w-lg mx-auto py-4">
            <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-500/30 text-xs text-cyan-200">
              <p className="font-bold text-cyan-300 mb-1 flex items-center gap-1.5">
                <Send className="w-4 h-4" />
                Push directly to your RemNote Knowledge Base:
              </p>
              Enter your RemNote API token (found in RemNote Settings &gt; Plugins & API) to export this structured document into your workspace with 1 click.
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  RemNote API Token:
                </label>
                <input
                  type="password"
                  value={remnoteApiKey}
                  onChange={(e) => setRemnoteApiKey(e.target.value)}
                  placeholder="e.g. rem_api_secret_..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  RemNote User ID (Optional):
                </label>
                <input
                  type="text"
                  value={remnoteUserId}
                  onChange={(e) => setRemnoteUserId(e.target.value)}
                  placeholder="Optional user ID"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
                />
              </div>

              <button
                onClick={handlePushRemnote}
                disabled={!remnoteApiKey.trim() || isPushing}
                className="w-full py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
              >
                {isPushing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Pushing to RemNote...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Push Document to RemNote</span>
                  </>
                )}
              </button>

              {pushStatus && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                    pushStatus.success
                      ? 'bg-emerald-950/40 border border-emerald-500/40 text-emerald-200'
                      : 'bg-amber-950/40 border border-amber-500/40 text-amber-200'
                  }`}
                >
                  {pushStatus.success ? <Check className="w-4 h-4 text-emerald-400 mt-0.5" /> : <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" />}
                  <span>{pushStatus.message}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex justify-between items-center">
          <div className="text-xs text-slate-400">
            RemNote Hierarchical Specification (Miller&apos;s Law + Bjork Desirable Difficulty)
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
};

