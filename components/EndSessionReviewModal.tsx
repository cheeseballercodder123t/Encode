'use client';
import { motion } from 'motion/react';
import { Modal, Button, Badge, Card, CardContent } from './ui/index';

interface PerStageRead {
  stageTitle: string;
  /** True when that stage's causal mechanism landed. */
  secured: boolean;
  /** The one edge-case question still open for that stage, if any. */
  counterProbe: string;
  feedback: string;
}

export interface EndSessionReviewData {
  analysis: string;
  perStageGrades: PerStageRead[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  preSessionConfidence: number;
  sessionData: EndSessionReviewData | null;
  isLoading: boolean;
  topicSummary: string;
}

/**
 * The end-of-session read.
 *
 * This used to be a performance review: an AI score out of 100, a calibration
 * delta in "pts vs estimate", and a per-stage grade with a number beside it.
 * That is a report card, and a report card is the exact thing that made
 * encoding feel like homework. What is left is the part that actually helps:
 * which mechanisms landed, which still have a link open, and the one question
 * worth answering for each of those.
 */
export function EndSessionReviewModal(props: Props) {
  const { isOpen, onClose, sessionData, isLoading, topicSummary } = props;

  const stages = sessionData?.perStageGrades ?? [];
  const landed = stages.filter((s) => s.secured).length;
  const open = stages.filter((s) => !s.secured);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="2xl"
      icon={<span className="text-amber">[ READOUT ]</span>}
      title="SESSION READOUT"
      description={topicSummary}
      footer={
        <Button variant="primary" size="md" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-3">
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-solder font-mono">
            <p className="text-xs">READING WHAT LANDED...</p>
          </div>
        )}

        {!isLoading && sessionData && (
          <div className="space-y-3">
            {/* The headline is a count of mechanisms owned, not a percentage. */}
            <Card className="border-edge">
              <CardContent className="space-y-1">
                <p className="text-[10px] text-solder uppercase tracking-wider">Mental models secured</p>
                <p className="text-sm font-semibold text-bone">
                  {landed} of {stages.length} stage{stages.length === 1 ? '' : 's'} landed
                </p>
                <p className="text-[11px] text-solder leading-relaxed">
                  Every one of those is a card you reasoned your way to, which is why none of them
                  will turn into a leech three weeks from now.
                </p>
              </CardContent>
            </Card>

            {sessionData.analysis && (
              <Card>
                <CardContent className="space-y-1">
                  <p className="text-[10px] text-solder uppercase tracking-wider">What you demonstrated</p>
                  <p className="text-xs text-bone leading-relaxed">{sessionData.analysis}</p>
                </CardContent>
              </Card>
            )}

            {stages.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] text-solder uppercase tracking-wider">Stage by stage</p>
                {stages.map((s, i) => (
                  <Card key={i}>
                    <CardContent className="flex items-start gap-2 p-2">
                      <Badge variant={s.secured ? 'bone' : 'hazard'} size="xs">
                        {s.secured ? 'LANDED' : 'OPEN'}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-bone truncate">{s.stageTitle}</p>
                        {s.feedback && (
                          <p className="text-[10px] text-solder mt-0.5">{s.feedback}</p>
                        )}
                        {s.counterProbe && (
                          <p className="text-[10px] text-amber-300 mt-1 leading-relaxed">
                            Still worth answering: {s.counterProbe}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* The open mechanisms are a next step, not a failing mark. */}
            {open.length > 0 && (
              <div className="p-3 bg-inset border border-edge rounded-md flex items-start gap-2">
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-[10px] font-mono text-solder shrink-0 pt-0.5"
                >
                  NEXT
                </motion.span>
                <p className="text-[11px] text-slate-ink leading-relaxed">
                  {open.length === 1 ? 'One stage is' : `${open.length} stages are`} still open. Nothing
                  was thrown away: reopen the session and the cards are already there, waiting on the
                  one missing link.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
