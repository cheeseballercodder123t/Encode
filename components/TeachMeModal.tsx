'use client';

import React, { useMemo, useState } from 'react';
import { BracketTag } from '@/components/ui/BracketTag';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity,
  AISettings,
  DEFAULT_TEACH_OPTIONS,
  EncodingMode,
  LessonSegment,
  ResearchContextItem,
  StageResponse,
  TeachLesson,
  TeachLessonOptions,
  TeachScope,
  UploadedFileAsset,
} from '@/lib/types';
import { sanitizeLesson } from '@/lib/services/teachLesson';
import {
  SavedTeachLesson,
  deleteSavedTeachLesson,
  describeSavedTeachLesson,
  findSavedTeachLesson,
  loadSavedTeachLessons,
  nowTimestamp,
  saveTeachLesson,
  teachLessonId,
} from '@/lib/teach-lessons';
import { playSound } from '@/lib/audio';
import { ConceptBody, MemoryHookBody, StoryBody } from './TeachSegments';
import { GuidedProblemBody, YouTryBody } from './TeachGuided';
import { TeachFinishPanel, TeachSegmentBody } from './TeachInteractive';
import { useModalA11y } from '@/hooks/useModalA11y';

interface TeachMeModalProps {
  isOpen: boolean;
  onClose: () => void;
  scope: TeachScope;
  topicSummary: string;
  mode: EncodingMode;
  notes?: string;
  file?: UploadedFileAsset | null;
  activities?: Activity[];
  stageIndex?: number;
  userResponses?: Record<string, StageResponse>;
  researchContexts?: ResearchContextItem[];
  settings: AISettings;
  onAwardXP?: (xp: number) => void;
  /**
   * Hand the finished lesson to the encoder. Encoding is intentionally NOT part
   * of the lesson: the lesson ends, and then the learner picks this or
   * "save it for later".
   */
  onStartEncoding?: (lesson: TeachLesson) => void;
}

const STYLE_META: { id: TeachLessonOptions['style']; label: string; blurb: string }[] = [
  { id: 'brilliant', label: 'Brilliant', blurb: 'Scenario hooks, puzzle pulses, then a real problem' },
  { id: 'socratic', label: 'Socratic', blurb: 'Question-by-question, you discover the mechanism' },
  { id: 'storyteller', label: 'Storyteller', blurb: 'The mechanism becomes a plot with stakes' },
  { id: 'professor', label: 'Professor', blurb: 'Crisp lecture : define, motivate, solve, test' },
  { id: 'meme', label: 'Meme Brainrot', blurb: 'Absurd & funny. Accuracy still sacred' },
];

const DETAIL_META: { id: TeachLessonOptions['detail']; label: string; blurb: string }[] = [
  { id: 'standard', label: 'Standard', blurb: 'One pass per idea: teach, trap, produce' },
  { id: 'deep', label: 'Deep', blurb: 'Concept + deep dive + trap + two worked problems' },
  { id: 'exhaustive', label: 'Exhaustive', blurb: 'Three passes per idea, transfer problems, full glossary' },
];

const BOOL_TOGGLES: [keyof TeachLessonOptions, string, string][] = [
  ['storyMode', 'STORY MODE', 'Wrap the lesson in a narrative world'],
  ['includeAnalogy', 'ANALOGY ENGINE', 'Weave familiar-domain analogies in'],
  ['includeMemoryHooks', 'MEMORY HOOKS', 'Chants / pegs / palace glue'],
  ['allowFreeResponse', 'FREE RESPONSE', 'Typing beats multiple choice'],
];

const OPTIONS_STORAGE_KEY = 'encode.teachme.options.v1';

function loadSavedOptions(): TeachLessonOptions {
  try {
    if (typeof window === 'undefined') return { ...DEFAULT_TEACH_OPTIONS };
    const raw = localStorage.getItem(OPTIONS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_TEACH_OPTIONS };
    return { ...DEFAULT_TEACH_OPTIONS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_TEACH_OPTIONS };
  }
}

