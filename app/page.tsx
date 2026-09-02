'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Brain,
  Sparkles,
  ArrowRight,
  CheckCircle,
  BookOpen,
  Loader2,
  RefreshCcw,
  Save,
  Volume2,
  VolumeX,
  Award,
  Zap,
  Layers,
  Lightbulb,
  Eye,
  GitMerge,
  Copy,
  Check,
  FileText,
  Flame,
  Settings,
  History as HistoryIcon,
  Play,
  RotateCcw,
  HelpCircle,
  CheckCheck,
  AlertCircle,
  Hash,
  Database,
  Cloud,
  User as UserIcon,
  Video,
  Shuffle,
  Compass,
  Clock,
  ExternalLink,
  ShieldCheck,
  SplitSquareVertical,
  CheckCircle2,
  Tv,
  Share2,
  PenTool,
  Star
} from 'lucide-react';
import { sound, playSound } from '@/lib/audio';
import { 
  Activity, 
  ActivityScaffold, 
  StageResponse, 
  EncodingMode, 
  SavedSchema,
  AISettings,
  UploadedFileAsset,
  GuidedPathModule,
  YouTubeMetadata,
  ResearchContextItem,
  VideoTimestamp,
  RoastReport
} from '@/lib/types';
import { 
  loadAISettings, 
  loadSavedSchemas, 
  saveSchemaToHistory, 
  deleteSchemaFromHistory, 
  clearAllSchemas,
  DEFAULT_SETTINGS 
} from '@/lib/storage';
import { 
  PrerequisitesReport, 
  PretestSession, 
  BlurtingEvaluation, 
  SegregationReport 
} from '@/lib/types';
import { initIndexedDB, getAllSchemasFromIDB } from '@/lib/db';
import { decompressSchemaFromUrl } from '@/lib/url-share';
import { SettingsModal } from '@/components/SettingsModal';
import { HistoryDrawer } from '@/components/HistoryDrawer';
import { DrillModal } from '@/components/DrillModal';
import { FileUploader } from '@/components/FileUploader';
import { AuthModal } from '@/components/AuthModal';
import { DeepResearchBadge } from '@/components/DeepResearchBadge';
import { YouTubePlayerEmbed } from '@/components/YouTubePlayerEmbed';
import { GuidedPathRoadmap } from '@/components/GuidedPathRoadmap';
import { InterleavingDrillModal } from '@/components/InterleavingDrillModal';
import RoastNotesModal from '@/components/RoastNotesModal';
import StatelessShareModal from '@/components/StatelessShareModal';
import { PWAInstallHeader } from '@/components/PWAInstallHeader';
import { ConceptPrerequisitesModal } from '@/components/ConceptPrerequisitesModal';
import { PretestModal } from '@/components/PretestModal';
import { BlurtingModal } from '@/components/BlurtingModal';
import { SegregationRemnoteModal } from '@/components/SegregationRemnoteModal';
import { AnkiExportModal } from '@/components/AnkiExportModal';
import { ComparativeSynthesisModal } from '@/components/ComparativeSynthesisModal';
import { StageVisualRenderer } from '@/components/stage-templates/StageVisualRenderer';
import { generateOfflineWorkout } from '@/lib/services/offlineGenerator';
import { GitCompare, WifiOff, BarChart2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { PreSessionConfidenceModal } from '@/components/PreSessionConfidenceModal';
import { ReadinessModal } from '@/components/ReadinessModal';
import { MetaReflectionPrompt } from '@/components/MetaReflectionPrompt';
import { EndSessionReviewModal, EndSessionReviewData } from '@/components/EndSessionReviewModal';
import { AnalyticsDashboard } from '@/components/AnalyticsDashboard';
import { computeSuccessRate, getDifficultyLevel, getDifficultyLabel } from '@/lib/services/adaptiveDifficulty';
import { incrementModelCall } from '@/lib/storage';

type AppState = 'input' | 'loading' | 'encoding' | 'completed';
type InputSourceTab = 'text' | 'file' | 'youtube';

// Concept Presets
const CONCEPTUAL_PRESETS = [
  {
    title: 'Biology: Action Potentials',
    icon: '⚡',
    notes: `Action potentials are rapid electrical signals used by neurons. 
At resting potential (-70mV), Na+/K+ pumps maintain high K+ inside and high Na+ outside. 
When a stimulus depolarizes the membrane to threshold (-55mV), voltage-gated Na+ channels open rapidly, causing Na+ influx (depolarization up to +40mV). 
Next, Na+ channels inactivate and voltage-gated K+ channels open, allowing K+ efflux (repolarization). 
The slow closure of K+ channels causes hyperpolarization before returning to resting state. Myelin sheaths enable saltatory conduction between Nodes of Ranvier.`
  },
  {
    title: 'CS: TCP 3-Way Handshake & AIMD',
    icon: '🌐',
    notes: `TCP uses a 3-way handshake to establish a reliable connection between client and server before data transfer begins.
Step 1: Client sends a SYN (Synchronize) packet with a random initial sequence number (ISN_c) to the server. Client enters SYN-SENT state.
Step 2: Server receives SYN, allocates buffers, and replies with SYN-ACK packet containing its own sequence number (ISN_s) and ACK = ISN_c + 1. Server enters SYN-RECEIVED state.
Step 3: Client sends an ACK packet with ACK = ISN_s + 1. Both endpoints are now in ESTABLISHED state.
For Congestion Control, TCP uses AIMD (Additive Increase / Multiplicative Decrease). It increases congestion window by 1 MSS per RTT, but cuts the window in half upon packet loss.`
  },
  {
    title: 'Psychology: Cognitive Dissonance',
    icon: '🧠',
    notes: `Leon Festinger's Cognitive Dissonance Theory states that when a person holds two contradictory beliefs, or their behavior conflicts with their belief, they experience an uncomfortable psychological tension called dissonance.
Because dissonance is unpleasant, individuals are motivated to reduce it through three strategies:
1. Changing the behavior (e.g. quit smoking).
2. Changing the cognition/attitude (e.g. "smoking isn't actually that dangerous").
3. Adding new consonant cognitions to justify the behavior (e.g. "smoking relieves my stress which keeps me healthy").`
  },
  {
    title: 'Finance: Compound Interest & Risk',
    icon: '📈',
    notes: `Compound interest is the addition of interest to the principal sum of a loan or deposit, or in other words, 'interest on interest'. 
The mathematical formula is A = P(1 + r/n)^(nt), where A is final amount, P is principal, r is annual interest rate, n is compounding frequency, and t is time.
Over short horizons, linear growth dominates, but over long horizons, exponential compounding causes exponential acceleration. As n approaches infinity, A = P * e^(rt).`
  }
];

// Memorization Presets
const MEMORIZATION_PRESETS = [
  {
    title: 'Chemistry: 7 Strong Acids vs Weak Acids',
    icon: '🧪',
    notes: `The 7 Strong Acids dissociate completely in water (Ka >> 1):
1. Hydrochloric Acid (HCl)
2. Hydrobromic Acid (HBr)
3. Hydroiodic Acid (HI)
4. Nitric Acid (HNO3)
5. Sulfuric Acid (H2SO4 - 1st proton)
6. Perchloric Acid (HClO4)
7. Chloric Acid (HClO3)

Common Weak Acids that only partially dissociate:
- Hydrofluoric acid (HF - despite being a halogen, strong H-F bond and high hydration enthalpy make it weak)
- Acetic acid (CH3COOH)
- Phosphoric acid (H3PO4)
- Carbonic acid (H2CO3)`
  },
  {
    title: 'Chemistry: Periodic Table Group 1 & 17 Trends',
    icon: '⚛️',
    notes: `Group 1 (Alkali Metals): Lithium (Li), Sodium (Na), Potassium (K), Rubidium (Rb), Cesium (Cs), Francium (Fr).
- Valence: 1 electron in s-orbital (ns1).
- Reactivity: Increases down the group as ionization energy decreases (larger atomic radius, shielding). React violently with water producing H2 gas and alkaline MOH.
- Stored under mineral oil to prevent oxidation.

Group 17 (Halogens): Fluorine (F), Chlorine (Cl), Bromine (Br), Iodine (I), Astatine (At).
- Valence: 7 electrons (ns2 np5), highly electronegative oxidizers.
- Physical state down group: F2 (pale yellow gas), Cl2 (green gas), Br2 (red-brown liquid), I2 (dark purple solid).
- Reactivity decreases down the group.`
  },
  {
    title: 'Biochemistry: 9 Essential Amino Acids',
    icon: '🧬',
    notes: `The 9 Essential Amino Acids that cannot be synthesized de novo by the human body:
1. Phenylalanine (Phe / F) - Aromatic, precursor to Tyrosine, Dopamine, Epinephrine.
2. Valine (Val / V) - Branched-Chain Amino Acid (BCAA), non-polar hydrophobic.
3. Threonine (Thr / T) - Polar uncharged, hydroxyl group.
4. Tryptophan (Trp / W) - Aromatic indole ring, precursor to Serotonin & Melatonin.
5. Isoleucine (Ile / I) - Branched-Chain Amino Acid (BCAA).
6. Methionine (Met / M) - Non-polar, contains sulfur, start codon (AUG).
7. Histidine (His / H) - Positively charged basic, imidazole ring, buffer.
8. Leucine (Leu / L) - Branched-Chain Amino Acid (BCAA), key trigger for mTOR protein synthesis.
9. Lysine (Lys / K) - Positively charged basic, amine side chain.`
  },
  {
    title: 'Medicine: 12 Cranial Nerves',
    icon: '🩻',
    notes: `The 12 Cranial Nerves and their primary functions:
CN I: Olfactory (Sensory - Smell)
CN II: Optic (Sensory - Vision)
CN III: Oculomotor (Motor - Eye movement, pupil constriction)
CN IV: Trochlear (Motor - Superior oblique eye muscle / down-and-in)
CN V: Trigeminal (Both - Facial sensation, chewing/mastication muscles)
CN VI: Abducens (Motor - Lateral rectus eye muscle / lateral gaze)
CN VII: Facial (Both - Facial expression muscles, taste anterior 2/3 tongue)
CN VIII: Vestibulocochlear (Sensory - Hearing & balance/vestibular)
CN IX: Glossopharyngeal (Both - Taste posterior 1/3, swallowing, carotid baroreceptors)
CN X: Vagus (Both - Parasympathetic innervation to heart, lungs, GI tract)
CN XI: Accessory (Motor - Sternocleidomastoid & Trapezius / shoulder shrug)
CN XII: Hypoglossal (Motor - Tongue movement)`
  }
];

// YouTube Video Lecture Presets (1-Click Test)
const YOUTUBE_PRESETS = [
  {
    title: '3Blue1Brown: Neural Networks & Backprop',
    url: 'https://www.youtube.com/watch?v=aircAruvnKk',
    channel: '3Blue1Brown',
    icon: '🤖'
  },
  {
    title: 'Khan Academy: Action Potentials & Gating',
    url: 'https://www.youtube.com/watch?v=7EyhsOewnH4',
    channel: 'Khan Academy',
    icon: '⚡'
  },
  {
    title: 'MIT OCW: TCP Congestion & Networking',
    url: 'https://www.youtube.com/watch?v=kZX169bNn4M',
    channel: 'MIT OpenCourseWare',
    icon: '🌐'
  },
  {
    title: 'Huberman Lab: Dopamine & Neuroplasticity',
    url: 'https://www.youtube.com/watch?v=QmOF0crdyRU',
    channel: 'Huberman Lab',
    icon: '🧠'
  }
];

export default function DeepEncodeApp() {
  const { user, cloudStats, saveSchemaToCloud, deleteSchemaFromCloud } = useAuth();

  const [appState, setAppState] = useState<AppState>('input');
  const [activeTab, setActiveTab] = useState<InputSourceTab>('text');
  const [encodingMode, setEncodingMode] = useState<EncodingMode>('conceptual');
  
  // Input sources
  const [rawNotes, setRawNotes] = useState('');
  const [uploadedFile, setUploadedFile] = useState<UploadedFileAsset | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');

  // Feature Toggles
  const [enableDeepResearch, setEnableDeepResearch] = useState(true);
  const [enableGuidedPath, setEnableGuidedPath] = useState(false);

  // Schema state
  const [topicSummary, setTopicSummary] = useState('');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [currentActivityIndex, setCurrentActivityIndex] = useState(0);

  // Guided Path Multi-Module state
  const [isGuidedPathMode, setIsGuidedPathMode] = useState(false);
  const [guidedModules, setGuidedModules] = useState<GuidedPathModule[]>([]);
  const [currentModuleIndex, setCurrentModuleIndex] = useState(0);

  // YouTube pipeline state
  const [youtubeData, setYoutubeData] = useState<YouTubeMetadata | null>(null);

  // Deep Research Grounded Contexts
  const [researchContexts, setResearchContexts] = useState<ResearchContextItem[]>([]);

  // User input responses per stage
  const [userResponses, setUserResponses] = useState<Record<string, StageResponse>>({});
  
  // Current active inputs
  const [field1, setField1] = useState('');
  const [field2, setField2] = useState('');
  const [field3, setField3] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string>('');

  // Feynman Evaluator checking state
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [feynmanResult, setFeynmanResult] = useState<StageResponse['feynmanReview'] | null>(null);

  // Gamification state
  const [xp, setXp] = useState(0);
  const [xpGainAnimation, setXpGainAnimation] = useState<number | null>(null);
  const [combo, setCombo] = useState(1);
  const [showExample, setShowExample] = useState(false);
  const [soundMuted, setSoundMuted] = useState(false);
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);

  // Modals & Storage
  const [aiSettings, setAiSettings] = useState<AISettings>(() => loadAISettings());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isInterleavingOpen, setIsInterleavingOpen] = useState(false);
  const [savedSchemas, setSavedSchemas] = useState<SavedSchema[]>(() => loadSavedSchemas());
  const [activeDrillSchema, setActiveDrillSchema] = useState<SavedSchema | null>(null);

  // Concept Prerequisites (You Are Not Ready) State
  const [isPrereqModalOpen, setIsPrereqModalOpen] = useState(false);
  const [isAuditingPrereq, setIsAuditingPrereq] = useState(false);
  const [prerequisitesReport, setPrerequisitesReport] = useState<PrerequisitesReport | null>(null);

  // Pre-Testing Effect (Productive Failure) State
  const [isPretestModalOpen, setIsPretestModalOpen] = useState(false);
  const [isLoadingPretest, setIsLoadingPretest] = useState(false);
  const [pretestSession, setPretestSession] = useState<PretestSession | null>(null);

  // Blurting Method State
  const [isBlurtingModalOpen, setIsBlurtingModalOpen] = useState(false);

  // Segregation & RemNote Engine State
  const [isSegregateModalOpen, setIsSegregateModalOpen] = useState(false);
  const [isSegregating, setIsSegregating] = useState(false);
  const [segregationReport, setSegregationReport] = useState<SegregationReport | null>(null);

  // Anki Export & Webhook SM-2 Sync State
  const [isAnkiExportOpen, setIsAnkiExportOpen] = useState(false);

  // Multi-Document Comparative 4-Quadrant Synthesis State
  const [isComparativeModalOpen, setIsComparativeModalOpen] = useState(false);

  // Roast My Notes Mode state
  const [isRoastModalOpen, setIsRoastModalOpen] = useState(false);
  const [isRoasting, setIsRoasting] = useState(false);
  const [roastReport, setRoastReport] = useState<RoastReport | null>(null);

  // Stateless URL Sharing state
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [schemaToShare, setSchemaToShare] = useState<SavedSchema | null>(null);
  const [importedShareBanner, setImportedShareBanner] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  // New Metacognition & Science States
  const [isConfidenceModalOpen, setIsConfidenceModalOpen] = useState(false);
  const [preSessionConfidence, setPreSessionConfidence] = useState<number>(3);
  const [isReadinessModalOpen, setIsReadinessModalOpen] = useState(false);
  const [isEndSessionReviewOpen, setIsEndSessionReviewOpen] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [endSessionReviewData, setEndSessionReviewData] = useState<EndSessionReviewData | null>(null);
  const [isLoadingEndSessionReview, setIsLoadingEndSessionReview] = useState(false);
  const [interleaveMode, setInterleaveMode] = useState(false);
  const [stageConfidence, setStageConfidence] = useState<number>(75);
  const [stageReflection, setStageReflection] = useState<string>('');
  const [stageCheckCount, setStageCheckCount] = useState<number>(0);
  const [stageErrorAnalysis, setStageErrorAnalysis] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsOffline(!navigator.onLine);
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const field1Ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const loadStageInputs = (activityIndex: number, acts: Activity[], responses: Record<string, StageResponse>) => {
    const act = acts[activityIndex];
    if (act && responses[act.id]) {
      const saved = responses[act.id];
      setField1(saved.field1 || '');
      setField2(saved.field2 || '');
      setField3(saved.field3 || '');
      setSelectedPreset(saved.selectedPreset || '');
      setFeynmanResult(saved.feynmanReview || null);
      setStageConfidence(saved.confidenceScore ?? 75);
      setStageReflection(saved.reflection || '');
      setStageCheckCount(saved.checkCount || 0);
      setStageErrorAnalysis(saved.errorAnalysis || null);
      if (!saved.readinessConfirmed) {
        setIsReadinessModalOpen(true);
      }
    } else {
      setField1('');
      setField2('');
      setField3('');
      setSelectedPreset('');
      setFeynmanResult(null);
      setStageConfidence(75);
      setStageReflection('');
      setStageCheckCount(0);
      setStageErrorAnalysis(null);
      setIsReadinessModalOpen(true);
    }
    setShowExample(false);
  };

  // Parse Stateless Shared Schema from URL query on Mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const timer = setTimeout(() => {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const shareParam = searchParams.get('share') || searchParams.get('data');
        if (shareParam) {
          const decoded = decompressSchemaFromUrl(shareParam);
          if (decoded && (decoded.activities?.length > 0 || decoded.guidedModules?.length)) {
            setTopicSummary(decoded.topicSummary || 'Shared Schema');
            setEncodingMode(decoded.mode || 'conceptual');
            setActivities(decoded.activities || []);
            setUserResponses(decoded.userResponses || {});
            setXp(decoded.xpEarned || 150);
            setIsGuidedPathMode(Boolean(decoded.isGuidedPath));
            setGuidedModules(decoded.guidedModules || []);
            setYoutubeData(decoded.youtubeData || null);
            setResearchContexts(decoded.researchContexts || []);
            setCurrentActivityIndex(0);
            loadStageInputs(0, decoded.activities || [], decoded.userResponses || {});
            setAppState('completed');
            setImportedShareBanner(decoded.topicSummary);
            sound.playSuccess();
          }
        }
      } catch (err) {
        console.error('Failed to parse share parameter on load:', err);
      }
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  // Hydrate local-first Offline IndexedDB schemas on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    initIndexedDB().then(async () => {
      try {
        const idbSchemas = await getAllSchemasFromIDB();
        if (idbSchemas && idbSchemas.length > 0) {
          setSavedSchemas(idbSchemas);
        }
      } catch (e) {
        console.warn('IDB schemas load warning:', e);
      }
    }).catch(err => console.warn('IDB init error:', err));
  }, []);

  // Concept Prerequisites (You Are Not Ready) Audit
  const handleAuditPrerequisites = async () => {
    if (!rawNotes.trim() && !uploadedFile) return;
    setIsAuditingPrereq(true);
    setIsPrereqModalOpen(true);
    sound.playBeep(480, 'sine', 0.15);

    try {
      const res = await fetch('/api/prerequisites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: rawNotes,
          file: uploadedFile,
          settings: aiSettings,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to audit prerequisites');
      }

      const data: PrerequisitesReport = await res.json();
      setPrerequisitesReport(data);
      sound.playSuccess();
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'Prerequisites audit failed. Try again.');
      setIsPrereqModalOpen(false);
    } finally {
      setIsAuditingPrereq(false);
    }
  };

  // Pre-Testing Effect (Productive Failure) Drill
  const handleLaunchPretest = async () => {
    if (!rawNotes.trim() && !uploadedFile) return;
    setIsLoadingPretest(true);
    setIsPretestModalOpen(true);
    sound.playBeep(520, 'triangle', 0.15);

    try {
      const res = await fetch('/api/pretest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: rawNotes,
          file: uploadedFile,
          settings: aiSettings,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate pre-test');
      }

      const data: PretestSession = await res.json();
      setPretestSession(data);
      sound.playSuccess();
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'Failed to prepare pre-test. Try again.');
      setIsPretestModalOpen(false);
    } finally {
      setIsLoadingPretest(false);
    }
  };

  // Concept vs Fact Segregator (4-Quadrant + RemNote)
  const handleSegregateNotes = async () => {
    if (!rawNotes.trim() && !uploadedFile) return;
    setIsSegregating(true);
    setIsSegregateModalOpen(true);
    sound.playBeep(600, 'sine', 0.15);

    try {
      const res = await fetch('/api/segregate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: rawNotes,
          file: uploadedFile,
          settings: aiSettings,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to segregate notes');
      }

      const data: SegregationReport = await res.json();
      setSegregationReport(data);
      sound.playSuccess();
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'Segregation failed. Try again.');
      setIsSegregateModalOpen(false);
    } finally {
      setIsSegregating(false);
    }
  };

  // Toggle sound
  const toggleSound = () => {
    const nextState = !soundMuted;
    setSoundMuted(nextState);
    sound.enabled = !nextState;
    if (!nextState) sound.playBeep(600, 'sine', 0.1);
  };

  // Open Stateless Share Modal helper
  const handleOpenStatelessShare = (schema?: SavedSchema) => {
    const target: SavedSchema = schema || {
      id: `schema_${Date.now()}`,
      timestamp: Date.now(),
      topicSummary: topicSummary || 'Synthesized Schema',
      mode: encodingMode,
      xpEarned: xp,
      activities,
      userResponses,
      sourceFileName: uploadedFile?.name,
      isGuidedPath: isGuidedPathMode,
      guidedModules: isGuidedPathMode ? guidedModules : undefined,
      youtubeData: youtubeData || undefined,
      researchContexts: researchContexts.length > 0 ? researchContexts : undefined
    };
    setSchemaToShare(target);
    setIsShareModalOpen(true);
    sound.playBeep(640, 'sine', 0.1);
  };

  // Roast My Notes Action Handler
  const handleRoastNotes = async () => {
    if (!rawNotes.trim() && !uploadedFile) return;

    setIsRoasting(true);
    setIsRoastModalOpen(true);
    sound.playBeep(480, 'triangle', 0.15);

    try {
      const response = await fetch('/api/roast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: rawNotes,
          file: uploadedFile,
          settings: aiSettings,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to roast notes');
      }

      const reportData: RoastReport = await response.json();
      setRoastReport(reportData);
      sound.playSuccess();
    } catch (err: any) {
      console.error('Roast error', err);
      alert(err?.message || 'Failed to get roast from professor. Please try again.');
      setIsRoastModalOpen(false);
    } finally {
      setIsRoasting(false);
    }
  };

  const handleInjectPatch = (patch: string) => {
    setRawNotes(prev => {
      const trimmed = prev.trim();
      return trimmed ? `${trimmed}\n\n[Correction / Rigor Addition]:\n${patch}` : patch;
    });
  };

  const handleApplyAllPatchesAndEncode = (patches: string[]) => {
    setRawNotes(prev => {
      const addition = patches.map(p => `• ${p}`).join('\n');
      const trimmed = prev.trim();
      return trimmed ? `${trimmed}\n\n[Professor Fixes Applied]:\n${addition}` : addition;
    });
    setIsRoastModalOpen(false);
    setTimeout(() => {
      handleGenerate();
    }, 150);
  };

  // Rank calculation based on XP
  const userRank = useMemo(() => {
    const displayXp = xp + (cloudStats?.totalXp || 0);
    if (displayXp >= 1000) return { title: 'Master Neural Architect', level: 5, color: 'text-amber-400 border-amber-500/40 bg-amber-500/10' };
    if (displayXp >= 750) return { title: 'Cognitive Synthesizer', level: 4, color: 'text-purple-400 border-purple-500/40 bg-purple-500/10' };
    if (displayXp >= 500) return { title: 'Schema Engineer', level: 3, color: 'text-indigo-400 border-indigo-500/40 bg-indigo-500/10' };
    if (displayXp >= 250) return { title: 'Active Encoder', level: 2, color: 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10' };
    return { title: 'Passive Reader', level: 1, color: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' };
  }, [xp, cloudStats]);

  const currentActivity = activities[currentActivityIndex];

  // Auto-detect massive text for Guided Path hint
  const wordCount = useMemo(() => {
    return rawNotes.trim() ? rawNotes.trim().split(/\s+/).length : 0;
  }, [rawNotes]);

  // Check matched keywords in real-time
  const matchedKeywords = useMemo(() => {
    if (!currentActivity?.keywords) return [];
    const combinedText = `${field1} ${field2} ${field3}`.toLowerCase();
    return currentActivity.keywords.filter(kw => {
      const cleanKw = kw.toLowerCase().trim();
      return cleanKw.length > 1 && combinedText.includes(cleanKw);
    });
  }, [currentActivity, field1, field2, field3]);

  // Real-time Semantic Depth score (0 to 100)
  const semanticDepth = useMemo(() => {
    let score = 0;
    const len1 = field1.trim().length;
    const len2 = field2.trim().length;
    const len3 = field3.trim().length;

    if (len1 > 10) score += 30;
    if (len1 > 30) score += 15;
    if (len2 > 10) score += 30;
    if (len2 > 30) score += 10;
    if (len3 > 5) score += 15;

    const kwBonus = (matchedKeywords.length / (currentActivity?.keywords?.length || 1)) * 20;
    return Math.min(100, Math.round(score + kwBonus));
  }, [field1, field2, field3, matchedKeywords, currentActivity]);

  // Award XP helper
  const addXP = (amount: number) => {
    setXp(prev => prev + amount);
    setXpGainAnimation(amount);
    setTimeout(() => setXpGainAnimation(null), 1800);
  };

  useEffect(() => {
    if (appState === 'encoding') {
      field1Ref.current?.focus();
    }
  }, [appState, currentActivityIndex]);

  // Initiate Generation with Pre-Session Confidence Gate
  const handleInitiateGenerate = () => {
    if (activeTab === 'youtube') {
      if (!youtubeUrl.trim()) return;
      handleGenerate();
      return;
    }
    if (!rawNotes.trim() && !uploadedFile) return;
    setIsConfidenceModalOpen(true);
  };

  // Main Generation Handler (Text / File / YouTube)
  const handleGenerate = async (confirmedConfidence?: number) => {
    const userConfidenceVal = confirmedConfidence || preSessionConfidence;
    setIsConfidenceModalOpen(false);

    if (activeTab === 'youtube') {
      if (!youtubeUrl.trim()) return;

      setAppState('loading');
      sound.playBeep(440, 'sine', 0.15);
      incrementModelCall(aiSettings.geminiModel || 'gemini-3.7-flash');

      try {
        const response = await fetch('/api/youtube', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoUrl: youtubeUrl.trim(),
            mode: encodingMode,
            settings: aiSettings,
          }),
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'Failed to process YouTube lecture');
        }

        const data = await response.json();
        if (data.activities && data.activities.length > 0) {
          setActivities(data.activities);
          setTopicSummary(data.topicSummary || data.videoTitle || 'YouTube Cognitive Schema');
          setYoutubeData(data.youtubeData || null);
          setIsGuidedPathMode(false);
          setGuidedModules([]);
          setResearchContexts(data.researchContexts || []);
          setCurrentActivityIndex(0);
          setUserResponses({});
          loadStageInputs(0, data.activities, {});
          setXp(120);
          addXP(120);
          sound.playSuccess();
          setAppState('encoding');
        } else {
          throw new Error('Invalid YouTube schema response format');
        }
      } catch (error: any) {
        console.error(error);
        alert(error?.message || 'Failed to process YouTube video. Please ensure the URL is valid.');
        setAppState('input');
      }
      return;
    }

    // Standard Notes or File Upload
    if (!rawNotes.trim() && !uploadedFile) return;

    setAppState('loading');
    sound.playBeep(440, 'sine', 0.15);
    incrementModelCall(aiSettings.geminiModel || 'gemini-3.7-flash');

    // If device is offline, immediately use deterministic client-side cognitive generator
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      try {
        const offlineData = generateOfflineWorkout(rawNotes, encodingMode);
        setIsGuidedPathMode(false);
        setGuidedModules([]);
        setActivities(offlineData.activities);
        setTopicSummary(offlineData.topicSummary);
        setResearchContexts([]);
        setYoutubeData(null);
        setCurrentActivityIndex(0);
        setUserResponses({});
        loadStageInputs(0, offlineData.activities, {});
        setXp(100);
        addXP(100);
        sound.playSuccess();
        setAppState('encoding');
        return;
      } catch (offErr) {
        console.error('Offline generator fallback error:', offErr);
      }
    }

    try {
      const sRate = computeSuccessRate(userResponses);
      const response = await fetch('/api/encode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          notes: rawNotes,
          mode: encodingMode,
          settings: aiSettings,
          file: uploadedFile,
          enableDeepResearch,
          enableGuidedPath: enableGuidedPath || wordCount > 900,
          userConfidence: userConfidenceVal,
          successRate: sRate,
          interleaveMode
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to generate schema');
      }

      const data = await response.json();

      if (data.isGuidedPath && data.guidedModules && data.guidedModules.length > 0) {
        // Guided Path Mode Active
        setIsGuidedPathMode(true);
        setGuidedModules(data.guidedModules);
        setCurrentModuleIndex(0);
        setTopicSummary(data.topicSummary || 'Guided Path Chapter');
        setActivities(data.guidedModules[0].activities || []);
        setResearchContexts(data.researchContexts || []);
        setYoutubeData(null);
        setCurrentActivityIndex(0);
        setUserResponses({});
        loadStageInputs(0, data.guidedModules[0].activities, {});
        setXp(150);
        addXP(150);
        sound.playSuccess();
        setAppState('encoding');
      } else if (data.activities && data.activities.length > 0) {
        // Standard Schema Mode
        setIsGuidedPathMode(false);
        setGuidedModules([]);
        setActivities(data.activities);
        setTopicSummary(data.topicSummary || (uploadedFile ? uploadedFile.name.replace(/\.[^/.]+$/, "") : (encodingMode === 'memorization' ? 'High-Yield Mnemonic Schema' : 'Active Cognitive Schema')));
        setResearchContexts(data.researchContexts || []);
        setYoutubeData(null);
        setCurrentActivityIndex(0);
        setUserResponses({});
        loadStageInputs(0, data.activities, {});
        setXp(100);
        addXP(100);
        sound.playSuccess();
        setAppState('encoding');
      } else {
        throw new Error('Invalid schema format returned from server');
      }
    } catch (error: any) {
      console.warn('Network or API generation failed, falling back to local offline cognitive generator...', error);
      try {
        const offlineData = generateOfflineWorkout(rawNotes, encodingMode);
        setIsGuidedPathMode(false);
        setGuidedModules([]);
        setActivities(offlineData.activities);
        setTopicSummary(`${offlineData.topicSummary} (Offline Backup)`);
        setResearchContexts([]);
        setYoutubeData(null);
        setCurrentActivityIndex(0);
        setUserResponses({});
        loadStageInputs(0, offlineData.activities, {});
        setXp(100);
        addXP(100);
        sound.playSuccess();
        setAppState('encoding');
      } catch (fallbackErr) {
        console.error('Offline fallback also failed:', fallbackErr);
        alert(error?.message || 'Something went wrong preparing your schema. Please check your settings or try again.');
        setAppState('input');
      }
    }
  };

  // Check if all activities for current module in Guided Path are answered
  const isAllActivitiesDoneForCurrentModule = useMemo(() => {
    if (!isGuidedPathMode || !activities || activities.length === 0) return false;
    return activities.every(act => {
      const resp = userResponses[act.id];
      return resp && resp.field1 && resp.field1.trim().length > 0 && resp.field2 && resp.field2.trim().length > 0;
    });
  }, [isGuidedPathMode, activities, userResponses]);

  // Handle Feynman Checkpoint Pass in Guided Path
  const handleFeynmanPass = (modIdx: number, score: number, xpBonus: number, feedback: string) => {
    addXP(xpBonus);
    setGuidedModules(prev => {
      const updated = [...prev];
      if (updated[modIdx]) {
        updated[modIdx] = {
          ...updated[modIdx],
          completed: true,
          feynmanCheckpoint: {
            ...updated[modIdx].feynmanCheckpoint,
            passed: true,
            score,
            feedback,
          }
        };
      }
      // Unlock next module
      if (modIdx + 1 < updated.length) {
        updated[modIdx + 1] = {
          ...updated[modIdx + 1],
          unlocked: true,
        };
      }
      return updated;
    });
  };

  // Switch active module in Guided Path
  const handleSelectModule = (index: number) => {
    if (!guidedModules[index] || !guidedModules[index].unlocked) return;
    setCurrentModuleIndex(index);
    const modActs = guidedModules[index].activities || [];
    setActivities(modActs);
    setCurrentActivityIndex(0);
    loadStageInputs(0, modActs, userResponses);
    sound.playBeep(600, 'triangle', 0.1);
  };

  // Feynman AI Answer Checker for individual stage (Supports Infinite Checks & Error Analysis)
  const handleCheckAnswer = async () => {
    if (!field1.trim() && !field2.trim()) return;

    setIsEvaluating(true);
    sound.playBeep(580, 'sine', 0.1);
    incrementModelCall(aiSettings.geminiCheckerModel || 'gemini-3.5-flash-lite');

    const nextCount = stageCheckCount + 1;
    setStageCheckCount(nextCount);

    try {
      const response = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageTitle: currentActivity.title,
          framework: currentActivity.framework,
          prompt: currentActivity.prompt,
          contextSnippet: currentActivity.contextSnippet,
          field1Label: currentActivity.scaffold.field1Label,
          field1Value: field1,
          field2Label: currentActivity.scaffold.field2Label,
          field2Value: field2,
          field3Label: currentActivity.scaffold.field3Label,
          field3Value: field3,
          expertCompletion: currentActivity.visualData?.generationChallenge?.expertCompletion || currentActivity.scaffold.exampleAnswer,
          premisePrompt: currentActivity.visualData?.generationChallenge?.premisePrompt,
          settings: aiSettings,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Evaluation failed');
      }

      const evalData = await response.json();
      setFeynmanResult(evalData);
      if (evalData.errorAnalysis) {
        setStageErrorAnalysis(evalData.errorAnalysis);
      }

      // Update response record with checkCount and errorAnalysis
      setUserResponses(prev => ({
        ...prev,
        [currentActivity.id]: {
          ...(prev[currentActivity.id] || { field1, field2 }),
          checkCount: nextCount,
          errorAnalysis: evalData.errorAnalysis || undefined,
          feynmanReview: evalData,
        }
      }));

      if (evalData.xpBonus) {
        addXP(evalData.xpBonus);
        sound.playSuccess();
      }
    } catch (e: any) {
      console.error('Evaluation error', e);
      alert(e?.message || 'Feynman evaluator unavailable. Please check settings.');
    } finally {
      setIsEvaluating(false);
    }
  };

  // End Session Batch Metacognitive Performance Review
  const handleEndSessionReview = async (customResponses?: Record<string, StageResponse>, customActivities?: Activity[]) => {
    const acts = customActivities || activities;
    const resps = customResponses || userResponses;
    if (!acts || acts.length === 0) return;

    setIsLoadingEndSessionReview(true);
    setIsEndSessionReviewOpen(true);
    incrementModelCall(aiSettings.geminiCheckerModel || 'gemini-3.5-flash-lite');

    try {
      const stagesPayload = acts.map(act => {
        const r = resps[act.id] || { field1: '', field2: '', field3: '' };
        return {
          title: act.title,
          framework: act.framework,
          field1Label: act.scaffold.field1Label,
          field1Value: r.field1,
          field2Label: act.scaffold.field2Label,
          field2Value: r.field2,
          field3Label: act.scaffold.field3Label,
          field3Value: r.field3,
          reflection: r.reflection,
        };
      });

      const response = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchMode: true,
          stages: stagesPayload,
          preSessionConfidence,
          topicSummary,
          settings: aiSettings,
        }),
      });

      if (!response.ok) throw new Error('Batch assessment failed');
      const data = await response.json();
      setEndSessionReviewData(data);
    } catch (err) {
      console.warn('End session review batch call fallback:', err);
      // Fallback local score calculation
      const scored = Object.values(resps).filter(r => r.feynmanReview);
      const avgScore = scored.length ? Math.round(scored.reduce((a, r) => a + (r.feynmanReview?.score || 75), 0) / scored.length) : 82;
      setEndSessionReviewData({
        overallScore: avgScore,
        analysis: 'Solid completion across the active generation stages. You systematically converted passive notes into intuitive first-principles mechanisms.',
        perStageGrades: acts.map(a => ({
          stageTitle: a.title,
          grade: resps[a.id]?.feynmanReview?.grade || 'good',
          score: resps[a.id]?.feynmanReview?.score || 80,
          feedback: resps[a.id]?.feynmanReview?.feedback || 'Active schema constructed.'
        }))
      });
    } finally {
      setIsLoadingEndSessionReview(false);
    }
  };

  const handleNextActivity = async () => {
    if (!field1.trim() || !field2.trim()) return;

    const baseStageXP = 150;
    const kwBonusXP = matchedKeywords.length * 35;
    const depthBonus = semanticDepth >= 80 ? 50 : 20;
    const totalGained = baseStageXP + kwBonusXP + depthBonus;

    addXP(totalGained);
    setCombo(prev => prev + 1);

    const updatedResponses: Record<string, StageResponse> = {
      ...userResponses,
      [currentActivity.id]: {
        field1,
        field2,
        field3,
        selectedPreset,
        feynmanReview: feynmanResult || undefined,
        confidenceScore: stageConfidence,
        reflection: stageReflection,
        checkCount: stageCheckCount,
        errorAnalysis: stageErrorAnalysis || undefined,
        readinessConfirmed: true,
      }
    };
    setUserResponses(updatedResponses);

    if (currentActivityIndex < activities.length - 1) {
      sound.playSuccess();
      const nextIdx = currentActivityIndex + 1;
      setCurrentActivityIndex(nextIdx);
      loadStageInputs(nextIdx, activities, updatedResponses);
    } else {
      if (isGuidedPathMode && currentModuleIndex < guidedModules.length - 1) {
        // Stay in Guided Path, module activities finished, prompt Feynman checkpoint
        sound.playSuccess();
      } else {
        sound.playLevelUp();
        setAppState('completed');

        // Auto-save completed schema to local storage & cloud
        const newSavedSchema: SavedSchema = {
          id: `schema_${Date.now()}`,
          timestamp: Date.now(),
          topicSummary: topicSummary || 'Synthesized Schema',
          mode: encodingMode,
          xpEarned: xp + totalGained,
          activities,
          userResponses: updatedResponses,
          sourceFileName: uploadedFile?.name,
          isGuidedPath: isGuidedPathMode,
          guidedModules: isGuidedPathMode ? guidedModules : undefined,
          youtubeData: youtubeData || undefined,
          researchContexts: researchContexts.length > 0 ? researchContexts : undefined
        };

        const updatedList = saveSchemaToHistory(newSavedSchema);
        setSavedSchemas(updatedList);
        await saveSchemaToCloud(newSavedSchema);

        // Auto-trigger End Session Review Modal
        handleEndSessionReview(updatedResponses, activities);
      }
    }
  };

  const handlePreviousActivity = () => {
    if (currentActivityIndex > 0) {
      const prevIdx = currentActivityIndex - 1;
      setCurrentActivityIndex(prevIdx);
      loadStageInputs(prevIdx, activities, userResponses);
    } else {
      setAppState('input');
    }
  };

  const resetApp = () => {
    setAppState('input');
    setRawNotes('');
    setUploadedFile(null);
    setYoutubeUrl('');
    setYoutubeData(null);
    setIsGuidedPathMode(false);
    setGuidedModules([]);
    setResearchContexts([]);
    setActivities([]);
    setCurrentActivityIndex(0);
    setUserResponses({});
    setField1('');
    setField2('');
    setField3('');
    setSelectedPreset('');
    setFeynmanResult(null);
    setXp(0);
    setCombo(1);
  };

  const handleResumeSchema = (saved: SavedSchema) => {
    setTopicSummary(saved.topicSummary);
    setEncodingMode(saved.mode);
    setActivities(saved.activities);
    setUserResponses(saved.userResponses);
    setXp(saved.xpEarned);
    setIsGuidedPathMode(Boolean(saved.isGuidedPath));
    setGuidedModules(saved.guidedModules || []);
    setYoutubeData(saved.youtubeData || null);
    setResearchContexts(saved.researchContexts || []);
    setCurrentActivityIndex(0);
    loadStageInputs(0, saved.activities, saved.userResponses);
    setAppState('completed');
    sound.playSuccess();
  };

  const handleDeleteSchema = async (id: string) => {
    const updated = deleteSchemaFromHistory(id);
    setSavedSchemas(updated);
    await deleteSchemaFromCloud(id);
  };

  const handleClearAllHistory = () => {
    clearAllSchemas();
    setSavedSchemas([]);
  };

  // Copy formats for RemNote / Anki / Markdown
  const copyToClipboard = (format: 'remnote' | 'anki' | 'markdown') => {
    let content = '';

    if (format === 'remnote') {
      content = `# ${topicSummary}\n\n`;
      activities.forEach(act => {
        const resp = userResponses[act.id] || { field1: '', field2: '', field3: '' };
        content += `${act.title} :: ${resp.field1}\n`;
        content += `  - Elaborative Mechanism ;; ${resp.field2}\n`;
        if (resp.field3) content += `  - Connection Anchor ;; ${resp.field3}\n`;
      });
    } else if (format === 'anki') {
      content = `# Anki Cloze Cards: ${topicSummary}\n\n`;
      activities.forEach((act, idx) => {
        const resp = userResponses[act.id] || { field1: '', field2: '', field3: '' };
        content += `CARD ${idx + 1}: ${act.title}\n`;
        content += `Prompt: {{c1::${resp.field1}}}\n`;
        content += `Mechanism: {{c2::${resp.field2}}}\n\n`;
      });
    } else {
      content = `# Deep Cognitive Schema: ${topicSummary}\n\n`;
      activities.forEach(act => {
        const resp = userResponses[act.id] || { field1: '', field2: '', field3: '' };
        content += `## ${act.title} (${act.framework})\n`;
        content += `> ${act.cognitiveGoal}\n\n`;
        content += `**${act.scaffold.field1Label}:**\n${resp.field1}\n\n`;
        content += `**${act.scaffold.field2Label}:**\n${resp.field2}\n\n`;
        if (resp.field3) {
          content += `**${act.scaffold.field3Label || 'Anchor'}:**\n${resp.field3}\n\n`;
        }
        content += `---\n\n`;
      });
    }

    navigator.clipboard.writeText(content);
    setCopiedFormat(format);
    sound.playBeep(880, 'sine', 0.1);
    setTimeout(() => setCopiedFormat(null), 2000);
  };

  return (
    <main className="min-h-screen bg-[#07080D] text-slate-100 flex flex-col items-center py-8 px-4 sm:px-6 relative overflow-x-hidden selection:bg-indigo-500/30 selection:text-white font-sans">
      
      {/* Background ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-[400px] h-[400px] bg-purple-600/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-4xl relative z-10 flex-1 flex flex-col">
        
        {/* Top Control Bar */}
        <header className="mb-8 flex items-center justify-between border-b border-slate-800/80 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 rounded-xl shadow-inner shadow-indigo-500/20">
              <Brain className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">DeepEncode</h1>
                <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-widest bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 rounded-full">
                  Gemini 3.7 Flash & Firestore
                </span>
              </div>
              <p className="text-xs text-slate-400">Multimodal cognitive schema architect with adaptive chunking & interleaving</p>
            </div>
          </div>

          {/* Gamification Bar & Top Buttons */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {appState !== 'input' && (
              <div className="flex items-center gap-2.5 bg-[#0F111A] border border-slate-800 px-3 py-1.5 rounded-xl shadow-lg relative">
                <div className="flex items-center gap-1 text-amber-400">
                  <Zap className="w-4 h-4 fill-amber-400 animate-bounce" />
                  <span className="text-xs font-black font-mono tracking-tight">{xp} XP</span>
                </div>

                <div className="h-4 w-px bg-slate-800" />

                <div className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded border ${userRank.color}`}>
                  Lvl {userRank.level}: {userRank.title}
                </div>

                {/* Floating XP Gain Indicator */}
                <AnimatePresence>
                  {xpGainAnimation && (
                    <motion.div
                      initial={{ opacity: 0, y: 0, scale: 0.8 }}
                      animate={{ opacity: 1, y: -28, scale: 1.1 }}
                      exit={{ opacity: 0 }}
                      className="absolute -top-3 right-4 px-2 py-0.5 bg-emerald-500 text-black text-[11px] font-black rounded-md shadow-lg shadow-emerald-500/30 flex items-center gap-1 z-20"
                    >
                      <Sparkles className="w-3 h-3" />
                      +{xpGainAnimation} XP!
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* PWA Local-First Offline & Install Indicator */}
            {isOffline && (
              <div className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl text-[11px] font-mono font-semibold flex items-center gap-1.5 shadow-sm">
                <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Offline Mode</span>
              </div>
            )}
            <PWAInstallHeader />

            {/* Multi-Doc Comparative Synthesis Button */}
            <button
              type="button"
              onClick={() => setIsComparativeModalOpen(true)}
              className="p-2 bg-gradient-to-r from-purple-600/20 to-pink-600/20 hover:from-purple-600/30 hover:to-pink-600/30 border border-purple-500/40 text-purple-300 rounded-xl transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
              title="Compare two documents (e.g. Lecture Slides vs Textbook Chapter)"
            >
              <GitCompare className="w-4 h-4 text-purple-400" />
              <span className="text-[11px] font-bold hidden md:inline">Compare 2 Docs</span>
            </button>

            {/* Anki & SM-2 Exporter Button */}
            <button
              type="button"
              onClick={() => setIsAnkiExportOpen(true)}
              className="p-2 bg-gradient-to-r from-cyan-600/20 to-blue-600/20 hover:from-cyan-600/30 hover:to-blue-600/30 border border-cyan-500/40 text-cyan-300 rounded-xl transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
              title="Export .apkg Anki package or sync via SM-2 Webhooks"
            >
              <Zap className="w-4 h-4 text-amber-300" />
              <span className="text-[11px] font-bold hidden md:inline">Anki / SM-2</span>
            </button>

            {/* Interleaving Multi-Domain Drill Button */}
            <button
              type="button"
              onClick={() => setIsInterleavingOpen(true)}
              className="p-2 bg-gradient-to-r from-violet-600/20 to-indigo-600/20 hover:from-violet-600/30 hover:to-indigo-600/30 border border-violet-500/40 text-violet-300 rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
              title="Start Interleaved Multi-Domain Drill (Mix subjects)"
            >
              <Shuffle className="w-4 h-4 text-violet-400" />
              <span className="text-[11px] font-bold hidden md:inline">Interleaved Drill</span>
            </button>

            {/* Stateless Share Button in Top Bar (when active or completed) */}
            {appState !== 'input' && (
              <button
                type="button"
                onClick={() => handleOpenStatelessShare()}
                className="p-2 bg-[#0F111A] hover:bg-[#151824] border border-cyan-500/40 text-cyan-300 hover:text-cyan-200 rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
                title="Share Stateless URL (Free & Zero DB Required)"
              >
                <Share2 className="w-4 h-4 text-cyan-400" />
                <span className="text-[11px] font-bold hidden sm:inline">Share</span>
              </button>
            )}

            {/* Cloud Sync / Account Button */}
            <button
              onClick={() => setIsAuthOpen(true)}
              className={`p-2 border rounded-xl transition-all flex items-center gap-1.5 ${
                user 
                  ? 'bg-indigo-600/10 border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/20' 
                  : 'bg-[#0F111A] hover:bg-[#151824] border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title={user ? `Signed in as ${user.displayName || user.email || 'User'} (Cloud Synced)` : 'Connect Cloud Database (Firestore)'}
            >
              <Cloud className={`w-4 h-4 ${user ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span className="text-[11px] font-bold hidden sm:inline">
                {user ? (user.displayName?.split(' ')[0] || 'Synced') : 'Cloud'}
              </span>
            </button>

            {/* Metacognitive Performance Review Button (when completed) */}
            {appState === 'completed' && (
              <button
                type="button"
                onClick={() => handleEndSessionReview()}
                className="p-2 bg-gradient-to-r from-emerald-600/20 to-teal-600/20 hover:from-emerald-600/30 hover:to-teal-600/30 border border-emerald-500/40 text-emerald-300 rounded-xl transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                title="View Metacognitive Performance Review"
              >
                <Award className="w-4 h-4 text-emerald-400" />
                <span className="text-[11px] font-bold hidden sm:inline">AI Review</span>
              </button>
            )}

            {/* Analytics Dashboard Button */}
            <button
              type="button"
              onClick={() => setIsAnalyticsOpen(true)}
              className="p-2 bg-[#0F111A] hover:bg-[#151824] border border-violet-500/40 text-violet-300 hover:text-violet-200 rounded-xl transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
              title="Metacognitive Analytics & Model Quota Dashboard"
            >
              <BarChart2 className="w-4 h-4 text-violet-400" />
              <span className="text-[11px] font-bold hidden md:inline">Analytics</span>
            </button>

            {/* Saved Schemas History Button */}
            <button
              onClick={() => setIsHistoryOpen(true)}
              className="p-2 bg-[#0F111A] hover:bg-[#151824] border border-slate-800 text-slate-400 hover:text-slate-200 rounded-xl transition-all relative"
              title="View Saved Schemas History"
            >
              <HistoryIcon className="w-4 h-4 text-indigo-400" />
              {savedSchemas.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.2 bg-indigo-600 text-white text-[9px] font-mono font-bold rounded-full border border-slate-900">
                  {savedSchemas.length}
                </span>
              )}
            </button>

            {/* AI Settings / Multi-Key Button */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 bg-[#0F111A] hover:bg-[#151824] border border-slate-800 text-slate-400 hover:text-slate-200 rounded-xl transition-all"
              title="Configure Models (Gemini 3.7 Flash & 3.5 Flash-Lite)"
            >
              <Settings className="w-4 h-4 text-slate-300" />
            </button>

            {/* Audio Toggle */}
            <button
              onClick={toggleSound}
              className="p-2 bg-[#0F111A] hover:bg-[#151824] border border-slate-800 text-slate-400 hover:text-slate-200 rounded-xl transition-all"
              title={soundMuted ? 'Unmute audio effects' : 'Mute audio effects'}
            >
              {soundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-indigo-400" />}
            </button>
          </div>
        </header>

        {/* Imported Stateless Link Notification Banner */}
        {importedShareBanner && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-cyan-950/90 via-slate-900 to-indigo-950/90 border border-cyan-500/50 shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center justify-center shrink-0">
                <Share2 className="w-4 h-4 text-cyan-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-black text-slate-100 text-sm">Classmate Shared Schema Loaded</span>
                  <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 text-[9px] font-mono uppercase font-bold">
                    Stateless URL
                  </span>
                </div>
                <p className="text-slate-300 text-xs mt-0.5">
                  Loaded <strong className="text-cyan-300">&ldquo;{importedShareBanner}&rdquo;</strong> completely free with zero database login needed.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  const current: SavedSchema = {
                    id: `shared_${Date.now()}`,
                    timestamp: Date.now(),
                    topicSummary: topicSummary || 'Shared Schema',
                    mode: encodingMode,
                    xpEarned: xp,
                    activities,
                    userResponses,
                    isGuidedPath: isGuidedPathMode,
                    guidedModules: isGuidedPathMode ? guidedModules : undefined,
                    youtubeData: youtubeData || undefined,
                    researchContexts: researchContexts.length > 0 ? researchContexts : undefined
                  };
                  const updated = saveSchemaToHistory(current);
                  setSavedSchemas(updated);
                  sound.playSuccess();
                  setImportedShareBanner(null);
                }}
                className="px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs cursor-pointer shadow-lg shadow-cyan-600/20"
              >
                Save to History
              </button>
              <button
                type="button"
                onClick={() => setImportedShareBanner(null)}
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                ✕
              </button>
            </div>
          </motion.div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* STATE 1: RAW NOTES INPUT + MULTIMODAL UPLOADER + YOUTUBE      */}
        {/* ------------------------------------------------------------- */}
        {appState === 'input' && (
          <motion.div
            key="input"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full flex flex-col gap-6"
          >
            {/* Top Source Tabs: Text Notes vs PDF/Image vs YouTube Lecture */}
            <div className="flex bg-[#0F111A] p-1.5 rounded-xl border border-slate-800 shadow-xl">
              <button
                type="button"
                onClick={() => setActiveTab('text')}
                className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'text'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#141724]'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                <span>Text Notes / Chapter</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('file')}
                className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'file'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#141724]'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>PDF Slides & Notes</span>
                {uploadedFile && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('youtube')}
                className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'youtube'
                    ? 'bg-red-600 text-white shadow-md shadow-red-600/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#141724]'
                }`}
              >
                <Video className="w-4 h-4" />
                <span>YouTube Lecture URL</span>
                <span className="px-1.5 py-0.2 bg-red-500/30 text-red-200 text-[9px] font-black rounded uppercase">
                  Timestamped
                </span>
              </button>
            </div>

            {/* Cognitive Mode Switcher: Conceptual vs Memorization Heavy */}
            <div className="bg-[#0F111A] rounded-xl border border-slate-800 p-2 flex flex-col sm:flex-row gap-2 shadow-xl">
              <button
                type="button"
                onClick={() => {
                  setEncodingMode('conceptual');
                  sound.playBeep(520, 'sine', 0.08);
                }}
                className={`flex-1 p-3.5 rounded-lg border text-left transition-all ${
                  encodingMode === 'conceptual'
                    ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg shadow-indigo-500/10'
                    : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#141724]'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Brain className="w-4 h-4 text-indigo-400" />
                  <span className="font-bold text-xs">Deep Conceptual & Mechanism Mode</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  First Principles, Elaborative Interrogation, Paivio Dual Coding & Analogical Transfer for complex theories.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEncodingMode('memorization');
                  sound.playBeep(650, 'sine', 0.08);
                }}
                className={`flex-1 p-3.5 rounded-lg border text-left transition-all ${
                  encodingMode === 'memorization'
                    ? 'bg-amber-600/20 border-amber-500 text-white shadow-lg shadow-amber-500/10'
                    : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#141724]'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Hash className="w-4 h-4 text-amber-400" />
                  <span className="font-bold text-xs">Rote & Mnemonic Memorization Mode</span>
                  <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 text-[9px] font-black rounded uppercase">
                    High-Yield
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Miller&apos;s Chunking, Phonetic Pegs, Memory Palace & 2x2 Contrast Grids for Periodic Table, Acids, Drugs & Anatomy.
                </p>
              </button>
            </div>

            {/* Cognitive Features Bar: Deep Research Context Fetcher & Miller's Law Guided Path */}
            <div className="bg-[#0F111A] rounded-xl border border-slate-800 p-4 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              {/* Deep Research Toggle */}
              <label className="flex items-start sm:items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enableDeepResearch}
                  onChange={(e) => setEnableDeepResearch(e.target.checked)}
                  className="mt-0.5 sm:mt-0 w-4 h-4 accent-amber-500 rounded cursor-pointer"
                />
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                    <span>Deep Research / Prerequisite Context Grounding</span>
                    <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 text-[9px] font-mono rounded">
                      Google Grounded
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Detects omitted foundational mechanisms in raw notes and integrates prerequisite context.
                  </p>
                </div>
              </label>

              {/* Guided Path Adaptive Chunking Toggle */}
              <label className="flex items-start sm:items-center gap-3 cursor-pointer select-none border-t sm:border-t-0 sm:border-l border-slate-800 pt-3 sm:pt-0 sm:pl-4">
                <input
                  type="checkbox"
                  checked={enableGuidedPath || wordCount > 900}
                  onChange={(e) => setEnableGuidedPath(e.target.checked)}
                  className="mt-0.5 sm:mt-0 w-4 h-4 accent-indigo-500 rounded cursor-pointer"
                />
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                    <Compass className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Miller&apos;s Law Guided Path (Adaptive Chunking)</span>
                    {wordCount > 900 && (
                      <span className="px-1.5 py-0.2 bg-indigo-500/20 text-indigo-300 text-[9px] font-mono rounded">
                        Auto-Suggested ({wordCount} words)
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Decomposes massive textbook chapters into unlocked modules gated by Feynman checkpoints.
                  </p>
                </div>
              </label>

              {/* Interleaved Template Switching Toggle */}
              <label className="flex items-start sm:items-center gap-3 cursor-pointer select-none border-t sm:border-t-0 sm:border-l border-slate-800 pt-3 sm:pt-0 sm:pl-4">
                <input
                  type="checkbox"
                  checked={interleaveMode}
                  onChange={(e) => setInterleaveMode(e.target.checked)}
                  className="mt-0.5 sm:mt-0 w-4 h-4 accent-violet-500 rounded cursor-pointer"
                />
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                    <Shuffle className="w-3.5 h-3.5 text-violet-400" />
                    <span>Interleaved Template Switching</span>
                    <span className="px-1.5 py-0.2 bg-violet-500/20 text-violet-300 text-[9px] font-mono rounded">
                      Science
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Alternates conceptual & memorization templates across stages for stronger cognitive transfer.
                  </p>
                </div>
              </label>
            </div>

            {/* TAB CONTENT: 1. FILE UPLOAD */}
            {activeTab === 'file' && (
              <FileUploader
                selectedFile={uploadedFile}
                onFileLoaded={(file) => setUploadedFile(file)}
              />
            )}

            {/* TAB CONTENT: 2. YOUTUBE URL INPUT */}
            {activeTab === 'youtube' && (
              <div className="bg-[#0F111A] rounded-xl shadow-2xl border border-red-500/30 overflow-hidden flex flex-col p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-red-600/20 text-red-400 border border-red-500/30">
                      <Tv className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-bold text-white text-base">
                        YouTube Video to Cognitive Schema Pipeline
                      </h2>
                      <p className="text-xs text-slate-400">
                        Paste any lecture or video URL. Gemini will extract core timestamps and build interactive review checkpoints.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                    YouTube Video URL:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                      className="flex-1 rounded-xl bg-slate-950 border border-slate-700 p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => handleGenerate()}
                      disabled={!youtubeUrl.trim()}
                      className="px-6 py-3 bg-red-600 hover:bg-red-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 shrink-0 cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>Encode Video (+120 XP)</span>
                    </button>
                  </div>
                </div>

                {/* 1-Click Video Presets */}
                <div className="space-y-2 pt-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Or Test Popular Educational Lectures (1-Click):
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {YOUTUBE_PRESETS.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setYoutubeUrl(preset.url);
                          sound.playBeep(550 + idx * 60, 'triangle', 0.08);
                        }}
                        className="flex items-center gap-3 p-3 rounded-xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-red-500/40 text-left transition-all group"
                      >
                        <span className="text-xl">{preset.icon}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-200 group-hover:text-red-300 truncate">
                            {preset.title}
                          </p>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {preset.channel}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT: 3. TEXT NOTES INPUT */}
            {activeTab !== 'youtube' && (
              <>
                {/* Presets Grid */}
                <div className="bg-[#0F111A] rounded-xl border border-slate-800/90 p-5 shadow-xl">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                      <Flame className="w-4 h-4 text-amber-400" />
                      {encodingMode === 'memorization' ? 'Memorization & Chemistry Presets (1-Click Test):' : 'Conceptual Presets (1-Click Test):'}
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">Cognitive Science Validated</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    {(encodingMode === 'memorization' ? MEMORIZATION_PRESETS : CONCEPTUAL_PRESETS).map((preset, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setRawNotes(preset.notes);
                          sound.playBeep(500 + idx * 70, 'triangle', 0.08);
                        }}
                        className="flex flex-col text-left p-3 rounded-lg bg-[#141724] hover:bg-[#1B1F2E] border border-slate-800 hover:border-indigo-500/40 transition-all group"
                      >
                        <span className="text-base mb-1">{preset.icon}</span>
                        <span className="text-xs font-bold text-slate-200 group-hover:text-indigo-300 transition-colors">
                          {preset.title}
                        </span>
                        <span className="text-[10px] text-slate-500 mt-1 line-clamp-1">Click to auto-populate</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Input Card */}
                <div className="bg-[#0F111A] rounded-xl shadow-2xl border border-slate-800 overflow-hidden flex flex-col">
                  <div className="p-5 border-b border-slate-800 bg-[#131622] flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <BookOpen className="w-5 h-5 text-indigo-400" />
                      <h2 className="font-bold text-white text-base">
                        {encodingMode === 'memorization' 
                          ? 'Paste Memorization Material or Supplemental Notes' 
                          : 'Paste Raw Study Notes, Textbook Chapter, or Lecture Summary'}
                      </h2>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-800/80 px-2.5 py-1 rounded">
                      {wordCount > 0 ? `${wordCount} words` : 'Empty'}
                    </span>
                  </div>

                  <div className="p-6 flex-1">
                    <textarea
                      value={rawNotes}
                      onChange={(e) => setRawNotes(e.target.value)}
                      placeholder={
                        uploadedFile 
                          ? `[File attached: ${uploadedFile.name}] Add any specific focus instructions, focus chapters, or supplemental notes here...`
                          : encodingMode === 'memorization'
                            ? "Paste list of acids, periodic table groups, drug classifications, amino acids, or cranial nerves..."
                            : "Paste raw lecture notes, medical mechanisms, algorithms, legal cases, or multi-thousand-word textbook chapter..."
                      }
                      className="w-full h-44 resize-none outline-none bg-transparent text-slate-200 placeholder:text-slate-600 text-base leading-relaxed font-serif"
                    />
                  </div>

                  {/* Card Footer */}
                  <div className="p-5 bg-[#0B0D14] border-t border-slate-800/90 flex flex-col sm:flex-row gap-4 items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      <span>
                        {uploadedFile 
                          ? `Gemini 3.7 Flash will extract visual and textual data from ${uploadedFile.name}`
                          : enableGuidedPath || wordCount > 900
                            ? "Miller's Law Adaptive Guided Path will break this into chapter milestones"
                            : encodingMode === 'memorization'
                              ? 'AI generates chunking clusters, mnemonic pegs, and memory palace anchors'
                              : 'AI generates 5 scaffolded active-encoding stages'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
                      {/* Concept Prerequisites Audit Button */}
                      <button
                        type="button"
                        onClick={handleAuditPrerequisites}
                        disabled={(!rawNotes.trim() && !uploadedFile) || isAuditingPrereq}
                        className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-amber-300 text-xs font-bold rounded-lg border border-amber-500/40 shadow-sm transition-all cursor-pointer"
                        title="Concept Prerequisites Check: Diagnoses background fundamentals you need before tackling this topic"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                        <span>{isAuditingPrereq ? 'Auditing...' : 'Check Prerequisites'}</span>
                      </button>

                      {/* Pre-Testing Effect Button */}
                      <button
                        type="button"
                        onClick={handleLaunchPretest}
                        disabled={(!rawNotes.trim() && !uploadedFile) || isLoadingPretest}
                        className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-rose-300 text-xs font-bold rounded-lg border border-rose-500/40 shadow-sm transition-all cursor-pointer"
                        title="Pre-Testing Effect (Productive Failure): 3-question diagnostic failure drill before learning"
                      >
                        <Zap className="w-3.5 h-3.5 text-rose-400" />
                        <span>{isLoadingPretest ? 'Generating...' : 'Pre-Test Drill'}</span>
                      </button>

                      {/* Concept vs Fact Segregator Button */}
                      <button
                        type="button"
                        onClick={handleSegregateNotes}
                        disabled={(!rawNotes.trim() && !uploadedFile) || isSegregating}
                        className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-cyan-300 text-xs font-bold rounded-lg border border-cyan-500/40 shadow-sm transition-all cursor-pointer"
                        title="Concept vs Fact Segregator & RemNote: 4-Quadrant Matrix + Cloze Optimizer"
                      >
                        <SplitSquareVertical className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{isSegregating ? 'Segregating...' : 'Segregate & RemNote'}</span>
                      </button>

                      {/* Roast My Notes Button */}
                      <button
                        type="button"
                        onClick={handleRoastNotes}
                        disabled={(!rawNotes.trim() && !uploadedFile) || isRoasting}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-600 via-orange-600 to-red-600 hover:from-amber-500 hover:to-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold uppercase tracking-wider rounded-lg border border-orange-500/50 shadow-md shadow-orange-600/20 transition-all cursor-pointer group"
                        title="Strict Professor Audit: Call out fallacies, hand-waving, and missing gaps before encoding"
                      >
                        <Flame className="w-3.5 h-3.5 text-amber-200 group-hover:scale-110 transition-transform" />
                        <span>{isRoasting ? 'Auditing...' : 'Roast Notes'}</span>
                      </button>

                      {/* Primary Encode Button */}
                      <button
                        onClick={handleInitiateGenerate}
                        disabled={!rawNotes.trim() && !uploadedFile}
                        className="flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none disabled:cursor-not-allowed text-white text-xs font-bold uppercase tracking-wider rounded-lg border border-indigo-500/50 shadow-lg shadow-indigo-500/20 transition-all cursor-pointer"
                      >
                        {enableGuidedPath || wordCount > 900 ? 'Architect Guided Path (+150 XP)' : 'Architect Schema (+100 XP)'}
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Cognitive framework explanations */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <div className="p-4 bg-[#0F111A]/60 border border-slate-800/70 rounded-xl">
                <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold mb-1.5">
                  <Layers className="w-4 h-4" />
                  {encodingMode === 'memorization' ? "Miller's 7±2 Law & Chunking" : "Craik & Lockhart Levels of Processing"}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {encodingMode === 'memorization'
                    ? "Chunking arbitrary items into semantic sub-clusters prevents working memory overload."
                    : "Semantic analysis creates drastically stronger memory traces than passive re-reading."}
                </p>
              </div>
              <div className="p-4 bg-[#0F111A]/60 border border-slate-800/70 rounded-xl">
                <div className="flex items-center gap-2 text-purple-400 text-xs font-bold mb-1.5">
                  <Eye className="w-4 h-4" />
                  {encodingMode === 'memorization' ? "Method of Loci (Palace)" : "Paivio Dual Coding (1986)"}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {encodingMode === 'memorization'
                    ? "Placing items along a familiar physical path leverages spatial navigation memory."
                    : "Forming both verbal and visual mental spatial codes doubles retrievability during recall."}
                </p>
              </div>
              <div className="p-4 bg-[#0F111A]/60 border border-slate-800/70 rounded-xl">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold mb-1.5">
                  <Shuffle className="w-4 h-4" />
                  <span>The Interleaving Effect</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Mixing diverse domains forces active neural discrimination, preventing mental fixation and building flexible mastery.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* STATE 2: LOADING                                              */}
        {/* ------------------------------------------------------------- */}
        {appState === 'loading' && (
          <motion.div
            key="loading"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full py-28 flex flex-col items-center justify-center text-center"
          >
            <div className="relative mb-6">
              <div className="w-16 h-16 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
              <Brain className="w-7 h-7 text-indigo-400 absolute inset-0 m-auto animate-pulse" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">
              {activeTab === 'youtube'
                ? 'Deconstructing YouTube Video Lecture Timestamps...'
                : uploadedFile 
                  ? `Multimodal Analysis (${uploadedFile.name})...` 
                  : isGuidedPathMode || wordCount > 900
                    ? "Architecting Miller's Law Guided Path..."
                    : encodingMode === 'memorization' 
                      ? 'Constructing Mnemonic & Chunking Blueprint...' 
                      : 'Deconstructing Semantic Schemas...'}
            </h2>
            <p className="text-slate-400 max-w-md font-serif italic text-sm">
              {activeTab === 'youtube'
                ? 'Gemini 3.7 Flash is extracting key lecture milestones, visual animations, and timestamp anchors.'
                : enableDeepResearch
                  ? 'Deep Research Agent is analyzing prerequisite foundational context & grounding omissions.'
                  : 'Applying cognitive encoding principles to build your interactive workspace.'}
            </p>
          </motion.div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* STATE 3: INTERACTIVE GAMIFIED ENCODING WORKOUT               */}
        {/* ------------------------------------------------------------- */}
        {appState === 'encoding' && currentActivity && (
          <motion.div
            key={`stage-${currentActivity.id}`}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="w-full flex flex-col gap-6"
          >
            {/* Guided Path Roadmap (if Guided Path mode is active) */}
            {isGuidedPathMode && guidedModules.length > 0 && (
              <GuidedPathRoadmap
                modules={guidedModules}
                currentModuleIndex={currentModuleIndex}
                onSelectModule={handleSelectModule}
                onFeynmanPass={handleFeynmanPass}
                isAllActivitiesDoneForCurrentModule={isAllActivitiesDoneForCurrentModule}
                settings={aiSettings}
              />
            )}

            {/* Embedded YouTube Player with clickable timestamp anchors (if YouTube mode) */}
            {youtubeData && (
              <YouTubePlayerEmbed
                youtubeData={youtubeData}
                activeTimestamp={currentActivity.videoTimestamp}
              />
            )}

            {/* Stage Progress Bar & Combo Header */}
            <div className="bg-[#0F111A] rounded-xl border border-slate-800 p-4 shadow-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  {activities.map((act, index) => {
                    const isCompleted = index < currentActivityIndex;
                    const isCurrent = index === currentActivityIndex;
                    return (
                      <div
                        key={act.id}
                        className={`h-2.5 rounded-full transition-all duration-300 ${
                          isCompleted
                            ? 'w-6 bg-emerald-500 shadow-sm shadow-emerald-500/50'
                            : isCurrent
                            ? 'w-10 bg-indigo-500 shadow-md shadow-indigo-500/50'
                            : 'w-4 bg-slate-800'
                        }`}
                        title={`Stage ${index + 1}: ${act.title}`}
                      />
                    );
                  })}
                </div>
                <span className="text-xs font-bold text-slate-400 ml-2">
                  Stage {currentActivityIndex + 1} of {activities.length}
                </span>
              </div>

              {/* Combo multiplier indicator */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-lg text-xs font-bold font-mono">
                  <Flame className="w-3.5 h-3.5 fill-amber-400" />
                  {combo}x STREAK
                </div>
              </div>
            </div>

            {/* Deep Research Badge (if prerequisite context was added for this stage or topic) */}
            {currentActivity.researchContext && (
              <DeepResearchBadge context={currentActivity.researchContext} />
            )}

            {/* Stage Main Scaffold Workspace Card */}
            <div className="bg-[#0F111A] rounded-xl shadow-2xl border border-slate-800 overflow-hidden flex flex-col">
              
              {/* Stage Header */}
              <div className="p-6 border-b border-slate-800 bg-[#131622] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 rounded">
                      {currentActivity.framework}
                    </span>
                    {currentActivity.templateType && (
                      <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/40 rounded flex items-center gap-1">
                        <Eye className="w-3 h-3 text-purple-400" />
                        <span>{currentActivity.templateType.replace(/_/g, ' ')}</span>
                      </span>
                    )}
                    <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-emerald-400" />
                      <span>Generation Effect</span>
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      Goal: {currentActivity.cognitiveGoal}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <span>{currentActivity.stageNumber}. {currentActivity.title}</span>
                    {currentActivity.videoTimestamp && (
                      <span className="px-2 py-0.5 bg-red-600/20 border border-red-500/30 text-red-300 text-xs font-mono font-bold rounded-md">
                        ▶ {currentActivity.videoTimestamp.formatted}
                      </span>
                    )}
                  </h2>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    onClick={() => setShowExample(!showExample)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-[#1A1D2B] hover:bg-[#23273A] border border-slate-700 text-slate-300 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                  >
                    <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                    {showExample ? 'Hide AI Example' : 'See AI Example'}
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                
                {/* Target Source Fact / Context Snippet */}
                <div className="p-4 bg-[#141724] border-l-4 border-indigo-500 rounded-r-xl text-slate-300 text-xs font-serif leading-relaxed italic">
                  <span className="font-sans font-bold text-[10px] text-indigo-400 uppercase not-italic block mb-1">
                    Target Concept Extract:
                  </span>
                  &ldquo;{currentActivity.contextSnippet}&rdquo;
                </div>

                {/* Overarching Guiding Prompt */}
                <div className="text-slate-200 text-sm font-medium leading-relaxed bg-indigo-950/20 p-4 rounded-xl border border-indigo-800/40">
                  <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    Encoding Challenge
                  </div>
                  {currentActivity.prompt}
                </div>

                {/* AI Example Preview Accordion */}
                <AnimatePresence>
                  {showExample && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-4 bg-amber-500/5 border border-amber-500/30 rounded-xl text-amber-200 text-xs font-serif leading-relaxed">
                        <span className="font-sans font-bold text-[10px] text-amber-400 uppercase block mb-1">
                          Exemplary Encoding Archetype:
                        </span>
                        {currentActivity.scaffold.exampleAnswer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Dynamic Visual Template Model */}
                <StageVisualRenderer
                  activity={currentActivity}
                  field1={field1}
                  field2={field2}
                  field3={field3}
                  selectedPreset={selectedPreset}
                />

                {/* Optional Preset Pills (e.g. Analogy Domain choices, Chunk categories) */}
                {currentActivity.scaffold.presetOptions && currentActivity.scaffold.presetOptions.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                      Choose or Adapt a Domain Anchor:
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {currentActivity.scaffold.presetOptions.map((opt, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setSelectedPreset(opt);
                            if (!field1) setField1(opt);
                            sound.playBeep(600 + idx * 50, 'triangle', 0.08);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                            selectedPreset === opt
                              ? 'bg-indigo-600 border-indigo-400 text-white shadow-md shadow-indigo-500/20'
                              : 'bg-[#141724] border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Interactive Scaffold Fields */}
                <div className="space-y-5 pt-2">
                  
                  {/* Field 1 */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center justify-between">
                      <span>{currentActivity.scaffold.field1Label}</span>
                      <span className="text-[10px] text-slate-500 font-mono">Step 1 of 2</span>
                    </label>
                    <div className="relative">
                      {currentActivity.scaffold.field1Prefix && (
                        <span className="absolute left-3.5 top-3.5 text-xs text-slate-500 font-mono select-none">
                          {currentActivity.scaffold.field1Prefix}
                        </span>
                      )}
                      <textarea
                        ref={field1Ref as any}
                        value={field1}
                        onChange={(e) => setField1(e.target.value)}
                        placeholder={currentActivity.scaffold.field1Placeholder}
                        rows={2}
                        className={`w-full p-3 bg-[#141724] border border-slate-800 rounded-xl text-slate-200 placeholder:text-slate-600 text-sm leading-relaxed outline-none focus:border-indigo-500 transition-colors font-serif resize-none ${
                          currentActivity.scaffold.field1Prefix ? 'pl-24' : ''
                        }`}
                      />
                    </div>
                  </div>

                  {/* Field 2 */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center justify-between">
                      <span>{currentActivity.scaffold.field2Label}</span>
                      <span className="text-[10px] text-slate-500 font-mono">Step 2 of 2</span>
                    </label>
                    <div className="relative">
                      {currentActivity.scaffold.field2Prefix && (
                        <span className="absolute left-3.5 top-3.5 text-xs text-slate-500 font-mono select-none">
                          {currentActivity.scaffold.field2Prefix}
                        </span>
                      )}
                      <textarea
                        value={field2}
                        onChange={(e) => setField2(e.target.value)}
                        placeholder={currentActivity.scaffold.field2Placeholder}
                        rows={3}
                        className={`w-full p-3 bg-[#141724] border border-slate-800 rounded-xl text-slate-200 placeholder:text-slate-600 text-sm leading-relaxed outline-none focus:border-purple-500 transition-colors font-serif resize-none ${
                          currentActivity.scaffold.field2Prefix ? 'pl-24' : ''
                        }`}
                      />
                    </div>
                  </div>

                  {/* Optional Field 3 */}
                  {currentActivity.scaffold.field3Label && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-emerald-300 uppercase tracking-wider block">
                        {currentActivity.scaffold.field3Label}
                      </label>
                      <input
                        type="text"
                        value={field3}
                        onChange={(e) => setField3(e.target.value)}
                        placeholder={currentActivity.scaffold.field3Placeholder || ''}
                        className="w-full p-3 bg-[#141724] border border-slate-800 rounded-xl text-slate-200 placeholder:text-slate-600 text-sm outline-none focus:border-emerald-500 transition-colors font-serif"
                      />
                    </div>
                  )}

                </div>

                {/* Socratic Feynman AI Review Section (Infinite Checks + Error Analysis) */}
                <div className="pt-2 space-y-3">
                  {feynmanResult ? (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-4 rounded-xl border space-y-2.5 ${
                        feynmanResult.grade === 'mastered'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                          : feynmanResult.grade === 'good'
                          ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-200'
                          : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Brain className="w-4 h-4 text-indigo-400" />
                          <span className="font-bold text-xs uppercase tracking-wider">
                            Feynman AI Evaluation ({feynmanResult.score}/100)
                          </span>
                          <span className="px-2 py-0.2 text-[9px] font-black rounded uppercase bg-black/40">
                            {feynmanResult.grade.replace('_', ' ')}
                          </span>
                          {stageCheckCount > 0 && (
                            <span className="px-1.5 py-0.2 bg-purple-500/20 text-purple-300 text-[9px] font-mono rounded">
                              Check #{stageCheckCount}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-amber-400">
                            +{feynmanResult.xpBonus} XP
                          </span>
                          {/* Infinite Re-check Button */}
                          <button
                            type="button"
                            onClick={handleCheckAnswer}
                            disabled={isEvaluating || (!field1.trim() && !field2.trim())}
                            className="flex items-center gap-1 px-2.5 py-1 bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-200 text-[11px] font-bold rounded-lg transition-all disabled:opacity-40 cursor-pointer"
                            title="Re-check this stage with Feynman AI (unlimited)"
                          >
                            {isEvaluating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
                            <span>Re-Check</span>
                          </button>
                        </div>
                      </div>

                      <p className="text-xs leading-relaxed font-serif">
                        {feynmanResult.feedback}
                      </p>

                      {feynmanResult.depthAlert && (
                        <div className="text-[11px] text-amber-300 font-sans flex items-center gap-1.5 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                          <span>{feynmanResult.depthAlert}</span>
                        </div>
                      )}

                      {/* Targeted Error Analysis Callout */}
                      {(feynmanResult.errorAnalysis || stageErrorAnalysis) && (
                        <div className="text-[11px] text-rose-300 font-sans flex items-start gap-2 bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/30">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400 mt-0.5" />
                          <div>
                            <span className="font-bold text-rose-200 uppercase tracking-wider text-[10px] block">Error-Based Learning Gap:</span>
                            <p>{feynmanResult.errorAnalysis || stageErrorAnalysis}</p>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  ) : (
                    <div className="flex items-center justify-between p-3 bg-[#121522] border border-slate-800 rounded-xl">
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Brain className="w-4 h-4 text-purple-400" />
                        <span>Test your answer for the <em>Illusion of Explanatory Depth</em></span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCheckAnswer}
                        disabled={isEvaluating || (!field1.trim() && !field2.trim())}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 text-xs font-bold rounded-lg transition-all disabled:opacity-40 cursor-pointer"
                      >
                        {isEvaluating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        {isEvaluating ? 'Assessing Depth...' : 'Check with Feynman AI'}
                      </button>
                    </div>
                  )}

                  {/* Confidence-Weighted Response Slider */}
                  {(field1.trim() || field2.trim()) && (
                    <div className="p-3 bg-[#0B0D14] border border-slate-800/80 rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                          <Star className="w-3 h-3 text-amber-400" />
                          <span>Confidence in this Deduction:</span>
                        </span>
                        <span className="font-mono font-bold text-amber-300 text-xs">{stageConfidence}%</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        step="5"
                        value={stageConfidence}
                        onChange={e => setStageConfidence(Number(e.target.value))}
                        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                      />
                    </div>
                  )}

                  {/* Meta-Reflection Prompt (Consolidation) */}
                  {(field1.trim() || field2.trim()) && (
                    <MetaReflectionPrompt
                      stageTitle={currentActivity.title}
                      savedReflection={stageReflection}
                      onSave={refl => setStageReflection(refl)}
                    />
                  )}
                </div>

                {/* Real-time Semantic Depth & Keyword Match Meters */}
                <div className="p-4 bg-[#0B0D14] border border-slate-800/80 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="w-full sm:w-1/2">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                        Semantic Encoding Depth
                      </span>
                      <span className="font-mono font-bold text-indigo-400 text-xs">{semanticDepth}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-300"
                        style={{ width: `${semanticDepth}%` }}
                      />
                    </div>
                  </div>

                  <div className="w-full sm:w-1/2">
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] block mb-1.5">
                      Active Keyword Coverage ({matchedKeywords.length}/{currentActivity.keywords.length})
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {currentActivity.keywords.map((kw, i) => {
                        const isMatched = matchedKeywords.some(m => m.toLowerCase() === kw.toLowerCase());
                        return (
                          <span
                            key={i}
                            className={`px-2 py-0.5 text-[10px] rounded font-mono transition-colors ${
                              isMatched
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                                : 'bg-slate-800/60 text-slate-500 border border-slate-800'
                            }`}
                          >
                            {isMatched ? '✓ ' : ''}{kw}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>

              </div>

              {/* Stage Footer Controls */}
              <div className="p-5 bg-[#0B0D14] border-t border-slate-800/90 flex items-center justify-between">
                <button
                  onClick={handlePreviousActivity}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  {currentActivityIndex === 0 ? 'Back to Input' : 'Previous Stage'}
                </button>

                <button
                  onClick={handleNextActivity}
                  disabled={!field1.trim() || !field2.trim()}
                  className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none disabled:cursor-not-allowed text-white text-xs font-bold uppercase tracking-wider rounded-lg border border-indigo-500/50 shadow-lg shadow-indigo-500/20 transition-all cursor-pointer"
                >
                  {currentActivityIndex === activities.length - 1 ? 'Lock In & Synthesize (+200 XP)' : 'Next Stage (+150 XP)'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

            </div>
          </motion.div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* STATE 4: COMPLETED MASTER SCHEMA & SRS EXPORT MATRIX         */}
        {/* ------------------------------------------------------------- */}
        {appState === 'completed' && (
          <motion.div
            key="completed"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full flex flex-col gap-6"
          >
            {/* Completion Hero Banner */}
            <div className="p-8 bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-[#0F111A] border border-indigo-500/30 rounded-2xl shadow-2xl relative overflow-hidden flex flex-col items-center text-center">
              <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 rounded-2xl mb-3 shadow-lg shadow-emerald-500/10">
                <Award className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight mb-1">
                Cognitive Encoding Workout Complete!
              </h2>
              <p className="text-xs text-slate-300 font-serif italic max-w-lg mb-4">
                You have successfully transformed passive input into durable semantic neural schema.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-mono">
                <div className="flex items-center gap-1 bg-[#131622] px-3.5 py-1.5 rounded-xl border border-slate-800">
                  <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
                  <span className="text-slate-400">Total XP Earned:</span>
                  <span className="font-black text-amber-400">{xp} XP</span>
                </div>

                <div className="flex items-center gap-1 bg-[#131622] px-3.5 py-1.5 rounded-xl border border-slate-800">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span className="text-slate-400">Stages Completed:</span>
                  <span className="font-bold text-emerald-400">{activities.length} / {activities.length} (100%)</span>
                </div>

                {youtubeData && (
                  <div className="flex items-center gap-1 bg-red-950/30 border border-red-500/40 text-red-300 px-3 py-1.5 rounded-xl">
                    <Video className="w-3.5 h-3.5 text-red-400" />
                    <span>Timestamped Video Linked</span>
                  </div>
                )}
              </div>
            </div>

            {/* Interleaving CTA banner on completed screen */}
            <div className="p-5 rounded-2xl bg-gradient-to-r from-violet-950/40 to-indigo-950/30 border border-violet-500/30 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/40 text-violet-300 shrink-0">
                  <Shuffle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">
                    Supercharge Retention with an Interleaved Workout
                  </h4>
                  <p className="text-xs text-slate-300">
                    Mix this schema with other saved subjects in rapid-fire retrieval practice.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsInterleavingOpen(true)}
                className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-violet-600/20 flex items-center gap-2 shrink-0 cursor-pointer"
              >
                <Zap className="w-4 h-4 fill-white" />
                <span>Start Interleaved Drill</span>
              </button>
            </div>

            {/* Quick Export Actions (RemNote, Anki, Markdown, Stateless URL Share) */}
            <div className="bg-[#0F111A] rounded-xl border border-slate-800 p-6 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Save className="w-4 h-4 text-indigo-400" />
                  Port to Spaced Repetition or Share
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Copy clean formats into RemNote, Anki, Obsidian, or generate a 100% free share link</p>
              </div>

              <div className="flex flex-wrap gap-2.5">
                {/* Blurting Method Canvas Button */}
                <button
                  type="button"
                  onClick={() => setIsBlurtingModalOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-fuchsia-600/20 to-pink-600/20 hover:from-fuchsia-600/30 hover:to-pink-600/30 border border-fuchsia-500/40 text-fuchsia-300 text-xs font-bold rounded-lg transition-all cursor-pointer shadow-sm"
                  title="The Blurting Method: Test free recall from memory on a blank canvas. AI marks missed first principles in red."
                >
                  <PenTool className="w-3.5 h-3.5 text-fuchsia-400" />
                  <span>Blurting Canvas (Active Recall)</span>
                </button>

                {/* RemNote 4-Quadrant Matrix & API Push */}
                <button
                  type="button"
                  onClick={() => {
                    setSegregationReport({
                      topic: topicSummary,
                      compressionRatio: '65% Semantic Fluff Eliminated',
                      declarativeFacts: [],
                      conceptualMechanisms: activities.map(act => ({
                        id: act.id,
                        conceptName: act.title,
                        whatIsIt: userResponses[act.id]?.field1 || act.cognitiveGoal,
                        whyItMatters: userResponses[act.id]?.field2 || act.prompt,
                        howItWorks: act.contextSnippet,
                        whatIfEdgeCase: act.scaffold.exampleAnswer || 'If key boundary conditions fail, system collapses into disordered state.',
                        boundaryContrast: {
                          confusableLookalike: `Superficial misinterpretation of ${act.title}`,
                          distinguishingRule: `True ${act.title} requires active first-principles mechanism.`
                        }
                      }))
                    });
                    setIsSegregateModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-cyan-600/20 to-blue-600/20 hover:from-cyan-600/30 hover:to-blue-600/30 border border-cyan-500/40 text-cyan-300 text-xs font-bold rounded-lg transition-all cursor-pointer shadow-sm"
                  title="RemNote Hierarchical Matrix & API Push"
                >
                  <SplitSquareVertical className="w-3.5 h-3.5 text-cyan-400" />
                  <span>RemNote 4-Quadrant & API</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenStatelessShare()}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-cyan-600/20 to-indigo-600/20 hover:from-cyan-600/30 hover:to-indigo-600/30 border border-cyan-500/40 text-cyan-300 text-xs font-bold rounded-lg transition-all cursor-pointer shadow-sm"
                >
                  <Share2 className="w-3.5 h-3.5 text-cyan-400" />
                  Share Link (Stateless)
                </button>

                <button
                  onClick={() => copyToClipboard('remnote')}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-[#161A28] hover:bg-[#1E2336] border border-slate-700 text-slate-200 text-xs font-bold rounded-lg transition-all cursor-pointer"
                >
                  {copiedFormat === 'remnote' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-indigo-400" />}
                  Copy for RemNote
                </button>

                <button
                  onClick={() => copyToClipboard('anki')}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-[#161A28] hover:bg-[#1E2336] border border-slate-700 text-slate-200 text-xs font-bold rounded-lg transition-all cursor-pointer"
                >
                  {copiedFormat === 'anki' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-purple-400" />}
                  Copy Anki Cloze
                </button>

                <button
                  onClick={() => copyToClipboard('markdown')}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 border border-indigo-500/50 text-white text-xs font-bold rounded-lg transition-all cursor-pointer"
                >
                  {copiedFormat === 'markdown' ? <Check className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                  Copy Full Markdown
                </button>
              </div>
            </div>

            {/* Generated Schemas Matrix */}
            <div className="bg-[#0F111A] rounded-xl shadow-2xl border border-slate-800 overflow-hidden">
              <div className="p-5 border-b border-slate-800 bg-[#121520] flex items-center justify-between">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  Your Synthesized Cognitive Schemas ({topicSummary})
                </h3>
              </div>

              <div className="divide-y divide-slate-800/80">
                {activities.map((act) => {
                  const resp = userResponses[act.id] || { field1: '', field2: '', field3: '' };
                  return (
                    <div key={act.id} className="p-6 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-[10px] font-bold rounded uppercase tracking-wider">
                            Stage {act.stageNumber}: {act.title}
                          </span>
                          <span className="text-xs text-slate-400 font-mono">({act.framework})</span>
                        </div>
                        {act.videoTimestamp && (
                          <span className="text-xs text-red-400 font-mono font-bold">
                            ▶ {act.videoTimestamp.formatted}
                          </span>
                        )}
                      </div>

                      {act.researchContext && (
                        <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
                          <strong>Grounded Prerequisite:</strong> {act.researchContext.conceptAdded} — {act.researchContext.explanation}
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1">
                        <div className="bg-[#141724] p-4 rounded-lg border border-slate-800">
                          <h5 className="text-[11px] font-bold text-indigo-300 uppercase mb-1">
                            {act.scaffold.field1Label}
                          </h5>
                          <p className="text-xs text-slate-200 font-serif leading-relaxed">
                            {resp.field1}
                          </p>
                        </div>

                        <div className="bg-[#141724] p-4 rounded-lg border border-slate-800">
                          <h5 className="text-[11px] font-bold text-purple-300 uppercase mb-1">
                            {act.scaffold.field2Label}
                          </h5>
                          <p className="text-xs text-slate-200 font-serif leading-relaxed">
                            {resp.field2}
                          </p>
                        </div>
                      </div>

                      {resp.field3 && (
                        <div className="bg-black/30 p-3.5 rounded-lg border border-dashed border-slate-700 text-xs text-slate-300 font-serif">
                          <span className="font-sans font-bold text-[10px] text-emerald-400 uppercase mr-2">
                            {act.scaffold.field3Label || 'Anchor'}:
                          </span>
                          {resp.field3}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Restart Button */}
            <div className="flex justify-center mt-2 pb-12">
              <button
                onClick={resetApp}
                className="flex items-center gap-2 px-7 py-3 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors shadow-sm cursor-pointer"
              >
                <RefreshCcw className="w-4 h-4" />
                Encode Another Topic
              </button>
            </div>
          </motion.div>
        )}

      </div>

      {/* Auth / Cloud Sync Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaved={(newSettings) => setAiSettings(newSettings)}
      />

      {/* Saved Schemas History Drawer */}
      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        schemas={savedSchemas}
        onSelectSchemaToResume={handleResumeSchema}
        onStartDrill={(schema) => setActiveDrillSchema(schema)}
        onShareSchema={(schema) => handleOpenStatelessShare(schema)}
        onDeleteSchema={handleDeleteSchema}
        onClearAll={handleClearAllHistory}
        onOpenAuth={() => {
          setIsHistoryOpen(false);
          setIsAuthOpen(true);
        }}
      />

      {/* Interactive Active Retrieval Drill Modal */}
      <DrillModal
        isOpen={!!activeDrillSchema}
        schema={activeDrillSchema}
        onClose={() => setActiveDrillSchema(null)}
        onDrillComplete={(score) => {
          addXP(score >= 80 ? 100 : 50);
        }}
      />

      {/* Interleaving Multi-Domain Drill Modal */}
      <InterleavingDrillModal
        isOpen={isInterleavingOpen}
        onClose={() => setIsInterleavingOpen(false)}
        savedSchemas={savedSchemas}
        onAwardXP={(earnedXp) => addXP(earnedXp)}
      />

      {/* Roast My Notes Strict Professor Modal */}
      <RoastNotesModal
        isOpen={isRoastModalOpen}
        onClose={() => setIsRoastModalOpen(false)}
        report={roastReport}
        loading={isRoasting}
        onInjectPatch={handleInjectPatch}
        onApplyAllPatchesAndEncode={handleApplyAllPatchesAndEncode}
        onProceedToEncode={() => {
          setIsRoastModalOpen(false);
          handleGenerate();
        }}
        onRetryRoast={handleRoastNotes}
      />

      {/* Stateless URL Sharing Modal (LZ-String Compression) */}
      <StatelessShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        schema={schemaToShare}
      />

      {/* Feature 43: Concept Prerequisites (You Are Not Ready Warning) Modal */}
      <ConceptPrerequisitesModal
        isOpen={isPrereqModalOpen}
        onClose={() => setIsPrereqModalOpen(false)}
        report={prerequisitesReport}
        isLoading={isAuditingPrereq}
        onProceedToEncode={() => {
          setIsPrereqModalOpen(false);
          handleGenerate();
        }}
      />

      {/* Feature 63: The Pre-Testing Effect (Productive Failure) Modal */}
      <PretestModal
        isOpen={isPretestModalOpen}
        onClose={() => setIsPretestModalOpen(false)}
        session={pretestSession}
        onPretestComplete={() => {
          addXP(80);
          setIsPretestModalOpen(false);
          handleGenerate();
        }}
      />

      {/* Feature 51: The Blurting Method (Free Recall Blank Canvas) Modal */}
      <BlurtingModal
        isOpen={isBlurtingModalOpen}
        onClose={() => setIsBlurtingModalOpen(false)}
        schemaTitle={topicSummary}
        activities={activities}
        researchContexts={researchContexts}
        settings={aiSettings}
      />

      {/* Features 71-80: Concept vs Fact Segregator & RemNote Hierarchical Engine Modal */}
      <SegregationRemnoteModal
        isOpen={isSegregateModalOpen}
        onClose={() => setIsSegregateModalOpen(false)}
        report={segregationReport}
        activeSchema={{
          topicSummary,
          activities,
          userResponses,
          mode: encodingMode,
        }}
        settings={aiSettings}
      />

      {/* Feature: Direct Anki .apkg Export & SM-2 Spaced Repetition Webhook Sync */}
      <AnkiExportModal
        isOpen={isAnkiExportOpen}
        onClose={() => setIsAnkiExportOpen(false)}
        schema={{
          topicSummary,
          activities,
          userResponses,
        }}
        report={segregationReport}
      />

      {/* Feature: Multi-Document Comparative 4-Quadrant Synthesis */}
      <ComparativeSynthesisModal
        isOpen={isComparativeModalOpen}
        onClose={() => setIsComparativeModalOpen(false)}
        settings={aiSettings}
        onOpenAnkiExport={(compReport) => {
          setIsComparativeModalOpen(false);
          setIsAnkiExportOpen(true);
        }}
      />

      {/* Science Feature: Pre-Session Metacognitive Confidence Rating Modal */}
      <PreSessionConfidenceModal
        isOpen={isConfidenceModalOpen}
        topicPreview={rawNotes.slice(0, 120) || (uploadedFile ? uploadedFile.name : '')}
        onConfirm={(stars) => {
          setPreSessionConfidence(stars);
          handleGenerate(stars);
        }}
        onSkip={() => {
          setPreSessionConfidence(3);
          handleGenerate(3);
        }}
      />

      {/* Science Feature: Stage Readiness & Premise Retrieval Modal */}
      {currentActivity && (
        <ReadinessModal
          isOpen={isReadinessModalOpen}
          stageNumber={currentActivity.stageNumber || currentActivityIndex + 1}
          stageTitle={currentActivity.title}
          previousPremise={
            currentActivityIndex > 0 && activities[currentActivityIndex - 1]
              ? activities[currentActivityIndex - 1].visualData?.generationChallenge?.premisePrompt || activities[currentActivityIndex - 1].title
              : undefined
          }
          onConfirm={(latencyMs, summary) => {
            setIsReadinessModalOpen(false);
            setUserResponses(prev => ({
              ...prev,
              [currentActivity.id]: {
                ...(prev[currentActivity.id] || { field1: '', field2: '' }),
                readinessConfirmed: true,
                readinessLatencyMs: latencyMs,
              }
            }));
          }}
        />
      )}

      {/* Science Feature: End Session Metacognitive Performance Review Modal */}
      <EndSessionReviewModal
        isOpen={isEndSessionReviewOpen}
        onClose={() => setIsEndSessionReviewOpen(false)}
        preSessionConfidence={preSessionConfidence}
        sessionData={endSessionReviewData}
        isLoading={isLoadingEndSessionReview}
        topicSummary={topicSummary || 'Cognitive Schema'}
      />

      {/* Science Feature: Metacognitive Analytics & Model Quota Dashboard */}
      <AnalyticsDashboard
        isOpen={isAnalyticsOpen}
        onClose={() => setIsAnalyticsOpen(false)}
        savedSchemas={savedSchemas}
      />

    </main>
  );
}
