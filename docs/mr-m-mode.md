# Mr M mode — implementation plan

> Status: **implemented.** All five open decisions in §8 were approved as
> recommended, and the whole plan is in the working tree. Verified with
> `bunx tsc --noEmit` and `bun run lint` (0 errors), `bun run test` (822
> passing) and `e2e/mr-m-mode.spec.ts` (10/10) against the dev server, plus
> `studio-design`, `delta-feedback`, `stage-templates` and `modal-a11y` as
> regression checks. §9 records the places where what was built departs from
> this plan; §10 records the improvement pass that followed it.

## 1. What this is

A single switch — **Mr M mode** — that re-shapes every stage of DeepEncode for one
specific learner: an intensely deductive, first-principles learner who cannot hold a
procedural recipe that has no physical mechanism attached to it.

With the switch **on**, each stage stops leading with "here is the formula" and instead
leads with the coordinate system:

| Feature | Why his brain needs it |
|---|---|
| **First-Principles / Axiom-First panel** | Anchors the concept to the governing law and the zero point (`ΔH°` as sea level: products − reactants) before any procedure appears. |
| **Trap-Aware Autopsy** | A wrong answer is diagnosed by *structural failure mode* — reversed order, missing subscript, factor of two — with the arithmetic shown, never "Incorrect. The answer is C." |
| **Linear State-Machine rail** | Decomposes a 4-rule problem (mL→L, limiting reactant, mole ratio, →grams) into Step 1 → 2 → 3 so working memory never bottlenecks. |
| **What-If Perturbation sliders** | Drives the invariant to its limits (h → 0, double an input, P_ext → 0) to exploit his proportional-reasoning strength. |
| **Ontology cards (per letter)** | Gives every symbol in the formula a physical identity — is `m` the water, the solid, or both? — so nothing is numerology. |
| **Paradox ledger** | An unresolved contradiction is recorded and surfaced instead of shrugged off; it holds the topic until it is resolved. |
| **Socratic sparring** | Hypothesis → confirm/challenge → next step, in one cheap turn, instead of a monolithic lecture. |

It is **off** for a normal learner, in the sense that every surface above is an
*addition*: with the switch off the stage renders exactly as it does today.

## 2. The toggle

**Persistence.** `StudyPrefs` in `lib/storage.ts` gains one field:

```ts
export interface StudyPrefs {
  // …existing fields…
  /** Mr M mode: first-principles surfaces on every stage. */
  mrMMode: boolean;
}
```

Default `true` (this is a personal tool and the request is "a toggle for me"), with
`hiddenTemplates`-style validation on load so a corrupt value falls back cleanly.
Storage key stays `deepencode_study_prefs_v1`, so backup/restore already carries it.

**Two surfaces, one writer:**

1. `components/SettingsModal.tsx` — a labelled switch next to the hidden-templates
   list, with a one-line description of each pillar (the `[ 01 ]…[ 04 ]` bracket
   language the rest of the app uses).
2. `app/page.tsx` masthead nav — a quiet `Mr M` pill beside `Analytics` / `Settings`,
   so it can be flipped mid-session without a modal. Shows `Mr M · on` / `Mr M`.

Both call `saveStudyPrefs({ mrMMode })`. `hooks/useInputSource.ts` already owns
`loadStudyPrefs`/`saveStudyPrefs` and hydrates on mount, so it gains `mrMMode` +
`setMrMMode` and the value flows into the workbench as a prop.

**Server propagation.** The four AI-backed pillars need the model to *produce* their
payloads. `mrMMode` is added to the request bodies of `/api/encode` and
`/api/evaluate`, validated in `lib/api-validation.ts`:

```ts
// encodeSchema / evaluateSchema
mrMMode: z.boolean().optional(),
```

Absent or `false` ⇒ the route behaves exactly as today (same prompt, same response
schema, same token cost).

## 3. Architecture — the same shape as the template system

`lib/templates/` is a declarative registry: per-item metadata + a lazy component table
+ `registerTemplate()` so a new item never edits the renderer, plus one resolver
(`StageVisualRenderer`) that only answers "which id is this?". Mr M mode copies that
shape exactly, because the pillars are **overlays that apply to every template**, not
new templates. They therefore get their own registry rather than entries in
`TEMPLATE_REGISTRY` — the renderer stays the same, and any of the 16 templates can
carry the pillars.

