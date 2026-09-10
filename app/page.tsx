'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
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
import { incrementModelCall } from '@/lib/storage';
import { decompressSchemaFromUrl } from '@/lib/url-share';
import { SettingsModal } from '@/components/SettingsModal';
import { HistoryDrawer } from '@/components/HistoryDrawer';
import { DrillModal } from '@/components/DrillModal';
import { AuthModal } from '@/components/AuthModal';
import { DeepResearchBadge } from '@/components/DeepResearchBadge';
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
import { generateOfflineWorkout } from '@/lib/services/offlineGenerator';
import { ZenLaunchpad } from '@/components/ZenLaunchpad';
import { StudioWorkbench } from '@/components/workbench/StudioWorkbench';
import { useAuth } from '@/lib/auth-context';
import { ReadinessModal } from '@/components/ReadinessModal';
import { EndSessionReviewModal, EndSessionReviewData } from '@/components/EndSessionReviewModal';
import { AnalyticsDashboard } from '@/components/AnalyticsDashboard';
import { computeSuccessRate } from '@/lib/services/adaptiveDifficulty';
import { extractAnkiCardsFromSchema, classifyDeckQuality, buildHierarchicalDeckName, generateAnkiApkgPackage } from '@/lib/anki-exporter';
import { useSession } from '@/hooks/useSession';
import { useSettings } from '@/hooks/useSettings';
import { useInputSource } from '@/hooks/useInputSource';
import { useSchemaLibrary } from '@/hooks/useSchemaLibrary';
import { CompletedSessionView } from '@/components/CompletedSessionView';
import { TeachMeModal } from '@/components/TeachMeModal';
export default function DeepEncodeApp() {
  const { user, cloudStats, saveSchemaToCloud, deleteSchemaFromCloud } = useAuth();

  // ─── Extracted state hooks ─────────────────────────────────────────────────
  // Input sources & generation toggles (useInputSource)
  const {
    activeTab, setActiveTab,
    rawNotes, setRawNotes,
    uploadedFile, setUploadedFile,
    youtubeUrl, setYoutubeUrl,
    enableDeepResearch, setEnableDeepResearch,
    enableGuidedPath, setEnableGuidedPath,
    interleaveMode, setInterleaveMode,
    strictnessLevel, setStrictnessLevel,
    wordCount,
  } = useInputSource();

  // AI settings, audio & connectivity (useSettings)
  const {
    aiSettings, setAiSettings,
    soundMuted, toggleSound,
    isOffline,
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
    stageReflection,
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
    selectModule,
    feynmanPass,
  } = useSession();

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
  const [isInterleavingOpen, setIsInterleavingOpen] = useState(false);
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

  // Segregation & Export Engine State
  const [isSegregateModalOpen, setIsSegregateModalOpen] = useState(false);
  const [isSegregating, setIsSegregating] = useState(false);
  const [segregationReport, setSegregationReport] = useState<SegregationReport | null>(null);
  const [showExportChoice, setShowExportChoice] = useState(false);

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

  // New Metacognition & Science States
  // (PreSessionConfidenceModal removed: no pre-session gate. The 1-5 rating is
  // now collected inline right after stage 1 and feeds the same state.)
  const [preSessionConfidence, setPreSessionConfidence] = useState<number>(3);
  const [difficultyRated, setDifficultyRated] = useState(false);
  const [isReadinessModalOpen, setIsReadinessModalOpen] = useState(false);
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

  const field1Ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // Load stage inputs into the active editor; opens the Readiness modal when
  // the stage hasn't been confirmed yet (UI side effect stays in the shell).
  const loadStageInputs = (activityIndex: number, acts: Activity[], responses: Record<string, StageResponse>) => {
    if (applyStageInputs(activityIndex, acts, responses)) {
      setIsReadinessModalOpen(true);
    }
  };

  // Parse Stateless Shared Schema from URL query on Mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const timer = setTimeout(() => {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        
        // Check for 1-Click Bookmarklet text input (?notes=... or ?text=...)
        const rawNotesParam = searchParams.get('notes') || searchParams.get('text');
        if (rawNotesParam) {
          setRawNotes(decodeURIComponent(rawNotesParam));
          setActiveTab('text');
          sound.playSuccess();
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
      setShowExportChoice(true);
      sound.playSuccess();
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
    if (displayXp >= 500) return { title: 'Schema Engineer', level: 3, color: 'text-bone border-steel' };
    if (displayXp >= 250) return { title: 'Active Encoder', level: 2, color: 'text-bone border-steel' };
    return { title: 'Passive Reader', level: 1, color: 'text-solder border-steel' };
  }, [xp, cloudStats]);


  useEffect(() => {
    if (appState === 'encoding') {
      field1Ref.current?.focus();
    }
  }, [appState, currentActivityIndex]);

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

  // Main Generation Handler (Text / File / YouTube)
  const handleGenerate = async (confirmedConfidence?: number) => {
    const userConfidenceVal = confirmedConfidence || preSessionConfidence;

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

      const mastered = evalData.grade === 'mastered';

      // Update response record. On mastery, auto-save the full response
      // (fields + confidence + reflection) so "Next" is a single keypress.
      setUserResponses(prev => ({
        ...prev,
        [currentActivity.id]: {
          ...(prev[currentActivity.id] || { field1, field2 }),
          ...(mastered ? { field1, field2, field3, selectedPreset } : {}),
          confidenceScore: stageConfidence,
          reflection: stageReflection,
          checkCount: nextCount,
          errorAnalysis: evalData.errorAnalysis || undefined,
          feynmanReview: evalData,
        }
      }));

      if (mastered) {
        // Auto-advance cue: pulse the Next button (Atomic Habits : make the
        // next action obvious + immediately satisfying).
        setJustMastered(true);
        setTimeout(() => setJustMastered(false), 2200);
      } else {
        setJustMastered(false);
      }

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
        field1: '',
        field2: '',
        field3: '',
        selectedPreset: '',
        readinessConfirmed: true,
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
        id: `schema_${Date.now()}`,
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

  const resetApp = () => {
    resetSession();
    setRawNotes('');
    setUploadedFile(null);
    setYoutubeUrl('');
  };

  const handleResumeSchema = (saved: SavedSchema) => {
    if (resumeSchema(saved)) {
      setIsReadinessModalOpen(true);
    }
    sound.playSuccess();
  };

  const handleDeleteSchema = async (id: string) => {
    await deleteSchemaFromLibrary(id);
  };

  const handleClearAllHistory = () => {
    clearAllSchemaLibrary();
  };

  // ─── Identity trophy: handoff quality (NOT XP) ────────────────────────────
  // "I convert messy notes to clean cards." The reward is the clean handoff:
  // N FSRS-ready cards, X leech candidates, Y unfinished, Z boundary traps.
  const handoffCards = useMemo(
    () => extractAnkiCardsFromSchema({ topicSummary, activities, userResponses }),
    [activities, userResponses, topicSummary]
  );
  const handoffStats = useMemo(() => classifyDeckQuality(handoffCards), [handoffCards]);

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
    <main className="min-h-screen min-h-dvh bg-chassis text-bone flex flex-col items-center py-4 sm:py-8 px-3 sm:px-6 relative overflow-x-hidden selection:bg-amber/30 selection:text-chassis font-mono mobile-safe-bottom">

      <div className="w-full max-w-5xl relative z-10 flex-1 flex flex-col">

        {/* Top Control Bar : wraps cleanly on phones, full-width rows. */}
        <header className="mb-6 sm:mb-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 border border-steel bg-deck px-3 sm:px-4 py-3">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-bone uppercase">DeepEncode</h1>
                <span className="px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-widest bg-chassis text-amber border border-amber/40">
                  [ GEMINI 3.7 // FIRESTORE ]
                </span>
              </div>
              <p className="text-[10px] text-solder font-mono uppercase tracking-wider">{'// Multimodal cognitive schema architect with adaptive chunking & interleaving'}</p>
            </div>
          </div>

          {/* Gamification Bar & Top Buttons : scrolls horizontally on phones
              so items keep 44px targets instead of wrapping into a tall stack. */}
          <div className="flex items-center gap-2 sm:gap-2.5 overflow-x-auto max-w-full py-1 [-webkit-overflow-scrolling:touch]">
            {appState !== 'input' && (
              <div className="shrink-0 flex items-center gap-2.5 bg-chassis border border-steel px-3 py-1.5 min-h-[44px] relative">
                <span className="text-xs font-bold font-mono tracking-tight text-amber">XP: {String(xp).padStart(4, '0')}</span>

                <div className="h-4 w-px bg-steel" />

                <div className={`px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider border bg-deck ${userRank.color}`}>
                  LVL: {String(userRank.level).padStart(2, '0')} {'//'} {userRank.title}
                </div>

                {/* Floating XP Gain Indicator */}
                <AnimatePresence>
                  {xpGainAnimation && (
                    <motion.div
                      initial={{ opacity: 0, y: 0 }}
                      animate={{ opacity: 1, y: -28 }}
                      exit={{ opacity: 0 }}
                      className="absolute -top-3 right-4 px-2 py-0.5 bg-amber text-chassis text-[11px] font-mono font-bold z-20"
                    >
                      +{xpGainAnimation} XP
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* PWA Local-First Offline & Install Indicator */}
            {isOffline && (
              <div className="shrink-0 px-2.5 py-1 min-h-[44px] flex items-center bg-chassis border border-hazard text-solder text-[10px] font-mono font-bold uppercase tracking-wider">
                [ LINK: OFFLINE ]
              </div>
            )}
            <PWAInstallHeader />

            {/* Multi-Doc Comparative Synthesis Button */}
            <button
              type="button"
              onClick={() => setIsComparativeModalOpen(true)}
              className="shrink-0 min-h-[44px] px-3 py-1.5 bg-chassis border border-steel text-solder hover:text-bone hover:border-solder transition-none text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer"
              title="Compare two documents (e.g. Lecture Slides vs Textbook Chapter)"
            >
              [ COMPARE // 2 DOCS ]
            </button>

            {/* Anki & SM-2 Exporter Button */}
            <button
              type="button"
              onClick={() => setIsAnkiExportOpen(true)}
              className="shrink-0 min-h-[44px] px-3 py-1.5 bg-chassis border border-steel text-solder hover:text-bone hover:border-solder transition-none text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer"
              title="Export .apkg Anki package or sync via SM-2 Webhooks"
            >
              [ ANKI: SM-2 ]
            </button>

            {/* Interleaving Multi-Domain Drill Button */}
            <button
              type="button"
              onClick={() => setIsInterleavingOpen(true)}
              className="shrink-0 min-h-[44px] px-3 py-1.5 bg-chassis border border-steel text-solder hover:text-bone hover:border-solder transition-none text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer"
              title="Start Interleaved Multi-Domain Drill (Mix subjects)"
            >
              [ DRILL: INTERLEAVE ]
            </button>

            {/* Stateless Share Button in Top Bar (when active or completed) */}
            {appState !== 'input' && (
              <button
                type="button"
                onClick={() => handleOpenStatelessShare()}
                className="shrink-0 min-h-[44px] px-3 py-1.5 bg-chassis border border-steel text-solder hover:text-bone hover:border-solder transition-none text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer"
                title="Share Stateless URL (Free & Zero DB Required)"
              >
                [ SHARE ]
              </button>
            )}

            {/* Cloud Sync / Account Button */}
            <button
              onClick={() => setIsAuthOpen(true)}
              className={`shrink-0 min-h-[44px] px-3 py-1.5 bg-chassis border transition-none text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer ${
                user
                  ? 'border-amber/40 text-amber'
                  : 'border-steel text-solder hover:text-bone'
              }`}
              title={user ? `Signed in as ${user.displayName || user.email || 'User'} (Cloud Synced)` : 'Connect Cloud Database (Firestore)'}
            >
              [ CLOUD: {user ? 'SYNCED' : 'OFF'} ]
            </button>

            {/* Metacognitive Performance Review Button (when completed) */}
            {appState === 'completed' && (
              <button
                type="button"
                onClick={() => handleEndSessionReview()}
                className="shrink-0 min-h-[44px] px-3 py-1.5 bg-amber border border-amber text-chassis transition-none text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer"
                title="View Metacognitive Performance Review"
              >
                [ SESSION REVIEW ]
              </button>
            )}

            {/* Analytics Dashboard Button */}
            <button
              type="button"
              onClick={() => setIsAnalyticsOpen(true)}
              className="shrink-0 min-h-[44px] px-3 py-1.5 bg-chassis border border-steel text-solder hover:text-bone hover:border-solder transition-none text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer"
              title="Metacognitive Analytics & Model Quota Dashboard"
            >
              [ TELEMETRY ]
            </button>

            {/* Saved Schemas History Button */}
            <button
              onClick={() => setIsHistoryOpen(true)}
              className="shrink-0 min-h-[44px] px-3 py-1.5 bg-chassis border border-steel text-solder hover:text-bone hover:border-solder transition-none text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer relative"
              title="View Saved Schemas History"
            >
              [ LIBRARY{savedSchemas.length > 0 ? `: ${String(savedSchemas.length).padStart(2, '0')}` : ''} ]
            </button>

            {/* AI Settings / Multi-Key Button */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="shrink-0 min-h-[44px] px-3 py-1.5 bg-chassis border border-steel text-solder hover:text-bone hover:border-solder transition-none text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer"
              title="Configure Models (Gemini 3.7 Flash & 3.5 Flash-Lite)"
            >
              [ CONFIG ]
            </button>

            {/* Audio Toggle */}
            <button
              onClick={toggleSound}
              className="shrink-0 min-h-[44px] px-3 py-1.5 bg-chassis border border-steel text-solder hover:text-bone hover:border-solder transition-none text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer"
              title={soundMuted ? 'Unmute audio effects' : 'Mute audio effects'}
            >
              [ SND: {soundMuted ? 'OFF' : 'ON'} ]
            </button>
          </div>
        </header>

        {/* Imported Stateless Link Notification Banner */}
        {importedShareBanner && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-deck border border-amber/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
          >
            <div className="flex items-center gap-3">
              <span className="px-2 py-1 bg-chassis border border-amber/40 text-amber text-[9px] font-mono font-bold uppercase tracking-widest shrink-0">
                [ STATELESS URL ]
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-bone text-sm font-mono uppercase">Classmate Shared Schema Loaded</span>
                </div>
                <p className="text-solder text-xs mt-0.5 font-mono">
                  Loaded <span className="text-amber">&ldquo;{importedShareBanner}&rdquo;</span> completely free with zero database login needed.
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
                className="px-3.5 py-2 bg-amber border border-amber text-chassis font-mono font-bold text-[10px] uppercase tracking-wider cursor-pointer transition-none"
              >
                [ SAVE TO HISTORY ]
              </button>
              <button
                type="button"
                onClick={() => setImportedShareBanner(null)}
                className="px-2 py-1 text-solder hover:text-bone border border-steel hover:border-solder font-mono text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-none"
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
            className="w-full flex flex-col gap-6"
          >
            {/* Unified Zen Launchpad (Inputs, Mode, Studio Tuning & Inspiration Chips) */}
            <ZenLaunchpad
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
              onGenerate={handleInitiateGenerate}
              onTeach={() => handleOpenTeach('notes')}
              isLoading={false}
            />

            {/* Quick Diagnostic Power Tools */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-solder mr-1">
                {'// DEEP DIAGNOSTICS:'}
              </span>
              <button
                type="button"
                onClick={handleAuditPrerequisites}
                disabled={(!rawNotes.trim() && !uploadedFile) || isAuditingPrereq}
                className="px-3 py-1.5 bg-chassis disabled:opacity-40 border border-steel hover:border-amber text-bone text-[10px] font-mono font-bold uppercase tracking-wider transition-none cursor-pointer"
                title="Concept Prerequisites Check: Diagnoses background fundamentals you need before tackling this topic"
              >
                {isAuditingPrereq ? '[ AUDITING... ]' : '[ CHECK PREREQUISITES ]'}
              </button>

              <button
                type="button"
                onClick={handleLaunchPretest}
                disabled={(!rawNotes.trim() && !uploadedFile) || isLoadingPretest}
                className="px-3 py-1.5 bg-chassis disabled:opacity-40 border border-steel hover:border-amber text-bone text-[10px] font-mono font-bold uppercase tracking-wider transition-none cursor-pointer"
                title="Pre-Testing Effect (Productive Failure): 3-question diagnostic failure drill before learning"
              >
                {isLoadingPretest ? '[ GENERATING... ]' : '[ PRE-TEST DRILL ]'}
              </button>

              <button
                type="button"
                onClick={handleSegregateNotes}
                disabled={(!rawNotes.trim() && !uploadedFile) || isSegregating}
                className="px-3 py-1.5 bg-chassis disabled:opacity-40 border border-steel hover:border-amber text-bone text-[10px] font-mono font-bold uppercase tracking-wider transition-none cursor-pointer"
                title="Concept vs Fact Segregator: 4-Quadrant Matrix + Cloze Optimizer / Export to Anki or RemNote"
              >
                {isSegregating ? '[ SEGREGATING... ]' : '[ SEGREGATE AND EXPORT ]'}
              </button>

              <button
                type="button"
                onClick={handleRoastNotes}
                disabled={(!rawNotes.trim() && !uploadedFile) || isRoasting}
                className="px-3 py-1.5 bg-chassis disabled:opacity-40 border border-steel hover:border-hazard text-hazard text-[10px] font-mono font-bold uppercase tracking-wider transition-none cursor-pointer"
                title="Strict Professor Audit: Call out fallacies, hand-waving, and missing gaps before encoding"
              >
                {isRoasting ? '[ AUDITING... ]' : '[ ROAST NOTES ]'}
              </button>
            </div>

            {/* Cognitive framework telemetry */}
            <div className="bg-deck border border-steel">
              <div className="px-4 py-2 border-b border-steel bg-chassis">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-solder">{'// COGNITIVE FRAMEWORK TELEMETRY'}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 md:divide-x divide-y md:divide-y-0 divide-steel">
                <div className="p-4">
                  <div className="text-amber text-[10px] font-mono font-bold uppercase tracking-wider mb-1.5">
                    [ 01 ] {encodingMode === 'memorization' ? "Miller's 7±2 Law & Chunking" : "Craik & Lockhart Levels of Processing"}
                  </div>
                  <p className="text-[11px] text-solder font-mono leading-relaxed">
                    {encodingMode === 'memorization'
                      ? "Chunking arbitrary items into semantic sub-clusters prevents working memory overload."
                      : "Semantic analysis creates drastically stronger memory traces than passive re-reading."}
                  </p>
                </div>
                <div className="p-4">
                  <div className="text-amber text-[10px] font-mono font-bold uppercase tracking-wider mb-1.5">
                    [ 02 ] {encodingMode === 'memorization' ? "Method of Loci (Palace)" : "Paivio Dual Coding (1986)"}
                  </div>
                  <p className="text-[11px] text-solder font-mono leading-relaxed">
                    {encodingMode === 'memorization'
                      ? "Placing items along a familiar physical path leverages spatial navigation memory."
                      : "Forming both verbal and visual mental spatial codes doubles retrievability during recall."}
                  </p>
                </div>
                <div className="p-4">
                  <div className="text-amber text-[10px] font-mono font-bold uppercase tracking-wider mb-1.5">
                    [ 03 ] The Interleaving Effect
                  </div>
                  <p className="text-[11px] text-solder font-mono leading-relaxed">
                    Mixing diverse domains forces active neural discrimination, preventing mental fixation and building flexible mastery.
                  </p>
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
            className="w-full py-28 flex flex-col items-center justify-center text-center"
          >
            <div className="mb-6 border border-steel bg-deck px-6 py-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-amber">
                [ PROCESSING /// ]
              </span>
            </div>
            <h2 className="text-lg font-bold text-bone mb-2 tracking-tight font-mono uppercase">
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
            <p className="text-solder max-w-md font-mono text-xs uppercase tracking-wider">
              {activeTab === 'youtube'
                ? 'Gemini 3.7 Flash is extracting key lecture milestones, visual animations, and timestamp anchors.'
                : enableDeepResearch
                  ? 'Deep Research Agent is analyzing prerequisite foundational context & grounding omissions.'
                  : 'Applying cognitive encoding principles to build your interactive workspace.'}
            </p>
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
            onStartInterleavedDrill={() => setIsInterleavingOpen(true)}
            onOpenBlurting={() => setIsBlurtingModalOpen(true)}
            onTeach={() => handleOpenTeach('schema')}
            onOpenSegregate={(report) => {
              setSegregationReport(report);
              setShowExportChoice(true);
            }}
            onRestart={resetApp}
          />
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
        onSaved={(newSettings: AISettings) => setAiSettings(newSettings)}
      />

      {/* Saved Schemas History Drawer */}
      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        schemas={savedSchemas}
        onSelectSchemaToResume={handleResumeSchema}
        onStartDrill={(schema: SavedSchema) => setActiveDrillSchema(schema)}
        onShareSchema={(schema: SavedSchema) => handleOpenStatelessShare(schema)}
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
        onDrillComplete={(score: number) => {
          addXP(score >= 80 ? 100 : 50);
        }}
      />

      {/* Interleaving Multi-Domain Drill Modal */}
      <InterleavingDrillModal
        isOpen={isInterleavingOpen}
        onClose={() => setIsInterleavingOpen(false)}
        savedSchemas={savedSchemas}
        onAwardXP={(earnedXp: number) => addXP(earnedXp)}
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-chassis/90">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-deck border border-steel p-6 max-w-md w-full mx-4"
          >
            <div className="text-center mb-6">
              <span className="inline-block px-3 py-1 bg-chassis border border-amber/40 text-amber text-[10px] font-mono font-bold uppercase tracking-widest mb-3">
                [ SEGREGATION COMPLETE ]
              </span>
              <h3 className="text-base font-bold text-bone font-mono uppercase tracking-wider">Export your 4-Quadrant Matrix</h3>
              <p className="text-[10px] text-solder font-mono uppercase tracking-wider mt-1">
                {'// TARGET: ANKI OR REMNOTE'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setShowExportChoice(false);
                  setIsAnkiExportOpen(true);
                }}
                className="flex flex-col items-center gap-1.5 p-4 bg-chassis border border-steel hover:border-amber transition-none cursor-pointer"
              >
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-bone">[ ANKI ]</span>
                <span className="text-[10px] font-mono text-solder">.APKG + SM-2</span>
              </button>

              <button
                onClick={() => {
                  setShowExportChoice(false);
                  setIsSegregateModalOpen(true);
                }}
                className="flex flex-col items-center gap-1.5 p-4 bg-chassis border border-steel hover:border-amber transition-none cursor-pointer"
              >
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-bone">[ REMNOTE ]</span>
                <span className="text-[10px] font-mono text-solder">MARKDOWN + API</span>
              </button>
            </div>

            <button
              onClick={() => setShowExportChoice(false)}
              className="w-full mt-4 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-solder hover:text-bone transition-none cursor-pointer"
            >
              [ CANCEL ]
            </button>
          </motion.div>
        </div>
      )}

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
        onOpenAnkiExport={(compReport: any) => {
          setIsComparativeModalOpen(false);
          setIsAnkiExportOpen(true);
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
          onConfirm={(latencyMs: number, summary: string) => {
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
