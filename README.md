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
- **Cross-schema interleaving** — timed round-robin drill queue mixed across all your saved schemas
- **Knowledge map** — graph view of concepts and topics you've encoded, with connections and gaps
- **Exports** — Anki `.apkg`, RemNote hierarchy, SM-2 webhooks, stateless share links (LZ-compressed URLs, zero DB required)
- **Procedural MCQ deck** — parametric AP-style multiple-choice archetypes authored from *your* notes, validated by a 50-trial numerical checker with automatic repair, exported as self-grading Anki cards that roll fresh numbers every review (100% offline in Anki)
- **FSRS card audit** — flags too-long and ambiguous clozes before export, with one-click auto-split into atomic cards; weak-stage-only export toggle
- **Local-first storage** — IndexedDB with localStorage fallback and Firestore cloud sync (optional)
- **PWA** — installable, with an offline fallback generator when you have no network/key
- **Multi-provider AI** — Gemini, OpenRouter, or any OpenAI-compatible endpoint (bring your own key)

## Getting started

```bash
bun install
bun run dev        # http://localhost:3000
```

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

- **Surfaces** — `chassis` (page) / `deck` (panels) / `steel` (borders)
- **Ink** — `bone` (high emphasis) / `solder` (muted)
- **Semantic accents** — `amber` = primary action · `flux` = AI/Teach surfaces · `signal` = success/verified · `hazard` = errors
- **Type** — Space Grotesk for prose & UI labels; IBM Plex Mono on inputs, badges, metadata, and code
- **Motion** — 150ms color transitions on interactive elements; springs for modal enter/exit via `motion/react`
- **Keyboard** — visible `:focus-visible` rings; square corners enforced globally (workbench aesthetic)

Shared primitives (Button, Badge, Card, Modal, Input, Textarea, Slider, Tooltip) are in `components/ui/`.

## Testing

- **Unit** — `lib/` logic (storage, analytics, adaptive difficulty, template selection, Anki export, URL share, interleaving scheduler, knowledge graph, streaming parser) is covered by Vitest in `tests/unit/`.
- **E2E** — Playwright specs in `e2e/` drive the real UI: the full encode flow (notes → stages → examiner check → completion → history), Teach Me lessons, YouTube flow, offline fallback generator, stateless share-link import, FSRS audit, procedural MCQ export, history resume/drill, and quick diagnostics. All AI routes (`/api/*`) are mocked at the network level in `e2e/helpers/mocks.ts`, so **no API key or network is needed**.
  - Run: `bun run test:e2e` (boots `next dev` on port 4310 automatically)
  - Debug a failure: `npx playwright show-trace test-results/<failing-test>/trace.zip`


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
                           # blurt, archetype, checkpoint, teach, regenerate-stage
components/
  ZenLaunchpad.tsx         # Input command center: sources, modes, presets
  workbench/               # 3-zone studio workbench (mic, sketch canvas)
  stage-templates/         # 15+ visual template renderers + error boundary
  ui/                      # Shared primitives (Button, Modal, Badge, ...)
  Teach*.tsx               # Teach Me lesson segments (concepts, MCQ, order, blanks)
  *Modal.tsx               # Feature modals (roast, pretest, blurt, export, ...)
hooks/                     # useSession, useSettings, useInputSource, useSchemaLibrary,
                           # useGenerationProgress
lib/
  ai-client.ts             # Multi-provider generation (Gemini/OpenRouter/OpenAI)
  auth-context.tsx         # Firebase auth provider
  storage.ts + storage/    # localStorage + IndexedDB persistence
  services/                # Analytics, adaptive difficulty, template selector,
                           # interleaving scheduler, knowledge graph, offline generator
  templates/               # Declarative template registry + types
  anki-exporter.ts         # .apkg/.txt decks, SM-2 state, AnkiConnect/webhook sync
  procedural-archetypes.ts # Parametric MCQ archetypes + 50-trial validator
  fsrs-audit.ts            # Dense-cloze audit + auto-split
  stream-schema.ts         # Incremental JSON schema extractor for streamed generation
```

## Tech

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · motion/react · Firebase (Auth + Firestore) · IndexedDB (`idb`) · JSZip · LZ-String · `@google/genai` · Space Grotesk + IBM Plex Mono