```
lib/mr-m/
  types.ts          # payload contracts for all six interventions
  registry.ts       # MR_M_INTERVENTIONS + MR_M_COMPONENTS + registerIntervention()
                    # + resolveInterventions(activity, response) → ordered ids
  directives.ts     # MR_M_DIRECTIVE prompt block injected into encode/evaluate
  diagnostics.ts    # pure: trap taxonomy classification + arithmetic reveal
  perturbation.ts   # pure: what-if evaluator (limits, doubling)
  payloads.ts       # pure: coerce/normalize everything the model returns for mrM
                    # (symbol extraction lives in diagnostics.ts — there is no
                    # ontology.ts; see §9)
  ledger.ts         # paradox + counterexample ledger (localStorage)
components/mr-m/
  MisterMSurface.tsx     # the single resolver, like StageVisualRenderer
  AxiomFirstPanel.tsx
  TrapAutopsy.tsx
  StateMachineRail.tsx
  PerturbationSliders.tsx
  OntologyCards.tsx
  SocraticSpar.tsx
  ParadoxLedgerPanel.tsx
```

`registry.ts` follows `lib/templates/registry.ts` line for line:

```ts
export interface InterventionDefinition {
  id: string;
  pillar: 'axiom' | 'autopsy' | 'steps' | 'whatif' | 'ontology' | 'socratic';
  title: string;
  /** The one thing this surface owes the learner. */
  learnerTask: string;
  /** When it belongs on screen — a pure predicate over the stage and its response. */
  appliesWhen: (activity: Activity, response?: StageResponse, mrMMode?: boolean) => boolean;
  component: React.ComponentType<InterventionProps>;
}
```

Six ids, following the existing snake_case convention:

| id | pillar | renders when |
|---|---|---|
| `axiom_first` | axiom | stage has `axiomFirst` payload and mode is on |
| `ontology_cards` | ontology | stage has ≥1 recognised symbol |
| `state_machine_steps` | steps | stage has ≥3 steps or the encoder marked it multi-layer |
| `perturbation_sliders` | whatif | stage has ≥1 numeric variable with a stated invariant |
| `trap_autopsy` | autopsy | a check came back `secured: false` *and* there is a diagnosis or a narrative |
| `socratic_spar` | socratic | a check produced `counterProbe` |

`MisterMSurface` renders the applicable interventions as a panel stack. `resolveInterventions`
is pure and unit-tested, so "which surfaces appear on this stage" is a table lookup,
never a `switch` in the view.

## 4. The four pillars

### 4.1 Axiom First — `axiom_first`

**Server-produced.** The encoder emits a per-stage block when `mrMMode` is on:

```ts
interface AxiomFirst {
  governingLaw: string;      // the invariant, stated as physics
  coordinateOrigin: string;  // "sea level" — elements in their standard states
  zeroPoint: string;         // why THIS is the zero
  whyThisDefinition: string; // why products − reactants and not the reverse
  calculusTranslation?: string; // ∫v dt vs ∫|v| dt, etc.
  counterexample: string;    // the "then why does calcium hydroxide end in -ide?" case
}
```

`components/mr-m/AxiomFirstPanel.tsx` renders it above the stage's answer fields, so
the mechanism is on screen *before* the procedure. The `counterexample` line is what
makes this adversarial rather than decorative — it is the stress test the learner
would have asked for, pre-empted.

### 4.2 Trap-Aware Autopsy — `trap_autopsy`

Two halves, deliberately split:

**Deterministic label + arithmetic** (`lib/mr-m/diagnostics.ts`, pure, no AI):

```ts
export type TrapId =
  | 'reversed_order'            // ΔH° written reactants − products
  | 'missing_subscript'         // H2O written HO
  | 'factor_of_two'             // the styrene C₂H case
  | 'molar_mass_denominator'    // NH₄NO₃: 28/80, one N counted instead of two
  | 'unit_slip'                 // mL left un-converted
  | 'limiting_reactant_ignored'
  | 'mole_ratio_inverted'
  | 'zero_point_confusion'
  | 'path_vs_state_confusion'
  | 'sign_convention_flip';

export function classifyTrap(input: TrapInput): TrapDiagnosis;
```

