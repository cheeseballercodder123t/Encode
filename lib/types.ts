export type AIProvider = 'gemini' | 'openrouter' | 'openai';

export interface AISettings {
  provider: AIProvider;
  geminiApiKey?: string;
  geminiModel?: string;
  geminiCheckerModel?: string;
  
  openrouterApiKey?: string;
  openrouterModel?: string;
  openrouterCheckerModel?: string;

  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
  openaiCheckerModel?: string;
}

export type EncodingMode = 'conceptual' | 'memorization';

/**
 * How much energy you actually have today.
 *
 * Encoding used to demand the same full workout every single time, which is
 * exactly why a Thursday night after labs felt like homework instead of a
 * puzzle. The gear changes how deep the session goes, never whether the
 * session happens:
 *
 *   1  Express Forge    low energy, about a minute. Supply the pivotal words
 *                       only: the encoder extracts the mechanism and blanks
 *                       2-3 critical links for you to fill.
 *   2  Interactive      medium. Puzzles, ordering, boundary cases and
 *                       discrimination instead of essay writing.
 *   3  Deep Crucible    high. Full Feynman, voice, adversarial viva.
 *
 * Science preserved at every gear: Slamecka & Graf's generation effect shows
 * that generating even a single missing word buys almost the same memory boost
 * as writing the whole paragraph. Gear 1 is not a lesser workout. It is the
 * same workout with the essay removed.
 */
export type EncodingGear = 1 | 2 | 3;

export interface ResearchContextItem {
  id: string;
  detectedGap: string;
  conceptAdded: string;
  explanation: string;
  sourceTitle?: string;
  sourceUrl?: string;
}

export interface VideoTimestamp {
  seconds: number;
  formatted: string;
  label: string;
  insight?: string;
}

export interface YouTubeMetadata {
  videoId: string;
  videoUrl: string;
  title: string;
  authorName?: string;
  thumbnailUrl?: string;
  duration?: string;
  timestamps: VideoTimestamp[];
}

export interface ActivityScaffold {
  field1Label: string;
  field1Placeholder: string;
  field1Prefix?: string;
  field2Label: string;
  field2Placeholder: string;
  field2Prefix?: string;
  field3Label?: string;
  field3Placeholder?: string;
  field3Prefix?: string;
  presetOptions?: string[];
  exampleAnswer: string;
  /**
   * Causal Mad-Libs sentence template carrying [[1]]/[[2]]/[[3]] markers, e.g.
   * "When [[1]], the [[2]] is forced, so [[3]] — UNLESS the pore is blocked."
   * Optional: without it the workbench derives a structural chain from the
   * labels, so sentence mode is never unavailable.
   */
  causalFrame?: string;
}

export * from './templates/types';
import { ActivityVisualData, GenerationChallenge, VisualTemplateType } from './templates/types';


export interface Activity {
  id: string;
  stageNumber: number;
  title: string;
  framework: string;
  cognitiveGoal: string;
  contextSnippet: string;
  keywords: string[];
  templateType: string;
  prompt: string;
  /**
   * The stage's physical contradiction, phrased as a "how is this possible?"
   * hook. This is what the workbench leads with: a definition request is
   * homework, a paradox is a puzzle, and the same mechanism has to be reasoned
   * out either way.
   */
  paradox?: string;
  /**
   * One extreme, qualitative thought experiment to run BEFORE formalising
   * anything ("You are an enzyme. The pH drops to 2.0. What happens to you?").
   * Tracking charges and shapes is real encoding; reciting "denaturation" is
   * not.
   */
  gedankenexperiment?: string;
  scaffold: ActivityScaffold;
  visualData?: ActivityVisualData;
  researchContext?: ResearchContextItem;
  videoTimestamp?: VideoTimestamp;
  /** Discriminative boundary: confusable lookalike + distinguishing rule (prevents export leeches). */
  boundaryContrast?: {
    confusableLookalike: string;
    distinguishingRule: string;
  };
}

