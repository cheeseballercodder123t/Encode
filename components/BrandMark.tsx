/**
 * The studio's marks: one cut-brass spark, struck at two scales.
 *
 * Both accents were once a `✳` — a superscript after "DeepEncode" in the
 * masthead and a 36px mark over the launchpad rail's tagline. IBM Plex Mono does
 * not carry that character, so each one rendered through whatever fallback the
 * browser reached for: the same page showed two different asterisks in two
 * different weights, sized by a font nobody had loaded.
 *
 * They are now one piece of drawn metal, cut from the brass the rest of the
 * studio is built out of — the same four stops as the armillary crystal in the
 * hero (`#F5E3BE` → `#F0D5A1` → `#D2A455` → `#8F6B28`), so the wordmark's accent
 * and the hero's instrument are visibly the same material. The shape is a
 * four-pointed star with concave sides, which is solid through the centre: a
 * star drawn as four separate tapered rays pinches to nothing in the middle and
 * reads as a scatter of thin spikes at wordmark size, which is exactly what the
 * previous mark did.
 *
 * {@link BrandSpark} is the bare spark beside the wordmark: gradient fill, a
 * hairline rim so it does not go soft on the dark ground, and one lit facet
 * across the diagonal. {@link BrandStar} is the rail note's seal: the same spark
 * struck at 56% inside an engraved plate — outer rim, a minute scale that
 * creeps round it, eight teeth, a thin inner ring, and a pool of light the spark
 * sits in — with a core that glints.
 *
 * Geometry is literal, the marks are pure: `currentColor` for the engraving
 * each placement supplies, `className` from the caller, `aria-hidden` on the
 * root, no inline sizing (CSS scales both, so the mark is the same mark at 16px
 * and at 68px) and no hooks, so they render on the server and inside the client
 * tree alike. The two gradient ids are fixed because there is exactly one
 * instance of each mark in the document; a second `<BrandSpark/>` on the same
 * page would need its own id or it would resolve the first one's defs.
 */

type BrandMarkProps = {
  /** Sized and coloured by CSS; the element itself carries no inline style. */
  className?: string;
};

const VIEW_BOX = '0 0 48 48';

/**
 * The spark: tip at (24,2), and each edge pulled in to a radius of ~10.3 at its
 * midpoint — where a straight edge between the tips would sit at 15.6. That
 * concavity is the whole drawing: it leaves the middle solid, so the mark still
 * reads as one lit object at 16px.
 */
const SPARK = 'M24 2Q27.6 20.4 46 24Q27.6 27.6 24 46Q20.4 27.6 2 24Q20.4 20.4 24 2Z';

/** The lit core, small enough to stay a glint rather than a disc. */
const CORE = 'M24 20.8L27.2 24L24 27.2L20.8 24Z';

/** Eight teeth, at the cardinals and the diagonals. */
const TEETH = [0, 45, 90, 135, 180, 225, 270, 315];

/** The wordmark's accent: the bare spark, 16px in the masthead. */
export function BrandSpark({ className }: BrandMarkProps) {
  return (
    <svg className={className} viewBox={VIEW_BOX} fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="brand-gilt-spark" x1="6" y1="3" x2="42" y2="45" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FDF9F0" />
          <stop offset="0.3" stopColor="#F0D5A1" />
          {/* The facet: two stops at the same place make a hard crease rather
              than a blend, which is what reads as a cut face at this size. */}
          <stop offset="0.34" stopColor="#D2A455" />
          <stop offset="0.7" stopColor="#A87C36" />
          <stop offset="1" stopColor="#7A5A2C" />
        </linearGradient>
      </defs>
      <path d={SPARK} fill="url(#brand-gilt-spark)" />
      <path d={SPARK} stroke="#FBF7EE" strokeOpacity="0.45" strokeWidth="0.5" />
      <path d={CORE} fill="#FDF9F0" fillOpacity="0.9" />
    </svg>
  );
}

/**
 * The rail note's seal: a brass spark inside an engraved plate.
 *
 * The plate is the app's own instrument language rather than a badge — outer
 * rim, the dashed minute scale every dial on this page carries, eight teeth, and
 * a thin inner ring. The scale turns (`.brand-scale`, one revolution in 140s),
 * which is invisible work at 45-degree symmetry but not for a ring of dashes: it
 * reads as an instrument settling rather than as a picture of one.
 */
export function BrandStar({ className }: BrandMarkProps) {
  return (
    <svg className={className} viewBox={VIEW_BOX} fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="brand-gilt-medallion" x1="12" y1="8" x2="38" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FDF9F0" />
          <stop offset="0.32" stopColor="#F0D5A1" />
          <stop offset="0.36" stopColor="#D2A455" />
          <stop offset="0.72" stopColor="#A87C36" />
          <stop offset="1" stopColor="#6E522B" />
        </linearGradient>
        <radialGradient id="brand-medallion-light" cx="0.5" cy="0.5" r="0.5">
          <stop stopColor="#E3C285" stopOpacity="0.26" />
          <stop offset="0.55" stopColor="#D2A455" stopOpacity="0.09" />
          <stop offset="1" stopColor="#D2A455" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* The pool of light the spark stands in, so the plate is lit rather than outlined. */}
      <circle cx="24" cy="24" r="16" fill="url(#brand-medallion-light)" />

      {/* The engraving: rim, the creeping minute scale, and the inner hairline. */}
      <g fill="none" stroke="currentColor">
        <circle cx="24" cy="24" r="21.6" strokeOpacity="0.62" strokeWidth="0.7" />
        <g className="brand-scale">
          <circle cx="24" cy="24" r="19.6" strokeOpacity="0.42" strokeWidth="0.6" strokeDasharray="1 2.35" />
        </g>
        <circle cx="24" cy="24" r="14.8" strokeOpacity="0.2" strokeWidth="0.5" />
      </g>

      {/* The toothed edge, starting on the rim and pointing out. */}
      <g stroke="currentColor" strokeLinecap="round" strokeOpacity="0.72" strokeWidth="0.8">
        {TEETH.map((angle) => (
          <path key={angle} d="M24 0.8V2.4" transform={`rotate(${angle} 24 24)`} />
        ))}
      </g>

      {/* The spark, struck at 56% so its tips stop short of the inner ring. */}
      <g transform="translate(24 24) scale(0.56) translate(-24 -24)">
        <path d={SPARK} fill="url(#brand-gilt-medallion)" />
        <path d={SPARK} stroke="#FBF7EE" strokeOpacity="0.4" strokeWidth="0.7" />
      </g>
      <path className="brand-core-glint" d={CORE} fill="#FDF9F0" />
    </svg>
  );
}
