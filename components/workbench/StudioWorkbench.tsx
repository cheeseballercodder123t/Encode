'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { SketchCanvas } from './SketchCanvas';
import { Activity, StageResponse, UploadedFileAsset, YouTubeMetadata } from '@/lib/types';
import { StageVisualRenderer } from '@/components/stage-templates/StageVisualRenderer';
import { getTemplateDefinition } from '@/lib/templates/registry';
import { generateRemnoteHierarchy } from '@/lib/remnote';
import {
  buildHierarchicalDeckName,
  extractStageAnkiCards,
  sanitizeExtracted,
  withHeldBackCards,
} from '@/lib/anki-exporter';
import { pushCardsToAnki, formatPushStatus, describePushError, loadAnkiEndpoint } from '@/lib/anki-connect';
import { playSound } from '@/lib/audio';
import { countWords } from '@/lib/fsrs-audit';
import { detectTabooTerms, findTabooHits } from '@/lib/cognitive-telemetry';
import { ProbeLadder } from './ProbeLadder';
import { InvertedStepDrill } from './InvertedStepDrill';
import { PrimingWarmup } from './PrimingWarmup';
import { CausalSequence } from './CausalSequence';
import { CausalSentence } from './CausalSentence';
import { ChapterRail } from './ChapterRail';
import { StemPreview } from './StemPreview';
import { buildCausalFrame, frameToSentence, type CausalFieldKey } from '@/lib/causal-frame';

const FLUFF_PATTERNS = [
  /\b(it is important to note that|as we can clearly see|in other words|basically|essentially|it should be remembered that|in this regard|furthermore, we notice that|it is worth mentioning that|needless to say)\b/gi,
  /\b(historically speaking|researchers have observed that|as previously stated|to put it simply|for all intents and purposes)\b/gi
];

interface StudioWorkbenchProps {
  activities: Activity[];
  currentActivityIndex: number;
  setCurrentActivityIndex: (idx: number) => void;
  userResponses: Record<string, StageResponse>;
  onToyProgress?: (activityId: string, progress: import('@/lib/toy-models/types').ToyModelProgress) => void;
  field1: string;
  setField1: (v: string | ((prev: string) => string)) => void;
  field2: string;
  setField2: (v: string | ((prev: string) => string)) => void;
  field3: string;
  setField3: (v: string | ((prev: string) => string)) => void;
  selectedPreset: string;
  rawNotes: string;
  uploadedFile: UploadedFileAsset | null;
  youtubeData: YouTubeMetadata | null;
  topicSummary: string;
  combo: number;
  strictnessLevel: 'sherpa' | 'feynman' | 'viva';
  setStrictnessLevel: (lvl: 'sherpa' | 'feynman' | 'viva') => void;
  onCheckAnswer: () => void;
  onTeachStage: () => void;
  isEvaluating: boolean;
  feynmanResult: StageResponse['feynmanReview'] | null;
  onNextActivity: () => void;
  onPreviousActivity: () => void;
  // Friction-cut loop additions
  onSkipStage: () => void;
  onRegenerateStage: (reason?: string) => void;
  isRegenerating: boolean;
  /** True right after the examiner grades the stage 'mastered' : pulse Next. */
  justMastered: boolean;
  /** Shown once, right after stage 1 completes : inline 1-5 difficulty rating. */
  showDifficultyRating: boolean;
  onDifficultyRate: (stars: number) => void;
  // Undo/redo for the stage's scaffold fields
  onUndoFields?: () => void;
  onRedoFields?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  // Per-stage one-line reflection ("the part that finally clicked...")
  stageReflection?: string;
  setStageReflection?: (v: string | ((prev: string) => string)) => void;
  // How many times the current stage has been checked by the examiner.
  stageCheckCount?: number;
  // Examiner error analysis for the current stage (shown in the needs-work hint).
  stageErrorAnalysis?: string;
}

/**
 * Taboo chips: the source's highest-jargon terms for this stage, banned during
 * encoding so the mechanism gets described physically instead of parroted.
 * Derived locally from the source text and the stage keywords (which are
 * allowed — they are what the learner SHOULD say).
 */
function TabooStrip({ leaked, terms }: { leaked: string[]; terms: string[] }) {
  if (terms.length === 0) return null;
  return (
    <div className="p-4 bg-inset/70 border border-edge/60 rounded-2xl space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-300">
          Taboo terms
        </span>
        <span className="text-[10px] font-mono text-solder">
          {leaked.length > 0 ? `${leaked.length} leaked` : 'none leaked yet'}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {terms.map((t) => {
          const hit = leaked.includes(t);
          return (
            <span
              key={t}
              className={`px-2.5 py-1 text-[11px] font-mono rounded-full border ${
                hit
                  ? 'bg-hazard-500/12 border-hazard-500/45 text-hazard-300 line-through'
                  : 'bg-deck border-edge/70 text-slate-ink'
              }`}
            >
              {t}
            </span>
          );
        })}
      </div>
      <p className="text-[10px] text-solder leading-relaxed">
        Explain these physically (what moves, what collides, what changes shape) instead of naming them.
      </p>
    </div>
  );
}

/**
 * One voice for every zone label: small caps, marked by a gold lozenge.
 * The mark replaces the full-width rule the panel headers used to carry — a
 * rule under every heading is what made the workbench read as stacked bands.
 */
function ZoneLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-ink">
      <span className="h-1.5 w-1.5 rotate-45 bg-gradient-to-br from-amber-300 to-amber-600" aria-hidden />
      {children}
    </span>
  );
}

/** Small toolbar toggle used across zones (fluff, smoke test, mic, sketchpad). */
function ToolToggle({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`min-h-[40px] sm:min-h-0 px-3 py-2 sm:py-1.5 text-[11px] rounded-full border transition-colors duration-150 cursor-pointer whitespace-nowrap ${
        active
          ? 'bg-amber-500/[0.14] border-gilt/50 text-amber-200'
          : 'bg-inset/70 border-edge/70 text-slate-ink hover:text-bone hover:border-gilt/30'
      }`}
    >
      {children}
    </button>
  );
}

