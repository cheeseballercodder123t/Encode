# Interactive intuition laboratories

## Cognitive thesis

A static description is not a dynamic mental model. DeepEncode's labs give learners a bounded instrument to manipulate: commit to a hypothesis, change a real variable, observe the fixed mathematical law, and capture the boundary that distinguishes a sound model from a tempting misconception.

The simulation is an intuition scaffold—not a numerical solver, a replacement for laboratory measurements, or a grade. Wrong predictions are corrected without a score. The original workbench fields, examiner, stage navigation, library, and export pipeline remain available.

## Architecture and delivery map

| Responsibility | Implementation |
|---|---|
| Versioned discriminated data contract | `lib/toy-models/types.ts` |
| Fixed math, derived predictions, equation display, cycle coordinates | `lib/toy-models/engine.ts` |
| Unknown-payload validation and sandbox checks | `lib/toy-models/validation.ts` |
| Shared Gemini schema and extraction instructions | `lib/toy-models/synthesis.ts` |
| Explicit offline teaching examples | `lib/toy-models/examples.ts` |
| Versioned progress storage and schema-scoped boundary cards | `lib/toy-models/progress.ts` |
| Predict → manipulate → reveal controller | `components/toy-models/ToyModelLab.tsx` |
| SVG mathematical instruments | `components/toy-models/ToyModelVisual.tsx` |
| Phase-plane instrument (draggable operating point, nullclines, orbit) | `components/toy-models/PhasePlaneVisual.tsx` |
| Scoped deep-space instrumentation styling | `app/toy-models.css` |
| Lazy routing and safe old-template fallback | `components/stage-templates/StageVisualRenderer.tsx` |
| AI generation integrations | `/api/encode`, `/api/encode/stream` (delegates to encode), `/api/youtube`, `/api/regenerate-stage` |
| Session writeback, checkpoints and examples | `app/page.tsx`, `components/workbench/StudioWorkbench.tsx`, `components/ZenLaunchpad.tsx` |
| Trap export | `lib/anki-exporter.ts`, `lib/remnote.ts` |

No dependencies, second backend, new credentials, generated executable formulas, or user-authored simulation code are introduced. The app remains Next.js 15, React 19, TypeScript, Tailwind, motion, Gemini/multi-provider AI, local storage/IndexedDB and optional Firebase.

## Six fixed engines

### 1. Ratio and scaling

`Y = k * A^m / B^n`

Two independently adjustable sliders drive an animated dimensional balance and schematic flow loop. `k`, `m`, `n`, units and real variable names come from the source/config. Negative denominator exponents support products such as `m*a`; the denominator slot is a mathematical coordinate, not always a resisting quantity. Powers are bounded to [-4,4]. Noninteger powers reject negative bases and negative powers reject zero bases. Denominators are strictly positive.

The default teaching example gives `I=12/4=3 A`; doubling R to 8 Ω gives 1.5 A. Simultaneously dropping V to 6 gives 0.75 A, not the original half-current prediction: the reveal waits until other inputs return to baseline.

Particle speed is a visual analogy to magnitude, not a calibrated electron drift velocity. The engine does not invent a thermal safe zone or breakdown current.

### 2. Saturation and sigmoid

`Y = Ymax * X^n / (Kd^n + X^n)`

Implementation uses a numerically stable logistic transform of logarithms rather than directly exponentiating huge inputs. `X=0` returns zero; `X=Kd` returns exactly half capacity for every positive n. The chart marks half-saturation and displays an independently movable Hill coefficient. A fixed linear counter-model can be overlaid to expose the impossible unlimited-growth assumption.

The coefficient slider is explicitly hypothetical unless supported by measured cooperativity. The source Michaelis–Menten example starts at n=1. No denaturation is hidden inside a saturation curve.

### 3. Two-state equilibrium

For ideal A⇌B, with conserved amount and fraction `f=B/(A+B)`:

- `A = total*(1-f)`
- `B = total*f`
- `Q = B/A = f/(1-f)`
- `ΔG = R*T*ln(Q/K)` (displayed in kJ/mol)
- equilibrium occurs at `f=K/(1+K)`

Two liquid menisci visualize conserved material. The Q/K meter and flux arrows identify the favorable direction. “Release to equilibrium” relaxes f toward the equilibrium fraction with an explicitly illustrative visual relaxation, not calibrated reaction kinetics. Reduced-motion users get an immediate state change.

K is held fixed. Varying temperature rescales ΔG but cannot shift equilibrium in this engine. Modeling K(T) would require source-grounded enthalpy/entropy data and another fixed extension, not an invented van't Hoff fit.

### 4. Cyclic state machine

3–8 named, ordered states carry mechanism text, relative dwell time, source evidence, energy and barrier data. Reaction progress is 0–100%; interval widths are weighted by dwell time, so the longest state is the actual toy bottleneck. Autoplay pauses in hidden tabs, can always be stopped, loops only cyclic models, and stops at the end of linear ones.

Each energy segment comprises two cubic Bézier half-curves meeting smoothly at the exact configured barrier peak. The marker evaluates the same smoothstep polynomial as the SVG; it cannot drift off the curve. Animated dashed particles traverse the active segment and slow according to its relative dwell.

A cycle such as an action potential has **illustrative** energy heights—not alleged measured Gibbs energy. The chart and assumption panel say so. Electrical voltage waveforms, mass-action rates and stochastic kinetics are not simulated.

### 5. Coupled phase plane (Lotka–Volterra)

`dX/dt = αX − βXY`, `dY/dt = δXY − γY`

The coexistence equilibrium is `(X*, Y*) = (γ/δ, α/β)`, where both nullclines cross. The conserved quantity `V = δX − γlnX + βY − αlnY` is drawn as a live orbit from the operating point: RK4 integration (dt=0.05) holds V to within ~1e-7 over a full revolution, so the orbit closes instead of spiraling from integrator error. An 8×8 velocity field, both dashed nullclines with labels, and a quadrant status readout (`PREDATORS RISING`, `BOTH FALLING`, `BOTH RISING`, `PREDATORS STARVING`) make the direction of flow readable at a glance.

The operating point is a real input: dragging the puck writes both coordinates through the same step-gridded write path as the sliders, and the question's reveal verifies the engine's exact two-coordinate target configuration. The teaching example's constants are illustrative; no damping, carrying capacity, seasonality, harvesting or discrete populations are modelled. The validator requires both nullclines to fall strictly inside the drawing ranges, since orbits cannot close otherwise.

### 5b. Devil's Advocate duel (all engines)

Any engine's config may carry an optional `devilsAdvocate` block: a named fictional speaker, a confident claim, the intuitive fallacy (p-prim) it rests on, the refutation configuration, what the model actually shows there, and the source quotation that grounds the contradiction.

Hearing the claim is a prerequisite for refuting it — the argument has to be heard to be lost. The verdict is stamped only at input-write time when the live inputs reach the validator-checked refutation configuration, and `restoreToyProgress` re-verifies it against the stored inputs on every load (and now also requires `duelHeard`), so a stale or hand-edited save can never carry an unearned verdict. In the phase-plane lab the duel marker parks at the refutation configuration itself, so the claim is refuted by dragging the operating point into it. A verified refutation exports as its own trap card (`DevilsAdvocate` tag) through Anki and RemNote, and only a verified one does.

### 6. Critical threshold

A real, source-specified threshold supports three fixed responses:

- **activate:** 0 below Xcrit, maximum at/above Xcrit (including negative voltage domains);
- **collapse:** an explicitly illustrative piecewise-linear envelope rising to a supplied peak and declining to zero at Xcrit;
- **sign_change:** a true affine law `Y=intercept+slope*X`, with validator-enforced Xcrit=-intercept/slope.