`classifyTrap` compares the learner's numeric answer against the stage's exemplar and
computes the **exact ratio** (`0.0337 / 0.0168 = 2.00`), and scans the answer text for
reversed formula order, dropped subscripts and unit slips. Because the reveal is
arithmetic, it is computed here and never hallucinated by the model. Returns
`{ trapId, ratio?, arithmeticReveal, structuralReason, whereItBreaks }`.

**Narrative autopsy** (`/api/evaluate` under `MR_M_DIRECTIVE`): the model writes the
*why it is structural* sentence and the corrected construction, into a new
`autopsy` field on the evaluation result, validated in `lib/ai-output-validation.ts`
(optional — absence is tolerated, and the deterministic half still renders).

**Renders at** `components/workbench/StudioWorkbench.tsx`, in the existing
`feynmanResult` block (~line 1339). Today a miss shows `missingLink` + a patch input;
with the mode on it *leads* with the named trap and the arithmetic, then the patch.
A confirmed trap is handed to the existing `saveInterferenceTrap` so it becomes a real
high-priority card — the autopsy is not a side channel.

### 4.3 Linear State-Machine rail — `state_machine_steps`

Encoder emits, per multi-layer stage:

```ts
interface MachineStep {
  stepNumber: number;
  action: string;      // "convert 250 mL → 0.250 L"
  holdsInHead: string; // the ONE rule this step consumes
  output: string;      // what you are holding when it finishes
}
```

`StateMachineRail.tsx` renders Step 1 → 2 → 3 as checkable lozenges, using the
existing stage-ticker lozenge styling rather than a new bar. Each step names the single
rule it consumes and the value it hands forward, so the working-memory footprint of a
step is explicit and never more than one rule.

### 4.4 What-If Perturbation sliders — `perturbation_sliders`

Encoder emits a small parametric model; the **math runs client-side** in
`lib/mr-m/perturbation.ts` so dragging a slider never costs a model call:

```ts
interface PerturbationModel {
  invariant: string;              // "q = mcΔT is conserved"
  variables: {
    symbol: string; base: number; min: number; max: number; unit: string;
    /** How this variable enters the invariant, so the readout can be recomputed. */
    exponent: number;
  }[];
  limitNote: Record<string, string>; // what happens at the extremes
}
export function evaluatePerturbation(model, values): PerturbationReadout;
//   PerturbationReadout = { relative: number; label: string;
//                           limit: 'zero' | 'infinity' | null; note: string }
```

Four preset buttons per slider — `base`, `×2`, `÷2`, `→ limit` — because proportional
reasoning is the strength being exploited. The readout always shows the invariant
*unchanged* and the one variable that moved, which is the point.

## 5. The four traits

1. **Adversarial stress-testing.** `AxiomFirstPanel` ends with a
   `[ Stress-test this rule ]` control that opens an inline field; whatever the
   learner holds it up against becomes a **paradox record** (§5.2), so the
   anxiety the counterexample produces has somewhere to live instead of being
   the end of the stage. This is the "then why does calcium *hydroxide* end in
   -ide?" question, and it costs no model call.
2. **Zero tolerance for unresolved paradoxes.** `lib/mr-m/ledger.ts` keeps
   `deepencode_mr_m_paradox_v1`: `{ id, topic, statement, raisedAt, resolvedAt?, resolution? }`.
   `openParadoxesFor(topic)` feeds the registered **`ParadoxLedgerPanel`**, which
   renders first in the stack ("Unresolved paradox", hazard chrome) and states
   the override in plain language: *"Held here until you close it. You can carry
   on regardless — it stays on the list."* Closing one demands the sentence that
   did it, which is kept on the record. The count is surfaced on the analytics
   dashboard. See §9 for why the `[ RESOLVE FIRST ]` plate is not built.