export function TeachMeModal(props: TeachMeModalProps) {
  const {
    isOpen, onClose, scope, topicSummary, mode, notes, file,
    activities = [], stageIndex = 0, userResponses = {}, researchContexts = [],
    settings, onAwardXP, onStartEncoding,
  } = props;

  const [options, setOptions] = useState<TeachLessonOptions>(loadSavedOptions);
  const [phase, setPhase] = useState<'options' | 'loading' | 'playing'>('options');
  const [lesson, setLesson] = useState<TeachLesson | null>(null);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [totalXpEarned, setTotalXpEarned] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [showGlossary, setShowGlossary] = useState(false);
  const [parkedAt, setParkedAt] = useState<number | null>(null);
  // Bumped whenever the saved-lesson library changes so the pre-roll list and
  // the "resume" slot recompute without an effect (localStorage is a read).
  const [libraryTick, setLibraryTick] = useState(0);

  const targetActivity = scope === 'stage' ? activities[stageIndex] ?? null : null;
  const totalSegments = lesson ? lesson.segments.length : 0;
  const currentSeg = lesson?.segments[segmentIndex];
  /** The slot this lesson occupies in the saved-lesson library. */
  const slotTopic =
    (scope === 'stage' && targetActivity ? targetActivity.title : topicSummary) || 'Untitled Lesson';
  const slotId = teachLessonId(scope, slotTopic);

  const savedLibrary = useMemo<SavedTeachLesson[]>(
    () => (isOpen ? loadSavedTeachLessons() : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- libraryTick is the invalidation signal
    [isOpen, libraryTick]
  );
  const resumable = useMemo(
    () => (isOpen ? findSavedTeachLesson(scope, slotTopic) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- libraryTick is the invalidation signal
    [isOpen, libraryTick, scope, slotTopic]
  );



  const persistOptions = (next: TeachLessonOptions) => {
    setOptions(next);
    try { localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const updateOpt = <K extends keyof TeachLessonOptions>(key: K, value: TeachLessonOptions[K]) => {
    persistOptions({ ...options, [key]: value } as TeachLessonOptions);
  };

  const resetLessonState = () => {
    setPhase('options');
    setLesson(null);
    setSegmentIndex(0);
    setTotalXpEarned(0);
    setStreak(0);
    setBestStreak(0);
    setErrorMsg('');
    setShowGlossary(false);
    setParkedAt(null);
  };

  /**
   * Parks the current lesson in the saved-lesson library. `keep = false`
   * discards this slot instead (used by the explicit "exit without saving"),
   * so a finished lesson never lingers as a stale half-done entry.
   */
  const parkLesson = (keep = true) => {
    if (!lesson) return;
    if (!keep) {
      deleteSavedTeachLesson(slotId);
      setLibraryTick((t) => t + 1);
      return;
    }
    const entry: SavedTeachLesson = {
      id: slotId,
      savedAt: nowTimestamp(),
      scope,
      topic: slotTopic,
      stageIndex,
      lesson,
      segmentIndex,
      xpEarned: totalXpEarned,
      bestStreak,
      completed: totalSegments > 0 && segmentIndex >= totalSegments - 1,
    };
    saveTeachLesson(entry);
    setLibraryTick((t) => t + 1);
  };

  const handleClose = () => {
    // Never lose a lesson: closing mid-lesson parks the progress so it can be
    // resumed. The end-of-lesson panel makes the choice explicit instead.
    if (lesson) parkLesson(true);
    onClose();
    resetLessonState();
  };

  // Esc closes, the page behind stops scrolling, focus moves in and back out.
  const sheetRef = useModalA11y(isOpen, handleClose);

  if (!isOpen) return null;

  /** "SAVE IT FOR LATER": park the finished lesson and stay on the panel. */
  const handleSaveForLater = () => {
    playSound('success');
    parkLesson(true);
    setParkedAt(nowTimestamp());
  };

  /** "START ENCODING": hand the lesson over, then close. */
  const handleStartEncoding = () => {
    playSound('success');
    const finished = lesson;
    onClose();
    resetLessonState();
    if (finished) onStartEncoding?.(finished);
  };

  const handleResume = (entry: SavedTeachLesson) => {
    playSound('pop');
    setLesson(entry.lesson);
    setSegmentIndex(Math.min(entry.segmentIndex, Math.max(0, entry.lesson.segments.length - 1)));
    setTotalXpEarned(entry.xpEarned || 0);
    setBestStreak(entry.bestStreak || 0);
    setStreak(0);
    setErrorMsg('');
    setParkedAt(entry.savedAt);
    setPhase('playing');
  };

  const handleDiscardSaved = (id: string) => {
    playSound('click');
    deleteSavedTeachLesson(id);
    setLibraryTick((t) => t + 1);
  };

  const handleGenerate = async () => {
    setPhase('loading');
    setErrorMsg('');
    playSound('click');
    try {
      const res = await fetch('/api/teach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicSummary, mode, scope, notes, file,
          activities: scope === 'notes' ? [] : activities,
          stageIndex, userResponses, researchContexts, options, settings,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Lesson generation failed');
      }
      const data = await res.json();
      const safe = sanitizeLesson(data);
      if (safe && safe.segments.length > 0) {
        setLesson(safe);
        setSegmentIndex(0);
        setTotalXpEarned(0);
        setStreak(0);
        setBestStreak(0);
        setParkedAt(null);
        setPhase('playing');
        playSound('pop');
      } else {
        throw new Error('Lesson came back empty');
      }
    } catch (err: any) {
      console.error('TeachMe error', err);
      setPhase('options');
      setErrorMsg(err?.message || 'Failed to generate lesson. Please check your AI settings.');
      playSound('error');
    }
  };

  const award = (xp: number) => {
    setTotalXpEarned((prev) => prev + xp);
    if (xp > 0 && onAwardXP) onAwardXP(xp);
  };

  const markCorrect = (seg: LessonSegment) => {
    award(seg.xpValue || 0);
    setStreak((s) => {
      setBestStreak((b) => Math.max(b, s + 1));
      return s + 1;
    });
    playSound('success');
  };

  const markWrong = () => {
    setStreak(0);
    playSound('error');
  };

  const goNext = () => {
    if (segmentIndex + 1 < totalSegments) setSegmentIndex(segmentIndex + 1);
  };

  const renderSegmentBody = (seg: LessonSegment) => {
    const cb = { onCorrect: markCorrect, onWrong: markWrong, onNext: goNext };
    const isLast = segmentIndex >= totalSegments - 1;
    // Non-interactive segments that carry only text still get the depth blocks.
    if (seg.type === 'concept') return <ConceptBody seg={seg} {...cb} />;
    if (seg.type === 'memoryHook') return <MemoryHookBody seg={seg} {...cb} />;
    if (seg.type === 'storyBeat') return <StoryBody seg={seg} {...cb} />;
    if (seg.type === 'guidedProblem') return <GuidedProblemBody seg={seg} {...cb} />;
    if (seg.type === 'youTry') return <YouTryBody seg={seg} {...cb} />;
    return <TeachSegmentBody key={seg.id} seg={seg} isLast={isLast} {...cb} />;
  };

  /** The single end-of-lesson exit panel: hand off, or park it. */
  const renderFinishPanel = () => (
    <TeachFinishPanel
      lesson={lesson}
      isLast
      totalXpEarned={totalXpEarned}
      bestStreak={bestStreak}
      savedAt={parkedAt}
      savedCount={lesson?.encodingSeeds?.length || 0}
      onStartEncoding={handleStartEncoding}
      onSaveForLater={handleSaveForLater}
      onClose={() => { parkLesson(false); onClose(); resetLessonState(); }}
    />
  );

  const renderSavedLibrary = () => {
    // The resumable slot has its own banner above; listing it twice reads as
    // two different lessons.
    const others = savedLibrary.filter((e) => e.id !== resumable?.id);
    if (others.length === 0) return null;
    return (
      <div className="p-3 bg-deck border border-edge/50 space-y-2" data-testid="teach-saved-library">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono font-bold text-solder uppercase tracking-wider">
            Saved lessons ({others.length})
          </span>
          <span className="text-[10px] font-mono text-solder">resume where you stopped</span>
        </div>
        <div className="space-y-1.5">
          {others.slice(0, 4).map((entry) => (
            <div key={entry.id} className="flex items-center gap-2 p-2 bg-chassis border border-edge/40">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-mono font-bold text-bone truncate">{entry.lesson.title}</p>
                <p className="text-[10px] font-mono text-solder truncate">{describeSavedTeachLesson(entry)}</p>
              </div>
              <button
                type="button"
                onClick={() => handleResume(entry)}
                className="px-2.5 py-1.5 bg-amber border border-amber text-chassis text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer"
              >
                Resume
              </button>
              <button
                type="button"
                onClick={() => handleDiscardSaved(entry.id)}
                aria-label={`Discard saved lesson ${entry.lesson.title}`}
                className="px-2 py-1.5 bg-chassis border border-edge text-solder hover:text-hazard text-[10px] font-mono font-bold uppercase cursor-pointer"
              >
                Drop
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderOptions = () => (
    <div className="p-5 space-y-4">
      <div className="p-3 bg-deck border border-edge/40 text-xs text-bone leading-relaxed">
        <p className="font-bold text-bone text-[11px] flex items-center gap-1.5">
          <span className="text-flux font-bold font-mono">[ AI ]</span>
          Lesson Pre-Roll: how should I teach?
        </p>
        <p className="text-solder mt-1">
          Style, depth, pacing and humor are all <span className="text-flux-300">soft preferences</span>, and the AI
          is free to override them if a better pedagogy occurs to it. Every lesson teaches the concept, deepens it
          with the causal why and the traps, walks you through real problems, then hands you
          {' '}<span className="text-flux-300">ready-to-encode prompts</span>. Encoding is a separate step: at the end
          you either <span className="text-amber">start encoding</span> or <span className="text-amber">save it for
          later</span>.
        </p>
      </div>

      {resumable && (
        <div className="p-3 bg-amber/10 border border-amber/40 flex items-center justify-between gap-3" data-testid="teach-resume-banner">
          <div className="min-w-0">
            <p className="text-[11px] font-mono font-bold text-amber uppercase tracking-wider">Lesson in progress</p>
            <p className="text-[11px] font-mono text-bone truncate">
              {resumable.lesson.title} — {describeSavedTeachLesson(resumable)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleResume(resumable)}
            className="shrink-0 px-3 py-2 bg-amber border border-amber text-chassis text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer"
          >
            [ RESUME ]
          </button>
        </div>
      )}

      <Label>Teaching Style</Label>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1.5">
        {STYLE_META.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => updateOpt('style', s.id)}
            title={s.blurb}
            className={`px-2 py-1.5 text-left border transition-none cursor-pointer text-[10px] font-mono font-bold uppercase tracking-wider ${
              options.style === s.id ? 'bg-flux border-flux text-bone' : 'bg-chassis border-edge text-solder'
            }`}
          >
            [ {s.label.toUpperCase()} ]
          </button>
        ))}
      </div>

      <Label>Level of Detail</Label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
        {DETAIL_META.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => updateOpt('detail', d.id)}
            title={d.blurb}
            className={`px-2.5 py-2 text-left border transition-none cursor-pointer ${
              options.detail === d.id ? 'bg-amber border-amber text-chassis' : 'bg-chassis border-edge text-solder'
            }`}
          >
            <span className="block text-[10px] font-mono font-bold uppercase tracking-wider">
              [ {d.label.toUpperCase()} ]
            </span>
            <span className="block text-[10px] font-mono mt-0.5 leading-snug opacity-90">{d.blurb}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {BOOL_TOGGLES.map(([key, label, tip]) => (
          <button
            key={key}
            type="button"
            onClick={() => updateOpt(key, !options[key])}
            title={tip}
            className={`px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider border transition-none cursor-pointer ${
              options[key] ? 'bg-deck border-flux text-bone' : 'bg-chassis border-edge text-solder'
            }`}
          >
            [ {label}: {options[key] ? 'ON' : 'OFF'} ]
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <SliderRow label="Checkpoints" min={1} max={8} value={options.checkpoints} onChange={(v) => updateOpt('checkpoints', v)} />
        <SliderRow label="Concept Layers (1-3)" min={1} max={3} value={options.lessonDepth} onChange={(v) => updateOpt('lessonDepth', v)} />
        <SliderRow label="Humor (0-5)" min={0} max={5} value={options.humor} onChange={(v) => updateOpt('humor', v)} />
        <SliderRow label="Max Segments (4-40)" min={4} max={40} value={options.maxSteps} onChange={(v) => updateOpt('maxSteps', v)} />
      </div>

      <Label>Difficulty</Label>
      <div className="flex flex-wrap gap-1.5">
        {(['intro', 'standard', 'viva'] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => updateOpt('difficulty', d)}
            className={`px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider border transition-none cursor-pointer ${
              options.difficulty === d ? 'bg-flux border-flux text-bone' : 'bg-chassis border-edge text-solder'
            }`}
          >
            {d === 'intro' ? 'INTRO' : d === 'standard' ? 'STANDARD' : 'VIVA ORAL DEFENSE'}
          </button>
        ))}
      </div>

      {renderSavedLibrary()}

      <div className="flex items-center justify-between gap-3 pt-1">
        <button type="button" onClick={handleClose} className="px-4 py-2 bg-inset text-bone text-xs font-bold">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleGenerate}
          className="flex items-center gap-2 px-6 py-2.5 bg-flux border border-flux text-bone text-xs font-mono font-bold uppercase tracking-wider transition-colors duration-150 cursor-pointer hover:bg-flux-400 hover:border-flux-400"
        >
          <BracketTag label="GO" tone="" />
          <span>Generate Lesson</span>
        </button>
      </div>
      {errorMsg && <p className="text-[10px] text-hazard font-mono">{errorMsg}</p>}
    </div>
  );

  const renderLoading = () => (
    <div className="p-8 flex flex-col items-center gap-4">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
        className="w-12 h-12 border-2 border-flux border-t-transparent rounded-full"
      />
      <p className="text-xs text-bone font-mono uppercase tracking-wider">
        {scope === 'stage' && targetActivity
          ? 'Teaching this stage from the mechanism up...'
          : 'Authoring your interactive lesson...'}
      </p>
      <p className="text-[10px] text-solder font-mono">
        concept → deep dive → trap → guided problem → your turn → teach it back → transfer.
      </p>
    </div>
  );

  const renderIntro = (activeLesson: TeachLesson, firstSeg: boolean) => {
    const hasIntro = Boolean(activeLesson.intro?.hook || activeLesson.intro?.whyItMatters);
    const objectives = activeLesson.objectives || [];
    if (!firstSeg || (!hasIntro && objectives.length === 0)) return null;
    return (
      <div className="bg-deck border border-amber/25 p-3.5 space-y-2" data-testid="teach-intro">
        {activeLesson.intro?.hook && (
          <p className="text-xs text-amber font-mono leading-relaxed">{activeLesson.intro.hook}</p>
        )}
        {activeLesson.intro?.whyItMatters && (
          <p className="text-[11px] text-bone font-mono leading-relaxed">
            <span className="text-solder uppercase tracking-wider">Why it matters </span>
            {activeLesson.intro.whyItMatters}
          </p>
        )}
        {objectives.length > 0 && (
          <div className="space-y-1">
            <span className="text-[10px] font-mono font-bold text-solder uppercase tracking-wider">
              By the end you will be able to
            </span>
            <ul className="space-y-0.5">
              {objectives.map((o, i) => (
                <li key={i} className="text-[11px] font-mono text-bone leading-relaxed flex gap-1.5">
                  <span className="text-amber">›</span>
                  <span>{o}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {(activeLesson.glossary?.length || 0) > 0 && (
          <span className="inline-block text-[10px] font-mono text-solder">
            {activeLesson.glossary!.length} terms in the glossary ·{' '}
            {'~'}{activeLesson.estimatedMin ?? 10} min
          </span>
        )}
      </div>
    );
  };

  const renderPlaying = (activeLesson: TeachLesson, seg: LessonSegment | undefined) => {
    if (!seg) {
      return <div className="p-6 text-xs text-solder font-mono">Lesson finished. You can close this window.</div>;
    }
    const chapterLabel =
      seg.chapterTitle && (segmentIndex === 0 || activeLesson.segments[segmentIndex - 1]?.chapterTitle !== seg.chapterTitle)
        ? seg.chapterTitle
        : null;
    const glossary = activeLesson.glossary || [];
    const isLast = segmentIndex >= totalSegments - 1;
    return (
      <div className="p-5 space-y-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono font-bold text-solder uppercase tracking-wider mr-1">
            {segmentIndex + 1}/{totalSegments}
          </span>
          {activeLesson.segments.map((s, i) => (
            <div
              key={s.id}
              className={`h-1.5 flex-1 ${i < segmentIndex ? 'bg-amber' : i === segmentIndex ? 'bg-bone' : 'bg-inset/40'}`}
            />
          ))}
          <span className="text-[10px] font-mono font-bold text-amber ml-1">XP {totalXpEarned}</span>
          {glossary.length > 0 && (
            <button
              type="button"
              onClick={() => setShowGlossary((v) => !v)}
              className="ml-1 text-[10px] font-mono font-bold text-solder uppercase tracking-wider hover:text-bone cursor-pointer"
            >
              [ GLOSSARY {glossary.length} ]
            </button>
          )}
        </div>

        {showGlossary && glossary.length > 0 && (
          <div className="p-3 bg-chassis border border-edge/50 space-y-1.5 max-h-56 overflow-y-auto" data-testid="teach-glossary">
            {glossary.map((g, i) => (
              <p key={i} className="text-[11px] font-mono text-bone leading-relaxed">
                <span className="text-amber font-bold">{g.term}</span>
                <span className="text-solder"> — {g.definition}</span>
              </p>
            ))}
          </div>
        )}

        {chapterLabel && (
          <div className="text-[10px] font-mono font-semibold text-amber-300 uppercase tracking-widest">
            {chapterLabel}
          </div>
        )}

        {renderIntro(activeLesson, segmentIndex === 0)}

        <motion.div
          key={seg.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-deck border border-edge/50 p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            {seg.title && <h4 className="font-bold text-bone text-sm font-mono">{seg.title}</h4>}
            <span className="text-[10px] font-mono text-solder uppercase tracking-wider">{seg.type}</span>
          </div>
          {renderSegmentBody(seg)}
        </motion.div>

        {isLast && renderFinishPanel()}
      </div>
    );
  };

  return (
    <AnimatePresence>
      <div ref={sheetRef} role="dialog" aria-modal="true" tabIndex={-1} className="fixed inset-0 z-[55] flex items-center justify-center p-3 bg-chassis/85 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 14 }}
          className="leaf-edge sheet-plate w-full max-w-3xl rounded-2xl bg-chassis border border-edge overflow-hidden flex flex-col max-h-[92vh]"
        >
          <div className="px-4 py-3 border-b border-edge bg-deck flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-inset/10 border border-edge/30 text-bone">
                <span className="text-flux font-bold font-mono">[ TEACH ]</span>
              </div>
              <div>
                <h3 className="font-bold text-bone text-sm font-mono uppercase tracking-tight">
                  {lesson ? lesson.title : `Teach Me : ${topicSummary || 'Your Topic'}`}
                </h3>
                <p className="text-[10px] text-solder font-mono">
                  {phase === 'options'
                    ? scope === 'stage' && targetActivity
                      ? `stage ${targetActivity.stageNumber} // ${targetActivity.title}`
                      : scope === 'schema'
                        ? 'full saved schema walkthrough'
                        : 'teaches straight from your source'
                    : lesson?.tagline || `mode ${mode}`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close lesson"
              className="p-2 text-solder hover:text-bone hover:bg-inset cursor-pointer"
            >
              <BracketTag label="X" tone="text-flux" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {phase === 'options' && renderOptions()}
            {phase === 'loading' && renderLoading()}
            {phase === 'playing' && lesson && renderPlaying(lesson, currentSeg)}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-mono font-bold text-solder uppercase tracking-wider">{children}</div>
  );
}

function SliderRow({
  label, min, max, value, onChange,
}: {
  label: string; min: number; max: number; value: number; onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-mono text-solder">{label} : <span className="text-amber font-bold">{value}</span></span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-amber"
      />
    </label>
  );
}