export interface StageResponse {
  field1: string;
  field2: string;
  field3?: string;
  selectedPreset?: string;
  /**
   * The examiner's read on this stage.
   *
   * There is deliberately no score and no grade here. A number out of 100 (or
   * "needs elaboration") hands you a verdict with no way forward, which is
   * exactly what made encoding feel like homework. What replaces it:
   *
   *   secured          did the physical cause-and-effect land, yes or no
   *   nailedIt         the causal links that landed, in your own words
   *   missingLink      the ONE sentence to insert, already written for you
   *   counterProbe     one question that pushes the mechanism to its edge
   *   sentenceFinisher your own sentence, completed
   */
  feynmanReview?: {
    /** True when the causal mechanism landed: the card is safe to forge. */
    secured: boolean;
    feedback: string;
    depthAlert?: string;
    errorAnalysis?: string;
    /** Jargon Parroting Buzzer: buzzword-without-mechanism callout. */
    jargonBuzzer?: string;
    /** Oxford Oral Defense counter-question (viva strictness mode). */
    vivaCrossExamination?: string;
    /** The causal links the answer got right, quoting your own words. */
    nailedIt?: string;
    /** The single missing causal step, written as the sentence to insert. */
    missingLink?: string;
    /** The Socratic pressure test: one probing edge-case question. */
    counterProbe?: string;
    /** The assistant finishing your sentence for you. */
    sentenceFinisher?: string;
  };
  confidenceScore?: number;        // 0-100 slider value
  reflection?: string;             // one-sentence takeaway
  checkCount?: number;             // how many times re-checked by AI
  errorAnalysis?: string;          // targeted diff feedback from checker
  difficultyLevel?: 'easy' | 'medium' | 'hard';
  /** True when the user chose "Skip for now" â€” exported tagged DeepEncode::Unfinished. */
  skipped?: boolean;
}

export interface SessionMetacognition {
  preSessionConfidence: number;    // 1-5 star rating
  finalAIScore?: number;           // 0-100 from end-of-session checker
  finalAIAnalysis?: string;        // written analysis
  totalCheckCalls?: number;
  sessionId?: string;
  timestamp?: number;
}

export interface FeynmanCheckpoint {
  question: string;
  hint?: string;
  corePrerequisite: string;
  userAnswer?: string;
  passed?: boolean;
  score?: number;
  feedback?: string;
}

export interface GuidedPathModule {
  moduleId: string;
  moduleNumber: number;
  title: string;
  summary: string;
  targetFocus: string;
  unlocked: boolean;
  completed: boolean;
  feynmanCheckpoint: FeynmanCheckpoint;
  activities: Activity[];
  userResponses?: Record<string, StageResponse>;
}

export interface SavedSchema {
  id: string;
  userId?: string;
  timestamp: number;
  topicSummary: string;
  mode: EncodingMode;
  xpEarned: number;
  activities: Activity[];
  userResponses: Record<string, StageResponse>;
  sourceFileName?: string;
  
  // New features
  isGuidedPath?: boolean;
  guidedModules?: GuidedPathModule[];
  currentModuleIndex?: number;
  youtubeData?: YouTubeMetadata;
  researchContexts?: ResearchContextItem[];
}

/** One blind vignette in the 10-second discrimination gate. */
export interface DiscriminationQuestion {
  id: string;
  vignette: string;
  /** True when the vignette IS the stage's concept, false when it is the lookalike. */
  answerIsConcept: boolean;
  rationale: string;
}

/**
 * Payload for the pre-export discrimination gate (/api/discrimination): two
 * blind vignettes (one concept, one lookalike) plus the rule that separates
 * them, which becomes the trap card when the learner hesitates or misses.
 */
export interface DiscriminationCheck {
  topic: string;
  conceptLabel: string;
  lookalikeLabel: string;
  questions: DiscriminationQuestion[];
  operationalRule: string;
  cardFront: string;
  cardBack: string;
}

/**
 * Payload for the Parsons-style causal ordering drill (/api/sequence): the
 * canonical chain the learner has to reconstruct, plus the one rule that
 * explains why the chain cannot be in any other order.
 */
export interface ParsonsResult {
  title: string;
  /** Steps in CANONICAL order — the answer, never to be sent scrambled. */
  steps: { id: string; text: string }[];
  /** The pivot rule: why the first broken link is impossible the other way round. */
  pivotRule: string;
  /** One line on the mechanism the chain describes. */
  summary: string;
}

export interface InterleavedQuestion {
  id: string;
  domain: string;
  schemaTitle: string;
  sourceSchemaId: string;
  stageTitle: string;
  questionPrompt: string;
  correctMechanism: string;
  keyKeywords: string[];
  contrastTrap?: string;
  distractorDomains?: string[];
  timestampFormatted?: string;
}

export interface UploadedFileAsset {
  name: string;
  type: string; // 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp' | etc.
  size: number;
  base64Data: string; // base64 payload
  previewUrl?: string;
}

export type RoastCategory = 
  | 'logical_fallacy' 
  | 'missing_prerequisite' 
  | 'hand_waving' 
  | 'jargon_parroting' 
  | 'contradiction';