3. **Ontological clarity.** `lib/mr-m/diagnostics.ts` extracts every symbol in the
   stage's `formulaEquation` / visual payload and the encoder supplies
   `{ symbol, physicalIdentity, unit, whatItIsNot, doublesTo }` — `m` = the mass of the
   water in the calorimeter (kg), *not* the solid; `q` = heat transferred *into* the
   system. `OntologyCards.tsx` renders one card per letter. Cards are also exported
   into the deck, so the identity travels with the card.
4. **Socratic rubber-ducking.** `SocraticSpar.tsx` renders under the existing
   `counterProbe`: the model states its read, the learner either **confirms** or
   **challenges** in one line, and only then does the spar advance a step. One
   checker-model call per turn, so the ping-pong stays cheap.

## 6. File-by-file change list

**New**
- `lib/mr-m/{types,payloads,registry,directives,diagnostics,perturbation,ledger}.ts`
- `components/mr-m/{MisterMSurface,AxiomFirstPanel,TrapAutopsy,StateMachineRail,PerturbationSliders,OntologyCards,SocraticSpar,ParadoxLedgerPanel}.tsx`
- `tests/unit/mr-m-registry.test.ts`, `mr-m-diagnostics.test.ts`, `mr-m-perturbation.test.ts`, `mr-m-payloads.test.ts`, `mr-m-ledger.test.ts`
- `e2e/mr-m-mode.spec.ts` (+ the `MR_M_ENCODE_RESPONSE` fixture in `e2e/helpers/fixtures.ts`)

**Edited**
- `lib/storage.ts` — `mrMMode` on `StudyPrefs` + default + validation.
- `hooks/useInputSource.ts` — hydrate/persist/expose `mrMMode`.
- `lib/templates/types.ts` — optional `mrM` block on `ActivityVisualData`.
- `lib/types.ts` — optional `autopsy` on `StageResponse.feynmanReview`.
- `lib/api-validation.ts` — `mrMMode` on `encodeSchema` / `evaluateSchema`.
- `lib/ai-output-validation.ts` — tolerate + normalise the new optional blocks.
- `app/api/encode/route.ts` — inject `MR_M_DIRECTIVE`, extend the response schema.
- `app/api/evaluate/route.ts` — inject the autopsy/socratic directive.
- `components/workbench/StudioWorkbench.tsx` — mount `MisterMSurface` at the stage
  column (~line 843) and the autopsy at the check block (~line 1339).
- `components/SettingsModal.tsx` — the `Mr M mode` switch.
- `app/page.tsx` — the masthead `Mr M` pill.
- `components/AnalyticsDashboard.tsx` — open-paradox count tile.
- `lib/backup.ts` — add `deepencode_mr_m_paradox_v1` to `EXTRA_KEYS`.
- `README.md` — a Mr M mode section + architecture-map lines.

**No new env vars, no new third-party service.** The Socratic turn reuses the existing
provider path in `lib/ai-client.ts`, so it inherits the timeouts, retry policy and
usage/cost accounting already in `lib/ai-hardening.ts`.

## 7. Tests

- `mr-m-registry.test.ts` — every intervention id resolves to a component;
  `registerIntervention()` works at runtime; `resolveInterventions` ordering and
  `appliesWhen` gating (mode off ⇒ empty list).
- `mr-m-diagnostics.test.ts` — the taxonomy against real cases: styrene `C₂H` →
  `factor_of_two` with `0.0337 / 0.0168 = 2.00`; NH₄NO₃ → `molar_mass_denominator`;
  reversed `ΔH°` → `reversed_order`; mL/L → `unit_slip`.
- `mr-m-perturbation.test.ts` — doubling, halving, limits, and that the invariant
  string never changes.
- `mr-m-payloads.test.ts` — symbol extraction, ontology dedupe and the
  `whatItIsNot` presence check (folded here rather than into a separate
  ontology module — see §9), plus normalization: unusable blocks dropped,
  steps renumbered, a zero-exponent variable dropped, a degenerate min/max
  widened so `base` is inside it, and an unknown `trapId` blanked.
- `mr-m-ledger.test.ts` — raise/resolve/open-by-topic; a resolved paradox stops
  gating; malformed storage degrades to empty.