export function StudioWorkbench({
  activities,
  currentActivityIndex,
  setCurrentActivityIndex,
  userResponses,
  onToyProgress,
  field1,
  setField1,
  field2,
  setField2,
  field3,
  setField3,
  selectedPreset,
  rawNotes,
  uploadedFile,
  youtubeData,
  topicSummary,
  combo,
  strictnessLevel,
  setStrictnessLevel,
  onCheckAnswer,
  onTeachStage,
  isEvaluating,
  feynmanResult,
  onNextActivity,
  onPreviousActivity,
  onSkipStage,
  onRegenerateStage,
  isRegenerating,
  justMastered,
  showDifficultyRating,
  onDifficultyRate,
  onUndoFields,
  onRedoFields,
  canUndo,
  canRedo,
  stageReflection,
  setStageReflection,
  stageCheckCount,
  stageErrorAnalysis,
}: StudioWorkbenchProps) {
  const [fluffStripperActive, setFluffStripperActive] = useState(false);
  const [copiedRemNote, setCopiedRemNote] = useState(false);
  const [mobileTab, setMobileTab] = useState<'source' | 'forge' | 'remnote'>('forge');
  
  // Hands-Free Spoken Feynman State
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  // Which pressure test the committed answer belongs to.
  const [probeCommittedKey, setProbeCommittedKey] = useState<string>('');

  // Card Smoke Test (Cloze masking preview)
  const [smokeTestActive, setSmokeTestActive] = useState(false);
  const [revealedSmokeClozes, setRevealedSmokeClozes] = useState<Record<string, boolean>>({});

  // Canvas Toggle
  const [showSketchpad, setShowSketchpad] = useState(false);
  // Recursive why-ladder (5-Whys drilldown to a systemic necessity)
  const [showProbe, setShowProbe] = useState(false);
  // Adversarial discriminative-repair drill (find the falsified step)
  const [showInvert, setShowInvert] = useState(false);
  // Priming warm-ups: shape / gradient / dimensional / extremum pre-flight
  const [showPrime, setShowPrime] = useState(false);
  // Parsons-style ordering drill (scrambled causal chain — zero typing)
  const [showSequence, setShowSequence] = useState(false);
  // Scaffold presentation. Null = follow the stage: the examiner's own sentence
  // wins when it wrote one (that is where a mad-lib beats boxes), the classic
  // fields otherwise. The toggle overrides either way.
  const [scaffoldOverride, setScaffoldOverride] = useState<'sentence' | 'fields' | null>(null);
  // Formula input: monospace field type + a rendered notation preview.
  const [stemMode, setStemMode] = useState(false);
  // Video sessions: which chapter the embedded player should seek to.
  const [chapterSeconds, setChapterSeconds] = useState<number | null>(null);

  // Socratic pressure test: the lab partner's one probing question, answered
  // in two words if that is all the answer needs. The committed answer is
  // tracked against a render-derived key (stage + check count) rather than an
  // effect, so a fresh check reopens the probe without a cascading render.
  const [probeDraft, setProbeDraft] = useState('');

  const currentActivity = activities[currentActivityIndex];

  // Derived during render (not in an effect): a fresh check or a new stage
  // reopens the pressure test without a cascading render.
  const probeKey = `${currentActivity?.id ?? ''}:${stageCheckCount ?? 0}`;
  const probeAnswerSent = probeCommittedKey === probeKey;

  // ─── Atomicity meters (FSRS handoff quality, live) ─────────────────────────
  // Same 15-word threshold the Anki exporter tags as LeechCandidate, so what
  // you see while typing is exactly what the handoff quality report will say.
  const f1Words = countWords(field1);
  const f2Words = countWords(field2);
  const wordMeter = (words: number) => {
    const over = words > 15;
    return (
      <div className="flex items-center justify-end gap-1.5">
        <span className={`text-[10px] font-mono font-semibold ${over ? 'text-hazard-400' : 'text-solder'}`}>
          {words}w {over ? '· split into two cards' : '· atomic'}
        </span>
      </div>
    );
  };

  // ─── Taboo constraint engine (jargon stripping) ───────────────────────────
  // The source's highest-jargon terms, minus this stage's own keywords (those
  // are what the learner SHOULD say). Recomputed per stage; nothing blocks
  // typing — leaks are flagged so the shortcut stays tempting, not punitive.
  const tabooTerms = useMemo(() => {
    if (!currentActivity) return [];
    // The bans come from the SOURCE material (where the jargon actually lives),
    // with the stage's own text as a fallback for thin-note sessions.
    const source = [
      rawNotes,
      currentActivity.contextSnippet,
      currentActivity.prompt,
      currentActivity.framework,
    ]
      .filter(Boolean)
      .join(' ');
    return detectTabooTerms(source, currentActivity.keywords || [], 5);
  }, [currentActivity, rawNotes]);

  const tabooLeaks = useMemo(
    () => findTabooHits(`${field1} ${field2} ${field3}`, tabooTerms),
    [field1, field2, field3, tabooTerms]
  );

  // The scaffold sentence: the examiner's template when it wrote one, else a
  // structural chain derived from this stage's labels (so sentence mode is
  // always available, never a degraded empty state).
  const causalFrame = useMemo(() => buildCausalFrame(currentActivity), [currentActivity]);
  const scaffoldMode =
    scaffoldOverride ?? (causalFrame?.source === 'ai' ? 'sentence' : 'fields');

  const setFrameField = (field: CausalFieldKey, value: string) => {
    if (field === 'field1') setField1(value);
    else if (field === 'field2') setField2(value);
    else setField3(value);
  };

  // Chapter jump: switch stages and seek the video to that chapter's anchor.
  const jumpToChapter = (index: number, seconds?: number) => {
    setCurrentActivityIndex(index);
    setChapterSeconds(typeof seconds === 'number' ? seconds : null);
  };

  // ─── AnkiConnect push (finish the stage, ship the card, move on) ──────────
  // The stage's own cards are sanitized by the same Wozniak pass the export
  // funnel uses, so a stage pushed from here is identical to the same stage
  // pushed later from the export modal — AnkiConnect dedupes it either way.
  const [ankiStatus, setAnkiStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPushingAnki, setIsPushingAnki] = useState(false);

  const pushStageToAnki = useCallback(async () => {
    if (!currentActivity || isPushingAnki) return;
    setIsPushingAnki(true);
    try {
      const deckName = buildHierarchicalDeckName(topicSummary);
      // What you see in the fields is what ships: an unsubmitted stage must not
      // export an empty cue card just because the examiner never ran. Stored
      // wording is the fallback, the live fields win, and re-encoding a skipped
      // stage clears the Unfinished tag it was carrying.
      const stored = userResponses[currentActivity.id];
      const response: StageResponse = {
        ...(stored || { field1: '', field2: '' }),
        field1: field1.trim() || stored?.field1 || '',
        field2: field2.trim() || stored?.field2 || '',
        field3: field3.trim() || stored?.field3,
        skipped: false,
      };
      // Sanitized like the export funnel, but ceiling overflow still ships
      // (tagged WozniakOverflow): a shortcut that silently exported zero cards
      // on a wordy answer would be worse than a flagged one. The receipt names
      // the overflow so the 20-word rule stays visible.
      const deck = sanitizeExtracted(
        extractStageAnkiCards(currentActivity, response, currentActivityIndex, topicSummary)
      );
      const cards = withHeldBackCards(deck, true);
      const result = await pushCardsToAnki(cards, deckName, { url: loadAnkiEndpoint() });
      setAnkiStatus({ ok: true, text: formatPushStatus(result, { overflow: deck.heldBack.length }) });
      playSound('success');
    } catch (err) {
      setAnkiStatus({ ok: false, text: describePushError(err) });
      playSound('wrong');
    } finally {
      setIsPushingAnki(false);
    }
  }, [currentActivity, currentActivityIndex, field1, field2, field3, isPushingAnki, topicSummary, userResponses]);

  // The status flash is a receipt, not a panel: it clears itself.
  useEffect(() => {
    if (!ankiStatus) return;
    const timer = setTimeout(() => setAnkiStatus(null), 9000);
    return () => clearTimeout(timer);
  }, [ankiStatus]);

  // Cmd/Ctrl+Shift+A : push this stage's cards without leaving the forge.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        void pushStageToAnki();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pushStageToAnki]);

  // "Insert missing link" : the examiner's one missing causal step is appended
  // to the mechanism field instead of making the learner rewrite the paragraph.
  const [missingLinkDraft, setMissingLinkDraft] = useState('');
  const submitMissingLink = () => {
    const sentence = missingLinkDraft.trim();
    if (!sentence) return;
    // Appended, never replacing: the learner's own wording stays theirs.
    setField2((prev: string) => (prev.trim() ? `${prev.trim()} ${sentence}` : sentence));
    setMissingLinkDraft('');
    playSound('success');
  };

  // Cmd/Ctrl+Enter : check the stage, and if it's already checked, advance.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (isEvaluating) return;
        const hasInput = field1.trim() && field2.trim();
        if (!hasInput) return;
        // Once the mechanism has landed there is nothing left to check, so the
        // same keystroke becomes the hand-off: inject the crystallized cards.
        if (feynmanResult?.secured) {
          void pushStageToAnki();
          return;
        }
        if (feynmanResult) {
          onNextActivity();
        } else {
          onCheckAnswer();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [field1, field2, feynmanResult, isEvaluating, onCheckAnswer, onNextActivity, pushStageToAnki]);

  // Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z : undo / redo the stage's scaffold fields.
  // Runs even when focus is inside a textarea (prevents double-nesting the
  // browser's own undo which would fight the reducer's history).
  useEffect(() => {
    if (!onUndoFields && !onRedoFields) return;
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === 'z' || e.key === 'Z' || e.key === 'y' || e.key === 'Y') {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
          // Only intercept for our own scaffold fields; leave other inputs alone.
          const el = e.target as HTMLElement;
          if (!el.dataset?.dgField) return;
        }
        e.preventDefault();
        if ((e.key === 'z' || e.key === 'Z') && e.shiftKey) {
          onRedoFields?.();
        } else if (e.key === 'y' || e.key === 'Y') {
          onRedoFields?.();
        } else {
          onUndoFields?.();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onUndoFields, onRedoFields]);

  // Native Speech-to-Text handler
  const toggleSpeechRecognition = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      playSound('pop');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Try Chrome or Safari.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        playSound('success');
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript.trim()) {
          setField2((prev: string) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('Speech recognition start failed:', err);
      setIsListening(false);
    }
  };

  // Live compiled RemNote Markdown for Zone 3
  const liveRemNote = useMemo(() => {
    try {
      const mergedResponses = {
        ...userResponses,
        ...(currentActivity ? {
          [currentActivity.id]: {
            ...userResponses[currentActivity.id],
            field1,
            field2,
            field3,
            selectedPreset,
            feynmanReview: feynmanResult || undefined
          }
        } : {})
      };
      return generateRemnoteHierarchy({
        topicSummary,
        activities,
        userResponses: mergedResponses,
      });
    } catch {
      return { markdown: '', cardCount: 0 };
    }
  }, [topicSummary, activities, userResponses, currentActivity, field1, field2, field3, selectedPreset, feynmanResult]);

  const handleCopyRemNote = async () => {
    if (!liveRemNote.markdown) return;
    try {
      await navigator.clipboard.writeText(liveRemNote.markdown);
      setCopiedRemNote(true);
      playSound('success');
      setTimeout(() => setCopiedRemNote(false), 2500);
    } catch {
      console.warn('Clipboard write failed');
    }
  };

  // ─── Crystallization: the cards are the exhaust, not the engine ──────────
  // Nothing is asked of the flashcard until the mechanism has landed. At that
  // point the cards are read straight off the same fields the exporter ships,
  // so the preview is the deck, not a decorative copy of it.
  const crystalCards = useMemo(() => {
    if (!currentActivity || !feynmanResult?.secured) return [];
    const response: StageResponse = {
      ...(userResponses[currentActivity.id] || { field1: '', field2: '' }),
      field1: field1.trim(),
      field2: field2.trim(),
      field3: field3.trim() || undefined,
      skipped: false,
    };
    try {
      return sanitizeExtracted(
        extractStageAnkiCards(currentActivity, response, currentActivityIndex, topicSummary)
      ).cards;
    } catch {
      return [];
    }
  }, [currentActivity, currentActivityIndex, field1, field2, field3, feynmanResult, topicSummary, userResponses]);

  /** Card text is previewed as plain text: the cloze markers stay visible. */
  const stripCardTags = (s: string) => s.replace(/<[^>]*>/g, '');

  const submitProbeAnswer = () => {
    const answer = probeDraft.trim();
    if (!answer) return;
    // Their answer joins their own mechanism sentence: a two-word commit is
    // still a generated link, and it is what the card will carry.
    setField2((prev: string) => (prev.trim() ? `${prev.trim()} ${answer}` : answer));
    setProbeDraft('');
    setProbeCommittedKey(probeKey);
    playSound('success');
  };


  // Text with fluff phrases struck through
  const processedSourceText = useMemo(() => {
    if (!fluffStripperActive || !rawNotes) return rawNotes;
    let result = rawNotes;
    for (const pattern of FLUFF_PATTERNS) {
      result = result.replace(pattern, '~~$1~~');
    }
    return result;
  }, [rawNotes, fluffStripperActive]);

  if (!currentActivity) return null;

  const mobileTabs: { id: 'source' | 'forge' | 'remnote'; label: string }[] = [
    { id: 'source', label: 'Source' },
    { id: 'forge', label: 'Forge' },
    { id: 'remnote', label: 'Export' },
  ];

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Mobile Tab Switcher : sticky so the zone state stays visible while
          scrolling long forge content on small screens. */}
      <div
        className="flex lg:hidden bg-deck/95 border border-edge/70 rounded-full p-1 gap-1 sticky top-2 z-10 shadow-panel"
        role="group"
        aria-label="Workbench zones"
      >
        {mobileTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={mobileTab === t.id}
            onClick={() => setMobileTab(t.id)}
            className={`flex-1 min-h-[40px] px-2 text-xs rounded-full transition-colors duration-150 ${
              mobileTab === t.id
                ? 'bg-gradient-to-b from-amber-400 to-amber-600 text-inset font-semibold shadow-gilt'
                : 'text-slate-ink hover:text-bone'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 3-Zone Desktop Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        
        {/* ========================================================= */}
        {/* ZONE 1: THE SOURCE DOCK (LEFT 3 COLS)                     */}
        {/* ========================================================= */}
        <div
          data-testid="workbench-zone-source"
          className={`lg:col-span-3 lg:sticky lg:top-4 flex-col gap-3 ${mobileTab === 'source' ? 'flex' : 'hidden lg:flex'}`}
        >
          <div className="bg-deck border border-edge/70 rounded-2xl shadow-panel p-4 flex flex-col max-h-[82vh] max-h-[82dvh] overflow-hidden">
            {/* Zone 1 Header */}
            <div className="flex items-center justify-between gap-3 pb-3 mb-3">
              <ZoneLabel>Source</ZoneLabel>
              
              {/* Fluff Stripper Button */}
              {rawNotes && (
                <ToolToggle
                  active={fluffStripperActive}
                  onClick={() => {
                    setFluffStripperActive(!fluffStripperActive);
                    playSound('pop');
                  }}
                  title="Cross out textbook filler phrases"
                >
                  {fluffStripperActive ? 'Fluff hidden' : 'Strip fluff'}
                </ToolToggle>
              )}
            </div>

            {/* Zone 1 Body */}
            <div className="overflow-y-auto flex-1 pr-1 space-y-3 text-sm leading-relaxed text-slate-ink">
              {youtubeData && (
                <div className="space-y-2">
                  <div className="aspect-video overflow-hidden bg-inset border border-edge rounded-md">
                    <iframe
                      src={`https://www.youtube-nocookie.com/embed/${youtubeData.videoId}?rel=0${chapterSeconds !== null ? `&autoplay=1&start=${chapterSeconds}` : ''}`}
                      title={youtubeData.title}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                  <p className="font-medium text-bone text-xs truncate">{youtubeData.title}</p>
                  {/* Chapter progress: which chapters are encoded, and where to pick up. */}
                  <ChapterRail
                    activities={activities}
                    responses={userResponses}
                    currentIndex={currentActivityIndex}
                    onJump={jumpToChapter}
                  />
                </div>
              )}

              {uploadedFile && (
                <div className="p-2.5 bg-inset border border-edge rounded-md flex items-center gap-2.5">
                  <span className="font-mono text-[10px] font-semibold text-amber-300 uppercase tracking-wider shrink-0">File</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-bone truncate text-xs">{uploadedFile.name}</p>
                    <span className="text-[10px] font-mono text-solder">{(uploadedFile.size / 1024).toFixed(0)} KB</span>
                  </div>
                </div>
              )}

              {rawNotes ? (
                /* break-words: this dock is ~240px wide and holds arbitrary
                   source text. One unbreakable token (a share URL, a hash, a
                   long compound) used to push the text to its own scrollWidth
                   inside a 240px box, so the panel clipped it at the right
                   edge behind a horizontal scrollbar. */
                <div className="font-sans whitespace-pre-wrap break-words select-text text-slate-ink">
                  {fluffStripperActive ? (
                    processedSourceText.split('~~').map((segment, idx) => (
                      idx % 2 === 1 ? (
                        <span key={idx} className="line-through text-solder">
                          {segment}
                        </span>
                      ) : (
                        <span key={idx}>{segment}</span>
                      )
                    ))
                  ) : (
                    rawNotes
                  )}
                </div>
              ) : !youtubeData && !uploadedFile ? (
                <p className="text-solder text-xs italic">No external source attached.</p>
              ) : null}
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* ZONE 2: THE FORGE (CENTER 6 COLS)                         */}
        {/* ========================================================= */}
        <div
          data-testid="workbench-zone-forge"
          className={`lg:col-span-6 flex-col gap-3 ${mobileTab === 'forge' ? 'flex' : 'hidden lg:flex'}`}
        >
          <div className="bg-deck border border-edge/70 rounded-2xl shadow-panel p-5 sm:p-6 space-y-5">

            {/* Stage Progression header */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="shrink-0 px-2.5 py-1 bg-inset border border-edge/70 rounded-full text-[11px] font-mono font-semibold text-amber-300">
                  {String(currentActivityIndex + 1).padStart(2, '0')}/{String(activities.length).padStart(2, '0')}
                </span>
                <span className="font-display text-[19px] leading-tight text-bone truncate">
                  {currentActivity.title}
                </span>
              </div>

              <span
                className="shrink-0 text-[11px] font-mono font-semibold text-amber-200 border border-gilt/40 bg-amber-500/10 px-2.5 py-1 rounded-full"
                title="Consecutive mastered stages"
              >
                ×{combo}
              </span>
            </div>

            {/* Stage ticker : one jewel per stage. This was a row of full-width
                bars, which just added another horizontal stripe to the page. */}
            <div className="flex items-center gap-2 -mt-2 flex-wrap">
              {activities.map((_, i) => {
                const done = i < currentActivityIndex;
                const current = i === currentActivityIndex;
                return (
                  <span
                    key={i}
                    title={`Stage ${i + 1}${done ? ' (completed)' : current ? ' (current)' : ''}`}
                    className={`h-1.5 rotate-45 transition-colors duration-150 ${
                      current
                        ? 'w-2.5 bg-gradient-to-br from-amber-300 to-amber-600'
                        : done
                          ? 'w-1.5 bg-signal-500/80'
                          : 'w-1.5 border border-edge/80'
                    }`}
                  />
                );
              })}
              <span className="text-[10px] font-mono text-solder ml-1.5 shrink-0">
                {currentActivityIndex + 1}/{activities.length}
              </span>
            </div>

            {/* THE PARADOX. Definitions are homework; contradictions are
                irresistible. The stage opens with the thing that cannot be
                true yet obviously is, so the mechanism gets solved rather
                than looked up. */}
            {currentActivity.paradox && (
              <div
                className="relative p-5 pl-6 bg-flux-950/25 border border-flux-500/35 rounded-2xl overflow-hidden"
                role="note"
                aria-label="The paradox this stage resolves"
                data-testid="stage-paradox"
              >
                <span
                  aria-hidden
                  className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-flux-300/80 to-flux-700/30"
                />
                <span className="block mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-flux-300">
                  How is this possible?
                </span>
                <p className="font-display text-[19px] leading-snug text-bone">
                  {currentActivity.paradox}
                </p>
              </div>
            )}

            {/* GEDANKENEXPERIMENT: run the extreme case in your head first.
                Tracking charges, forces and shapes is the encoding; reciting
                the name of the process is not. */}
            {currentActivity.gedankenexperiment && (
              <div
                className="p-4 bg-inset/70 border border-edge/60 rounded-2xl"
                data-testid="stage-gedanken"
              >
                <span className="block mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-amber-300">
                  Thought experiment · run it before you write a word
                </span>
                <p className="font-display text-[15px] italic leading-relaxed text-bone">
                  {currentActivity.gedankenexperiment}
                </p>
              </div>
            )}

            {/* YOUR TASK: the single most important line on the screen. */}
            {(() => {
              const meta = getTemplateDefinition(currentActivity.templateType || '');
              const challenge = currentActivity.visualData?.generationChallenge;
              const yourTask = challenge?.premisePrompt || currentActivity.prompt || meta?.learnerTask;
              if (!yourTask) return null;
              return (
                <div
                  className="p-5 bg-amber-500/[0.05] border border-gilt/35 rounded-2xl"
                  role="note"
                  aria-label="Your task for this stage"
                >
                  <span className="block mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-amber-300">
                    Your task
                  </span>
                  <p className="font-display text-[19px] leading-snug text-bone">
                    {yourTask}
                  </p>
                  {meta?.learnerBenefit && (
                    <p className="text-xs text-solder leading-relaxed mt-2">
                      <span className="text-amber-300/90 font-medium">Why this works: </span>
                      {meta.learnerBenefit}
                    </p>
                  )}
                  {meta?.learnerTask && challenge?.premisePrompt && meta.learnerTask !== challenge.premisePrompt && (
                    <p className="text-xs text-solder leading-relaxed mt-1">
                      <span className="text-amber-300/90 font-medium">To do: </span>
                      {meta.learnerTask}
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Target Concept Extract */}
            <div className="p-4 bg-inset/70 border border-edge/60 rounded-2xl text-sm text-slate-ink leading-relaxed">
              <span className="block mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-amber-300">
                Target mechanism
              </span>
              &ldquo;{currentActivity.contextSnippet}&rdquo;
            </div>

            {/* Taboo terms: the jargon this stage bans, flagged live as you type. */}
            <TabooStrip terms={tabooTerms} leaked={tabooLeaks} />

            {/* Interactive Visual Canvas / Storyboard / Sabotage */}
            <StageVisualRenderer
              activity={currentActivity}
              toyProgress={userResponses[currentActivity.id]?.toyModelProgress}
              onToyProgress={(progress) => onToyProgress?.(currentActivity.id, progress)}
              field1={field1}
              field2={field2}
              field3={field3}
              selectedPreset={selectedPreset}
              // Interactive completion: a template that blanked one of its own
              // cells hands the produced link back into the mechanism answer.
              onAdopt={(text) =>
                setField2((prev: string) => (prev.trim() ? `${prev.trim()} ${text}` : text))
              }
            />

            {/* Optional Dual-Coding Sketchpad Toggle + why-ladder */}
            {/* flex-wrap: six toggles overflow a ~360px viewport without it. */}
            <div className="flex flex-wrap justify-end gap-1.5">
              <ToolToggle
                active={showProbe}
                onClick={() => {
                  setShowProbe(!showProbe);
                  playSound('click');
                }}
                title="Climb the why-ladder: forces each claim down to the physical or mathematical property beneath it"
              >
                Probe deeper {showProbe ? 'on' : 'off'}
              </ToolToggle>
              <ToolToggle
                active={showInvert}
                onClick={() => {
                  setShowInvert(!showInvert);
                  playSound('click');
                }}
                title="Adversarial bug hunt: the examiner rigs a 4-step chain with exactly one fatal flaw. Find it and fix it"
              >
                Spot the flaw {showInvert ? 'on' : 'off'}
              </ToolToggle>
              <ToolToggle
                active={showPrime}
                onClick={() => {
                  setShowPrime(!showPrime);
                  playSound('click');
                }}
                title="Priming warm-up: pick the drill (draw the curve's shape, run the source→sink polarity check, assemble the units, or sweep a variable to its extremes) before trusting the formula"
              >
                Prime {showPrime ? 'on' : 'off'}
              </ToolToggle>
              <ToolToggle
                active={showSketchpad}
                onClick={() => setShowSketchpad(!showSketchpad)}
                title="Open the dual-coding sketchpad"
              >
                Sketchpad {showSketchpad ? 'on' : 'off'}
              </ToolToggle>
              <ToolToggle
                active={showSequence}
                onClick={() => {
                  setShowSequence(!showSequence);
                  playSound('click');
                }}
                title="Scrambled causal order: the examiner splits the mechanism into steps and shuffles them. Put the chain back in the order the physics forces, zero typing"
              >
                Order the chain {showSequence ? 'on' : 'off'}
              </ToolToggle>
              <ToolToggle
                active={isPushingAnki}
                onClick={() => void pushStageToAnki()}
                title="Push this stage's cards straight into Anki via AnkiConnect (Cmd/Ctrl+Shift+A), no downloads, no import dialogs"
              >
                {isPushingAnki ? 'Forging\u2026' : 'Anki push'}
              </ToolToggle>
            </div>

            {ankiStatus && (
              <div
                data-testid="anki-stage-status"
                className={`p-2.5 border text-[11px] leading-relaxed ${
                  ankiStatus.ok
                    ? 'bg-signal-950/40 border-signal/40 text-signal-300 font-mono'
                    : 'bg-hazard-950/40 border-hazard/40 text-hazard-300'
                }`}
              >
                {ankiStatus.text}
              </div>
            )}

            {showSketchpad && <SketchCanvas />}

            {showInvert && (
              <InvertedStepDrill
                key={currentActivity.id}
                activity={currentActivity}
                topicSummary={topicSummary}
                onFix={(oneSentenceFix) =>
                  setField2((prev: string) =>
                    prev.trim() ? `${prev.trim()} ${oneSentenceFix}` : oneSentenceFix
                  )
                }
              />
            )}

            {showPrime && (
              <PrimingWarmup
                key={currentActivity.id}
                activity={currentActivity}
                topicSummary={topicSummary}
                onAdopt={(rule) =>
                  setField2((prev: string) => (prev.trim() ? `${prev.trim()} ${rule}` : rule))
                }
              />
            )}

            {showSequence && (
              <CausalSequence
                key={currentActivity.id}
                activity={currentActivity}
                topicSummary={topicSummary}
                onAdopt={(text) =>
                  setField2((prev: string) => (prev.trim() ? `${prev.trim()} ${text}` : text))
                }
              />
            )}

            {showProbe && (
              <ProbeLadder
                key={currentActivity.id}
                activity={currentActivity}
                topicSummary={topicSummary}
                seed={[field1, field2, field3].map((f) => f.trim()).filter(Boolean).join(' ')}
                onAdopt={(axiom) => {
                  // The anchor slot is where a necessity belongs; stages without
                  // one get it appended to the mechanism answer instead.
                  if (currentActivity.scaffold.field3Label) {
                    setField3(axiom);
                  } else {
                    setField2((prev: string) => (prev.trim() ? `${prev.trim()} ${axiom}` : axiom));
                  }
                }}
              />
            )}

            {/* Undo / Redo for the stage fields (also Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y) */}
            {(onUndoFields || onRedoFields) && (
              <div className="flex items-center gap-1.5">
                <ToolToggle
                  active={false}
                  onClick={() => onUndoFields?.()}
                  title="Undo last edit (Ctrl/Cmd+Z)"
                >
                  <span className={!canUndo ? 'opacity-40' : ''}>Undo</span>
                </ToolToggle>
                <ToolToggle
                  active={false}
                  onClick={() => onRedoFields?.()}
                  title="Redo edit (Ctrl+Y or Ctrl/Cmd+Shift+Z)"
                >
                  <span className={!canRedo ? 'opacity-40' : ''}>Redo</span>
                </ToolToggle>
              </div>
            )}

            {/* Scaffold presentation: one connected sentence, or the classic boxes */}
            <div className="flex items-center justify-end gap-1.5">
              <ToolToggle
                active={stemMode}
                onClick={() => {
                  setStemMode(!stemMode);
                  playSound('click');
                }}
                title="Formula input: monospace typing plus a rendered preview of ASCII notation (r^{4}, ->, \\alpha, <=)"
              >
                Formula input {stemMode ? 'on' : 'off'}
              </ToolToggle>
              <ToolToggle
                active={scaffoldMode === 'sentence'}
                onClick={() => setScaffoldOverride(scaffoldMode === 'sentence' ? 'fields' : 'sentence')}
                title="Provide the syntax of the deduction as one sentence with blanks, or fall back to separate answer boxes"
              >
                {scaffoldMode === 'sentence' ? 'Sentence scaffold' : 'Separate boxes'}
              </ToolToggle>
            </div>

            {scaffoldMode === 'sentence' && causalFrame && (
              <>
                <CausalSentence
                  frame={causalFrame}
                  values={{ field1, field2, field3 }}
                  onChange={setFrameField}
                  onSubmit={onCheckAnswer}
                  isEvaluating={isEvaluating}
                />
                {/* The assembled sentence, rendered: confirms the notation and
                    the causal shape at a glance. */}
                {stemMode && (
                  <StemPreview value={frameToSentence(causalFrame, { field1, field2, field3 })} />
                )}
              </>
            )}

            {scaffoldMode === 'fields' && (
              <>
            {/* Scaffold Input 1 */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-ink uppercase tracking-widest block">
                {currentActivity.scaffold.field1Label}
              </label>
              <textarea
                value={field1}
                onChange={e => setField1(e.target.value)}
                placeholder={currentActivity.scaffold.field1Placeholder}
                rows={2}
                data-dg-field="field1"
                className={`w-full p-3 bg-inset border border-edge text-bone placeholder-solder text-sm leading-relaxed outline-none focus:border-amber-500/60 rounded-md resize-none transition-colors duration-150 ${stemMode ? 'font-mono' : 'font-sans'}`}
              />
              <StemPreview value={field1} />
              {field1.trim() && wordMeter(f1Words)}
            </div>

            {/* Scaffold Input 2 with Mic Button */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-slate-ink">
                  {currentActivity.scaffold.field2Label}
                </label>

                {/* Spoken Feynman Mic Button */}
                <ToolToggle
                  active={isListening}
                  onClick={toggleSpeechRecognition}
                  title="Speak your explanation out loud"
                >
                  {isListening ? '● Listening' : 'Speak it'}
                </ToolToggle>
              </div>

              <textarea
                value={field2}
                onChange={e => setField2(e.target.value)}
                placeholder={currentActivity.scaffold.field2Placeholder}
                rows={2}
                data-dg-field="field2"
                className={`w-full p-3 bg-inset border text-bone placeholder-solder text-sm leading-relaxed outline-none rounded-md resize-none transition-colors duration-150 ${
                  isListening ? 'border-hazard-500/70' : 'border-edge focus:border-amber-500/60'
                } ${stemMode ? 'font-mono' : 'font-sans'}`}
              />
              <StemPreview value={field2} />
              {field2.trim() && wordMeter(f2Words)}
            </div>

            {/* Scaffold Input 3 (if provided) */}
            {currentActivity.scaffold.field3Label && (
              <div className="space-y-1.5">
                <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-slate-ink">
                  {currentActivity.scaffold.field3Label}
                </label>
                <input
                  type="text"
                  value={field3}
                  onChange={e => setField3(e.target.value)}
                  placeholder={currentActivity.scaffold.field3Placeholder || ''}
                  data-dg-field="field3"
                  className={`w-full p-2.5 bg-inset border border-edge text-bone placeholder-solder text-sm outline-none focus:border-amber-500/60 rounded-md transition-colors duration-150 ${stemMode ? 'font-mono' : 'font-sans'}`}
                />
                <StemPreview value={field3} />
              </div>
            )}
              </>
            )}

            {/* Pre-check blurt guard */}
            {(() => {
              const bothFilled = field1.trim() && field2.trim();
              const totalWords = f1Words + f2Words;
              if (!bothFilled || totalWords >= 15) return null;
              return (
                <div className="p-3.5 bg-amber-500/[0.05] border border-gilt/25 rounded-xl text-xs text-slate-ink leading-relaxed">
                  <span className="text-amber-300 font-semibold">Short answer. </span>
                  This looks like a one-word blurt ({totalWords} words). Add a sentence or two. The examiner grades on mechanistic depth, and you&apos;ll encode it deeper that way.
                </div>
              );
            })()}

            {/* Inline difficulty rating */}
            {showDifficultyRating && (
              <div className="p-3.5 bg-inset/70 border border-gilt/25 rounded-xl">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-300">
                    How hard was stage 1?
                  </span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => {
                          onDifficultyRate(n);
                          playSound('pop');
                        }}
                        title={['Trivial', 'Light', 'Fair', 'Hard', 'Brutal'][n - 1]}
                        className={`w-7 h-7 text-xs font-semibold rounded-full border transition-colors duration-150 cursor-pointer ${
                          n >= 4
                            ? 'border-hazard-500/40 text-hazard-300 hover:bg-hazard-500/15'
                            : 'border-edge/70 text-slate-ink hover:border-gilt/50 hover:text-amber-300'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[10px] text-solder mt-1.5">
                  Calibrates the AI for the rest of this session.
                </p>
              </div>
            )}

            {/* Forge Navigation Footer.
                Deliberately NOT sticky: this card is far taller than the
                viewport, so a bottom-pinned bar floats over whatever the
                learner is reading or typing (measured: it covered field1 /
                field2 at ordinary scroll offsets). The actions live at the end
                of the deduction, where checking the answer belongs. */}
            <div className="bg-deck/95 flex items-center justify-between pt-4 pb-1 border-t border-edge/50 gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onPreviousActivity}
                  disabled={currentActivityIndex === 0}
                  aria-label="Previous stage"
                  className="px-3.5 py-2 text-xs text-slate-ink bg-inset border border-edge/70 rounded-full hover:text-bone hover:border-gilt/40 transition-colors duration-150 disabled:opacity-40 cursor-pointer"
                >
                  ←
                </button>

                {/* Regenerate stage */}
                <button
                  type="button"
                  onClick={() => onRegenerateStage()}
                  disabled={isRegenerating}
                  title="Regenerate this stage (lightweight model) : use when the stage doesn't fit you"
                  className="px-3.5 py-2 text-xs text-slate-ink bg-inset border border-edge/70 rounded-full hover:text-bone hover:border-gilt/40 transition-colors duration-150 disabled:opacity-40 cursor-pointer"
                >
                  {isRegenerating ? 'Regenerating…' : 'Regenerate'}
                </button>

                {/* Teach Me this stage */}
                <button
                  type="button"
                  onClick={onTeachStage}
                  title="Teach Me This: interactive lesson that teaches this stage's mechanism and walks the problem step-by-step"
                  className="px-3.5 py-2 text-xs text-flux-300 bg-flux-500/10 border border-flux-500/45 rounded-full hover:bg-flux-500/20 transition-colors duration-150 cursor-pointer"
                >
                  Teach me this
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onCheckAnswer}
                  disabled={isEvaluating || (!field1.trim() && !field2.trim())}
                  title="I'm done thinking. Check my answer with the examiner (Cmd/Ctrl+Enter)"
                  className={`px-5 py-2.5 text-xs font-semibold rounded-full transition-colors duration-150 disabled:opacity-40 cursor-pointer border ${
                    feynmanResult
                      ? 'bg-inset border-edge/70 text-slate-ink'
                      : 'bg-gradient-to-b from-amber-400 to-amber-600 border-amber-600/80 text-inset shadow-gilt hover:from-amber-300 hover:to-amber-500'
                  }`}
                >
                  {isEvaluating ? 'Checking…' : feynmanResult ? 'CHECKED. TRY AGAIN OR NEXT' : 'CHECK MY ANSWER'}
                </button>

                <button
                  type="button"
                  onClick={onSkipStage}
                  title="Skip for now. I'll come back: marked visibly so you can resume it later, no guilt"
                  className="px-3.5 py-2 text-xs text-solder bg-inset border border-edge/70 rounded-full hover:text-bone hover:border-gilt/40 transition-colors duration-150 cursor-pointer"
                >
                  Skip
                </button>

                <button
                  type="button"
                  onClick={onNextActivity}
                  disabled={!field1.trim() || !field2.trim()}
                  className="px-5 py-2.5 text-xs font-semibold rounded-full bg-gradient-to-b from-amber-400 to-amber-600 border border-amber-600/80 text-inset shadow-gilt transition-colors duration-150 disabled:opacity-40 disabled:shadow-none cursor-pointer hover:from-amber-300 hover:to-amber-500"
                >
                  {justMastered
                    ? (currentActivityIndex === activities.length - 1 ? 'MASTERED! FINISH →' : 'MASTERED! NEXT →')
                    : (currentActivityIndex === activities.length - 1 ? 'FINISH →' : 'NEXT →')}
                </button>
              </div>
            </div>

            {/* One-line note */}
            {setStageReflection && (
              <div className="space-y-1.5">
                <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-slate-ink">
                  What clicked? <span className="normal-case font-normal text-solder">(one line, in your own words, optional)</span>
                </label>
                <input
                  type="text"
                  value={stageReflection ?? ''}
                  onChange={e => setStageReflection(e.target.value)}
                  placeholder="The part that finally clicked for me was..."
                  data-dg-field="reflection"
                  className="w-full p-3 bg-inset border border-edge/70 text-bone placeholder-solder text-sm outline-none focus:border-amber-500/60 rounded-lg transition-colors duration-150 font-sans"
                />
              </div>
            )}

          </div>
        </div>

        {/* ========================================================= */}
        {/* ZONE 3: EXAMINER CONSOLE & REMNOTE STAGING (RIGHT 3 COLS) */}
        {/* ========================================================= */}
        <div
          data-testid="workbench-zone-examiner"
          className={`lg:col-span-3 lg:sticky lg:top-4 flex-col gap-3 ${mobileTab === 'remnote' ? 'flex' : 'hidden lg:flex'}`}
        >
          <div className="bg-deck border border-edge/70 rounded-2xl shadow-panel p-4 flex flex-col max-h-[82vh] max-h-[82dvh] overflow-hidden space-y-3.5">

            {/* Zone 3 Header & Strictness Rocker */}
            <div className="space-y-3 pb-3 border-b border-edge/50">
              <div className="flex items-center justify-between">
                <ZoneLabel>Examiner</ZoneLabel>
                <span className="text-[11px] font-mono text-solder">
                  {strictnessLevel === 'sherpa' ? 'gentle' : strictnessLevel === 'feynman' ? 'feynman' : 'viva'}
                </span>
              </div>

              {/* STRICTNESS: 3-position segmented control */}
              <div
                role="group"
                aria-label="Examiner strictness"
                className="flex bg-inset border border-edge/70 rounded-full p-1"
              >
                {([
                  { id: 'sherpa' as const, label: 'Sherpa', title: 'Encouraging guide. Nudges, never wounds' },
                  { id: 'feynman' as const, label: 'Feynman', title: 'Default. Grades the mechanism, not the wording' },
                  { id: 'viva' as const, label: 'Viva', title: 'Oral defense. Cross-examines every claim' },
                ]).map((lvl) => {
                  const active = strictnessLevel === lvl.id;
                  return (
                    <button
                      key={lvl.id}
                      type="button"
                      aria-pressed={active}
                      title={lvl.title}
                      onClick={() => {
                        setStrictnessLevel(lvl.id);
                        playSound('click');
                      }}
                      className={`flex-1 py-1.5 text-xs rounded-full transition-colors duration-150 ${
                        active
                          ? 'bg-gradient-to-b from-amber-400 to-amber-600 text-inset font-semibold shadow-gilt'
                          : 'text-slate-ink hover:text-bone'
                      }`}
                    >
                      {lvl.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Socratic Feedback & Jargon Alerts */}
            {feynmanResult && (
              <div className={`p-4 rounded-2xl border text-sm space-y-2.5 ${
                feynmanResult.secured
                  ? 'bg-signal-950/35 border-signal-500/35 text-bone'
                  : 'bg-inset/70 border-edge/60 text-slate-ink'
              }`}>
                <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.16em]">
                  <span className={feynmanResult.secured ? 'text-signal-300' : 'text-amber-300'}>
                    {feynmanResult.secured ? 'MENTAL MODEL SECURED' : 'ONE LINK STILL OPEN'}
                  </span>
                  <span className="text-solder uppercase tracking-wider">lab partner</span>
                </div>
                {feynmanResult.feedback ? (
                  <p className="leading-relaxed text-xs">{feynmanResult.feedback}</p>
                ) : null}

                {/* Delta feedback: what you nailed + the ONE missing causal step,
                    with an inline field that patches it straight into the
                    mechanism answer instead of making you rewrite everything. */}
                {feynmanResult.nailedIt && (
                  <div className="p-2.5 bg-signal-950/30 border border-signal-500/40 rounded-md text-xs text-signal-300 leading-relaxed">
                    <span className="font-semibold">You nailed: </span>
                    {feynmanResult.nailedIt}
                  </div>
                )}

                {/* The missing link arrives as a finished sentence, not as an
                    instruction to "write more". It is already in your voice. */}
                {feynmanResult.missingLink && (
                  <div className="p-2.5 bg-amber-500/[0.07] border border-amber-500/50 rounded-md text-xs text-bone leading-relaxed space-y-1">
                    <span className="font-semibold text-amber-300">
                      Your sentence, finished for you: </span>
                    {feynmanResult.missingLink}
                  </div>
                )}

                {/* The lab partner finishing your thought: one clause, your
                    voice, so you can say "yes, that is what I meant" and move on. */}
                {feynmanResult.sentenceFinisher && (
                  <div className="p-2.5 bg-inset border border-edge rounded-md text-xs text-slate-ink leading-relaxed">
                    <span className="font-semibold text-bone">Then that means... </span>
                    {feynmanResult.sentenceFinisher}
                  </div>
                )}

                {/* Jargon Buzzer */}
                {feynmanResult.jargonBuzzer && (
                  <div className="p-2.5 bg-hazard-950/40 border border-hazard-500/40 rounded-md text-xs text-hazard-300 leading-relaxed">
                    <span className="font-semibold">Jargon buzz: </span>
                    {feynmanResult.jargonBuzzer}
                  </div>
                )}

                {/* Oral Defense Probing Question */}
                {feynmanResult.vivaCrossExamination && (
                  <div className="p-3 bg-flux-950/30 border border-flux-500/35 rounded-xl text-xs text-flux-300 leading-relaxed">
                    <span className="font-semibold">Viva challenge: </span>
                    {feynmanResult.vivaCrossExamination}
                  </div>
                )}
              </div>
            )}

            {/* Insert-missing-link loop: one sentence, Enter, done. */}
            {feynmanResult && !feynmanResult.secured && !!feynmanResult.missingLink && (
              <div className="p-3.5 bg-inset/70 border border-gilt/30 rounded-xl space-y-2.5">
                <label
                  htmlFor="missing-link-input"
                  className="block font-mono text-[10px] uppercase tracking-[0.2em] text-amber-300"
                >
                  Patch the gap
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="missing-link-input"
                    type="text"
                    value={missingLinkDraft}
                    onChange={(e) => setMissingLinkDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        submitMissingLink();
                      }
                    }}
                    placeholder="[ Insert the missing link here, one sentence ]"
                    data-testid="missing-link-input"
                    className="flex-1 min-w-0 p-3 bg-chassis border border-edge/70 text-bone placeholder-solder text-xs outline-none focus:border-amber-500/60 rounded-lg transition-colors duration-150 font-sans"
                  />
                  <button
                    type="button"
                    onClick={submitMissingLink}
                    disabled={!missingLinkDraft.trim()}
                    className="px-4 py-2.5 text-xs font-semibold rounded-full bg-gradient-to-b from-amber-400 to-amber-600 border border-amber-600/80 text-inset shadow-gilt transition-colors duration-150 hover:from-amber-300 hover:to-amber-500 disabled:opacity-40 disabled:shadow-none cursor-pointer shrink-0"
                  >
                    Add
                  </button>
                </div>
                <p className="text-[10px] text-solder">
                  Enter appends it to your mechanism answer, no rewriting the whole paragraph.
                </p>
              </div>
            )}

            {/* THE PRESSURE TEST. One curious question that pushes the
                mechanism to its edge, and a two-word answer is a complete
                answer. Nothing here is scored. */}
            {feynmanResult?.counterProbe && (
              <div
                className="p-4 bg-flux-500/[0.06] border border-flux-500/35 rounded-xl space-y-2.5"
                data-testid="counter-probe"
              >
                <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-flux-300">
                  Pressure test
                </span>
                <p className="text-sm text-bone leading-relaxed">{feynmanResult.counterProbe}</p>
                {probeAnswerSent ? (
                  <p className="text-[11px] text-signal-300 font-mono">
                    Locked in. It is on the card.
                  </p>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={probeDraft}
                      onChange={(e) => setProbeDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          submitProbeAnswer();
                        }
                      }}
                      placeholder="Two words is a complete answer"
                      data-testid="counter-probe-input"
                      aria-label="Answer the pressure test"
                      className="flex-1 min-w-0 p-3 bg-chassis border border-edge/70 text-bone placeholder-solder text-xs outline-none focus:border-flux-500/60 rounded-lg transition-colors duration-150 font-sans"
                    />
                    <button
                      type="button"
                      onClick={submitProbeAnswer}
                      disabled={!probeDraft.trim()}
                      className="px-4 py-2.5 text-xs font-semibold rounded-full bg-flux-500 border border-flux-400/60 text-bone transition-colors duration-150 hover:bg-flux-400 disabled:opacity-40 cursor-pointer shrink-0"
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* CRYSTALLIZATION. The flashcard is the fossil record of an
                "aha", never the assignment: the cards only drop out once the
                mechanism has landed, and every word on them is a word the
                learner just reasoned through. */}
            {feynmanResult?.secured && (
              <div
                className="p-4 bg-signal-950/35 border border-signal-500/40 rounded-2xl space-y-3"
                data-testid="crystallized-cards"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-signal-300">
                    Mental model secured
                  </span>
                  <span className="text-[10px] font-mono text-solder">
                    {crystalCards.length} atomic card{crystalCards.length === 1 ? '' : 's'}
                  </span>
                </div>
                {crystalCards.length > 0 ? (
                  <ol className="space-y-1.5">
                    {crystalCards.map((c, i) => (
                      <li key={c.id} className="text-xs text-bone leading-relaxed">
                        <span className="font-mono text-solder mr-1">{i + 1}.</span>
                        {stripCardTags(c.front)}
                        <span className="text-solder"> to </span>
                        {stripCardTags(c.back)}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-xs text-solder leading-relaxed">
                    The mechanism is yours. Add a line or two of wording and the cards forge themselves.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => void pushStageToAnki()}
                  disabled={isPushingAnki || crystalCards.length === 0}
                  title="Inject these cards straight into Anki with Cmd/Ctrl+Enter"
                  className="w-full px-3 py-2 text-xs font-semibold rounded-md bg-signal-500 border border-signal-500 text-inset transition-colors duration-150 hover:bg-signal-400 disabled:opacity-40 cursor-pointer"
                >
                  {isPushingAnki ? 'Injecting...' : 'Inject into Anki  ⌘⏎'}
                </button>
              </div>
            )}

            {/* Contextual hint after a "needs work" grade */}
            {feynmanResult && !feynmanResult.secured && (
              <div className="p-3 bg-amber-500/[0.07] border border-amber-500/40 rounded-md text-xs text-slate-ink leading-relaxed">
                <span className="text-amber-300 font-semibold">Not quite yet. </span>
                {stageErrorAnalysis ? <>Checker noted: <em>{stageErrorAnalysis}</em>. </> : null}
                Try regenerating the stage with a different angle, or have it taught to you step by step.
              </div>
            )}

            {/* Teach-me fallback after 2 failed checks */}
            {(stageCheckCount ?? 0) >= 2 && !feynmanResult?.secured && (
              <div className="p-3.5 bg-amber-500/[0.07] border border-amber-500/50 rounded-md">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-amber-300 uppercase tracking-widest">
                    Teach me this stage
                  </span>
                  <span className="text-[10px] font-mono text-solder">check #{stageCheckCount}</span>
                </div>
                <p className="text-xs text-solder leading-relaxed mb-2.5">
                  You&apos;ve checked this stage {stageCheckCount} times without mastering it. A step-by-step lesson often unsticks what another attempt can&apos;t.
                </p>
                <button
                  type="button"
                  onClick={onTeachStage}
                  className="px-3.5 py-2 bg-amber-500 text-inset text-xs font-semibold rounded-md hover:bg-amber-400 transition-colors duration-150 cursor-pointer"
                >
                  Start lesson
                </button>
              </div>
            )}

            {/* Live RemNote Output Preview & Card Smoke Test */}
            <div className="flex-1 flex flex-col space-y-2 overflow-hidden">
              <div className="flex items-center justify-between gap-2">
                <ZoneLabel>RemNote staging</ZoneLabel>

                {/* Smoke Test Cloze Masking Toggle */}
                <ToolToggle
                  active={smokeTestActive}
                  onClick={() => {
                    setSmokeTestActive(!smokeTestActive);
                    setRevealedSmokeClozes({});
                    playSound('click');
                  }}
                  title="Hide clozes to smoke-test your cards before copying"
                >
                  {smokeTestActive ? 'Clozes masked' : 'Smoke test'}
                </ToolToggle>
              </div>

              {/* Live Preview Box with Cloze Masking Support */}
              <div className="flex-1 overflow-y-auto bg-inset p-3 border border-edge rounded-md font-mono text-[11px] text-bone leading-relaxed whitespace-pre-wrap break-words select-all">
                {smokeTestActive && liveRemNote.markdown ? (
                  liveRemNote.markdown.split(/(\{\{.*?\}\})/).map((part, i) => {
                    if (part.startsWith('{{') && part.endsWith('}}')) {
                      const inner = part.slice(2, -2);
                      const isRevealed = revealedSmokeClozes[i];
                      return (
                        <span
                          key={i}
                          onClick={() => {
                            setRevealedSmokeClozes(prev => ({ ...prev, [i]: !prev[i] }));
                            playSound('pop');
                          }}
                          className={`cursor-pointer px-1.5 py-0.5 rounded transition-colors duration-150 ${
                            isRevealed
                              ? 'bg-deck border border-edge text-bone'
                              : 'bg-amber-500/20 border border-amber-500/60 text-amber-200 font-semibold'
                          }`}
                        >
                          {isRevealed ? inner : '[ ? ]'}
                        </span>
                      );
                    }
                    return <span key={i}>{part}</span>;
                  })
                ) : (
                  liveRemNote.markdown || '// Start deducing stages to see your live RemNote hierarchy compile here...'
                )}
              </div>

              {/* 1-Click Copy RemNote Button */}
              <button
                type="button"
                onClick={handleCopyRemNote}
                className={`w-full py-2.5 px-3 text-xs font-semibold rounded-md border transition-colors duration-150 cursor-pointer ${
                  copiedRemNote
                    ? 'bg-signal-500 border-signal-500 text-inset'
                    : 'bg-inset border-edge text-bone hover:border-amber-500/60'
                }`}
              >
                {copiedRemNote ? 'Copied' : 'Copy into RemNote'}
              </button>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