export interface RoastCriticism {
  id: string;
  category: RoastCategory;
  categoryLabel: string;
  severity: 'brutal' | 'moderate' | 'mild';
  quoteOrTarget: string;
  roastComment: string;
  fixTip: string;
  suggestedPatch?: string;
}

export interface RoastReport {
  overallVerdict: string;
  preparednessScore: number; // 0 - 100
  professorTitle: string; // e.g. "Prof. Sterling (Tenured Dept. Chair)"
  lethalQuote: string;
  criticisms: RoastCriticism[];
  begrudgingCompliment: string;
  actionableRecommendations: string[];
}

export interface PrerequisiteItem {
  id: string;
  name: string;
  importance: string;
  primerSummary: string;
  checkQuestion?: string;
  known?: boolean;
}

export interface PrerequisitesReport {
  isReadyToEncode: boolean;
  topicTitle: string;
  prerequisites: PrerequisiteItem[];
}

export interface PretestOption {
  id: string;
  label: string;
}

export interface PretestQuestion {
  id: string;
  questionNumber: number;
  questionPrompt: string;
  subtleTrap: string;
  firstPrincipleAnswer: string;
  whyAttemptingMatters?: string;
  userHypothesis?: string;
  submitted?: boolean;
  // ── Predict–Observe–Explain gate ──────────────────────────────────────────
  /** Exactly 4 concrete predictions to commit to. */
  options?: PretestOption[];
  correctOptionId?: string;
  /** The single most tempting intuitive wrong option. */
  trapOptionId?: string;
  /** Cloze-ready interference-trap card that kills the misconception. */
  trapCardFront?: string;
  trapCardBack?: string;
}

export interface PretestSession {
  topic: string;
  scientificRationale: string;
  questions: PretestQuestion[];
}

export interface BlurtingEvaluation {
  retrievalScore: number;
  recalledCount: number;
  missedCount: number;
  feedback: string;
  recalledPrinciples: { principle: string; studentMentioned?: string }[];
  missedPrinciples: { principle: string; whyCrucial: string; flashcardTrigger?: string }[];
  suggestedBlurtRemedy?: string;
}

export interface DeclarativeFactItem {
  id: string;
  factStatement: string;
  clozeSuggestion: string;
  tag?: string;
  /** Short front-side prompt so the card never repeats the whole fact. */
  question?: string;
  /** Why this fact is worth remembering (one crisp line). */
  memoryHook?: string;
}

export interface PracticeQuestionItem {
  id: string;
  /** Short front-side question, ideally answerable in under ~10 seconds. */
  question: string;
  /** Correct answer, concise. */
  answer: string;
  /** One-line explanation of why the answer is right. */
  whyCorrect?: string;
  /** Common wrong answers / traps to discriminate against. */
  distractors?: string[];
}

export interface WorkedExampleItem {
  id: string;
  /** Short title, e.g. 'Worked example: thin-lens image'. */
  title: string;
  /** The problem setup in 1-2 short sentences. */
  problem: string;
  /** Ordered solution steps, each one atomic line. */
  steps: string[];
  /** The key takeaway / transfer rule. */
  takeaway?: string;
}

export interface ConceptualMechanismItem {
  id: string;
  conceptName: string;
  whatIsIt: string;
  whyItMatters: string;
  howItWorks: string;
  whatIfEdgeCase: string;
  boundaryContrast?: {
    confusableLookalike: string;
    distinguishingRule: string;
  };
}

export interface ConfusablePairItem {
  id: string;
  conceptA: string;
  conceptB: string;
  /** Primary axis of discrimination, e.g. "Rate law & Intermediate" or "Neurotransmitter & Receptor" */
  distinguishingAxis: string;
  /** Boundary condition: under what exact condition does the system use A vs B? */
  boundaryCondition: string;
  conceptAFeature: string;
  conceptBFeature: string;
  /** Vignette question testing edge-case classification between the pair */
  diagnosticVignette: string;
  /** Ground truth answer and the tell that settles it */
  diagnosticAnswer: string;
}

export interface SegregationReport {
  topic: string;
  declarativeFacts: DeclarativeFactItem[];
  conceptualMechanisms: ConceptualMechanismItem[];
  /** Rapid-fire recall drills: short Q/A cards generated from the source. */
  practiceQuestions?: PracticeQuestionItem[];
  /** Step-by-step worked examples derived from the source material. */
  workedExamples?: WorkedExampleItem[];
  /** Confusable pairs & discrimination matrix cards separating lookalikes. */
  confusablePairs?: ConfusablePairItem[];
  compressionRatio?: string;
  /**
   * Source id → the learner's name for that input ("Lecture 4 slides"), set by
   * the forge's merge. Card ids already carry the source prefix (`src_2-f1`),
   * so this is what turns that prefix back into a name a page can be titled
   * with — and lets a merged deck still be split or blamed per source.
   */
  sourceLabels?: Record<string, string>;
}

