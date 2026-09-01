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
  researchContext?: ResearchContextItem;
  videoTimestamp?: VideoTimestamp;
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
  };
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


