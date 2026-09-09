'use client';

import React, { useState, useMemo, useRef } from 'react';
import { SketchCanvas } from './SketchCanvas';
import { Activity, StageResponse, UploadedFileAsset, YouTubeMetadata } from '@/lib/types';
import { StageVisualRenderer } from '@/components/stage-templates/StageVisualRenderer';
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
      <div className="flex lg:hidden bg-chassis border border-steel text-[10px] font-mono font-bold uppercase tracking-wider">
        <button
          type="button"
          onClick={() => setMobileTab('source')}
          className={`flex-1 py-1.5 border-r border-steel transition-none ${mobileTab === 'source' ? 'bg-amber text-chassis' : 'bg-deck text-solder'}`}
        >
          [ 01:SOURCE ]
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('forge')}
          className={`flex-1 py-1.5 border-r border-steel transition-none ${mobileTab === 'forge' ? 'bg-amber text-chassis' : 'bg-deck text-solder'}`}
        >
          [ 02:FORGE ]
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('remnote')}
          className={`flex-1 py-1.5 transition-none ${mobileTab === 'remnote' ? 'bg-amber text-chassis' : 'bg-deck text-solder'}`}
        >
          [ 03:REMNOTE ]
        </button>
      </div>

      {/* 3-Zone Desktop Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        
        {/* ========================================================= */}
        {/* ZONE 1: THE SOURCE DOCK (LEFT 3 COLS)                     */}
        {/* ========================================================= */}
        <div className={`lg:col-span-3 flex-col gap-3 ${mobileTab === 'source' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="bg-deck border border-steel p-3 flex flex-col max-h-[82vh] overflow-hidden">
            {/* Zone 1 Header */}
            <div className="flex items-center justify-between border-b border-steel pb-2.5 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold text-bone uppercase tracking-wider">// SOURCE DOCK</span>
              </div>
              
              {/* Fluff Stripper Button */}
              {rawNotes && (
                <button
                  type="button"
                  onClick={() => {
                    setFluffStripperActive(!fluffStripperActive);
                    playSound('pop');
                  }}
                  className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider border transition-none cursor-pointer ${
                    fluffStripperActive
                      ? 'bg-amber border-amber text-chassis'
                      : 'bg-chassis border-steel text-solder'
                  }`}
                  title="Cross out textbook filler phrases"
                >
                  {fluffStripperActive ? '[ FLUFF: ON ]' : '[ STRIP FLUFF ]'}
                </button>
              )}
            </div>

            {/* Zone 1 Body */}
            <div className="overflow-y-auto flex-1 pr-1 space-y-3 text-xs leading-relaxed text-solder">
              {youtubeData && (
                <div className="space-y-2">
                  <div className="aspect-video overflow-hidden bg-chassis border border-steel">
                    <iframe
                      src={`https://www.youtube-nocookie.com/embed/${youtubeData.videoId}?rel=0`}
                      title={youtubeData.title}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                  <p className="font-mono font-bold text-bone text-[11px] truncate">{youtubeData.title}</p>
                </div>
              )}

              {uploadedFile && (
                <div className="p-2.5 bg-chassis border border-steel flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold text-amber uppercase tracking-wider shrink-0">[ FILE ]</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono font-bold text-bone truncate text-[11px]">{uploadedFile.name}</p>
                    <span className="text-[10px] font-mono text-solder">{(uploadedFile.size / 1024).toFixed(0)} KB</span>
                  </div>
                </div>
              )}

              {rawNotes ? (
                <div className="font-mono whitespace-pre-wrap select-text text-bone">
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
                <p className="text-solder font-mono text-[11px]">// NO EXTERNAL SOURCE ATTACHED.</p>
              ) : null}
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* ZONE 2: THE FORGE (CENTER 6 COLS)                         */}
        {/* ========================================================= */}
        <div className={`lg:col-span-6 flex-col gap-3 ${mobileTab === 'forge' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="bg-deck border border-steel p-5 space-y-4">

            {/* Stage Progression & Combo */}
            <div className="flex items-center justify-between border-b border-steel pb-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-chassis border border-steel text-bone text-[10px] font-mono font-bold uppercase tracking-wider">
                  STAGE: {String(currentActivityIndex + 1).padStart(2, '0')}/{String(activities.length).padStart(2, '0')}
                </span>
                <span className="text-xs font-bold text-bone truncate max-w-[240px] font-mono uppercase">
                  {currentActivity.title}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono font-bold text-amber border border-amber/60 px-2 py-0.5">
                  STREAK: {String(combo).padStart(2, '0')}
                </span>
              </div>
            </div>

            {/* Target Concept Extract */}
            <div className="p-3 bg-chassis border border-steel text-solder text-xs font-mono leading-relaxed">
              <span className="font-bold text-[10px] text-amber uppercase tracking-wider block mb-0.5">
                [ TARGET MECHANISM ]
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
                className="text-[10px] font-mono font-bold uppercase tracking-wider text-solder border border-steel px-2 py-0.5 hover:text-bone transition-none cursor-pointer"
              >
                [ SKETCHPAD: {showSketchpad ? 'ON' : 'OFF'} ]
              </button>
            </div>

            {showSketchpad && <SketchCanvas />}

            {/* Scaffold Input 1 */}
            <div className="space-y-1">
              <label className="text-[10px] font-mono font-bold text-solder uppercase tracking-wider block">
                {currentActivity.scaffold.field1Label}
              </label>
              <textarea
                value={field1}
                onChange={e => setField1(e.target.value)}
                placeholder={currentActivity.scaffold.field1Placeholder}
                rows={2}
                className="w-full p-3 bg-chassis border border-steel text-bone placeholder-solder text-xs leading-relaxed outline-none focus:border-amber font-mono resize-none transition-none"
              />
            </div>

            {/* Scaffold Input 2 with Mic Button */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono font-bold text-solder uppercase tracking-wider block">
                  {currentActivity.scaffold.field2Label}
                </label>

                {/* Spoken Feynman Mic Button */}
                <button
                  type="button"
                  onClick={toggleSpeechRecognition}
                  className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider border transition-none cursor-pointer ${
                    isListening
                      ? 'bg-hazard border-hazard text-bone'
                      : 'bg-chassis border-steel text-solder'
                  }`}
                  title="Speak your explanation out loud"
                >
                  [ MIC: {isListening ? 'LIVE' : 'OFF'} ]
                </button>
              </div>

              <textarea
                value={field2}
                onChange={e => setField2(e.target.value)}
                placeholder={currentActivity.scaffold.field2Placeholder}
                rows={2}
                className={`w-full p-3 bg-chassis border text-bone placeholder-solder text-xs leading-relaxed outline-none font-mono resize-none transition-none ${
                  isListening ? 'border-hazard' : 'border-steel focus:border-amber'
                }`}
              />
            </div>

            {/* Scaffold Input 3 (if provided) */}
            {currentActivity.scaffold.field3Label && (
              <div className="space-y-1">
                <label className="text-[10px] font-mono font-bold text-solder uppercase tracking-wider block">
                  {currentActivity.scaffold.field3Label}
                </label>
                <input
                  type="text"
                  value={field3}
                  onChange={e => setField3(e.target.value)}
                  placeholder={currentActivity.scaffold.field3Placeholder || ''}
                  className="w-full p-2.5 bg-chassis border border-steel text-bone placeholder-solder text-xs outline-none focus:border-amber font-mono transition-none"
                />
              </div>
            )}

            {/* Forge Navigation Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-steel">
              <button
                type="button"
                onClick={onPreviousActivity}
                disabled={currentActivityIndex === 0}
                className="px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-solder bg-chassis border border-steel hover:text-bone transition-none disabled:opacity-40 cursor-pointer"
              >
                [ &lt;&lt; PREV ]
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onCheckAnswer}
                  disabled={isEvaluating || (!field1.trim() && !field2.trim())}
                  className="px-3.5 py-2 text-[10px] font-mono font-bold uppercase tracking-wider bg-chassis border border-steel text-bone hover:border-amber transition-none disabled:opacity-40 cursor-pointer"
                >
                  {isEvaluating ? '[ EVALUATING... ]' : '[ ASK EXAMINER ]'}
                </button>

                <button
                  type="button"
                  onClick={onNextActivity}
                  disabled={!field1.trim() || !field2.trim()}
                  className="px-5 py-2 text-[10px] font-mono font-bold uppercase tracking-wider bg-amber border border-amber text-chassis transition-none disabled:opacity-40 cursor-pointer"
                >
                  {currentActivityIndex === activities.length - 1 ? 'FINISH WORKOUT //' : 'NEXT STAGE >>'}
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* ========================================================= */}
        {/* ZONE 3: REMNOTE STAGING & INQUISITOR (RIGHT 3 COLS)       */}
        {/* ========================================================= */}
        <div className={`lg:col-span-3 flex-col gap-3 ${mobileTab === 'remnote' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="bg-deck border border-steel p-4 flex flex-col max-h-[82vh] overflow-hidden space-y-3.5">

            {/* Zone 3 Header & Strictness Rocker Plate */}
            <div className="space-y-2 border-b border-steel pb-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-bone uppercase tracking-wider">
                  // EXAMINER CONSOLE
                </span>
                <span className="text-[10px] font-mono text-solder">
                  {strictnessLevel === 'sherpa' ? '[ 01:SHERPA ]' : strictnessLevel === 'feynman' ? '[ 02:FEYNMAN ]' : '[ 03:VIVA ]'}
                </span>
              </div>

              {/* STRICTNESS: 3-Position Mechanical Rocker Plate */}
              <div className="flex items-center">
                <span className="text-[10px] font-mono font-bold text-solder uppercase tracking-wider mr-1.5 whitespace-nowrap">
                  STRICTNESS: [
                </span>
                <div className="flex flex-1 border border-steel bg-chassis">
                  <button
                    type="button"
                    onClick={() => {
                      setStrictnessLevel('sherpa');
                      playSound('click');
                    }}
                    className={`flex-1 py-1 text-[10px] font-mono font-bold uppercase tracking-wider border-r border-steel transition-none ${
                      strictnessLevel === 'sherpa'
                        ? 'bg-amber border-amber text-chassis'
                        : 'bg-deck text-solder'
                    }`}
                  >
                    01:SHERPA
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStrictnessLevel('feynman');
                      playSound('click');
                    }}
                    className={`flex-1 py-1 text-[10px] font-mono font-bold uppercase tracking-wider border-r border-steel transition-none ${
                      strictnessLevel === 'feynman'
                        ? 'bg-amber border-amber text-chassis'
                        : 'bg-deck text-solder'
                    }`}
                  >
                    02:FEYNMAN*
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStrictnessLevel('viva');
                      playSound('click');
                    }}
                    className={`flex-1 py-1 text-[10px] font-mono font-bold uppercase tracking-wider transition-none ${
                      strictnessLevel === 'viva'
                        ? 'bg-amber border-amber text-chassis'
                        : 'bg-deck text-solder'
                    }`}
                  >
                    03:VIVA
                  </button>
                </div>
                <span className="text-[10px] font-mono font-bold text-solder uppercase tracking-wider ml-1.5">
                  ]
                </span>
              </div>
            </div>

            {/* Socratic Feedback & Jargon Alerts */}
            {feynmanResult && (
              <div className={`p-3 border text-xs space-y-1.5 ${
                feynmanResult.grade === 'mastered'
                  ? 'bg-deck border-amber/60 text-bone'
                  : 'bg-chassis border-steel text-solder'
              }`}>
                <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-wider">
                  <span>EVALUATION: {String(feynmanResult.score).padStart(3, '0')}/100</span>
                  <span className="text-amber">XP +{feynmanResult.xpBonus}</span>
                </div>
                <p className="font-mono leading-relaxed text-[11px]">{feynmanResult.feedback}</p>

                {/* Jargon Buzzer */}
                {(feynmanResult as any).jargonBuzzer && (
                  <div className="p-2 bg-deck border border-hazard text-[10px] text-solder font-mono">
                    [ JARGON BUZZER ] // {(feynmanResult as any).jargonBuzzer}
                  </div>
                )}

                {/* Oral Defense Probing Question */}
                {(feynmanResult as any).vivaCrossExamination && (
                  <div className="p-2 bg-deck border border-hazard text-[10px] text-solder font-mono">
                    [ VIVA CHALLENGE ] // {(feynmanResult as any).vivaCrossExamination}
                  </div>
                )}
              </div>
            )}

            {/* Live RemNote Output Preview & Card Smoke Test */}
            <div className="flex-1 flex flex-col space-y-2 overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-bone uppercase tracking-wider">
                  // REMNOTE STAGING
                </span>

                {/* Smoke Test Cloze Masking Toggle */}
                <button
                  type="button"
                  onClick={() => {
                    setSmokeTestActive(!smokeTestActive);
                    setRevealedSmokeClozes({});
                    playSound('click');
                  }}
                  className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider border transition-none ${
                    smokeTestActive
                      ? 'bg-amber border-amber text-chassis'
                      : 'bg-chassis border-steel text-solder'
                  }`}
                  title="Hide clozes to smoke-test your cards before copying"
                >
                  {smokeTestActive ? '[ CLOZES: MASKED ]' : '[ SMOKE TEST ]'}
                </button>
              </div>

              {/* Live Preview Box with Cloze Masking Support */}
              <div className="flex-1 overflow-y-auto bg-chassis p-2.5 border border-steel font-mono text-[10px] text-bone leading-relaxed whitespace-pre-wrap select-all">
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
                          className={`cursor-pointer px-1 py-0.5 border transition-none ${
                            isRevealed
                              ? 'bg-deck border-steel text-bone'
                              : 'bg-amber border-amber text-chassis font-bold'
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
                className={`w-full py-2 px-3 text-[10px] font-mono font-bold uppercase tracking-wider border transition-none cursor-pointer ${
                  copiedRemNote
                    ? 'bg-amber border-amber text-chassis'
                    : 'bg-chassis border-steel text-bone hover:border-amber'
                }`}
              >
                {copiedRemNote ? '[ COPIED: OK ]' : '[ 1-CLICK COPY INTO REMNOTE ]'}
              </button>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}