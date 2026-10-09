# DeepEncode Bug Audit — 2026-10-08

Branch `fix/nonfunctional-audit-round-16`. **Defects 1–12 are merged on `main` (`1b0ffb0`, PR #34), 13–14 in `1f67f2e` (PR #35), 15–16 in `c324989` (PR #36), 17 in `e3c21a6` (PR #37), 18 in PR #39 (round 5, §7) and 19 in PR #40 (round 6, §8) — every defect through round 6 is on `main`; defects 20-27 (§9 round 7, §10 round 8, §11 round 9, §12 round 10, §13 round 11 - the non-functional sweep - and §14 round 12) went to `main` in `2804e78` (PR #41); defects 28-30 (§15-§17, rounds 13-15) went to `main` in `dd1505c` (PR #42); defects 31-33 (§18, round 16, the usage ledger) are committed on this branch and in review.** Scope: the attack vectors in the request —
SM-2/Anki arithmetic, formula/LaTeX handling, hook lifecycle, local-first storage, and ingestion edge
cases. Every fix below was reproduced against the live code before it was changed, and every fix is
pinned by a test that was then **proven able to fail**.

## 1. Defects found and fixed

| # | Bug Category | File & Line | Root Cause | How It Was Verified |
|---|---|---|---|---|
| 1 | SM-2 arithmetic / state corruption | `lib/anki-exporter.ts:47`, `:85` | `previousState` is untrusted (IndexedDB, Firestore mirror, an exported deck, a hand-edited record), but was read with a truthiness fallback (`\|\| 1`, `\|\| 2.5`). That catches `0` and `NaN` but **not `Infinity`**, so a non-finite stored interval propagated: `Infinity * 2.5 = Infinity`. `nextReviewTimestamp` became `Infinity`, and `JSON.stringify(Infinity)` is `null` — the card ends up with **no due date at all**. | Reproduced: `calculateSM2(5, { interval: Infinity, … })` → `interval=Infinity, nextReviewTimestamp=Infinity`. Also `interval: 1e308` (finite!) overflows the timestamp. Fixed by reading every field through a finiteness check and re-checking `interval`/`nextReviewTimestamp` before returning, with a 1-day fallback. Pinned by `tests/unit/anki-sm2-hardening.test.ts`. |
| 2 | SM-2 arithmetic — **negative interval** | `lib/anki-exporter.ts:63`, `:69` | The success branch computed `interval = Math.round(interval * ease)` using the **raw, un-floored** `ease`, and only floored it to 1.3 afterwards. A stored `easeFactor` below the floor therefore multiplied the interval by a negative number. | Reproduced: `calculateSM2(5, { interval: 10, easeFactor: -5, … })` → **`interval = -50`** — a card scheduled 50 days *in the past*, due before it was ever answered. Fixed by multiplying by `usableEase = Math.max(MIN_EASE, ease)` and clamping the result to `>= 1`. Pinned in the same test file. |
| 3 | SM-2 state — negative counter | `lib/anki-exporter.ts:52` | `repetitions` was read unvalidated, and the success branch only ever **incremented** it. A corrupt negative value stayed negative forever. | Reproduced: `calculateSM2(5, { repetitions: -5, … })` → `repetitions = -4`. Fixed with `Math.max(0, …)`. Pinned in the same test file. |
| 4 | State / lifecycle — stale-timer race + post-unmount state write | `hooks/useSession.ts:392`–`:412` | `addXP` started `setTimeout(() => setXpGainAnimation(null), 1800)` and **discarded the handle**. Two XP awards inside 1.8 s left two live timers, and the *first* one cleared the animation the second award had just started — a fast combo flashed its gain and lost it. The orphaned timer also kept running after the workbench unmounted or a session reset. | Fixed with a `useRef` handle: clear any pending timer before scheduling a new one, and clear on unmount. **Verified by source-scan only** (`tests/unit/xp-timer-cleanup.test.ts`) — see Limitations §3. Not verified at runtime. |
| 5 | Formula pipeline — **runtime crash** | `lib/procedural-validator.ts:68` | `rollVariable` dereferenced `spec.choices` with no guard, so a `null`/non-object variable spec threw. Reachable from model-authored payloads and card-building paths. | Reproduced: `rollVariables({ x: null })` → **`TypeError: Cannot read properties of null (reading 'choices')`**. Fixed by returning a finite fallback for a missing/non-object spec. Pinned by `tests/unit/roll-variables-hardening.test.ts`. |
| 6 | Formula pipeline — silent value corruption | `lib/procedural-validator.ts:103` | A range that is not finite (`NaN` bounds, or `±Infinity`) produced a non-finite draw that flowed straight into formula evaluation, turning every computed answer into `NaN` — and `JSON.stringify(NaN)` is `null` downstream. | Reproduced: `rollVariables({ x: { min: NaN, max: NaN } })` → a non-finite `x`. **Correction to my own first reading:** I initially recorded this as `{ x: null }`; the true value was `NaN` and only *appeared* as `null` through `JSON.stringify` (a worker caught this — the distinction matters, because downstream code was doing arithmetic on `NaN`, not comparing to `null`). Fixed with a finite-fallback that prefers a single declared finite bound. Pinned in the same test file. |
| 7 | Formula pipeline — **runtime crash** | `lib/procedural-validator.ts:107` | `decimals` was passed to `Number.prototype.toFixed` unvalidated; `toFixed` throws a `RangeError` outside `0..100`. | Found alongside #5. Fixed by clamping to `0..100`. Pinned in the same test file. |
| 8 | Formula pipeline — **runtime crash** | `lib/procedural-validator.ts` (`choices` branch) | A `choices` array containing a non-number (`['a', null]`) was picked and passed to `toFixed`, throwing a `TypeError`. | Found alongside #5. Fixed by treating an unusable pick as "no draw". Pinned in the same test file. |
| 9 | Cross-session state carry-over (session depth) | `components/workbench/StudioWorkbench.tsx:562`, `hooks/useSession.ts:240`, `app/page.tsx:2215` | The clue-ladder reveal count is module-level state, reset only by an effect keyed on `[currentActivityIndex]`. A Guided Path module switch swaps `activities` and lands back on index 0, and `handleSelectModule` (`app/page.tsx:836`) never leaves `appState === 'encoding'` — so the workbench stays mounted and an index-only dependency cannot fire. The new module's opening stage inherited the previous module's rung count, so a clean solve was recorded as scaffolded and the escalation governor's clean-win streak could not advance on any module's first stage. | Reachability established from code (the mount gate, the switch handler and the reducer action). Fixed by adding `activities` to the effect's dependency list. Pinned by a wiring guard plus 4 new counter-contract tests in `tests/unit/clue-ladder.test.ts`; the guard was mutation-tested against the buggy dep list and fails with `expected 'currentActivityIndex' to contain 'activities'`. Detail in §3a. |

| 10 | Crucible clock — the allocation stops summing to the whole | `lib/crucible/budget.ts:85` | `allocateSeconds` divides each weight by their sum. Two weights large enough to overflow sum to `Infinity`, so every `weight / sum` is `0`, every floor is `0`, and the largest-remainder pass can then only hand out one second per state. It also computed `total = Math.max(0, Math.floor(totalSeconds))` — and `Math.max(0, NaN)` is `NaN` — so a non-finite clock flowed straight through the arithmetic. The module's own header promises "the parts sum to exactly the whole". | Reproduced: `allocateSeconds(720, [1e308, 1e308])` → `[1, 1]` (sum 2, not 720); `allocateSeconds(NaN, [1, 1])` → `[NaN, NaN]`. Fixed by treating a non-finite clock as 0 and a non-finite weight sum as equal shares, so a finite result always sums to the total. Pinned by 3 new tests in `tests/unit/crucible-budget.test.ts`; run against the unfixed code they fail with `expected [1, 1] to deeply equal [360, 360]` and `expected [NaN, NaN] to deeply equal [0, 0]`. |
| 11 | Crucible clock — a reading that is not a clock face | `lib/crucible/budget.ts:222` | `formatClock` and `formatMinutes` guarded only against negatives (`Math.max(0, …)`), which does not catch `NaN` or `Infinity`, against a documented contract of "clock face, always two digits, never a negative sign". | Reproduced: `formatClock(NaN)` → `'NaN:NaN'`, `formatClock(Infinity)` → `'Infinity:NaN'`, `formatMinutes(NaN)` → `'NaNm'` — and the NaN case is reachable from defect 10, because the plan's own `targetSec` is what the HUD renders. Fixed by falling back to `00:00` / `0.0m` on a non-finite reading. Pinned in the same test file; against the unfixed code the assertion fails with `expected 'NaN:NaN' to be '00:00'`. |
| 12 | Parsons drill — the scramble hands over the chain | `lib/parsons.ts:61` | The scramble's "second pass" says in its own comment that it exists to "pull any tile that landed in its own slot somewhere else", but its guard `continue`d whenever the swap partner was *also* in its own slot — so the pass silently defeated its stated purpose — and the shuffle loop above it accepted any ordering that was merely not identical. | Measured over 3000 seeds before the fix: **369 scrambles (12.3%) left a tile in its correct slot** (a direct "this link is already right" hint) and **1293 (43%) were cyclic rotations** of the true chain, which keep every adjacency but the wrap-around. After: **0 and 0**, with `DISTINCT` 6 of 24 orderings (see §3b for the variety trade-off). Fixed by drawing until a derangement appears — never trading one away for a pinned order — and preferring a non-rotation, with the first draw as fallback so nothing can throw. Pinned by 4 new tests in `tests/unit/parsons.test.ts`, all three assertions mutation-proven able to fail. |

| 13 | Diagram-completion grading — a single letter counts as the answer | `lib/visual-completion.ts:51` | The containment shortcut `a.length >= 6 && (t.includes(a) \|\| a.includes(t))` guarded the **answer's** length, never the typed input's, and `a.includes(t)` is trivially true for any short string that occurs inside the answer. Reached from `components/stage-templates/DiagramBlank.tsx:47`, where the verdict also decides what is written into the mechanism field the exporter ships. | Reproduced: `gradeCompletion('t', 'S4 segments swing outward')` → **`true`**, likewise `'a'`, `'the'`, `'s4'`, `'an'`, `'is'`. Fixed by requiring the containment hint to carry at least one of the answer's own content words (the drill's stated rule is "a strong overlap of the answer's content words"); the matcher now also compares from either side, so an inflected word the learner typed longer still meets the answer's shorter one. Pinned by 5 new tests in `tests/unit/completion-and-clock-hardening.test.ts`; mutation-proven — removing the guard fails with `"t" carries none of the answer's content words: expected true to be false`. |
| 14 | Discrimination clock can gain time (**hardening** — see the reachability note) | `lib/discrimination.ts:111` | `remainingMs` clamped only the floor (`Math.max(0, …)`), so anything making `now - startedAt` negative was reported as **more time than the clock holds**, and a non-finite reading passed straight through as `NaN`. | Reproduced at the function boundary: `remainingMs(10_000, 1_000, 10)` → **19000 ms on a 10-second gate**, and `remainingMs(NaN, 1_000, 10)` → `NaN`. Fixed by clamping the ceiling to the clock's own length and returning 0 for a non-finite reading. Pinned in the same new test file; mutation-proven — restoring the un-clamped body fails with `expected 19000 to be 10000` and `expected NaN to be +0`. **Reachability, stated honestly:** the only call site is `components/DiscriminationGate.tsx:69`, where `startedAt` is either the component's own `Date.now()` or a recorded `Date.now()` (`record` writes `endedAt: Date.now()`, an absolute time — that wiring was checked and is **correct**). So the only way in is a backward system-clock step between ticks (NTP correction, a clock stepped after resume). Not a persisted timestamp and not a corrupt stored value — **my first draft of this row claimed both, and both were wrong.** Kept because the reading drives a HUD bar (`(leftMs / limitMs) * 100` → a 190%-wide bar) as well as a countdown, so an impossible value is visible twice; this is the one entry in the table whose trigger is not reachable from a live caller in normal operation. |

**Total: 14 distinct defects in 8 files** (3 SM-2, 1 hook lifecycle, 4 formula-pipeline, 1 cross-session state carry-over, 2 crucible clock, 1 Parsons scramble, 1 diagram-completion grading, 1 discrimination clock — defects 9, 10–11, 12 and 13–14 detailed in §3a, §3b and §3c). **Thirteen are reachable from a live caller; defect 14 is hardening whose trigger requires a backward system-clock step** — its row says so.

### Tests added

| File | Purpose |
|---|---|
| `tests/unit/anki-sm2-hardening.test.ts` (114 lines) | Defects 1–3, plus happy-path guards (reps 0 → 1 d, reps 1 → 6 d, reps 3 @ ease 2.5 → 25 d, failure → 1 d with the 1.3 floor). |
| `tests/unit/roll-variables-hardening.test.ts` (151 lines) | Defects 5–8, plus regression guards: in-range draws over 400 seeded draws, `min > max`, `choices`, `step`/`decimals`, and same-seed determinism (proving no extra `rng()` draw was consumed on the valid path). |
| `tests/unit/xp-timer-cleanup.test.ts` (69 lines) | Defect 4, source-scan style (mirrors the existing `tests/unit/modal-a11y.test.ts` convention). |
| `tests/unit/clue-ladder.test.ts` (extended, +6 tests) | Defect 9: 4 runtime tests for the reveal counter (which had zero coverage) and 2 wiring guards for the workbench's reset boundary. |
| `tests/unit/crucible-budget.test.ts` (extended, +3 tests) | Defects 10–11: the overflow sum invariant, the non-finite clock, and the clock face. |
| `tests/unit/parsons.test.ts` (extended, +4 tests) | Defect 12: no tile in its own slot across 300 seeds, never a rotation across 300 seeds, order variety, and the three-link case where the only derangements *are* rotations. |
| `tests/unit/completion-and-clock-hardening.test.ts` (new, 10 tests) | Defects 13–14: content-free answers rejected, the dressed mechanism and the inflected word still accepted, plus the clock's ceiling, floor and non-finite reading. |

## 2. Verification performed

Run as plain commands, with exit statuses captured:

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc -b --noEmit` | **exit 0** |
| Unit suite (final) | `npx vitest run` | **exit 0** — 74 files, **1253 passed** (was 70 files / 1196 tests) |
| Lint (changed files) | `npx eslint <9 files>` | **exit 0** |
| E2E smoke | `npx playwright test e2e/modal-a11y.spec.ts --project=chromium` | **exit 0** — 3/3 |
| E2E Parsons drill | `npx playwright test e2e/sequence.spec.ts --workers=2` against the managed preview | **exit 0** — 3/3 (this is defect 12 verified in the real drill, not just in the unit test) |
| E2E diagram-completion drill | `npx playwright test e2e/scaffold-frame.spec.ts --workers=2` after the grading change | **exit 0** — 3/3 (defect 13 verified where it bites: the shallow answer is still rejected and the dressed one still accepted) |
| E2E forge flow | `npx playwright test e2e/flashcard-forge.spec.ts --project=chromium` | **exit 1** — 17 passed, **2 failed** (see §3) |

### Discriminating power of the new tests (the part that matters)

A passing test proves nothing unless it can fail, so each fix was tested against the broken code:

- **Defects 1–3 (SM-2).** `lib/anki-exporter.ts` was temporarily restored to its pre-fix content and
  the new test file re-run: **6 tests failed**, reporting exactly the audited symptoms —
  `expected Infinity to be 1`, `expected null to be Infinity`, `expected -50 to be greater than 0`,
  `expected -4 to be 1`. The fixed version was then restored from a copy held outside the repo, and
  `grep` confirmed the restored file matched the fixed state.
  - *Note on method:* a first attempt at mutation-testing this (reverting one guard at a time) was
    **masked** — the fix layers three guards (input finiteness, floored ease, output clamp), so removing
    any single layer leaves the invariant intact. That is why the check was escalated to a full
    comparison against the original implementation. Worth knowing before trusting single-guard mutations.
- **Defects 5–8 (validator).** The null guard and the finite fallback were removed temporarily:
  **4 tests failed**, including the exact `TypeError: Cannot read properties of null…`. Reverted and
  re-verified (0 occurrences of the mutation marker, guard present).
- **Defects 10–11 (crucible).** The new tests were written *first* and run against the unfixed module:
  **3 failed**, reporting `expected [NaN, NaN] to deeply equal [0, 0]` and `expected 'NaN:NaN' to be
  '00:00'`. The fix was then applied and the same 3 passed (29/29 in the file).
- **Defect 12 (Parsons).** Zeroing the scoring penalties made **2** of the new tests fail
  (own-slot and three-link). That left the rotation assertion unproven, so the adjacency term was
  zeroed too: **3 failed**, including `expect(rotations).not.toContain(ids)`. All penalties restored
  and re-verified (`cost += 2 / 1 / 4` back in place).
  - *Note on method, twice-over:* my **first two attempts at this fix were wrong and my own tests
    caught both.** Attempt one compared candidates with `bestIsPinned ? !pinned(candidate) : cost <
    bestCost`, which still let a *cheaper pinned* candidate replace an unpinned best — a three-link
    chain therefore returned a pinned order. Attempt two minimised kept adjacencies as well, which
    collapsed a four-link chain onto 5 orderings out of 24; the probe caught that (`DISTINCT 5 OF_24`).
    Both were found by running measurements, not by reading the code.

## 3. Limitations — checks that failed or could not be run