export interface ComparativeDocumentAsset {
  id: string;
  name: string;
  contentSnippet?: string;
  fileAsset?: UploadedFileAsset;
}

export interface ComparativeContradiction {
  id: string;
  topicOrConcept: string;
  docAClaim: string;
  docBClaim: string;
  resolutionOrNuance: string;
  examTrapWarning: string;
}

export interface ComparativeComplement {
  id: string;
  conceptName: string;
  uniqueInDocA?: string;
  uniqueInDocB?: string;
  synthesizedTakeaway: string;
}

export interface ComparativeSchemaReport {
  synthesisTitle: string;
  docAName: string;
  docBName: string;
  agreedCorePrinciples: string[];
  contradictions: ComparativeContradiction[];
  complements: ComparativeComplement[];
  unifiedMatrix: ConceptualMechanismItem[];
}


// â”€â”€â”€ Procedural Trap-Engine MCQ Archetypes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
// A ProceduralMCQArchetype is a parametric AP-style multiple-choice blueprint.
// At review time the embedded client-side runner in the Anki note rolls fresh
// variable values inside their declared ranges, evaluates correctFormulaJs to
// compute the answer, evaluates each trap's formulaJs to build AP-style
// conceptual distractors, then shuffles A-D into clickable buttons.
// Everything runs natively inside Anki's webview : no add-ons, no network,
// no API keys at review time.

export interface ProceduralMCQVariableSpec {
  /** Required unless `choices` is provided. */
  min?: number;
  /** Required unless `choices` is provided. */
  max?: number;
  /** Optional quantization step (e.g. 0.5 to roll half-integers). */
  step?: number;
  /** Optional rounding to N decimal places (default: 2). */
  decimals?: number;
  /** Optional discrete pool the roller must pick from instead of a range. */
  choices?: number[];
}

export interface ProceduralMCQTrap {
  /** Human name of the misconception, e.g. "Inverted Frequency Formula". */
  trapName: string;
  /** JS expression (same sandbox rules as correctFormulaJs) yielding the distractor value. */
  formulaJs: string;
  /** Shown when the student falls for the trap: why the distractor is wrong. */
  explanation: string;
}

export interface ProceduralMCQArchetype {
  id: string;
  /** e.g. "AP Physics C: Simple Harmonic Motion" */
  topic: string;
  /** Question template with {{var}} placeholders, e.g. "A block of mass m = {{m}} kg ..." */
  questionTemplate: string;
  variables: Record<string, ProceduralMCQVariableSpec>;
  /** Unit of the correct answer, e.g. "m/s" */
  unit: string;
  /**
   * Pure JS expression over the declared variables (plus Math only), e.g.
   * "(A * Math.sqrt(k / m)).toFixed(2)".
   */
  correctFormulaJs: string;
  traps: ProceduralMCQTrap[];
  /** Full LaTeX step-by-step derivation using \( ... \) inline delimiters. */
  stepByStepSolutionTemplate: string;
}


// â”€â”€â”€ TEACH ME (Brilliant-style interactive lesson) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// The AI-authored lesson model. The AI gets huge freedom over segment types,
// counts, order and content; `lib/services/teachLesson.ts` sanitizes whatever
// comes back before the renderer (TeachMeModal) touches it.

export type LessonSegmentType =
  | 'concept'          // teaching card (the "teaching" half)
  | 'deepDive'         // second, deeper pass: the causal WHY, failure modes, limits
  | 'checkpoint'       // interactive MCQ / ordering / matching / fill-blank / free-response
  | 'guidedProblem'    // Brilliant-style worked example with step reveal
  | 'youTry'           // learner attempts, then reveals the model answer
  | 'misconception'    // the confusable wrong belief vs. the correction that kills it
  | 'selfExplain'      // Feynman production: explain the mechanism in your own words
  | 'transfer'         // same mechanism, unfamiliar surface (near transfer)
  | 'memoryHook'       // mnemonic peg / chant / palace link (memorization mode)
  | 'storyBeat'        // narrative continuation (story mode)
  | 'recap'            // consolidation bullets before the exit
  | 'wrapup';          // final summary / finish screen

export interface LessonVisual {
  kind: 'steps' | 'analogy' | 'list' | 'formula' | 'diagram';
  lines?: { label: string; detail?: string }[];
  analogyPairs?: { source: string; target: string; note?: string }[];
  callout?: string;
}

