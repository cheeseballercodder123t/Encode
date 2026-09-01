'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shuffle, 
  Sparkles, 
  Flame, 
  Award, 
  CheckCircle2, 
  XCircle, 
  ArrowRight, 
  RotateCcw, 
  Zap, 
  Check, 
  Layers, 
  BookOpen,
  HelpCircle,
  Clock,
  ChevronRight
} from 'lucide-react';
import { SavedSchema, InterleavedQuestion } from '@/lib/types';
import { playSound } from '@/lib/audio';

interface InterleavingDrillModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedSchemas: SavedSchema[];
  onAwardXP: (xp: number) => void;
}

// Built-in curated domains if user has < 2 saved schemas
const PRESET_DOMAINS: { title: string; domain: string; questions: InterleavedQuestion[] }[] = [
  {
    title: 'Neurobiology: Action Potentials',
    domain: 'NEUROSCIENCE',
    questions: [
      {
        id: 'neuro_1',
        domain: 'NEUROSCIENCE',
        schemaTitle: 'Neurobiology: Action Potentials',
        sourceSchemaId: 'preset_neuro',
        stageTitle: 'Depolarization Threshold',
        questionPrompt: 'What molecular event triggers the explosive positive feedback loop during the rising phase of an action potential?',
        correctMechanism: 'Voltage-gated Na+ channels open rapidly, allowing Na+ influx to exceed the -55mV threshold, causing further depolarization.',
        keyKeywords: ['Voltage-gated Na+', 'Influx', 'Threshold', 'Positive feedback'],
        contrastTrap: 'Do not confuse with K+ efflux (which causes repolarization).'
      },
      {
        id: 'neuro_2',
        domain: 'NEUROSCIENCE',
        schemaTitle: 'Neurobiology: Action Potentials',
        sourceSchemaId: 'preset_neuro',
        stageTitle: 'Refractory Period Function',
        questionPrompt: 'Why does an action potential only propagate forward along the axon and never bounce backward?',
        correctMechanism: 'The absolute refractory period caused by inactivated Na+ channel gates prevents backward excitation.',
        keyKeywords: ['Absolute refractory', 'Inactivated gates', 'Unidirectional'],
      }
    ]
  },
  {
    title: 'Quantitative Finance: Risk & Compounding',
    domain: 'FINANCE',
    questions: [
      {
        id: 'fin_1',
        domain: 'FINANCE',
        schemaTitle: 'Quantitative Finance: Risk & Compounding',
        sourceSchemaId: 'preset_fin',
        stageTitle: 'Continuous Compounding Limit',
        questionPrompt: 'As the compounding frequency n approaches infinity in the compound interest formula, what mathematical constant naturally emerges?',
        correctMechanism: 'Euler\'s constant e (~2.71828), transforming the formula into A = P * e^(rt).',
        keyKeywords: ['Euler constant e', 'Limit', 'P * e^(rt)'],
        contrastTrap: 'Do not confuse with linear simple interest (I = P * r * t).'
      },
      {
        id: 'fin_2',
        domain: 'FINANCE',
        schemaTitle: 'Quantitative Finance: Risk & Compounding',
        sourceSchemaId: 'preset_fin',
        stageTitle: 'Sharpe Ratio Mechanics',
        questionPrompt: 'Why is standard deviation in the Sharpe ratio denominator a two-edged metric for asymmetric risk?',
        correctMechanism: 'Standard deviation penalizes both upside and downside volatility equally, even though investors desire upside variance.',
        keyKeywords: ['Penalizes upside', 'Volatility', 'Downside risk'],
      }
    ]
  },
  {
    title: 'Computer Networks: TCP Congestion Control',
    domain: 'NETWORKING',
    questions: [
      {
        id: 'net_1',
        domain: 'NETWORKING',
        schemaTitle: 'Computer Networks: TCP Congestion Control',
        sourceSchemaId: 'preset_net',
        stageTitle: 'AIMD Congestion Avoidance',
        questionPrompt: 'How does Additive Increase / Multiplicative Decrease (AIMD) stabilize network bandwidth equilibrium without centralized coordination?',
        correctMechanism: 'It gently adds 1 MSS per RTT while probing, but cuts the congestion window by 50% immediately upon packet loss.',
        keyKeywords: ['Additive +1', 'Multiplicative /2', 'Congestion window', 'Equilibrium'],
        contrastTrap: 'Do not confuse with Slow Start exponential growth (2^n).'
      },
      {
        id: 'net_2',
        domain: 'NETWORKING',
        schemaTitle: 'Computer Networks: TCP Congestion Control',
        sourceSchemaId: 'preset_net',
        stageTitle: 'TCP 3-Way Handshake SYN Flood',
        questionPrompt: 'What exact state vulnerability in the TCP server is exploited during a SYN Flood denial-of-service attack?',
        correctMechanism: 'The server allocates memory in its SYN backlog queue waiting for the final ACK that never arrives from spoofed IPs.',
        keyKeywords: ['SYN backlog queue', 'Half-open connection', 'Memory exhaustion'],
      }
    ]
  },
  {
    title: 'Organic Chemistry: Sn1 vs Sn2 Kinetics',
    domain: 'CHEMISTRY',
    questions: [
      {
        id: 'chem_1',
        domain: 'CHEMISTRY',
        schemaTitle: 'Organic Chemistry: Sn1 vs Sn2 Kinetics',
        sourceSchemaId: 'preset_chem',
        stageTitle: 'Stereochemical Inversion',
        questionPrompt: 'Why does an Sn2 nucleophilic substitution guarantee 100% Walden inversion of stereochemistry, whereas Sn1 causes racemization?',
        correctMechanism: 'Sn2 requires a concerted backside attack opposite the leaving group, while Sn1 forms a planar carbocation intermediate attacked from either face.',
        keyKeywords: ['Backside attack', 'Planar carbocation', 'Walden inversion'],
      }
    ]
  }
];

