import React, { useState } from 'react';
import { motion } from 'motion/react';
import { PretestSession, PretestQuestion } from '@/lib/types';
import { playSound } from '@/lib/audio';
import { saveInterferenceTrap, ConfidenceTier } from '@/lib/interference-traps';

/**
 * Predict–Observe–Explain gate.
 *
 * Physics-education research is blunt about this: you learn radically faster
 * when you commit to a concrete prediction BEFORE seeing the truth. So the
 * learner clicks a confidence tier (the hypercorrection multiplier), clicks one
 * of four concrete predictions, and only then sees the reveal.
 *
 * The sting is calibrated by confidence. Wrong while guessing is a shrug. Wrong
 * while betting your life is the Hypercorrection Effect — the surprise is
 * intense and the correction sticks near-permanently — so THAT case gets the
 * hazard-red treatment, forces a one-sentence explanation of the physical flaw,
 * and is captured as an interference-trap card that ships to Anki.
 */

interface PretestModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: PretestSession | null;
  onPretestComplete: () => void;
}

const TIERS: { id: ConfidenceTier; label: string; hint: string; weight: number }[] = [
  { id: 'guess', label: 'Guessing', hint: 'No idea — a coin flip.', weight: 0 },
  { id: 'half', label: '50/50', hint: 'Two options feel plausible.', weight: 1 },
  { id: 'bet', label: 'Bet my life', hint: 'I am certain. This is obvious.', weight: 2 },
];

