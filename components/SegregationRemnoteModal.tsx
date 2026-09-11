import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  SegregationReport,
  DeclarativeFactItem,
  ConceptualMechanismItem,
  PracticeQuestionItem,
  WorkedExampleItem,
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
  const [activeTab, setActiveTab] = useState<'matrix' | 'feynman_cloze' | 'facts' | 'drills' | 'examples' | 'remnote_export' | 'api_push'>('matrix');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-chassis/80 p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-4xl bg-deck border border-steel/30 p-6   text-bone relative my-8"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-steel pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-steel/20 border border-steel/40 flex items-center justify-center text-bone">
              <span className="text-amber font-bold font-mono">[ SPLIT ]</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider bg-steel/20 text-bone border border-steel/30">
                  RemNote Hierarchical & Feynman Engine
                </span>
                <span className="text-xs text-solder">
                  {report?.compressionRatio || "62% Semantic Fluff Eliminated"}
                </span>
              </div>
              <h2 className="text-lg font-bold text-bone mt-0.5">
                {topicTitle ? `Deconstruction: ${topicTitle}` : "Concept vs Fact Segregator"}
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

        {/* Feature 86: Contextual Anchoring (Parent-Child Enforcement) Banner */}
        <div className="mb-4 p-3.5 bg-steel/40 border border-steel/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2.5">
            <span className="text-amber font-bold font-mono">[ FORK ]</span>
            <div>
              <span className="font-bold text-bone">Contextual Anchoring (Parent-Child Enforcement):</span>
              <p className="text-solder text-[11px] mt-0.5">
                What broader macro-system does <strong className="text-bone">&ldquo;{topicTitle}&rdquo;</strong> belong to? This sets the top-level parent document in your knowledge graph.
              </p>
            </div>
          </div>
          <div className="w-full sm:w-auto min-w-[260px]">
            <input
              type="text"
              value={parentSystemAnchor}
              onChange={(e) => setParentSystemAnchor(e.target.value)}
              placeholder="e.g. The Nervous System"
              className="w-full px-3 py-1.5 bg-chassis border border-steel/40 text-xs text-bone focus:outline-none focus:border-steel transition-none"
            />
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-steel pb-3 mb-5 overflow-x-auto">
          <button
            onClick={() => setActiveTab('matrix')}
            className={`px-3.5 py-1.5  text-xs font-bold transition-none flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'matrix'
                ? 'bg-steel text-bone '
                : 'text-solder hover:text-bone hover:bg-steel'
            }`}
          >
            <span className="text-amber font-bold font-mono">[ LAYERS ]</span>
            <span>4-Quadrant Matrix ({report?.conceptualMechanisms?.length || activeSchema?.activities?.length || 0})</span>
          </button>

          {/* Feature 83: The Feynman-to-Cloze Pipeline Tab */}
          <button
            onClick={() => setActiveTab('feynman_cloze')}
            className={`px-3.5 py-1.5  text-xs font-bold transition-none flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'feynman_cloze'
                ? 'bg-amber600 text-bone '
                : 'text-solder hover:text-bone hover:bg-steel'
            }`}
          >
            <span className="text-amber font-bold font-mono">[ ZAP ]</span>
            <span>Feynman-to-Cloze Pipeline ({remnotePayload.feynmanClozings?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('facts')}
            className={`min-h-[44px] px-3.5 py-1.5  text-xs font-bold transition-none flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'facts'
                ? 'bg-steel text-bone '
                : 'text-solder hover:text-bone hover:bg-steel'
            }`}
          >
            <span className="text-amber font-bold font-mono">[ HASH ]</span>
            <span>Declarative Facts ({report?.declarativeFacts?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('drills')}
            className={`min-h-[44px] px-3.5 py-1.5  text-xs font-bold transition-none flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'drills'
                ? 'bg-steel text-bone '
                : 'text-solder hover:text-bone hover:bg-steel'
            }`}
          >
            <span className="text-amber font-bold font-mono">[ PLAY ]</span>
            <span>Practice Drills ({report?.practiceQuestions?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('examples')}
            className={`min-h-[44px] px-3.5 py-1.5  text-xs font-bold transition-none flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'examples'
                ? 'bg-steel text-bone '
                : 'text-solder hover:text-bone hover:bg-steel'
            }`}
          >
            <span className="text-amber font-bold font-mono">[ DEMO ]</span>
            <span>Worked Examples ({report?.workedExamples?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('remnote_export')}
            className={`px-3.5 py-1.5  text-xs font-bold transition-none flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'remnote_export'
                ? 'bg-steel text-bone '
                : 'text-solder hover:text-bone hover:bg-steel'
            }`}
          >
            <span className="text-amber font-bold font-mono">[ FILE ]</span>
            <span>RemNote Markdown</span>
          </button>

          <button
            onClick={() => setActiveTab('api_push')}
            className={`px-3.5 py-1.5  text-xs font-bold transition-none flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'api_push'
                ? 'bg-steel text-bone '
                : 'text-solder hover:text-bone hover:bg-steel'
            }`}
          >
            <span className="text-amber font-bold font-mono">[ SEND ]</span>
            <span>Push to API</span>
          </button>
        </div>

        {/* Tab 1: 4-Quadrant Matrix (What, Why, How, What-If) + Boundary Contrasts */}
        {activeTab === 'matrix' && (
          <div className="space-y-4 max-h-[54vh] overflow-y-auto pr-1">
            {report?.conceptualMechanisms?.map((concept: ConceptualMechanismItem, idx: number) => (
              <div key={concept.id || idx} className=" border border-steel bg-steel/40 p-4">
                <div className="flex items-center justify-between border-b border-steel/60 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 bg-steel/20 text-bone text-xs font-bold flex items-center justify-center border border-steel/30">
                      {idx + 1}
                    </span>
                    <h3 className="font-bold text-sm text-bone">{concept.conceptName}</h3>
                  </div>
                  <span className="text-[11px] font-mono text-bone/80">RemNote Concept ::</span>
                </div>

                {/* 4 Quadrants Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs mb-3">
                  {/* Quadrant 1: What */}
                  <div className="p-3 bg-deck/80 border border-steel">
                    <span className="font-bold text-bone block mb-1">1. What is it? (Definition):</span>
                    <p className="text-solder leading-relaxed">{concept.whatIsIt}</p>
                  </div>

                  {/* Quadrant 2: Why */}
                  <div className="p-3 bg-deck/80 border border-steel">
                    <span className="font-bold text-bone block mb-1">2. Why it matters (Significance):</span>
                    <p className="text-solder leading-relaxed">{concept.whyItMatters}</p>
                  </div>

                  {/* Quadrant 3: How */}
                  <div className="p-3 bg-deck/80 border border-steel">
                    <span className="font-bold text-amber block mb-1">3. How it works (Causal Mechanism):</span>
                    <p className="text-solder leading-relaxed">{concept.howItWorks}</p>
                  </div>

                  {/* Quadrant 4: What If */}
                  <div className="p-3 bg-deck/80 border border-steel">
                    <span className="font-bold text-amber block mb-1">4. What If (Edge Case / Failure):</span>
                    <p className="text-solder leading-relaxed">{concept.whatIfEdgeCase}</p>
                  </div>
                </div>

                {/* Boundary & Edge-Case Contrast Generator */}
                {concept.boundaryContrast && (
                  <div className="p-3 bg-hazard950/20 border border-hazard500/30 text-xs text-hazard100">
                    <div className="flex items-center gap-1.5 font-bold text-hazard400 mb-1">
                      <span className="text-amber font-bold font-mono">[ ! ]</span>
                      <span>Boundary Contrast (Lookalike Trap):</span>
                    </div>
                    <p className="mb-1">
                      <strong>Confusable Lookalike:</strong> <span className="text-hazard200">{concept.boundaryContrast.confusableLookalike}</span>
                    </p>
                    <p className="text-[11px] text-hazard300/80">
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
            <div className="p-3.5 bg-amber950/30 border border-amber/30 text-xs text-amber200">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-amber300 flex items-center gap-1.5">
                  <span className="text-amber font-bold font-mono">[ ZAP ]</span>
                  The Feynman-to-Cloze Pipeline
                </span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferFeynmanCloze}
                    onChange={(e) => setPreferFeynmanCloze(e.target.checked)}
                    className="accent-emerald-500"
                  />
                  <span className="text-[11px] font-bold text-bone">Prioritize My Vocabulary for Clozes</span>
                </label>
              </div>
              <p className="text-[11px] text-amber300/80 leading-relaxed">
                Spaced repetition is <strong>exponentially faster and more durable</strong> when flashcards are generated from your own plain-English explanations rather than dense academic jargon. Reviewing in your own words eliminates the illusion of competence.
              </p>
            </div>

            {remnotePayload.feynmanClozings?.map((feynman: FeynmanClozeItem, idx: number) => (
              <div key={feynman.id || idx} className="p-4 bg-deck border border-steel space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 bg-amber/20 text-amber text-xs font-bold flex items-center justify-center border border-amber/30">
                      {idx + 1}
                    </span>
                    <h4 className="font-bold text-bone text-sm">{feynman.stageTitle}</h4>
                  </div>
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-amber950 border border-amber/30 text-amber300">
                    {feynman.cognitiveSpeedAdvantage}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* User's Feynman Clozed Flashcard */}
                  <div className="p-3 bg-amber950/20 border border-amber/40">
                    <span className="font-bold text-amber block mb-1.5 flex items-center gap-1">
                      <span className="text-amber font-bold font-mono">[ OK ]</span>
                      Generated Flashcard (Your Personal Schema):
                    </span>
                    <p className="font-mono text-[11px] text-amber200 bg-chassis/80 p-2.5 border border-amber900/50 leading-relaxed">
                      {feynman.clozedUserText}
                    </p>
                  </div>

                  {/* Textbook Academic Jargon */}
                  <div className="p-3 bg-chassis border border-steel opacity-75">
                    <span className="font-bold text-solder block mb-1.5">
                      Dense Academic Textbook Equivalent:
                    </span>
                    <p className="text-[11px] text-solder italic bg-deck/60 p-2.5 border border-steel leading-relaxed">
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
            <div className="p-3 bg-steel/60 border border-steel text-xs text-solder">
              <span className="font-bold text-bone">Declarative Memory Items:</span> Isolated facts, formulas, and constants optimized with <code className="text-bone bg-deck px-1 py-0.5 ">{"{{cloze deletions}}"}</code> for RemNote flashcards.
            </div>

            {report?.declarativeFacts?.map((fact: DeclarativeFactItem, idx: number) => (
              <div key={fact.id || idx} className="p-3.5 bg-deck/90 border border-steel flex items-start justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {fact.tag && (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-steel text-bone border border-steel uppercase">
                        {fact.tag}
                      </span>
                    )}
                    <span className="text-solder text-[11px]">Fact #{idx + 1}</span>
                  </div>
                  {fact.question && (
                    <p className="text-amber200 text-[11px] font-bold mb-1">Q: {fact.question}</p>
                  )}
                  <p className="text-bone mb-1">{fact.factStatement}</p>
                  <p className="font-mono text-bone/90 text-[11px] bg-chassis p-2 border border-steel/80">
                    {fact.clozeSuggestion}
                  </p>
                  {fact.memoryHook && (
                    <p className="text-solder text-[11px] italic mt-1">Hook: {fact.memoryHook}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 4: Practice Drills — short rapid-fire Q/A cards */}
        {activeTab === 'drills' && (
          <div className="space-y-3 max-h-[54vh] overflow-y-auto pr-1">
            <div className="p-3 bg-steel/60 border border-steel text-xs text-solder">
              <span className="font-bold text-bone">Rapid-fire drills:</span> short questions answerable in ~10 seconds, each testing one fact, number, step, or discrimination.
            </div>

            {(report?.practiceQuestions?.length ?? 0) === 0 && (
              <p className="text-xs text-solder p-3 border border-steel bg-deck/60">No drills in this report — regenerate segregation to include them.</p>
            )}

            {report?.practiceQuestions?.map((pq: PracticeQuestionItem, idx: number) => (
              <div key={pq.id || idx} className="p-3.5 bg-deck/90 border border-steel text-xs space-y-1.5">
                <span className="text-solder text-[11px]">Drill #{idx + 1}</span>
                <p className="text-bone font-bold">{pq.question}</p>
                <p className="text-amber200">A: {pq.answer}</p>
                {pq.whyCorrect && (
                  <p className="text-solder text-[11px]">Why: {pq.whyCorrect}</p>
                )}
                {(pq.distractors?.length ?? 0) > 0 && (
                  <p className="text-solder text-[11px]">Traps: {pq.distractors!.join(' / ')}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tab 5: Worked Examples — step-by-step problem walkthroughs */}
        {activeTab === 'examples' && (
          <div className="space-y-3 max-h-[54vh] overflow-y-auto pr-1">
            <div className="p-3 bg-steel/60 border border-steel text-xs text-solder">
              <span className="font-bold text-bone">Worked examples:</span> one concrete problem per example, solved in atomic steps.
            </div>

            {(report?.workedExamples?.length ?? 0) === 0 && (
              <p className="text-xs text-solder p-3 border border-steel bg-deck/60">No worked examples in this report — regenerate segregation to include them.</p>
            )}

            {report?.workedExamples?.map((ex: WorkedExampleItem, idx: number) => (
              <div key={ex.id || idx} className="p-3.5 bg-deck/90 border border-steel text-xs space-y-2">
                <p className="text-bone font-bold">{ex.title || `Example #${idx + 1}`}</p>
                <p className="text-solder">{ex.problem}</p>
                <ol className="space-y-1 list-decimal list-inside text-bone/90">
                  {(ex.steps || []).map((step, sIdx) => (
                    <li key={sIdx}>{step}</li>
                  ))}
                </ol>
                {ex.takeaway && (
                  <p className="text-amber200 text-[11px]">Takeaway: {ex.takeaway}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tab 4: Native RemNote Hierarchical Markdown Export */}
        {activeTab === 'remnote_export' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs text-solder">
                <span>{remnotePayload.cardCount} Flashcards generated</span> • <span>Parent System: <code className="text-bone">{parentSystemAnchor}</code></span>
              </div>
              <button
                onClick={handleCopyMarkdown}
                className="px-3.5 py-1.5 text-xs font-bold text-bone bg-steel hover:bg-steel flex items-center gap-1.5 transition-none  cursor-pointer"
              >
                {copied ? <span className="text-amber font-bold font-mono">[ OK ]</span> : <span className="text-amber font-bold font-mono">[ COPY ]</span>}
                <span>{copied ? "Copied to Clipboard!" : "Copy RemNote Markdown"}</span>
              </button>
            </div>

            <textarea
              readOnly
              value={remnotePayload.markdown}
              className="w-full h-72 p-4 bg-chassis border border-steel font-mono text-xs text-bone leading-relaxed focus:outline-none resize-none"
            />

            <p className="text-[11px] text-solder">
              💡 <strong>RemNote Tip:</strong> Open RemNote, press <kbd className="bg-steel px-1 text-bone">Ctrl+V</kbd> (or <kbd className="bg-steel px-1 text-bone">Cmd+V</kbd>) into any page. RemNote will instantly parse the parent-child bullets, <code className="text-bone">::</code> concept-descriptors, and <code className="text-bone">{"{{}}"}</code> cloze cards!
            </p>
          </div>
        )}

        {/* Tab 5: Push directly to RemNote API */}
        {activeTab === 'api_push' && (
          <div className="space-y-5 max-w-lg mx-auto py-4">
            <div className="p-4 bg-steel/30 border border-steel/30 text-xs text-bone">
              <p className="font-bold text-bone mb-1 flex items-center gap-1.5">
                <span className="text-amber font-bold font-mono">[ SEND ]</span>
                Push directly to your RemNote Knowledge Base:
              </p>
              Enter your RemNote API token (found in RemNote Settings &gt; Plugins & API) to export this structured document into your workspace with 1 click.
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-solder mb-1">
                  RemNote API Token:
                </label>
                <input
                  type="password"
                  value={remnoteApiKey}
                  onChange={(e) => setRemnoteApiKey(e.target.value)}
                  placeholder="e.g. rem_api_secret_..."
                  className="w-full px-3.5 py-2.5 bg-chassis border border-steel text-xs text-bone placeholder-slate-500 focus:outline-none focus:border-steel transition-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-solder mb-1">
                  RemNote User ID (Optional):
                </label>
                <input
                  type="text"
                  value={remnoteUserId}
                  onChange={(e) => setRemnoteUserId(e.target.value)}
                  placeholder="Optional user ID"
                  className="w-full px-3.5 py-2.5 bg-chassis border border-steel text-xs text-bone placeholder-slate-500 focus:outline-none focus:border-steel transition-none"
                />
              </div>

              <button
                onClick={handlePushRemnote}
                disabled={!remnoteApiKey.trim() || isPushing}
                className="w-full py-2.5 text-xs font-bold text-bone    hover: hover:   flex items-center justify-center gap-2 transition-none disabled:opacity-50 cursor-pointer"
              >
                {isPushing ? (
                  <>
                    <span className="text-amber font-bold font-mono">[ BUSY ]</span>
                    <span>Pushing to RemNote...</span>
                  </>
                ) : (
                  <>
                    <span className="text-amber font-bold font-mono">[ SEND ]</span>
                    <span>Push Document to RemNote</span>
                  </>
                )}
              </button>

              {pushStatus && (
                <div
                  className={`p-3  text-xs flex items-start gap-2 ${
                    pushStatus.success
                      ? 'bg-amber950/40 border border-amber/40 text-amber200'
                      : 'bg-amber/40 border border-amber/40 text-amber'
                  }`}
                >
                  {pushStatus.success ? <span className="text-amber font-bold font-mono">[ OK ]</span> : <span className="text-amber font-bold font-mono">[ ! ]</span>}
                  <span>{pushStatus.message}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-steel flex justify-between items-center">
          <div className="text-xs text-solder">
            RemNote Hierarchical Specification (Miller&apos;s Law + Bjork Desirable Difficulty)
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-solder hover:text-bone bg-steel hover:bg-steel transition-none cursor-pointer"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
};