export type LessonQuestionKind =
  | 'mcq'
  | 'ordering'
  | 'matching'
  | 'fillBlank'
  | 'freeResponse'
  | 'trueFalse';

export interface LessonQuestion {
  kind: LessonQuestionKind;
  prompt: string;
  /** MCQ / trueFalse options. Exactly one should carry correct=true. */
  options?: { id: string; label: string; correct?: boolean; explanation?: string }[];
  /** Ordering: asked to arrange items; correctIndex = the final position each item belongs in. */
  items?: { id?: string; label: string; correctIndex?: number }[];
  /** Matching: tap-left / tap-right pairs to link together. */
  pairs?: { id?: string; left: string; right: string }[];
  /** Fill-blank: sentence fragments the learner completes. */
  blanks?: { id?: string; before?: string; answer: string; after?: string }[];
  /** freeResponse grading reference. */
  modelAnswer?: string;
  /** Progressive hint ladder: gentlest first. */
  hints?: string[];
}

export interface LessonSegment {
  id: string;
  type: LessonSegmentType;
  title?: string;
  body?: string;
  keyTerms?: string[];
  visual?: LessonVisual;
  question?: LessonQuestion;
  /** Shown when the learner picks the confusable trap (boundary contrast lesson). */
  trapNote?: string;
  /** guidedProblem steps, revealed one at a time. */
  steps?: { title: string; detail: string }[];
  finalAnswer?: string;
  /** memoryHook chant / peg phrase. */
  phrase?: string;
  linkedList?: string[];
  /** storyBeat narrative. */
  narrative?: string;
  continuation?: string;
  /**
   * The causal driver behind the claim: WHY this is true, what physically
   * forces it, and where it stops being true. This is the depth layer that
   * separates a summary from a lesson, so almost every teaching segment
   * carries one.
   */
  why?: string;
  /** Misconception radar: the plausible wrong belief and the correction. */
  misconceptions?: { claim: string; correction: string }[];
  /** recap: consolidation bullets shown before the end-of-lesson exit. */
  recapPoints?: string[];
  /** selfExplain: Feynman production task with a reference answer. */
  selfExplain?: { prompt: string; modelAnswer?: string; keywords?: string[] };
  /** transfer: the same mechanism behind an unfamiliar surface problem. */
  transfer?: { prompt: string; modelAnswer?: string };
  /** Optional chapter grouping label for the progress rail. */
  chapterTitle?: string;
  xpValue?: number;
}

export interface TeachLesson {
  title: string;
  tagline?: string;
  estimatedMin?: number;
  intro?: { hook?: string; whyItMatters?: string };
  /** What the learner will be able to DO by the end, one line each. */
  objectives?: string[];
  segments: LessonSegment[];
  /** Terms the AI promised to teach, with the plain-language definition it used. */
  glossary?: { term: string; definition: string }[];
  /**
   * Ready-to-encode seeds: the lesson's own payload handed to the encoder when
   * the learner chooses "start encoding", or kept for later when they choose
   * "save it for later". Encoding is deliberately NOT part of the lesson — the
   * lesson ends, then the learner decides.
   */
  encodingSeeds?: { title: string; prompt: string; exemplar: string; keywords?: string[] }[];
  masteryCheck?: {
    prompt: string;
    keywords?: string[];
    modelAnswer?: string;
    hints?: string[];
  };
  wrapup?: { summary?: string; callToAction?: string; connectionPrompt?: string };
}

export type TeachScope = 'notes' | 'stage' | 'schema';

export interface TeachLessonOptions {
  style: 'brilliant' | 'socratic' | 'storyteller' | 'professor' | 'meme';
  storyMode: boolean;
  checkpoints: number;        // 0-8 soft target
  lessonDepth: number;        // 1-3 concept-card layers per idea
  /** How exhaustive the lesson is: survey / deep / exhaustive. */
  detail: 'standard' | 'deep' | 'exhaustive';
  difficulty: 'intro' | 'standard' | 'viva';
  humor: number;              // 0-5
  includeAnalogy: boolean;
  includeMemoryHooks: boolean;
  allowFreeResponse: boolean;
  maxSteps: number;
}

export const DEFAULT_TEACH_OPTIONS: TeachLessonOptions = {
  style: 'brilliant',
  storyMode: true,
  checkpoints: 4,
  lessonDepth: 2,
  detail: 'deep',
  difficulty: 'standard',
  humor: 3,
  includeAnalogy: true,
  includeMemoryHooks: true,
  allowFreeResponse: true,
  maxSteps: 18,
};

