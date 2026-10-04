'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { BracketTag } from '@/components/ui/BracketTag';
import { motion, AnimatePresence } from 'motion/react';
import { sound } from '@/lib/audio';
import {
  Activity,
  StageResponse,
  SavedSchema,
  AISettings,
  PrerequisitesReport,
  PretestSession,
  SegregationReport,
  RoastReport,
  TeachScope
} from '@/lib/types';
import { incrementModelCall, saveGenerationInProgress, clearGenerationInProgress, loadGenerationInProgress, loadStudyPrefs, saveStudyPrefs, recordTopicResult, loadTopicStruggles } from '@/lib/storage';
import { decompressSchemaFromUrl } from '@/lib/url-share';
import { SettingsModal } from '@/components/SettingsModal';
import { HistoryDrawer } from '@/components/HistoryDrawer';
import { AuthModal } from '@/components/AuthModal';
import { DeepResearchBadge } from '@/components/DeepResearchBadge';
import { GuidedPathRoadmap } from '@/components/GuidedPathRoadmap';
import RoastNotesModal from '@/components/RoastNotesModal';
import StatelessShareModal from '@/components/StatelessShareModal';
import { PWAInstallHeader } from '@/components/PWAInstallHeader';
import { ConceptPrerequisitesModal } from '@/components/ConceptPrerequisitesModal';
import { PretestModal } from '@/components/PretestModal';
import { BlurtingModal } from '@/components/BlurtingModal';
import { SegregationRemnoteModal } from '@/components/SegregationRemnoteModal';
import { AnkiExportModal } from '@/components/AnkiExportModal';
import { FlashcardForgeModal, type ForgeExportTarget } from '@/components/FlashcardForgeModal';
import { ComparativeSynthesisModal } from '@/components/ComparativeSynthesisModal';
import { generateOfflineWorkout } from '@/lib/services/offlineGenerator';
import { generateRemnoteHierarchy } from '@/lib/remnote';
import { ZenLaunchpad } from '@/components/ZenLaunchpad';
import { StudioIntro } from '@/components/StudioIntro';
import { TOY_EXAMPLES, activityForToyExample } from '@/lib/toy-models/examples';
import { toySessionId } from '@/lib/toy-models/progress';
import { StudioWorkbench } from '@/components/workbench/StudioWorkbench';
import { useAuth } from '@/lib/auth-context';
import { EndSessionReviewModal, EndSessionReviewData } from '@/components/EndSessionReviewModal';
import { AnalyticsDashboard } from '@/components/AnalyticsDashboard';
import { computeSuccessRate } from '@/lib/services/adaptiveDifficulty';
import { hashStringKey } from '@/lib/utils';
import {
  extractSanitizedCardsFromSchema,
  classifyDeckQuality,
  buildHierarchicalDeckName,
  generateAnkiApkgPackage,
} from '@/lib/anki-exporter';
import { computeSessionTelemetry, detectTabooTerms } from '@/lib/cognitive-telemetry';
import { useSession } from '@/hooks/useSession';
import { useGenerationProgress } from '@/hooks/useGenerationProgress'
import { requestEncodedSchema } from '@/lib/encode-stream'
import type { StageOutlineEntry } from '@/lib/stream-schema';
import { useSettings } from '@/hooks/useSettings';
import { useInputSource } from '@/hooks/useInputSource';
import { useSchemaLibrary } from '@/hooks/useSchemaLibrary';
import { CompletedSessionView } from '@/components/CompletedSessionView';
import { TeachMeModal } from '@/components/TeachMeModal';
import { useModalA11y } from '@/hooks/useModalA11y';
export default function DeepEncodeApp() {
  const { user, cloudStats, saveSchemaToCloud, deleteSchemaFromCloud, isSyncing, lastSyncedAt, lastSyncError, pendingLocalCount, backupSettingsToCloud } = useAuth();

  // ─── Extracted state hooks ─────────────────────────────────────────────────
  // Input sources & generation toggles (useInputSource)
  const {
    prefsLoaded,
    activeTab, setActiveTab,
    rawNotes, setRawNotes,
    uploadedFile, setUploadedFile,
    youtubeUrl, setYoutubeUrl,
    enableDeepResearch, setEnableDeepResearch,
    enableGuidedPath, setEnableGuidedPath,
    interleaveMode, setInterleaveMode,
    gear, setGear,
    strictnessLevel, setStrictnessLevel,
    wordCount,
  } = useInputSource();

  // AI settings, audio & connectivity (useSettings)
  const {
    aiSettings, setAiSettings,
    soundMuted, toggleSound,
  } = useSettings();

  // The whole session flow : schema, progress, stage inputs & gamification
  // (useSession: reducer-backed state hub)
  const {
    appState, setAppState,
    encodingMode, setEncodingMode,
    topicSummary, setTopicSummary,
    activities, setActivities,
    currentActivityIndex, setCurrentActivityIndex,
    userResponses, setUserResponses,
    isGuidedPathMode, setIsGuidedPathMode,
    guidedModules, setGuidedModules,
    currentModuleIndex, setCurrentModuleIndex,
    youtubeData, setYoutubeData,
    researchContexts, setResearchContexts,
    field1, setField1,
    field2, setField2,
    field3, setField3,
    selectedPreset,
    feynmanResult, setFeynmanResult,
    stageConfidence,
    stageReflection, setStageReflection,
    stageCheckCount, setStageCheckCount,
    stageErrorAnalysis, setStageErrorAnalysis,
    xp, setXp,
    combo, setCombo,
    currentActivity,
    matchedKeywords,
    semanticDepth,
    xpGainAnimation,
    addXP,
    loadStageInputs: applyStageInputs,
    resetSession,
    resumeSchema,
    resumeToEncoding,
    selectModule,
    feynmanPass,
    undoFields,
    redoFields,
    canUndo,
    canRedo,
  } = useSession();

  // Live elapsed timer + cycling phase message for the loading view.
  // (Hook is invoked after genStartedAt is declared below — see state block.)

  // Interrupted generation: localStorage flag left behind when a tab was
  // closed mid-encode. Lazily read on mount (no effect needed) and only
  // surface as "interrupted" if older than 10s.
  const [interruptedGen, setInterruptedGen] = useState<ReturnType<typeof loadGenerationInProgress>>(() => {
    if (typeof window === 'undefined') return null;
    const leftover = loadGenerationInProgress();
    return leftover && Date.now() - leftover.startedAt > 10_000 ? leftover : null;
  });

  // Persist encoding mode subtly (part of study prefs): loads once, saves on change.
  useEffect(() => {
    try {
      setEncodingMode(loadStudyPrefs().encodingMode);
    } catch { /* keep hook default */ }
    // Runs once on mount; setEncodingMode is a stable reducer setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveStudyPrefs({ encodingMode });
  }, [encodingMode]);

  // Saved schema history: localStorage + IndexedDB + cloud sync (useSchemaLibrary)
  const {
    savedSchemas,
    saveSchema: saveSchemaToLibrary,
    deleteSchema: deleteSchemaFromLibrary,
    clearAll: clearAllSchemaLibrary,
  } = useSchemaLibrary(saveSchemaToCloud, deleteSchemaFromCloud);

  // Modal & transient UI state (kept local to the shell)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  // Drill modals were removed : review lives in Anki/RemNote, not here.

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

  // Segregation & Export Engine State
  const [isSegregateModalOpen, setIsSegregateModalOpen] = useState(false);
  const [isSegregating, setIsSegregating] = useState(false);
  const [segregationReport, setSegregationReport] = useState<SegregationReport | null>(null);
  const [showExportChoice, setShowExportChoice] = useState(false);
  // Esc cancels the Anki/RemNote choice, the same as its own Cancel button.
  const exportChoiceRef = useModalA11y(showExportChoice, () => setShowExportChoice(false));
  // Pre-generation selections: choose the flashcard sections + export targets
  // BEFORE hitting generate, instead of generating everything and picking later.
  const [segregateOptions, setSegregateOptions] = useState({
    facts: true,
    mechanisms: true,
    drills: true,
    examples: true,
    mcq: true,
    anki: true,
    remnote: true,
  });

  // Anki Export & Webhook SM-2 Sync State
  const [isAnkiExportOpen, setIsAnkiExportOpen] = useState(false);

  // Flashcards-only Forge state. Forging a deck is not an encoding session, so
  // it shares nothing with the workout except the export surfaces it hands the
  // merged deck to.
  const [isForgeOpen, setIsForgeOpen] = useState(false);
  const [pendingForgeRemnote, setPendingForgeRemnote] = useState(false);

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

  // New Metacognition & Science States
  // No pre-session gate exists: nothing asks you to rate your confidence or
  // prove you are "ready" before the screen loads. The 1-5 rating is collected
  // inline right after stage 1 and only calibrates later stages.
  const [preSessionConfidence, setPreSessionConfidence] = useState<number>(3);
  const [difficultyRated, setDifficultyRated] = useState(false);
  const [isEndSessionReviewOpen, setIsEndSessionReviewOpen] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [endSessionReviewData, setEndSessionReviewData] = useState<EndSessionReviewData | null>(null);
  const [isLoadingEndSessionReview, setIsLoadingEndSessionReview] = useState(false);
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);

  // Friction-cut loop states: mastered auto-save pulse, stage skip, stage regen
  const [justMastered, setJustMastered] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Teach Me (Brilliant-style interactive lesson) state
  const [isTeachOpen, setIsTeachOpen] = useState(false);
  const [teachScope, setTeachScope] = useState<TeachScope>('notes');
  const [teachStageIndex, setTeachStageIndex] = useState(0);


  // Feynman Evaluator checking state
  const [isEvaluating, setIsEvaluating] = useState(false);

  // Generation progress tracking: start timestamp + abort controller so the
  // loading view can show live elapsed time and a Cancel button.
  const [genStartedAt, setGenStartedAt] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Live generation reporting: the streaming route tells us the topic title,
  // the pipeline phase it is actually in, and each stage outline as it lands.
  // These override the fallback phase ticker (see useGenerationProgress).
  const [streamTitle, setStreamTitle] = useState('');
  const [streamPhase, setStreamPhase] = useState('');
  const [streamOutlines, setStreamOutlines] = useState<StageOutlineEntry[]>([]);

  // Live elapsed timer, phase message and streamed outlines for the loading view.
  const { elapsed, phase, pct, outlines } = useGenerationProgress(genStartedAt, {
    phase: streamPhase,
    outlines: streamOutlines,
  });

  const field1Ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // Load stage inputs into the active editor. No gate, no confirmation step:
  // the stage is on screen the moment you arrive.
  const loadStageInputs = (activityIndex: number, acts: Activity[], responses: Record<string, StageResponse>) => {
    applyStageInputs(activityIndex, acts, responses);
  };

  // Parse Stateless Shared Schema from URL query on Mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const timer = setTimeout(() => {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        
        // Check for 1-Click Extension / Bookmarklet text input (?notes=... or ?text=... or ?source=...)
        const rawNotesParam = searchParams.get('notes') || searchParams.get('text') || searchParams.get('source');
        if (rawNotesParam) {
          const decoded = decodeURIComponent(rawNotesParam);
          setRawNotes(decoded);
          setActiveTab('text');
          sound.playSuccess();

          // Auto-launch forge if requested by extension
          if (searchParams.get('auto') === 'forge' || searchParams.get('forge') === 'true') {
            setIsForgeOpen(true);
          }
        }

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
      } catch (err: any) {
        console.error('Failed to parse share parameter on load:', err);
      }
    }, 0);

    return () => clearTimeout(timer);
    // All setters below are stable reducer/useState references; the effect
    // intentionally runs once on mount to parse the share URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Concept vs Fact Segregator (4-Quadrant + Export)
  const handleSegregateNotes = async () => {
    if (!rawNotes.trim() && !uploadedFile) return;
    setIsSegregating(true);
    setShowExportChoice(false);
    sound.playBeep(600, 'sine', 0.15);

    try {
      const include: string[] = [];
      if (segregateOptions.facts) include.push('facts');
      if (segregateOptions.mechanisms) include.push('mechanisms');
      if (segregateOptions.drills) include.push('drills');
      if (segregateOptions.examples) include.push('examples');

      const res = await fetch('/api/segregate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: rawNotes,
          file: uploadedFile,
          settings: aiSettings,
          include,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to segregate notes');
      }

      const data: SegregationReport = await res.json();
      setSegregationReport(data);
      sound.playSuccess();

      // Route to the pre-selected target(s) : skip the "which one?" popup when
      // only one export target was chosen beforehand.
      if (segregateOptions.anki && !segregateOptions.remnote) {
        setIsAnkiExportOpen(true);
      } else if (segregateOptions.remnote && !segregateOptions.anki) {
        setIsSegregateModalOpen(true);
      } else {
        setShowExportChoice(true);
      }
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'Segregation failed. Try again.');
    } finally {
      setIsSegregating(false);
    }
  };

  // Open Teach Me lesson helper. scope = 'notes' (from source), 'stage' (current
  // stage in the workbench), or 'schema' (re-teach a completed saved schema).
  const handleOpenTeach = (scope: TeachScope = 'notes', stageIndex: number = currentActivityIndex) => {
    setTeachScope(scope);
    setTeachStageIndex(stageIndex);
    setIsTeachOpen(true);
    sound.playBeep(640, 'sine', 0.1);
  };

  // The Forge finished a deck and the learner chose where it goes. Nothing in
  // the encoding session is touched: the merged report goes straight to the
  // export surface. "Both" opens Anki first and stacks RemNote behind it once
  // the Anki modal is closed, so two export modals are never on screen at once.
  const handleForgeDeckReady = (report: SegregationReport, target: ForgeExportTarget) => {
    setSegregationReport(report);
    if (target === 'remnote') {
      setIsSegregateModalOpen(true);
      return;
    }
    setIsAnkiExportOpen(true);
    setPendingForgeRemnote(target === 'both');
  };

  // End of a Teach Me lesson: "start encoding". The lesson never encodes on its
  // own — it finishes, and this is the handoff. Where it lands depends on what
  // the lesson was taught from: a notes lesson runs the encode pipeline from
  // those notes, a stage lesson drops the learner back into the workbench stage
  // they are already in (and focuses the mechanism field), and a schema lesson
  // is already encoded, so the readout they came from is the destination.
  const handleTeachStartEncoding = () => {
    sound.playSuccess();
    if (appState === 'input') {
      void handleGenerate();
    } else if (appState === 'encoding') {
      setTimeout(() => field1Ref.current?.focus(), 60);
    }
  };

  // Open Stateless Share Modal helper
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
    if (displayXp >= 1000) return { title: 'Master Neural Architect', level: 5, color: 'text-amber border-amber/60' };
    if (displayXp >= 750) return { title: 'Cognitive Synthesizer', level: 4, color: 'text-amber border-amber/40' };
    if (displayXp >= 500) return { title: 'Schema Engineer', level: 3, color: 'text-bone border-edge' };
    if (displayXp >= 250) return { title: 'Active Encoder', level: 2, color: 'text-bone border-edge' };
    return { title: 'Passive Reader', level: 1, color: 'text-solder border-edge' };
  }, [xp, cloudStats]);


  useEffect(() => {
    if (appState === 'encoding') {
      field1Ref.current?.focus();
    }
  }, [appState, currentActivityIndex]);

  // Cancel an in-flight generation : aborts the fetch and returns to input.
  const handleCancelGeneration = () => {
    abortRef.current?.abort();
    clearGenerationInProgress();
    setGenStartedAt(null);
    abortRef.current = null;
    setAppState('input');
    sound.playBeep(220, 'square', 0.08);
  };

  // (Global keyboard shortcuts live below, after handleNextActivity /
  // handlePreviousActivity / handleInitiateGenerate are declared.)

  // Initiate Generation (no pre-session gate : friction cut. The 1-5 difficulty
  // rating is collected inline after stage 1 instead of blocking startup.)
  const handleInitiateGenerate = () => {
    if (activeTab === 'youtube') {
      if (!youtubeUrl.trim()) return;
      handleGenerate();
      return;
    }
    if (!rawNotes.trim() && !uploadedFile) return;
    handleGenerate();
  };

  // The window listener is long-lived, but its launch action must read the
  // latest source, notes, gear and settings instead of the initial render.
  const initiateGenerateRef = useRef(handleInitiateGenerate);
  useEffect(() => {
    initiateGenerateRef.current = handleInitiateGenerate;
  });

  // Main Generation Handler (Text / File / YouTube)
  async function handleGenerate(confirmedConfidence?: number) {
    const userConfidenceVal = confirmedConfidence || preSessionConfidence;

    if (activeTab === 'youtube') {
      if (!youtubeUrl.trim()) return;

      setAppState('loading');
      sound.playBeep(440, 'sine', 0.15);
      incrementModelCall(aiSettings.geminiModel || 'gemini-3.7-flash');
      setGenStartedAt(Date.now());
      abortRef.current = new AbortController();
      saveGenerationInProgress({ startedAt: Date.now(), sourceLabel: 'YouTube lecture', sourceType: 'youtube' });

      try {
        const response = await fetch('/api/youtube', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortRef.current.signal,
          body: JSON.stringify({
            videoUrl: youtubeUrl.trim(),
            mode: encodingMode,
            settings: aiSettings,
            hiddenTemplates: loadStudyPrefs().hiddenTemplates,
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

          // Seed the library entry for this video now (deterministic id), so
          // partial progress autosaves land as updates instead of vanishing.
          const videoKey = data.youtubeData?.videoId || youtubeUrl.trim();
          if (videoKey) {
            await saveSchemaToLibrary({
              id: `yt_${hashStringKey(String(videoKey))}`,
              timestamp: Date.now(),
              topicSummary: data.topicSummary || data.videoTitle || 'YouTube Cognitive Schema',
              mode: encodingMode,
              xpEarned: 0,
              activities: data.activities,
              userResponses: {},
              youtubeData: data.youtubeData || undefined,
              researchContexts: data.researchContexts?.length > 0 ? data.researchContexts : undefined,
            });
          }
        } else {
          throw new Error('Invalid YouTube schema response format');
        }
      } catch (error: any) {
        console.error(error);
        if (error?.name === 'AbortError') {
          setAppState('input');
          return;
        }
        alert(error?.message || 'Failed to process YouTube video. Please ensure the URL is valid.');
        setAppState('input');
      } finally {
        clearGenerationInProgress();
        setGenStartedAt(null);
        abortRef.current = null;
      }
      return;
    }

    // Standard Notes or File Upload
    if (!rawNotes.trim() && !uploadedFile) return;

    setAppState('loading');
    sound.playBeep(440, 'sine', 0.15);
    incrementModelCall(aiSettings.geminiModel || 'gemini-3.7-flash');

    setGenStartedAt(Date.now());
    setStreamTitle('');
    setStreamPhase('');
    setStreamOutlines([]);
    abortRef.current = new AbortController();
    saveGenerationInProgress({
      startedAt: Date.now(),
      sourceLabel: uploadedFile ? uploadedFile.name : `${rawNotes.slice(0, 60)}${rawNotes.length > 60 ? '…' : ''}`,
      sourceType: uploadedFile ? 'file' : 'notes',
    });

    // If device is offline, immediately use deterministic client-side cognitive generator
    // (honors the learner's hidden templates so offline feels identical to online).
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      try {
        const offlineData = generateOfflineWorkout(rawNotes, encodingMode, loadStudyPrefs().hiddenTemplates);
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
      // Streamed: the outline (and the topic title) arrive while the full schema
      // is still being written, so the loading view reports the real stages
      // instead of cycling a timer. A server or proxy that answers with plain
      // JSON is read as JSON by the same helper.
      const data = await requestEncodedSchema({
        signal: abortRef.current?.signal,
        handlers: {
          onTitle: setStreamTitle,
          onPhase: setStreamPhase,
          onOutline: (next) => setStreamOutlines(next),
        },
        body: {
          notes: rawNotes,
          mode: encodingMode,
          settings: aiSettings,
          file: uploadedFile,
          enableDeepResearch,
          enableGuidedPath: enableGuidedPath || wordCount > 900,
          userConfidence: userConfidenceVal,
          successRate: sRate,
          interleaveMode,
          gear,
          hiddenTemplates: loadStudyPrefs().hiddenTemplates
        },
      });

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
      // User cancelled : abort the fetch silently and return to input.
      if (error?.name === 'AbortError') {
        setAppState('input');
        return;
      }
      console.warn('Network or API generation failed, falling back to local offline cognitive generator...', error);
      try {
        const offlineData = generateOfflineWorkout(rawNotes, encodingMode, loadStudyPrefs().hiddenTemplates);
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
    } finally {
      clearGenerationInProgress();
      setGenStartedAt(null);
      setStreamPhase('');
      abortRef.current = null;
    }
  }

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
    feynmanPass(modIdx, score, feedback);
  };

  // Switch active module in Guided Path
  const handleSelectModule = (index: number) => {
    selectModule(index);
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
          strictnessLevel,
          // Taboo terms shown in the workbench for this stage: the examiner
          // enforces the same ban, so the feedback can't contradict the chips.
          tabooTerms: detectTabooTerms(
            rawNotes.trim() || currentActivity.contextSnippet,
            currentActivity.keywords || [],
            5
          ),
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

      const secured = evalData.secured;

      // "What's hard for me": log the stages whose mechanism is still open so
      // weak areas surface later (landing the mechanism clears the topic).
      try {
        recordTopicResult({
          topic: currentActivity.title || topicSummary || 'Untitled stage',
          templateType: currentActivity.templateType,
          lastSecured: secured,
          checkCount: nextCount,
        });
      } catch { /* struggle ledger is best-effort */ }

      // Update response record. On mastery, auto-save the full response
      // (fields + confidence + reflection) so "Next" is a single keypress.
      setUserResponses(prev => ({
        ...prev,
        [currentActivity.id]: {
          ...(prev[currentActivity.id] || { field1, field2 }),
          ...(secured ? { field1, field2, field3, selectedPreset } : {}),
          confidenceScore: stageConfidence,
          reflection: stageReflection,
          checkCount: nextCount,
          errorAnalysis: evalData.errorAnalysis || undefined,
          feynmanReview: evalData,
        }
      }));

      if (secured) {
        // Auto-advance cue: pulse the Next button (Atomic Habits : make the
        // next action obvious + immediately satisfying).
        setJustMastered(true);
        setTimeout(() => setJustMastered(false), 2200);
      } else {
        setJustMastered(false);
      }

      // XP is a habit mechanic, not a verdict: it is derived here so the
      // examiner never has to hand out a number.
      addXP(secured ? 60 : 25);
      if (secured) sound.playSuccess();
    } catch (e: any) {
      console.error('Evaluation error', e);
      alert(e?.message || 'Feynman evaluator unavailable. Please check settings.');
    } finally {
      setIsEvaluating(false);
    }
  };

  // In-progress autosave for YouTube sessions (kept alive across reloads) : progress lands in the library
  // under the deterministic per-video id after every stage, so "encode 2 of 9
  // chapters today" survives a reload and resumes like any text schema.
  useEffect(() => {
    const ytSessionId = youtubeData?.videoId ? `yt_${hashStringKey(youtubeData.videoId)}` : null;
    if (appState !== 'encoding' || !ytSessionId || !youtubeData) return;
    if (Object.keys(userResponses).length === 0) return;
    void saveSchemaToLibrary({
      id: ytSessionId,
      timestamp: Date.now(),
      topicSummary: topicSummary || 'YouTube Cognitive Schema',
      mode: encodingMode,
      xpEarned: xp,
      activities,
      userResponses,
      youtubeData,
      researchContexts: researchContexts.length > 0 ? researchContexts : undefined,
    });
    // saveSchemaToLibrary identity is stable via useCallback in the hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState, youtubeData, currentActivityIndex, userResponses]);

  const saveLabCheckpointRef = useRef(saveSchemaToLibrary);
  useEffect(() => { saveLabCheckpointRef.current = saveSchemaToLibrary; }, [saveSchemaToLibrary]);

  // Lab sessions persist the actual config and responses, not only a local
  // slider cache, so the existing Library/Firestore path can resume them.
  useEffect(() => {
    const id = toySessionId(activities, topicSummary);
    if (appState !== 'encoding' || !id || youtubeData || isGuidedPathMode) return;
    if (!Object.values(userResponses).some((response) => response.toyModelProgress)) return;
    const timer = setTimeout(() => {
      void saveLabCheckpointRef.current({ id, timestamp: Date.now(), topicSummary, mode: encodingMode, xpEarned: xp, activities, userResponses, sourceFileName: uploadedFile?.name, researchContexts });
    }, 500);
    return () => clearTimeout(timer);
  }, [activities, appState, encodingMode, isGuidedPathMode, researchContexts, topicSummary, uploadedFile?.name, userResponses, xp, youtubeData]);

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
      // Offline / failed batch call: say the same kind of thing the examiner
      // would, minus the read. No fallback percentage is invented.
      const fallbackStages = acts.map(a => {
        const review = resps[a.id]?.feynmanReview;
        return {
          stageTitle: a.title,
          secured: review?.secured === true,
          counterProbe: review?.counterProbe || '',
          feedback: review?.feedback || '',
        };
      });
      const landed = fallbackStages.filter(s => s.secured).length;
      setEndSessionReviewData({
        analysis: `${landed} of ${fallbackStages.length} stage${fallbackStages.length === 1 ? '' : 's'} landed. The rest still have a link open.`,
        perStageGrades: fallbackStages,
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
        ...userResponses[currentActivity.id],
        field1,
        field2,
        field3,
        selectedPreset,
        feynmanReview: feynmanResult || undefined,
        confidenceScore: stageConfidence,
        reflection: stageReflection,
        checkCount: stageCheckCount,
        errorAnalysis: stageErrorAnalysis || undefined,
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
          id: toySessionId(activities, topicSummary) || `schema_${Date.now()}`,
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

        await saveSchemaToLibrary(newSavedSchema);

        // Auto-trigger End Session Review Modal
        handleEndSessionReview(updatedResponses, activities);
      }
    }
  };

  // "Skip for now" : habit survival valve. Marks the stage skipped (exported
  // tagged DeepEncode::Unfinished) and moves on WITHOUT XP or field guards.
  const handleSkipStage = async () => {
    if (!currentActivity) return;
    setJustMastered(false);

    const updatedResponses: Record<string, StageResponse> = {
      ...userResponses,
      [currentActivity.id]: {
        ...userResponses[currentActivity.id],
        field1: '',
        field2: '',
        field3: '',
        selectedPreset: '',
        skipped: true,
      }
    };
    setUserResponses(updatedResponses);
    sound.playBeep(350, 'sine', 0.15);

    if (currentActivityIndex < activities.length - 1) {
      const nextIdx = currentActivityIndex + 1;
      setCurrentActivityIndex(nextIdx);
      loadStageInputs(nextIdx, activities, updatedResponses);
    } else if (isGuidedPathMode && currentModuleIndex < guidedModules.length - 1) {
      sound.playSuccess();
    } else {
      sound.playLevelUp();
      setAppState('completed');
      const newSavedSchema: SavedSchema = {
        id: toySessionId(activities, topicSummary) || `schema_${Date.now()}`,
        timestamp: Date.now(),
        topicSummary: topicSummary || 'Synthesized Schema',
        mode: encodingMode,
        xpEarned: xp,
        activities,
        userResponses: updatedResponses,
        sourceFileName: uploadedFile?.name,
        isGuidedPath: isGuidedPathMode,
        guidedModules: isGuidedPathMode ? guidedModules : undefined,
        youtubeData: youtubeData || undefined,
        researchContexts: researchContexts.length > 0 ? researchContexts : undefined
      };
      await saveSchemaToLibrary(newSavedSchema);
    }
  };

  // Regenerate the current stage with the lightweight checker model
  // (gemini-3.5-flash-lite by default) : for stages that don't fit the learner.
  const handleRegenerateStage = async (reason?: string) => {
    if (!currentActivity || isRegenerating) return;
    setIsRegenerating(true);
    sound.playBeep(520, 'sine', 0.12);
    incrementModelCall(aiSettings.geminiCheckerModel || 'gemini-3.5-flash-lite');

    try {
      const response = await fetch('/api/regenerate-stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity: currentActivity,
          topicSummary,
          mode: encodingMode,
          reason: reason || undefined,
          settings: aiSettings,
        }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Stage regeneration failed');
      }
      const data = await response.json();
      const newAct: Activity = { ...data.activity, stageNumber: currentActivity.stageNumber };
      const newActs = [...activities];
      newActs[currentActivityIndex] = newAct;
      const newResponses = { ...userResponses };
      delete newResponses[currentActivity.id];
      setFeynmanResult(null);
      setStageCheckCount(0);
      setStageErrorAnalysis(null);
      setJustMastered(false);
      setActivities(newActs);
      setUserResponses(newResponses);
      applyStageInputs(currentActivityIndex, newActs, newResponses);
      sound.playSuccess();
    } catch (err: any) {
      console.error('Stage regeneration error', err);
      alert(err?.message || 'Could not regenerate this stage. Check your settings.');
    } finally {
      setIsRegenerating(false);
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

  // ─── Global keyboard shortcuts ─────────────────────────────────────────────
  // Escape closes the top-most open modal. Alt/Cmd+Arrow navigates stages.
  // Ctrl/Cmd+Enter from the input view launches generation.
  // (Declared after the handlers above so the effect never reads them early.)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 1) Escape closes open modals (top-most first, roughly by z-order).
      if (e.key === 'Escape') {
        if (isTeachOpen) { setIsTeachOpen(false); return; }
        if (isShareModalOpen) { setIsShareModalOpen(false); return; }
        if (isAuthOpen) { setIsAuthOpen(false); return; }
        if (isSettingsOpen) { setIsSettingsOpen(false); return; }
        if (isHistoryOpen) { setIsHistoryOpen(false); return; }
        if (isAnalyticsOpen) { setIsAnalyticsOpen(false); return; }
        if (isPrereqModalOpen) { setIsPrereqModalOpen(false); return; }
        if (isPretestModalOpen) { setIsPretestModalOpen(false); return; }
        if (isBlurtingModalOpen) { setIsBlurtingModalOpen(false); return; }
        if (isSegregateModalOpen) { setIsSegregateModalOpen(false); return; }
        if (isAnkiExportOpen) { setIsAnkiExportOpen(false); return; }
        if (isRoastModalOpen) { setIsRoastModalOpen(false); return; }
        if (isComparativeModalOpen) { setIsComparativeModalOpen(false); return; }
        if (isEndSessionReviewOpen) { setIsEndSessionReviewOpen(false); return; }
        return;
      }

      // 2) Stage navigation (workbench only).
      if ((e.altKey || e.metaKey) && appState === 'encoding' && !isEvaluating) {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          handleNextActivity();
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handlePreviousActivity();
          return;
        }
      }

      // 3) Ctrl/Cmd+Enter from the input view launches generation.
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && appState === 'input') {
        const anyModalOpen =
          isTeachOpen || isShareModalOpen ||
          isAuthOpen || isSettingsOpen ||
          isHistoryOpen || isAnalyticsOpen || isPrereqModalOpen || isPretestModalOpen ||
          isBlurtingModalOpen || isSegregateModalOpen || isAnkiExportOpen || isRoastModalOpen ||
          isComparativeModalOpen || isEndSessionReviewOpen;
        if (anyModalOpen) return;
        e.preventDefault();
        initiateGenerateRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    appState, isEvaluating,
    isTeachOpen, isShareModalOpen,
    isAuthOpen, isSettingsOpen,
    isHistoryOpen, isAnalyticsOpen, isPrereqModalOpen, isPretestModalOpen,
    isBlurtingModalOpen, isSegregateModalOpen, isAnkiExportOpen, isRoastModalOpen,
    isComparativeModalOpen, isEndSessionReviewOpen,
  ]);

  const resetApp = () => {
    resetSession();
    setRawNotes('');
    setUploadedFile(null);
    setYoutubeUrl('');
  };

  const handleResumeSchema = (saved: SavedSchema) => {
    resumeSchema(saved);
    sound.playSuccess();
  };

  // The completed view uses a continue button when the schema has unfinished
  // or low-scoring stages. Compute that here so both the completed view and
  // the resume path can reference the current schema.
  const currentSavedSchema = useMemo<SavedSchema | null>(() => {
    if (appState !== 'completed' && appState !== 'input') return null;
    if (!activities.length) return null;
    return {
      // Transient handle for the in-progress schema (never persisted here),
      // so stable values keep the memo pure and React keys stable.
      id: 'schema_current',
      timestamp: 0,
      topicSummary: topicSummary || 'Synthesized Schema',
      mode: encodingMode,
      xpEarned: xp,
      activities,
      userResponses,
      isGuidedPath: isGuidedPathMode,
      guidedModules: isGuidedPathMode ? guidedModules : undefined,
      youtubeData: youtubeData || undefined,
      researchContexts: researchContexts.length > 0 ? researchContexts : undefined,
    };
  }, [appState, activities, topicSummary, encodingMode, xp, userResponses, isGuidedPathMode, guidedModules, youtubeData, researchContexts]);

  const hasIncompleteStages = useMemo(() => {
    if (!currentSavedSchema) return false;
    const acts = currentSavedSchema.activities || [];
    const responses = currentSavedSchema.userResponses || {};
    return acts.some(a => {
      const r = responses[a.id];
      if (!r || r.skipped) return true;
      if (!r.field1?.trim() && !r.field2?.trim()) return true;
      const review = r.feynmanReview;
      if (!review) return true;
      return review.secured !== true;
    });
  }, [currentSavedSchema]);

  // Resume an incomplete schema back into the encoding workbench at its first
  // unfinished stage. Used by both the input-screen shortcut and the completed
  // view's "continue where you left off" button.
  const handleContinueToEncoding = useCallback((saved: SavedSchema) => {
    resumeToEncoding(saved);
    setAppState('encoding');
    sound.playSuccess();
  }, [resumeToEncoding, setAppState]);

  const handleContinueToEncodingWrapper = useCallback(() => {
    if (currentSavedSchema) handleContinueToEncoding(currentSavedSchema);
  }, [currentSavedSchema, handleContinueToEncoding]);

  const handleDeleteSchema = async (id: string) => {
    await deleteSchemaFromLibrary(id);
  };

  const handleClearAllHistory = () => {
    clearAllSchemaLibrary();
  };

  // ─── Identity trophy: handoff quality (NOT XP) ────────────────────────────
  // "I convert messy notes to clean cards." The reward is the clean handoff:
  // N FSRS-ready cards, X leech candidates, Y unfinished, Z boundary traps.
  // The deck the learner actually ships is the Wozniak-enforced deck, so the
  // counts here match the .apkg — cards over the 20-word ceiling are reported
  // separately instead of vanishing into a bigger number.
  const handoffDeck = useMemo(
    () =>
      extractSanitizedCardsFromSchema(
        { topicSummary, activities, userResponses },
        null,
        // Interference-trap cards from the prediction gate ship at the front:
        // confident-and-wrong is the memory that needs the most rehearsal.
        { includeInterferenceTraps: true }
      ),
    [activities, userResponses, topicSummary]
  );
  const handoffCards = handoffDeck.cards;
  // ─── Cognitive telemetry: measurable encoding quality, not points ────────
  // Travels on the handoff report so the completion trophy can show real
  // numbers (compression, atomicity, jargon deflation) instead of XP.
  const telemetry = useMemo(
    () => computeSessionTelemetry({ rawNotes, activities, userResponses, cards: handoffCards }),
    [rawNotes, activities, userResponses, handoffCards]
  );
  const handoffStats = useMemo(
    () => ({
      ...classifyDeckQuality(handoffCards),
      telemetry,
      heldBackCount: handoffDeck.heldBack.length,
    }),
    [handoffCards, telemetry, handoffDeck]
  );

  // One-click FSRS-ready .apkg download (real collection.anki2, no import maze)
  const handleDownloadApkg = async () => {
    if (handoffCards.length === 0) return;
    const deckName = buildHierarchicalDeckName(topicSummary);
    sound.playBeep(660, 'sine', 0.12);
    const blob = await generateAnkiApkgPackage(handoffCards, deckName);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deckName.replace(/::/g, '_')}.apkg`;
    a.click();
    URL.revokeObjectURL(url);
    sound.playSuccess();
  };

  // Copy formats for RemNote / Anki / Markdown
  const copyToClipboard = (format: 'remnote' | 'anki' | 'markdown') => {
    let content = '';

    if (format === 'remnote') {
      // One renderer for every RemNote surface: this inline builder used `::`
      // on every line, which turned each labelled descriptor into a reverse
      // card RemNote could only ask back as "given 'S4 swings outward', name
      // the label". RemNote export logic belongs in lib/remnote.ts.
      content = generateRemnoteHierarchy({ topicSummary, activities, userResponses }).markdown;
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
    <main className="studio-shell min-h-screen min-h-dvh text-bone flex flex-col items-center px-4 sm:px-6 relative overflow-x-hidden selection:bg-amber-500/25 selection:text-bone font-sans mobile-safe-bottom">

      <div className="w-full max-w-6xl relative z-10 flex-1 flex flex-col">

        {/* The masthead keeps every existing workspace action within reach. */}
        <header className="studio-masthead animate-dawn">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
            <div className="studio-brand">
              <svg viewBox="0 0 40 44" fill="none" aria-hidden="true">
                <path d="M20 2L37 12V32L20 42L3 32V12L20 2Z" stroke="currentColor" />
                <path d="M20 10L30 16V28L20 34L10 28V16L20 10ZM20 10V22M10 16L20 22L30 16M20 22V34" stroke="currentColor" />
              </svg>
              <div>
                <h1>DeepEncode<span aria-hidden="true">✳</span></h1>
                <p>COGNITIVE SCIENCE / HUMAN UNDERSTANDING</p>
              </div>
            </div>

          <nav className="studio-nav flex flex-wrap items-center justify-end gap-1 max-w-full" aria-label="Workspace">
            {/* Offline & Install Indicator */}
            <PWAInstallHeader />

            {/* Multi-Doc Comparative Synthesis Button */}
            <button
              type="button"
              onClick={() => setIsComparativeModalOpen(true)}
              className="shrink-0 min-h-[36px] flex items-center rounded-full px-3 text-[11px] tracking-wide text-slate-ink hover:text-bone hover:bg-white/[0.05] transition-colors duration-150 cursor-pointer whitespace-nowrap"
              title="Compare two documents (e.g. Lecture Slides vs Textbook Chapter)"
            >
              Compare 2 docs
            </button>

            {/* Anki & SM-2 Exporter Button */}
            <button
              type="button"
              onClick={() => setIsAnkiExportOpen(true)}
              className="shrink-0 min-h-[36px] flex items-center rounded-full px-3 text-[11px] tracking-wide text-slate-ink hover:text-bone hover:bg-white/[0.05] transition-colors duration-150 cursor-pointer whitespace-nowrap"
              title="Export .apkg Anki package or sync via SM-2 Webhooks"
            >
              Anki / SM-2
            </button>

            {/* Stateless Share Button in Top Bar (when active or completed) */}
            {appState !== 'input' && (
              <button
                type="button"
                onClick={() => handleOpenStatelessShare()}
                className="shrink-0 min-h-[36px] flex items-center rounded-full px-3 text-[11px] tracking-wide text-slate-ink hover:text-bone hover:bg-white/[0.05] transition-colors duration-150 cursor-pointer whitespace-nowrap"
                title="Share Stateless URL (Free & Zero DB Required)"
              >
                Share
              </button>
            )}

            {/* Cloud Sync / Account Button : honest live status */}
            {(() => {
              const pendingNote = pendingLocalCount > 0 ? ` : ${pendingLocalCount} local` : '';
              let status = 'OFF';
              let dot = 'bg-solder';
              let title = 'Sign in to sync schemas across devices (Firestore)';
              if (user) {
                if (isSyncing) {
                  status = 'SYNCING';
                  dot = 'bg-amber-500';
                  title = 'Syncing your schemas to the cloud...';
                } else if (lastSyncError) {
                  status = 'ERROR';
                  dot = 'bg-hazard-500';
                  title = `Last cloud sync failed: ${lastSyncError}. Click to retry from Cloud Sync & Account.`;
                } else {
                  status = 'SYNCED';
                  dot = 'bg-signal-500';
                  const when = lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : 'just now';
                  title = `Signed in as ${user.displayName || user.email || 'User'}${pendingNote} : last synced ${when}.`;
                }
              } else if (pendingLocalCount > 0) {
                title = `${pendingLocalCount} schema${pendingLocalCount === 1 ? '' : 's'} saved locally only : sign in to back them up.`;
              }
              return (
                <button
                  onClick={() => setIsAuthOpen(true)}
                  className="shrink-0 min-h-[36px] flex items-center gap-2 rounded-full border border-edge/70 px-3 text-[11px] tracking-wide text-slate-ink hover:text-bone hover:border-gilt/40 transition-colors duration-150 cursor-pointer whitespace-nowrap"
                  title={title}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
                  Cloud: {status}
                </button>
              );
            })()}

            {/* Metacognitive Performance Review Button (when completed) */}
            {appState === 'completed' && (
              <button
                type="button"
                onClick={() => handleEndSessionReview()}
                className="min-h-[36px] flex items-center rounded-full bg-gradient-to-b from-amber-400 to-amber-600 px-3.5 text-[11px] font-semibold tracking-wide text-inset shadow-gilt hover:from-amber-300 hover:to-amber-500 transition-colors duration-150 cursor-pointer whitespace-nowrap"
                title="View Metacognitive Performance Review"
              >
                Session review
              </button>
            )}

            {/* Analytics Dashboard Button */}
            <button
              type="button"
              onClick={() => setIsAnalyticsOpen(true)}
              className="shrink-0 min-h-[36px] flex items-center rounded-full px-3 text-[11px] tracking-wide text-slate-ink hover:text-bone hover:bg-white/[0.05] transition-colors duration-150 cursor-pointer whitespace-nowrap"
              title="Metacognitive Analytics & Model Quota Dashboard"
            >
              Analytics
            </button>

            {/* Saved Schemas History Button */}
            <button
              onClick={() => setIsHistoryOpen(true)}
              className="min-h-[36px] flex items-center rounded-full px-3 text-[11px] tracking-wide text-slate-ink hover:text-bone hover:bg-white/[0.05] transition-colors duration-150 cursor-pointer whitespace-nowrap relative"
              title="View Saved Schemas History"
            >
              Library{savedSchemas.length > 0 ? ` · ${savedSchemas.length}` : ''}
            </button>

            {/* AI Settings / Multi-Key Button */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="min-h-[36px] flex items-center rounded-full px-3 text-[11px] tracking-wide text-slate-ink hover:text-bone hover:bg-white/[0.05] transition-colors duration-150 cursor-pointer whitespace-nowrap"
              title="Configure Models (Gemini 3.7 Flash & 3.5 Flash-Lite)"
            >
              Settings
            </button>

            {/* Audio Toggle */}
            <button
              onClick={toggleSound}
              className="min-h-[36px] flex items-center rounded-full px-3 text-[11px] tracking-wide text-slate-ink hover:text-bone hover:bg-white/[0.05] transition-colors duration-150 cursor-pointer whitespace-nowrap"
              title={soundMuted ? 'Unmute audio effects' : 'Mute audio effects'}
              aria-label={soundMuted ? 'Unmute audio effects' : 'Mute audio effects'}
            >
              {soundMuted ? 'Sound off' : 'Sound on'}
            </button>
          </nav>
          </div>

          {/* Session rail : the live numbers as a quiet line of type beneath the
              masthead. Progress is data, so it keeps the mono voice and the gold,
              but it lives in the page's type instead of a bordered strip. */}
          {appState !== 'input' && (
            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="label-caps">Progress</span>
              <span className="relative font-mono text-sm font-semibold text-amber-300">
                {String(xp).padStart(4, '0')}
                <AnimatePresence>
                  {xpGainAnimation && (
                    <motion.span
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: -22 }}
                      exit={{ opacity: 0 }}
                      className="absolute left-0 top-0 font-mono text-[11px] font-semibold text-amber-300"
                    >
                      +{xpGainAnimation}
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
              <span className="h-1 w-1 rotate-45 bg-edge" aria-hidden />
              <span className="text-[11px] text-slate-ink">{userRank.title}</span>
            </div>
          )}
        </header>

        {/* Imported Stateless Link Notification Banner */}
        {importedShareBanner && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 p-4 bg-deck border border-gilt/30 rounded-2xl shadow-panel flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
          >
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 bg-amber-500/10 border border-gilt/35 text-amber-200 text-[10px] font-mono uppercase tracking-[0.18em] rounded-full shrink-0">
                Shared link
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-bone text-sm">Classmate Shared Schema Loaded</span>
                </div>
                <p className="text-solder text-xs mt-0.5">
                  Loaded <span className="text-amber-300 font-medium">&ldquo;{importedShareBanner}&rdquo;</span>. Zero database login needed.
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
                  saveSchemaToLibrary(current);
                  sound.playSuccess();
                  setImportedShareBanner(null);
                }}
                className="px-4 py-2 rounded-full bg-gradient-to-b from-amber-400 to-amber-600 text-inset font-mono font-semibold text-[10px] uppercase tracking-[0.16em] shadow-gilt cursor-pointer"
              >
                [ SAVE TO HISTORY ]
              </button>
              <button
                type="button"
                onClick={() => setImportedShareBanner(null)}
                className="px-3.5 py-2 rounded-full text-solder hover:text-bone border border-edge/70 hover:border-gilt/40 font-mono text-[10px] uppercase tracking-[0.16em] cursor-pointer"
              >
                [ X ]
              </button>
            </div>
          </motion.div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* STATE 1: ZEN LAUNCHPAD (COMMAND CENTER)                      */}
        {/* ------------------------------------------------------------- */}
        {appState === 'input' && (
          <motion.div
            key="input"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full flex flex-col gap-4 sm:gap-5"
          >
            <StudioIntro />

            {/* Interrupted generation notice: the tab was closed mid-encode. */}
            {interruptedGen && (
              <div
                className="flex items-center justify-between gap-4 bg-hazard-950/25 border border-hazard-500/35 px-4 py-3.5 rounded-2xl"
                data-testid="interrupted-gen-banner"
                role="status"
              >
                <p className="text-[11px] font-mono text-bone">
                  <span className="text-hazard-400 font-bold uppercase">[ INTERRUPTED ]</span>{' '}
                  Your last generation ({interruptedGen.sourceLabel || 'untitled source'}) was cut off before it
                  finished. Nothing was lost &mdash; just hit generate again.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    clearGenerationInProgress();
                    setInterruptedGen(null);
                  }}
                  className="min-h-[36px] px-3.5 rounded-full text-[10px] font-mono uppercase tracking-[0.16em] text-solder hover:text-bone border border-edge/70 hover:border-gilt/40 cursor-pointer"
                  title="Dismiss"
                >
                  [ DISMISS ]
                </button>
              </div>
            )}

            {/* Your hard topics: weak areas from past sessions surface here so you
                can re-drill them before they cost you on a test. */}
            {(() => {
              const struggles = typeof window !== 'undefined' ? loadTopicStruggles() : [];
              if (struggles.length === 0) return null;
              return (
                <div className="w-full p-4 bg-deck border border-hazard-500/35 rounded-2xl">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-hazard block mb-1">
                    [ ▼ STILL TRICKY FOR YOU ]
                  </span>
                  <p className="text-[11px] text-solder font-mono mb-2">
                    These mechanisms never landed. Paste them back in or drill them again.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {struggles.slice(0, 6).map(s => (
                      <span
                        key={`${s.topic}-${s.updatedAt}`}
                        title={`Mechanism still open after ${s.checkCount} check${s.checkCount === 1 ? '' : 's'}`}
                        className="text-[11px] font-mono px-2.5 py-1 bg-chassis border border-hazard-500/40 text-bone rounded-full"
                      >
                        {s.topic} · still open
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Resume where you left off: if the most recent saved schema has any
                unanswered or skipped stages, offer a one-tap return above the
                launchpad so you don't have to open the history drawer. */}
            {(() => {
              if (appState !== 'input') return null;
              const lastSchema = savedSchemas.find(s => s && s.activities && s.activities.length > 0);
              if (!lastSchema) return null;
              const acts = lastSchema.activities || [];
              const firstUnfinishedIdx = acts.findIndex((a) => {
                const r = lastSchema.userResponses?.[a.id];
                return !r || (!r.field1?.trim() && !r.field2?.trim()) || r.skipped;
              });
              if (firstUnfinishedIdx === -1) return null;
              const done = firstUnfinishedIdx;
              const isLast = done >= acts.length - 1;
              return (
                <div className="w-full flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-amber-500/[0.05] border border-gilt/30 rounded-2xl shadow-panel">
                  <div className="min-w-0">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber block mb-0.5">
                      [ ▶ RESUME WHERE YOU LEFT OFF ]
                    </span>
                    <p className="text-sm font-bold text-bone leading-snug">
                      You left off mid-way through <em>{lastSchema.topicSummary}</em>
                      {isLast ? ', on the final stage' : `, stage ${done + 1} of ${acts.length}`}.
                    </p>
                    <p className="text-[11px] text-solder font-mono mt-0.5">
                      {isLast
                        ? 'You finished everything except the last stage.'
                        : `You completed ${done} of ${acts.length} stages.`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleContinueToEncoding(lastSchema)}
                      className="px-5 py-2 rounded-full bg-gradient-to-b from-amber-400 to-amber-600 text-inset text-[11px] font-mono font-semibold uppercase tracking-[0.16em] shadow-gilt hover:from-amber-300 hover:to-amber-500 cursor-pointer"
                    >
                      Resume here
                    </button>
                    <button
                      type="button"
                      className="px-4 py-2 rounded-full bg-chassis border border-edge/70 text-solder text-[11px] font-mono uppercase tracking-[0.16em] hover:text-bone hover:border-gilt/40 cursor-pointer"
                      title="Start a fresh topic instead"
                    >
                      Start fresh
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Unified Zen Launchpad (Inputs, Mode, Studio Tuning & Inspiration Chips) */}
            <ZenLaunchpad
              ready={prefsLoaded}
              notes={rawNotes}
              setNotes={setRawNotes}
              mode={encodingMode}
              setMode={setEncodingMode}
              sourceType={activeTab}
              setSourceType={setActiveTab}
              selectedFile={uploadedFile}
              onFileLoaded={(file) => setUploadedFile(file)}
              youtubeUrl={youtubeUrl}
              setYoutubeUrl={setYoutubeUrl}
              enableDeepResearch={enableDeepResearch}
              setEnableDeepResearch={setEnableDeepResearch}
              enableGuidedPath={enableGuidedPath}
              setEnableGuidedPath={setEnableGuidedPath}
              interleaveMode={interleaveMode}
              setInterleaveMode={setInterleaveMode}
              gear={gear}
              setGear={(g) => {
                setGear(g);
                // The gear also sets how hard the examiner probes: an Express
                // Forge session should never open with a ruthless viva.
                setStrictnessLevel(g === 1 ? 'sherpa' : g === 3 ? 'viva' : 'feynman');
              }}
              onGenerate={handleInitiateGenerate}
              onTeach={() => handleOpenTeach('notes')}
              onForge={() => setIsForgeOpen(true)}
              isLoading={false}
              onTryToyExample={(id) => {
                const example = TOY_EXAMPLES.find((item) => item.id === id);
                if (!example) return;
                const activity = activityForToyExample(example);
                resetSession();
                setRawNotes(example.notes);
                setUploadedFile(null);
                setYoutubeUrl('');
                setActiveTab('text');
                setActivities([activity]);
                setTopicSummary(example.config.title);
                setCurrentActivityIndex(0);
                loadStageInputs(0, [activity], {});
                setAppState('encoding');
              }}
            />

                        {/* Bench: audits and export targets share one panel, in two
                columns, instead of two centered rows of pills stacked above a
                three-column telemetry band. Each audit is its own bordered
                block so the page reads as a working list. */}
            <div className="studio-bench grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-4">
              <div className="min-w-0 p-5 bg-deck border border-edge/70 rounded-2xl shadow-panel">
                <div className="flex items-center gap-2.5 mb-4">
                  <span className="label-caps whitespace-nowrap">
                    Pre-flight audits
                  </span>
                  <span className="h-px w-6 gilt-rule" aria-hidden />
                  <span className="font-mono text-[10px] text-solder whitespace-nowrap">optional</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {([
                    {
                      key: 'prereq',
                      label: 'Check prerequisites',
                      busy: 'Auditing…',
                      busyNow: isAuditingPrereq,
                      desc: 'Background fundamentals this topic quietly assumes.',
                      tone: 'amber' as const,
                      title: 'Concept Prerequisites Check: Diagnoses background fundamentals you need before tackling this topic',
                      onClick: handleAuditPrerequisites,
                      disabled: (!rawNotes.trim() && !uploadedFile) || isAuditingPrereq,
                    },
                    {
                      key: 'pretest',
                      label: 'Pre-test drill',
                      busy: 'Generating…',
                      busyNow: isLoadingPretest,
                      desc: 'Three questions you are supposed to fail first.',
                      tone: 'amber' as const,
                      title: 'Pre-Testing Effect (Productive Failure): 3-question diagnostic failure drill before learning',
                      onClick: handleLaunchPretest,
                      disabled: (!rawNotes.trim() && !uploadedFile) || isLoadingPretest,
                    },
                    {
                      key: 'roast',
                      label: 'Roast notes',
                      busy: 'Auditing…',
                      busyNow: isRoasting,
                      desc: 'Names fallacies and hand-waving in the source.',
                      tone: 'hazard' as const,
                      title: 'Strict Professor Audit: Call out fallacies, hand-waving, and missing gaps before encoding',
                      onClick: handleRoastNotes,
                      disabled: (!rawNotes.trim() && !uploadedFile) || isRoasting,
                    },
                    {
                      key: 'segregate',
                      label: 'Segregate and export',
                      busy: 'Segregating…',
                      busyNow: isSegregating,
                      desc: 'Separates concepts from facts in a 4-quadrant matrix.',
                      tone: 'amber' as const,
                      title: 'Concept vs Fact Segregator: 4-Quadrant Matrix + Cloze Optimizer / Export to Anki or RemNote',
                      onClick: handleSegregateNotes,
                      disabled: (!rawNotes.trim() && !uploadedFile) || isSegregating,
                    },
                  ]).map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      onClick={a.onClick}
                      disabled={a.disabled}
                      title={a.title}
                      className={`text-left p-4 bg-chassis/60 border rounded-xl transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        a.tone === 'hazard'
                          ? 'border-edge/70 hover:border-hazard-500/50'
                          : 'border-edge/70 hover:border-gilt/40'
                      }`}
                    >
                      <span
                        className={`block text-xs font-semibold ${
                          a.tone === 'hazard' ? 'text-hazard-300' : 'text-bone'
                        }`}
                      >
                        {a.busyNow ? a.busy : a.label}
                      </span>
                      <span className="mt-1 block text-[11px] leading-snug text-solder">{a.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-5 bg-deck border border-edge/70 rounded-2xl shadow-panel">
                <div className="flex items-center gap-2.5 mb-4">
                  <span className="label-caps whitespace-nowrap">
                    Export targets
                  </span>
                  <span className="h-px w-6 gilt-rule" aria-hidden />
                </div>

                {/* What the segregation pass keeps, as a real form list. */}
                <div className="border border-edge/60 bg-chassis/50 rounded-xl overflow-hidden divide-y divide-edge/40">
                  {([
                    ['facts', 'Facts', 'Isolated claims worth a card'],
                    ['mechanisms', 'Mechanisms', 'Causal chains to reconstruct'],
                    ['drills', 'Drills', 'Procedures and worked steps'],
                    ['examples', 'Examples', 'Concrete instances of the rule'],
                    ['mcq', 'MCQ', 'Parametric multiple-choice archetypes'],
                  ] as [keyof typeof segregateOptions, string, string][]).map(([key, label, hint]) => (
                    <label
                      key={key}
                      className="flex items-start gap-2.5 px-2.5 py-2 cursor-pointer hover:bg-inset/60 transition-colors duration-150"
                    >
                      <input
                        type="checkbox"
                        checked={segregateOptions[key]}
                        onChange={() => setSegregateOptions((prev) => ({ ...prev, [key]: !prev[key] }))}
                        className="mt-0.5 w-3.5 h-3.5 accent-amber-500 cursor-pointer"
                      />
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-bone">{label}</span>
                        <span className="block text-[10px] leading-snug text-solder">{hint}</span>
                      </span>
                    </label>
                  ))}
                </div>

                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  {([['anki', 'ANKI'], ['remnote', 'REMNOTE']] as [keyof typeof segregateOptions, string][]).map(([key, label]) => {
                    const on = segregateOptions[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setSegregateOptions((prev) => ({ ...prev, [key]: !prev[key] }))}
                        className={`px-3 py-2 border rounded-full font-mono text-[11px] uppercase tracking-[0.16em] transition-colors duration-150 cursor-pointer ${
                          on
                            ? 'bg-gradient-to-b from-amber-400 to-amber-600 border-amber-600/70 text-inset font-semibold shadow-gilt'
                            : 'bg-chassis border-edge/70 text-solder hover:text-bone hover:border-gilt/40'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* Method: why the encoder is shaped this way. */}
                <div className="mt-5">
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className="label-caps whitespace-nowrap">
                      Method
                    </span>
                    <span className="h-px w-6 gilt-rule" aria-hidden />
                  </div>
                  <dl className="space-y-2.5">
                    <div>
                      <dt className="text-[11px] font-semibold text-amber-300">
                        01 · {encodingMode === 'memorization' ? "Miller's 7±2 law and chunking" : 'Craik & Lockhart levels of processing'}
                      </dt>
                      <dd className="mt-0.5 text-[11px] leading-relaxed text-solder">
                        {encodingMode === 'memorization'
                          ? 'Arbitrary items get grouped into semantic sub-clusters, because working memory holds about seven pieces at once.'
                          : 'Semantic analysis leaves stronger traces than re-reading, so every stage asks for meaning, not recitation.'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold text-amber-300">
                        02 · {encodingMode === 'memorization' ? 'Method of loci' : 'Paivio dual coding (1986)'}
                      </dt>
                      <dd className="mt-0.5 text-[11px] leading-relaxed text-solder">
                        {encodingMode === 'memorization'
                          ? 'Items placed along a familiar physical path ride on spatial memory, which is cheap to walk back through.'
                          : 'A verbal code and a visual code for the same mechanism give recall two routes instead of one.'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold text-amber-300">03 · The interleaving effect</dt>
                      <dd className="mt-0.5 text-[11px] leading-relaxed text-solder">
                        Mixing domains forces active discrimination between similar items, which is what keeps them from collapsing into each other in review.
                      </dd>
                    </div>
                  </dl>
                </div>
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
            className="w-full py-24 flex flex-col items-center justify-center text-center"
          >
            <div className="mb-7 flex items-center gap-2.5 px-3.5 py-1.5 bg-deck border border-gilt/30 rounded-full">
              <span className="h-1.5 w-1.5 rotate-45 bg-gradient-to-br from-amber-300 to-amber-600" aria-hidden />
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-200">
                Processing
              </span>
            </div>
            <h2 className="font-display text-[26px] leading-tight text-bone mb-3">
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
            {streamTitle && (
              <p
                className="text-amber-200/90 font-mono text-[11px] uppercase tracking-[0.18em] mb-2"
                data-testid="gen-title"
              >
                {streamTitle}
              </p>
            )}
            <p className="text-solder max-w-md text-sm leading-relaxed">
              {activeTab === 'youtube'
                ? 'Gemini 3.7 Flash is extracting key lecture milestones, visual animations, and timestamp anchors.'
                : enableDeepResearch
                  ? 'Deep Research Agent is analyzing prerequisite foundational context & grounding omissions.'
                  : 'Applying cognitive encoding principles to build your interactive workspace.'}
            </p>

            {/* Live pipeline progress : asymptotic bar + elapsed clock + phase ticker */}
            <div className="mt-8 w-full max-w-md">
              <div className="h-1.5 w-full bg-inset border border-edge/60 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 shadow-gilt transition-all duration-1000 ease-linear"
                  style={{ width: `${pct}%` }}
                  role="progressbar"
                  aria-label="Generation progress"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px] font-mono uppercase tracking-wider">
                <span className="text-solder" data-testid="gen-phase">{phase}</span>
                <span className="text-amber" data-testid="gen-elapsed">{elapsed}s elapsed</span>
              </div>
              {outlines.length > 0 && (
                <div className="mt-4 space-y-1 text-left" data-testid="gen-outlines">
                  <span className="block text-[10px] font-mono uppercase tracking-[0.2em] text-solder">
                    Stages outlined so far
                  </span>
                  {outlines.map((stage) => (
                    <motion.div
                      key={`${stage.stageNumber}-${stage.title}`}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-baseline gap-2 bg-deck border border-gilt/30 rounded-lg px-2.5 py-1.5"
                    >
                      <span className="text-[10px] font-mono text-amber shrink-0">
                        {String(stage.stageNumber ?? 0).padStart(2, "0")}
                      </span>
                      <span className="text-[11px] font-mono text-bone leading-snug">{stage.title}</span>
                    </motion.div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={handleCancelGeneration}
                title="Cancel this generation and return to the input"
                className="mt-6 px-4 py-2 text-xs text-solder bg-inset border border-edge/70 rounded-full hover:text-hazard-300 hover:border-hazard-500/50 transition-colors duration-150 cursor-pointer"
              >
                Cancel generation
              </button>
            </div>
          </motion.div>
        )}

{/* ------------------------------------------------------------- */}
        {/* STATE 3: THE 3-ZONE STUDIO WORKBENCH (CRUCIBLE)              */}
        {/* ------------------------------------------------------------- */}
        {appState === 'encoding' && currentActivity && (
          <motion.div
            key={`stage-${currentActivity.id}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="w-full flex flex-col gap-4"
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

            {/* Deep Research Badge (if prerequisite context was added) */}
            {currentActivity.researchContext && (
              <DeepResearchBadge context={currentActivity.researchContext} />
            )}

            {/* 3-Zone Workbench: Zone 1 (Source), Zone 2 (Forge), Zone 3 (RemNote & Strictness) */}
            <StudioWorkbench
              activities={activities}
              currentActivityIndex={currentActivityIndex}
              setCurrentActivityIndex={setCurrentActivityIndex}
              userResponses={userResponses}
              onToyProgress={(activityId, progress) => setUserResponses((previous) => ({
                ...previous,
                [activityId]: { ...(previous[activityId] || { field1: '', field2: '' }), toyModelProgress: progress },
              }))}
              field1={field1}
              setField1={setField1}
              field2={field2}
              setField2={setField2}
              field3={field3}
              setField3={setField3}
              selectedPreset={selectedPreset}
              rawNotes={rawNotes}
              uploadedFile={uploadedFile}
              youtubeData={youtubeData}
              topicSummary={topicSummary}
              combo={combo}
              strictnessLevel={strictnessLevel}
              setStrictnessLevel={setStrictnessLevel}
              onCheckAnswer={handleCheckAnswer}
              onTeachStage={() => handleOpenTeach('stage', currentActivityIndex)}
              isEvaluating={isEvaluating}
              feynmanResult={feynmanResult}
              onNextActivity={handleNextActivity}
              onPreviousActivity={handlePreviousActivity}
              onSkipStage={handleSkipStage}
              onRegenerateStage={handleRegenerateStage}
              isRegenerating={isRegenerating}
              justMastered={justMastered}
              showDifficultyRating={currentActivityIndex === 1 && !difficultyRated}
              onDifficultyRate={(stars: number) => {
                setPreSessionConfidence(stars);
                setDifficultyRated(true);
              }}
              onUndoFields={undoFields}
              onRedoFields={redoFields}
              canUndo={canUndo}
              canRedo={canRedo}
              stageReflection={stageReflection}
              setStageReflection={setStageReflection}
              stageCheckCount={stageCheckCount}
              stageErrorAnalysis={stageErrorAnalysis ?? undefined}
            />
          </motion.div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* STATE 4: COMPLETED MASTER SCHEMA & SRS EXPORT MATRIX         */}
        {/* ------------------------------------------------------------- */}
        {appState === 'completed' && (
          <CompletedSessionView
            key="completed"
            xp={xp}
            topicSummary={topicSummary}
            activities={activities}
            userResponses={userResponses}
            youtubeData={youtubeData}
            copiedFormat={copiedFormat}
            handoffStats={handoffStats}
            onDownloadApkg={handleDownloadApkg}
            onCopy={copyToClipboard}
            onShare={() => handleOpenStatelessShare()}
            onOpenBlurting={() => setIsBlurtingModalOpen(true)}
            onTeach={() => handleOpenTeach('schema')}
            onOpenSegregate={(report) => {
              setSegregationReport(report);
              setShowExportChoice(true);
            }}
            onRestart={resetApp}
            hasIncompleteStages={hasIncompleteStages}
            onContinue={handleContinueToEncodingWrapper}
          />
        )}

        <footer className="studio-footer">
          <span><span className="studio-status-dot" /> LOCAL-FIRST BY DESIGN</span>
          <span>Not a shortcut to answers. A better way to think.</span>
          <span>DEEPENCODE / COGNITIVE STUDIO</span>
        </footer>
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
        onSaved={(newSettings: AISettings) => setAiSettings(newSettings)}
        backupSettingsToCloud={backupSettingsToCloud}
      />

      {/* Saved Schemas History Drawer */}
      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        schemas={savedSchemas}
        onSelectSchemaToResume={handleResumeSchema}
        onShareSchema={(schema: SavedSchema) => handleOpenStatelessShare(schema)}
        onDeleteSchema={handleDeleteSchema}
        onClearAll={handleClearAllHistory}
        onOpenAuth={() => {
          setIsHistoryOpen(false);
          setIsAuthOpen(true);
        }}
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

      {/* Teach Me : Brilliant-style interactive lesson (AI-authored, with an
          offline schema-based fallback). Available from the launchpad, the
          per-stage workbench, and the completed session view. */}
      <TeachMeModal
        isOpen={isTeachOpen}
        onClose={() => setIsTeachOpen(false)}
        scope={teachScope}
        topicSummary={topicSummary}
        mode={encodingMode}
        notes={rawNotes}
        file={uploadedFile}
        activities={activities}
        stageIndex={teachStageIndex}
        userResponses={userResponses}
        researchContexts={researchContexts}
        settings={aiSettings}
        onAwardXP={(earnedXp: number) => addXP(earnedXp)}
        onStartEncoding={handleTeachStartEncoding}
      />

      {/* Feature 51: The Blurting Method (Free Recall Blank Canvas) Modal */}
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

      {/* Export Choice Modal: Anki vs RemNote */}
      {showExportChoice && segregationReport && (
        <div ref={exportChoiceRef} role="dialog" aria-modal="true" tabIndex={-1} className="fixed inset-0 z-[60] flex items-center justify-center bg-chassis/90">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-deck border border-edge/70 rounded-2xl shadow-raised p-6 max-w-md w-full mx-4"
          >
            <div className="text-center mb-6">
              <span className="inline-block px-3 py-1 bg-chassis border border-gilt/30 text-amber-200 text-[10px] font-mono uppercase tracking-[0.2em] rounded-full mb-4">
                [ SEGREGATION COMPLETE ]
              </span>
              <h3 className="font-display text-[20px] leading-tight text-bone">Export your 4-Quadrant Matrix</h3>
              <p className="text-[10px] text-solder font-mono uppercase tracking-[0.2em] mt-1.5">
                {'// TARGET: ANKI OR REMNOTE'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setShowExportChoice(false);
                  setIsAnkiExportOpen(true);
                }}
                className="flex flex-col items-center gap-2 p-5 bg-chassis/60 border border-edge/70 rounded-2xl hover:border-gilt/45 hover:bg-white/[0.03] transition-colors duration-150 cursor-pointer"
              >
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-bone">[ ANKI ]</span>
                <span className="text-[10px] font-mono text-solder">.APKG + SM-2</span>
              </button>

              <button
                onClick={() => {
                  setShowExportChoice(false);
                  setIsSegregateModalOpen(true);
                }}
                className="flex flex-col items-center gap-2 p-5 bg-chassis/60 border border-edge/70 rounded-2xl hover:border-gilt/45 hover:bg-white/[0.03] transition-colors duration-150 cursor-pointer"
              >
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-bone">[ REMNOTE ]</span>
                <span className="text-[10px] font-mono text-solder">MARKDOWN + API</span>
              </button>
            </div>

            <button
              onClick={() => setShowExportChoice(false)}
              className="w-full mt-4 py-2 rounded-full text-[10px] font-mono uppercase tracking-[0.2em] text-solder hover:text-bone hover:bg-white/[0.04] cursor-pointer"
            >
              [ CANCEL ]
            </button>
          </motion.div>
        </div>
      )}

      {/* Feature: Direct Anki .apkg Export & SM-2 Spaced Repetition Webhook Sync */}
      <AnkiExportModal
        isOpen={isAnkiExportOpen}
        onClose={() => {
          setIsAnkiExportOpen(false);
          // The forge's "both" target stacks RemNote behind Anki, so two
          // export modals are never on screen at once.
          if (pendingForgeRemnote) {
            setPendingForgeRemnote(false);
            setIsSegregateModalOpen(true);
          }
        }}
        schema={{
          topicSummary,
          activities,
          userResponses,
        }}
        report={segregationReport}
        notes={rawNotes}
        includeMcq={segregateOptions.mcq}
      />

      {/* Flashcards Only: the Forge. Many sources in, one deduped deck out,
          straight to the export surface the learner chose — no encoding. */}
      <FlashcardForgeModal
        isOpen={isForgeOpen}
        onClose={() => setIsForgeOpen(false)}
        settings={aiSettings}
        onDeckReady={handleForgeDeckReady}
        initialNotes={rawNotes}
      />

      {/* Feature: Multi-Document Comparative 4-Quadrant Synthesis */}
      <ComparativeSynthesisModal
        isOpen={isComparativeModalOpen}
        onClose={() => setIsComparativeModalOpen(false)}
        settings={aiSettings}
        onOpenAnkiExport={(compReport: any) => {
          setIsComparativeModalOpen(false);
          setIsAnkiExportOpen(true);
        }}
      />

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
