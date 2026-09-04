'use client';

import React, { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, 
  Sparkles, 
  Brain, 
  Check, 
  Copy, 
  Flame, 
  ArrowRight, 
  ArrowLeft, 
  RefreshCcw, 
  Loader2, 
  ShieldAlert, 
  Zap, 
  Layers, 
  Scissors, 
  AlertCircle, 
  FileText, 
  Video, 
  CheckCircle2,
  SlidersHorizontal,
  ExternalLink,
  Mic,
  MicOff,
  Eye,
  EyeOff,
  Palette
} from 'lucide-react';
import { SketchCanvas } from './SketchCanvas';
import { Activity, StageResponse, UploadedFileAsset, YouTubeMetadata } from '@/lib/types';
import { StageVisualRenderer } from '@/components/stage-templates/StageVisualRenderer';
import { YouTubePlayerEmbed } from '@/components/YouTubePlayerEmbed';
import { generateRemnoteHierarchy } from '@/lib/remnote';
import { playSound } from '@/lib/audio';

const FLUFF_PATTERNS = [
  /\b(it is important to note that|as we can clearly see|in other words|basically|essentially|it should be remembered that|in this regard|furthermore, we notice that|it is worth mentioning that|needless to say)\b/gi,
  /\b(historically speaking|researchers have observed that|as previously stated|to put it simply|for all intents and purposes)\b/gi
];

interface StudioWorkbenchProps {
  activities: Activity[];
  currentActivityIndex: number;
  setCurrentActivityIndex: (idx: number) => void;
  userResponses: Record<string, StageResponse>;
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
  isEvaluating: boolean;
  feynmanResult: StageResponse['feynmanReview'] | null;
  onNextActivity: () => void;
  onPreviousActivity: () => void;
}

