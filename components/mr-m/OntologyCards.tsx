'use client';

import React from 'react';
import type { InterventionProps } from '@/lib/mr-m/registry';
import { payloadFor } from '@/lib/mr-m/registry';
import type { OntologyCard } from '@/lib/mr-m/types';

/**
 * Ontology cards: the physical identity of every letter.
 *
 * The learner this serves does not accept a symbol that has no physical
 * reality behind it — an `m` that could be the water, the solid or both is
 * numerology, not science, and a formula built out of it cannot be trusted.
 * So each letter gets one card that answers, in order: what it physically IS,
 * what unit it is measured in, what it is commonly mistaken for, and what the
 * readout does when it doubles.
 *
 * `whatItIsNot` is the load-bearing line. Naming the misreading is what lets it
 * be rejected; a definition alone does not dislodge a wrong one.
 *
 * Renders nothing at all when the stage carries no ontology block — a card with
 * an empty identity would be exactly the black box this panel exists to remove.
 */
/**
 * Memoised: the workbench re-renders on every keystroke in the answer fields,
 * and nothing this panel draws depends on them. Its only prop is the stage, so
 * a keystroke three columns away cannot redraw twelve cards.
 */
export const OntologyCards = React.memo(OntologyCardsInner);

function OntologyCardsInner({ activity }: InterventionProps) {
  // One read of the payload: the panel needs the ontology and, for the closing
  // line, whether there is a slider row to point at.
  const payload = payloadFor(activity);
  const cards = payload?.ontology;
  if (!cards || cards.length === 0) return null;
  const hasSliders = (payload?.perturbation?.variables.length ?? 0) > 0;

  return (
    <section
      className="rounded-2xl border border-edge/60 bg-deck/50 p-4 space-y-3"
      role="region"
      aria-label="The physical identity of each symbol"
      data-testid="mr-m-ontology"
    >
      <div>
        <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-amber-300">
          What each letter is
        </span>
        <p className="text-[11px] text-solder leading-snug mt-1">
          Every symbol gets a physical identity before it gets a number.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {cards.map((card: OntologyCard) => (
          <div
            key={card.symbol}
            data-testid={`mr-m-ontology-${card.symbol}`}
            className="rounded-xl border border-edge/60 bg-inset/60 p-3 space-y-2"
          >
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="font-mono text-xl leading-none text-bone">{card.symbol}</span>
              {card.unit ? (
                <span className="font-mono text-[10px] uppercase tracking-wider text-solder border border-edge/70 rounded-full px-2 py-0.5 whitespace-nowrap">
                  {card.unit}
                </span>
              ) : null}
            </div>

            <p className="text-xs text-bone leading-relaxed">{card.physicalIdentity}</p>

            {card.whatItIsNot ? (
              <p className="rounded-lg border border-hazard-500/40 bg-hazard-950/40 px-2.5 py-2 text-[11px] text-hazard-300 leading-relaxed">
                <span className="font-mono uppercase tracking-wider mr-1">Not:</span>
                {card.whatItIsNot}
              </p>
            ) : null}

            {card.doublesTo ? (
              <p className="rounded-lg border border-flux-500/35 bg-flux-500/[0.06] px-2.5 py-2 text-[11px] text-flux-300 leading-relaxed">
                <span className="font-mono uppercase tracking-wider mr-1">If it doubles:</span>
                {card.doublesTo}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {/* The two panels are the same idea from opposite ends: the cards say
          what each letter IS, the sliders are where you find out by moving it.
          Saying so is what turns two surfaces into one lesson. */}
      {hasSliders ? (
        <p data-testid="mr-m-ontology-link" className="text-[11px] text-solder leading-snug">
          The what-if sliders below are where these identities get tested: move one letter and
          watch the readout answer for the other two.
        </p>
      ) : null}
    </section>
  );
}
