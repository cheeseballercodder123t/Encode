import React from 'react';

/** An armillary model of encoding, not a live telemetry display. */
function CognitiveOrbit() {
  return (
    <div className="cognitive-orbit" aria-hidden="true">
      <div className="orbit-caption"><span>COGNITIVE FIELD</span><span>FIG. 01 / ENCODING</span></div>
      <svg viewBox="0 0 480 340" fill="none" className="orbit-drawing">
        <defs>
          <radialGradient id="orbit-light">
            <stop stopColor="#E3C285" stopOpacity="0.15" />
            <stop offset="0.48" stopColor="#D2A455" stopOpacity="0.055" />
            <stop offset="1" stopColor="#D2A455" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="orbit-metal" x1="102" y1="65" x2="375" y2="265" gradientUnits="userSpaceOnUse">
            <stop stopColor="#876A3D" /><stop offset="0.4" stopColor="#F0D5A1" />
            <stop offset="0.65" stopColor="#D2A455" /><stop offset="1" stopColor="#6E522B" />
          </linearGradient>
          <linearGradient id="orbit-facet-light" x1="206" y1="110" x2="270" y2="182" gradientUnits="userSpaceOnUse">
            <stop stopColor="#D3B17A" stopOpacity="0.65" /><stop offset="1" stopColor="#28251F" />
          </linearGradient>
          <linearGradient id="orbit-facet-dark" x1="240" y1="164" x2="240" y2="220" gradientUnits="userSpaceOnUse">
            <stop stopColor="#776044" /><stop offset="1" stopColor="#15161A" />
          </linearGradient>
        </defs>

        {/* Etched calibration plate and minute marks sit behind the armature. */}
        <circle cx="240" cy="164" r="158" fill="url(#orbit-light)" />
        <g stroke="#D2A455" strokeWidth="0.7" strokeOpacity="0.16">
          <path d="M24 164H456M240 15V310" strokeDasharray="2 6" />
          <circle cx="240" cy="164" r="134" />
          <circle cx="240" cy="164" r="116" strokeDasharray="1 5" />
          <circle cx="240" cy="164" r="76" strokeDasharray="2 6" />
          <path d="M22 46V30H38M442 30H458V46M22 284V300H38M442 300H458V284" strokeOpacity="0.5" />
        </g>
        <g className="orbit-dial" stroke="#D2A455">
          {Array.from({ length: 72 }, (_, index) => (
            <path
              key={index}
              d={`M240 24V${index % 6 === 0 ? 34 : index % 3 === 0 ? 30 : 27}`}
              transform={`rotate(${index * 5} 240 164)`}
              strokeOpacity={index % 6 === 0 ? 0.55 : 0.22}
              strokeWidth={index % 6 === 0 ? 1 : 0.6}
            />
          ))}
        </g>

        {/* Dim back halves and bright front halves make the rings interleave. */}
        <g stroke="url(#orbit-metal)" strokeWidth="1.2" strokeOpacity="0.3">
          <ellipse cx="240" cy="164" rx="158" ry="62" transform="rotate(-28 240 164)" />
          <ellipse cx="240" cy="164" rx="158" ry="62" transform="rotate(28 240 164)" />
          <ellipse cx="240" cy="164" rx="56" ry="132" transform="rotate(14 240 164)" />
        </g>
        <g stroke="#D2A455" strokeWidth="0.6" strokeOpacity="0.14">
          <ellipse cx="240" cy="164" rx="163" ry="66" transform="rotate(-28 240 164)" />
          <ellipse cx="240" cy="164" rx="163" ry="66" transform="rotate(28 240 164)" />
        </g>

        {/* A cut-brass crystal: shaded faces, fine edges, and an inset nucleus. */}
        <g className="orbit-core" stroke="url(#orbit-metal)" strokeWidth="1">
          <path d="M240 108L282 139V188L240 219L198 188V139Z" fill="#111318" />
          <path d="M240 108L282 139L240 164L198 139Z" fill="url(#orbit-facet-light)" />
          <path d="M198 139L240 164V219L198 188Z" fill="url(#orbit-facet-dark)" />
          <path d="M282 139L240 164V219L282 188Z" fill="#29261F" />
          <path d="M240 108V164M198 188L240 164L282 188" strokeOpacity="0.45" />
          <path d="M240 126L268 146V178L240 198L212 178V146Z" stroke="#E3C285" strokeOpacity="0.4" strokeWidth="0.7" />
          <path d="M230 164L240 154L250 164L240 174Z" fill="#E3C285" stroke="#F5EAD2" strokeWidth="0.6" />
        </g>
        <g stroke="url(#orbit-metal)" strokeWidth="1.6">
          <path d="M82 164A158 62 0 0 0 398 164" transform="rotate(-28 240 164)" />
          <path d="M82 164A158 62 0 0 0 398 164" transform="rotate(28 240 164)" strokeOpacity="0.8" />
          <path d="M240 32A56 132 0 0 1 240 296" transform="rotate(14 240 164)" strokeOpacity="0.65" />
        </g>

        {/* Slow-moving particles follow the ring planes without a JS timer. */}
        <g transform="translate(240 164) rotate(-28) scale(1 0.3924)">
          <g className="orbit-traveler orbit-traveler-source">
            <path d="M156 -21A158 158 0 0 1 158 0" stroke="#E3C285" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.5" />
            <circle cx="158" r="5" fill="#E3C285" />
          </g>
        </g>
        <g transform="translate(240 164) rotate(28) scale(1 0.3924)">
          <g className="orbit-traveler orbit-traveler-memory">
            <circle cx="158" r="4" fill="#F3EEE3" />
          </g>
        </g>

        {/* Fixed callouts remain legible while the illustrative particles move. */}
        <g stroke="#D2A455" strokeOpacity="0.5" strokeWidth="0.8">
          <path d="M110 225L75 252H25M370 103L402 69H456M274 279L308 307H410" />
          <circle cx="110" cy="225" r="5" fill="#14161D" />
          <circle cx="370" cy="103" r="5" fill="#14161D" />
          <circle cx="274" cy="279" r="5" fill="#14161D" />
        </g>
        <g fill="#E3C285">
          <circle cx="110" cy="225" r="1.5" /><circle cx="370" cy="103" r="1.5" /><circle cx="274" cy="279" r="1.5" />
        </g>
        <g className="orbit-labels" fill="#B5B1A6" fontFamily="IBM Plex Mono, monospace" fontSize="9" letterSpacing="1.1">
          <text x="25" y="267"><tspan fill="#E3C285">01</tspan> / SOURCE</text>
          <text x="456" y="57" textAnchor="end"><tspan fill="#E3C285">02</tspan> / MECHANISM</text>
          <text x="410" y="322" textAnchor="end"><tspan fill="#E3C285">03</tspan> / MEMORY</text>
        </g>
        <g fill="#807D73" fontFamily="IBM Plex Mono, monospace" fontSize="6" letterSpacing="1.5">
          <text x="240" y="12" textAnchor="middle">ENCODING MODEL</text>
          <text x="65" y="168" textAnchor="middle">IN</text>
          <text x="420" y="168" textAnchor="middle">OUT</text>
        </g>
      </svg>
      <div className="orbit-footnote"><span className="orbit-pulse" />PASSIVE INPUT → ACTIVE UNDERSTANDING</div>
    </div>
  );
}

export function StudioIntro() {
  return (
    <section className="studio-intro" aria-labelledby="studio-headline">
      <div className="studio-intro-copy">
        <p className="studio-eyebrow"><span className="studio-status-dot" />THE COGNITIVE ENCODING STUDIO</p>
        <h2 id="studio-headline">Less re-reading.<br /><em>More revelation.</em></h2>
        <p className="studio-intro-description">
          Turn what you study into something you understand. One paradox,
          one thought experiment, one mechanism in your own words.
        </p>
        <ol className="studio-workflow" aria-label="Your learning workflow">
          <li><span>01</span> Bring your material</li>
          <li><span>02</span> Rebuild the idea</li>
          <li><span>03</span> Make it stick</li>
        </ol>
      </div>
      <CognitiveOrbit />
    </section>
  );
}
