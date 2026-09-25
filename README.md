# DeepEncode — AI Cognitive Schema Architect

DeepEncode is a local-first learning app that turns passive study material (notes, PDFs, images, YouTube lectures) into **active cognitive encoding workouts** grounded in learning science — the generation effect, dual coding, method of loci, chunking, interleaving, metacognition, and more.

Instead of re-reading, you reconstruct: every AI-generated stage asks you to deduce, explain, and connect mechanisms yourself, then a checker model grades your answers Feynman-style.

## Features

- **Encoding sessions** — text, file (PDF/image), or YouTube input; `conceptual` and `memorization` modes with smart mnemonic auto-detection
- **Teach Me** — Brilliant-style interactive lessons: the AI teaches the concept, walks a worked example, then checks you with inline MCQs; launchable pre-session or per-stage when stuck
- **15 visual stage templates** — Memory Palace, First Principles, Analogy Matrix, Contrast Grid, Concept Hierarchy, State Transition, Mnemonic Peg, Broken-Model Debug, and more (`components/stage-templates/` + declarative registry in `lib/templates/`)
- **Science stack** — prerequisites audit, pre-testing (productive failure), readiness gates, per-stage confidence + reflection, blurt canvas (free recall), roast-my-notes professor audit, end-of-session metacognitive review, analytics dashboard
- **Guided Path** — auto chunking of huge inputs into sequential modules with Feynman checkpoints
- **Streaming generation** — stage outlines stream in progressively while the full schema generates (`/api/encode/stream`)
- **YouTube chapter mode** — one mini-workout per chapter, tied to real video timestamps
- **Knowledge map** — graph view of concepts and topics you've encoded, with connections and gaps
- **Exports** — Anki `.apkg`, RemNote hierarchy (including RemNote power syntax), SM-2 webhooks, stateless share links (LZ-compressed URLs, zero DB required)
- **One-tap AnkiConnect push** — with the Anki desktop app open and the AnkiConnect add-on installed, `Cmd/Ctrl+Shift+A` at the forge creates the deck (`DeepEncode::{Topic}`), adds the stage's cards, and flashes a receipt (`[ANKI: +2 CARDS FORGED · 1 already in deck]`) without a download, an import dialog, or leaving the app. The export modal pushes the whole sanitized deck the same way. Duplicates are counted, never re-added; cards above the 20-word ceiling still ship tagged `WozniakOverflow` and the receipt says so
- **Procedural MCQ deck** — parametric AP-style multiple-choice archetypes authored from *your* notes, validated by a 50-trial numerical checker with automatic repair, exported as self-grading Anki cards that roll fresh numbers every review (100% offline in Anki)
- **Wozniak enforcement pass** — every card is sanitized before export: the 1-idea rule (a back joining two ideas with "and" becomes two cards), two-way cloze symmetry (each causal link A → B also gets a reverse card clozing B), and a 20-word information ceiling. Cards the ceiling holds back are listed with reasons and stay out of the deck until chunked — or can be force-included, tagged `WozniakOverflow`
- **FSRS card audit** — flags too-long and ambiguous clozes before export, with one-click auto-split into atomic cards; weak-stage-only export toggle. Interference-trap cards are exempt from the Wozniak ceiling: a trap IS a discrimination pair (wrong intuition vs. truth), so chunking it would destroy the distinction it exists to teach
- **Cognitive telemetry** — the completion report shows compression ratio (raw words → atomic cards, % noise stripped), information atomicity (average words per card back, count over the 15-word limit), and a jargon-deflation index, instead of XP
- **Taboo constraint engine** — the source's 5 highest-jargon terms are surfaced as banned chips in the workbench, flagged live as they leak into your wording, and enforced by the examiner prompt too
- **Delta feedback** — the examiner returns *what you nailed* plus the single *missing link*, with an inline "patch the gap" field that appends the one sentence straight into your mechanism answer
- **Blind prediction gate (Predict · Observe · Explain)** — before the schema is generated you commit to a confidence tier (*guessing / 50-50 / bet my life*) and then to one of four concrete predictions. Getting it wrong after betting your life is the **Hypercorrection Effect**: the reveal goes hazard-red, you must explain the physical flaw in one sentence, and the mistake is saved as an interference-trap card that leads the Anki deck
- **Priming warm-ups (pick the archetype)** — four pre-flight drills that make an equation or mechanism non-arbitrary before you touch it, each as long as the physics says: `Qualitative shape` opens a canvas and makes you **draw** the curve before the algebra, then commit to its limiting behaviour — the shape it had to have is named only after your hand has committed; `Source → sink` is a two-probe polarity check (where the density is concentrated, then which atom is stripped), after which the arrow can only point one way; `Unit puzzle` makes you assemble the units to discover whether it is v or v²; `Extremal check` is a three-probe sweep pushing each variable to 0 / ∞ in turn, which pins numerator vs denominator. `Auto` lets the examiner choose, picking a chip demands the drill. Every probe is one committed choice on a ten-second timescale, each step carries its own planted misconception, and the transferable rule lands in the stage answer with one click
- **Why-ladder ([ PROBE DEEPER ])** — interrogates your own wording one layer at a time until the chain bottoms out at something that cannot be reduced further: a conservation law, a finite resource, geometry, a dimensional necessity. Each layer answers the one question the layer above it dodged; the axiom is one click from becoming the card's anchor
- **Spot the inverted step** — adversarial discriminative repair for drained days: the examiner writes the mechanism as four causal steps and quietly falsifies exactly one (SNAREs zipping vs. disassembling, bond breaking releasing energy). You click the lie and write the one-sentence fix — recognition first, production second
- **10-second discrimination gate** — cards fail in review because a *neighbour* answers for them (SN1 for SN2, atropine for epinephrine), which self-graded review cannot see. Every export path in the deck modal (`.apkg`, `.txt`, webhook) is gated by two blind vignettes — one the stage's concept, one its lookalike — each classified against a 10-second clock. Ten seconds *is* the mechanism: a discrimination you hold is immediate, while interference forces deliberation, so the hesitation is the evidence. A miss or a timeout flags the pair unstable, asks for the one operational rule that separates them, saves your wording as a trap card that leads the deck, and tags the export `DiscriminationUnstable`. If no blind pair can be built (or the stage has no boundary contrast) the gate says so and stands aside — a missing check is not a failed check. The in-forge `Cmd/Ctrl+Shift+A` push stays ungated on purpose: it captures a single stage mid-workout rather than handing off a deck
- **Causal Mad-Libs scaffold** — the stage's deduction is presented as ONE sentence with blanks instead of three unrelated boxes. The encoder writes the template (`[[1]]/[[2]]/[[3]]` with real connectives); when it does not, the frame is derived from the stage's own labels, so sentence mode is never unavailable. Tab walks the blanks, Enter submits from the last one, and the boundary contrast rides along as a read-only `UNLESS …` clause
- **Scrambled causal order (Parsons problems)** — `Order the chain` splits the mechanism into 4–6 true steps and shuffles them deterministically (same puzzle after a reload, seeded on the stage). Grading is positional: the drill names the first broken link and what must precede it, the examiner's pivot rule is captured for the card, and a correct chain locks onto the answer in one click. Zero typing
- **Interactive diagram completion** — a diagram you only read is recognition, not retrieval: first-principles chains, analogy matrices and state-transition cycles blank one of their own cells (the mechanism node, the missing target mapping, the rate-limiting trigger) and grade the link you produce. A wrong answer reveals the truth immediately; the link lands on the card either way
- **Chapter progress rail (video sessions)** — a 90-minute lecture is not one sitting. The rail shows which chapters are actually encoded, offers `Resume chapter N` at the first one still open, and clicking any chip jumps to that stage and seeks the embedded player to its timestamp
- **STEM input** — type ASCII and read notation: `r^{4}`, `_{m}`, `->`, `<=>`, `<=`, `\alpha`, `\sqrt{2gh}` render in a preview under the field, and `Formula input` switches the fields to monospace. The raw ASCII remains the single source of truth — that is what is graded and exported
- **Local-first storage** — IndexedDB with localStorage fallback and Firestore cloud sync (optional)
- **PWA** — installable, with an offline fallback generator when you have no network/key
- **Multi-provider AI** — Gemini, OpenRouter, or any OpenAI-compatible endpoint (bring your own key)