export function StudioWorkbench({
  activities,
  currentActivityIndex,
  userResponses,
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
  isEvaluating,
  feynmanResult,
  onNextActivity,
  onPreviousActivity,
}: StudioWorkbenchProps) {
  const [fluffStripperActive, setFluffStripperActive] = useState(false);
  const [copiedRemNote, setCopiedRemNote] = useState(false);
  const [mobileTab, setMobileTab] = useState<'source' | 'forge' | 'remnote'>('forge');
  
  // Hands-Free Spoken Feynman State
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Card Smoke Test (Cloze masking preview)
  const [smokeTestActive, setSmokeTestActive] = useState(false);
  const [revealedSmokeClozes, setRevealedSmokeClozes] = useState<Record<string, boolean>>({});

  // Canvas Toggle
  const [showSketchpad, setShowSketchpad] = useState(false);

  const currentActivity = activities[currentActivityIndex];

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

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Mobile Tab Switcher */}
      <div className="flex lg:hidden bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs font-bold">
        <button
          type="button"
          onClick={() => setMobileTab('source')}
          className={`flex-1 py-1.5 rounded-lg transition-colors ${mobileTab === 'source' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
        >
          Zone 1: Source
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('forge')}
          className={`flex-1 py-1.5 rounded-lg transition-colors ${mobileTab === 'forge' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
        >
          Zone 2: Forge
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('remnote')}
          className={`flex-1 py-1.5 rounded-lg transition-colors ${mobileTab === 'remnote' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
        >
          Zone 3: RemNote
        </button>
      </div>

      {/* 3-Zone Desktop Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        
        {/* ========================================================= */}
        {/* ZONE 1: THE SOURCE DOCK (LEFT 3 COLS)                     */}
        {/* ========================================================= */}
        <div className={`lg:col-span-3 flex-col gap-3 ${mobileTab === 'source' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="bg-[#0F111A] border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col max-h-[82vh] overflow-hidden">
            {/* Zone 1 Header */}
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">Source Dock</span>
              </div>
              
              {/* Fluff Stripper Button */}
              {rawNotes && (
                <button
                  type="button"
                  onClick={() => {
                    setFluffStripperActive(!fluffStripperActive);
                    playSound('pop');
                  }}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono font-bold border transition-colors cursor-pointer ${
                    fluffStripperActive
                      ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                  title="Cross out textbook filler phrases"
                >
                  <Scissors className="w-3 h-3" />
                  <span>{fluffStripperActive ? 'Fluff: Hidden' : 'Strip Fluff'}</span>
                </button>
              )}
            </div>

            {/* Zone 1 Body */}
            <div className="overflow-y-auto flex-1 pr-1 space-y-3 text-xs leading-relaxed text-slate-300">
              {youtubeData && (
                <div className="space-y-2">
                  <div className="aspect-video rounded-xl overflow-hidden bg-black border border-slate-800">
                    <iframe
                      src={`https://www.youtube-nocookie.com/embed/${youtubeData.videoId}?rel=0`}
                      title={youtubeData.title}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                  <p className="font-semibold text-slate-200 text-[11px] truncate">{youtubeData.title}</p>
                </div>
              )}

              {uploadedFile && (
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-200 truncate text-[11px]">{uploadedFile.name}</p>
                    <span className="text-[10px] text-slate-500">{(uploadedFile.size / 1024).toFixed(0)} KB</span>
                  </div>
                </div>
              )}

              {rawNotes ? (
                <div className="font-serif whitespace-pre-wrap select-text">
                  {fluffStripperActive ? (
                    processedSourceText.split('~~').map((segment, idx) => (
                      idx % 2 === 1 ? (
                        <span key={idx} className="line-through text-slate-600 bg-rose-950/20 px-0.5 rounded">
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
                <p className="text-slate-500 italic text-[11px]">No external source attached.</p>
              ) : null}
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* ZONE 2: THE FORGE (CENTER 6 COLS)                         */}
        {/* ========================================================= */}
        <div className={`lg:col-span-6 flex-col gap-3 ${mobileTab === 'forge' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="bg-[#0F111A] border border-slate-800 rounded-2xl shadow-2xl p-5 space-y-4">
            
            {/* Stage Progression & Combo */}
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-[10px] font-mono font-bold uppercase">
                  Stage {currentActivityIndex + 1} of {activities.length}
                </span>
                <span className="text-xs font-bold text-white truncate max-w-[240px]">
                  {currentActivity.title}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-[11px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-lg">
                  <Flame className="w-3 h-3 fill-amber-400" />
                  {combo}x STREAK
                </span>
              </div>
            </div>

            {/* Target Concept Extract */}
            <div className="p-3 bg-[#141724] border-l-4 border-indigo-500 rounded-r-xl text-slate-300 text-xs font-serif leading-relaxed italic">
              <span className="font-sans font-bold text-[10px] text-indigo-400 uppercase not-italic block mb-0.5">
                Target Mechanism:
              </span>
              &ldquo;{currentActivity.contextSnippet}&rdquo;
            </div>

            {/* Interactive Visual Canvas / Storyboard / Sabotage */}
            <StageVisualRenderer
              activity={currentActivity}
              field1={field1}
              field2={field2}
              field3={field3}
              selectedPreset={selectedPreset}
            />

            {/* Optional Dual-Coding Sketchpad Toggle */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowSketchpad(!showSketchpad)}
                className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                <Palette className="w-3.5 h-3.5" />
                <span>{showSketchpad ? 'Hide Sketchpad' : 'Open Sketchpad (Dual Coding)'}</span>
              </button>
            </div>

            {showSketchpad && <SketchCanvas />}

            {/* Scaffold Input 1 */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-indigo-300 uppercase tracking-wider block">
                {currentActivity.scaffold.field1Label}
              </label>
              <textarea
                value={field1}
                onChange={e => setField1(e.target.value)}
                placeholder={currentActivity.scaffold.field1Placeholder}
                rows={2}
                className="w-full p-3 bg-[#141724] border border-slate-800 rounded-xl text-slate-200 placeholder:text-slate-600 text-xs leading-relaxed outline-none focus:border-indigo-500 font-serif resize-none"
              />
            </div>

            {/* Scaffold Input 2 with Mic Button */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-purple-300 uppercase tracking-wider block">
                  {currentActivity.scaffold.field2Label}
                </label>
                
                {/* Spoken Feynman Mic Button */}
                <button
                  type="button"
                  onClick={toggleSpeechRecognition}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                    isListening
                      ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 animate-pulse'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-purple-300'
                  }`}
                  title="Speak your explanation out loud"
                >
                  {isListening ? <MicOff className="w-3 h-3 text-rose-400" /> : <Mic className="w-3 h-3 text-purple-400" />}
                  <span>{isListening ? 'Listening (Tap to Stop)' : 'Spoken Feynman'}</span>
                </button>
              </div>

              <textarea
                value={field2}
                onChange={e => setField2(e.target.value)}
                placeholder={currentActivity.scaffold.field2Placeholder}
                rows={2}
                className={`w-full p-3 bg-[#141724] border rounded-xl text-slate-200 placeholder:text-slate-600 text-xs leading-relaxed outline-none font-serif resize-none transition-colors ${
                  isListening ? 'border-rose-500 ring-2 ring-rose-500/20' : 'border-slate-800 focus:border-purple-500'
                }`}
              />
            </div>

            {/* Scaffold Input 3 (if provided) */}
            {currentActivity.scaffold.field3Label && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-emerald-300 uppercase tracking-wider block">
                  {currentActivity.scaffold.field3Label}
                </label>
                <input
                  type="text"
                  value={field3}
                  onChange={e => setField3(e.target.value)}
                  placeholder={currentActivity.scaffold.field3Placeholder || ''}
                  className="w-full p-2.5 bg-[#141724] border border-slate-800 rounded-xl text-slate-200 placeholder:text-slate-600 text-xs outline-none focus:border-emerald-500 font-serif"
                />
              </div>
            )}

            {/* Forge Navigation Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={onPreviousActivity}
                disabled={currentActivityIndex === 0}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 disabled:opacity-40"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onCheckAnswer}
                  disabled={isEvaluating || (!field1.trim() && !field2.trim())}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-200 transition-colors disabled:opacity-40 cursor-pointer"
                >
                  {isEvaluating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                  <span>Ask Examiner</span>
                </button>

                <button
                  type="button"
                  onClick={onNextActivity}
                  disabled={!field1.trim() || !field2.trim()}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-40 cursor-pointer"
                >
                  <span>{currentActivityIndex === activities.length - 1 ? 'Finish Workout' : 'Next Stage'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* ========================================================= */}
        {/* ZONE 3: REMNOTE STAGING & INQUISITOR (RIGHT 3 COLS)       */}
        {/* ========================================================= */}
        <div className={`lg:col-span-3 flex-col gap-3 ${mobileTab === 'remnote' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="bg-[#0F111A] border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col max-h-[82vh] overflow-hidden space-y-3.5">
            
            {/* Zone 3 Header & Strictness Dial */}
            <div className="space-y-2 border-b border-slate-800/80 pb-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                  <span>Examiner Strictness</span>
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {strictnessLevel === 'sherpa' ? '🟢 Sherpa' : strictnessLevel === 'feynman' ? '🟡 Feynman' : '🔴 Viva Voce'}
                </span>
              </div>

              {/* Strictness Dial Control */}
              <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setStrictnessLevel('sherpa');
                    playSound('click');
                  }}
                  className={`py-1 rounded-lg text-[10px] font-bold transition-all ${
                    strictnessLevel === 'sherpa'
                      ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 shadow-sm'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Sherpa
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStrictnessLevel('feynman');
                    playSound('click');
                  }}
                  className={`py-1 rounded-lg text-[10px] font-bold transition-all ${
                    strictnessLevel === 'feynman'
                      ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40 shadow-sm'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Feynman
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStrictnessLevel('viva');
                    playSound('click');
                  }}
                  className={`py-1 rounded-lg text-[10px] font-bold transition-all ${
                    strictnessLevel === 'viva'
                      ? 'bg-rose-600/30 text-rose-300 border border-rose-500/40 shadow-sm'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Viva Voce
                </button>
              </div>
            </div>

            {/* Socratic Feedback & Jargon Alerts */}
            {feynmanResult && (
              <div className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                feynmanResult.grade === 'mastered'
                  ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                  : 'bg-amber-950/30 border-amber-500/40 text-amber-200'
              }`}>
                <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase">
                  <span>Evaluation ({feynmanResult.score}/100)</span>
                  <span>+{feynmanResult.xpBonus} XP</span>
                </div>
                <p className="font-serif leading-relaxed text-[11px]">{feynmanResult.feedback}</p>

                {/* Jargon Buzzer */}
                {(feynmanResult as any).jargonBuzzer && (
                  <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-300 font-sans">
                    🚨 <strong>Jargon Buzzer:</strong> {(feynmanResult as any).jargonBuzzer}
                  </div>
                )}

                {/* Oral Defense Probing Question */}
                {(feynmanResult as any).vivaCrossExamination && (
                  <div className="p-2 rounded bg-rose-500/10 border border-rose-500/30 text-[10px] text-rose-300 font-sans">
                    ⚔️ <strong>Viva Voce Challenge:</strong> {(feynmanResult as any).vivaCrossExamination}
                  </div>
                )}
              </div>
            )}

            {/* Live RemNote Output Preview & Card Smoke Test */}
            <div className="flex-1 flex flex-col space-y-2 overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-300 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Live RemNote Staging</span>
                </span>
                
                {/* Smoke Test Cloze Masking Toggle */}
                <button
                  type="button"
                  onClick={() => {
                    setSmokeTestActive(!smokeTestActive);
                    setRevealedSmokeClozes({});
                    playSound('click');
                  }}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold border transition-colors ${
                    smokeTestActive
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                  title="Hide clozes to smoke-test your cards before copying"
                >
                  {smokeTestActive ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  <span>{smokeTestActive ? 'Clozes: Masked' : 'Smoke Test'}</span>
                </button>
              </div>

              {/* Live Preview Box with Cloze Masking Support */}
              <div className="flex-1 overflow-y-auto bg-slate-950 p-2.5 rounded-xl border border-slate-800/80 font-mono text-[10px] text-cyan-200 leading-relaxed whitespace-pre-wrap select-all">
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
                          className={`cursor-pointer px-1 py-0.5 rounded border transition-colors ${
                            isRevealed
                              ? 'bg-emerald-950 border-emerald-500/40 text-emerald-300'
                              : 'bg-amber-950/80 border-amber-500/50 text-amber-300 font-bold'
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
                className={`w-full py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg ${
                  copiedRemNote
                    ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                    : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-600/20'
                }`}
              >
                {copiedRemNote ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedRemNote ? 'Copied to Clipboard!' : '1-Click Copy into RemNote'}</span>
              </button>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}