export const PretestModal: React.FC<PretestModalProps> = ({
  isOpen,
  onClose,
  session,
  onPretestComplete,
}) => {
  const [tiers, setTiers] = useState<Record<string, ConfidenceTier>>({});
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [flaws, setFlaws] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  if (!isOpen || !session) return null;

  const totalQuestions = session.questions.length;
  const committedCount = Object.keys(picks).length;
  const allAnswered = totalQuestions > 0 && committedCount >= totalQuestions;

  const commit = (q: PretestQuestion, optionId: string) => {
    if (picks[q.id]) return;
    const isRight = optionId === q.correctOptionId;
    if (isRight) playSound('success');
    else playSound('wrong');
    setPicks((prev) => ({ ...prev, [q.id]: optionId }));
  };

  const saveTrap = (q: PretestQuestion) => {
    const tier = tiers[q.id] || 'guess';
    const pickedId = picks[q.id];
    const pickedLabel = q.options?.find((o) => o.id === pickedId)?.label || '';
    const correctLabel = q.options?.find((o) => o.id === q.correctOptionId)?.label || '';
    saveInterferenceTrap({
      topic: session.topic,
      question: q.questionPrompt,
      committedAnswer: pickedLabel,
      correctAnswer: correctLabel || q.firstPrincipleAnswer,
      confidenceTier: tier,
      flawExplanation: (flaws[q.id] || '').trim(),
      cardFront:
        q.trapCardFront ||
        `Why is “${pickedLabel}” wrong here, and what actually forces the correct answer?`,
      cardBack:
        q.trapCardBack ||
        `${q.firstPrincipleAnswer}${flaws[q.id] ? ` Your correction: {{c1::${flaws[q.id].trim()}}}` : ''}`,
    });
    setSaved((prev) => ({ ...prev, [q.id]: true }));
    playSound('levelUp');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-chassis/80 p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl bg-deck border border-edge/30 p-6 text-bone relative my-8"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-edge pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-inset/20 border border-edge/40 flex items-center justify-center text-bone">
              <span className="text-amber font-bold font-mono">[ ZAP ]</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider bg-inset/20 text-bone border border-edge/30">
                  Predict · Observe · Explain
                </span>
                <span className="text-xs text-solder">Prediction error drill</span>
              </div>
              <h2 className="text-lg font-bold text-bone mt-0.5">
                Blind Prediction Gate: {session.topic}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 text-solder hover:text-bone hover:bg-inset transition-none"
          >
            <span className="text-amber font-bold font-mono">[ X ]</span>
          </button>
        </div>

        {/* Cognitive science explanation */}
        <div className="bg-inset/30 border border-edge/30 p-4 mb-6 text-xs text-bone/90 flex items-start gap-3">
          <span className="text-amber font-bold font-mono">[ BRAIN ]</span>
          <div>
            <p className="font-semibold text-bone">
              Commit first, or the explanation won&apos;t stick:
            </p>
            <p className="mt-1 leading-relaxed text-bone/70">
              {session.scientificRationale ||
                'A committed prediction makes the reveal land as a prediction error. Confident and wrong is the strongest encoding signal there is (Butterfield & Metcalfe).'}
            </p>
          </div>
        </div>

        {/* Gates */}
        <div className="space-y-6 max-h-[52vh] overflow-y-auto pr-1">
          {session.questions.map((q: PretestQuestion, idx: number) => {
            const tier = tiers[q.id];
            const pickedId = picks[q.id];
            const committed = pickedId !== undefined;
            const isRight = committed && pickedId === q.correctOptionId;
            const pickedTrap = pickedId === q.trapOptionId;
            const hypercorrected = committed && !isRight && tier === 'bet';
            const options = q.options || [];

            return (
              <div
                key={q.id || idx}
                className={`border p-4 transition-all bg-inset/40 ${
                  hypercorrected ? 'border-hazard-500/70' : 'border-edge/80'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-bone">
                    Prediction #{q.questionNumber || idx + 1}
                  </span>
                  {committed ? (
                    <span
                      className={`text-[11px] font-semibold ${
                        isRight ? 'text-signal-300' : hypercorrected ? 'text-hazard-300' : 'text-amber'
                      }`}
                    >
                      {isRight ? '[ OK ] Called it' : '[ ! ] Prediction error logged'}
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-solder">
                      [ LOCK ] Commit to unlock
                    </span>
                  )}
                </div>

                <p className="text-sm font-semibold text-bone mb-3">{q.questionPrompt}</p>

                {/* Step 1 : confidence tier (the hypercorrection multiplier) */}
                {!committed && options.length > 0 && (
                  <div className="mb-3 space-y-1.5">
                    <span className="text-[10px] uppercase tracking-widest text-solder block">
                      How confident are you?
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {TIERS.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          title={t.hint}
                          aria-pressed={tier === t.id}
                          data-testid={`tier-${q.id}-${t.id}`}
                          onClick={() => {
                            setTiers((prev) => ({ ...prev, [q.id]: t.id }));
                            playSound('click');
                          }}
                          className={`px-2.5 py-1.5 text-[11px] rounded-md border transition-colors duration-150 cursor-pointer ${
                            tier === t.id
                              ? t.id === 'bet'
                                ? 'bg-hazard-500/20 border-hazard-500/60 text-hazard-200'
                                : 'bg-amber-500/20 border-amber-500/60 text-amber-200'
                              : 'bg-deck border-edge text-slate-ink hover:text-bone'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step 2 : commit to a concrete prediction */}
                {options.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {options.map((o) => {
                      const isThePick = pickedId === o.id;
                      const isTruth = o.id === q.correctOptionId;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          disabled={committed || !tier}
                          data-testid={`option-${q.id}-${o.id}`}
                          onClick={() => commit(q, o.id)}
                          className={`text-left p-2.5 rounded-md border text-xs leading-relaxed transition-colors duration-150 disabled:cursor-default cursor-pointer ${
                            committed && isTruth
                              ? 'bg-signal-950/40 border-signal-500/50 text-signal-200'
                              : isThePick
                                ? 'bg-hazard-950/40 border-hazard-500/60 text-hazard-200'
                                : 'bg-deck border-edge text-slate-ink hover:text-bone hover:border-slate-ink/40 disabled:opacity-60'
                          }`}
                        >
                          {o.label}
                          {committed && isThePick && (
                            <span className="block mt-1 font-mono text-[10px] uppercase tracking-widest opacity-80">
                              your prediction
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  /* Legacy open-ended gate : still supported when the model returns no options. */
                  <div className="text-xs text-solder">
                    {committed ? (
                      <span className="text-bone">{q.firstPrincipleAnswer}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => commit(q, 'open')}
                        className="px-3 py-1.5 text-xs font-bold text-bone bg-inset border border-edge rounded-md cursor-pointer"
                      >
                        I&apos;ve committed to a hypothesis
                      </button>
                    )}
                  </div>
                )}

                {!committed && options.length > 0 && !tier && (
                  <p className="mt-2 text-[10px] text-solder">
                    Pick a confidence level first — it decides how hard the reveal lands.
                  </p>
                )}

                {/* Step 3 : observe + explain */}
                {committed && (
                  <div className="mt-3 space-y-2.5">
                    {hypercorrected && (
                      <div className="p-3 bg-hazard-500/10 border border-hazard-500/60 text-xs text-hazard-200 leading-relaxed">
                        <span className="font-bold block mb-1">
                          [ HYPERCORRECTION ] You bet your life and it was the trap.
                        </span>
                        The surprise is the point — this exact correction is what survives. Explain the
                        physical flaw, in your own words, and it becomes a permanent card.
                        {pickedTrap && (
                          <span className="block mt-1.5 text-hazard-300/90">
                            You picked the classic misconception, which is exactly why it is now worth a
                            card.
                          </span>
                        )}
                      </div>
                    )}

                    <div className="p-3 bg-amber/30 border border-amber/30 text-xs text-amber/90">
                      <span className="font-bold text-amber block mb-1">
                        [ ! ] Why the trap feels true:
                      </span>
                      {q.subtleTrap}
                    </div>

                    <div className="p-3 bg-amber-950/30 border border-amber/30 text-xs text-amber-200/90">
                      <span className="font-bold text-amber block mb-1">
                        True first-principles mechanism:
                      </span>
                      {q.firstPrincipleAnswer}
                    </div>

                    {q.whyAttemptingMatters && (
                      <p className="text-[11px] text-solder leading-relaxed">
                        {q.whyAttemptingMatters}
                      </p>
                    )}

                    {/* The forced explanation — only when the sting actually fired. */}
                    {!isRight && (
                      <div className="space-y-1.5">
                        <label
                          htmlFor={`flaw-${q.id}`}
                          className="text-[10px] uppercase tracking-widest text-solder block"
                        >
                          {hypercorrected
                            ? 'Explain the physical flaw in one sentence (required for the card)'
                            : 'Explain what forced the correct answer (optional)'}
                        </label>
                        <textarea
                          id={`flaw-${q.id}`}
                          rows={2}
                          value={flaws[q.id] || ''}
                          onChange={(e) =>
                            setFlaws((prev) => ({ ...prev, [q.id]: e.target.value }))
                          }
                          placeholder="Breaking a bond requires energy input because..."
                          data-testid={`flaw-${q.id}`}
                          className="w-full p-2.5 bg-deck border border-edge text-xs text-bone placeholder-solder focus:outline-none focus:border-amber-500/60 resize-none font-sans"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={hypercorrected ? !(flaws[q.id] || '').trim() : false}
                            onClick={() => saveTrap(q)}
                            data-testid={`save-trap-${q.id}`}
                            className="px-3 py-1.5 text-[11px] font-bold rounded-md bg-amber-500 border border-amber-500 text-inset hover:bg-amber-400 transition-colors duration-150 disabled:opacity-40 cursor-pointer"
                          >
                            {saved[q.id] ? 'Trap card saved' : 'Save interference trap card'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-edge flex items-center justify-between">
          <div className="text-xs text-solder">
            {committedCount} of {totalQuestions} predictions committed
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-solder hover:text-bone bg-inset/80 transition-none"
            >
              Skip
            </button>
            <button
              onClick={() => {
                playSound('success');
                onPretestComplete();
              }}
              className="px-5 py-2.5 text-xs font-bold text-bone hover:bg-deck flex items-center gap-2 transition-none"
            >
              <span>{allAnswered ? 'Reveal Encoded Schema' : 'Continue to Schema'}</span>
              <span className="text-amber font-bold font-mono">[ NEXT ]</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