1. **Two pre-existing-looking E2E failures, causality UNRESOLVED.** In `e2e/flashcard-forge.spec.ts`,
   `a deck that already exists in Anki is read back and counted as already yours` and
   `with Anki closed the memory says so and stays this app's own` fail with
   `getByTestId('forge-memory-anki')` → **element(s) not found**. Both are AnkiConnect read-back
   assertions. Evidence pointing away from this change: the gating code
   (`components/FlashcardForgeModal.tsx:1808`, `:708`) and its dependencies
   (`lib/anki-memory.ts`, `lib/anki-connect.ts`) are **not in this diff**, and the immediately
   preceding commit (`bf2f8cc`, "remove 127.0.0.1 AnkiConnect pings on HTTPS") changed exactly that
   origin-sensitive path. I could **not** establish a pre-change baseline, because the managed preview
   serves this working tree and I am not permitted to start a second dev server (and with HMR disabled,
   hot-reverting files may not rebind the running app). I also disproved one hypothesis — re-running the
   failing test against `http://localhost:39246` instead of `127.0.0.1` fails identically, so it is not
   a hostname/origin artifact. **Recommendation: run these two specs on a clean checkout / CI before
   concluding.** They are not claimed as fixed or as not-mine.
2. **The full E2E suite was not completed.** It is 30 specs / ~145 tests; a single run exceeds this
   host's 180 s command cap (the first attempt was killed at 180 s). I ran the smoke spec, the forge
   spec and the Parsons spec — the ones covering the changed surface. The other ~27 specs were **not**
   run.
3. **Defects 4 and 9 are verified by source-scan / wiring guard, not by runtime behaviour at the
   level they actually bite.** This repo has no `@testing-library/react`, so neither a hook nor an
   effect's dependency behaviour can be rendered in a unit test. For defect 4 the stronger proof would
   be an E2E spec awarding XP twice inside 1.8 s; for defect 9 it would be a multi-session Playwright
   spec that switches Guided Path modules and asserts the governor records a clean win on the new
   module's opening stage. Neither was written. What *is* proven for defect 9: the counter contract
   itself (4 runtime tests) and the effect's wiring (a guard mutation-tested against the buggy dep
   list). The end-to-end carry-over is argued from React effect semantics plus the mount gate, not
   observed.
4. **No defect was found in several audited areas** — reported so the absence of findings is not
   mistaken for coverage:
   - **Event-listener leaks: none.** `addEventListener`/`removeEventListener` counts match in every
     file under `components/`, `hooks/` and `app/`. All seven hooks clean up their intervals and
     subscriptions (`useGenerationProgress`, `useModalA11y`, `useSchemaLibrary`, `useSettings`, `use-mobile`).
   - **Local-first storage: no crash path found — CORRECTED by round 11 (§13, defect 25).** The claim below
     is about the *writers*, and it holds for them (every write is wrapped, with in-memory fallbacks and
     `.catch()` on the IndexedDB calls). What it missed is the other half of the boundary: the **readers**.
     Every persisted record is taken with an unvalidated `JSON.parse(...) as SavedSchema[]` and then
     dereferenced, so the crash was not in `lib/storage.ts` throwing — it was in `HistoryDrawer` filtering
     on `s.topicSummary.toLowerCase()` of a record that had no topic. One legacy record left the app
     answering `Application error: a client-side exception has occurred`, with no way back from the UI.
     "No crash path found" was true of the code I read in round 1 and false of the code that reads it.
     The original text, kept so the correction is visible:
   - **Local-first storage: no crash path found.** `lib/storage.ts` and `lib/db.ts` are comprehensively
     wrapped in `try/catch` with in-memory fallbacks; IndexedDB writes are fire-and-forget with
     `.catch()` handlers. I did not find a failing-IndexedDB crash — but I also did not *force*
     IndexedDB to fail (no quota-exceeded or blocked-open simulation), so this is unverified rather
     than proven safe.
   - **Formula/LaTeX validator: no crash.** A hostile-formula probe (`throw`, `return`, `require`,
     syntax errors, `NaN`, `Infinity`, an infinite loop) never threw — the sandbox is a pure-expression
     evaluator with an identifier allowlist. Malformed LaTeX (`\(`, `\)`, `\[`, `\]`) **is** caught.
   - **Ingestion: no crash.** Through the real `/api/forge` route: corrupt JSON → `400`; `sources: null`
     → `400`; `include: null` → `400`; 0-char notes, 100k-char notes, garbage base64 and a data-URI-prefixed
     `base64Data` all returned `200` without throwing.
   - **Google Drive import is correct** — `base64Data` is genuinely raw base64 and the `data:` URI is a
     separate `previewUrl` field, so my suspicion of a prefix leak there was disproved.
5. **Known gaps I chose not to "fix" (they are gaps, not bugs — no crash, no wrong output):**
   `$$` and `\begin{}` balance are not validated in `stepByStepSolutionTemplate`;
   `clozeOrdinals('{{c999999999::x}}')` accepts an absurd ordinal; the three duplicated
   extension→MIME chains and `base64ToBytes`'s silent `Buffer`-based garbage on a `data:` prefix
   (unreachable today, since every caller strips the prefix) all remain. **Two more readings from this round are reported rather than repaired**, because neither is reachable to a wrong output today: `claimValues('the pH is 7.4 and 7.35')` returns `["7.4 and", "7.35"]`, the first entry swallowing the following word as if it were a unit (`replace(/[^a-z0-9µ°%/]/g, '')` keeps letters), and `formatCount(NaN)` / `formatCount(Infinity)` print `NaN` / `Infinity` rather than a count. Neither is reached by a live caller in this tree; both would be one-line guards if a caller ever can.

## 3a. Defect 9 in detail — reachability, and a correction to my own first draft

| Bug Category | File & Line | Root Cause | How It Was Verified |
|---|---|---|---|
| State carry-over across sessions (session depth) | `components/workbench/StudioWorkbench.tsx:562`, `lib/clue-ladder.ts:47`, `app/page.tsx:932` | The clue-ladder reveal count is **module-level** mutable state (`revealedThisAttempt`), reset only by `useEffect(() => resetRungsRevealed(), [currentActivityIndex])`. An effect keyed on the *index* does not re-fire when a new session begins at the same index, so the count survives into the next session. `rungsRevealed()` is read at check time as `rungsUsed` and feeds the ZPD friction governor, where a clean win (no rung) is the signal that drives escalation — a carried-over count makes a genuinely clean win read as scaffolded, so escalation silently never fires. | Reachability established from code. The scenario is a **Guided Path module switch**: `handleSelectModule` (`app/page.tsx:836`) does not touch `appState`, the workbench's mount gate is `appState === 'encoding' && currentActivity` (`app/page.tsx:2215`), and the reducer's select-module action swaps `activities` while forcing `currentActivityIndex: 0` (`hooks/useSession.ts:240`). So module A at index 0 → switch → module B at index 0 keeps the workbench mounted with an unchanged index, and the count survives. **Correction to an earlier draft of this report:** I first blamed the plain re-encode path — that one is actually *safe*, because a fresh encode passes back through the launchpad, the workbench unmounts, and the effect re-runs on mount. Separately, `tests/unit/clue-ladder.test.ts` had **no** coverage of `resetRungsRevealed`/`rungsRevealed` at all, which is how this stayed hidden. **Fixed** by adding `activities` to the dependency list (the stage SET, not just the index, is the attempt's identity). Pinned by a source-scan wiring guard plus 4 new counter-contract tests (count, whole-attempt drop, idempotent reset, and a non-vacuous check). The guard was mutation-tested: reverting the dep list to `[currentActivityIndex]` makes it fail with `expected 'currentActivityIndex' to contain 'activities'`. **Not verified at runtime end-to-end** — a multi-session Playwright spec driving a module switch is the honest follow-up (see Limitations). |

`gear` (G1/G2/G3 depth) itself was probed separately and is **not** a state bug: it is a request-time setting consumed only by `/api/encode` (`app/api/encode/route.ts:589`, `app/api/encode/stream/route.ts:50`) and passed at call time (`app/page.tsx:759`); it holds no mid-session state, so switching depth between sessions cannot corrupt a session in progress. The carry-over risk in this area is the clue-ladder counter above, not the gear value.

## 3b. Defect 12 in detail — what the scramble was giving away, and the trade-off

Measured over 3000 seeds on a four-link chain, before and after:

| Reading | Before | After |
|---|---|---|
| Scrambles leaving a tile in its own slot | **369 / 3000 (12.3%)** | **0** |
| Scrambles that are a cyclic rotation of the chain | **1293 / 3000 (43.1%)** | **0** |
| Scrambles returning the canonical order | 0 | 0 |
| Distinct orderings offered | 12 of 24 | 6 of 24 |

Two things are worth stating plainly rather than burying:

- **The trade-off is real.** Excluding fixed points *and* rotations necessarily shrinks the pool: on a
  four-link chain there are 9 derangements, 3 of which are rotations, so 6 admissible orders remain.
  I chose the hint-free 6 over the hint-carrying 12 — a drill that repeats six orders is a weaker
  inconvenience than a drill that tells the learner where a link goes. A random shuffle's own rotation
  rate is ~n/n! (5 of 120 for a five-link chain), so the pre-fix 43% was not random chance: the second
  pass *manufactured* rotations by rotating any arrangement it touched.
- **Three-link chains cannot satisfy both rules**, because the only derangements of three items are
  their two rotations. The implementation therefore *prefers* pin-free and rotation-free, and yields the
  rotation penalty rather than returning a pinned order — there is a test for exactly this case, and a
  comment in the source at the point where the rules collide.

## 3c. Defects 13–14 in detail — and three ways this round could have gone wrong

- **Three of the probe's throws were my own misuse, not bugs**, and are recorded here so they are not mistaken for findings: `scoreDiscrimination([])` (its signature is `(questions, answers, seconds)`), `computeJargonDeflation([], [])` (it takes a *string* first, and I passed an array), and `index.isDuplicate` (the near-duplicate index exposes `add`/`has`, not `isDuplicate`). None of these is a defect in the code.
- **Two of my own test expectations were wrong, and the red run corrected them.** I first asserted that `"depolarisations"` alone should grade as correct — it does not, and should not: one content word of a two-word answer is 50%, under the drill's documented 60% bar. The honest expectation is the *inflected word inside a full answer*, which is what the test now pins. I also asserted that a single content word (`"segments"`) must be rejected; that is behaviour the drill has always allowed, so tightening it would have been a grading change nobody asked for. The fix is scoped to answers that carry **none** of the answer's content.
- **A suspicion I raised and then cleared, recorded so it is not re-raised as a finding.** `startedAt` for question 2+ is `answers[index - 1].endedAt`, while `record(index, choseConcept, Date.now() - startedAt)` is *called* with an elapsed duration — which reads like a duration stored where an absolute timestamp belongs, and would have made every question after the first clock 0 seconds. It does not: `record` writes `endedAt: Date.now()`. The wiring is correct and there is no defect here.
- **The two E2E failures on the first run of `scaffold-frame.spec.ts` were infrastructure.** `net::ERR_CONNECTION_REFUSED at http://127.0.0.1:39246/` — the managed preview had died mid-run (the first spec passed, then both later tests failed at `page.goto`). `freebuff-preview restart` brought it back and the same spec then passed **3/3** with no code change. Worth stating plainly, because "2 failed" on a screenshot of that run would look like a regression from the grading change; it was a dead server.

## 4. Files changed

```
 hooks/useSession.ts                         | 26 +++++++++-
 lib/anki-exporter.ts                        | 46 ++++++++++++++------
 lib/procedural-validator.ts                 | 56 ++++++++++++++++++++---
 components/workbench/StudioWorkbench.tsx    | dep list + comment
 tests/unit/forge-route.test.ts              | 43 +++++++++++++++
 tests/unit/clue-ladder.test.ts              | +6 tests
 tests/unit/anki-sm2-hardening.test.ts       | new, 114 lines
 tests/unit/roll-variables-hardening.test.ts | new, 151 lines
 tests/unit/xp-timer-cleanup.test.ts         | new, 69 lines
 lib/crucible/budget.ts                      | non-finite clock + weights, clock face
 lib/parsons.ts                              | scramble: derangement filter, rotation preference
 lib/visual-completion.ts                    | containment hint must carry the answer's content
 lib/discrimination.ts                       | clock ceiling clamped to the clock's own length
 tests/unit/crucible-budget.test.ts          | +3 tests
 tests/unit/parsons.test.ts                  | +4 tests
 tests/unit/completion-and-clock-hardening.test.ts | new, 10 tests
```

No new exports were added or renamed in any source file; `calculateSM2`'s signature,
`rollVariables`/`rollVariable`'s signatures and every error string in `procedural-validator.ts` are
unchanged. The only module-private helper added is `finiteFallback` in `lib/procedural-validator.ts`
(no name collision).

---

## 5. Round 3 - defects 15-16, the E2E failures finally attributed, and findings left open

### 5.1 Defect 15 - the deck memory compared fingerprints by index

| Bug Category | File & Line | Root Cause | How It Was Verified |
|---|---|---|---|
| Cross-device state: false 'changed' signal, non-commutative merge | `lib/deck-memory.ts:347` | `deckMemoryStoresEqual` compared `keys` **by index**, but `mergeDeckMemoryStores` rebuilds that list remote-first (`[...b.keys, ...a.keys]`) every time it runs. Two stores holding the identical fingerprint *set* in a different order therefore read as different, `merge` was not commutative as a value, and the cloud mirror writes on exactly that signal (`lib/deck-memory-cloud.ts:81`). | Reproduced: `merge(a, b).keys` = `c,d,a,b` against `a,b,c,d` for the reversed call, with `deckMemoryStoresEqual` **false** in both directions; a merge adding nothing at all also reported a change. Fixed by comparing membership (length plus subset test) rather than position. Pinned by `tests/unit/deck-memory-merge-hardening.test.ts` (4 tests); mutation-proven - restoring the index comparison fails 3 of them with `expected false to be true`, while the guard for stores that genuinely differ keeps passing. |

**Total: 17 distinct defects in 10 files** (defects 15–16 are both in `lib/deck-memory.ts`; defect 17 is the first in `lib/mr-m/ledger.ts`).

### 5.2 The E2E failures are attributed - and they are not from this work

This audit carried an open question from its first round: two `flashcard-forge` failures whose causality could not be established, because the managed preview serves the working tree and no clean baseline was obtainable. CI answers it. On the commit **before any of this work** (`bf2f8cc`) and on the first merged PR of this audit, the job results are identical:

| Job | `bf2f8cc` (pre-existing) | `1b0ffb0` (this audit) |
|---|---|---|
| Typecheck, lint, unit tests & build | **success** | **success** |
| Playwright e2e (chromium) | **failure** | **failure** |

The failing tests in CI are exactly the AnkiConnect-dependent ones: `e2e/flashcard-forge.spec.ts:215` and `:233` (expect lines `:226`, `:240`), and `e2e/anki-connect.spec.ts:91`, `:114`, `:137` (expect lines `:99`, `:121`, `:158`). So the E2E job is red on `main` independently of every change in this audit, and the failures are confined to the AnkiConnect path - which is the path the commit immediately preceding this audit (`bf2f8cc`, 'remove 127.0.0.1 AnkiConnect pings on HTTPS') had just changed. That is the hypothesis recorded in the limitations section, now confirmed rather than left open. Every spec this audit touched passes locally against the managed preview (`modal-a11y` 3/3, `sequence` 3/3, `scaffold-frame` 3/3), and the typecheck/lint/unit/build job passes in CI on the pre-existing commit and on **both** merges (verified job-by-job on each run; the e2e job was still in progress on the second merge when this was written, so no claim is made about its outcome there).

### 5.3 Found this round, reported, deliberately not repaired

- ~~**The deck-memory key cap discards the local device's fingerprints.**~~ **Repaired this round as defect 16** — the policy, its implications and the two failed designs behind it are in **§5.5**. Recorded here from the round that found it: `MAX_KEYS_PER_TOPIC` is 600 and the union was remote-first before `slice(0, 600)`. Measured: 5000 local plus 5000 remote keys gives 600 kept, **5000 local dropped and 4400 remote dropped**, every surviving key remote (`R0,R1,R2,...`). The module's own header says the memory exists so a device does not 'export a whole deck a second time', so dropping local fingerprints resurrects exactly those cards as new. This round's hesitation was that remote-first ordering is what makes two devices *converge*; §5.5 shows it is not the only way, and that ordering was a bug in its own right.
- ~~**`sourceLedgersEqual` has the same index-sensitivity**, and `mergeSourceLedgers` resolves equal-`at` ties remote-first, so a mirror write can still be triggered by tie order alone when two devices record the same source in the same millisecond.~~ **Repaired in round 5 as defect 18.** This round measured it and the tie half turned out to be the worse half: a same-millisecond tie let the **first argument's** card count win, so the two devices' merged ledgers disagreed about a number the panel displays, and the old comparison - which read only `key` and `at` - reported ledgers that disagreed about that number as **equal**, so neither device ever adopted the other's. The measurement, the fix and the three mutations are in **§7**; the trigger was wider than 'narrower trigger' suggested, because it does not need two devices at all: any store whose ledger is not newest-first (an older build's, or one the merge itself re-sorted) read as a change on every sync.
- **A partly-unicode title collapses to a misleading filename.** `remnoteDocumentFilename` strips non-alphanumerics, so `'delta-E plus emoji'` reduces to a single ASCII letter, and two different topics reducing to the same residue produce identically named RemNote documents. The empty case has a fallback (`'DeepEncode'`), the nearly-empty case does not. Path traversal is correctly impossible (`'../../etc/passwd'` becomes `'etc_passwd'`).

### 5.4 Probed clean this round

