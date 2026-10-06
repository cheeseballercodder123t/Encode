import React, { useState } from 'react';
import { BracketTag } from '@/components/ui/BracketTag';
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
  generateSegregationRemnote, 
  pushToRemnoteApi, 
  compressSemantically,
  optimizeCloze,
  inferParentSystemAnchor,
  FeynmanClozeItem,
  RemnoteDocument,
  RemnoteCard,
  RemnoteCardDirection,
} from '@/lib/remnote';
import { sound, playSound } from '@/lib/audio';
import { recordDeckExport, reportCardKeys } from '@/lib/deck-memory';
import { useModalA11y } from '@/hooks/useModalA11y';

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
  const [copiedDoc, setCopiedDoc] = useState<string | null>(null);
  // Two-way cards are a feature, not a default: a concept ↔ definition pair is
  // a real reverse card, while a labelled prompt's reverse can never be
  // answered. Off = every card front → back only.
  const [twoWayCards, setTwoWayCards] = useState(true);
  // The deck-wide toggle is the hammer; these are the exceptions. One line you
  // DO want reversed (or one concept you do not) is a per-card decision, and it
  // is keyed by the card id the renderer assigns.
  const [directionOverrides, setDirectionOverrides] = useState<Record<string, RemnoteCardDirection>>({});
  // Explanations as Extra Card Detail: a concept ships as one card with its
  // quadrants on the back, instead of five cards that each ask for a tag back.
  const [explanationsAsDetail, setExplanationsAsDetail] = useState(true);
  /** Section documents, or one document per source when the deck has provenance. */
  const [splitBy, setSplitBy] = useState<'section' | 'source'>('section');
  const [remnoteApiKey, setRemnoteApiKey] = useState('');
  const [remnoteUserId, setRemnoteUserId] = useState('');
  const [isPushing, setIsPushing] = useState(false);
  const [pushStatus, setPushStatus] = useState<{ success?: boolean; message?: string } | null>(null);


  // Esc closes, the page behind stops scrolling, focus moves in and back out.
  const sheetRef = useModalA11y(isOpen, onClose);
  if (!isOpen) return null;

  // Generate RemNote markdown either from the segregation report or the active
  // schema. When we have a report, facts + mechanisms + drills + examples are
  // rendered as cards the learner can actually answer — `::` only where the
  // front is a name, `>>` for every labelled prompt, question and cloze.
  // A deck forged over several lectures carries its provenance (`src_2-f1`), and
  // `sourceLabels` turns those prefixes back into names — which is what a
  // per-source split needs to title its pages with.
  const sourceLabels = report?.sourceLabels || {};
  const canSplitBySource = Object.keys(sourceLabels).length > 0;

  const remnotePayload = report
    ? generateSegregationRemnote(report, {
        parentAnchor: parentSystemAnchor,
        twoWayCards,
        explanationsAsDetail,
        directionOverrides,
        groupBy: canSplitBySource ? splitBy : 'section',
        sourceLabels,
      })
    : generateRemnoteHierarchy(
        activeSchema || { topicSummary: topicTitle },
        {
          parentAnchor: parentSystemAnchor,
          preferFeynmanCloze: preferFeynmanCloze,
          twoWayCards,
          explanationsAsDetail,
          directionOverrides,
        }
      );

  // The deck ships as one document per card section (or per source), so each
  // gets its own copy control: one clipboard write, one paste, and a RemNote
  // page that is only about the thing you are studying.
  const remnoteDocuments: RemnoteDocument[] = remnotePayload.documents || [];
  const remnoteCards: RemnoteCard[] = remnotePayload.cards || [];
  const frontQuality = remnotePayload.frontQuality;

  /**
   * One card, as RemNote will ask it — with the one control the deck-wide
   * toggle cannot express.
   *
   * A `::` is only honest where the front is a NAME (a concept, a definition's
   * term): RemNote's reverse asks for the label back, so "given Step 2 → ?" and
   * "given 'Triggers AP' → name the quadrant" are cards that can never be
   * answered. The renderer decides that per line; this lets the learner
   * disagree about one of them without flipping the whole deck.
   */
  /** Card ids are `section:index`; a test id must not depend on that colon. */
  const cardTestId = (card: RemnoteCard) => `remnote-direction-${card.id.replace(/[^A-Za-z0-9]+/g, '-')}`;

  const setDirection = (cardId: string, direction: RemnoteCardDirection) => {
    playSound('click');
    setDirectionOverrides((prev) => {
      const next = { ...prev };
      // Back to the renderer's own decision: the default is the smart rule, and
      // "reset" has to be reachable without reloading the sheet.
      if (next[cardId] === direction) delete next[cardId];
      else next[cardId] = direction;
      return next;
    });
  };

  const writeClipboard = (text: string) => {
    playSound('click');
    // Fire and forget on purpose: the confirmation is about the copy the user
    // asked for, and a browser without clipboard permission must still see the
    // markdown selected-and-visible below rather than a silent no-op.
    void navigator.clipboard?.writeText(text).catch(() => undefined);
  };

  const handleCopyMarkdown = () => {
    writeClipboard(remnotePayload.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleCopyDocument = (doc: RemnoteDocument) => {
    writeClipboard(doc.markdown);
    setCopiedDoc(doc.id);
    setTimeout(() => setCopiedDoc((current) => (current === doc.id ? null : current)), 2500);
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
        // Remember what left the app, so a later forge over this topic can
        // report `4 new · 12 already in your deck` instead of the whole deck.
        if (report) {
          recordDeckExport({ topic: report.topic, keys: reportCardKeys(report), surface: 'RemNote push' });
        }
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
    <div ref={sheetRef} role="dialog" aria-modal="true" tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center bg-chassis/80 p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="leaf-edge sheet-plate w-full max-w-4xl rounded-2xl bg-deck border border-edge/30 p-6 text-bone relative my-8"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-edge pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-fit min-w-[2.5rem] px-2 bg-inset/20 border border-edge/40 flex items-center justify-center text-bone">
              <span className="text-amber font-bold font-mono">[ SPLIT ]</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider bg-inset/20 text-bone border border-edge/30">
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
            className="p-1.5 text-solder hover:text-bone hover:bg-inset transition-none"
          >
            <BracketTag label="X" />
          </button>
        </div>

        {/* Feature 86: Contextual Anchoring (Parent-Child Enforcement) Banner */}
        <div className="mb-4 p-3.5 bg-inset/40 border border-edge/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
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
              className="w-full px-3 py-1.5 bg-chassis border border-edge/40 text-xs text-bone focus:outline-none focus:border-edge transition-none"
            />
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-edge pb-3 mb-5 overflow-x-auto">
          <button
            onClick={() => setActiveTab('matrix')}
            className={`px-3.5 py-1.5  text-xs font-bold transition-none flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'matrix'
                ? 'bg-inset text-bone '
                : 'text-solder hover:text-bone hover:bg-inset'
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
                : 'text-solder hover:text-bone hover:bg-inset'
            }`}
          >
            <span className="text-amber font-bold font-mono">[ ZAP ]</span>
            <span>Feynman-to-Cloze Pipeline ({remnotePayload.feynmanClozings?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('facts')}
            className={`min-h-[44px] px-3.5 py-1.5  text-xs font-bold transition-none flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'facts'
                ? 'bg-inset text-bone '
                : 'text-solder hover:text-bone hover:bg-inset'
            }`}
          >
            <span className="text-amber font-bold font-mono">[ HASH ]</span>
            <span>Declarative Facts ({report?.declarativeFacts?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('drills')}
            className={`min-h-[44px] px-3.5 py-1.5  text-xs font-bold transition-none flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'drills'
                ? 'bg-inset text-bone '
                : 'text-solder hover:text-bone hover:bg-inset'
            }`}
          >
            <span className="text-amber font-bold font-mono">[ PLAY ]</span>
            <span>Practice Drills ({report?.practiceQuestions?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('examples')}
            className={`min-h-[44px] px-3.5 py-1.5  text-xs font-bold transition-none flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'examples'
                ? 'bg-inset text-bone '
                : 'text-solder hover:text-bone hover:bg-inset'
            }`}
          >
            <span className="text-amber font-bold font-mono">[ DEMO ]</span>
            <span>Worked Examples ({report?.workedExamples?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('remnote_export')}
            className={`px-3.5 py-1.5  text-xs font-bold transition-none flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'remnote_export'
                ? 'bg-inset text-bone '
                : 'text-solder hover:text-bone hover:bg-inset'
            }`}
          >
            <span className="text-amber font-bold font-mono">[ FILE ]</span>
            <span>RemNote Markdown</span>
          </button>

          <button
            onClick={() => setActiveTab('api_push')}
            className={`px-3.5 py-1.5  text-xs font-bold transition-none flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'api_push'
                ? 'bg-inset text-bone '
                : 'text-solder hover:text-bone hover:bg-inset'
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
              <div key={concept.id || idx} className="border border-edge bg-inset/40 p-4">
                <div className="flex items-center justify-between border-b border-edge/60 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 bg-inset/20 text-bone text-xs font-bold flex items-center justify-center border border-edge/30">
                      {idx + 1}
                    </span>
                    <h3 className="font-bold text-sm text-bone">{concept.conceptName}</h3>
                  </div>
                  <span className="text-[11px] font-mono text-bone/80">RemNote Concept ::</span>
                </div>

                {/* 4 Quadrants Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs mb-3">
                  {/* Quadrant 1: What */}
                  <div className="p-3 bg-deck/80 border border-edge">
                    <span className="font-bold text-bone block mb-1">1. What is it? (Definition):</span>
                    <p className="text-solder leading-relaxed">{concept.whatIsIt}</p>
                  </div>

                  {/* Quadrant 2: Why */}
                  <div className="p-3 bg-deck/80 border border-edge">
                    <span className="font-bold text-bone block mb-1">2. Why it matters (Significance):</span>
                    <p className="text-solder leading-relaxed">{concept.whyItMatters}</p>
                  </div>

                  {/* Quadrant 3: How */}
                  <div className="p-3 bg-deck/80 border border-edge">
                    <span className="font-bold text-amber block mb-1">3. How it works (Causal Mechanism):</span>
                    <p className="text-solder leading-relaxed">{concept.howItWorks}</p>
                  </div>

                  {/* Quadrant 4: What If */}
                  <div className="p-3 bg-deck/80 border border-edge">
                    <span className="font-bold text-amber block mb-1">4. What If (Edge Case / Failure):</span>
                    <p className="text-solder leading-relaxed">{concept.whatIfEdgeCase}</p>
                  </div>
                </div>

                {/* Boundary & Edge-Case Contrast Generator */}
                {concept.boundaryContrast && (
                  <div className="p-3 bg-hazard-950/20 border border-hazard-500/30 text-xs text-hazard-100">
                    <div className="flex items-center gap-1.5 font-bold text-hazard-400 mb-1">
                      <span className="text-amber font-bold font-mono">[ ! ]</span>
                      <span>Boundary Contrast (Lookalike Trap):</span>
                    </div>
                    <p className="mb-1">
                      <strong>Confusable Lookalike:</strong> <span className="text-hazard-200">{concept.boundaryContrast.confusableLookalike}</span>
                    </p>
                    <p className="text-[11px] text-hazard-300/80">
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
            <div className="p-3.5 bg-amber-950/30 border border-amber/30 text-xs text-amber-200">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-amber-300 flex items-center gap-1.5">
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
              <p className="text-[11px] text-amber-300/80 leading-relaxed">
                Spaced repetition is <strong>exponentially faster and more durable</strong> when flashcards are generated from your own plain-English explanations rather than dense academic jargon. Reviewing in your own words eliminates the illusion of competence.
              </p>
            </div>

            {remnotePayload.feynmanClozings?.map((feynman: FeynmanClozeItem, idx: number) => (
              <div key={feynman.id || idx} className="p-4 bg-deck border border-edge space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 bg-amber/20 text-amber text-xs font-bold flex items-center justify-center border border-amber/30">
                      {idx + 1}
                    </span>
                    <h4 className="font-bold text-bone text-sm">{feynman.stageTitle}</h4>
                  </div>
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-950 border border-amber/30 text-amber-300">
                    {feynman.cognitiveSpeedAdvantage}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* User's Feynman Clozed Flashcard */}
                  <div className="p-3 bg-amber-950/20 border border-amber/40">
                    <span className="font-bold text-amber block mb-1.5 flex items-center gap-1">
                      <span className="text-amber font-bold font-mono">[ OK ]</span>
                      Generated Flashcard (Your Personal Schema):
                    </span>
                    <p className="font-mono text-[11px] text-amber-200 bg-chassis/80 p-2.5 border border-amber-900/50 leading-relaxed">
                      {feynman.clozedUserText}
                    </p>
                  </div>

                  {/* Textbook Academic Jargon */}
                  <div className="p-3 bg-chassis border border-edge opacity-75">
                    <span className="font-bold text-solder block mb-1.5">
                      Dense Academic Textbook Equivalent:
                    </span>
                    <p className="text-[11px] text-solder italic bg-deck/60 p-2.5 border border-edge leading-relaxed">
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
            <div className="p-3 bg-inset/60 border border-edge text-xs text-solder">
              <span className="font-bold text-bone">Declarative Memory Items:</span> Isolated facts, formulas, and constants optimized with <code className="text-bone bg-deck px-1 py-0.5">{"{{cloze deletions}}"}</code> for RemNote flashcards.
            </div>

            {report?.declarativeFacts?.map((fact: DeclarativeFactItem, idx: number) => (
              <div key={fact.id || idx} className="p-3.5 bg-deck/90 border border-edge flex items-start justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {fact.tag && (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-inset text-bone border border-edge uppercase">
                        {fact.tag}
                      </span>
                    )}
                    <span className="text-solder text-[11px]">Fact #{idx + 1}</span>
                  </div>
                  {fact.question && (
                    <p className="text-amber-200 text-[11px] font-bold mb-1">Q: {fact.question}</p>
                  )}
                  <p className="text-bone mb-1">{fact.factStatement}</p>
                  <p className="font-mono text-bone/90 text-[11px] bg-chassis p-2 border border-edge/80">
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
            <div className="p-3 bg-inset/60 border border-edge text-xs text-solder">
              <span className="font-bold text-bone">Rapid-fire drills:</span> short questions answerable in ~10 seconds, each testing one fact, number, step, or discrimination.
            </div>

            {(report?.practiceQuestions?.length ?? 0) === 0 && (
              <p className="text-xs text-solder p-3 border border-edge bg-deck/60">No drills in this report. Regenerate segregation to include them.</p>
            )}

            {report?.practiceQuestions?.map((pq: PracticeQuestionItem, idx: number) => (
              <div key={pq.id || idx} className="p-3.5 bg-deck/90 border border-edge text-xs space-y-1.5">
                <span className="text-solder text-[11px]">Drill #{idx + 1}</span>
                <p className="text-bone font-bold">{pq.question}</p>
                <p className="text-amber-200">A: {pq.answer}</p>
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
            <div className="p-3 bg-inset/60 border border-edge text-xs text-solder">
              <span className="font-bold text-bone">Worked examples:</span> one concrete problem per example, solved in atomic steps.
            </div>

            {(report?.workedExamples?.length ?? 0) === 0 && (
              <p className="text-xs text-solder p-3 border border-edge bg-deck/60">No worked examples in this report. Regenerate segregation to include them.</p>
            )}

            {report?.workedExamples?.map((ex: WorkedExampleItem, idx: number) => (
              <div key={ex.id || idx} className="p-3.5 bg-deck/90 border border-edge text-xs space-y-2">
                <p className="text-bone font-bold">{ex.title || `Example #${idx + 1}`}</p>
                <p className="text-solder">{ex.problem}</p>
                <ol className="space-y-1 list-decimal list-inside text-bone/90">
                  {(ex.steps || []).map((step, sIdx) => (
                    <li key={sIdx}>{step}</li>
                  ))}
                </ol>
                {ex.takeaway && (
                  <p className="text-amber-200 text-[11px]">Takeaway: {ex.takeaway}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tab 4: Native RemNote Hierarchical Markdown Export — one pasteable
            document per card section, each with its own one-click copy. */}
        {activeTab === 'remnote_export' && (
          <div className="space-y-4">
            <div className="p-3.5 bg-inset/40 border border-edge/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-solder leading-relaxed">
                <span className="font-bold text-bone">{remnotePayload.cardCount} cards</span>
                {' · '}
                <span data-testid="remnote-direction-summary" className="font-mono text-[11px]">
                  {remnotePayload.twoWayCount ?? 0} two-way · {remnotePayload.forwardCount ?? 0} forward-only
                </span>
                {' · '}
                <span className="font-mono text-[11px]">
                  {remnoteDocuments.length} document{remnoteDocuments.length === 1 ? '' : 's'}
                </span>
                <p className="text-[11px] mt-1">
                  Parent system: <code className="text-bone">{parentSystemAnchor}</code>
                </p>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="remnote-two-way"
                    checked={twoWayCards}
                    onChange={(e) => setTwoWayCards(e.target.checked)}
                    className="accent-emerald-500"
                  />
                  <span className="text-[11px] font-bold text-bone">Two-way cards</span>
                  <span className="text-[10px] text-solder">(concept ⇄ definition only)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="remnote-explanations-detail"
                    checked={explanationsAsDetail}
                    onChange={(e) => setExplanationsAsDetail(e.target.checked)}
                    className="accent-emerald-500"
                  />
                  <span className="text-[11px] font-bold text-bone">Explanations as card detail</span>
                  <span className="text-[10px] text-solder">(no extra cards · needs Pro)</span>
                </label>
                {canSplitBySource && (
                  <div className="flex items-center gap-2" data-testid="remnote-split">
                    <span className="text-[11px] font-bold text-bone">Split by</span>
                    {(['section', 'source'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        data-testid={`remnote-split-${mode}`}
                        onClick={() => {
                          playSound('click');
                          setSplitBy(mode);
                        }}
                        className={`px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wider border cursor-pointer ${
                          splitBy === mode
                            ? 'bg-amber/15 border-gilt text-amber'
                            : 'bg-chassis border-edge text-solder hover:text-bone'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* What RemNote will actually ASK, per card, with the direction it
                will ask it in. The reverse of a `::` line is invisible until
                you are in a review queue, which is how "given 'Triggers AP',
                name the quadrant" cards shipped in the first place. */}
            {frontQuality && (
              <p
                data-testid="remnote-front-quality"
                className={`text-[11px] font-mono leading-relaxed p-2.5 border ${
                  frontQuality.labelled > 0 ? 'border-gilt/45 bg-inset/30 text-amber' : 'border-edge bg-deck/60 text-signal'
                }`}
              >
                <span className="font-bold">{frontQuality.labelled > 0 ? '[ ! ] ' : '[ OK ] '}</span>
                {frontQuality.note}
              </p>
            )}

            {remnoteCards.length > 0 && (
              <div className="border border-edge/60 bg-deck/50" data-testid="remnote-card-list">
                <p className="px-3 py-2 border-b border-edge/60 text-[10px] font-mono font-bold text-solder uppercase tracking-wider">
                  What RemNote will ask ({remnoteCards.length} cards)
                </p>
                <div className="max-h-56 overflow-y-auto divide-y divide-edge/30">
                  {remnoteCards.map((card) => (
                    <div key={card.id} className="flex items-start gap-2 px-3 py-1.5">
                      <span
                        className={`shrink-0 mt-0.5 px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase border ${
                          card.kind === 'two-way'
                            ? 'border-gilt text-amber'
                            : 'border-edge text-solder'
                        }`}
                      >
                        {card.kind === 'two-way' ? '::' : card.kind === 'cloze' ? '{{}}' : card.kind === 'multi-line' || card.kind === 'list-answer' ? card.kind === 'multi-line' ? '>>>' : '>>1.' : '>>'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] text-bone leading-snug break-words">{card.front}</p>
                        {card.detail.length > 0 && (
                          <p className="text-[10px] text-solder">+{card.detail.length} detail after answering</p>
                        )}
                        {card.reason && <p className="text-[10px] text-solder/80">{card.reason}</p>}
                      </div>
                      {card.reversible ? (
                        <div className="shrink-0 flex items-center gap-1">
                          {(['two-way', 'forward'] as const).map((direction) => (
                            <button
                              key={direction}
                              type="button"
                              data-testid={`${cardTestId(card)}-${direction === 'two-way' ? 'both' : 'one'}`}
                              onClick={() => setDirection(card.id, direction)}
                              title={
                                direction === 'two-way'
                                  ? 'Ask it both ways (RemNote also asks the back for the front)'
                                  : 'Ask it one way only'
                              }
                              className={`px-1.5 py-0.5 text-[9px] font-mono font-bold border cursor-pointer ${
                                card.kind === direction
                                  ? 'bg-amber/15 border-gilt text-amber'
                                  : 'bg-chassis border-edge text-solder hover:text-bone'
                              }`}
                            >
                              {direction === 'two-way' ? '::' : '>>'}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-mono text-solder/70 border border-edge/40">
                          one way, always
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[11px] text-solder leading-relaxed">
              Each document below is its own RemNote page. Copy one, then paste it into a fresh page — the heading on the
              first line names the page it belongs in.
            </p>

            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
              {remnoteDocuments.length === 0 && (
                <p className="text-xs text-solder p-3 border border-edge bg-deck/60">
                  Nothing to export yet — regenerate segregation, or encode a stage, to get cards.
                </p>
              )}

              {remnoteDocuments.map((doc) => (
                <div key={doc.id} data-testid={`remnote-doc-${doc.id}`} className="border border-edge bg-deck/70">
                  <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-edge/60 bg-inset/30">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-bone truncate">{doc.title}</p>
                      <p className="text-[10px] font-mono text-solder">
                        {doc.cardCount} cards · {doc.twoWayCount} two-way · {doc.forwardCount} forward-only · page{' '}
                        {doc.filename}
                      </p>
                    </div>
                    <button
                      type="button"
                      data-testid={`remnote-copy-${doc.id}`}
                      onClick={() => handleCopyDocument(doc)}
                      className="shrink-0 px-3 py-1.5 text-[11px] font-bold text-bone bg-chassis border border-edge hover:bg-inset flex items-center gap-1.5 transition-none cursor-pointer"
                    >
                      {copiedDoc === doc.id ? (
                        <span className="text-signal-300 font-bold font-mono">[ OK ]</span>
                      ) : (
                        <span className="text-amber font-bold font-mono">[ COPY ]</span>
                      )}
                      <span>{copiedDoc === doc.id ? 'Copied — paste into RemNote' : 'Copy this document'}</span>
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={doc.markdown}
                    className="w-full h-40 p-3 bg-chassis border-0 font-mono text-[11px] text-bone leading-relaxed focus:outline-none resize-none"
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-solder leading-relaxed">
                💡 <strong>RemNote Tip:</strong> <code className="text-bone">::</code> makes a two-way concept card,{' '}
                <code className="text-bone">&gt;&gt;</code> makes a forward-only one, and{' '}
                <code className="text-bone">{'{{}}'}</code> makes a cloze — RemNote reads all three on paste.
              </p>
              <button
                type="button"
                data-testid="remnote-copy-all"
                onClick={handleCopyMarkdown}
                className="shrink-0 px-3.5 py-1.5 text-xs font-bold text-bone bg-inset flex items-center gap-1.5 transition-none cursor-pointer"
              >
                {copied ? <span className="text-signal-300 font-bold font-mono">[ OK ]</span> : <span className="text-amber font-bold font-mono">[ COPY ]</span>}
                <span>{copied ? 'Copied!' : 'Copy all as one document'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 5: Push directly to RemNote API */}
        {activeTab === 'api_push' && (
          <div className="space-y-5 max-w-lg mx-auto py-4">
            <div className="p-4 bg-inset/30 border border-edge/30 text-xs text-bone">
              <p className="font-bold text-bone mb-1 flex items-center gap-1.5">
                <span className="text-amber font-bold font-mono">[ SEND ]</span>
                Push directly to your RemNote Knowledge Base:
              </p>
              Enter your RemNote API token (found in RemNote Settings &gt; Plugins & API) to export one document per card section into your workspace with 1 click.
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
                  className="w-full px-3.5 py-2.5 bg-chassis border border-edge text-xs text-bone placeholder-solder focus:outline-none focus:border-edge transition-none"
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
                  className="w-full px-3.5 py-2.5 bg-chassis border border-edge text-xs text-bone placeholder-solder focus:outline-none focus:border-edge transition-none"
                />
              </div>

              <button
                onClick={handlePushRemnote}
                disabled={!remnoteApiKey.trim() || isPushing}
                className="w-full py-2.5 text-xs font-bold text-bone hover:bg-deck flex items-center justify-center gap-2 transition-none disabled:opacity-50 cursor-pointer"
              >
                {isPushing ? (
                  <>
                    <span className="text-amber font-bold font-mono">[ BUSY ]</span>
                    <span>Pushing to RemNote...</span>
                  </>
                ) : (
                  <>
                    <span className="text-amber font-bold font-mono">[ SEND ]</span>
                    <span>Push Documents to RemNote</span>
                  </>
                )}
              </button>

              {pushStatus && (
                <div
                  className={`p-3  text-xs flex items-start gap-2 ${
                    pushStatus.success
                      ? 'bg-amber-950/40 border border-amber/40 text-amber-200'
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
        <div className="mt-6 pt-4 border-t border-edge flex justify-between items-center">
          <div className="text-xs text-solder">
            RemNote Hierarchical Specification (Miller&apos;s Law + Bjork Desirable Difficulty)
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-solder hover:text-bone bg-inset transition-none cursor-pointer"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
};