The sign-change variant accommodates ΔG=ΔH−TΔS without pretending an affine law is a ratio. Intercept, slope and slider units must be consistent in the source/config. A spring-driven gauge, striped critical zone, mechanism domino chain and 80Hz alert mark threshold crossings. Collapse counter-models can expose the assumption that warming always helps. The thermal example's 37/45°C values describe **that example**, not universal enzyme biology.

## Data contract

Every activity may carry optional `toyModel` and `toyModelIssues`. The model has:

- `version: 1` and one of the five literal type identifiers;
- source-specific title, labels, symbols and physical units;
- `primaryVar` and archetype-specific secondary variable with safe key, min/max/initial/step and evidence quotation;
- output label/symbol/unit;
- 1–12 source quotations with what each supports;
- 1–12 assumptions disclosing illustrative ranges, energies, durations and limitations;
- a prediction specifying **one** variable key, a different reachable target, and causal explanation;
- a discriminative takeaway;
- optional fixed `linear` or `no_threshold` counter-model (supported only on compatible engines).

No formula string is evaluated. A displayed formula is derived from the fixed engine fields. The AI is not allowed to choose the correct chip: `buildToyChallenge` computes it from the engine. Cycles name the target state; threshold questions name regimes; other models compare the numeric output direction.

## Grounded extraction

Gemini receives the shared structured schema inside the existing stage generation call. It classifies and extracts parameters while authoring activities; there is **no extra per-stage synthesis API call**. All supported providers use the existing app settings and API client; runtime validation is independent of JSON-mode quality.

For pasted notes and available video transcripts, quotes are checked as normalized exact substrings of the supplied source. File-backed extraction uses the existing multimodal provider and asks for verbatim transcription; because raw PDF/image text is not available to the validator, quote membership is **not independently verified** there. The mathematical gate still applies. This distinction is a known limitation, not a zero-hallucination claim.

Missing constants, unsupported equations, no caption transcript, generic variable names, malformed configs and unsafe numeric domains do not receive invented lab configs. The renderer retains the original stage and reports invalid-lab issues. Old saved schemas without labs remain unchanged. Deterministic offline automatic matching is intentionally conservative: it recognizes the complete included teaching-example source, not vague words such as “enzyme” or “voltage.”

## Sandbox validation

`validateToyModelConfig(raw: unknown, source?: string): ToyModelValidationResult` returns `{valid,sanitizedConfig?,issues}`. It reconstructs the allowed config shape instead of mutating input or trusting a TypeScript cast.

Checks include:

1. Supported version/type, bounded string lengths, safe unique keys, nonempty named units and explicit assumptions/evidence.
2. Finite numeric fields, nonempty ranges, sensible steps, source quotations, and slider-grid-reachable prediction targets.
3. Nonpositive denominators repaired to 0.01 with reported issues; initial values and step granularity are repaired consistently. Impossible repairs reject.
4. Logarithm, power, fraction, temperature, half-saturation, peak and threshold domains.
5. 51 samples per independent axis. Two-input models also run a full **51×51 grid**, not only a diagonal that could miss simultaneous extremes.
6. Output magnitude ceiling (1e15), finite normalized geometry, target point and exact critical-point sampling.
7. Directional monotonicity checks where applicable; exact collapse peak/zero checks and equilibrium ΔG=0 checks.
8. Unsupported counter-model combinations rejected; no arbitrary code evaluated.

This protects runtime and verifies the five declared laws. It cannot prove that an AI-selected law is the scientifically right law for arbitrary prose. Exact quote membership is evidence provenance, not semantic entailment. Unit strings are retained and inspected, not a full symbolic dimensional-analysis engine.

## Tactile craft and accessibility

The outer studio stays dark brass/retrofuturist. Labs use #0A0D14/#0F121D dot-grid canvases with cyan inputs, amber boundaries, emerald confirmations and crimson failures. Native range controls preserve keyboard semantics and screen-reader value text; telemetry also appears as readable text, not color alone.