## Getting started

```bash
bun install
bun run dev        # http://localhost:3000
```

**Optional — one-tap Anki push:** install the [AnkiConnect](https://ankiweb.net/shared/info/2055492159) add-on (code `2055492159`) in the Anki desktop app, keep Anki running, and add this app's origin to `webCorsOriginList` in *Tools ▸ Add-ons ▸ AnkiConnect ▸ Config* (AnkiConnect's default list only allows `http://localhost`, so add `http://localhost:3000` — or `"*"`). Without it, every export path still works through `.apkg` / `.txt` downloads. A page served over `https` cannot reach `http://127.0.0.1:8765` at all, so the push is a local-dev-server feature.

1. Open **Settings** in the app and paste an API key (Gemini recommended), *or* set `GEMINI_API_KEY` in `.env.local` (copy `.env.example`).
2. Paste notes, upload a file, or drop a YouTube URL and hit generate — or start from a launchpad preset.

## Scripts

| Script | What it does |
|---|---|
| `bun run dev` | Next.js dev server |
| `bun run build` | Production build + typecheck |
| `bun run lint` | ESLint |
| `bun test` | Vitest unit tests (pure logic in `lib/`) |
| `bun run test:watch` | Vitest in watch mode |
| `bun run test:e2e` | Playwright end-to-end (main encode flow, mocked AI) |

## Design system

The industrial workbench theme lives in `tailwind.config.ts` + `app/globals.css`:

- **Surfaces** — `chassis` (page) / `deck` (panels) / `inset` (recessed wells) / `edge` (hairline seams)
- **Ink** — `bone` (high emphasis) / `slate-ink` (mid) / `solder` (muted)
- **Semantic accents** — `amber` = primary action · `flux` = AI/Teach surfaces · `signal` = success/verified · `hazard` = errors
- **Type** — Space Grotesk for prose & UI labels; IBM Plex Mono on inputs, badges, metadata, and code
- **Motion** — 150ms color transitions on interactive elements; springs for modal enter/exit via `motion/react`
- **Keyboard** — visible `:focus-visible` rings; square corners enforced globally (workbench aesthetic)

Shared primitives (Button, Badge, Card, Modal, Input, Textarea, Slider, Tooltip) are in `components/ui/`.

## Testing

- **Unit** — `lib/` logic (storage, analytics, adaptive difficulty, template selection, Anki export, Wozniak sanitization, cognitive telemetry, interference traps, priming drills, URL share, knowledge graph, streaming parser) is covered by Vitest in `tests/unit/`.
- **E2E** — Playwright specs in `e2e/` drive the real UI: the full encode flow (notes → stages → examiner check → completion → history), Teach Me lessons, YouTube flow, offline fallback generator, stateless share-link import, Wozniak-sanitized FSRS audit, procedural MCQ export, AnkiConnect push (mocked at `127.0.0.1:8765`, including the refusal path), the Parsons ordering drill, the Mad-Libs sentence scaffold with interactive diagram blanks, video chapter progress/resume, formula input, the four priming archetypes (archetype selection, the 2-probe source→sink check, the 3-probe extremal sweep, and the shape drill that draws the curve before naming it), the pre-export discrimination gate (pass, miss and timeout paths), and quick diagnostics. All AI routes (`/api/*`) are mocked at the network level in `e2e/helpers/mocks.ts`, so **no API key or network is needed**.
  - Run: `bun run test:e2e` (boots `next dev` on port 4310 automatically)
  - On this filesystem, run with `--workers=3`: full parallelism races Playwright's trace-file writes and produces bogus ENOENT failures.
  - Debug a failure: `npx playwright show-trace test-results/<failing-test>/trace.zip`
- **CI** — `.github/workflows/nextjs.yml` runs typecheck, lint, unit tests and the production build in one job, then the Playwright chromium suite (with the same `--workers=3` guard) in another.


## Environment

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Server-side fallback key for `/api/*` routes when the user hasn't set a key in Settings |
| `APP_URL` | Hosted app URL (used for self-referential links) |

> **Note:** API keys entered in the app's Settings are sent from the browser through the `/api/*` routes on every generation call. If you deploy publicly, prefer requiring user keys and **do not** set a server-wide `GEMINI_API_KEY` fallback (anyone could burn it — routes have no auth gate).

## Firestore

Cloud sync (optional, per-user) uses Firestore. Deploy rules with:

```bash
firebase deploy --only firestore:rules
```

Rules (`firestore.rules`) scope every read/write to the authenticated owner (`/users/{uid}/schemas/{id}`).

## Architecture map

```
app/
  page.tsx                 # Composition root: state views + modal cluster
  api/                     # AI proxy routes: encode, encode/stream, youtube,
                           # evaluate, prerequisites, pretest, roast, segregate,
                           # blurt, archetype, checkpoint, teach, regenerate-stage,
                           # triage (fluff guillotine), priming, probe (why-ladder),
                           # invert-step (adversarial drill), sequence (Parsons chain),
                           # discrimination (pre-export blind pair)
components/
  ZenLaunchpad.tsx         # Input command center: sources, modes, presets
  workbench/               # 3-zone studio workbench (mic, sketch canvas)
  stage-templates/         # 15+ visual template renderers + error boundary
  ui/                      # Shared primitives (Button, Modal, Badge, ...)
  Teach*.tsx               # Teach Me lesson segments (concepts, MCQ, order, blanks)
  PretestModal.tsx         # Predict–Observe–Explain gate + hypercorrection traps
  workbench/ProbeLadder.tsx    # Recursive why-ladder drill
  workbench/InvertedStepDrill.tsx  # Spot the falsified causal step
  workbench/CausalSentence.tsx     # Mad-Libs scaffold (one sentence, blanks)
  workbench/CausalSequence.tsx     # Parsons problem (scrambled causal order)
  workbench/ChapterRail.tsx        # YouTube chapter progress + resume
  workbench/StemPreview.tsx        # Rendered ASCII notation under a field
  DiscriminationGate.tsx           # 10-second blind pair in front of export
  workbench/PrimingWarmup.tsx      # Archetype selector + probe sequence + shape canvas
  *Modal.tsx               # Feature modals (roast, pretest, blurt, export, ...)
hooks/                     # useSession, useSettings, useInputSource, useSchemaLibrary,
                           # useGenerationProgress
lib/
  ai-client.ts             # Multi-provider generation (Gemini/OpenRouter/OpenAI)
  auth-context.tsx         # Firebase auth provider
  storage.ts + storage/    # localStorage + IndexedDB persistence
  services/                # Analytics, adaptive difficulty, template selector,
                           # knowledge graph, offline generator
  templates/               # Declarative template registry + types
  anki-exporter.ts         # .apkg/.txt decks, SM-2 state, webhook sync,
                           # extraction + Wozniak-enforced deck funnel
  anki-connect.ts          # AnkiConnect push (deck ensure, Basic/Cloze notes,
                           # duplicate counting, actionable CORS/offline errors)
  wozniak.ts               # 1-idea rule, two-way cloze, 20-word ceiling
  cognitive-telemetry.ts   # Compression / atomicity / jargon deflation + taboo engine
  causal-frame.ts          # Mad-Libs sentence templates (parse / derive / render)
  parsons.ts               # Deterministic scramble, positional grading, pivot rule
  visual-completion.ts     # Which cell of a diagram to blank + loose answer grading
  chapters.ts              # Per-chapter encoded/pending status + resume pointer
  stem-text.ts             # ASCII STEM notation renderer (single-pass tokenizer)
  discrimination.ts        # Gate scoring (clock + misses), trap-card construction
  priming.ts               # Four warming archetypes: probe sequences + shape sketch
  interference-traps.ts    # Hypercorrection trap cards captured at prediction-error time
  procedural-archetypes.ts # Parametric MCQ archetypes + 50-trial validator
  fsrs-audit.ts            # Dense-cloze audit + auto-split
  stream-schema.ts         # Incremental JSON schema extractor for streamed generation
```

## Tech

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · motion/react · Firebase (Auth + Firestore) · IndexedDB (`idb`) · JSZip · LZ-String · `@google/genai` · Space Grotesk + IBM Plex Mono