- `e2e/mr-m-mode.spec.ts` (10 tests) — toggle on ⇒ axiom panel + ontology cards +
  state-machine rail + sliders visible on a mocked stage; a failing check ⇒ autopsy
  names the factor of two, shows the arithmetic, and says the figure was computed
  rather than generated; the two-way check demands a committed line before it locks,
  and a challenge is recorded as a committed objection rather than a dead end; a
  contradiction is raised from the axiom panel and closed again; the preparation
  stack folds away without switching anything off; the chain reports `2 of 3 held`
  and resets in one click; the sliders return to the stage's own numbers in one
  control; toggle off ⇒ none of it renders and it survives a reload; and the
  settings switch moves the masthead pill with it, so both surfaces are one piece of
  state. Uses the existing `mockAiApis` from `e2e/helpers/mocks.ts` plus a new
  `MR_M_ENCODE_RESPONSE` fixture.

Then `bunx tsc --noEmit`, `bun run lint`, `bun run test`, and the touched Playwright
specs against the managed preview.

## 9. Deviations as built

- **No `lib/mr-m/ontology.ts`.** Symbol extraction needs the same tokenizer the
  trap classifier uses (skip a digit that follows a letter — that is a subscript
  — skip a bare integer below ten — that is a coefficient), so it lives in
  `lib/mr-m/diagnostics.ts` and is exported from there. A second module would
  have meant a second, subtly different tokenizer.
- **A `payloads.ts` module was added** (not in the plan). `normalizeMrM` is the
  one place a model-supplied `mrM` block is coerced, and
  `lib/ai-output-validation.ts` calls it once at the boundary; `mrMOf(activity)`
  returns the block *by reference*, because `PerturbationSliders` re-homes its
  slider values whenever the model object's identity changes.
- **The registry holds seven interventions, not six.** `paradox_ledger` is a
  registered overlay too, and it renders first — an open contradiction is the
  one thing that has to be visible before anything else on the stage.
- **`MisterMSurface` is mounted twice**, not once: `phase="pre"` (axiom,
  ontology, steps, sliders, ledger) above the answer fields and `phase="post"`
  (autopsy, spar) beside the examiner read. The split rule is
  `POST_CHECK_PILLARS = new Set(['autopsy', 'socratic'])`.