`lib/url-share.ts` round-trips deep-equal for ASCII, emoji plus accents, **a lone surrogate**, embedded newlines, quotes and cloze braces, and a 200 000-character payload; the empty string and garbage both decompress to `null`; an `activities: []` schema survives, so the guard is length-safe. `sanitizeClozeHint` caps at its limit and strips both brace and parenthesis content; `attachClozeHint` cannot be injected with a close-brace from a hint. Nested-deletion text (`{{c1::{{c2::x}}}}`) receives its hint inside the outer deletion, producing a malformed RemNote hint - but nested cloze is not produced anywhere in this codebase, so it stays an observation.

### 5.5 Defect 16 - the 600-key cap was won by whichever device was written first

| Bug Category | File & Line | Root Cause | How It Was Verified |
|---|---|---|---|
| Cross-device memory loss: the local device's fingerprints are dropped, so its own cards come back as new | `lib/deck-memory.ts`, `mergeDeckMemoryStores` (the key union) | The union was `[...remote.keys, ...local.keys].slice(0, MAX_KEYS_PER_TOPIC)`, i.e. remote-first, so a remote device already holding the cap pushed every local fingerprint off the end. | Reproduced three ways: (a) 5000 local + 5000 remote keeps 600 keys, **all of them remote**, 5000 local dropped (measured in round 3, §5.3); (b) a local deck of 40 cards against a 5000-key remote record keeps **zero** of the 40; (c) through the real read path - `recordDeckExport` then `saveDeckMemoryStore(mergeDeckMemoryStores(loadDeckMemory(), remote))` leaves `knownKeysForTopic` without a single key the device had exported. Fixed by the shared-cap policy below. Pinned by 7 new tests in `tests/unit/deck-memory-merge-hardening.test.ts`; mutation-proven - restoring the concat-then-slice fails **6 of the 7**, including the resurrection test and the 300/300 split. |

**The policy, and why this one.** A fingerprint carries no timestamp, so the only recency it has is its position in its own device's newest-first list (both `recordDeckExport` and `adoptDeckKeys` prepend, "so the cap trims the oldest"). That is the signal `mergeSourceLedgers` reads from `at`, one level down. Four rules follow, and they are what the tests assert:

| Rule | Consequence |
|---|---|
| Each device keeps its newest `MAX_KEYS_PER_TOPIC / 2` fingerprints (300 of 600) | Two devices at the cap each keep their own newest 300; neither can empty the other |
| A device holding fewer than 300 keeps **all** of them, and the unused share flows to the other device | A 40-card local deck against a 5000-key remote record keeps all 40, and the remote takes the other 560 |
| Each device's fingerprints stay contiguous and in that device's own newest-first order | The cap trims each device's **oldest**, not an arbitrary tail, and the survivor still reads newest-first per device |
| The two blocks are ordered by their content, never by which device is merging or by argument order | Both devices build the same list, so neither writes a mirror the other would call different on order alone |

**Implications, stated plainly rather than buried in the fix:**

- **The loss is bounded, not zero.** When both devices overflow the cap each still loses its own oldest fingerprints (300 of a 600 cap each). That is what a cap is; what is gone is the *unbounded, one-sided* loss that resurrected a whole local deck.
- **Recency here is positional and per device.** There is no per-key age to rank across devices, so when both blocks overflow the rule divides the budget instead of guessing which device is more recent. Storing a per-key `at`, stamped at export time and carried through the record (and through `lib/deck-memory-cloud.ts`, which rebuilds records field-by-field), would upgrade the rule to the source ledger's exact one. That is a schema change to a store older app versions read and the cloud mirror writes, so it is recorded as the upgrade path rather than taken in this pass.
- **The survivor list is no longer globally newest-first**, only per device. Every consumer reads it as a set (`knownKeysForTopic` → `Set`, `diffReportAgainstMemory` → `has`, `deckMemoryStoresEqual` → membership), so ordering was never load-bearing - but it is worth knowing before reading the list.
- **Anki adoption inherits the guarantee.** `adoptDeckKeys` prepends like an export, so fingerprints read back out of a real Anki collection are treated as that device's newest and survive a capped merge.
- **Verification scope.** The new tests drive the real path - `recordDeckExport` into `happy-dom`'s `localStorage`, then `loadDeckMemory` → `mergeDeckMemoryStores` → `knownKeysForTopic` - and the pure merge directly. **Not covered:** a live Firestore round trip (unit tests have no Firebase) and a two-browser e2e. The cloud mirror needs no change for this policy - it writes the merged record through and gates its local save on `deckMemoryStoresEqual`, which compares membership.

**The design that failed first, recorded because my own test caught it.** The first attempt ranked the survivors into one recency-sorted blend. That is not stable: a blend compacts 600 survivors into positions 0..599 while their true ages span 0..299, so every key a device holds reads as twice as old as it is, and the next merge pushes local fingerprints back out. Measured on a 700-key local list against a 900-key remote one: the second sync dropped **100 of the 300 local keys the first sync had retained** while taking in 100 remote keys of the same true age. Hence a contiguous block per device, and hence a fixed-point test - the only assertion the blend design fails.

