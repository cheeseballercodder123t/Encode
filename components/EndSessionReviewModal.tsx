'use client';
import { motion } from 'motion/react';
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

const GRADE_LABELS: Record<string, string> = {
  mastered: 'MASTERED',
  good: 'GOOD',
  needs_elaboration: 'NEEDS WORK',
};

export function EndSessionReviewModal(props: Props) {
  const { isOpen, onClose, preSessionConfidence, sessionData, isLoading, topicSummary } = props;
  const confidenceNorm = Math.round((preSessionConfidence / 5) * 100);
  const aiScore = sessionData ? sessionData.overallScore : 0;
  const delta = aiScore - confidenceNorm;
  const deltaLabel = delta > 10
    ? 'You underestimated yourself. Stronger grasp than you thought.'
    : delta < -10
    ? 'You overestimated. Common and normal. Revisit weaker stages.'
    : 'Well-calibrated self-assessment. Solid metacognition.';
  const deltaTone = delta > 10 ? 'text-amber' : delta < -10 ? 'text-hazard' : 'text-bone';
  const deltaBorder = delta > 10 ? 'border-amber' : delta < -10 ? 'border-hazard' : 'border-steel';
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="2xl"
      icon={<span className="text-amber">[ EVALUATOR ]</span>}
      title="SESSION PERFORMANCE REVIEW"
      description={topicSummary}
      footer={
        <Button variant="primary" size="md" onClick={onClose}>
          [ DONE ]
        </Button>
      }
    >
      <div className="space-y-3">
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-solder font-mono">
            <p className="text-xs ">PROCESSING SESSION WITH FEYNMAN EVALUATOR...</p>
          </div>
        )}
        {!isLoading && sessionData && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Card>
                <CardContent className="space-y-2">
                  <p className="text-[10px] text-solder uppercase tracking-wider">Pre-session confidence</p>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(function (n) {
                      return (
                        <span key={n} className="text-[10px] font-mono text-amber">
                          {n <= preSessionConfidence ? '[X]' : '[ ]'}
                        </span>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-solder">{preSessionConfidence}/5</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="space-y-2">
                  <p className="text-[10px] text-solder uppercase tracking-wider">AI score</p>
                  <div className="w-full bg-chassis h-2">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: aiScore + '%' }}
                      transition-none={{ duration: 1, ease: 'easeOut' }}
                      className="h-2 bg-amber"
                    />
                  </div>
                  <p className="text-xl font-bold text-bone">{aiScore}<span className="text-[10px] text-solder">/100</span></p>
                  <p className="text-[10px] text-solder">Needs more encoding</p>
                </CardContent>
              </Card>
            </div>
            <Card className={'border ' + deltaBorder}>
              <CardContent className="flex items-start gap-2">
                <span className="text-[10px] font-mono text-solder">[CALIBRATION]</span>
                <div>
                  <p className={'text-xs font-bold ' + deltaTone}>{deltaLabel}</p>
                  <p className="text-[10px] text-solder mt-0.5">Delta: {delta} pts vs estimate</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-1">
                <p className="text-[10px] text-solder uppercase tracking-wider">AI analysis</p>
                <p className="text-xs text-bone leading-relaxed">{sessionData.analysis}</p>
              </CardContent>
            </Card>
            {sessionData.perStageGrades && sessionData.perStageGrades.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] text-solder uppercase tracking-wider">Stage breakdown</p>
                {sessionData.perStageGrades.map(function (g, i) {
                  return (
                    <Card key={i}>
                      <CardContent className="flex items-start gap-2 p-2">
                        <Badge
                          variant={g.grade === 'mastered' ? 'amber' : g.grade === 'good' ? 'bone' : 'hazard'}
                          size="xs"
                        >
                          {GRADE_LABELS[g.grade] || g.grade}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-bone truncate">{g.stageTitle}</p>
                          <p className="text-[10px] text-solder mt-0.5">{g.feedback}</p>
                        </div>
                        <span className="text-xs font-bold text-bone shrink-0">{g.score}</span>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
