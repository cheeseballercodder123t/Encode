'use client';
import React from 'react';
import { motion } from 'motion/react';
import { Brain, Star, TrendingUp, TrendingDown, Minus, Sparkles, BarChart2, Loader2 } from 'lucide-react';
import { Modal, Button, Badge, Card, CardContent } from './ui/index';

interface PerStageGrade {
  stageTitle: string;
  grade: 'mastered' | 'good' | 'needs_elaboration';
  score: number;
  feedback: string;
}

export interface EndSessionReviewData {
  overallScore: number;
  analysis: string;
  perStageGrades: PerStageGrade[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  preSessionConfidence: number;
  sessionData: EndSessionReviewData | null;
  isLoading: boolean;
  topicSummary: string;
}

const GRADE_COLORS: Record<string, string> = {
  mastered: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  good: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  needs_elaboration: 'text-red-400 bg-red-500/10 border-red-500/30',
};

const GRADE_LABELS: Record<string, string> = {
  mastered: 'Mastered',
  good: 'Good',
  needs_elaboration: 'Needs Work',
};

export function EndSessionReviewModal({ isOpen, onClose, preSessionConfidence, sessionData, isLoading, topicSummary }: Props) {
  const confidenceLabel = ['Clueless', 'Shaky', 'Decent', 'Confident', 'Expert'][preSessionConfidence - 1] || '';
  const confidenceNorm = Math.round((preSessionConfidence / 5) * 100);
  const aiScore = sessionData?.overallScore || 0;
  const delta = aiScore - confidenceNorm;

  const DeltaIcon = delta > 10 ? TrendingUp : delta < -10 ? TrendingDown : Minus;
  const deltaColor = delta > 10 ? 'text-emerald-400' : delta < -10 ? 'text-red-400' : 'text-slate-400';
  const deltaLabel = delta > 10
    ? 'You underestimated yourself — your actual grasp is stronger than you thought!'
    : delta < -10
    ? 'You overestimated your knowledge — this is common and normal. Revisit the weaker stages.'
    : 'Your self-assessment was well-calibrated. Solid metacognitive awareness.';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="2xl"
      icon={
        <div className="p-2 bg-indigo-500/10 border border-indigo-500/30 rounded-xl">
          <Brain className="w-5 h-5 text-indigo-400 animate-pulse" />
        </div>
      }
      title="Session Performance Review"
      description={topicSummary}
      footer={
        <Button variant="primary" size="md" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-5">
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
            <p className="text-sm">Analyzing your session with the Feynman evaluator...</p>
          </div>
        )}

        {!isLoading && sessionData && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Card glass={true} hoverEffect={false}>
                <CardContent className="space-y-3">
                  <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Your Pre-session Confidence</p>
                  <div className="flex items-center gap-1.5">
                    {[1,2,3,4,5].map(n => (
                      <Star key={n} className={`w-5 h-5 ${n <= preSessionConfidence ? 'text-amber-400 fill-amber-400' : 'text-slate-700 fill-slate-800'}`} />
                    ))}
                  </div>
                  <div>
                    <p className="text-2xl font-black text-amber-400">{preSessionConfidence}<span className="text-base font-normal text-slate-500">/5</span></p>
                    <p className="text-xs text-slate-400">{confidenceLabel}</p>
                  </div>
                </CardContent>
              </Card>

              <Card glass={true} hoverEffect={false}>
                <CardContent className="space-y-3">
                  <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">AI Performance Score</p>
                  <div className="w-full bg-slate-700/50 rounded-full h-2">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${aiScore}%` }}
                      transition={{ duration: 1, ease: 'easeOut' }}
                      className={`h-2 rounded-full ${aiScore >= 80 ? 'bg-emerald-500' : aiScore >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                    />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-white">{aiScore}<span className="text-base font-normal text-slate-500">/100</span></p>
                    <p className="text-xs text-slate-400">{aiScore >= 80 ? 'Excellent grasp' : aiScore >= 60 ? 'Solid foundation' : 'Needs more encoding'}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card glass={true} hoverEffect={false} className={`border ${delta > 10 ? 'border-emerald-500/20' : delta < -10 ? 'border-red-500/20' : 'border-slate-700/50'}`}>
              <CardContent className="flex items-start gap-3">
                <DeltaIcon className={`w-5 h-5 mt-0.5 shrink-0 ${deltaColor}`} />
                <div>
                  <p className={`text-sm font-semibold ${deltaColor}`}>
                    {delta > 10 ? `+${delta} pts above your estimate` : delta < -10 ? `${Math.abs(delta)} pts below your estimate` : 'Calibration: On target'}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{deltaLabel}</p>
                </div>
              </CardContent>
            </Card>

            <Card glass={true} hoverEffect={false} className="border-indigo-500/20">
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">AI Analysis</p>
                </div>
                <p className="text-sm text-slate-200 leading-relaxed font-serif">{sessionData.analysis}</p>
              </CardContent>
            </Card>

            {sessionData.perStageGrades && sessionData.perStageGrades.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-slate-400" />
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Stage Breakdown</p>
                </div>
                <div className="space-y-2">
                  {sessionData.perStageGrades.map((g, i) => (
                    <Card key={i} glass={true} hoverEffect={false} className="border-slate-700/40">
                      <CardContent className="flex items-start gap-3 p-3">
                        <Badge 
                          variant={g.grade === 'mastered' ? 'emerald' : g.grade === 'good' ? 'amber' : 'rose'} 
                          size="xs"
                        >
                          {GRADE_LABELS[g.grade] || g.grade}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-slate-200 font-medium truncate">{g.stageTitle}</p>
                          <p className="text-xs text-slate-400 mt-0.5 font-serif">{g.feedback}</p>
                        </div>
                        <span className="text-sm font-black text-slate-300 shrink-0">{g.score}</span>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