| Check | Result |
|---|---|
| `npx tsc -b --noEmit` | **exit 0** |
| `npx vitest run` | **exit 0** - 75 files, **1264 passed** (was 1257 before this round's 7 tests) |
| `npx eslint lib/deck-memory.ts tests/unit/deck-memory-merge-hardening.test.ts` | **exit 0** |
| Mutation A - the old concat-then-slice restored | **6 of 7 cap tests fail**, including `does not resurrect this device's cards as new` and the 300/300 split |
| Mutation B - survivors as one recency-sorted blend | **exactly 1 fails**, the fixed point (`expected Set{l0,r0,r1,l1,…} to deeply equal Set{l0,r0,l1,r1,…}`), so that test is not vacuous |

Files changed in this pass: `lib/deck-memory.ts` (the cap policy and its documentation), `tests/unit/deck-memory-merge-hardening.test.ts` (7 tests: 4 asked for by this request, 3 guarding the convergence properties the policy depends on), `BUGS_AUDIT_REPORT.md`. No export was added, renamed or removed.

---

## 6. Round 4 - defect 17, the patch registry ranked by array position

Round 4 went at the two families that have already paid off in this audit: a cap that drops the wrong thing, and state whose order is assumed rather than measured. It found one defect, measured it, and fixed it.

### 6.1 Defect 17 - the patch registry's cap and its pre-flight disagree about what matters

`lib/mr-m/ledger.ts` stores patches newest-first **by first sighting**: `recordPatch` re-opens a repeat in place (`next[index] = reopened`, incrementing `hits` and moving `lastSeenAt` forward) and only a brand-new fracture is prepended. Both readers then treat that array as if it were ordered by recency or importance:

- **The pre-flight selection.** `preflightWarnings` / `warningsFrom` document themselves as 'Newest-first, capped' and slice the first `MAX_PREFLIGHT` (3) of the `hits >= REPEAT_HITS` (2) records in array order. **Measured:** with four standing faults on one topic, the fault that fired most recently (`SIGN_FLIP`, 3 hits, `lastSeenAt` 90 000 - the newest sighting in the registry) was **excluded**, while two faults last seen at 5 001 and 5 003 were shown. The warning surface shows the stalest faults and hides the one being repeated right now.
- **The cap.** `savePatches` trims with `slice(0, MAX_PATCHES)` over the same first-seen order, so the eviction ignores `hits` entirely. **Measured:** a 5-hit standing fault was evicted by 60 one-off slips, leaving `max_hits_kept = 1` and `preflightWarnings('Thermochemistry') = 0` - the tripwire permanently blind to the fault it exists for, with the registry's own record of it destroyed.

Both contradict the module's stated doctrine ('a defect that fires once is a slip while the same one firing three times is a standing fault worth a pre-flight warning'), and the array order itself cannot be re-sorted to fix it: `patchNumbers` deliberately numbers by first-seen order so 'a number a learner has already seen does not move'.

**Fixed**, in three ordered pieces in `lib/mr-m/ledger.ts`:

| Piece | What it does |
|---|---|
| `bySignificance(a, b)` | The registry's own value function, applied explicitly: highest `hits` first, then the most recent `lastSeenAt`. The sort is stable, so a genuine tie on both keeps first-seen order |
| `trimPatches` | Chooses the cap's survivors by `bySignificance` — so a standing fault can no longer be destroyed by a flush of slips — and writes them back in first-seen order, so `patchNumbers` still never renumbers |
| `warningsFrom` | Ranks by `bySignificance` before `slice(0, MAX_PREFLIGHT)`: the live fault keeps its slot and the stalest one gives way. `filter` hands it its own array, so sorting cannot reorder the caller's ledger |

`hitCount` and `lastSighting` read their fields defensively (a non-finite `hits` counts as zero rather than poisoning the comparator with `NaN`), because `loadPatches` cannot vouch for a hand-edited or older store.

**Verified** — 6 new tests in `tests/unit/mr-m-ledger.test.ts`, written first and red on the unfixed code: the four-fault ordering case (the 3-hit fault that fired most recently is warned first, the stalest fault gives up its slot), the over-cap case (a 5-hit fault survives 60 slips, `preflightWarnings` still returns its warning, and 59 slips are kept so the cap still holds), numbering through a cap overflow, plus guards that a registry of pure one-off slips behaves exactly as it always did, that a complete tie resolves deterministically, and that a handed-in list is not mutated. **Mutation-proven:** making `bySignificance` return `0` — the old array-position behaviour — fails exactly the first three and leaves the three guards passing.

| Check | Result |
|---|---|
| `npx tsc -b --noEmit` | **exit 0** |
| `npx vitest run` | **exit 0** — 75 files, **1270 passed** (was 1264) |
| `npx eslint lib/mr-m/ledger.ts tests/unit/mr-m-ledger.test.ts` | **exit 0** |
| Mutation — `bySignificance` returns `0` | **3 fail** (ordering, cap, numbering); the 3 guards pass |

### 6.2 Probed clean this round, so the absence of findings is not read as coverage

- **The AI cache's L2 is bounded.** `lib/db.ts` enforces `AI_CACHE_MAX = 200` plus a 7-day TTL and prunes on every write, so the suspicion that the capped L1 (`CACHE_MAX = 60` in `lib/ai-client.ts`) sits on an unbounded IndexedDB layer is disproved.
- **The other short ordered ledgers are fed newest-first by every writer** - `save([entry, ...existing])` in `lib/mr-m/ledger.ts`, `save([entry, ...loadFrictionHistory()])` in `lib/escalation/governor.ts` - so the 'cap keeps the oldest' failure mode does not exist there (that was this round's hypothesis, and it is disproved rather than left untested).
- **The lab-snapshot mirror is sound.** `mergeToyProgressStores` merges per key by `updatedAt` with a stated tie rule and a by-value equality, and `progress-cloud.ts` trims to the cloud cap before comparing, so no false 'changed' loop and no loss.

### 6.3 Observations reported, not repaired

- `lib/ai-client.ts` calls itself a 'Small LRU response cache', but `cacheGet` never refreshes recency, so it is FIFO by write order: a frequently *read* generation can be evicted while a never-read one survives. A comment/behaviour mismatch with a cache-effectiveness cost, not a correctness bug.
- The same file's `hashKey` reduces provider + model + prompt to a 32-bit djb2 hash plus a length suffix, and L2 keeps results for 7 days: a collision would silently serve a different prompt's generation. Worth measuring at realistic cache sizes before it is called a defect.
- `lib/toy-models/progress-cloud.ts` and the README line that summarises it claim snapshots it evicts 'return on the next sign-in'. The merge does bring them back into the union, but `saveToyProgressStore(merged)` re-trims to the 500-entry device cap and `loadToyProgress` reads only the local store, so a snapshot older than the device's newest 500 stays unreachable **on that device** (a fresh device does receive the newest 500). No data is lost - the account copy is capped at 2 000 and still holds it - but the restore promise is overstated.

### 6.4 Method note

Round 4's first probe used `UNIT_SLIP` as a patch kind. That is a **trap id**; `DISCREPANCY_KINDS` is deliberately a separate vocabulary (`lib/mr-m/types.ts` says why), so `recordPatch` correctly refused all sixty records and the probe measured nothing until it was corrected - a false alarm of mine, not a defect. The broad ripgrep sweeps were also too loose to be useful (they matched whole documentation files); the round's real progress came from reading the cap-bearing modules directly.

---

## 7. Round 5 - defect 18, the source ledger compared by index (§5.3's last open finding, closed)

Round 5 took the one bullet §5.3 left open from round 3 - 'same family as defect 15; reported but not measured' - and measured it before changing anything. The order half was as expected; the tie half was worse than the bullet described, because the comparison could not see the disagreement the tie created.

### 7.1 Defect 18 - the source ledger is a set of sightings, not a sequence

The source ledger (`DeckMemoryRecord.sources`) answers the other half of the memory's question: not 'have I already shipped this card' but 'have I already cut this lecture'. One level up, the fingerprint list had exactly this defect (defect 15) and it was fixed by comparing membership; the ledger was left comparing position.

| Bug Category | File & Line | Root Cause | How It Was Verified |
|---|---|---|---|
| Cross-device state: false 'changed' signal, non-commutative merge, and a shared number the two devices disagree about | `lib/deck-memory.ts` (`sourceLedgersEqual`, `mergeSourceLedgers`) | `sourceLedgersEqual` compared `left[index].key`/`.at` **by index**, but `mergeSourceLedgers` rebuilds the ledger from both sides on every run, so its order is an artifact of who merged and in which direction. `mergeSourceLedgers` also kept the entry iterated **last**, over an array built remote-first - i.e. on an equal `at` the *local* device's card count won, remotely-first for a merge that named this device remote - while the comparison read only `key` and `at` and so could not see the disagreement. | Reproduced on the unfixed code, five ways, all red before the fix: (a) two ledgers holding `[url:lecture 4 @900, file:slides.pdf @400]` and the reverse read as **different**; (b) at same-millisecond ties, `[url @900, slides @900]` against `[slides @900, url @900]` read as different in both directions, so a merge that re-sorted and added nothing reported a change - the trigger does not need two devices, only a ledger the merge re-orders; (c) through the real mirror sequence (write, `loadDeckMemory`, `mergeDeckMemoryStores`, `deckMemoryStoresEqual`) a store whose ledger is not newest-first reads as changed on every sync; (d) the same-millisecond case kept the **first argument's** counts: `merge(mine, theirs)` produced `url:lecture 4` = 12 cards and `slides.pdf` = 20 while `merge(theirs, mine)` produced 14 and 18 - different card counts for the same sighting; (e) 80 sources all sighted in one millisecond against the 60-entry cap: both directions kept 60, but the retained **sets differed by 20**. The old comparison's blindness to (d) is measured directly - a ledger recording 13 cards for a source read as **equal** to the same ledger recording 12 (the guard test asserting the opposite failed with `expected true to be false`). |

What makes the failure matter is the caller: `lib/deck-memory-cloud.ts` computes `changed = !deckMemoryStoresEqual(local, merged)`, writes the store back when it is true and tells the learner 'Merged with your account's deck memory' - so an order-only difference is a permanent false report and a permanent re-save, exactly the loop defect 15 caused one level up.

**Fixed**, in three pieces in `lib/deck-memory.ts`:

| Piece | What it does |
|---|---|
| `bySighting(a, b)` | The ledger's total order: freshest `at` first, then by `key` for sightings stamped in the same millisecond. Sightings are deduplicated by key before it is applied, so it is total - the array becomes a function of the entries rather than of the order they arrived in |
| `betterSighting(candidate, incumbent)` | The union's value function: newer `at`, then the fuller cut (`cards`), then the label. A total order, so the merged ledger is the maximum of the two under it and neither the argument order nor which device is merging can change the answer |
| `sourceLedgersEqual(a, b)` | Compares a canonical ordering of the entries **whole** (`key`, `at`, `cards`, `label`) instead of by position. Reading only `key`/`at` would have left the disagreeing count that the merge now resolves invisible to the device holding the smaller one, so its local copy would never be saved and it would keep showing its own number while the account held the other's |

`recordDeckSources` and `forgedSourceLedger` use the same two helpers, so the order stops depending on arrival anywhere the ledger is built or read - `forgedSourceLedger`'s cross-topic tie used to go to whichever topic the store happened to list first.

**Verified** - 7 new tests in `tests/unit/deck-memory-merge-hardening.test.ts`, six of them written first and red on the unfixed code, the seventh (the real-path walk) added afterwards and then measured red against the restored pre-fix comparison:

| Check | Result |
|---|---|
| `bun tsc -b --noEmit` | **exit 0** |
| `bunx vitest run` | **exit 0** - 75 files, **1277 passed** (was 1270) |
| `bunx eslint lib/deck-memory.ts tests/unit/deck-memory-merge-hardening.test.ts` | **exit 0** |
| Mutation - `bySighting` tie-break returns `0` (arrival order) | **2 fail** (either-direction merge, over-cap retention); the 5 membership tests pass |
| Mutation - `betterSighting` ignores `cards` | **2 fail** (tie resolves the same either way, adopt-then-hold); the 5 others pass |
| Mutation - restore the pre-fix positional comparison | **5 of 7 fail**, including the real-path walk |

Not run: the Playwright specs (no UI path is touched - this is a library-level comparison whose caller was read, not driven) and Firestore itself (no credentials here; the merge the mirror calls is exercised directly, which is how this module's tests are written).

**Total: 18 distinct defects in 10 files** (defect 18 is the third in `lib/deck-memory.ts`, after 15 and 16).

### 7.2 The account copy of the source ledger was written and never read — **repaired in round 6 as defect 19 (§8)**

The finding as it stood after round 5, kept here as the record of what was open then:

`lib/deck-memory-cloud.ts` writes the merged records, `sources` included, with `setDoc` - but `readRemoteRecords` maps only `topic`, `keys`, `updatedAt`, `exports` and `lastSurface`, so `sources` is dropped on the way in. Consequences, both read off that single reader rather than inferred: (a) `mergeSourceLedgers(a.sources, b.sources)` always receives `undefined` for the account side, so the cross-device half of the ledger union is inert - a lecture forged on the laptop is offered again on the desktop, which is the opposite of the comment above that merge ('forging this topic on a second device is still material already cut'); (b) the divergence fixed above is therefore, in the deployed path, latent rather than live: it is reachable through the exported `mergeDeckMemoryStores` (which is what its tests and this report exercise) and becomes live the moment the reader carries the field. Not repaired here because carrying it is a behaviour change - the ingest panel would begin offering to skip sources cut on another device - that needs its own sanitising and its own verification, not a line added to a fix about comparison order.

### 7.3 Method note

The §5.3 bullet was written from reading and called the trigger 'narrower'; the measurement is what corrected it. Two of the three mutations were chosen to isolate the *halves* of the fix rather than to re-prove the whole: the order mutation kills only the order tests, the `cards` mutation only the content tests, and restoring the old comparison kills five of the seven - which is the evidence that each piece carries its own weight rather than one test standing in for all of them.

---

## 8. Round 6 - defect 19, the account's source ledger was written and never read

Round 5 ended by recording one finding of its own in §7.2 and leaving it open. Round 6 closed it, and most of the work was in deciding what "trust this document" has to mean.

### 8.1 Defect 19 - the ledger union had one side

| Bug Category | File & Line | Root Cause | How It Was Verified |
|---|---|---|---|
| Cross-device memory: half the ledger union was inert | `lib/deck-memory-cloud.ts`, `readRemoteRecords` | The push has always stored the merged records whole - `mergeDeckMemoryStores` carries `sources` for a local-only record and unions it otherwise - but the reader mapped only `topic`, `keys`, `updatedAt`, `exports` and `lastSurface`. So `mergeSourceLedgers(a.sources, b.sources)` always received `undefined` for the account side, and `forgedSourceLedger()` - the function the forge's setup panel asks - could only answer for the device in hand: a lecture cut on the laptop was offered as new material on the desktop, which is the opposite of what the ledger exists for. | Reproduced on the unfixed reader: an account document carrying a ledger produced a local store with no `sources` at all and `forgedSourceLedger().get(deckSourceKey(source))` returned `undefined`, i.e. no `[ FORGED × n ]` chip and no skip offer on the second device. Restoring the pre-fix reader turns **5 of the 13** new tests red; the 4 structural guards (a legacy record, an unreadable ledger, the fingerprints of such a record, and the not-signed-in path) stay green. |

The fix is `readRemoteSources(value)` plus one mapped field, and the interesting part is what it refuses to do. This is the only place in the memory where a document this app did not write (another device's, an older build's, a hand-edited one) enters:

- **`at` is required, not defaulted.** It is the recency the union ranks by and the value the two devices are compared on. A default of `Date.now()` would invent a sighting newer than everything on both devices; a default of `0` would let a stale account copy evict a fresh local one. A sighting without a usable `at` is therefore dropped. **Mutation-proven:** defaulting it to `0` instead of dropping the entry turns exactly the two `at`-handling tests red.
- **`key` is required.** It is the source's own fingerprint; without it the entry cannot match anything, so there is nothing to keep.
- **The display fields degrade instead.** A missing `label` falls back to the key and a non-numeric `cards` to `0`, so a ledger written by a build that did not store them still reads rather than being thrown away.
- **`undefined`, never `[]`.** The merge reads "no ledger here" as "leave this device's ledger alone"; an empty array would be the claim that the account knows about no sources at all - which is why an empty or unreadable ledger leaves the local fingerprints and the local ledger untouched (both pinned by tests).
- **A record with an unreadable ledger is still read.** Its fingerprints answer "have I shipped this card"; discarding them because the optional ledger was malformed would re-offer cards the learner already has.

**The one consequence a learner can observe, stated rather than implied.** The 60-sighting cap is now a cap on the union, trimmed by sighting time. That is the recency rule `recordDeckSources` already applies to a single device's own list, so the union inherits it rather than inventing a second policy - but it means a source older than the newest 60 sightings across the account reads as new again, on the device that had it and on the one that did not. Pinned in both directions: with 40 local sightings newer than 40 remote ones, all 40 local survive and the remote's 20 newest give way; reversed, the local device's 20 oldest are what give way, and the surviving set is the same either way round - the trim is by `at`, not by which device wrote first.

**The ingest panel, examined rather than assumed.**

- `forgedBefore` iterates **this setup's own** sources and asks `ledger.get(deckSourceKey(source))`, so a source the learner never attached can never be listed, and a different lecture in the same topic cannot inherit the chip - the lookup is by fingerprint, which is pinned by a test.
- The topic the chip names comes from the record the sighting sits in and is rendered as text in a tooltip. Nothing navigates to, or looks up, the remote topic, so a ledger entry from another device cannot point at a deck this device does not have.
- The skip stays a single explicit, reversible click ("skip n already-forged sources" / "use them again"), and the row says where it landed and how many cards - never a silent drop.
- A ledger-only difference can now set `changed` on a sync where nothing else did, which calls `refreshMemory(deck, 'keep')`. That recomputes the **card** diff from fingerprints, which the ledger does not feed, so the effect is a recompute of a number that is already right; and the next sync is the fixed point, so it cannot become a re-report loop (both pinned by tests).
- **Nothing new leaves the device.** The account copy already held the ledger - the push was never the bug - so this fix stops the second device from ignoring it rather than adding a field to what is mirrored. Said plainly because "now mirrored" would read as a new exposure.

| Check | Result |
|---|---|
| `bun tsc -b --noEmit` | **exit 0** |
| `bunx vitest run` | **exit 0** - 76 files, **1290 passed** (was 1277) |
| `bunx eslint lib/deck-memory-cloud.ts tests/unit/deck-memory-cloud.test.ts` | **exit 0** |
| Mutation - restore the pre-fix reader (no `sources` mapped) | **5 of 13 fail**; the 4 structural guards pass |
| Mutation - default a missing `at` to `0` instead of dropping the entry | **2 fail** (both `at` tests) |
| `bunx playwright test e2e/flashcard-forge.spec.ts -g "already forged\|re-forge says what is already in the deck"` against the managed preview | **2 passed** (18.8s) - the panel's own regression tests for the memory-aware ingest chip, skip, unskip and the deck diff |

Not run: Firestore itself (no credentials in this environment - the SDK boundary is mocked, which is the honest line to draw for a reader whose whole job is the shape of a document), and the rest of the Playwright suite (the AnkiConnect-dependent failures of §5.2 are unrelated and pre-existing; neither spec run here touches AnkiConnect, which is mocked offline).

**Total: 19 distinct defects in 11 files** (defect 19 is the first in `lib/deck-memory-cloud.ts`).

### 8.2 Method note

This is the first test file in the repo to mock a cloud module's SDK boundary (`vi.mock('firebase/firestore')` plus the app's `lib/firebase`), which is what made a reader that only touches a `data` object testable at all; the alternative - trusting the real SDK against a real project - would have made the unit suite depend on credentials. The reader is exported for tests for the same reason `aiCacheSize` is: the wire shape is the whole of its job, and it is the one place untrusted document data enters the memory. The panel question was answered in two ways rather than one: by reading what the panel does with a ledger entry, and by running the two Playwright tests that already existed for that path.
---

## 9. Round 7 - defect 20, the near-duplicate guard was fed the wrong list

Round 7 went back to the module that builds the deck, `lib/services/forge.ts`, because the last three rounds each found a defect in a place where two functions disagreed about what an argument means (a ledger compared by index, a cap ranked by array position, a reader that dropped a field). This module has the same shape: one guard, two callers, and only one of them obeying the guard's own documented requirement.

### 9.1 Defect 20 - a re-worded repeat shipped because the index was seeded with fingerprints

| Bug Category | File & Line | Root Cause | How It Was Verified |
|---|---|---|---|
| Silence that ships a duplicate card | `lib/services/forge.ts` (`mergeAdditionalCards`) | `dropKnownCards` documents the requirement in its own body - "Callers pass RAW fronts: the near-duplicate guard reads the original wording, and a pre-normalized key has already thrown that away (which would make it fall back to exact matching, i.e. to the behaviour this replaced)" - and the route obeys it (`known = new Set(existingFronts)`, raw). `mergeAdditionalCards` - the path the modal's "generate more", re-forge and auto-grow loop actually take - seeded the same index with `deckCardKeys(base)`, whose entries are `dedupeKey` fingerprints: lowercased, punctuation collapsed to spaces. The guard it feeds compares two signals that a fingerprint has already destroyed - `protectedTokens` (the mid-sentence capitals that mark named entities, plus digit-bearing tokens) and the normalized-length band. `protectedTokens(seed)` therefore reads FEWER entities than `protectedTokens(candidate)` reads off raw text, the mismatch branch returns false, and the re-worded repeat is appended as a new card. | Measured five ways. (a) The guard's own verdict flips with the seed: `isNearDuplicate(raw, raw)` is **true** for `'The loop of Henle reabsorbs salt and water along the ascending limb'` vs `'…along the entire ascending limb'` (similarity 0.901), for the re-ordered `1,200 mOsm at the papillary tip of the medulla` pair (0.938) and for `'Water leaves the descending limb through aquaporin-1 channels'` vs `'…through the aquaporin-1 channels'` (0.952) - and **false** for `isNearDuplicate(dedupeKey(raw), raw)` on all three, which is what the merge was doing. (b) Through `mergeAdditionalCards` with a one-fact deck, all three pairs came back `added 1 / dropped 0`; after the fix, `dropped 1`. (c) A 401-card deck repeating its **last** card (the card past the route's 400-front window): `dropped 0` before, `dropped 1` after. (d) A re-forged worked example (same title, re-worded problem): `added 1 / dropped 0` before, `added 0 / dropped 1` after. (e) Backwards compatibility: a card whose **number** changed (1,200 -> 600 mOsm) and a card naming a **different entity** are still kept in both states, so the fix cannot collapse two genuinely different cards. |

**The two ways this reaches a learner.** The route runs the same guard first, seeded with the raw fronts the client sends, so for a small deck it usually catches the repeat before the client merge ever sees it - which is exactly why this stayed hidden. It stops covering the case in two measured ways:

- **A deck larger than the prompt window.** `MAX_EXISTING_FRONTS = 400` truncates `body.existing` for the prompt *and* for the route's seed (`app/api/forge/route.ts:296`) - one list, two uses. On a 500-card deck the last 100 fronts are unknown to the server, so a repeat of card #450 is the client merge's problem alone, and the client merge did not drop it.
- **A re-forged worked example.** A worked example's card text is `` `${title} ${problem}` `` (see `deckCardKeys`, and the addition side of `dropKnownCards`), but the prompt's front list names only the title (`collectCardFronts`). The server's seed is the title, so its exact key can never equal the composite and its near-duplicate pass misses on the length band (a 45-character title against a 125-character composite is rejected by `Math.abs(ka.length - kb.length) > Math.max(16, ka.length * 0.25)`). The client merge is the only guard for that pair, and it was seeded wrong.

**Fixed**, in two pieces in `lib/services/forge.ts`:

| Piece | What it does |
|---|---|
| `collectDeckCardTexts(report)` | New: the raw wording of exactly the cards `deckCardKeys` fingerprints (facts, mechanisms, questions, `` `${title} ${problem}` ``, cascades, tripwires). One list of cards, two projections: this is what a duplicate index needs, `deckCardKeys` is what set arithmetic needs |
| `deckCardKeys` / `dropKnownCards` / `mergeAdditionalCards` | `deckCardKeys` now derives from the same collector, so the two can never drift apart in *which* cards they cover. `dropKnownCards` takes `Iterable<string>` (was `Set<string>`) and its doc now states the raw-text requirement at the parameter, not only in the body. `mergeAdditionalCards` seeds with `collectDeckCardTexts(base)` |

**Verified** - 5 new tests in `tests/unit/forge.test.ts`, three of them red on the unfixed seeding and two of them guards that must pass in both states:

| Check | Result |
|---|---|
| `bun tsc -b --noEmit` | **exit 0** |
| `bunx vitest run` | **exit 0** - 76 files, **1295 passed** (was 1290) |
| `bunx eslint lib/services/forge.ts tests/unit/forge.test.ts` | **exit 0** |
| `bunx vitest run tests/unit/forge.test.ts` | **exit 0** - 49 passed |
| Mutation - restore `dropKnownCards(addition, deckCardKeys(base))` | **exit 1**, `3 failed / 46 passed` - exactly the three new duplicate tests (`expected +0 to be 1` on the drop count); the two protection guards stay green |
| E2E forge spec vs the managed preview (`:39246`) | **exit 0** - **20/20** (2.2m), including *growing the deck keeps going on its own until the target, then stops*, which drives the loop this change feeds |

Files changed in this pass: `lib/services/forge.ts` (the collector, the derivation and the seed), `tests/unit/forge.test.ts` (5 tests), `BUGS_AUDIT_REPORT.md`. **One new export** (`collectDeckCardTexts`) - the first in this audit; the parameter type of `dropKnownCards` was widened, so every existing caller still compiles.

**Total: 20 distinct defects in 12 files** (defect 20 is the first in `lib/services/forge.ts`).

### 9.2 Probed clean this round, so the absence of findings is not read as coverage

- **The declared-ledger evaluator.** `evaluateExpression` was probed against 22 hand-checked shapes - precedence (`2x^2` = 2·(x^2) = 18, `2(3)^2` = 18, `2^3^2` = 512 right-associative), the documented refusal of the spaced implicit product (`x y` -> `null`) against the accepted coefficient (`2x`), unary minus (`-2x` = -6), a negative exponent, division by zero (`x/(y-y)` -> `null`), the closed function table (`ln`/`log`/`sqrt`/`sin`), an unknown call name (`q(2)` -> `null`), scientific notation (`1.5e-3`), the constants, and malformed input (`x+`, `()`, `3 2`). Every result matched the hand-computed value; no mismatch. Its unary-minus-versus-exponent reading is a convention choice, not a defect.
- **`sanitizeForWozniak`'s ceiling invariant.** Every card in `cards` and every card in `heldBack` was recounted: nothing that was *shipped* exceeded the 20-word ceiling (the withheld ones are listed as withheld, which is what `heldBack` is for).
- **`sourceYield` and `buildCoverageReport`.** Read and probed: the thin/silent/unknown branches are ordered so an unjudgeable source cannot be called thin, and a gap names only sources that were actually cut (`status === 'ok'`).
- **The governor's streak.** `cleanWinStreak` scopes by topic, zeroes on a miss and *ends* (rather than zeroes) on a rung - which is what its own comment claims, so the reading matches the doctrine.
- **The interference-trap store.** Cap 60 newest-first with a case-insensitive front dedupe: the eviction can only drop the oldest, and the duplicate it replaces is the one it replaced. No wrong-end-of-the-cap problem here.

### 9.3 Observation reported, not repaired

`splitDenseCloze` (`lib/fsrs-audit.ts`) says it returns "two atomic cloze sentences, **each at or under the word limit**", and its own test already allows slack (`toBeLessThanOrEqual(TOO_LONG_WORD_LIMIT + 2)`), which is how the claim stayed unchallenged. Measured on five realistic dense cloze sentences, the halves came back at 17-22 words against a 15-word limit, and one half of a sentence whose deletion carries most of the words returned at **22**. Neither caller is harmed: `enforceCeiling` re-checks each half against the 20-word Wozniak ceiling and withholds what is still too long, and the modal's manual auto-split simply leaves the audit flag on the card it split. What is wrong is the sentence, not the split - a "split" cannot always make two ≤15-word halves out of a 38-word sentence, and the honest contract is "best effort, each half shorter". Recorded rather than re-worded in this pass because the fix nobody asked for (recursive splitting, or an extra blank inserted mid-clause) changes the cards that ship, and the ceiling that actually gates an export is Wozniak's. **Round 9 (§11) closed this observation: the request then asked for exactly this audit, and the measurement above became defect 23.**

### 9.4 Method note

The finding came from asking what each argument *means* at a call site rather than whether the call type-checks: `dropKnownCards(addition, known)` accepts any string collection, and the two callers passed collections with different semantics - one raw, one normalized - so the type system could not tell them apart and the tests only covered whichever style each test happened to use. The sibling test that pins the raw path ("The route seeds this with the deck's raw fronts (not normalized keys)") and the rewrite that is only reachable through the *other* path are what made the gap invisible. The mutation was chosen to isolate the seeding rather than the guard: restoring `deckCardKeys(base)` leaves the guard itself untouched, so the three failures are evidence about the seed and nothing else.

---

## 10. Round 8 - defects 21-22, the route's duplicate path on a 500-card deck

Round 7 left one limitation explicitly open: *"the route's own >400-front path is demonstrated at module level, not over a real HTTP request."* Round 8 closed it by driving `POST` in `app/api/forge/route.ts` with a 500-card deck, and the end-to-end run found two defects in the same line of that handler - the one that hands the deck's fronts to the model **and** to the dedupe.

### 10.1 The route used one 400-front window for two different jobs

| # | Bug Category | File & Line | Root Cause | How It Was Verified |
|---|---|---|---|---|
| 21 | Silence that ships a duplicate card, server side | `app/api/forge/route.ts:296`, `:576` | `existingFronts` was `body.existing.filter(...).slice(0, MAX_EXISTING_FRONTS)`, and that one value was then used twice: as the model's do-not-repeat list (where the 400 is a TOKEN budget - each line costs prompt) and as the seed for `dropKnownCards` (where the list is matched locally and costs nothing). On a deck of 500 fronts the last 100 cards were therefore invisible on both sides: the model was not told about card #450, and the drop had never seen it, so a re-worded repeat of it was returned as new and appended to the deck. | Driven through the real handler: `POST { mode: 'more', existing: <500 fronts with card #450 = 'The vasa recta carry blood away from the loop of Henle in the medulla'>, sources: [one text source] }` with the model mocked to return `['The vasa recta carry blood away from the loop of Henle, deep in the medulla', <one genuinely new card>]`. Pre-fix: **200 with the repeat inside `report.declarativeFacts`**, `dropped: 0`, `total: 2`. Post-fix: `dropped: 1`, `total: 1`, the repeat absent - and the same on the streamed NDJSON path the modal actually reads (`done.payload`). |
| 22 | One over-long entry switches the whole pass off | `app/api/forge/route.ts:210` (the body schema) | `existing: z.array(z.string().max(400))` enforced a per-entry *content* bound whose failure mode is to reject the entire request: a single front longer than 400 characters returned `400 Invalid request - existing.<i>: Too big` for a pass whose whole job is to add cards. The module's own doctrine (`lib/api-validation.ts`) is that these schemas "enforce *type and boundary* ... but not content", and the route's handler already filters junk entries itself. | Driven through the real handler: the same 500-card deck with **one** front at 401 characters. Pre-fix: **HTTP 400**, no cards and no dedupe. Post-fix: 200, `dropped: 1`, `total: 1`. |

**Fixed**, in three pieces in `app/api/forge/route.ts`:

| Piece | What it does |
|---|---|
| `MAX_EXISTING_FRONTS` | Docstring now says what it is: a TOKEN budget that bounds the prompt only, and points at the site that explains the split |
| `existingFronts` / `promptFronts` | The handler now keeps the whole validated list (`existingFronts`, raw, in the order the deck ships) and derives the model's window from it (`promptFronts = existingFronts.slice(0, MAX_EXISTING_FRONTS)`). The prompt line uses the window; the drop seeds with the whole list |
| the body schema | The per-entry bound on `existing` (and on `known`, which is validated but never read - see 10.4) goes 400 -> 20,000, the same order as the answer fields in the other route schemas. The *list* bound (5,000 entries) is what keeps a request small; the per-entry bound is a sanity check, not a rule that can fail a learner's extension pass |

**Why the prompt window was left at 400 and the first 400.** The window is spent on tokens, so it has to stay bounded; the alternative considered was to sample it across the deck (`every ceil(n/400)`-th front) so a 500-card deck's do-not-repeat list covers its tail. That changes what the model is told, which is a prompt decision rather than a defect fix, so it is recorded here instead of taken. The consequence of leaving it is stated plainly: the model can still offer a tail card, and the drop now removes it, so a batch consisting only of tail repeats counts as an empty batch for the grow loop's stop rule - which is the correct reading (the model offered nothing new) and the loop's own message says exactly that ("two batches came back with nothing new").

### 10.2 Boundary probes, so the new bounds are measured rather than assumed

Run through the handler after the fix, with the model mocked:

| Request | Result |
|---|---|
| 500 fronts | **200**, 26 ms |
| 5,000 fronts (the schema's list bound) | **200**, 59 ms - seeding the drop with the whole list costs nothing measurable |
| 5,001 fronts | **400** `existing: Too big: expected array to have <=5000 items` - residual, see 10.4 |
| one 20,001-character front | **400** `existing.3: Too big: expected string to have <=20000 characters` - residual, see 10.4 |

The 5,000-front case is the reason the list bound was left alone: it is 8x the largest deck the grow loop's own target input allows (`components/FlashcardForgeModal.tsx` caps it at 600), and a request carrying one now returns in 59 ms.

### 10.3 Verified

| Check | Result |
|---|---|
| `bun tsc -b --noEmit` | **exit 0** |
| `bunx vitest run` | **exit 0** - 76 files, **1301 passed** (was 1295) |
| `bunx eslint app/api/forge/route.ts tests/unit/forge-route.test.ts` | **exit 0** |
| `bunx vitest run tests/unit/forge-route.test.ts` | **exit 0** - 11 passed (6 new) |
| Mutation A - seed the drop with `promptFronts` (the pre-fix cap) | **exit 1**, `4 failed / 7 passed`: the tail repeat on the JSON path, on the streamed path and on the retry path, plus the over-long-front case; the in-window drop and the prompt-window guard stayed green |
| Mutation B - restore the schema's `.max(400)` per entry | **exit 1**, exactly `1 failed` (`expected 400 to be 200`) |
| E2E forge spec vs the managed preview (`:39246`) | **exit 0** - **20/20** (2.2m), including the auto-grow loop the server seed feeds |

The new tests are in `tests/unit/forge-route.test.ts`: the 500-card tail repeat on both extension paths (JSON + streamed for `more`, and `retry`), the over-long front, and two guards - the prompt still shows the model exactly 400 lines (and not `Finding 450`), and a repeat of a card *inside* the window is still dropped. Files changed this round: `app/api/forge/route.ts`, `tests/unit/forge-route.test.ts`, `BUGS_AUDIT_REPORT.md`. No export was added, renamed or removed.

**Total: 22 distinct defects in 13 files** (21-22 are the first two in `app/api/forge/route.ts`).

### 10.4 Residuals and one observation, stated rather than left to be rediscovered

- **A list longer than 5,000 fronts still fails loudly** (`400`, measured above). It is a request-size boundary, not a duplicate-protection window: the drop now covers every card of any deck the app can build (the grow loop's target caps at 600, and 5,000 is 8x that). It fails rather than silently protecting only part of the list, which is the failure mode this round removed.
- **A single front longer than 20,000 characters still fails loudly** (measured above). That is 50x the bound that was tripped by a normal sentence, and 10% of the largest source text the schema accepts for a whole set of notes, so no card this app produces reaches it.
- **The `known` body field is validated and never read.** `app/api/forge/route.ts:212` accepts `known: string[]` and no caller sends it (`main` gets the seed from `existing`); its per-entry bound was widened with `existing` so the two cannot disagree, but the field itself is dead and worth deleting in a change that is allowed to touch the client payload contract.

### 10.5 Method note

Round 7's finding was a call site that passed the wrong list to a guard; this round's was the same mistake one layer out: a route that derived one value for two jobs with different budgets. The lesson that generalises: when a bound is introduced, name the *resource* it protects (tokens vs request size vs memory) at the definition, or the next reader will reuse it for a job it was never sized for. Both defects were found only by driving the real handler with a deck bigger than the boundary, which is why the round-7 limitation was worth closing rather than leaving as a note.

---

## 11. Round 9 - defect 23, the auto-split could not honour the word limit it enforced

Round 9 answered a direct request: *"Audit `splitDenseCloze` to ensure it always returns halves at or under the word limit, as its docstring claims. Identify the cause of the discrepancy, fix it, and prove the fix with new tests."* §9.3 had already recorded the discrepancy as an observation; this round closes it.

### 11.1 Defect 23 - two halves cannot cover a sentence longer than twice the limit

| # | Bug Category | File & Line | Root Cause | How It Was Verified |
|---|---|---|---|---|
| 23 | A guard that cannot honour its own contract - the audit's auto-split returns pieces over the very limit it flags (D=10 leeches, the thing the flag exists to prevent) | `lib/fsrs-audit.ts:158` (the old `splitDenseCloze`, whose docstring reads "two atomic cloze sentences, **each at or under the word limit**"); consumers `lib/wozniak.ts:148` (`enforceCeiling`) and `components/AnkiExportModal.tsx:510` (`handleAutoSplit`) | The function declared its return type as exactly two cards (`[AnkiCardItem, AnkiCardItem] | null`) and split at one midpoint, so it could never make more than two pieces. Two halves can only cover `2 x TOO_LONG_WORD_LIMIT` = 30 words: for **any** sentence over 30 words a piece is over the limit *by arithmetic*, not by accident - a 38-word sentence yields 19-word halves. Nothing ever measured the pieces before returning them, so the claim was never checked, and the function's own test had already been written to allow it (`toBeLessThanOrEqual(TOO_LONG_WORD_LIMIT + 2)`) - the slack IS the defect, spelled out. | Measured three layers deep, on six realistic dense cloze sentences, by running the pre-fix splitter (transcribed from the previous revision) and the fixed one on the same cards. **Splitter:** 3 of 6 cards came back with a piece over the 15-word limit before, **0 of 6** after (`+clause` 34 words: `[19,15]` -> `[11,8,15]`; `shock` 23 words: `[6,17]` -> `[6,13,4]`; `long` 37 words: `[20,17]` -> `[7,15,15]`). **The flag the button exists to clear:** `auditDeck` still called 3 of the 6 cards too-long *after* the old split - so a click could leave the card exactly as flagged as it was, with the button still offering the same split again; **0 of 6** now. (In the shipped modal that needs a front over 30 words, and the Wozniak ceiling withholds one before it can reach the sheet - which is why no spec had ever pressed this button. §11.3's new `e2e/fsrs-audit-split.spec.ts` reaches it with a curated card and proves one click now clears it.) **The deck:** through the same ceiling stage (`enforceCeiling`, front+back <= 20), the old splitter shipped 9 fragments and held 2 back reading "21 words even after auto-split" and "22 words even after auto-split"; the fixed one shipped 14 and held **0**, largest shipped front+back **20**. |

**Fixed**, in `lib/fsrs-audit.ts`:

| Piece | What it does |
|---|---|
| the piece count | Derived from the sentence instead of asserted: the loop runs while the remainder is over the limit and takes `ceil(remaining / limit)` pieces at each step, so a 34-word sentence comes back as 3 pieces and no piece can exceed the limit |
| the cut | Each cut is chosen only from token boundaries that keep THIS piece at or under the limit (`hi = min(start + limit, maxCut)`) and leave the remainder splittable (`lo` from the piece budget). The preference order is unchanged and now applied to a window instead of a midpoint: a sentence end wins, then a clause connector, then the safe boundary nearest the balanced target; the furthest safe boundary is the fallback |
| the impossible case | When no safe boundary exists within the limit - a single deletion body carries more than the limit on its own - it returns `null` instead of a piece that breaks the contract. Its callers already handle that: `enforceCeiling` holds the card back with "`N` words - chunk it into smaller cards" |
| the return type | `[AnkiCardItem, AnkiCardItem] | null` -> `AnkiCardItem[] | null` (both call sites re-checked: `enforceCeiling` iterates, `handleAutoSplit` splices with a spread, which a tuple could not express) |
| the front text | A piece that already ends a sentence keeps its own punctuation instead of getting a second full stop; the old code appended `.` to the left half unconditionally, so a midpoint that landed on a sentence end produced "sentence.." in Anki |
| the modal control | `components/AnkiExportModal.tsx` now computes `splittable = tooLong && splitDenseCloze(c) !== null` per row: on a card that cannot be split the button is disabled with the reason in its title, instead of being enabled and silently doing nothing (pressed end to end by `e2e/fsrs-audit-split.spec.ts`) |

### 11.2 The measurement, per card (pre-fix splitter vs fixed)

| Card | Words | Old halves | New pieces | Old split still flagged too-long | New split still flagged |
|---|---|---|---|---|---|
| e2e fixture (19) | 19 | `[10,9]` | `[10,9]` | 0 | 0 |
| `+clause` | 34 | `[19,15]` | `[11,8,15]` | **1** | 0 |
| `limb` | 18 | `[7,11]` | `[7,11]` | 0 | 0 |
| `shock` | 23 | `[6,17]` | `[6,13,4]` | **1** | 0 |
| `long` | 37 | `[20,17]` | `[7,15,15]` | **2** | 0 |
| `deletion-first` | 29 | `[15,14]` | `[15,14]` | 0 | 0 |

Two facts that matter as much as the three fixes: the e2e fixture's card is **byte-identical** before and after (`[10,9]`, same text), which is why the audit's Playwright expectations still hold; and the `deletion-first` card, whose 13-word deletion body has to ride whole, already came back balanced and under the limit - the fix does not need more pieces to be safe, it only needs the option of taking them.

### 11.3 Verified

| Check | Result |
|---|---|
| `bun tsc -b --noEmit` | **exit 0** |
| `bunx vitest run` | **exit 0** - 76 files, **1304 passed** (was 1301; the `splitDenseCloze` block went from 6 tests to 9) |
| `bunx vitest run tests/unit/fsrs-audit.test.ts tests/unit/wozniak.test.ts` | **exit 0** - 47 passed (31 + 16) |
| `bunx eslint lib/fsrs-audit.ts lib/wozniak.ts components/AnkiExportModal.tsx tests/unit/fsrs-audit.test.ts` | **exit 0** |
| Mutation A - cap the loop at one cut (the old two-piece behaviour: `while (total - start > limit && cuts.length < 1)`) | **exit 1**, `4 failed / 27 passed`: *uses as many pieces as the arithmetic needs*, *keeps a deletion whole*, *returns null when a deletion body is over the limit*, and the 400-sentence property test - all four failing on `expected 19 to be less than or equal to 15`, i.e. exactly the pre-fix defect. The 19-word card still passes, which is why it never caught this |
| Mutation B - drop the per-piece limit guard (`hi = maxCut`) | **exit 1**, `4 failed / 27 passed`, same four tests, reporting pieces of 19, 19 and 46 words against the limit |
| Both mutations restored, then `diff` against the pre-mutation file | **identical** (compared byte for byte, then the suite re-run green) |
| E2E vs the managed preview (`:39246`) | **exit 0** - `fsrs-audit.spec.ts` + `bracket-tokens.spec.ts` + the new `fsrs-audit-split.spec.ts`: **5 passed** (the existing fixture still counts `3 raw . 2 atomic`, `2 card fragments held back`, `1 need audit`, no enabled Split button, so the fix did not change what ships) |
| Mutation A **against the running app** (the dev server recompiles the reverted splitter) | **exit 1** on `fsrs-audit-split.spec.ts`: `Expected "5 Flashcards", Received "4 Flashcards"` - the pre-fix build returns two halves where the fixed one returns three pieces, in the real sheet |
| Both mutations reverted, then `diff` against the pre-mutation file | **identical**, and the suite/specs re-run green afterwards |

New tests: 3 added plus 3 rewritten in `tests/unit/fsrs-audit.test.ts` (around `splitDenseCloze`, plus a shared assertion helper), and one new UI spec:

| Test | What it pins |
|---|---|
| *splits a long cloze into pieces that are each at or under the word limit* | The docstring's own claim - no `+2` slack - plus the marker, id and word-sum invariants |
| *uses as many pieces as the arithmetic needs, not always two* | The piece count is `ceil(words / limit)`, and the tail of the sentence is in the last piece (reading order) |
| *never splits inside a multi-word deletion or leaves an empty piece* | No dangling `{{c1::`, no empty card, whole sentence covered |
| *keeps a deletion whose body carries most of the words whole* | The 13-word deletion appears in exactly one piece, intact |
| *returns null when a single deletion body is itself over the limit* | The impossible case is reported, not faked |
| *holds the limit for every piece across 400 generated dense sentences* | A seeded LCG builds 400 sentences of 16-60 words with 1-5-word deletions and asserts, for every piece: at or under the limit, non-empty, cloze, braces balanced, and that the pieces' word counts and marker count add up to the original - nothing invented, nothing dropped. Asserts it saw sentences needing 3+ pieces, so the limit assertion is not vacuous |
| `e2e/fsrs-audit-split.spec.ts` (new, 1 test) | The control itself: a curated (protected-tag) 33-word cloze rides through the Wozniak ceiling into the shipped deck, its Split button is enabled, and **one click** replaces it with three pieces - the card count goes up by 2, `This card is too dense` disappears and no enabled Split is left. It also closes a real coverage hole: the existing fixture's card is always *held back* by the ceiling, so its Split button is permanently disabled, and nothing in the suite had ever pressed it |

The helper (`assertPiecesAreAtomic`) is the point: the old test compared two named halves and accepted slack; this one takes the whole list and checks it as a list, which is the shape the bug hid in.

Files changed this round: `lib/fsrs-audit.ts` (the splitter, its contract and the two hoisted punctuation constants), `lib/wozniak.ts` (the caller now iterates pieces), `components/AnkiExportModal.tsx` (the control reports that a card cannot be split), `tests/unit/fsrs-audit.test.ts`, `e2e/fsrs-audit-split.spec.ts` (new), `BUGS_AUDIT_REPORT.md`. **One signature changed** (`splitDenseCloze`'s return type, `[X, X] | null` -> `X[] | null`); both call sites were re-checked and no other module imports it.

**Total: 23 distinct defects in 14 files** (23 is the first in `lib/fsrs-audit.ts`).

### 11.4 E2E against the managed preview (`:39246`)

| Spec | Result |
|---|---|
| `e2e/fsrs-audit.spec.ts` | **2 passed** - the fixture still counts `3 raw . 2 atomic`, `2 card fragments held back`, `1 need audit`, and offers no enabled Split button |
| `e2e/bracket-tokens.spec.ts` (renders the same sheet at 390/1280 px) | **2 passed** |
| `e2e/fsrs-audit-split.spec.ts` (new) | **1 passed** (6.3 s) |

Why the existing spec matters here even though the splitter has unit coverage: those fixture counts are produced *through* `splitDenseCloze` and `enforceCeiling`, and this round changed both the piece count and the appended punctuation. The fixture's card is the 19-word one, whose pieces are byte-identical before and after (measured in §11.2), so the counts must not move - and they did not.

The new spec is the one that presses the button. Its fixture is a curated card (`tag: 'InterferenceTrap'`, i.e. one of `PROTECTED_CARD_TAGS`) precisely because the ceiling would otherwise withhold a 33-word front before the learner could ever split it, which is why no existing spec exercised the control. Against the reverted splitter (Mutation A, recompiled by the dev server) it fails with `Expected "5 Flashcards", Received "4 Flashcards"`: two halves where the fix returns three pieces. The fix therefore changes what the learner gets from a click, so the spec is worth keeping rather than deleting as a probe.

### 11.5 Residuals and two observations, stated rather than left to be rediscovered

- **A deletion body longer than the limit cannot be split** and now returns `null` (measured: a 19-body-word deletion on a 29-word sentence). The caller already handles it (`enforceCeiling` withholds it as "`N` words - chunk it into smaller cards"); the modal's button is now disabled on exactly that card, with the reason in its title. Splitting inside a deletion would change the answer the card asks for, so the honest answer is "cannot be split" - which is what it now says.
- **The back still travels with every piece** (unchanged from the two-way splitter, and the reason the Wozniak funnel can still hold a piece back: that ceiling measures front+back). Recorded, not changed - which part of a cloze card is the "answer" is a card-model decision, not a splitter one.
- **Observation (closed by round 10, §12): three surfaces measured two different word counts.** The modal's `auditAnkiCard` measures a cloze's **front** (`lib/fsrs-audit.ts:96`), while `lib/wozniak.ts`'s ceiling and `classifyCardQuality` measured **front+back**. A card could therefore be audit-clean and still held back, or be flagged and still ship. That is why this round's deck-level numbers differ from the audit-level ones above (14 of 15 pieces ≤15 front words but one at 20 front+back). **Round 10 found that this was not only an observation: the completed screen's number was labelled "Dense (tagged)" and its advice was to filter on that tag, while the tag itself was applied on one export path out of four — defect 24.**

### 11.6 Method note

The defect was found by taking a docstring literally and doing its arithmetic (`2 x 15 = 30 < 34`) instead of reading the code for mistakes - the code did exactly what it said it did, and only the claim was false. The signature that hid it was in the test file: an assertion written with `+ 2` slack around the limit the function names. When a test needs slack around a documented bound, the bound is the thing to check. Two mutations were run rather than one because the fix has two independent halves (how many pieces, and how long each may be), and the mutation that isolates each had to fail for the right reason.

---

## 12. Round 10 - defect 24, the completion screen counted cards the file never tagged

Round 9 ended by leaving a falsifiable claim in a docstring and an observation beside it (§11.5). Round 10 took the claim literally: `classifyCardQuality` states *"matches the audit thresholds used in the Anki export modal so both surfaces agree"*. Measured on the same deck, the export sheet and the completed-screen trophy disagreed on **2 of 7** realistic cards - a 6-word cue with a 26-word back read "clean" in the sheet and "leech" on the trophy. Repairing that disagreement then exposed the larger defect underneath it: the trophy's number is labelled **"Dense (tagged)"** and the line under it advises *"build a filtered deck from those tags"*, but the tag it names was applied by exactly one of the four export paths.

### 12.1 Defect 24 - a number labelled "tagged" that is not the tag set

| # | Category | File / line | Root cause | Evidence |
|---|---|---|---|---|
| 24 | A count that promises an action it cannot support: the chip says "Dense (**tagged**)" and the advice is "filter on `LeechCandidate`", while the number comes from one rule and the tag from another - and on the main flow the tag is never applied at all (D=5: a returned learner who follows the advice gets an empty filtered deck) | `lib/fsrs-audit.ts` (`classifyCardQuality`), `components/CompletedSessionView.tsx:165` (the chip) and `:224` (the advice), `lib/anki-exporter.ts:118-128` (`appendLeechTag`) and `:876-901` (`sanitizeExtracted`) | **Three** rules for the word "dense": **the tag** (`front+back > 15`, every card type, applied only by `buildUserWordingCards`), **the trophy's number** (`card.isCloze && front+back > 15`), and **the sheet's verdict** (a cloze's *front* > 15, the only one a control can act on). The chip's number came from the second, its label and its advice from the first - and the first was never applied on the main flow (segregation report -> declarative facts -> `extractSanitizedCardsFromSchema` -> `.apkg`), because the fact path does not call `appendLeechTag`. | Two measurements. **The two surfaces:** 7 realistic cards classified by both, **2 disagreed** (6-word cue + 26-word back: sheet "clean", trophy "leech"; the reverse for a long-fronted basic card the sheet still audits). **The tag itself:** a mixed deck pushed through the real funnel shipped **0** `LeechCandidate` tags while the trophy counted **3** dense cards - so the screen's advice, followed literally, returned nothing. |

### 12.2 The fix - one definition, and every number is a set a chip can name

| Piece | What changed |
|---|---|
| `isLeechDense` (`lib/fsrs-audit.ts`) | The **one** exported definition of the tag rule (`front+back > TOO_LONG_WORD_LIMIT`), used by the tagger, the trophy and the tests - it cannot be restated wrongly elsewhere |
| `appendLeechTag` (`lib/anki-exporter.ts`) | Calls that function, and is idempotent (force-including the withheld fragments passes a deck through the funnel twice) |
| `sanitizeExtracted` | Tags the deck that **ships**, on *copies* rather than the caller's cards, so the funnel stays pure. It is the single funnel all four export paths go through, which is why this is where the tag belongs |
| `classifyCardQuality` | `isLeechCandidate` is now the tag rule; `isAmbiguous` stays the sheet's verdict; the docstring says which question each answers and no longer claims they are one rule |
| `classifyDeckQuality` | One bucket per card - unfinished -> dense (tagged) -> ambiguous (flagged, not tagged) -> ready - plus a new `ambiguousCues` count, so the tagged number **is** the tag set and the buckets still sum to the deck |
| `components/CompletedSessionView.tsx` | Renders the ambiguous count as its own `[ AMB ]` chip and names both facts in the advice line, instead of presenting every flagged card as tagged |

Why the two rules stay different, stated rather than conflated: the sheet's cue rule is a **front-only** test because that is what its Split button can fix; the tag's rule weighs the whole card because that is what FSRS is punished by. The defect was never that two thresholds exist - it was that one number was labelled as the other, and that the tag the label promised was absent from most of the cards it counted.

### 12.3 Tests added, and the mutations that prove they bite

| Check | Result |
|---|---|
| `bunx vitest run` | exit 0 - 76 files, **1307 passed** (1304 at the start of the round) |
| `bun tsc -b --noEmit` | exit 0 |
| `bunx eslint` on the four changed source files | exit 0 |
| e2e against the managed preview (`:39246`) | exit 0 - **16 passed** (`encode` 5, `share-history` 6 - the two specs that render the completed screen - `bracket-tokens` 2, `fsrs-audit` 2, `fsrs-audit-split` 1) |
| *the trophy's number is the tag set* | `classifyDeckQuality` over a mixed deck asserts `fsrsReady + unfinished + leechCandidates + ambiguousCues === totalCards`, and the funnel test asserts **card by card** that `tags.includes('LeechCandidate') === isLeechDense(card)` - including dense basic cards, where the old classifier returned `false` |
| *the chip label is the sheet's verdict* | A card the sheet flags and the tag rule does not lands in `ambiguousCues`, not in the tagged number |
| Mutation A: `isLeechCandidate` re-gated on `card.isCloze` | **exit 1**, 1 failed - the dense-basic case in the fuzz test |
| Mutation B: the funnel's tagging removed, tag left on the old single path | **exit 1**, 1 failed - `"The {{c1::thick ascending limb}} reabsorbs salt" (18 words): expected false to be true` |
| *the tag reaches the shipped deck through the real app* | `e2e/fsrs-audit-split.spec.ts` now asserts, in the export sheet of the segregate -> `.apkg + SM-2` flow, that exactly **one** card shows the `LeechCandidate` chip - that flow (declarative facts) is the one where the tag was never applied, and the sheet renders each card's tags, so the assertion reads the tag the learner would filter on |
| Mutation B against the running app (funnel tagging removed, dev server recompiled) | **exit 1**, 1 failed: `getByText('LeechCandidate')` -> `Expected: 1, Received: 0` (33 x resolved to 0 elements). Reverted, `diff` clean, re-run **exit 0** - the assertion fails only when the tag is missing, not on the split itself |

### 12.4 Residuals, stated rather than left to be rediscovered

- **The tag is applied to shipped cards only.** A fragment the Wozniak ceiling withholds carries `WozniakOverflow`, not `LeechCandidate`, so the trophy's dense count and its held-back count are disjoint by construction - which is why the advice line reports them in different sentences.
- **A card can be both dense and ambiguous**; the bucket order sends it to the dense bucket because that is the tag it ships with. The `[ AMB ]` chip is therefore a count of *the rest*, and its label is deliberately singular ("Ambiguous cue"), not a claim to cover the whole flag set.
- **The sheet still audits a cloze's front while the ceiling weighs front+back** (the pre-existing asymmetry from §11.5). It is now *named* on both surfaces and no longer produces a wrong number; unifying the two thresholds would change what ships, so it stays as it is.
- **Observed, not repaired:** `tests/unit/anki-exporter.test.ts` imports `classifyCardQuality`/`classifyDeckQuality` without using them (found while checking consumers). Dead import, no behaviour; left alone rather than mixed into this round.

### 12.5 Method note

Two rounds in a row the defect lived inside a *claim* rather than inside an algorithm: round 9's was a docstring on a function, this round's was a label in the UI ("Dense (tagged)") plus a docstring asserting that two surfaces agree. A UI label is a claim about the data, and it is checkable in exactly the same way - ask which *set* the number is, then go looking for the tag on the cards it claims to describe. The honest shape of the fix is that the rule the promise named became the rule that runs.

**Total: 24 distinct defects in 15 files** (24 is the second in `lib/fsrs-audit.ts` and the first in `components/CompletedSessionView.tsx`).

---

## 13. Round 11 - the non-functional sweep, and defect 25: the drawer that could brick the app

Rounds 7-10 audited behaviour: wrong numbers, wrong cards, wrong labels. Round 11 was asked for the
**non-functional** class - the failures that are not wrong output but an app that stops working, gets
slow, leaks a device, or dies. That needs different evidence than the earlier rounds: not "is this value
right" but "what does this do under a corrupt disk, an unmount, two tabs, a socket that stalls".

### 13.1 Prioritized findings

| # | Priority | Finding | Location | Evidence |
|---|---|---|---|---|
| **25** | **P0 - critical. FIXED in this round (§13.2-13.5)** | One corrupt or legacy record in the learner's own saved history takes the **entire app** down: the history drawer dereferences `topicSummary` during render, nothing defines an error boundary above it, and the resulting screen is Next's *"Application error: a client-side exception has occurred"*. It is not recoverable from the UI - *clear all data* lives inside the drawer that crashed - so the only exit is clearing site data, and the learner cannot see their work at all. | crash site `components/HistoryDrawer.tsx:49`; root cause `lib/storage.ts` (`loadSavedSchemas`) and `lib/db.ts` (the v1 -> IndexedDB migration, the IndexedDB reads, the fallback parse); blast radius: no `app/error.tsx` exists | Reproduced in the browser: seed `deepencode_saved_schemas_v2` with `[{id,timestamp,mode,activities,userResponses}]` (no `topicSummary` - the shape an older release wrote), load the app, click the history button. Before the fix the browser reported `Application error: a client-side exception has occurred while loading 127.0.0.1` and the drawer never mounted; after the fix the drawer opens and lists the record as `Untitled topic`. |
| 26 | P1 - high. **FIXED in round 12 (§14)** | The workbench's speech recognition is never stopped when the component unmounts: `recognitionRef.current` is only stopped by the toggle itself, there is no cleanup effect, and `continuous = true`. Leaving the stage view (or finishing a session) therefore keeps the recogniser - and the browser's mic indicator - live, and its `onresult` keeps appending into the unmounted component's state. | `components/workbench/StudioWorkbench.tsx:697` (the only `stop()`), `:740` (the ref is assigned, never released); `recognitionRef` appears nowhere else | Read from the code: `recognitionRef` occurs at exactly three places (declare, stop-in-toggle, assign). Nothing could stop it on unmount because nothing was registered to. Round 12 reproduced it with a stub recogniser and closed it. |
| 27 | P2 - medium. **FIXED in round 12 (§14)** | No root error boundary, so *any* unexpected throw in the composition root is a blank app rather than a contained message with a way back. It is the reason defect 25 was fatal instead of cosmetic. Only the stage-template renderer and the M-r-M surface have boundaries. | no `app/error.tsx` or `app/global-error.tsx`; boundaries exist only in `components/stage-templates/TemplateErrorBoundary.tsx` and `components/mr-m/MisterMSurface.tsx` | The defect-25 reproduction: a single throw inside a panel unmounted the whole tree and the page offered no recovery control. Round 12 added the boundary and proved it with an injected render throw. |
| 28 | P2 - medium. **FIXED in this round (§15)** | The schema list is memoized in a module-level cache that was **never invalidated**: `invalidateSchemaCache()` is exported and had zero callers, and nothing listened for the `storage` event. Two tabs open on the app therefore diverged - and because `saveSchemaToHistory` wrote `[...current-from-cache, schema]`, the second tab's save could persist a list that was missing a schema the first tab just saved. | `lib/storage.ts:288` (`invalidateSchemaCache`, no callers), `:125-155` (`loadSavedSchemas` + `saveSchemaToHistory`), no `window.addEventListener('storage', ...)` anywhere | Round 13 **reproduced it with two live tabs** (Playwright, one browser context): before the fix the first tab's drawer never showed the second tab's schema, and the same spec fails on the pre-fix code with `getByRole('dialog', { name: 'Saved schemas' }).getByText('Saltatory Conduction')` not found. |
| 29 | P3 - medium, frequency unmeasured. **FIXED in round 14 (§16)** | The stateless share link had no size guard. It was a query parameter on a page served by Node, so past the platform's header limit the *server rejected the request outright* - the learner's shared link was a dead end with no warning at copy time. | `lib/url-share.ts` (`generateStatelessShareUrl`, no length check); consumed by `components/StatelessShareModal.tsx` | **Measured against the running preview server**: `GET /?share=<N bytes>` returns `200` at 4 KB, 8 KB, 12 KB and 16 KB and **`431` (Request Header Fields Too Large)** at 17 KB and above. Round 14 moved the payload into the fragment (where the same 24 KB payload is answered `200`) and proved it in the browser with a 34 KB schema. |
| 30 | P4 - low. **FIXED in round 15 (§17)** | Dead import found while checking consumers: `classifyCardQuality`/`classifyDeckQuality` were imported in a test file that never used them. | `tests/unit/anki-exporter.test.ts:37` | Round 15 removed the import after confirming the names appear nowhere else in the file, and that both functions are covered where they belong (`tests/unit/fsrs-audit.test.ts`) rather than being a symptom of missing coverage. |

**What was checked and found clean, so the absences are not mistaken for coverage:** event-listener
balances (`addEventListener`/`removeEventListener` counts match in every file under `components/`,
`hooks/`, `lib/`, `app/`); interval/timer cleanup (all eight `setInterval` sites return a
`clearInterval`, including the ones that stop themselves mid-callback); object-URL lifetime (all eight
`URL.createObjectURL` sites revoke on the next line, in a `finally`-shaped block); `JSON.parse` on
persisted data (every reader is inside a `try`, checked one by one); upload size caps (15 MB enforced in
both `FileUploader` and the forge); stream abort/cancel (the client holds an `AbortController` and the
route closes quietly on it); Firestore subscriptions (`onAuthStateChanged` and `onSnapshot` both return
their `unsubscribe`); timers/loops that could block the main thread (none found - the heavy document
work is server-side, and the canvases/animations run off a single interval or a media query).

### 13.2 Defect 25 - how one record took the whole app down

| # | Category | File / line | Root cause | Evidence |
|---|---|---|---|---|
| 25 | A persisted record read as trusted data, then dereferenced during render with no error boundary above it - a **total, self-inflicted, UI-unrecoverable app failure** (D=9: the learner cannot reach their own library, and the recovery control is inside the surface that crashes) | `components/HistoryDrawer.tsx:49` (`s.topicSummary.toLowerCase().includes(...)`); `lib/storage.ts` `loadSavedSchemas`; `lib/db.ts` (migration, `getAllSchemasFromIDB`, the localStorage fallback) | `SavedSchema.topicSummary` is declared **required**, but a TypeScript type is not a validator and every path into the app does `JSON.parse(...) as SavedSchema[]`: the one-time migration copies the legacy v1 store into IndexedDB verbatim, the IndexedDB read trusts what it finds, and the Firestore list arrives over the wire. A record written by an older release (no `topicSummary`) is therefore a legal runtime value that the drawer dereferences in its filter. The throw happens in render, `app/` has no `error.tsx`, and the only boundaries are around stage templates and the M-r-M surface - so React unmounted the entire tree and Next rendered its own error page. The learner could not fix it because *clear all data* lives inside the drawer. | Browser reproduction (before the fix): the launchpad's server-rendered DOM is present until hydration, then the body reads `Application error: a client-side exception has occurred while loading 127.0.0.1 (see the browser console for more information)`; clicking the history button yields no dialog at all, and the console shows the filter's `TypeError`. After the fix: the drawer opens, lists the record as **`Untitled topic`**, searching over it works, and no `pageerror` fires. |

### 13.3 The fix - re-read persisted records at the boundary, and guard the dereference

| Layer | What changed |
|---|---|
| `coerceSavedSchema` / `coerceSavedSchemas` (`lib/storage.ts`) | New exported contract, in the same shape the codebase already uses for resume records (`lib/crisis/buffer.ts`) and lab snapshots: rebuild, do not trust. A record with no usable `id` is dropped; `timestamp`, `mode`, `xpEarned`, `activities`, `userResponses` and the object-valued optionals get a value of the right type; an empty or missing topic becomes **`Untitled topic`** (an unnamed record is still the learner's work, so it is listed rather than dropped); every other key is carried through untouched so a field this function has never heard of is never silently lost. |
| `loadSavedSchemas` | The one read the whole app goes through: `JSON.parse(raw)` -> `coerceSavedSchemas(JSON.parse(raw))`. |
| `lib/db.ts` | The migration coerces **before** writing to IndexedDB (so a legacy shape dies at the door instead of living on for years), `getAllSchemasFromIDB` coerces what it reads back, and the quota-fallback parse coerces too. |
| `components/HistoryDrawer.tsx` | Coerces the merged list (`cloudSchemas` is remote data) and so the filter can no longer dereference `undefined` - defence in depth at the exact line that crashed. |

Why the boundary and not only the drawer: `topicSummary` is consumed by six other surfaces
(`app/page.tsx:1855` the resume card, `lib/course-tree.ts:150,155` matching the topic against the
prerequisite graph, `lib/services/sessionAnalytics.ts:191` the exported stats row,
`components/StatelessShareModal.tsx:74,75,136` the share text and title, `components/HistoryDrawer.tsx`'s
own rows and delete aria-labels, and `lib/anki-exporter.ts`'s deck naming). Guarding the drawer alone
would have moved the next crash one click away. The fix is one function at the read boundary, which is
where the untrusted data actually enters.

### 13.4 Tests, and the mutation that proves the control bites

| Check | Result |
|---|---|
| `bunx vitest run` | exit 0 - 76 files, **1312 passed** (1307 at the start of the round) |
| `bun tsc -b --noEmit` | exit 0 |
| `bunx eslint` on the four changed files | exit 0 |
| `e2e/history-drawer-legacy.spec.ts` (new, 2 tests) | exit 0 - the drawer opens on a record with no topic and lists it as `Untitled topic`; a record with no `activities` renders; searching over the unnamed record works; no `pageerror` and no `Application error` text |
| the same spec against the pre-fix behaviour (mutation: `coerceSavedSchema` returns its input) | **exit 1** - `getByRole('dialog', { name: 'Saved schemas' })` -> `element(s) not found` (the click killed the app, so the drawer never mounted), while the well-formed-record test still passed: the spec fails on exactly the defect, not on the code around it |
| `e2e/share-history.spec.ts` + `e2e/encode.spec.ts` + `e2e/modal-a11y.spec.ts` | exit 0 - **16 passed** (the drawer, resume and completion paths this change touches) |
| `tests/unit/storage.test.ts` (+5 tests) | `makeSchema()` round-trips **byte-identical** through the coercion (so the fix cannot silently rewrite good records); a legacy record gains the name and typed fields; non-records are dropped; a wrong-typed record is coerced field by field; a non-array history reads as empty |

The "keeps a real record byte-identical" test is the important one: the cheap version of this fix
(defaulting every field unconditionally) would pass the crash tests and quietly rewrite the learner's
own data. It is pinned instead.

### 13.5 Residuals, stated rather than left to be rediscovered

- **The coercion is not a migration.** Records already inside IndexedDB are normalized on the way *out*, not rewritten in place, so storage keeps the old shape until each schema is next saved. That is deliberate: a write-back migration would need a version bump and a failure path, and re-reading is enough to make the app correct.
- **`topicSummary` is not the only unvalidated field** - it is the one that crashed. A record whose `activities` array holds non-activities still reaches the stage renderer, where `TemplateErrorBoundary` contains it. Closing that properly means per-field validation of `Activity`, which is a larger change than this defect justifies; the container boundary is the honest backstop for now.
- **The unit tests cannot reach the IndexedDB path** - happy-dom has no IndexedDB, so the `getAllSchemasFromIDB` and migration coercions are verified by review and by the browser spec (which exercises a real IDB), not by a unit test.
- **Findings 26-30 were listed here, and 26-27 are now closed in round 12 (§14)** - the microphone release and the missing root boundary, which is the one that made any remaining finding fatal rather than cosmetic. **28-30 stay open**: the never-invalidated schema cache (two tabs can lose each other's saves), the unguarded share-link size, and the dead test import.

### 13.6 Method note

Every previous round read code and asked what it computes. This round asked what the code does when its
surroundings misbehave, and the two techniques that produced the finding were not reading faster but
setting different initial conditions: (1) a **hostile-state probe** - seed every persisted key with a
plausible corrupt value and load the real app - which is how the crash appeared within one run, after
an inventory of listeners, timers, object URLs and JSON parses had found nothing; and (2) a **measured
platform limit** - `curl` against the running preview at 4, 8, 12, 16, 20 and 32 KB - which turns "the
URL could get too long" from a worry into `431` at a stated boundary. The lesson worth keeping: a
defensive `try/catch` audit of the writers says nothing about the readers, and "no crash path found"
must name *which* direction it looked in.

**Total: 25 distinct defects in 18 files** (25 is the first in `components/HistoryDrawer.tsx`, the first in `lib/storage.ts`, and the first in `lib/db.ts`; the crash site is the drawer, the cause is the read boundary in both storage modules).

---

## 14. Round 12 - the two findings round 11 left open (26-27), closed

Round 11 ended with a prioritized list and one fix. Round 12 closed the next two on that list -
the P1 and the P2 that decides whether the third is survivable - and left the rest documented.

### 14.1 Defect 26 - the microphone outlived the stage

| # | Category | File / line | Root cause | Evidence |
|---|---|---|---|---|
| 26 | A device resource held by a component that no longer exists - **privacy and correctness in one** (the tab keeps recording, and the transcript lands in the wrong stage) | `components/workbench/StudioWorkbench.tsx` (the toggle's `stop()` and the `recognitionRef` assignment) | `SpeechRecognition` is a browser object holding the microphone, not a DOM node, so unmounting the component that started it changes nothing. `continuous = true` meant it kept transcribing after the learner moved on, and every `onresult` appended to `field2` - which by the time it fired belonged to the NEXT stage. Nothing was registered to stop it: `recognitionRef` appeared in exactly three places (declared, stopped inside the toggle, assigned). | A stub recogniser installed before the app boots counts what the app does to it. Against the pre-fix code both specs fail with `Expected: > 0, Received: 0` - `stop()` was never called on a stage change or on unmount. With the fix: `stop()` fires on both, and the control stops claiming `Listening`. |

**The fix** is one effect keyed on the activity id, whose cleanup releases the recogniser (and clears
`isListening`) so that a stage change and an unmount are the same path. The first draft of it returned
early when no recogniser existed yet - which would have registered *no cleanup at all* for a session
started afterwards, i.e. the bug again with a comment on it. The cleanup is now unconditional and reads
the ref when it runs.

### 14.2 Defect 27 - no boundary above the composition root

| # | Category | File / line | Root cause | Evidence |
|---|---|---|---|---|
| 27 | A missing last line of defence - every throw in the app became a dead screen | new `app/error.tsx` (none existed; only `app/not-found.js`) | Next's App Router needs `app/error.tsx` to contain a render error below the layout; without it the framework's own client-error page is the response. That is what turned defect 25 from "a panel failed" into "the app is gone", with the recovery control inside the crashed surface. | Verified with an injected render throw (`throw new Error(...)` at the top of the drawer's body): the app then renders `[ ERROR ] Something in this screen failed to render.` with a retry, `Application error` is absent from the body, and **clicking Try again returns to the launchpad with the library intact**. The throw was reverted; `tests/unit/error-boundary.test.ts` pins the contract that remains (client component, `{error, reset}`, a retry wired to `reset`, a hard-reload escape, and - the part that would rot - that the fallback reads no persisted data and imports no app modules, so it cannot fail for the same reason the screen it rescues did). |

The escape is a real navigation (`<a href="/">`) rather than `next/link`: client-side routing would keep
the React tree that just threw, which is the one thing the screen exists to get away from. That is a
justified lint exception, annotated in the file.

### 14.3 Verified

| Check | Result |
|---|---|
| `bunx vitest run` | exit 0 - 77 files, **1316 passed** (1312 before this round) |
| `bun tsc -b --noEmit` | exit 0 |
| `bunx eslint` on the four changed files | exit 0 |
| `e2e/speech-release.spec.ts` (new, 2 tests) | exit 0 - the stage change and the end-of-workout unmount both release the recogniser |
| the same spec against the pre-fix behaviour (mutation: the cleanup does nothing) | **exit 1**, both tests - `Expected: > 0, Received: 0` |
| the root boundary against an injected render throw | the fallback renders instead of `Application error`, and `Try again` recovers to the launchpad (probe removed after the run) |
| `e2e/speech-release` + `history-drawer-legacy` + `share-history` + `modal-a11y` + `bracket-tokens` | exit 0 - **15 passed** |

### 14.4 Residuals

- **`app/global-error.tsx` is still absent**, so a throw inside the root layout itself (the three-line
  provider tree) is not covered. The layout holds `AuthProvider` and a monitoring stub; adding a second
  copy of the fallback for them is cheap, but it is a different failure surface and it is stated rather
  than assumed.
- **The recogniser is not stopped when the tab is hidden.** A learner who switches tabs mid-dictation
  keeps the mic; that is arguably deliberate (dictation continues) and the `onresult` still writes to the
  stage that is open, so it is left as it is, noted here.
- Finding 28 is closed in §15, finding 29 in §16 and finding 30 in §17.

**Total: 27 distinct defects in 20 files** (26 is the first in `components/workbench/StudioWorkbench.tsx` and 27 the first in `app/error.tsx`).

## 15. Round 13 - defect 28, the cache no tab invalidated

Round 11 listed this as the P2 the two-tab sweep could only *read* from the code. Round 13 reproduces it
with two live tabs and closes it.

### 15.1 Defect 28 - the second tab's save wrote a list the first tab's cache still believed in

| # | Category | File / line | Root cause | Evidence |
|---|---|---|---|---|
| 28 | A cache with no invalidation path, plus a writer that trusted it - **silent data loss between two tabs** (D=7: the record is gone from the store, and nothing on screen says so) | `lib/storage.ts` (`schemaCache`, `invalidateSchemaCache`, `saveSchemaToHistory`, `deleteSchemaFromHistory`), `hooks/useSchemaLibrary.ts` (the only reader) | Three things had to line up, and all three did. (1) `schemaCache` memoizes the list for the document's lifetime, and `loadSavedSchemas` answered from it forever. (2) Nothing invalidated it: `invalidateSchemaCache()` had **zero callers**, and no `storage` event listener existed, so a tab that was already open could never learn that the key had changed - `storage` fires in every tab *except* the writer, which is exactly the one where the cache stays warm. (3) Every write rebuilt its replacement list with `const current = loadSavedSchemas()`, i.e. from that cache: tab B's save therefore wrote `[B, A-from-its-own-cache]` over a key that read `[A, B-just-saved]`, dropping A. The same shape made a delete reversible - tab A's delete re-wrote a list that still contained the id tab B had already removed. | **Reproduced with two live tabs** (one Playwright browser context, so they share storage exactly as two real tabs do): tab A encodes and saves `Action Potentials`, tab B encodes and saves `Saltatory Conduction`. Pre-fix: tab A's library still shows only its own schema after B's save, and a fresh tab sees whatever survived. Post-fix: tab A's drawer shows both **without a reload**, a fresh tab sees both, and the persisted list names both. |

### 15.2 The fix - a fresh read on the write path, and a listener that tells the other tabs

| Layer | What changed |
|---|---|
| `lib/storage.ts` - the write path | `readSchemasFromStorage()` reads the key on every write; `saveSchemaToHistory` and `deleteSchemaFromHistory` rebuild from **that** rather than from the cache. This is what makes the second tab's save additive instead of destructive, and it is the half that fixes the *data loss* rather than only the display. |
| `lib/storage.ts` - the invalidation | A `storage` listener (bound once per document, on the first `loadSavedSchemas` read or `subscribeToSavedSchemas` call) invalidates the cache and notifies subscribers with `readSchemasFromStorage()` and the origin `remote`. The origin matters: a notification from *another* tab means "re-read", while this tab's own write hands over the list it just wrote, so a local save is never raced by an IndexedDB read that has not landed yet. |
| `hooks/useSchemaLibrary.ts` | Subscribes on mount and, on a `remote` notification, re-reads both stores. `readStores()` now **merges** rather than preferring IndexedDB: IndexedDB keeps every schema but is written asynchronously, so taking its list wholesale would have hidden a schema another tab saved a moment ago. |
| `lib/storage.ts` - deletion tombstones | The two stores disagree for one tick by design (the mirror is updated synchronously, the IndexedDB row is removed by a fire-and-forget call), so a reader inside that window used to see a deleted schema again. `deepencode_schema_deletions_v1` remembers the id (24 h TTL, newest 50), `getAllSchemasFromIDB` filters against it, and re-saving an id forgets its tombstone. |
| `lib/db.ts` | Found while making the read path authoritative: the IndexedDB module also mirrors into the same key, and it wrote the **newest twenty** entries over a mirror the facade caps at **fifty** - silently discarding entries 21-50, and able to drop a schema another tab had saved in between. It now merges into the mirror it finds and applies the shared `LOCAL_HISTORY_LIMIT`. This was not cosmetic: `tests/unit/storage.test.ts`'s "caps local history at 50 entries" began failing (21 entries) the moment writes started reading the mirror, which is how the second writer's cap was found. |

### 15.3 Verified

| Check | Result |
|---|---|
| `bunx vitest run` | exit 0 - 77 files, **1322 passed** (1316 before this round) |
| `bun tsc -b --noEmit` | exit 0 |
| `bunx eslint` on the four changed files + the new spec | exit 0 |
| `e2e/schema-library-tabs.spec.ts` (new, 2 tests) | exit 0 - a save in a second tab is reflected in the first and neither schema is lost; a delete in one tab is not undone by the other tab's save |
| the same spec against the pre-fix code (control: the three source files stashed, the dev server reloaded) | **exit 1**, both tests - the save test fails with tab A's drawer not containing `Saltatory Conduction`, which is the reported symptom verbatim |
| `e2e/history-drawer-legacy` + `backup-restore` + `share-history` + `skill-tree` (the specs that seed or restore the library key) | exit 0 - **17 passed** |
| `e2e/encode.spec.ts` + `e2e/toy-models.spec.ts` (the two other specs that read the saved-schema mirror) | exit 0 - **20 passed** |
| new unit tests | 6: a save built on disk (not the warm cache) keeps the other tab's schema; a `storage` event drops the stale cache; subscribers hear this tab's writes as `local` and another tab's as `remote`; `mergeSchemaLists` keeps mirror order, appends what only IndexedDB has, and never duplicates an id |

### 15.4 Residuals, stated rather than left to be rediscovered

- **"Clear all" across tabs is still not atomic.** `clearAllSchemas()` empties the mirror synchronously
  and asks IndexedDB to clear with a fire-and-forget call, so a tab that re-reads inside that window can
  list the cleared records once more before the removal lands. This is the pre-existing window defect 28's
  tombstones cover for a single delete; it is now reachable from an *open* tab (a `storage` event) rather
  than only from a reload. Left as it is, noted here.
- **The mirror is capped at 50 while IndexedDB keeps everything**, so a schema older than the fifty most
  recent is visible only once IndexedDB hydration has run. That is the module's documented design, not a
  new limit.
- **`e2e/resilience.spec.ts`'s API-500 test failed once under parallel load** (empty dialog message; an
  assertion made immediately after a click, with no wait) and passes alone and in a serial re-run. Not
  related to this round's change - the schema library is not on that path - but it is a real flake in the
  suite as it stands.

### 15.5 Method note

Two tabs of one browser context are what makes this provable: `storage` events, and the shared key, only
exist between same-origin documents, so a second `context.newPage()` reproduces the situation exactly -
and the second tab answers the encode call with a *different* topic, so "which schema is missing" is
readable off the drawer instead of inferred from a count. The control is the same spec run with the three
source files stashed, which is why the failing assertion above can be quoted: it names the topic that
went missing. One assertion had to be scoped to the drawer dialog rather than the page, because the
completed workout behind it names its own topic - a page-wide text match would have been satisfied by the
session rather than by the library, and would have passed for the wrong reason.

**Total: 28 distinct defects in 21 files** (28 is the second in `lib/storage.ts` after 25; repairing it also
required `hooks/useSchemaLibrary.ts`, which had no way to hear about another tab's write).

## 16. Round 14 - defect 29, the share link that was too long to exist

Round 11 measured this one and left it open: a schema shared as a URL died at the server when the URL got
long, and nothing in the app could say so. Round 14 fixes the transport rather than the message.

### 16.1 Defect 29 - the payload travelled in the request line

| # | Category | File / line | Root cause | Evidence |
|---|---|---|---|---|
| 29 | A stateless handover whose size ceiling is invisible to the one feature that must stay stateless - **silent data loss for a large schema, at the far end** (D=6: the sender is told the link was copied, and the recipient gets a server error page) | `lib/url-share.ts` (`generateStatelessShareUrl`, `compressSchemaForUrl`), consumed by `components/StatelessShareModal.tsx:20` and read in `app/page.tsx:318` | The compressed schema was written into a **query parameter** (`?share=`), so it travelled in the HTTP request line. Node refuses an oversized request line before any route runs, and no client-side code ever sees that request - the app therefore had no error to show, and the modal reported a successful copy of a link that could not open. Nothing anywhere compared the payload against the server's limit. **Re-measured in this round** on the preview server: `GET /?share=<16,000 b>` -> `200`, `GET /?share=<17,000 b>` -> **`431`**, `GET /#share=<24,000 b>` -> `200`. | Reproduced end to end in the browser (`e2e/share-large-link.spec.ts`): an 8-stage schema whose compressed payload is **34 KB** - `page.goto('/?share=…')` returns **`431`** and the app never mounts; the same schema through the fragment returns `200`, shows the import banner, and reaches the library with all **8 stages, 8 answer sets and the 3,000-character prompt intact**. The spec asserts the payload is over 17 KB first, so the control fails for the right reason. |

### 16.2 The fix - move the payload out of the server's way, then be honest about the rest

| Layer | What changed |
|---|---|
| The transport (`lib/url-share.ts`) | Links are built as `<origin><path>#share=<payload>`. A fragment is never sent to the server, so the payload size stops being a server question - the same schema that was refused with a 431 now loads normally. `readSharedPayload(search, hash)` reads the fragment first and the query string second, so every `?share=` / `?data=` link already in the wild still works, and it re-encodes `+` before form-decoding (LZString's URL-safe alphabet contains `+`, which `URLSearchParams` would otherwise turn into a space - a latent corruption in the old path, found by a unit test that compared the payload byte for byte). |
| The guard (`buildShareLink`) | One function returns the URL, its byte length, the byte length of the payload, and two verdicts: **over the comfort tier** (`SHARE_URL_COMFORT_BYTES` = 2 KB - longer than one chat message, so it may be split when pasted) and **over the limit** (`SHARE_URL_LIMIT_BYTES` = 8 KB - past what a URL should carry at all, with the server's own 16 KB request line as the hard ceiling). It also builds the **slim** link (`userResponses` dropped) and reports whether that one fits. |
| The sheet (`components/StatelessShareModal.tsx`) | States the size it measured, and past the tiers stops selling a link it cannot deliver. Over the comfort tier: an amber `[ LONG LINK ]` note and a `[ SLIM ]` toggle. Over the limit: a red `[ TOO LONG ]` panel, the slim link when that fits, and the file. Past even the slim link: **no link is offered at all** - no copy target exists - and the only action is `[ FILE ]`, a schema file the recipient restores through Analytics' existing `[ RESTORE BACKUP ]`. |
| The file (`lib/backup.ts`) | `buildShareSchemaFile` wraps one schema in the restore format the app already validates, **omitting** settings, prefs, stats and extras deliberately: an empty object there would make the receiver's own settings be overwritten with nothing (pinned by a unit test that seeds a receiver's key and asserts it survives). |

### 16.3 Verified

| Check | Result |
|---|---|
| `bunx vitest run` | exit 0 - 77 files, **1333 passed** (1322 before this round) |
| `bun tsc -b --noEmit` | exit 0 |
| `bunx eslint` on the seven changed files + the new spec | exit 0 |
| `e2e/share-large-link.spec.ts` (new, 3 tests) | exit 0 - the 431 control and the fragment link arriving whole; the sheet refusing an over-long link and downloading the restorable file instead; bulky answers becoming a slim link that keeps every exercise and no answers |
| the same spec against the pre-fix code (control: the four source files stashed, the dev server reloaded) | **exit 1**, all three - the fragment test fails on `Classmate Shared Schema Loaded` never appearing, because pre-fix the fragment was not read at all |
| `e2e/share-history.spec.ts` | exit 0 - **6 passed**, including the legacy `?share=` import, so old links still work |
| `e2e/backup-restore.spec.ts` | exit 0 - **2 passed** (the backup download/restore path the share file rides on) |
| `e2e/history-drawer-legacy.spec.ts` | exit 0 - **2 passed** |

### 16.4 Residuals, stated rather than left to be rediscovered

- **A link is still not a transport for an arbitrarily large deck.** The fragment removes the *server's*
  ceiling, not the practical one: 34 KB of URL works in a browser and fails to paste anywhere useful, which
  is exactly why the sheet refuses it and offers the file. What is measured: the byte thresholds above and
  the two the sheet acts on. What is not: how often a real generated schema crosses 8 KB (the compressible
  fixture shapes used here run 0.5-5 KB, while the incompressible ones used to force the limit run 10-500 KB).
- **`navigator.share` is offered below the comfort tier only through the same URL.** A platform share sheet
  that itself truncates long text is outside this app's control; the fragment is what protects the payload
  from the *server*, not from a chat client's message limit - which is what the advisory is for.
- **The reply-channel is one-way.** Nothing verifies that a link the learner copied actually opened on the
  other side, so a truncated paste is only discoverable by the recipient. Stated, not solved.
- Finding 30 (the dead import in `tests/unit/anki-exporter.test.ts`) is closed in §17.

### 16.5 Method note

The control for this round is the server itself: the measured 16,000 -> `200` / 17,000 -> `431` boundary is
asserted in the spec before the fix is exercised, so the test cannot pass by accident on a server whose
limits have moved. The heavy client (the fixture is generated, not shipped) is what makes the payload
incompressible enough to cross that boundary: repetitive filler text compresses ~40x and would have hidden
the bug - the first fixture drafted for this round was a 90 KB schema that compressed to 2.1 KB, which is
the reason the spec builds its own `noise()` text from a deterministic sequence instead.

**Total: 29 distinct defects in 22 files** (29 is the first in `lib/url-share.ts`).

## 17. Round 15 - defect 30, the import nothing used

Round 11 recorded this one while auditing consumers and deliberately left it out of that round's diff. It is
a one-line cleanup, kept separate so the audit's last finding closes on its own evidence rather than being
folded into a fix for something else.

### 17.1 Defect 30 - a test importing two functions it never calls

| # | Category | File / line | Root cause | Evidence |
|---|---|---|---|---|
| 30 | Dead code that misleads the next reader - **a false coverage signal** (the import is exactly what an unfinished test looks like, so the file reads as if the classifier's contract were being asserted here) | `tests/unit/anki-exporter.test.ts:37` (`import { classifyCardQuality, classifyDeckQuality } from '@/lib/fsrs-audit'`) | The import arrived with an earlier edit and no test ever referenced either name. It shipped undetected because **neither check this repository runs can see an unused import**: the resolved ESLint config enables no unused-variable rule for that file (`eslint --print-config tests/unit/anki-exporter.test.ts` resolves zero `*unused*` rules beyond `reportUnusedDisableDirectives`) and `tsconfig.json` sets `strict` without `noUnusedLocals` - both checked, not assumed, which is why `bunx eslint` and `bun tsc -b --noEmit` were green with the import present. | Grep for both names across `tests/`, `e2e/`, `lib/`, `components/` and `app/`: the only hit in that file was the import itself (line 37). Removing it leaves no reference to the module in the file. |

**The import was removed, not replaced.** Both functions are already covered where they belong: `tests/unit/fsrs-audit.test.ts` exercises `classifyCardQuality` (leech candidate, Unfinished tag, FSRS-ready, cue-vs-density flags, one definition per flag) and `classifyDeckQuality` (the deck-level count of LeechCandidate cards). So this was a redundant import rather than the visible edge of a missing test, which is the question worth asking of any dead import in a test file.

### 17.2 Verified

| Check | Result |
|---|---|
| `bunx vitest run tests/unit/anki-exporter.test.ts` | exit 0 - **46 passed** |
| `bunx vitest run` | exit 0 - 77 files, **1333 passed** (unchanged count: the removal deletes no assertion) |
| `bun tsc -b --noEmit` | exit 0 |
| `bunx eslint tests/unit/anki-exporter.test.ts` | exit 0 - and the resolved config above is why that was never the check that could catch it |
| `grep fsrs-audit tests/unit/anki-exporter.test.ts` | no match |

### 17.3 Residuals

The only thing left from the round-11 prioritized list is the **unused-import class of finding itself**: the
lint config here cannot see one, so nothing prevents the next dead import in a test file. Enabling the rule
would be a repository-wide change (and would surface pre-existing warnings across the suite), so it is stated
rather than smuggled into a one-line fix.

**Total: 30 distinct defects in 23 files** (30 is the first in `tests/unit/anki-exporter.test.ts`).

## 18. Round 16 - defects 31-33, the usage ledger's three periods

Round 11 ended the non-functional sweep with a prioritized list; rounds 12-15 closed it. Round 16 opens a
second pass, and starts on the one record in this app that answers three questions with three different
periods - how many calls today, how many this week, what it has cost in total - because a period that rolls
is exactly where a figure that must not change can be rebuilt away.

### 18.1 Defect 31 - the daily roll deleted the two figures labelled LIFETIME

| # | Category | File / line | Root cause | Evidence |
|---|---|---|---|---|
| 31 | A roll that owns one period rebuilding the whole record - **silent loss of a displayed metric, and of what a backup carries** (D=6: nothing on screen says a lifetime total was just zeroed, and the loss is made permanent by the write that causes it) | `lib/storage.ts` (`loadUsageStats`, the date-roll branch), read by `components/AnalyticsDashboard.tsx:271`, `:275` and carried by `lib/backup.ts:99` | The record holds five fields and three periods: `callsByModel` is today, `weeklyCallsByModel` is this week, and `tokensByModel` / `costUsdByModel` are lifetime (their own doc comment: "tokens/cost are lifetime by design - the interesting question is 'what has this hobby cost me', not 'what did it cost today'"). The date-roll branch rebuilt the record as `{ date, callsByModel: {}, weeklyCallsByModel: parsed.weeklyCallsByModel || {} }` - the three fields it happened to name - and **wrote that over the key**. The two lifetime ledgers are not in that object, so the first read of a new day deleted them, and the write made the deletion permanent for every later reader. `loadUsageStats` is called by `incrementModelCall`, by `recordTokenUsage`, by `buildBackup` and on **every render** of the analytics sheet, so the loss fires on the first AI call or the first look at the dashboard after midnight - not at some edge of the flow. The sheet carried a **second copy** of the same loader (lines 39-49), which truncated the record the same way for display, so the panel labelled TOKENS (LIFETIME) and EST. SPEND (LIFETIME) read `0` / `$0.00` the moment the day turned. | Reproduced in both directions, each with a control that fails against the pre-fix source. **Unit:** seed 1,500 + 2,000 tokens and $0.42 + $0.08, date the record `Mon Jan 01 2001`, read it - pre-fix `expected undefined to deeply equal { m1: 1500, m2: 2000 }`, and the stored key no longer holds them either. **Browser** (`e2e/usage-ledger-roll.spec.ts`, a stale-dated record seeded into `localStorage` before the app boots, then the real analytics sheet opened): pre-fix the TOKENS (LIFETIME) card renders `0 tok` where `1.5k` was seeded, EST. SPEND renders `$0.00`. Because `buildBackup` reads this key, the same roll also emptied the `usageStats` field of any backup taken afterwards. |

### 18.2 Defect 32 - the counter labelled THIS WEEK never rolled

| # | Category | File / line | Root cause | Evidence |
|---|---|---|---|---|
| 32 | A counter with no period, under a label that names one - **a wrong number that only grows** (D=4: nothing is lost, and nothing on screen can reveal it - the figure is plausible at every value) | `lib/storage.ts` (`incrementModelCall`, the weekly branch) | `weeklyCallsByModel` is incremented on every call and **preserved** across the daily roll (round 11's test even pins that: "weekly counters survive the daily reset"), and nothing anywhere else writes the key - so there was no week boundary in the app at all. The panel reads it as **THIS WEEK**, which makes it a lifetime total wearing a week's label: after the first week of use it can only be too large, and by the end of a term it is wrong by whatever the term is. | Reproduced: seed a record dated today with `weeklyCallsByModel: { m1: 137 }` and a week that has turned - pre-fix the unit test fails with `expected { m1: 2 } to deeply equal {}` and the browser renders **`137 calls` under THIS WEEK** while today's own card correctly reads `5`. |

### 18.3 Defect 33 - the read path trusted the record it found

| # | Category | File / line | Root cause | Evidence |
|---|---|---|---|---|
| 33 | Persisted data dereferenced instead of re-read at the boundary - **a render crash reachable from the store** (D=5: the sheet that shows the ledger is the one that dies, and the reader has no way to know why) | `lib/storage.ts` (`loadUsageStats` returned `parsed` unread) → `components/AnalyticsDashboard.tsx` (`Object.values(usage.callsByModel)`) | The loader validated nothing: if the stored record was today-dated but missing its counters, it was returned as-is, and the sheet's first `Object.values(usage.callsByModel)` threw `TypeError: Cannot convert undefined or null to object` **during render**. This is round 11's defect 25 in a second place - same lesson, different key: the saved history was re-read at the boundary after one bad record took the app down, and this record kept being trusted. | Reproduced at both levels. **Unit:** a today-dated record with no counters - pre-fix `expected undefined to deeply equal {}`. **Browser:** the same seed, then the analytics sheet opened - pre-fix the sheet never appears at all (`SYS.07 // ANALYTICS CORE` is not found) because the render threw and the root error boundary from defect 27 took the segment; post-fix the card renders with `0` in it. |

### 18.4 The fix - one roll, three periods, each owning its own

| Layer | What changed |
|---|---|
| `lib/storage.ts` - the roll | `rollUsageStats(stats, now)` spreads the record it was given and overrides **only** the periods that are due: `callsByModel` when the day changed, `weeklyCallsByModel` when the week changed, and never the lifetime ledgers. It returns the record it was given when nothing was due, so a plain read no longer writes at all - the write now happens exactly when a roll does. |
| `lib/storage.ts` - the week | `weekStartKey(ts)` returns the **local** Monday of the week as `yyyy-mm-dd` (local, because this is a personal ledger and a UTC boundary would roll a Sunday evening over), and that key is stored on the record as `weekStart`. A record written before the field existed adopts the current week and starts counting there instead of carrying an undateable number forward for another week. |
| `lib/storage.ts` - the boundary | `weekStartKey` is the only new export; the reader now coerces both counters through `countMap()` and rejects a record that is not an object, so a wrong-shaped record is repaired on read rather than dereferenced by its consumer. |
| `lib/storage.ts` - the ledger's own key | The key string was written out at three call sites in one file; it is now the single `USAGE_KEY` constant, so the reader and the two writers cannot drift apart. |
| `components/AnalyticsDashboard.tsx` | The sheet's private copy of the loader is gone - it imports `loadUsageStats` from `@/lib/storage`. Two readers of one key is how the display and the record came to disagree about what a new day keeps. |

### 18.5 Verified

| Check | Result |
|---|---|
| `bunx vitest run` | exit 0 - 78 files, **1340 passed** (1333 before this round) |
| `bun tsc -b --noEmit` | exit 0 |
| `bunx eslint` on the two source files, the two unit files and the new spec | exit 0 |
| `tests/unit/storage.test.ts` (+4 ledger tests) and `tests/unit/usage-week.test.ts` (new, 3 tests) | exit 0 |
| the same four ledger tests against the pre-fix source (control: both source files stashed) | **exit 1** - `expected undefined to deeply equal { m1: 1500, m2: 2000 }`, `expected { m1: 2 } to deeply equal {}`, `.toMatch() expects to receive a string, but got undefined`, `expected undefined to deeply equal {}`; the 27 pre-existing tests in that file still pass, so the control isolates the four |
| `tests/unit/usage-week.test.ts` against the pre-fix source | **exit 1**, all three - the boundary helper did not exist, which is stated as the surface change it is rather than treated as an assertion failure |
| `e2e/usage-ledger-roll.spec.ts` (new, 3 tests, against the managed preview) | exit 0 |
| the same spec against the pre-fix source | **exit 1**, all three - `0 tok` where `1.5k` was expected, `137 calls` where `0` was expected, and the sheet itself never rendering because the read threw |
| `e2e/backup-restore.spec.ts` + `e2e/share-history.spec.ts` (the specs that drive this sheet, and the backup whose `usageStats` field rides this key) | exit 0 - **8 passed** |

### 18.6 Residuals, stated rather than left to be rediscovered

- **A calendar week, not a rolling seven days.** The counter belongs to the week the calls fall in, so a
  call at Sunday 23:59 and one at Monday 00:01 are in different weeks. A moving window would need every call
  timestamped; this record stores counts, deliberately, because it is a few hundred bytes of localStorage
  written on every model call.
- **An upgraded record starts its week at the first read.** The counters a pre-`weekStart` record holds
  cannot be dated, so they are not carried forward (the period is unknown, and keeping them would keep the
  label wrong for another week). These are call counts, not learner content - the trade-off is stated
  because it is a deletion, however small.
- **The roll still writes from the read path**, once per period change. That is deliberate: it is the only
  moment the record can be corrected for every later reader, and it is why the check is a comparison rather
  than a write on every read.
- **The ledger is per browser, not per account.** It is localStorage and it rides a backup; nothing syncs it
  between devices. Unchanged by this round, and the reason `buildBackup` reads it rather than a cloud copy.

### 18.7 Method note

The unit/e2e split here is the same one this audit has used since round 3: the unit tests own the arithmetic
(the roll is a pure decision over a record and two dates), and the browser owns the **figure**, because the
defect was visible only in the pairing of a roll with the panel that reads it - a stale-dated record seeded
into `localStorage` before the app boots, then the real sheet opened by clicking the real control. That is
also what makes the third defect provable at all: pre-fix the sheet does not render a wrong number, it does
not render, and the assertion that catches it is the one waiting for the sheet's own title. The control for
every row is the same test run with the two source files stashed - and for the week-boundary helper, the
honest statement that the export did not exist yet, which is why it lives in its own file rather than
failing as a whole-file import error inside `storage.test.ts`.

**Total: 33 distinct defects in 24 files** (31 is the first in `components/AnalyticsDashboard.tsx`; 32 and 33
are the third and fourth in `lib/storage.ts`, after 25 and 28).
