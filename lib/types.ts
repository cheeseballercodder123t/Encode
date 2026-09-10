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
  feynmanReview?: {
    grade: 'mastered' | 'good' | 'needs_elaboration';
    score: number;
    feedback: string;
    xpBonus: number;
    depthAlert?: string;
    errorAnalysis?: string;
  };
  confidenceScore?: number;        // 0-100 slider value
  reflection?: string;             // one-sentence takeaway
  checkCount?: number;             // how many times re-checked by AI
  errorAnalysis?: string;          // targeted diff feedback from checker
  readinessConfirmed?: boolean;    // readiness modal confirmed
  readinessLatencyMs?: number;     // ms from modal open to confirm
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

export interface PretestQuestion {
  id: string;
  questionNumber: number;
  questionPrompt: string;
  subtleTrap: string;
  firstPrincipleAnswer: string;
  whyAttemptingMatters?: string;
  userHypothesis?: string;
  submitted?: boolean;
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

export interface SegregationReport {
  topic: string;
  declarativeFacts: DeclarativeFactItem[];
  conceptualMechanisms: ConceptualMechanismItem[];
  compressionRatio?: string;
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
  | 'checkpoint'       // interactive MCQ / ordering / matching / fill-blank / free-response
  | 'guidedProblem'    // Brilliant-style worked example with step reveal
  | 'youTry'           // learner attempts, then reveals the model answer
  | 'memoryHook'       // mnemonic peg / chant / palace link (memorization mode)
  | 'storyBeat'        // narrative continuation (story mode)
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
  /** Optional chapter grouping label for the progress rail. */
  chapterTitle?: string;
  xpValue?: number;
}

export interface TeachLesson {
  title: string;
  tagline?: string;
  estimatedMin?: number;
  intro?: { hook?: string; whyItMatters?: string };
  segments: LessonSegment[];
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
  difficulty: 'standard',
  humor: 3,
  includeAnalogy: true,
  includeMemoryHooks: true,
  allowFreeResponse: true,
  maxSteps: 14,
};