export function InterleavingDrillModal({
  isOpen,
  onClose,
  savedSchemas,
  onAwardXP
}: InterleavingDrillModalProps) {
  // Selection screen vs Active Workout vs Completed Summary
  const [drillState, setDrillState] = useState<'select' | 'workout' | 'summary'>('select');
  const [selectedSchemaIds, setSelectedSchemaIds] = useState<string[]>(['preset_0', 'preset_1', 'preset_2']);
  
  // Drill Mode: Zen vs Rapid Sprint Timer
  const [isSprintMode, setIsSprintMode] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<number>(25);

  // Active drill workout state
  const [questionsQueue, setQuestionsQueue] = useState<InterleavedQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [userConfidence, setUserConfidence] = useState<'certain' | 'moderate' | 'unsure'>('certain');
  const [isRevealed, setIsRevealed] = useState(false);
  const [streak, setStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [totalXpEarned, setTotalXpEarned] = useState(0);
  const [answersLog, setAnswersLog] = useState<{ 
    question: InterleavedQuestion; 
    passed: boolean; 
    answer: string;
    confidence: 'certain' | 'moderate' | 'unsure';
    timeSpentSec?: number;
  }[]>([]);

  // Build available domains list
  const availableDomains = React.useMemo(() => {
    const list: { id: string; title: string; domain: string; isPreset?: boolean }[] = [];

    // From user saved schemas
    savedSchemas.forEach(s => {
      list.push({
        id: s.id,
        title: s.topicSummary,
        domain: s.topicSummary.split(/[:|-]/)[0].trim().toUpperCase().slice(0, 14),
        isPreset: false
      });
    });

    // Add presets
    PRESET_DOMAINS.forEach((p, idx) => {
      list.push({
        id: `preset_${idx}`,
        title: p.title,
        domain: p.domain,
        isPreset: true
      });
    });

    return list;
  }, [savedSchemas]);

  // Compute Metacognitive Calibration Score
  const metacognitiveStats = React.useMemo(() => {
    if (answersLog.length === 0) return { calibrationScore: 100, feedback: 'N/A' };
    
    let calibratedCount = 0;
    answersLog.forEach(log => {
      if ((log.confidence === 'certain' && log.passed) || (log.confidence === 'unsure' && !log.passed)) {
        calibratedCount += 1;
      } else if (log.confidence === 'moderate') {
        calibratedCount += 0.75;
      }
    });

    const calibrationPct = Math.round((calibratedCount / answersLog.length) * 100);
    let feedback = 'High Metacognitive Precision';
    if (calibrationPct < 60) feedback = 'Hyperconfidence Detected (Overestimating mastery)';
    else if (calibrationPct < 80) feedback = 'Good Metacognitive Awareness';

    return { calibrationScore: calibrationPct, feedback };
  }, [answersLog]);

  // Compute Domain Breakdown
  const domainBreakdown = React.useMemo(() => {
    const map: Record<string, { total: number; passed: number }> = {};
    answersLog.forEach(item => {
      const dom = item.question.domain;
      if (!map[dom]) map[dom] = { total: 0, passed: 0 };
      map[dom].total += 1;
      if (item.passed) map[dom].passed += 1;
    });
    return map;
  }, [answersLog]);

  // Sprint mode timer
  useEffect(() => {
    if (!isOpen || drillState !== 'workout' || !isSprintMode || isRevealed) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setIsRevealed(true);
          playSound('error');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, drillState, isSprintMode, isRevealed]);

  if (!isOpen) return null;

  const toggleSchemaSelection = (id: string) => {
    if (selectedSchemaIds.includes(id)) {
      if (selectedSchemaIds.length > 2) {
        setSelectedSchemaIds(selectedSchemaIds.filter(i => i !== id));
      }
    } else {
      if (selectedSchemaIds.length < 4) {
        setSelectedSchemaIds([...selectedSchemaIds, id]);
      }
    }
  };

  const handleStartWorkout = () => {
    // Generate questions from chosen domains
    const generatedQuestions: InterleavedQuestion[] = [];

    selectedSchemaIds.forEach(id => {
      // Check if it is a preset
      const presetIdx = id.startsWith('preset_') ? parseInt(id.replace('preset_', ''), 10) : -1;
      if (presetIdx >= 0 && PRESET_DOMAINS[presetIdx]) {
        generatedQuestions.push(...PRESET_DOMAINS[presetIdx].questions);
      } else {
        // Find in saved schemas
        const schema = savedSchemas.find(s => s.id === id);
        if (schema) {
          schema.activities.forEach((act, actIdx) => {
            const domainName = schema.topicSummary.split(/[:|-]/)[0].trim().toUpperCase().slice(0, 14);
            generatedQuestions.push({
              id: `${schema.id}_${actIdx}`,
              domain: domainName,
              schemaTitle: schema.topicSummary,
              sourceSchemaId: schema.id,
              stageTitle: act.title,
              questionPrompt: `In the context of ${schema.topicSummary}: ${act.prompt}`,
              correctMechanism: act.scaffold.exampleAnswer || act.contextSnippet,
              keyKeywords: act.keywords,
              contrastTrap: `Differentiate from other domains: What is the defining causal rule here?`
            });
          });
        }
      }
    });

    // Shuffle questions across domains to maximize interleaving
    const shuffled = [...generatedQuestions].sort(() => Math.random() - 0.5);

    setQuestionsQueue(shuffled);
    setCurrentIndex(0);
    setUserAnswer('');
    setUserConfidence('certain');
    setIsRevealed(false);
    setStreak(0);
    setScore(0);
    setTotalXpEarned(0);
    setTimeLeft(25);
    setAnswersLog([]);
    setDrillState('workout');
    playSound('click');
  };

  const currentQ = questionsQueue[currentIndex];

  const handleGrade = (passed: boolean) => {
    const newStreak = passed ? streak + 1 : 0;
    setStreak(newStreak);

    // Speed bonus for fast recall in Sprint Mode
    const speedBonus = isSprintMode && timeLeft > 10 && passed ? 15 : 0;
    
    // Metacognitive Calibration Bonus
    const calibrationBonus = passed && userConfidence === 'certain' ? 15 : 0;

    const xpForThis = (passed ? 35 + (newStreak * 10) : 10) + speedBonus + calibrationBonus;
    const newTotalXp = totalXpEarned + xpForThis;
    setTotalXpEarned(newTotalXp);
    setScore(prev => prev + (passed ? 1 : 0));

    setAnswersLog(prev => [
      ...prev,
      { 
        question: currentQ, 
        passed, 
        answer: userAnswer,
        confidence: userConfidence,
        timeSpentSec: isSprintMode ? (25 - timeLeft) : undefined
      }
    ]);

    if (passed) {
      playSound('success');
    } else {
      playSound('error');
    }

    if (currentIndex + 1 < questionsQueue.length) {
      setCurrentIndex(prev => prev + 1);
      setUserAnswer('');
      setUserConfidence('certain');
      setIsRevealed(false);
      setTimeLeft(25);
    } else {
      onAwardXP(newTotalXp);
      setDrillState('summary');
      playSound('streak');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-2xl bg-slate-900 border border-violet-500/30 rounded-2xl shadow-2xl overflow-hidden p-5 sm:p-6 space-y-5 my-8"
      >
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-violet-600/20 border border-violet-500/40 text-violet-400">
              <Shuffle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>The Interleaving Workout</span>
                <span className="px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 text-[10px] font-black uppercase">
                  Multi-Domain Drill
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Cognitive Science: Mixing diverse domains forces rapid discrimination and builds superior synaptic retention.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg bg-slate-800 text-xs font-semibold"
          >
            ✕
          </button>
        </div>

        {/* 1. SELECTION SCREEN */}
        {drillState === 'select' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-200 uppercase tracking-wider block">
                Select 2 to 4 Distinct Domains to Interleave:
              </label>
              <p className="text-xs text-slate-400">
                The engine will mix active recall questions between these subjects unpredictably.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
              {availableDomains.map((dom) => {
                const isSelected = selectedSchemaIds.includes(dom.id);
                return (
                  <button
                    key={dom.id}
                    type="button"
                    onClick={() => toggleSchemaSelection(dom.id)}
                    className={`flex items-start justify-between p-3 rounded-xl text-left border transition-all ${
                      isSelected
                        ? 'bg-violet-950/40 border-violet-500 text-white ring-1 ring-violet-500/50'
                        : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/60 text-slate-300'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 text-violet-300 uppercase mb-1 inline-block">
                        {dom.domain}
                      </span>
                      <p className="text-xs font-semibold line-clamp-2">
                        {dom.title}
                      </p>
                    </div>

                    <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 border ${
                      isSelected
                        ? 'bg-violet-600 border-violet-400 text-white'
                        : 'border-slate-600 bg-slate-900 text-transparent'
                    }`}>
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Mode Switcher: Zen Untimed vs Sprint Blitz */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-violet-400" />
                <div>
                  <span className="text-xs font-bold text-slate-200 block">
                    Rapid Recall Sprint Mode
                  </span>
                  <span className="text-[11px] text-slate-400">
                    25-second countdown per card with rapid-retrieval bonus (+15 XP)
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsSprintMode(!isSprintMode);
                  playSound('click');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                  isSprintMode
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {isSprintMode ? '⚡ 25s Sprint Active' : '🧘 Untimed Zen'}
              </button>
            </div>

            {/* Start CTA */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <span className="text-xs text-slate-400">
                Selected: <strong className="text-violet-300">{selectedSchemaIds.length}</strong> domains
              </span>

              <button
                type="button"
                onClick={handleStartWorkout}
                disabled={selectedSchemaIds.length < 2}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-violet-600/20 disabled:opacity-50 transition-all cursor-pointer"
              >
                <Zap className="w-4 h-4 fill-white" />
                <span>Begin Interleaved Drill ({selectedSchemaIds.length} Domains)</span>
              </button>
            </div>
          </div>
        )}

        {/* 2. ACTIVE DRILL WORKOUT */}
        {drillState === 'workout' && currentQ && (
          <div className="space-y-4">
            {/* Progress & Streak Bar */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-medium">
                  Card {currentIndex + 1} of {questionsQueue.length}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-violet-500/20 text-violet-300 text-[10px] font-mono font-bold uppercase border border-violet-500/30">
                  {currentQ.domain}
                </span>
              </div>

              <div className="flex items-center gap-3">
                {isSprintMode && (
                  <span className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold border flex items-center gap-1 ${
                    timeLeft <= 7 
                      ? 'bg-red-500/20 text-red-400 border-red-500/50 animate-pulse' 
                      : 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}>
                    <Clock className="w-3 h-3" />
                    {timeLeft}s
                  </span>
                )}
                {streak > 1 && (
                  <span className="flex items-center gap-1 text-orange-400 font-bold animate-pulse">
                    <Flame className="w-4 h-4 fill-orange-400" />
                    {streak}x Combo!
                  </span>
                )}
                <span className="text-amber-400 font-bold">
                  +{totalXpEarned} XP
                </span>
              </div>
            </div>

            {/* Timer Progress Bar (Sprint Mode) */}
            {isSprintMode && !isRevealed && (
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-1000 ${
                    timeLeft <= 7 ? 'bg-red-500' : 'bg-gradient-to-r from-violet-500 to-amber-400'
                  }`}
                  style={{ width: `${(timeLeft / 25) * 100}%` }}
                />
              </div>
            )}

            {/* Question Card */}
            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 shadow-inner">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="font-semibold text-slate-300">
                  {currentQ.schemaTitle}
                </span>
                <span className="text-violet-400 font-mono">
                  {currentQ.stageTitle}
                </span>
              </div>

              <h3 className="text-sm sm:text-base font-bold text-slate-100 leading-snug">
                {currentQ.questionPrompt}
              </h3>

              {currentQ.contrastTrap && (
                <p className="text-xs text-amber-400/90 italic bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg">
                  ⚠️ Interleaving Contrast Trap: {currentQ.contrastTrap}
                </p>
              )}
            </div>

            {/* Answer Input or Self-Reveal */}
            {!isRevealed ? (
              <div className="space-y-3">
                <textarea
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  placeholder="Type your rapid active recall or think it through..."
                  rows={3}
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none font-sans"
                />

                {/* Metacognitive Confidence Predictor */}
                <div className="space-y-1.5 bg-slate-950/60 border border-slate-800/80 p-3 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Metacognitive Calibration — Predicted Confidence:
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setUserConfidence('certain')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all ${
                        userConfidence === 'certain'
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold shadow-sm'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      🟢 Certain (100%)
                    </button>
                    <button
                      type="button"
                      onClick={() => setUserConfidence('moderate')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all ${
                        userConfidence === 'moderate'
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold shadow-sm'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      🟡 Moderate (50%)
                    </button>
                    <button
                      type="button"
                      onClick={() => setUserConfidence('unsure')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all ${
                        userConfidence === 'unsure'
                          ? 'bg-rose-500/20 border-rose-500 text-rose-300 font-bold shadow-sm'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      🔴 Unsure / Guess
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-slate-500">
                    Formulate hypothesis before flipping
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      setIsRevealed(true);
                      playSound('pop');
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 cursor-pointer"
                  >
                    <span>Check Mechanism</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Correct Mechanism Box */}
                <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block">
                      Core Mechanism / Target Answer:
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded">
                      Confidence: {userConfidence.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-emerald-100 font-medium leading-relaxed">
                    {currentQ.correctMechanism}
                  </p>

                  {currentQ.keyKeywords && currentQ.keyKeywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {currentQ.keyKeywords.map((kw, i) => (
                        <span key={i} className="px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-300 text-[10px] font-semibold">
                          #{kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {userAnswer && (
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300">
                    <span className="text-[10px] text-slate-500 block mb-0.5">Your Response:</span>
                    <p className="italic">{userAnswer}</p>
                  </div>
                )}

                {/* Self-Grade Buttons */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => handleGrade(false)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/40 font-bold text-xs transition-colors cursor-pointer"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Missed / Hesitated (+10 XP)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleGrade(true)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Mastered Mechanism (+{35 + ((streak + 1) * 10)} XP)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. WORKOUT SUMMARY */}
        {drillState === 'summary' && (
          <div className="space-y-5 text-center py-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 mx-auto">
              <Award className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white">
                Interleaving Workout Complete!
              </h3>
              <p className="text-xs text-slate-300 max-w-md mx-auto">
                By rapidly alternating between distinct domains, you trained cognitive discrimination and prevented mental fixation.
              </p>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-w-lg mx-auto">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase block">Accuracy</span>
                <span className="text-base font-bold text-emerald-400">
                  {Math.round((score / Math.max(1, questionsQueue.length)) * 100)}%
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase block">XP Earned</span>
                <span className="text-base font-bold text-amber-400">
                  +{totalXpEarned}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase block">Calibration</span>
                <span className="text-base font-bold text-cyan-400">
                  {metacognitiveStats.calibrationScore}%
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase block">Domains</span>
                <span className="text-base font-bold text-violet-400">
                  {selectedSchemaIds.length}
                </span>
              </div>
            </div>

            {/* Metacognitive Insight Box */}
            <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/30 text-left max-w-lg mx-auto">
              <div className="flex items-center gap-2 text-cyan-300 text-xs font-bold mb-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Metacognitive Insight: {metacognitiveStats.feedback}</span>
              </div>
              <p className="text-[11px] text-slate-300">
                Calibration measures whether your subjective certainty matched your objective recall accuracy. High calibration prevents the illusion of competence.
              </p>
            </div>

            {/* Domain Breakdown Table */}
            {Object.keys(domainBreakdown).length > 0 && (
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-left max-w-lg mx-auto space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Domain Performance Breakdown:
                </span>
                <div className="space-y-1.5">
                  {Object.entries(domainBreakdown).map(([domain, stats]) => {
                    const pct = Math.round((stats.passed / Math.max(1, stats.total)) * 100);
                    return (
                      <div key={domain} className="flex items-center justify-between text-xs border-b border-slate-800/60 pb-1">
                        <span className="font-semibold text-slate-300">{domain}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-400 font-mono">
                            {stats.passed} / {stats.total}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            pct >= 80 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                          }`}>
                            {pct}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDrillState('select')}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white flex items-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>New Drill</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-violet-600/20 cursor-pointer"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