- **The paradox gate warns and does not block — including at stage advance.**
  The ledger panel states the override in plain language ("Held here until you
  close it. You can carry on regardless — it stays on the list.") and nothing
  in the workbench reads `hasOpenParadox`, so there is no `[ RESOLVE FIRST ]`
  plate in front of the next stage. The helper is exported and unit-tested so
  that plate can be added later.
- **The autopsy does not auto-save a trap card.** It names the trap and shows
  its arithmetic; it does not call `saveInterferenceTrap`. The existing
  hypercorrection and discrimination paths remain the only writers of trap
  cards.
- **The Socratic spar makes no network call.** The model supplies the spar text
  with the evaluation; confirm/challenge is a committed single line that locks
  the panel. No second checker call is spent, so the ping-pong costs nothing
  extra.

## 10. Improvement pass

A second pass went over all seven surfaces, the engine and the two directives.
Each item below is a defect or a gap that the first pass left, not a preference.

**Engine — correctness**

- **The numeric signature is now scored in reciprocal space.** A factor-of-two
  error is the same trap whichever way the division falls, but scoring only the
  raw ratio meant an answer that was twice the expected value — or a volume
  carried through in litres where the stage measured millilitres — resolved to
  *no diagnosis at all*, and the autopsy stayed empty for the commonest mistakes.
  The fold is carried forward into the atom-count check too, or the shaped
  diagnoses (`molar_mass_denominator`) stay unreachable from exactly the
  direction the fold was added to serve.
- **`sign_convention_flip` now requires the magnitude to be right.** It used to
  fire on any ratio near −1, including a magnitude error that happened to be
  negative — while its own explanation claims "your magnitude is right and your
  sign is wrong". A −2 ratio is a factor of two first.
- **The unit-slip text rule is symmetric.** It only caught millilitres against a
  litre reference; the mirror case now fires too, and it is the one that becomes
  reachable once the ratios are folded.
- **A step with no rule is dropped rather than given one.**
  `normalizeStateMachine` was filling a missing `holdsInHead` with the literal
  placeholder *"the rule this step consumes"* — invented content displayed as if
  the model had written it, which is the exact failure the module header forbids.
- **The directive quotes the limits it will be held to.** `MAX_ONTOLOGY`,
  `MAX_STEPS` and `MAX_VARIABLES` are exported from `payloads.ts` and
  interpolated into `MR_M_DIRECTIVE`, so the model is told the caps the coercion
  enforces instead of spending tokens on a thirteenth card that is silently
  truncated. A unit test asserts the two can only agree.
- **The post-mortem rule no longer contradicts itself.** It said "never output a
  number of your own" while requiring `correctedConstruction`, which for a
  chemistry problem *is* numbers. It now bans computing or re-deriving a
  quantity to explain a failure, while inviting the model to quote the quantities
  the stage already states.
- **The readout scales out of fixed decimals.** `×12345678.00` is a wall of
  digits that hides the point; past a million it now reads `×1.00e+8`, via an
  exported `formatRelative`.

**Surfaces — UX craft and accessibility**

- **The preparation stack folds.** Four or five panels above the answer fields is
  a lot of page between the learner and the thing they were asked to write. The
  pre-stack now folds to one line that names what is inside it, with nothing
  switched off and the fold starting expanded.
- **The decomposition reports and resets.** It had no progress readout (`2 of 3
  held`, announced) and no reset, so a mis-tick had to be undone one box at a
  time.
- **The sliders have accessible values and a single reset.** A bare `0.5` is not
  an answer to "what does this do?" — `aria-valuetext` now carries the unit and
  the resulting readout, the readout is a live region, and one control returns
  every variable to the stage's numbers.
- **The axiom panel labels its calculus line** (an unlabelled monospace line under
  a definition is one more thing to interpret), marks the stress-test trigger
  `aria-expanded`, and returns focus to it when the field is closed with Escape —
  keeping the draft, so closing by mistake costs nothing.
- **A challenge commits its sentence.** `committed` was never set on the challenge
  path, so the objection was a live echo of a box the learner could no longer
  edit rather than a record. The objection and the lock are now announced.
- **The ledger has an accessible name**, announces its open count, and its age
  line updates on its own — the panel had nothing to re-render it, so "open just
  now" persisted for as long as nothing else in the workbench moved, which is the
  opposite of what "held, with its age" claims.
- **The ontology panel is a named region and points at the sliders.** The cards
  say what each letter IS; the sliders are where that gets tested, and saying so
  is what makes two surfaces read as one lesson.
- **The autopsy states its provenance.** The arithmetic is arithmetic done on the
  learner's own numbers, and the sentence under it is the examiner's reading — a
  learner who has been burned by a confidently wrong model needs to know which
  half is which.

**Performance**

- **A keystroke no longer redraws the whole stack.** Every panel received
  `field1/field2/field3` and no panel reads any of them, so all seven code-split
  panels were re-rendered per character typed in an answer field — including the
  sliders, which draw up to six range inputs and four preset buttons each. The
  unused props are gone from `InterventionProps`, and each panel is wrapped in
  `React.memo` over props that are stable while the learner types. The manual
  `useMemo` that would have addressed the symptom instead trips the repo's
  `react-hooks/preserve-manual-memoization` rule, and the compiler is not enabled
  for the build, so the memo at the component boundary is the fix that holds.

## 8. Open decisions — approved

1. **Default on or off?** **On** (`DEFAULT_STUDY_PREFS.mrMMode = true`).
2. **Where does the toggle live?** **Both** — the masthead `Mr M` pill
   (`data-testid="mr-m-toggle"`) and the Settings switch.
3. **Overlay registry or six new entries in `TEMPLATE_REGISTRY`?** **Overlays**,
   in their own registry.
4. **Does an open paradox hard-gate the next stage?** **Warn with an explicit
   override.**
5. **A new `/api/mr-m/*` route, or fold into encode/evaluate?** **Fold in.**
