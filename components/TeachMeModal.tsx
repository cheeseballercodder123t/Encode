'use client';

import React, { useState } from 'react';
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
import { buildFallbackLesson, sanitizeLesson } from '@/lib/services/teachLesson';
import { playSound } from '@/lib/audio';
import { ConceptBody, ContinueButton, MemoryHookBody, StoryBody } from './TeachSegments';
import { GuidedProblemBody, YouTryBody } from './TeachGuided';
import { TeachFinishPanel, TeachInteractiveSegment } from './TeachInteractive';

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
}

const STYLE_META: { id: TeachLessonOptions['style']; label: string; blurb: string }[] = [
  { id: 'brilliant', label: 'Brilliant', blurb: 'Scenario hooks, puzzle pulses, then a real problem' },
  { id: 'socratic', label: 'Socratic', blurb: 'Question-by-question, you discover the mechanism' },
  { id: 'storyteller', label: 'Storyteller', blurb: 'The mechanism becomes a plot with stakes' },
  { id: 'professor', label: 'Professor', blurb: 'Crisp lecture : define, motivate, solve, test' },
  { id: 'meme', label: 'Meme Brainrot', blurb: 'Absurd & funny — accuracy still sacred' },
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
    settings, onAwardXP,
  } = props;

  const [options, setOptions] = useState<TeachLessonOptions>(loadSavedOptions);
  const [phase, setPhase] = useState<'options' | 'loading' | 'playing'>('options');
  const [lesson, setLesson] = useState<TeachLesson | null>(null);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [totalXpEarned, setTotalXpEarned] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const targetActivity = scope === 'stage' ? activities[stageIndex] ?? null : null;
  const totalSegments = lesson ? lesson.segments.length : 0;
  const currentSeg = lesson?.segments[segmentIndex];

  const persistOptions = (next: TeachLessonOptions) => {
    setOptions(next);
    try { localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const updateOpt = <K extends keyof TeachLessonOptions>(key: K, value: TeachLessonOptions[K]) => {
    persistOptions({ ...options, [key]: value } as TeachLessonOptions);
  };

  const handleClose = () => {
    onClose();
    setPhase('options');
    setLesson(null);
    setSegmentIndex(0);
    setTotalXpEarned(0);
    setStreak(0);
    setBestStreak(0);
    setErrorMsg('');
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
        setPhase('playing');
        playSound('pop');
      } else {
        throw new Error('Lesson came back empty');
      }
    } catch (err: unknown) {
      console.error('TeachMe error', err);
      const fallback = buildFallbackLesson(topicSummary, mode, targetActivity || undefined);
      setLesson(fallback);
      setSegmentIndex(0);
      setTotalXpEarned(0);
      setStreak(0);
      setBestStreak(0);
      setPhase('playing');
      setErrorMsg('AI unavailable — taught you from your schema instead.');
      playSound('beep');
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
    const finish = (
      <TeachFinishPanel
        lesson={lesson}
        isLast={isLast}
        totalXpEarned={totalXpEarned}
        bestStreak={bestStreak}
        onClose={handleClose}
      />
    );
    switch (seg.type) {
      case 'concept': return <ConceptBody seg={seg} {...cb} />;
      case 'memoryHook': return <MemoryHookBody seg={seg} {...cb} />;
      case 'storyBeat': return <StoryBody seg={seg} {...cb} />;
      case 'guidedProblem': return <GuidedProblemBody seg={seg} {...cb} />;
      case 'youTry': return <YouTryBody seg={seg} {...cb} />;
      case 'checkpoint':
      case 'wrapup':
      default:
        return (
          <TeachInteractiveSegment
            key={seg.id}
            seg={seg}
            isLast={isLast}
            finish={finish}
            {...cb}
          />
        );
    }
  };


  const renderOptions = () => (
    <div className="p-5 space-y-4">
      <div className="p-3 bg-deck border border-steel/40 text-xs text-bone leading-relaxed">
        <p className="font-bold text-bone text-[11px] flex items-center gap-1.5">
          <span className="text-amber font-bold font-mono">[ AI ]</span>
          Lesson Pre-Roll — how should I teach?
        </p>
        <p className="text-solder mt-1">
          Style, pacing, difficulty and humor are all <span className="text-amber">soft preferences</span> — the AI
          is free to override them if a better pedagogy occurs to it. Every lesson teaches the concept first, then
          walks you through a real problem step-by-step.
        </p>
      </div>

      <Label>Teaching Style</Label>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1.5">
        {STYLE_META.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => updateOpt('style', s.id)}
            title={s.blurb}
            className={`px-2 py-1.5 text-left border transition-none cursor-pointer text-[10px] font-mono font-bold uppercase tracking-wider ${
              options.style === s.id ? 'bg-amber border-amber text-chassis' : 'bg-chassis border-steel text-solder'
            }`}
          >
            [ {s.label.toUpperCase()} ]
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
              options[key] ? 'bg-deck border-amber text-bone' : 'bg-chassis border-steel text-solder'
            }`}
          >
            [ {label}: {options[key] ? 'ON' : 'OFF'} ]
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <SliderRow label="Checkpoints" min={1} max={8} value={options.checkpoints} onChange={(v) => updateOpt('checkpoints', v)} />
        <SliderRow label="Lesson Depth (1-3)" min={1} max={3} value={options.lessonDepth} onChange={(v) => updateOpt('lessonDepth', v)} />
        <SliderRow label="Humor (0-5)" min={0} max={5} value={options.humor} onChange={(v) => updateOpt('humor', v)} />
        <SliderRow label="Max Segments (4-20)" min={4} max={20} value={options.maxSteps} onChange={(v) => updateOpt('maxSteps', v)} />
      </div>

      <Label>Difficulty</Label>
      <div className="flex flex-wrap gap-1.5">
        {(['intro', 'standard', 'viva'] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => updateOpt('difficulty', d)}
            className={`px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider border transition-none cursor-pointer ${
              options.difficulty === d ? 'bg-amber border-amber text-chassis' : 'bg-chassis border-steel text-solder'
            }`}
          >
            {d === 'intro' ? 'INTRO' : d === 'standard' ? 'STANDARD' : 'VIVA ORAL DEFENSE'}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <button type="button" onClick={handleClose} className="px-4 py-2 bg-steel text-bone text-xs font-bold">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleGenerate}
          className="flex items-center gap-2 px-6 py-2.5 bg-amber border border-amber text-chassis text-xs font-mono font-bold uppercase tracking-wider cursor-pointer"
        >
          <span>[ GO ]</span>
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
        className="w-12 h-12 border-2 border-amber border-t-transparent rounded-full"
      />
      <p className="text-xs text-bone font-mono uppercase tracking-wider">
        {scope === 'stage' && targetActivity
          ? 'Teaching this stage from the mechanism up...'
          : 'Authoring your interactive lesson...'}
      </p>
      <p className="text-[10px] text-solder font-mono">
        concept → guided problem → your turn — with instant feedback at every step.
      </p>
    </div>
  );

  const renderPlaying = (activeLesson: TeachLesson, seg: LessonSegment | undefined) => {
    if (!seg) {
      return <div className="p-6 text-xs text-solder font-mono">Lesson finished. You can close this window.</div>;
    }
    const chapterLabel =
      seg.chapterTitle && (segmentIndex === 0 || activeLesson.segments[segmentIndex - 1]?.chapterTitle !== seg.chapterTitle)
        ? seg.chapterTitle
        : null;
    return (
      <div className="p-5 space-y-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono font-bold text-solder uppercase tracking-wider mr-1">
            {segmentIndex + 1}/{totalSegments}
          </span>
          {activeLesson.segments.map((s, i) => (
            <div
              key={s.id}
              className={`h-1.5 flex-1 ${i < segmentIndex ? 'bg-amber' : i === segmentIndex ? 'bg-bone' : 'bg-steel/40'}`}
            />
          ))}
          <span className="text-[10px] font-mono font-bold text-amber ml-1">XP {totalXpEarned}</span>
        </div>

        {chapterLabel && (
          <div className="text-[10px] font-mono font-bold text-amber uppercase tracking-widest border-l-2 border-amber pl-2">
            {chapterLabel}
          </div>
        )}

        <motion.div
          key={seg.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-deck border border-steel/50 p-4 space-y-3"
        >
          {seg.title && <h4 className="font-bold text-bone text-sm font-mono">{seg.title}</h4>}
          {renderSegmentBody(seg)}
        </motion.div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[55] flex items-center justify-center p-3 bg-chassis/85 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 14 }}
          className="w-full max-w-3xl bg-chassis border border-steel overflow-hidden flex flex-col max-h-[92vh]"
        >
          <div className="px-4 py-3 border-b border-steel bg-deck flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-steel/10 border border-steel/30 text-bone">
                <span className="text-amber font-bold font-mono">[ TEACH ]</span>
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
            <button type="button" onClick={handleClose} className="p-2 text-solder hover:text-bone hover:bg-steel">
              <span className="text-amber font-bold font-mono">[ X ]</span>
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