motion springs animate balance, gauge, menisci and state collapse. Native slider thumbs remain precise rather than introducing a second drag implementation. CSS particle flow and autoplay honor reduced motion. Audio uses the existing master mute: 400Hz quiet scrubs throttled to 80ms, a soft unlock, C5/E5/G5 harmonic confirmation, and 80Hz critical pulse. Audio is never required to understand feedback.

## Progress, checkpoints and export

`StageResponse.toyModelProgress` stores model fingerprint, committed choice, current inputs, explored/revealed booleans and update timestamp. Fingerprints use sorted canonical JSON, so server validation's object property order cannot relock or incorrectly mismatch a solved model. An altered config does relock it.

A browser cache holds at most 100 lab snapshots. Slider-only writes debounce; prediction/reveal writes are immediate. Pagehide/unmount saves flush the cache. Quota failure is surfaced. Progress writes back into session responses. Next/Skip preserves it, full saved schemas carry it, and a debounced content-stable checkpoint ID routes lab sessions through the existing localStorage/IndexedDB/Firestore library. The SSR library hydration was repaired to avoid local saved-count mismatches on reload.

Only explored, revealed, fingerprint-matching progress generates a boundary card. It includes the committed prediction, observed answer, causal explanation and takeaway, tagged `InterferenceTrap`, `ToyModel`, archetype and confirmed/corrected status. It is scoped to its activity/schema, not appended indiscriminately to unrelated decks. Stage AnkiConnect push, full deck extraction, .txt/.apkg, and existing sanitized export paths share the builder; protected trap tags preserve the discriminative pair through Wozniak enforcement. RemNote renders the same trap as forward-only. Export text is HTML-escaped before Anki rendering.

## Verification and operating instructions

Open `/` → **Hands-on laboratories** to try six explicit teaching examples without a key, or **Energy-payoff pathway** for the pathway builder. Paste notes/files or a video with captions → **Build cognitive schema** for source-derived generation when a provider is configured. For Gemini, the existing app reads an in-app Settings key or `GEMINI_API_KEY` from Settings → Environment; no new key name is introduced.

Commands:

```sh
bun tsc --noEmit
bun run test
PLAYWRIGHT_BASE_URL=http://127.0.0.1:<managed-preview-port> bun run test:e2e e2e/toy-models.spec.ts --workers=2
```

Tests cover laws, boundaries, source rejection, malformed payloads, 2D extreme samples, exact reaction peaks, the conserved phase-plane invariant, duel-state restoration (earned, unheard, unearned and legacy saves), persistence/identity/quota/cap, standard/guided/regenerated API handlers, pre-manipulation export exclusion, Anki/RemNote consistency, actual downloaded Anki text, all six browser workflows, the duel lifecycle and its export, wrong predictions, secondary-variable control, mobile geometry, reduced motion, and retained original-stage fallback.

Live provider generation, real Anki desktop handoff, and authenticated Firestore sync require credentials/services and are not implied by mocked tests. Screenshots are captured as artifacts; image-based manual review requires a visual inspection interface.

## Deliberate boundaries and future extensions

- Photoelectric frequency/intensity comparison needs a fixed two-input quantum threshold law; the current flaw hunter supports linear saturation and no-threshold thermal/activation counter-models, not arbitrary counterfactual physics.
- Unit consistency is enforced for equilibrium and source documentation elsewhere; general unit algebra is future work.
- File quote verification needs a source-text extraction pipeline before it can be claimed independent of the multimodal model.
- Models requiring more than two independent sliders or laws beyond the declared forms remain the original encoding stage. Adding a seventh engine requires a new discriminant, validator, invariant tests, schema, instrument and prediction builder—not executable AI code.
- No guarantee of 60fps or clinical/engineering accuracy is made; the models are bounded learning instruments and were verified on representative browser layouts.
