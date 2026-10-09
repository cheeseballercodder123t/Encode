# DeepEncode Bug Audit — 2026-10-08

Branch `fix/nonfunctional-audit-round-17`. **Round 17 (§19) was reconnaissance only - findings 34-39 are candidates rather than repairs, which is why its own totals stop at 33. Rounds 18-23 (§20-§25) then fixed all six, so the running total below is 39;** nothing from round 17 is left open, with 34-39 closed and recorded in §20-§25. Round 24 (§26) is reconnaissance only and changes no code: findings 40-44 were candidates there. **Round 25 (§27) then fixed finding 42 (the offline fallback), round 26 (§28) fixed finding 40 (the deadline that did not abort the call it gave up on) and round 27 (§29) fixed finding 41 (the attached file the hydration read could clobber), so the running total below is 42**, with 43 and 44 still open. **Round 28 (§30) then closed the gap §19.3 declared and deliberately left unfiled - the icons `app/manifest.ts` promised and nothing served, and the app shell nothing cached - formally as defect 45, so the running total is 43.** **Round 29 (§31) then fixed defect 46 - the AnkiConnect spec whose mock matched a host the app never requests, so three of its four tests could not pass - found by regression-testing round 28 rather than by looking for it, so the running total is 44,** with findings 43 and 44 the only ones still open. **Round 30 (§32) then fixed defect 43 - Teach Me's deterministic fallback builder, exported, documented and promised by the mount comment, with no caller anywhere, so a failed lesson request taught nothing at all - so the running total is 45,** with finding 44 the only one still open. **Round 31 (§33) then fixed defect 44 - the shared body validator applied to 5 of 27 routes, so twenty-two handlers read their bodies with a bare `await req.json()`: free text out of `/api/triage` and `/api/roast` reached a paid provider call with no ceiling at all, and a malformed body answered 500 - which closes round 24's sweep, so the running total is 46 and nothing filed is left open.** **Defects 1–12 are merged on `main` (`1b0ffb0`, PR #34), 13–14 in `1f67f2e` (PR #35), 15–16 in `c324989` (PR #36), 17 in `e3c21a6` (PR #37), 18 in PR #39 (round 5, §7) and 19 in PR #40 (round 6, §8) — every defect through round 6 is on `main`; defects 20-27 (§9 round 7, §10 round 8, §11 round 9, §12 round 10, §13 round 11 - the non-functional sweep - and §14 round 12) went to `main` in `2804e78` (PR #41); defects 28-30 (§15-§17, rounds 13-15) went to `main` in `dd1505c` (PR #42); defects 31-33 (§18, round 16, the usage ledger) went to `main` in `17c10fe` (PR #43).** Scope: the attack vectors in the request —
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

## 19. Round 17 - reconnaissance: the next six findings, prioritized

This round changes no code. It is the sweep that opens the next set of fixes: a second non-functional pass
over the surfaces the first sweep (round 11, §13) did not reach, ending in six findings ranked by what they
cost the person using the app. **Findings 34-39 are open candidates, not repairs** - the defect totals above
stay at 33 until one of them is fixed and pinned, which is the point of numbering them now: the next round
has a fixed target and a stated proof for each.

**Update, rounds 18-22 (§20-§24): findings 34, 35, 36, 37 and 38 are fixed and pinned. Their rows below are left as round 17 wrote them - that is the evidence the defects were real - with the repairs, the proofs and the mutation probes in §20, §21, §22, §23 and §24. Finding 35's row also undercounts the surface: the round-19 sweep found **eight** copy controls where round 17 named four (§21.1). Finding 39 was fixed and pinned in round 23 (§25).**

### 19.1 Prioritized findings

| # | Priority | Finding | Location | Evidence |
|---|---|---|---|---|
| 34 | **P0 - critical. FIXED in round 18 (§20)** | A throw inside any of the secondary sheets still replaces the whole app. `getDerivedStateFromError` exists in exactly two places - one boundary per Mr M panel and one around the stage renderer - so the pattern is established in this codebase but was never applied to the sheets: every sheet that throws propagates to the **root** `app/error.tsx` (defect 27), which replaces the segment, and the workbench, the stage the learner was on and the session view all go with it. The sheets are also where model-authored payloads land (crucible plans, forged decks, triage items), and this audit has already found such payloads reaching a render path or a dereference in five earlier rounds. | the ~20 sheets mounted in `app/page.tsx:2331`-`:2592`, none wrapped: `AuthModal`, `SettingsModal`, `PathwayBuilderModal`, `InquisitorModal`, `CrucibleModal`, `EmergencyTriageModal`, `SkillTreeModal`, `HistoryDrawer`, `RoastNotesModal`, `StatelessShareModal`, `ConceptPrerequisitesModal`, `PretestModal`, `TeachMeModal`, `BlurtingModal`, `SegregationRemnoteModal`, `AnkiExportModal`, `FlashcardForgeModal`, `ComparativeSynthesisModal`, `EndSessionReviewModal`, `AnalyticsDashboard`; the two boundaries that do exist: `components/mr-m/MisterMSurface.tsx:39`, `components/stage-templates/TemplateErrorBoundary.tsx:15` | **Already demonstrated in live code, not hypothetical:** defect 33 (§18.3) is a sheet (analytics) throwing during render, and the browser control recorded the outcome - `SYS.07 // ANALYTICS CORE` never appears and the root fallback takes the segment. The payload shapes that reach these surfaces are the ones defects 5-8, 13, 23 and 33 were: a null spec, a non-finite draw, a one-letter answer, a corrupted record. **Proof for the fix:** inject a throw in one sheet the way round 12 proved defect 27, and assert the session view is still on screen with the sheet's own fallback inside it. |
| 35 | **P1 - high. FIXED in round 19 (§21)** | Four copy controls, three different behaviours, and the busiest one reports a success it cannot know about. The history drawer's `handleCopyRemNote` calls `navigator.clipboard.writeText(content)` as a **floating promise** - no `await`, no `.catch` - and sets the copied state unconditionally, so the row renders `[ OK ]` whether the write landed or not. The forge's copy control is the opposite failure: it awaits an unguarded `writeText` inside an `async` click handler, so a rejection produces no state change, no message and an unhandled rejection - the click looks dead. Two siblings in the same repo already do this correctly, which is what shows the standard was known and not applied. | `components/HistoryDrawer.tsx:69`-`:80` (the copy), `:323` (the `[ OK ]` glyph); `components/FlashcardForgeModal.tsx:1953`-`:1960`; correct in `components/StatelessShareModal.tsx:69`-`:82` (API check, `execCommand` fallback, failure reported) and `components/SegregationRemnoteModal.tsx:136`-`:141` (catch, text kept visible for manual selection) | Read from the code; reachable without a hostile condition. `writeText` rejects with `NotAllowedError` whenever the document is not focused (a second monitor; a click that follows a keyboard shortcut) or permission is denied, and `navigator.clipboard` is **undefined on a non-secure origin**, where the drawer's call throws a `TypeError` inside the click handler before any state is set. RemNote/Notion is an export path exactly like the `.apkg` download and this is its only handoff, so the failure mode is a learner pasting an unchanged clipboard into RemNote after being told it was copied. **Proof for the fix:** a Playwright init script that makes `writeText` reject (and a second run with `navigator.clipboard` deleted), then a click on each control, asserting the visible state matches what actually reached the clipboard. |
| 36 | **P2 - medium. FIXED in round 20 (§22)** | The cloud settings restore cannot do what its own comment says. It applies the account's backup when `backup.savedAt >= (settings.savedAt \|\| 0)`, described in the code as "Only applied when the backup is newer than what local storage holds (multi-device safe)" - but `savedAt` is stamped by the **caller**, never by `saveAISettings`, so only two of the four writers produce it. Reset-to-defaults and a backup restore write settings with no stamp at all, `localSavedAt` is then `0`, the comparison is trivially true, and the account's copy - however old - overwrites what is on the device. | `lib/auth-context.tsx:107`-`:118` (the guard); stamps: `components/SettingsModal.tsx:62`-`:68` and `:107`-`:111`; no stamp: `components/SettingsModal.tsx:120` (reset), `lib/backup.ts:219`-`:221` (restore); `lib/storage.ts:51`-`:57` (`saveAISettings`) | Read from the code, and deterministic - no race needed: restore a backup (or reset to defaults) on a device, then sign in, and the stored settings are replaced by the account's copy. That is how a deliberately cleared API key comes back, or a working key is replaced by a stale model choice; the guard's stated purpose is exactly what fails. **Proof for the fix:** the choice is a pure decision over two records, so it can be extracted and unit-tested in both directions (newer local wins, newer backup wins, neither stamped), plus one browser test that restores a backup and signs in. |
| 37 | **P2 - medium. FIXED in round 21 (§23)** | The stage being written is never persisted until it is submitted. The typed answers live in React state (`field1`/`field2`/`field3` at page level, written on every keystroke) and reach `userResponses` only on Submit, Skip or navigation - and every persistence path hangs off `userResponses` (the stage-boundary save, the cross-device sync, the drawer). There is no draft write for the in-stage fields, so a reload, a crash or a closed tab mid-stage returns to that stage with **empty fields**, while every earlier stage survives. | `app/page.tsx:1144`, `:1203`, `:1269` (where `userResponses` is written), `:1178`, `:1230` (the saves that follow), `:2253` (the fields handed to the workbench), `:293` (`loadStageInputs` is a loader only); the paths that did get autosave: `:1020`-`:1035` (YouTube, per stage) and `:1043`-`:1056` (lab, 500 ms debounce with cleanup) | Read from the code, and reachable in one step: type into a stage, reload without submitting. No draft-shaped storage key exists anywhere (`_draft` / `DRAFT_KEY` across `lib/`, `app/`, `components/` returns nothing), which is what makes this a missing write rather than an unreachable one. The asymmetry is the evidence that the need was known: the YouTube path's own comment says it exists "so 'encode 2 of 9 chapters today' survives a reload", and a text/file session relies entirely on the stage boundary. **Proof for the fix:** type into a stage, reload without submitting, assert the fields come back - then the same run with the fix. |
| 38 | **P4 - low. FIXED in round 22 (§24)** | The debounced autosave is documented, exported, and dead. The function's own comment says "Debounced autosave for performance during typing" and the README describes the storage facade by that behaviour, but it has **zero callers** - nothing in the app debounces a save. This is defect 30's class (§17) in production code rather than in a test: nothing is broken at runtime, and the cost is a reader (and the README) believing typing is debounced when the real cadence is the stage boundary - which is also how finding 37 stayed invisible. | `lib/storage.ts:25` (`autosaveTimer`), `lib/storage.ts:358`-`:370` (`debouncedSaveSchema`), `README.md:225` | Read from the code: a search for `debouncedSaveSchema` and `autosaveTimer` across `app/`, `components/`, `hooks/`, `lib/`, `tests/` and `e2e/` returns only the definition and the module-level timer it guards. **Proof for the fix:** either wire it to the draft it was written for, or delete it and correct the README; the check is a grep that returns nothing plus the round's suite. |
| 39 | **P4 - low. FIXED in round 23 (§25)** | The pending-sync badge can be wrong on screen. `pendingLocalCount` is a `useMemo` over `[user, cloudSchemas, hydrated]` that calls `loadSavedSchemas()` - a module-level cache which changes on every write, with no dependency that moves when it does - so saving a schema while signed in leaves the badge showing the previous count until some unrelated render changes one of those three values. It is the only signal that local work has not reached the cloud, so a stale value reads as "nothing pending" exactly when something is. | `lib/auth-context.tsx:71`-`:77` | Read from the code, and deterministic: save a schema with a signed-in session and watch the count. **Proof for the fix:** take the count from the `useSchemaLibrary` list the drawer already subscribes to (or subscribe to `subscribeToSavedSchemas`), then a browser test that saves and reads the badge with no other interaction. |

### 19.2 Checked and cleared in this pass (recorded so the next round need not re-derive it)

A sweep is also the record of what it looked at and did **not** find. Each of these was a candidate shape
going in, and each is clean in the code as it stands:

- **Timing surfaces cannot be cheated by a hidden tab.** The crucible sprint clock (`components/crucible/CrucibleModal.tsx:236`-`:253`) and the 10-second discrimination gate (`components/DiscriminationGate.tsx:96`-`:113`) both compute from `Date.now()` deltas and a stored deadline rather than decrementing a counter per tick, so a throttled interval in a background tab can only delay the *readout*, never add or remove time. `EmergencyTriageModal`'s runway ticks the same way.
- **The generation lifecycle is closed.** One `AbortController` exists per generation (`app/page.tsx:274`, reassigned at `:649`/`:732`), Cancel aborts it and clears the interrupted flag (`:606`-`:610`), success and error clear it too (`:714`, `:816`), and the "cut off" notice only appears for a leftover older than 10 s (`:147`-`:151`) - so a live generation in another tab is not reported as a failure and a finished one does not leave a false banner.
- **Progress reporting is honest under failure.** `hooks/useGenerationProgress.ts` clears both intervals on stop, keeps its bar asymptotic (it cannot show 100% before the response lands), and the stream's real outlines override the ticker.
- **The debounce windows that do exist are correct.** The lab checkpoint effect debounces 500 ms **with cleanup** (`app/page.tsx:1043`-`:1056`), and `ToyModelLab` stops its intervals when the tab is hidden, flushes on `pagehide`, and removes both listeners.
- **Listeners and object URLs are paired.** `components/` and `hooks/` contain **18 `addEventListener` calls and 18 `removeEventListener` calls**, and every pair matches by event name and handler in the same effect (`PWAInstallHeader` ×4, `AnkiExportModal`, `SketchCanvas` ×2, `StudioWorkbench` ×3, `ToyModelLab` ×3, `use-mobile`, `useSettings` ×2, `useModalA11y` ×2). Each `createObjectURL` is followed by a `revokeObjectURL` (`lib/backup.ts:151`/`:158`, `lib/services/sessionAnalytics.ts:206`/`:211`, `AnkiExportModal` ×3).
- **Restore merges rather than clobbers.** `restoreBackup` keeps existing ids and skips collisions (`lib/backup.ts:214`-`:224`), so importing an older backup cannot delete newer work - the settings stamp (finding 36) is the only part of that path that is wrong.
- **The in-flight write paths tolerate a full or absent store.** IndexedDB failures degrade to the localStorage mirror with a warning, and the usage ledger's own failure paths are already fixed (§18).

### 19.3 Not counted as a defect, stated because it is a real gap

**No service worker is registered.** A search for `serviceWorker` across `app/`, `components/` and `lib/`
returns nothing, and `public/` holds only `assets` - so the app shell is not cached and the install
affordance in `PWAInstallHeader` (which listens for `beforeinstallprompt`) has no offline story behind it. It
is not filed as a defect because generation itself requires the network, and the in-page offline fallback
generator still works once the page has loaded; the gap is that a learner who is offline **before** the page
loads gets the browser's error page, not the app's own offline path. **Correction, round 24
(§26.2 finding 42): the second half of that sentence was wrong** - the offline generator is not
wired to anything, so "still works" was an assertion about a behaviour nobody had run, inside the
paragraph whose stated purpose was to be clear about what the sweep did not find. The gap was wider
than this paragraph claimed. **Update, round 25 (§27): finding 42 is fixed, so the sentence above is
now true as written** - the generator is wired, and the paragraph's remaining point (no service
worker, so a learner who is offline before the page loads still gets the browser's error page) stands
unchanged. **Closed, round 28 (§30), as defect 45.** That round got further than the gap was ever
stated to be: the missing worker was the second half, and the first was that the manifest's own
`/icon-192.png` and `/icon-512.png` returned **404**, which is why Chromium never considered the app
installable and the install affordance above could not appear for anyone.

### 19.4 Priority order for the next round, and how the sweep ran

Fix order: **34** (a crash in any secondary sheet costs the session), then **35** (the handoff surfaces),
then **36** and **37** (both silent regressions with a deterministic reproduction), then **38** and **39**
(a dead export and a stale badge - cheap, and 38 is small enough to ride along with another round).

The sweep was run read-first: the report's own record of what earlier rounds covered (§1-§18) fixed the
target list, then each candidate was confirmed by reading the call site and the surrounding contract rather
than by pattern-matching - which is what removed three candidates that looked bad from a grep and are
correct in the code (a per-keystroke save, a per-keystroke IndexedDB write, and a `setInterval` that decrements
a counter). The evidence column above is the exact file and line range read in each case; where a claim rests
on a behaviour rather than a line, it is named as such (finding 34 rests on defect 33's recorded browser
control, finding 35 on the four call sites' differing handling of the same rejection). No code, test or
configuration was changed in this round, which is why its output is a ranked list rather than a diff.

## 20. Round 18 - defect 34, the sheet that took the whole session with it

This is round 17's first finding, fixed and pinned. It is a P0 because of where the throw lands rather
than how rare the throw is: the twenty secondary sheets were mounted directly in `app/page.tsx`, so a
render error inside any one of them propagated past every boundary in the tree to the **root**
`app/error.tsx` (defect 27), which replaces the segment - the workbench, the stage the learner was on and
the session view all went with it. That is not hypothetical and not from this round's own invention: it is
exactly what defect 33 (§18.3) recorded in the browser, where one corrupt usage record inside the analytics
sheet took `SYS.07 // ANALYTICS CORE` off the screen entirely.

### 20.1 The missing rule, and the fault the browser drives it with

Whole-sheet coverage rather than one repaired sheet, because the defect was a missing rule: the pattern was
already in the codebase twice (`components/mr-m/MisterMSurface.tsx`, one boundary per Mr M panel;
`components/stage-templates/TemplateErrorBoundary.tsx`, one around the stage renderer) and was never applied
to the sheets. A boundary on nineteen of twenty would still be a hole, and the twenty-first sheet added next
month would reopen it silently - so the rule is enforced structurally (§20.3) rather than remembered.

**The fault the spec drives it with is a real one, not a synthetic throw in a component.** The storage
read boundary coerces a saved record's own fields (`coerceSavedSchema`, defect 25) but not the values
*inside* its `userResponses` map, and the library-wide stats walk dereferences every response
(`r.field1?.trim()`, `lib/services/sessionAnalytics.ts`) - so one null response record makes the analytics
sheet throw during render. That is the same shape as defects 25 and 33: the payload arrives through a
store, and the throw is in a render path. `e2e/sheet-error-boundary.spec.ts` seeds exactly that record and
drives the real app against the preview server.

### 20.2 Fixed, in three pieces

1. **`components/SheetErrorBoundary.tsx` (new).** A class boundary with `getDerivedStateFromError` turning
a throw into error state, and `componentDidCatch` logging the sheet's own name so a report from the field
says which sheet failed. Two details are deliberate: `retry` clears the error and re-renders the same child
(the learner's chance to get past a transient throw), and the error is also cleared when the `open` prop
flips, because otherwise a closed sheet would re-open onto the previous crash's fallback instead of the
sheet. `open` and `onClose` are **required** props for that reason - a boundary that cannot dismiss the sheet
it stands in for would leave the learner staring at a fallback with no way back. The fallback is a function
component so it can take `useModalA11y(true, onClose)` from the same hook every other overlay uses: Escape
closes it, the page behind stops scrolling and focus moves in. A fallback that could not be dismissed with a
key would be a smaller version of the problem it is standing in for.

2. **`app/page.tsx` - all twenty mount sites wrapped**, each with its own name (the `data-sheet` attribute
and the fallback's heading): Account, Settings, Pathway builder, Inquisitor, Crucible, Emergency triage,
Skill tree, Saved schemas, Roast my notes, Share link, Prerequisites, Pre-test, Teach me, Blurting, RemNote
segregation, Export choice, Flashcard forge, Comparative synthesis, Session review, Analytics. Nothing else
in the file changed; the sheets' own props, order and mount flags are untouched.

3. **`app/error.tsx` unchanged on purpose.** It is the last line of defence (defect 27) and stays that way:
the point of this round is that a sheet error no longer reaches it.

### 20.3 Verified

- **Boundary contract (unit, `tests/unit/sheet-boundary.test.tsx`, 4 tests, happy-dom).** Children render
untouched while nothing throws; a throw is contained, the fallback names the sheet (`data-sheet="Analytics"`,
"The Analytics sheet failed to render."), carries the thrown message and states that the session is untouched;
retry re-renders the sheet and a throw that is still there is contained again rather than re-thrown; and the
close control asks the *parent* to close (driven through a harness with real `open` state, so the contract is
the one `app/page.tsx` uses), after which re-opening shows the sheet and not the previous crash's fallback.
- **Coverage pin (unit, `tests/unit/sheet-boundaries.test.ts`, 5 tests, source scan).** Every `*Modal`,
`*Drawer` and `AnalyticsDashboard` mount in `app/page.tsx` sits inside a `SheetErrorBoundary`, checked by
counting boundary tag depth against each mount's position rather than by a count; the scan finds at least 20
sheets so it cannot pass vacuously; no boundary is self-closed (which would wrap nothing and satisfy a naive
count); and the hand-rolled `[ SEGREGATION COMPLETE ]` export-choice overlay, which is not a `*Modal`
component, is behind one too.
- **The app-level result (e2e, `e2e/sheet-error-boundary.spec.ts`, 3 tests, live preview).** With the corrupt
record seeded, the analytics sheet throwing during render produces: the root fallback
("Something in this screen failed to render.") has count **0**; the sheet fallback is visible with
`data-sheet="Analytics"`; the sheet's own heading is gone rather than half-rendered; closing the failure
returns to the studio, where a **real keystroke lands in the notes field** and is read back; the history
drawer then opens and lists the very record whose response map is the reason analytics failed; Settings
opens with no fallback behind it. The second test presses Escape on the failed sheet and lands in the same
studio, and the third retries, fails again (the data is still corrupt) and is contained again.
- **Mutation-proven, which is the part that matters.** Replacing the boundary's catch with a no-op
(`getDerivedStateFromError` returning `{ error: null }`) makes the app fall back to the **root** boundary and
all three specs fail with `the sheet throw escaped to the root boundary - nothing contained it`; restoring
the real catch turns them green. That is the defect reproduced on demand and the fix demonstrated to be what
stops it, rather than a test that passes for its own reasons. The spec states its premise explicitly
(`requireContained`): a missing fallback is either an escaped throw, which **fails** with that message, or a
corruption that no longer reaches a render, which skips with a note telling the next round to pick a new
shape.
- **Neighbours re-run, because the wrappers sit around every sheet:** `e2e/modal-a11y.spec.ts` (Escape,
Tab trap, scroll lock through the export sheet) and `tests/unit/modal-a11y.test.ts` (every overlay asks for
the shared hook) both pass, and `bunx tsc -b --noEmit` is clean.

### 20.4 What the containment does, and what it does not

The promise is containment, and the fallback says only that: the session is untouched, the work is still
there, and the sheet can be retried or closed. **It does not repair the data.** The seeded corruption still
cannot be rendered by the analytics sheet, so retrying it fails again - correctly, and visibly, instead of
quietly showing wrong numbers. Two consequences are stated rather than implied:

- **A crashed sheet's own in-progress state is lost** when it is retried, because the retry re-renders the
  sheet from scratch. The session behind it - stages, answers, settings - is what is preserved, and that is
  the promise the fallback makes.
- **The reader that produced this fault is still uncoerced:** `lib/services/sessionAnalytics.ts` dereferences
  every `userResponses` value, and the storage boundary validates that the map is a map without validating
  what is inside it. Coercing the response records is a candidate of its own (the same shape as defects 25
  and 33) and is deliberately *not* taken here, because this round is the containment rule and silently
  changing what the stats reader counts would be a behaviour change dressed as a bug fix.

**Total: 34 distinct defects in 29 files** (34 is the first in `components/SheetErrorBoundary.tsx` and the
first fix in `app/page.tsx`, which was a call site in four earlier rounds; the three test files added -
`tests/unit/sheet-boundary.test.tsx`, `tests/unit/sheet-boundaries.test.ts` and
`e2e/sheet-error-boundary.spec.ts` - are counted as files, following defect 30's precedent).

## 21. Round 19 - defect 35, the handoff that reported a copy it never made

Round 17's second finding, fixed and pinned. It is a P1 rather than a P0 because nothing is lost at the
moment of failure: the learner keeps the deck and can select the text by hand. What is lost is the only
signal the handoff gives - a copy control that says `[ OK ]` over an unchanged clipboard sends an empty
paste, or an old one, into RemNote, and the learner only finds out when the cards are not there.

### 21.1 Eight controls, five behaviours - and a correction to round 17's count

Round 17 counted four copy controls. The sweep for this round found **eight**, because it followed the
clipboard call rather than the surface: `app/page.tsx`'s `copyToClipboard` (the completed session's three
format buttons, rendered by `CompletedSessionView`), `StudioWorkbench`'s RemNote copy and `ToyModelLab`'s
embed bullet are the same control in the same class, and two of the three were wrong in the same two ways
as the four named. Every one of them is listed below, because "standardised" is only true if the list is
complete:

| Control | The behaviour it had |
|---|---|
| History drawer, per-row RemNote copy (`components/HistoryDrawer.tsx`) | `navigator.clipboard.writeText(content)` as a **floating promise**, then `[ OK ]` unconditionally - and on a non-secure origin the call threw a `TypeError` inside the click handler *before* any state was set |
| Completed session, three format buttons (`app/page.tsx` → `components/CompletedSessionView.tsx`) | The same floating promise and the same unconditional `[ OK ]`, once per format |
| Forge 1-click RemNote copy (`components/FlashcardForgeModal.tsx`) | A bare `await navigator.clipboard.writeText(...)` in an async click handler: a refusal produced no state change, no message and an **unhandled rejection** - the click looked dead |
| Toy model, RemNote embed bullet (`components/toy-models/ToyModelLab.tsx`) | `void navigator.clipboard?.writeText(...).then(...).catch(...)` - a refusal was swallowed and the button deliberately "stays as it is" |
| Workbench RemNote copy (`components/workbench/StudioWorkbench.tsx`) | Awaited inside a `try`/`catch` whose catch only `console.warn`ed |
| RemNote sheet, per-document and copy-all (`components/SegregationRemnoteModal.tsx`) | `void navigator.clipboard?.writeText(text).catch(() => undefined)` followed by an unconditional "Copied!" |
| Share sheet, both buttons (`components/StatelessShareModal.tsx`) | The only one that checked its outcome (with its own `execCommand` ladder) - and the only one that told the learner **nothing** when the write failed, beyond a `console.error` |

### 21.2 Fixed, in two shared pieces and eight wirings

1. **`lib/clipboard.ts` (new).** `copyTextToClipboard(text)` is the only place in the app that writes to the
clipboard. Order: the async Clipboard API first, then the selection path - tried whether the API was
**missing** or **refused**, because `NotAllowedError` is the ordinary refusal (the document was not focused,
or permission was denied) and is exactly the situation the selection path still works in. Every step is
guarded, the textarea is removed in a `finally`, and the function **never throws**: the caller receives
`{ ok: true, via }` or `{ ok: false, reason, message }` with `reason` distinguishing `empty`, `unavailable`
(no clipboard API at all) and `blocked` (both paths refused).
2. **`hooks/useClipboardCopy.ts` (new).** The feedback half, once: `status`, `key`, `message`, `copied(k)`,
`failed(k)` and `copy(text, k)`. Success is recorded **only** for `ok: true`; the confirmation resets after
`resetMs`; the timer is replaced on a second click and cleared on unmount; and the state is **keyed**, so a
sheet that lists twenty rows marks the row that was copied instead of the sheet.
3. **The eight controls wired to it**, each carrying `data-copy-status="idle|copied|failed"`, each showing a
failure state (`[ ! ]` plus the shared message, and for the two sheets roomy enough, a visible line: the
share sheet's `share-copy-failed`), and each playing its success sound only for a write that landed. The
success *labels* are deliberately untouched - the ask was one behaviour, not eight new words.

### 21.3 Verified

- **The write (`tests/unit/clipboard.test.ts`, 8 tests).** The landed write names its path and passes the
exact text; a refusal falls back to the selection path rather than failing; both paths refusing reports
`blocked` with the shared message; a browser with no clipboard at all reports `unavailable` instead of
throwing (the old drawer's `TypeError`); a provider that throws **synchronously** is handled too; an empty
payload is refused before either path is touched; no stray textarea is left behind on success or failure;
and every refusal shape resolves rather than rejecting.
- **The feedback (`tests/unit/use-clipboard-copy.test.tsx`, 9 tests, happy-dom).** Idle at rest; `copied` only
for a landed write; `failed` with the shared message otherwise; the key marks the control that was copied and
not its siblings; the failure stays attached to the control that failed; the confirmation resets to idle; a
second click **owns** the confirmation instead of the first timer clearing it; unmounting clears the pending
reset; and a later success replaces an earlier failure.
- **The standardisation (`tests/unit/clipboard-standardisation.test.ts`, 6 tests, source scan).** Only
`lib/clipboard.ts` writes to the clipboard (matched on the **call** form, so this report and the code
comments can keep quoting the old calls); the seven control files all use the hook; the seven files that
render copy state all carry `data-copy-status`; every control reads its `failed(` state, not just the
success one; and the hook itself contains no clipboard call, so the order stays write-then-report.
- **The browser (`e2e/clipboard-handoff.spec.ts`, 3 tests).** With real clipboard permissions: a click on the
drawer's copy marks `copied`, shows `[ OK ]`, and the **markdown is read back off the system clipboard** to
prove the right text arrived - then the mark returns to `idle` on its own. All **three** completed-session
format buttons are then driven the same way, and each one taking the mark from the previous button is
itself asserted, so the keyed state is proven across three controls rather than on one. With a refusing
clipboard: the drawer, the share sheet (including its visible message) and **all three** completed-session
buttons report `failed` with no `[ OK ]` over any of them. With **no clipboard API
at all**: the failure is reported, the sheet stays usable, and nothing throws. An init script records
`unhandledrejection` and `error` before the app boots, and it is asserted empty after **each** interaction.
- **Mutation-proven.** Removing the refusal's `catch` in `lib/clipboard.ts` - leaving the rejection to
propagate, the way the forge's bare `await` did - makes the browser record `NotAllowedError: denied` as an
**unhandled rejection**, and the spec fails with `a refused clipboard write rejected uncaught` before it can
assert anything else; restoring the catch turns it green. That is the defect reproduced on demand, and it is
what makes the "nothing rejects" assertion load-bearing rather than decorative.
- **Neighbours re-run, since every copy control changed:** `e2e/remnote-embed.spec.ts` (which copies from the
toy lab and reads the bullet back off the real clipboard - now through the shared implementation) and
`e2e/share-history.spec.ts` (the drawer, the completed view and the analytics sheet) both pass, and
`bunx tsc -b --noEmit` and `bunx eslint` are clean.

### 21.4 One deliberate behaviour change, and two things left alone

- **A refused write now falls back instead of failing.** The share sheet was the only control that used the
selection path, and only when `navigator.clipboard` was *absent*. Refusal is the commoner case - an unfocused
document, a denied permission - so the shared implementation tries the selection path for it as well. That
changes which clicks succeed, which is the point of the fix, and it is why the outcome carries `via`: a
caller can tell a real clipboard write from the fallback if it ever needs to.
- **The success copy stays as it was** (`[ ✅ REMNOTE MARKDOWN COPIED TO CLIPBOARD ]`, the share button's
`bg-amber600`, `[ OK ]` per format). Consistency was the ask, and eight freshly invented labels would be a
worse answer than the same state rendered in each surface's own register.
- **`navigator.clipboard.readText` is untouched.** The scan matches writes only: reading the clipboard back is
what the tests do, and no control in the app reads it.

**Total: 35 distinct defects in 38 files** (35 is the first in `lib/clipboard.ts` and the first in
`hooks/useClipboardCopy.ts`, and the first in `components/FlashcardForgeModal.tsx`,
`components/StatelessShareModal.tsx`, `components/SegregationRemnoteModal.tsx` and
`components/toy-models/ToyModelLab.tsx`; `components/HistoryDrawer.tsx`, `app/page.tsx`,
`components/CompletedSessionView.tsx` and `components/workbench/StudioWorkbench.tsx` were already counted by
earlier rounds. The three test files added - `tests/unit/clipboard.test.ts`,
`tests/unit/use-clipboard-copy.test.tsx` and `tests/unit/clipboard-standardisation.test.ts` - are counted
as files.)

## 22. Round 20 - defect 36, the settings stamp four writers were each asked to remember

Round 17's third finding, fixed and pinned. It is a P2 because nothing is
corrupted: what it costs is the learner's most recent deliberate decision about
their own configuration - the API key they cleared, or the settings file they
just restored - being silently replaced by an older account copy the next time
they sign in. The restore exists to make a cleared browser profile harmless; the
defect made signing in the thing that undid it.

### 22.1 One field, four writers, and the guard that read it

`settingsBackup` in the user's Firestore document is applied over the device's
settings on sign-in, and the whole point of the comparison is that it must only
happen when the account's copy is *newer*. "Newer" is `savedAt`, and the field was
written by the caller:

| Writer | Stamped before this round |
|---|---|
| `SettingsModal.handleSave` | yes, `{ ...settings, savedAt: Date.now() }` |
| `SettingsModal.handleImportFile` | yes, same shape |
| `SettingsModal.handleReset` | **no** - `saveAISettings(DEFAULT_SETTINGS)` |
| `lib/backup.ts restoreBackup` | **no** - `saveAISettings(backup.settings)`, i.e. whatever the file carried (usually nothing, sometimes a months-old stamp) |
| `lib/auth-context.tsx backupSettingsToCloud` | yes, `savedAt: savedAt \|\| Date.now()`, stored beside the settings body |

A missing stamp is not neutral: the guard read `(current as any)?.savedAt || 0`,
so an unstamped local record read as `0` - older than every real write - and**any
truthy** account stamp won, including a string or `Infinity`. So the two paths a
learner uses *deliberately* to change or clear their settings were the two whose
state could be overwritten. The account side was never the problem: the cloud
writer always stamped.

One more cause, worth naming because it is why this could happen quietly:
`AISettings` had **no `savedAt` field at all**. Every writer and reader reached it
through `as any`, so omitting it was not a type error - it was invisible. The type
now carries it, and the casts are gone.

### 22.2 Fixed, in three pieces plus the type

1. **`lib/settings-sync.ts` (new).** The field's rules, in one testable place:
`readSettingsStamp` (a usable stamp is a finite number **greater than zero** -
`0`, `NaN`, a string and a missing field all mean "no age to compare");
`nextSettingsStamp` (explicit stamp > the record's own > now);
`shouldApplyCloudSettings(local, backup)` (the decision, both directions); and
`mergeCloudSettings(current, backup)` (the record to write when it applies).
2. **`lib/storage.ts` - the stamp happens in the single writer.**
`saveAISettings(settings, savedAt?)` stamps every record, so a caller cannot omit
it: that is the difference between fixing two paths and closing the class. The
optional explicit stamp is what lets the cloud-restore path keep the *content's*
age instead of claiming the content is new on this device - stamping it "now"
would make this device permanently newer than every later edit made elsewhere, so
a genuinely newer account copy could never arrive.
3. **The two writes whose age is not "now" are explicit about it.**
`lib/backup.ts restoreBackup` stamps `Date.now()`: the learner chose that content
on this device today, and the file's own age is precisely what let an older
account backup undo the restore. `lib/auth-context.tsx` replaces its inlined
comparison with `shouldApplyCloudSettings(current, backup)` and writes
`mergeCloudSettings(current, backup)` - local fields the account never had are
kept, and the backup's stamp travels with its content.
4. **`lib/types.ts`.** `AISettings.savedAt?: number`, documented as the guard's
input, so the next writer gets told about it by the compiler.

What that produces, per pair of records:

| Device record | Account copy | Result |
|---|---|---|
| stamped, newer (reset, restore, save, import) | older | **local wins** - the defect case, now correct |
| stamped, older | newer | applied, and the local record keeps the account's age |
| stamped | no usable stamp (absent/`0`/`NaN`/string) | **not applied** - an unreadable age cannot be shown to be newer |
| no usable stamp (a record written before this round) | any | applied - the wiped-profile case the restore exists for |
| equal stamps | - | applied, so two devices converge on the same content |

### 22.3 Verified

- **The decision (`tests/unit/settings-sync.test.ts`, 16 tests).** The stamp
reader (a positive finite number, and `0`/negative/`NaN`/`Infinity`/string/
boolean/`null`/non-object all read as no stamp); `nextSettingsStamp` in all three
precedences, including an unusable explicit stamp falling through instead of being
trusted; the decision in both directions, at a tie, against an unreadable backup
stamp, against an unstamped local record, and against `null`; the merge taking the
account's settings, keeping local fields the account never had, and keeping the
content's age. Then the two failure modes end to end through the real storage
layer: **a reset written by a path that forgets to stamp** now outranks an older
account backup instead of being replaced by it, and a pre-fix record with no stamp
still accepts the account copy.
- **The storage layer (`tests/unit/storage.test.ts`, +2 tests, 33 in the file).** A
record written by a path that forgets to stamp carries a fresh one; an explicit
stamp is honoured; the record's own stamp is kept.
- **The restore path (`tests/unit/backup.test.ts`, +1 test, 15 in the file).** A
restored settings file is stamped now, not with the file's age - the file's
`savedAt` deliberately set a year back, asserted not to survive.
- **The browser (`e2e/settings-stamp.spec.ts`, 2 tests).** In the real sheet: the
reset writes a record stamped now and newer than the device's old stamp (and the
sheet stays usable); a following save moves the stamp forward instead of reusing
it.
- **Mutation-proven, both halves.** (a) Writing the record exactly as handed in -
the pre-fix storage behaviour - fails **five** of the new tests across the three
files, including both end-to-end ones and the restore regression test. (b)
Restoring the pre-fix comparison fails `never applies a backup whose age cannot be
read`, which is the truthy-stamp hole. Both mutations were reverted and the checks
re-run green.
- **The e2e's own limit, stated because it is easy to misread.** The stamp is now
guaranteed twice (at each call site and inside the single writer), so *either*
layer alone satisfies the browser assertions - the spec pins the observable
behaviour but cannot tell them apart. The mutation above is run against the unit
tests, which fail loudly.
- **Neighbours:** `e2e/share-history.spec.ts` (the settings sheet, the history
drawer and the analytics sheet) still passes, the full unit suite is green (84
files, 1391 tests), and `bunx tsc -b --noEmit` and `bunx eslint` are clean.

### 22.4 The one consequence a learner can observe

**A device whose settings record predates this round has no stamp**, so the first
sign-in after this update still applies the account's copy over it - once. That is
the intended reading rather than a gap: an unknown age is not evidence of
newness, and the alternative (treating an unstamped local record as the newest
thing on the account) would strand every learner who has ever cleared their
browser profile. After that first write, every subsequent state on the device is
stamped, so the decision is real from then on.

### 22.5 Checked, and recorded because it is the next trap

Every write path was enumerated rather than assumed: `saveAISettings` in
`lib/storage.ts` is the **only** persistence for AI settings (a `localStorage`
mirror; `lib/storage/index.ts` is a nine-line re-export of `lib/db.ts`, and
greping the settings key across `app/`, `components/`, `hooks/` and `lib/` returns
only its definition, its reader and that writer). The account side has exactly one
writer too, `backupSettingsToCloud`, and it stamps.

**One observation, not filed as a defect:** `lib/db.ts` creates a `settings`
object store that nothing reads or writes - settings never moved to IndexedDB,
and the only `session_state` use is `last_upload`. It is harmless today, and it is
worth naming here because it is the obvious place a future round would add a
second settings writer: anything persisted through that store would bypass
`saveAISettings` and therefore the stamp. The guard's correctness rests on "one
writer, and it stamps", so that is the property to keep.

**Total: 36 distinct defects in 45 files** (36 is the first in
`lib/settings-sync.ts`, the first in `lib/backup.ts`, the first in
`lib/auth-context.tsx`, the first in `components/SettingsModal.tsx` and the first
in `lib/types.ts`; `lib/storage.ts` was already counted by defects 25 and 28. The
two test files added - `tests/unit/settings-sync.test.ts` and
`e2e/settings-stamp.spec.ts` - are counted as files, and
`tests/unit/storage.test.ts` and `tests/unit/backup.test.ts` were already counted
by earlier rounds.)

## 23. Round 21 - defect 37, the stage that was never written down

Round 17's fourth finding, fixed and pinned. It is a P2 because nothing is
corrupted and no other stage is touched: the workbench simply came back to **that**
stage with empty fields, so a reload, a crash or a closed tab mid-paragraph took
the paragraph with it. The asymmetry round 17 named is what made it readable as
loss rather than as a limitation - a submitted stage survives in `userResponses`,
and both other input paths already checkpoint explicitly (`app/page.tsx:1020`-
`:1035` per YouTube stage, `:1043`-`:1056` for the lab on a 500 ms debounce,
whose own comment says it exists "so 'encode 2 of 9 chapters today' survives a
reload"). The live fields had no writer at all - a search for a draft-shaped key
returned nothing - so every keystroke on the visible stage existed only in React
state until Submit/Skip.

### 23.1 The record, the single writer, and the reader that is also the guard

1. **`lib/stage-draft.ts` (new).** One localStorage record under
`deepencode_stage_draft_v1`, matching `lib/mr-m/ledger.ts` and
`interference-traps.ts`: the draft is read on the launchpad's first paint, before
an async store could answer. The body is the **session the stage belongs to**
(activities, `userResponses`, encoding mode, XP, guided modules, YouTube data,
research contexts, source file) **plus the fields that never got submitted**
(`field1`/`field2`/`field3`, `selectedPreset`, `reflection`) and the
`currentActivityIndex` that says which stage they are. `saveStageDraft` stamps
`savedAt` itself, so a caller cannot hand in a stale age.
2. **The reader is the guard - `loadStageDraft` returns work or `null`.** An
unparseable record, a non-record, a missing/empty `activities` array, a stamp
older than seven days, or an unreadable stamp all read as "nothing to resume";
so does a record that holds neither unsubmitted typing nor a submitted response
(`stageDraftHasProgress`). Everything is coerced rather than trusted, so a
half-written or hand-edited record degrades to `null` instead of throwing inside
a render - the same posture as `coerceSavedSchema` (defect 25) and the settings
stamp reader (defect 36). A draft in the future (clock skew) is fresh, not stale.
3. **The write lives in `hooks/useSession.ts`, over the session's own state.**
One effect turns the reducer's state into the draft and schedules it **300 ms**
after the last change, so stopping to think is already saved and a burst of typing
is one write. A second effect flushes the latest draft on `pagehide`, because a
reload can otherwise land inside the debounce window - and the spec proves the
debounced write itself lands, not just that the unload rescue does. Nothing typed
and nothing submitted clears the record instead of accumulating an empty workbench;
`resetSession` and both completion paths in `app/page.tsx` (final Submit and final
Skip, where the session becomes a `SavedSchema`) clear it too, so a finished
session cannot be offered back.
4. **`restore_draft` hydrates the live fields verbatim.** The reducer action sets
`appState: 'encoding'` and takes `field1..3`/`selectedPreset`/`reflection` from the
draft directly - deliberately **not** through `applyLoadedStage`, which only knows
submitted responses, and the point of the draft is exactly what was never
submitted. The stage index is clamped into the activities array. The launchpad
renders `[ ▶ STAGE RECOVERED ]` (`data-testid="stage-draft-banner"`) naming the
stage number, with **Resume stage N** and a **Discard** that drops the record.

### 23.2 Verified

- **The store (unit, `tests/unit/stage-draft.test.ts`, 18 tests, happy-dom).**
Round-trip of the live typing and the session it belongs to; the writer stamps
what it hands in; corrupt records (bad JSON, a bare string, an array, `null`) read
as nothing; an empty `activities` array is refused; activities without ids are
dropped; a hand-edited record is coerced rather than trusted; freshness at the
window edge, at a future stamp, and for every unreadable stamp shape; clearing;
and the recoverability rules (whitespace-only typing is not typing; a stage already
submitted this session is progress; a looked-at-but-untouched stage is not).
- **The reducer (unit, `tests/unit/sessionReducer.test.ts`, +5 tests, 22 in the
file).** `restore_draft` lands in `encoding` with the unsubmitted fields intact,
restores the session around them, clamps an out-of-range stage index, and starts
with empty undo/redo stacks.
- **The browser (`e2e/stage-draft.spec.ts`, 2 tests, live preview).** Type two
paragraphs into stage 1, then **poll localStorage to prove the debounced write
landed before the reload** - surviving on an unload flush alone would not be the
same guarantee; reload; assert the banner names stage 1 and says the unsubmitted
work is still there; click **Resume stage 1**; assert both fields carry the typed
text word for word. The second test is the negative control: walk the whole
workout to completion, reload, and assert the banner has count **0** - a finished
session must not be offered back as a half-finished stage.
- **The spec is load-bearing, and this round has the receipt.** The first browser
run failed against the real page with `stageDraftHasTyping is not defined` - the
banner's copy helper was used without being imported. The unit suite and the store
tests were green with that hole in place; the browser spec is what caught it, which
is why the reload assertion is run against the app rather than only against the
store.
- **Neighbours:** the full unit suite is green (85 files, 1409 tests),
`bunx tsc -b --noEmit` is clean, and the draft's own `pagehide` flush does not
disturb the existing flows (the YouTube and lab paths keep their own checkpoints,
untouched).

### 23.3 What the draft deliberately is not

- **Not a session save.** The draft never becomes a `SavedSchema` and never touches
the library, the cloud or the drawer: it is a device-local checkpoint that exists
to be either resumed or dropped. It expires after seven days, and the launchpad
shows nothing rather than a resume button into an empty workbench.
- **Not a second writer of anything else.** `lib/storage.ts`'s documented-but-dead
`debouncedSaveSchema`/`autosaveTimer` (finding 38) was left exactly where round 17
found it *by this round*; round 22 then wired that path for real (§24), and the
draft's own debounce still lives in `useSession`, over the draft record only.
- **No new cross-device surface.** A draft belongs to the device it was typed on,
as `localStorage` states - which is what keeps it synchronous on first paint.

**Total: 37 distinct defects in 49 files** (37 is the first in `lib/stage-draft.ts`;
`hooks/useSession.ts` was already counted by defect 4, and `app/page.tsx` by
several earlier rounds. The three test files added - `tests/unit/stage-draft.test.ts`,
`tests/unit/sessionReducer.test.ts` and `e2e/stage-draft.spec.ts` - are counted as
files, following defect 30's precedent.)

## 24. Round 22 - defect 38, the autosave that was described and never wired

Round 17's fifth finding, fixed and pinned. It is the P4 of the set because
nothing was corrupted: what was wrong is that the documented cadence did not
exist. `saveSchemaToHistory` called `saveSchemaToIDB` directly on every save,
while the README and `lib/storage/index.ts` both described a "debounced
autosave" - and the helper behind that claim, `debouncedSaveSchema` with its own
module-level `autosaveTimer`, had **zero callers**. Round 17 left the choice open
between wiring it and deleting it; this round wired it, because the write it
guards is the expensive one.

### 24.1 What the write costs, and what the debounce now is

- **The heavy half is named in the code**: `saveSchemaToIDB` puts one record and
then re-reads the whole store to re-mirror it into localStorage
(`mirrorSchemasToLocalStorage(await getAllSchemasFromIDB())`). The paths that save
repeatedly are the ones the debounce is for: the YouTube workout saves a schema
per stage (`app/page.tsx`), a completion save follows the stage-boundary save, the
cloud-download path re-saves every remote schema (`lib/auth-context.tsx:197`) and
`restoreBackup` re-saves every imported record (`lib/backup.ts:213`).
- **One queue, one trailing timer.** `saveSchemaToHistory` writes the mirror
synchronously and queues the IndexedDB hop in `pendingSchemaIdbWrites`, keyed by
schema id: repeated saves of one schema collapse to a single write of the NEWEST
record, and a burst of distinct schemas goes out in one flush. The window is
`IDB_AUTOSAVE_DELAY_MS` (1000 ms), exported and the only place it is defined.
- **The page cannot outlive the queue.** `flushPendingSchemaWrites` is exported and
bound once - on the first queued write, so nobody pays for it until it is used - to
`pagehide` and to `visibilitychange` when the tab goes hidden. `deleteSchemaFromHistory(id)`
drops a queued write for that id (otherwise the write scheduled *before* the removal
would land *after* it and resurrect the row) and `clearAllSchemas()` drops the whole
queue and disarms the timer.
- **The dead helper is gone, not left beside its replacement.** `debouncedSaveSchema`
is deleted - the same class as defect 30, an export that reads as a live mechanism.
- **The limit, stated in the code and here.** A transaction *started* during unload
is not guaranteed to commit if the process is killed, which is why the mirror is
written first and is the store that never waits. Recorded as well, because it is
how this round nearly fooled itself: `initIndexedDB` migrates a non-empty mirror
into an empty `schemas` store on boot, so a reload has a second net under it - the
first version of the browser spec passed with the `pagehide` binding removed, i.e.
it credited the flush with what the boot migration had done.

### 24.2 Verified

- **The behaviour (unit, `tests/unit/idb-autosave.test.ts`, 16 tests, happy-dom).**
`@/lib/db` is mocked so the question is *when* the write is attempted: the mirror is
written immediately and IndexedDB not; the write lands exactly at
`IDB_AUTOSAVE_DELAY_MS` and not a millisecond before; a burst on one id is one write
of the newest record; a steady stream of saves restarts the window and is still one
write; distinct ids go out together; a save after a flush schedules a fresh window;
flush-on-demand writes and disarms the timer (no second write); flush on `pagehide`;
flush when the tab goes hidden and not when it comes back; an empty queue is a no-op;
a queued write for a deleted id is dropped while the delete still reaches IndexedDB;
the queue is dropped on a clear; and a schema re-saved after a delete still writes.
- **The claim (same file, 3 source-scan tests).** `lib/storage.ts` no longer defines
`debouncedSaveSchema`; it does name `IDB_AUTOSAVE_DELAY_MS`,
`flushPendingSchemaWrites`, the `pagehide` binding and the hidden-tab branch; and the
README names the window and the flush. That is the half of the finding that was
about the *description*, and it is pinned so the two cannot drift apart again
silently - the way they did in the first place.
- **Mutation-proven.** Writing immediately instead of arming the timer - the pre-fix
behaviour, verbatim - fails **8 of the 16** tests, including every window and
coalescing assertion. Reverted, re-run green.
- **The browser (`e2e/idb-autosave.spec.ts`, 2 tests, live preview).** The first
finishes a session, asserts the row is absent from the real `schemas` store, then
dispatches a real `pagehide` and asserts the row appears with **less than the
window** elapsed since the save was stamped - measured on the page's own clock, so
the timer cannot have been the writer. The second finishes a session moments before
a reload and asserts both stores still hold it and the drawer still lists it.
- **Mutation-proven in the browser too, which is how it was found.** With the
`pagehide` binding removed the row appeared at **1013 ms** and the spec failed on
`expected 1013 to be less than 1000` - that is the timer reported as the writer, and
it is the assertion this spec exists for. The first draft of the same file passed
under that mutation, because the boot migration had written the row after the
reload; the spec was rewritten around the in-window measurement rather than the
reload.
- **Neighbours, since every save now goes through the queue.** The full unit suite is
green (86 files, 1425 tests), `bunx tsc -b --noEmit` and `bunx eslint` are clean, and
the save path's own browser specs still pass: `e2e/schema-library-tabs.spec.ts` (the
cross-tab save/delete coherence of defect 28 - the closest neighbour),
`e2e/share-history.spec.ts` (drawer, resume, analytics) and `e2e/stage-draft.spec.ts`
(round 21's draft write, which never touches this queue).

### 24.3 What the debounce deliberately does not change

- **Nothing a reader sees.** The mirror is written first and synchronously, so
`loadSavedSchemas`, the drawer, the resume paths and `mergeSchemaLists` are
unchanged: the queue decides only when the *fuller* store catches up.
- **Nothing about deletes.** A delete is still synchronous to the mirror and
immediate to IndexedDB; the queue only learns to drop its own pending write for that
id, which is what keeps the tombstone work of defect 28 intact.
- **Nothing about the other writers.** Settings, study prefs, the usage ledger and
round 21's stage draft keep their own synchronous writes; this queue is only the
`schemas` store's IndexedDB hop.

**Total: 38 distinct defects in 52 files** (38 is the first in `lib/storage/index.ts`,
whose comment carried the same claim as the README; `lib/storage.ts` was already
counted by defects 25, 28 and 36, and `README.md` by defect 28. The two test files
added - `tests/unit/idb-autosave.test.ts` and `e2e/idb-autosave.spec.ts` - are counted
as files, following defect 30's precedent.)

## 25. Round 23 - defect 39, the badge that could not move

Round 17's last finding, fixed and pinned. It is the P4 that closes the list, and it
was left where round 17 put it - *not* a wrong number, but a number that could not
change: `pendingLocalCount` was a `useMemo` over `[user, cloudSchemas, hydrated]`
whose value came from `loadSavedSchemas()`, a module-level cache none of those three
dependencies move with. Saving a schema therefore left the badge on the count it
captured at mount. It is the only signal that local work has not reached the account,
so the failure mode reads as "nothing pending" exactly when something is.

### 25.1 What the count now reads, and why it is a subscription

- **The value comes from a source that announces itself.** `lib/auth-context.tsx` now
holds the library in state (`localSchemas`), hydrated once on mount and then updated
by `subscribeToSavedSchemas` - the same subscription `useSchemaLibrary` gives the
drawer - so every write moves it, including a write made by another tab (the
`storage` event reaches this listener). The count is then the derived difference it
always claimed to be: the whole local list when nobody is signed in, and the local
list minus the account's ids when somebody is.
- **The hydration shim is gone with the memo it served.** The old code needed
`useSyncExternalStore` to know when it could read localStorage during render;
"can I read the store" is no longer a question the render asks. The first paint is
an empty library and the effect fills it in, which is the same server-safe first
paint `useSchemaLibrary` already documents for its own count.
- **The count is on the badge's face, not only in its tooltip.** The number used to
appear only inside the button's `title`, where a value that cannot update is also a
value nobody can watch. The masthead now reads `Cloud: OFF · 2 local` (or
`Cloud: SYNCED · 2 local`), so the pending work is visible at a glance, in the
accessible name of the control as well as on screen, and a test can assert it as the
person reads it.

### 25.2 Verified

- **The count itself (unit, `tests/unit/auth-context-pending-count.test.tsx`, 3
tests, happy-dom; Firebase mocked at the SDK boundary, so this is about what the
number derives from).** Signed out: the badge starts at 0, a save moves it to 1 and
then 2, and deleting one of them takes it back to 1 - with no sign-in, no snapshot
and no other interaction. Signed in: two local records and an account that knows one
of them reads 2 → 1 as the account's copy arrives, back to 2 when a new schema is
saved locally, and down to 0 once the account holds everything, which is the
"nothing pending" state the badge exists to report honestly. Third test: a device
that already holds schemas counts them, no account involved.
- **Mutation-proven.** Restoring the pre-fix memo verbatim (the memo over
`[user, cloudSchemas]` reading `loadSavedSchemas()`) fails **all three** tests, with
`expected '0' to be '1'`, `expected '1' to be '2'` and `expected '1' to be '2'` -
the stale count, stated as an assertion failure. Reverted, re-run green.
- **The badge, in the browser (`e2e/pending-badge.spec.ts`, 2 tests, live preview).**
The first drives a real workout to completion and asserts the badge goes
`Cloud: OFF` → `Cloud: OFF · 1 local` with no reload in between, then deletes that
schema from the drawer and asserts it returns to `Cloud: OFF` - the count follows the
library down as well as up. The second boots a device whose localStorage mirror
already holds two schemas, asserts `Cloud: OFF · 2 local` before any interaction, and
`Cloud: OFF · 3 local` after a session saves a third. Both assert the Library
button's own count beside the badge, so the two readings of the same library cannot
disagree silently.
- **Mutation-proven in the browser too.** With the pre-fix memo the first spec fails
after the save on `Expected "Cloud: OFF · 1 local", Received "Cloud: OFF"` - which is
the defect as the learner saw it, on screen. Reverted, re-run green.
- **Neighbours.** Full unit suite green (87 files, 1428 tests), `bunx tsc -b --noEmit`
and `bunx eslint` clean on the changed files, and the specs around the same surfaces
still pass: `e2e/schema-library-tabs.spec.ts` (two tabs, one library),
`e2e/share-history.spec.ts` (drawer, resume, analytics, seeded schemas) and
`e2e/history-drawer-legacy.spec.ts` (the malformed-record drawer) - 12 tests in one
run, after an earlier run of the same set failed with `ERR_CONNECTION_REFUSED`
because the preview server had stopped; that run is not evidence of anything about
this change, which is why it was repeated against a server that was up.

### 25.3 What the count deliberately is not

- **Not a per-schema "seen" flag.** The badge answers "what has not reached the
account", which is what the tooltip, the sign-in prompt and the analytics copy all
already claimed. Nothing in the schema record tracks whether a learner has opened it,
and inventing that flag would have produced a second, disagreeing source of truth for
the same screen.
- **Not emptied optimistically.** A successful write is what removes a schema from the
count - the account's own snapshot delivering it - so a failed push leaves the number
standing rather than clearing a warning that is still true.

**Total: 39 distinct defects in 54 files** (39 is the last of round 17's findings;
`lib/auth-context.tsx` was already counted by defect 36 and `app/page.tsx` by defect
37, while the two new test files - `tests/unit/auth-context-pending-count.test.tsx`
and `e2e/pending-badge.spec.ts` - are counted as files, following defect 30's
precedent.)

## 26. Round 24 - reconnaissance: the surfaces this audit never opened

This round changes no code. Round 17 (§19) swept the *surfaces* the first sweep had not
reached; this one sweeps the **modules this report has never named**, which is a
different list and a smaller one. The target list was not guessed: every file under
`lib/`, `hooks/` and `app/api/` was checked against the text of this report, and the
modules with **zero mentions** are the ones read closely - `lib/google-drive.ts`,
`lib/comparative-synthesis.ts`, `lib/monitoring.ts`, `lib/ai-hardening.ts`,
`lib/triage.ts`, `lib/presets.ts`, `lib/media-types.ts`, `lib/utils.ts`,
`lib/encode-stream.ts`, `lib/forge-stream.ts`, `lib/json-repair.ts`,
`hooks/useInputSource.ts`. Two of the three findings below are in that set; the third
was found by the second half of the sweep, described in §26.1.

### 26.1 How the sweep ran, and what each pass returned

- **Read-first, as always**, on the forty-odd files the report had never named: the
  call site and the contract around it, not a grep hit.
- **Then a mechanical pass for this audit's own recurring class** - `export function
  f` with no caller outside its file. It split the results honestly into three
  buckets. *(a) Harmless:* type declarations, and small units whose only consumer is
  their own test (`allocateSeconds`, `auditAnkiCard`, `classifyPacing`,
  `sessionReducer` - each reached in production through a larger function in the same
  module). *(b) Export-shaped helpers nothing uses at all* (`useIsMobile`,
  `getDifficultyLabel`, `clearInterferenceTraps`, `parseCausalFrame`): dead code, not
  filed, because nothing describes them as a live mechanism and no caller is misled -
  which is the line defects 30 and 38 both fell on the other side of. *(c) A whole
  described feature with no caller* - findings **42** and **43** below, which is the
  reason this mechanical pass was worth running a second time.

### 26.2 Findings

| # | Priority | Finding | Location | Evidence |
|---|---|---|---|---|
| 40 | **P3 - low/medium. FIXED in round 26 (§28)** | The AI call's deadline does not abort the call it gave up on. `withTimeout` is documented in its own module header as an "AbortSignal-backed deadline that rejects instead of hanging", but there is **no `AbortController` and no `AbortSignal` anywhere in `lib/ai-hardening.ts` or `lib/ai-client.ts`** - the wrapper races a timer against the promise and rejects, and the `fetch` it abandoned keeps running. It is worse than a leaked request because of where it sits: `fetchJsonWithRetry` treats a timeout as retryable (`isRetryableError` returns true for `AiTimeoutError`), so after the 90s deadline expires it starts a **second** attempt against the same provider while the first is still in flight, and a third after that - three concurrent copies of one generation, each one billed. The learner sees a long, apparently stuck wait and pays for the copies. | the claim: `lib/ai-hardening.ts:10`-`:11`; the wrapper: `:30`-`:50`; the retry loop that makes a timeout a second concurrent call: `:95`-`:120`, with `isRetryableError`: `:74`-`:90` | Read from the code, and deterministic: the `fetch` is passed straight into `withTimeout` with no signal, and `init` is the caller's object - neither `withTimeout` nor `fetchJsonWithRetry` ever touches a signal. **Proof for the fix:** thread an `AbortController` through `withTimeout` and abort it in the timer (and, where the caller already has a controller - `app/page.tsx`'s Cancel - compose the two signals), then a unit test with a `fetch` stub that records its signals: after the deadline, the stub's signal is `aborted`, and the retry does not begin before the previous attempt has stopped. `tests/unit/ai-hardening.test.ts` already pins the rejection itself, which is why this half survived it. |
| 41 | **P4 - low. FIXED in round 27 (§29)** | A file chosen before the hydration read resolves is replaced by the previous session's upload - or silently never saved. The hook's own comment says the persist effect is "skipped until the hydration read completes so the initial null doesn't overwrite the stored upload", and that guard covers exactly one case: the mount-time `null`. A file the **learner** picked is not covered, because `readIdb`'s callback calls `setUploadedFile(stored)` unconditionally, and the persist effect has already run (with `hydratedRef.current` still false) by the time the pick happened. So the next tick overwrites the fresh pick with the stored one, and nothing re-runs the write for what the learner actually chose. | `hooks/useInputSource.ts:33`-`:59` (the hydration read, the unconditional `setUploadedFile(stored)`, and the persist effect's `if (!hydratedRef.current) return`) | Read from the code; the window is the IndexedDB read, and the first run is the slow one because `initIndexedDB` performs the one-time localStorage→IndexedDB migration of an existing history. **Reachability, stated honestly:** it needs the read to outlast the pick (a large existing history, a cold or blocked store), so this is a narrow window rather than a everyday failure - but within it the outcome is silent, which is the part that makes it worth fixing. **Proof for the fix:** a hydration ref already exists in this hook for the same purpose (`sourceTouched`); guard the assignment the same way and let the persist effect run once it flips, then a unit test that resolves the read *after* a pick and asserts the pick is what is stored. |
| 42 | **P2 - medium. FIXED in round 25 (§27)** | **The offline fallback is described in three places and wired in none.** `lib/services/offlineGenerator.ts` holds a complete deterministic workout generator ("Deterministically generates a rich 5-Stage Cognitive Workout ... offline"), it is unit-tested, and **no production code calls it** - not `app/page.tsx`'s generate path, not `lib/ai-client.ts`, not any route. `hooks/useSettings.ts` computes `isOffline` from a `useSyncExternalStore` subscription to `online`/`offline` and **no consumer reads it**. And the README advertises the feature twice ("installable, with an offline fallback generator when you have no network/key"; and, in the E2E list, a spec for it), while `e2e/resilience.spec.ts` - the spec that covers exactly this - opens its own header with "generation API errors fall back to the offline generator" and then asserts the **opposite**: its first test is named "API 500 on `/api/encode` alerts the user rather than producing fake cards" and expects an alert dialog. So the code, the README and the spec's own docstring disagree, and a learner with no network gets an error dialog rather than the offline workout the README promises. **Which side is wrong is a product decision, and the finding is the disagreement:** the resilience spec's title reads like a deliberate later decision (never fabricate cards), in which case the README, the module's header and the spec's header all need correcting - or the fallback is the intended behaviour and wants wiring. | `lib/services/offlineGenerator.ts:48`-`:52` (the export and its docstring); the unused subscription: `hooks/useSettings.ts:27`-`:29`, `:47`; the promise: `README.md:62`, `README.md:116`; the contradiction: `e2e/resilience.spec.ts:5`-`:9` vs its first test at `:16`-`:31` | Read from the code and countable: `grep -rn "generateOfflineWorkout" app components hooks lib` returns only the unit test, and `grep -rn "isOffline" app components hooks lib` returns only its own definition and the object it is returned in (`resilience.spec.ts` is the only spec that mentions the fallback at all, and it asserts the alert). **Proof for the fix:** whichever direction is chosen, the other two artefacts move with it - wire it (and add the spec the README's E2E list already claims, asserting the offline workout's stages offline) or delete the module and correct the three claims, with a source-scan test pinning the README's wording to the code the way defect 38's round pinned its own. |
| 43 | **P3 - low/medium. FIXED in round 30 (§32)** | **Teach Me's deterministic fallback builder has no caller either.** `lib/services/teachLesson.ts` exposes `buildFallbackLesson` under a header that says "Deterministic offline fallback", and `app/page.tsx`'s own comment on the mount says Teach Me is "AI-authored, **with an offline schema-based fallback**" - but only `sanitizeLesson` is imported by `components/TeachMeModal.tsx`, whose failure path is a `catch` that reports the error. A lesson request that fails therefore has no lesson, which is the case the builder exists for; the module's header states the intent, the UI comment states the behaviour, and nothing joins them. | `lib/services/teachLesson.ts:395`-`:399` (the section header and the export); the only import: `components/TeachMeModal.tsx:19` (`sanitizeLesson`); the claim: `app/page.tsx:2577`-`:2579`; the failure path with no fallback: `components/TeachMeModal.tsx:245`-`:262` | Read from the code: `grep -rn "buildFallbackLesson"` returns the definition and nothing else, in production or in tests. Same class as 43 and as defect 38 - a mechanism whose only reader is a comment - but narrower, because Teach Me is one sheet rather than the primary generation path. **Proof for the fix:** wire it into that `catch` (the builder takes the same scope/topic the modal already has), then a spec that fails `/api/teach` and asserts a lesson still renders, with the deterministic sections named. |
| 44 | **P4 - low. FIXED in round 31 (§33)** | The shared body-validation guard is applied to **5 of 27 routes**. `lib/api-validation.ts` exists, states its purpose ("make impossible input impossible", no 10MB string as `notes`, bounded file assets) and is imported by `encode`, `encode/stream`'s neighbours `evaluate`, `forge`, `teach` and `youtube` - while the other 22 handlers call `await req.json()` and destructure, including routes that take the **same free text the guarded route bounds**: `/api/triage` (`{ text }`) and `/api/roast` (`{ notes }`) are handed the learner's `rawNotes` by the same UI that gets a clean 400 from `/api/encode` for a paste that is too large. Two consequences, both visible: an oversized paste is sent to a paid provider call instead of being refused with the guard's message, and malformed JSON throws out of `req.json()` into the route's own catch - a 500 rather than the guard's "Request body must be valid JSON." | the guard: `lib/api-validation.ts:1`-`:25` (`parseRouteBody` at `:136`); guarded: `app/api/encode/route.ts`, `evaluate`, `teach`, `youtube`, `forge`; unguarded, same free text: `app/api/triage/route.ts:47`, `app/api/roast/route.ts:60` (and the other 20 in the sweep's list) | Read from the code, and countable: `grep -l api-validation app/api/*/route.ts` names five files, `ls app/api` names twenty-seven. **Proof for the fix:** one schema per remaining route (they are all a handful of fields), then a test per route that a wrong-typed body gets a 400 naming the field, the way `tests/unit/forge-route.test.ts` already does for the forge. This is breadth rather than a single line, which is why it is last. |

### 26.3 Checked and cleared in this pass

Recorded so the next round does not re-derive it. Each was a candidate going in and is
correct in the code as it stands:

- **`lib/google-drive.ts` handles the Docs-editor case the picker creates.** `driveDownloadTarget`
  routes `application/vnd.google-apps.*` through `/export?mimeType=` (with a per-type
  format table) and everything else through `alt=media`, labels the asset with the type
  those bytes really are, and reports the API's own error text when the export is
  refused - the 403 `fileNotDownloadable` shape a Slides deck used to fail with.
- **Sentry is genuinely wired, not a described mechanism.** `initSentry` is called from
  `components/MonitoringInit.tsx:17`, and `captureAiError` has four live call sites in
  `lib/ai-client.ts` (`:341`, `:354`, `:368` …) plus `/api/metrics`. Both are no-ops
  without a DSN, which is the documented behaviour.
- **The lab history's bounded cache and its account mirror agree on their limits.**
  `syncToyProgressWithCloud` merges to the **cloud** cap and compares against what the
  device would keep, so a 2,000-snapshot account does not re-report a merge on every
  sign-in; `saveToyProgressStore` then writes with the local cap. The comment above
  `TOY_PROGRESS_LIMIT` describes exactly this split.
- **`lib/chapters.ts` counts what it says it counts.** "Encoded" is submitted wording or
  an examiner grade on wording that was typed, never a timer or a watch position, and a
  `skipped` stage is explicitly not encoded.
- **`lib/triage.ts` fails safe in both directions.** An unknown verdict degrades to
  `kernel` rather than `noise`, out-of-range indices are ignored, and `stripNoise`
  returns the original source if everything came back as noise.
- **`saveStudyPrefs` merges rather than replaces**, which is what makes the two writers
  in `useInputSource` safe: the tab effect writes only `activeTab` and the toggle effect
  writes only the toggles, and neither erases the other's fields.
- **The stage draft's debounce is closed.** The 300ms timer is cleared in the effect's
  own cleanup and its handle nulled before each reschedule, the ref is dropped when the
  session leaves `encoding`, and the `pagehide` flush covers the reload race (§23).
- **`lib/audio.ts`'s fire-and-forget chimes cost nothing to leave alone.** The module is
  a singleton with no React state and no listeners; a scheduled note after a transition
  is inaudible, and `playBeep` swallows a blocked context by design.

### 26.4 Priority order, and what this round deliberately did not do

Fix order as round 24 filed it: **42** (a feature the README sells and the code does not have, and the only one
of these a learner meets on their first offline session) - **fixed in round 25 (§27)**, so the order
now starts at **40**; then **40** (it spends the
learner's money on copies of a call the app has already abandoned), then **43** (the same
class as 42 in one sheet), then **41** (a silent overwrite in a narrow window), then **44**
(breadth, cheap per route but twenty-two of them). Nothing was changed in this round - its
output is a ranked list with a stated proof for each, the way round 17's was - so the
running total of defects stays at **39**, and findings 40-44 are candidates until a round
fixes one. **All five have since been fixed - 42 in §27, 40 in §28, 41 in §29, 43 in §32 and
44 in §33 - so this round's list is closed.**

## 27. Round 25 - defect 42, the offline fallback that was described and never wired

Round 24's first finding, fixed and pinned. The README advertised an "offline fallback
generator when you have no network/key", `lib/services/offlineGenerator.ts` held a
complete deterministic generator, `hooks/useSettings.ts` subscribed to the browser's
`online`/`offline` events - and **nothing joined them**: `generateOfflineWorkout` had no
production caller, `isOffline` had no consumer, and the one spec that mentioned the
fallback asserted the opposite in its own first test ("alerts the user rather than
producing fake cards"). A learner with no connection got an error dialog.

### 27.1 The decision, and where it was made

- **The call was to implement, not to delete**, because the machinery was already

there and the behaviour it promises is the one a learner needs: the three artefacts
that disagreed now agree, with the code moved rather than the claim.
- **One predicate owns the choice.** `shouldFallBackToOffline({ isOffline, error })`
returns true when the browser already knows there is no connection, or when the
attempt failed because the connection is what went missing
(`isConnectivityFailure`, matched on the failure's own wording - "Failed to fetch",
"Load failed", `ERR_INTERNET_DISCONNECTED`, "The network connection was lost" - and
never on the error's class). It is extracted so both directions can be tested without
a browser, and so the launchpad has exactly one line that decides.
- **The boundary it protects is the point.** A server that *answered* with an error is
not a lost connection: the 500 still alerts and still produces no cards, which is what
`e2e/resilience.spec.ts` has pinned since the defect-34 round. The fix deliberately does
not turn a provider outage into an invented workout.
- **Two ways in, both wired.** Before the attempt: the notes/file branch short-circuits
before `setAppState('loading')`, so an offline Generate makes **no request at all** - no
abort controller, no in-progress flag, nothing spent. Mid-request: the existing `catch`
consults the same predicate before it alerts, so a tunnel, a dropped wifi or a sleeping
laptop lands in the same place instead of being reported as a schema failure.
- **The learner is told which way the workout was made.** A notice above the state switch
(`data-testid="offline-fallback-banner"`, `role="status"`) carries
`data-connectivity` (offline/online, live) and `data-workout-origin`
(model/offline/connection, a property of the session). Offline it says the model will not
be the one reading the notes; afterwards it says this workout was built here, and stays
saying so after the connection returns - because it was. It is dismissible, as the
interrupted-generation notice is.
- **Honest about what the fallback is.** Five deterministic template stages built from
the device's own text, marked as such in the topic ("… (Offline Schema Workout)"), worth
**60 XP against the model's 100** - the same work, less of the generation effect - and it
produces none of the model-authored extras (no guided path, no research contexts). A
model-written schema clears the origin flag, so the notice never outlives its session.

### 27.2 Verified

- **The decision (unit, `tests/unit/offline-fallback.test.ts`, 13 tests).** The classifier
in both directions: the seven wordings a browser or runtime uses when the request never
landed, against the refusals it must not swallow (a provider error, a 500 body, "Invalid
schema format", a JSON `SyntaxError`, an `AbortError`, nothing thrown). The predicate over
both inputs, including that a cancel does not fall back. The generator's payload contract
the workbench relies on: five `offline-stage-N` activities with the labels, placeholders,
preset options and visual data a stage needs to be answerable, determinism, and a hidden
template staying hidden. And the wiring itself, scanned at the source the way
`xp-timer-cleanup.test.ts` scans its timer: the import, `isOffline` read from `useSettings`
(and still published there, listener included), **both** call sites, the real
`generateOfflineWorkout(rawNotes, encodingMode, …)` call rather than a stub, the alert
that survives for a server that answered, the banner and its two attributes, the notice
rendered above the state switch, and the origin flag being cleared by a model-written
schema.
- **The behaviour (browser, `e2e/resilience.spec.ts`, 3 new tests, live app).** With no
connection at the moment Generate is pressed: the notice reads `data-connectivity="offline"`
before the click and `data-workout-origin="offline"` after it, the workbench shows
**`01/05`** (the generator's five stages; the mocked payload has two), the mocked payload's
placeholder is absent, and **zero** requests reached either encode route. A connection
aborted mid-request (`route.abort('internetdisconnected')`) falls back with
`data-workout-origin="connection"`. And the round trip: reconnecting flips
`data-connectivity` to `online` while the session keeps its origin, dismissing clears the
notice, and the next generation is the model's again (`STAGE1_FIELD1_PLACEHOLDER` back,
`01/05` gone, no notice).
- **Mutation-proven.** With both call sites replaced by `if (false as boolean)` - the
pre-fix behaviour, verbatim - **all three** browser tests fail, the first on
`Expected: "offline", Received: "model"` for `data-workout-origin`, which is the defect
stated as an assertion. Under the same mutation 1 of the 13 unit tests fails (the wiring
guard that names both call sites); the decision and generator tests are independent of the
wiring by construction. Reverted, re-run green.
- **One existing test changed, deliberately.** `e2e/encode.spec.ts`'s "Offline resilience"
test pinned the alert ("going offline after load informs the user with an alert"). That
alert is exactly what this round removes, so the test now asserts the fallback - no dialog
was raised, `01/05` is on screen, the origin attribute says `offline` - with the reason
for the change written in the test. Nothing else in the suite asserted the old behaviour
(`grep setOffline e2e/`), and the alert that remains (a server that answered) is still
pinned in `resilience.spec.ts`.
- **Neighbours.** Full unit suite green (88 files, 1441 tests), `bunx tsc -b --noEmit` and
`bunx eslint` clean, and the generation specs whose flow this touches all pass:
`e2e/resilience.spec.ts` (9, including the 500-still-alerts test), `e2e/encode.spec.ts`
(5), `e2e/encode-stream.spec.ts` (3, including the one asserting the streamed payload
"produced the real workout, not the offline fallback"), `e2e/stage-templates.spec.ts`,
`e2e/idb-autosave.spec.ts` and `e2e/stage-draft.spec.ts`.

### 27.3 What it deliberately does not do

- **No fallback for the YouTube path.** A transcript is the network; with no connection
there is nothing on the device to build chapters from, so that path keeps its honest alert.
The wired fallback is the notes/file one, which is the one the README advertised.
- **No service worker.** §19.3's remaining gap stands: a learner who is offline *before*
the page loads still gets the browser's error page, because nothing caches the app shell.
This round made the in-page claim true; it did not add an offline app.
- **Not a second encoder.** The fallback never guesses at model output, never invents
content beyond templates derived from the learner's own text, and says on screen that it
did so - which is why the "no fake cards" rule survives it intact.

**Total: 40 distinct defects in 56 files** (40 is the first in
`lib/services/offlineGenerator.ts` - the module that carried the generator and the unused
marker, and did not count while the finding was open - and the round's new unit file,
`tests/unit/offline-fallback.test.ts`, is counted as a file, following defect 30's
precedent. `app/page.tsx` (defect 37), `hooks/useSettings.ts` (named by round 24's row 42),
`README.md` (defect 28) and the two browser specs were already named by earlier rounds; only
`e2e/encode.spec.ts`'s offline test changed its assertion rather than being added to.)

## 28. Round 26 - defect 40, the deadline that did not abort the call it gave up on

Round 24's second finding, fixed and pinned. `lib/ai-hardening.ts`'s own module header
described `withTimeout` as an "AbortSignal-backed deadline" and the module contained **no
`AbortController` at all**: the timer raced the promise and rejected, and the `fetch` (or the
Gemini SDK call) it had given up on kept running. The retry loop made it worse rather than
better - `isRetryableError` returns true for `AiTimeoutError`, so 90 seconds into a
generation the loop started a **second** attempt against the same provider while the first
was still in flight, and a third after that: three concurrent copies of one generation, each
billed, while the learner watched an apparently stuck wait.

### 28.1 The mechanism, and what it reaches

- **The deadline owns a controller now, and aborts before it rejects.** `withTimeout` takes
  either a promise (unchanged for a caller that has nothing to cancel) or a factory
  `(signal) => Promise<T>`; in the factory form it creates an `AbortController`, starts the
  work with `controller.signal`, and on the deadline calls `controller.abort()` **before**
  rejecting. The ordering is the point: `AbortSignal` dispatches `abort` synchronously, so by
  the time the caller's `catch` runs the transport is already cancelled and its abort
  listeners have already run - which is what makes the retry a *successor* rather than a
  *twin*.
- **The signal reaches the transport, both ways in.** `fetchJsonWithRetry` builds each
  attempt as `fetch(url, { ...init, signal })`, and the Gemini branch passes the same signal
  into the SDK's own `config.abortSignal` (`@google/genai` 2.20.0). A timed-out call is
  cancelled at the layer that was still holding the connection open.
- **The deadline now covers the whole attempt.** It used to wrap the `fetch` alone, so the
  body read - which *is* the model's answer - sat outside any deadline. Each attempt now
  returns a discriminated outcome (`ok` with the parsed body, or `http` with the status and
  the provider's own text) from inside the deadline, so a stalled response body is cut too.
- **A caller's signal composes with the deadline.** `withTimeout`'s optional fourth argument
  (and, for `fetchJsonWithRetry`, the standard `init.signal`) drives the *same* controller,
  so a cancel and a timeout both reach the transport, and a cancel is reported as the
  transport's `AbortError` rather than being rewritten as a timeout. An already-aborted
  caller signal starts the work already cancelled.
- **Retry behaviour is unchanged where it should be.** A timeout is still retryable, a 503 is
  still retried after backoff, a 401 still throws `ApiHttpError` without retrying, and the
  Gemini ladder still steps down on a deadline. The difference is that each of those now
  happens after the previous attempt has stopped.

### 28.2 Verified

- **The abort (unit; 6 new tests in `tests/unit/ai-hardening.test.ts`, 1 in
  `tests/unit/ai-client.test.ts`).** `withTimeout` hands the work a signal, and that signal is
  `aborted` when the deadline passes - with the `abort` event observed firing, not just the
  flag; the signal is left untouched when the work beats the deadline; a caller's
  `AbortController` aborts the work and the rejection is an `AbortError`, not an
  `AiTimeoutError`; an already-aborted caller starts cancelled. `fetchJsonWithRetry` is driven
  through a stubbed `fetch` that records the signal it was handed and only settles when
  aborted: after the deadline **all three** attempts' signals are `aborted`, each attempt
  stopped before the next began (`[1, 2, 3]`), and **`maxInFlight` is 1** - the defect stated
  as one number. A caller's `init.signal` cancels the request and costs exactly one call. The
  Gemini test drives the real ladder on fake timers: four rungs, four signals, all `aborted`,
  each rung stopped in ladder order before the next started, `maxInFlight` 1.
- **Mutation-proven.** With the single `controller.abort()` line removed from the deadline's
  timer - the pre-fix behaviour, verbatim - exactly the three tests that pin the abort fail
  (`expected false to be true` on the signal's `aborted`), and the other 38 pass, because the
  retry decision, the status classification and the model ladder are independent of it.
  Restored, re-run green.
- **Neighbours.** `bunx tsc -b --noEmit` clean, `bunx eslint` clean on both edited modules and
  both edited test files, and the full unit suite green (**88 files, 1448 tests** - the seven
  new tests on top of the 1441 defect 42 left). Both provider paths that go through
  `fetchJsonWithRetry` (OpenRouter and OpenAI-compatible) are pinned by the existing
  `ai-client.test.ts` cases, which still pass unchanged.

### 28.3 What it deliberately does not do

- **No propagation from the HTTP request that started the call.** A cancelled `/api/encode`
  still does not cancel the model call: `req.signal` is not threaded through the ~25 route
  call sites into `generateJSONWithProvider`. The composition primitive now exists (an optional
  signal on `withTimeout`, and `fetchJsonWithRetry` composing `init.signal`), so that is a
  plumbing change with a clear home, but it is a separate feature from the deadline defect and
  is not claimed here.
- **The streaming path still has no deadline of its own.** `streamTextWithProvider` reads the
  SDK/fetch stream with no timer, so `AI_TIMEOUT_MS.stream` remains unused. A deadline over a
  stream is a different design question (a whole-stream budget versus a per-chunk idle
  timeout), and this round did not decide it - the defect was the deadline that existed and
  did not abort.

**Total: 41 distinct defects in 58 files** (40 is the first in `lib/ai-hardening.ts` - the
module that carried the deadline and did not count while the finding was open, the same rule
as `lib/services/offlineGenerator.ts` in round 25 - and `tests/unit/ai-client.test.ts` is
newly named by this round. `lib/ai-client.ts`, `tests/unit/ai-hardening.test.ts` and
`README.md` were already named by round 24's row 40 and earlier rounds, and no new test file
was created: the two existing suites were extended.)

## 29. Round 27 - defect 41, the attached file the hydration read could clobber

Round 24's third finding, fixed and pinned. `hooks/useInputSource.ts` mirrors the attached
file into IndexedDB session state and restores it on mount, and both halves of that
arrangement were guarded by a single `if (!hydratedRef.current) return` in the persist effect
- which covers exactly one case, the mount-time `null` the comment names. A file the
**learner** picked inside the read's window was not covered, so it lost both halves of the
deal: the effect returned early and never re-ran, dropping the write, and the read that
followed called `setUploadedFile(stored)` unconditionally and replaced the fresh pick with the
previous session's upload. The read is the slow one on a first visit, because `initIndexedDB`
performs the one-time localStorage→IndexedDB migration of an existing history - so the window
is widest exactly where a learner has the most to lose.

### 29.1 The guard, and why it is a ref

- **`uploadTouched` is the file-side twin of `sourceTouched`.** The hook already records an
  explicit user action for the input tab (`if (!sourceTouched.current) setStoredActiveTab(...)`)
  and consults it before applying hydrated prefs; the upload now does the same, for the same
  reason.
- **The setter writes it synchronously.** `setUploadedFile` marks the ref and then sets the
  state, so the flag is already true when a read resolving a microtask later inspects it.
  React state would not do: the read's callback closes over the render that started it and
  would still see the pre-pick value.
- **The read restores only what the learner has not already overridden.** `stored` is applied
  when `!uploadTouched.current`, so a pick wins whichever side of the read it landed on.
- **The persist effect refuses only the untouched mount `null`.** The condition is
  `!hydratedRef.current && !uploadTouched.current`, true only for the initial state the
  original comment was about ("writing it would delete the very upload the read is about to
  restore"). Every other change persists immediately - including a pick that arrived before
  the read finished, which is the write the old guard dropped.

### 29.2 Verified

- **The ordering (unit, `tests/unit/input-source-upload.test.tsx`, 8 tests).** The hook is
  mounted in happy-dom with `lib/db`'s three session-state functions mocked and the read held
  open, so the test decides when hydration answers. A pick is written *before* the read
  settles; the read then answering with the previous session's upload leaves both the
  on-screen file and the store holding the pick, and never writes the stored one; a pick that
  beat an *empty* store still persists; the ordinary restore, the empty-store no-op, a later
  pick replacing a restored upload, clearing deleting the key, and a read that resolves after
  unmount writing nothing are pinned too.
- **Mutation-proven (unit).** With the three pre-fix lines restored - the setter no longer
  marking, the read applying unconditionally, the effect refusing until hydration - exactly
  three tests fail, and they fail on the defect itself: `expected [] to deeply equal
  [['last_upload', …]]` (the dropped write) and `expected { yesterday-lecture.pdf } to deeply
  equal { today-lecture.pdf }` (the clobber). The other five pass, because the ordinary
  restore path is not what changed.
- **The real thing (browser, `e2e/upload-persistence.spec.ts`, 3 tests, live app).** With real
  IndexedDB: a picked PNG is stored and, after a real `page.reload()`, comes back with its
  exact bytes - the assertion is on the rendered `src`, so a reload that restored *a* file
  rather than *this* file still fails; the newest pick wins over one an earlier reload had
  restored; and the race itself is made real by **holding an IndexedDB connection** in an
  init script, so the app's own version-2 open is blocked and its read answers late, with a
  previous session's upload seeded in the store. The pick wins on screen and in the store,
  and survives the reload.
- **Mutation-proven (browser).** With the pre-fix hook, the slow-hydration test fails at the
  store assertion - the record is the seeded `yesterday-upload.png`, the pick's write having
  been dropped - which is the defect stated as a browser assertion.
- **A dead end worth recording.** The first attempt at slowing the read shadowed `onsuccess`
  on the request returned by `indexedDB.open`. `idb` 8 resolves its open through
  `request.addEventListener('success', …)`, and an own-property shadow of `onsuccess` does not
  intercept that listener, so instead of delaying the connection the patch starved it:
  `getDB()` never resolved, every session-state write quietly no-op'd, and the test hung
  rather than failing informatively. The hold-a-connection script is the version that works,
  and it touches no API.
- **Neighbours.** `bunx tsc -b --noEmit` clean, `bunx eslint` clean on the hook and both new
  specs, and the full unit suite green (**89 files, 1456 tests** - the eight new tests on top
  of the 1448 the deadline round left).

### 29.3 What it deliberately does not do

- **No `pagehide` flush for the session-state write.** `putSessionStateIDB` is issued
  synchronously on the pick (the effect has no debounce), unlike the schema writes that need
  `flushPendingSchemaWrites`; the reload test above is what pins the durable path. A second
  flush mechanism for a write that has nothing queued would be machinery without a caller.
- **No change to the notes or YouTube inputs.** The race was the upload's; neither of those
  has an async restore of its own to lose to.

**Total: 42 distinct defects in 61 files** (41 is the first in `hooks/useInputSource.ts` - the
module that carried the hook and did not count while the finding was open, the same rule as
`lib/ai-hardening.ts` in round 26 - and the round's two new specs,
`tests/unit/input-source-upload.test.tsx` and `e2e/upload-persistence.spec.ts`, are counted as
files following defect 30's precedent. `README.md` was already named by defect 28.)

## 30. Round 28 - defect 45, the icons the manifest declared and the shell nothing cached

`app/manifest.ts` has described an installable app since it was written: `display: 'standalone'`,
a `start_url`, a `scope`, the studio's own colours, and three icon entries - `/icon-192.png` at
`192x192` with `purpose: 'any'`, and `/icon-512.png` twice, once `any` and once `maskable`.
`public/` held one directory, `assets`, and **no file at either path**, so both returned **404**.
Nothing in the tree registered a service worker either. The two absences were joined by
`components/PWAInstallHeader.tsx`, whose whole install affordance - the `[ INSTALL APP: PWA ]`
button, rendered only when `deferredPrompt || isIOS` - waits on `beforeinstallprompt`, an event
Chromium will not fire for a manifest whose declared raster icons do not load, nor for an app with
no worker behind a `fetch` handler. So the button could not appear on any Chromium browser, for any
learner, ever: the masthead's only install path was dead code behind a promise the tree did not
keep.

The same absence had a second face, and it is the one a learner meets. The studio is built for a
train: it generates from text, files and YouTube URLs and hands the results to RemNote, Anki and the
clipboard, and its shell needs nothing from the network. §19.3 declared this gap in round 17 and
chose not to file it, on the grounds that "the in-page offline fallback generator still works once
the page has loaded". Round 25 (§27) had to correct half of that sentence - the generator was wired
to nothing - and fixing it made the remaining half load-bearing rather than academic: a learner who
is offline *before* the page loads got the browser's own error page. Rounds 18-27 worked through the
other findings while this one kept standing. This round closes it, and files it, because the gap as
§19.3 stated it was only half of what was actually wrong.

### 30.1 The fix, and the four choices inside it

- **The icons are generated, not committed.** `lib/pwa/appIcon.ts` draws the studio's own `[ ▮ ]`
  token - the plate, the dim frame, the gilt bracket, the bright core - from four rectangle lists in
  0..1 space, and encodes it as a real PNG: signature, `IHDR` (8-bit truecolour RGB, no interlace),
  one `deflateSync`'d `IDAT`, `IEND`, with a CRC-32 table built in the module. This follows
  `lib/anki-sqlite-writer.ts`, which builds its .apkg in code for the same reason: the format is
  small and fully specified, and one description renders at any size, so the drawing stays
  reviewable as code rather than as an opaque blob nobody can diff.
- **Served from a dotted route segment, at the paths already declared.**
  `app/icon-192.png/route.ts` and `app/icon-512.png/route.ts` are real App Router handlers, so the
  manifest needs no edit and no rename: the file name carries the size, which makes a mismatch
  between the path and the pixels visible in the path itself. `dynamic = 'force-static'` prerenders
  both and `renderAppIconPng` memoises per size, so the bytes cost one render.
- **The worker is network-first, and narrow on purpose.** `public/sw.js` serves the network and uses
  the cache only as the fallback, which is the property that makes it safe to register in every
  environment: online, nothing this worker does can serve a stale page or a stale response. It
  declines **every non-GET** request and **every off-origin** request outright, so the streamed
  generation POSTs (`/api/encode/stream`, `/api/forge`, …) and every provider, Drive and Firestore
  call pass through untouched - replaying a generation from a cache would be a far worse defect than
  the one being fixed. It precaches `/`, the manifest and both icons; it skips Next's dev-only
  `/_next/webpack-hmr` and `__nextjs` endpoints; each precache path is added independently, so one
  failure cannot cost the whole install; and activate deletes superseded caches and claims the
  clients, so the first visit is controlled without needing a second.
- **Registration is deferred, and a refusal is tolerated.** `components/ServiceWorkerInit.tsx`
  mounts beside `MonitoringInit` in the root layout - the existing precedent for browser-only
  initialisation - and registers after the `load` event, so the first paint never competes with the
  worker's install for the network. A `catch` swallows a refused registration: a private window runs
  the app exactly as it did before, just without the install button.

### 30.2 Verified

- **The bytes, decoded independently of the encoder (`tests/unit/pwa-install.test.ts`, 17 tests).**
  The suite re-walks the chunk stream with **its own bit-by-bit CRC-32** and **its own
  `inflateSync`**, so a self-consistent-but-wrong encoder cannot pass by agreeing with itself, and
  asserts the IHDR dimensions, 8-bit colour type 2, exactly `IHDR/IDAT/IEND`, an image that inflates
  to `(1 + 3w) × h` bytes with a zero filter byte on every row, determinism, and - so a valid but
  blank icon cannot pass - that the decoded pixels really contain the plate, the frame and the gilt
  mark. The same decode was then run against the **served** bytes with Python's own `zlib`, a third
  implementation sharing nothing with either: `GET /icon-192.png` and `/icon-512.png` both answer
  `200 image/png`, and both reconstruct to complete 192x192 and 512x512 RGB bitmaps with every CRC
  valid.
- **The promise and the disk, checked against each other.** The manifest is a promise about files;
  the 404s existed because nothing verified it. The suite now extracts every declared `src` and
  `sizes` from `app/manifest.ts` and asserts that a route handler exists at each path, that the
  filename, the declared `sizes` and the size that handler renders all agree, and that both an `any`
  and a `maskable` purpose survive.
- **The browser's own verdict (`e2e/pwa-install.spec.ts`, 3 tests, against the live app).** The
  manifest is linked and fetched over HTTP, and every icon it declares answers 200 with valid PNG
  dimensions equal to its declared `sizes`. A worker registers, reaches `activated` with its
  `scriptURL` at `/sw.js`, and takes control of the page that registered it. And the headline claim:
  with the worker in control and `context.setOffline(true)`, a `reload()` still paints the launchpad,
  with `navigator.onLine === false` asserted at the same moment so that a quietly reachable network
  cannot be doing the work.
- **Mutation-proven, twice.** Reversing the worker to cache-first and relaxing its GET guard fails
  exactly the three tests that describe those properties, including the ordering assertion
  (`expected 2908 to be less than 2821`). And letting a worker register and claim while **caching
  nothing** leaves registration and control passing while **only** the offline test fails, at the
  shell-cache poll that guards the reload - which is what shows the two browser tests measure
  different things, and that the offline reload depends on precisely the caching under test.
- **A first run that failed, and what it turned out to be (recorded because it matters).** The
  offline spec failed its first time out: the registration state was sampled once as `activating`,
  and the control poll never turned true. A throwaway probe spec then showed the worker installing,
  activating, claiming and filling its cache correctly on the first load and after a reload, with
  and without the mocked routes - so the worker was never the fault, and the assertions were: one
  raced a mid-flight state transition, the other raced a first install that fetches four paths
  through a cold dev server. Both now poll to a generous ceiling, and the shell-cache check was
  split into its own assertion so that a future failure says which half broke. The probe was
  deleted. The honest reading of that first run was "the fix does not work", and it did not.
- **Neighbours.** `bunx tsc -b --noEmit` and `bunx eslint` clean, the full unit suite green with the
  17 new tests in it, and §27's offline specs unaffected: the worker declines every POST, so the
  `page.route`-mocked API calls are still answered by the mocks rather than from a cache.

### 30.3 What it deliberately does not do

- **No offline *generation*.** This caches the app shell, not the model. A generation still needs
  the network; what a learner gets offline is the app, their library, their saved drafts and - via
  defect 42's fallback - a deterministic workout built from their own notes. That is the boundary
  §19.3 drew, and it has not moved.
- **No precache manifest, no build-time asset list, no cache versioning UI.** A generated list of
  hashed chunk names would be a build step buying what the runtime cache already provides, and it
  would rot the first time a chunk was renamed. The opportunistic cache fills as the app is used,
  which also means the offline shell is what this learner actually loaded.
- **No background sync, no push, no update prompt.** There is nothing to sync in the background -
  the writes are local and the cloud mirrors are already best-effort - and a "new version available"
  prompt on a single-page studio is machinery without a decision behind it.
- **No change to the offline experience itself.** The offline notice, the IndexedDB story and the
  fallback banner are defect 42's, and the worker does not touch them.

**Total: 43 distinct defects in 68 files** (45 is the first in `lib/pwa/appIcon.ts`, a module created
by this round; the round's seven new files - `lib/pwa/appIcon.ts`, the two icon routes,
`public/sw.js`, `components/ServiceWorkerInit.tsx` and the two specs, `tests/unit/pwa-install.test.ts`
and `e2e/pwa-install.spec.ts` - are counted following defect 30's precedent. `app/layout.tsx` is
named here, and `README.md` was already named by defect 28.)

## 31. Round 29 - defect 46, the AnkiConnect spec that could never pass

Found while regression-testing round 28's change rather than by looking for it, and it belongs in
this report because it is the same class as defects 30 and 38: an artefact that claims something the
code does not do. Here the artefact is a test, and the claim is coverage.

`e2e/anki-connect.spec.ts` mocks the local AnkiConnect server at the network level, and its route
predicate read `(url) => url.hostname === '127.0.0.1' && url.port === '8765'` - while the app requests
`http://localhost:8765` (`lib/anki-connect.ts:27`, `DEFAULT_ANKI_CONNECT_URL`). A predicate that never
matches means the mock never fires, the request goes to a server that is not running, and the app
reports its own (correct) "Can't reach AnkiConnect at http://localhost:8765" error instead. Three of
the file's four tests failed on **every** run, deterministically.

Two details make this worse than a flaky test. First, `localhost` is not an accident on the app's
side: AnkiConnect's own `webCorsOriginList` default permits only `http://localhost`, which is why the
README tells the reader to add `http://localhost:<port>` - so the app is right and the spec was wrong.
Second, the README's own E2E description advertised the push as "mocked at `127.0.0.1:8765`", so the
doc agreed with the broken spec and the pair of them disagreed with the code. The path with no working
coverage is the whole AnkiConnect handoff: deck creation, the duplicate report, the origin refusal,
and the export modal's push.

### 31.1 The fix, and why it is not just a loosened assertion

- **The predicate matches both names the same server answers to.** `localhost` is what the app
  requests by default; `127.0.0.1` is what the Settings field can be pointed at, and both are the
  same server on a developer's machine. Matching one and not the other is what broke it.
- **The comment now records why.** A future reader who wonders why both hosts are listed finds the
  reason, and the spec's header explains that these tests could not pass rather than were flaky.
- **The README's E2E line was corrected with it**, so the description and the spec stop agreeing on
  something false.

### 31.2 Verified

- **Before and after, on the same file.** `bunx playwright test e2e/anki-connect.spec.ts` against the
  live app: **1 passed / 3 failed** before, **4 passed / exit 0** after - no other edit in between.
- **The failure was not this audit's change.** With defect 45's worker disabled entirely
  (`navigator.serviceWorker.register` pointed at a nonexistent script, so no worker could control the
  page and every off-origin request passed straight through), the same three tests failed with the
  identical `[ANKI: +` assertion and the identical unreachable-server message. That isolation run is
  what ruled the round-28 change out before this round touched anything, and it is the reason the
  finding exists at all.

### 31.3 What it deliberately does not do

- **No change to `DEFAULT_ANKI_CONNECT_URL`, and none to the app.** The app's choice is the one
  AnkiConnect's own CORS default permits; changing the app to satisfy a test would have broken the
  real integration to make a green check.

**Total: 44 distinct defects in 69 files** (46 is the first in `e2e/anki-connect.spec.ts`.
`README.md` was already named by defect 28.)

## 32. Round 30 - defect 43, the fallback that was promised three times and called none

`lib/services/teachLesson.ts` opens its last section with "Deterministic offline fallback" and exports
`buildFallbackLesson`; `sanitizeLesson`'s own docstring names it as the caller's recourse ("Returns null
for completely unusable payloads (caller falls back to buildFallbackLesson)"); and the comment on the
Teach Me mount in `app/page.tsx` told every reader that the sheet is "AI-authored, **with an offline
schema-based fallback**". Nothing joined them. Only `sanitizeLesson` was imported by
`components/TeachMeModal.tsx`, so a failed request ended in a `catch` that reported the error and
returned the learner to the pre-roll: the one case the builder exists for produced no lesson at all.

Three artefacts agreeing on a behaviour neither of them implements is what makes this a defect rather
than a missing feature - it is the same class as defect 42, which round 25 fixed by wiring the offline
generator it had already written - and it is why the fix below is wiring rather than design.

### 32.1 The fix, and the four choices inside it

- **The fallback is built when the request fails, from what the sheet already has.** The `catch` builds
  it with the same topic, mode and activity the request was made with, so a stage lesson gets the arc
  that stage can actually support (its own title, its prompt as the mechanism, its confusable lookalike
  as the trap) instead of the generic skeleton. Both paths end in a real lesson: five segments in the
  generic case, the full mechanism arc in the stage case.
- **It is labelled rather than disguised.** A notice plays above the lesson for as long as the fallback
  does, with `data-origin` separating the two failures: `offline` when nothing answered, `server` when
  something did. That line is drawn by `classifyTeachFailure`, added to the same module as the builder -
  `fetch` rejects with a `TypeError` when the request never reached the server, and everything else (an
  HTTP status, a 200 whose payload sanitized to nothing) is a service that is up and disagreeing. On the
  `server` branch the notice carries the provider's own message, so an outage stays visible instead of
  being papered over: a fallback that hid the failure would be a second defect of the same family.
- **The way back is on the notice.** `[ TRY THE MODEL AGAIN ]` re-requests and the model's lesson
  replaces the fallback (every request clears the notice first, so it cannot outlive the fallback it
  describes); `[ DISMISS ]` hides the notice and leaves the lesson, because the notice is information
  rather than part of the lesson. The lesson's own exits are untouched: checkpoints, XP,
  `[ START ENCODING ]` and `[ SAVE IT FOR LATER ]` work on a fallback lesson exactly as on an authored
  one, and nothing parks it in the saved-lesson library behind the learner's back.
- **The failure path still cannot brick the sheet.** If the deterministic builder ever threw, the inner
  `catch` reports the original failure the way the pre-fix path did, which keeps this `catch` total in
  the same way the coercion layers around it are total.

One production edit in this round is not defect 43's: `components/TeachInteractive.tsx` renders JSX
without importing React, while all six of its sibling `Teach*` bodies import it. Next's own transform
does not need the identifier, so the app was never broken - but the test runner's classic transform is
the first compiler to ask that module for `React`, and the first test to render any lesson's second
segment died with `React is not defined` before it could assert anything about the fallback. The import
is one line and it is what the file's siblings already carry.

### 32.2 Verified

- **The failure path, at the component level.** `tests/unit/teach-fallback.test.tsx` (new, 6 tests,
  happy-dom with `MotionGlobalConfig.skipAnimations` set so the sheet's exit animations cannot reject on
  unmount and be reported as unhandled errors) mounts the real sheet and fails the real request three
  ways: a rejected `fetch` (nothing answered), a 500 carrying `{ error }`, and a 200 whose payload
  sanitizes to nothing. Each one asserts the deterministic lesson is on screen with its sections named
  ("The Core Idea", then "What the mechanism actually does" after one Continue), the notice's
  `data-origin`, the provider's message on the server branch, that a stage lesson falls back to the
  activity-derived arc ("The mechanism, link by link", and the stage's own boundary rule as the trap),
  that retry returns the model's lesson and drops the notice, and that dismissing the notice keeps the
  lesson.
- **The tests fail without the fix.** With the pre-fix `catch` restored verbatim, all 6 fail; restored
  to the fix, all 6 pass.
- **The failure path, in the browser.** `e2e/teachme.spec.ts` gained two specs that drive the real app:
  `/api/teach` aborted at the network level (`data-origin="offline"`, the deterministic arc rendering,
  advancing one segment, and reporting `1/5`), and a first response of 500 followed by the mocked lesson
  (the reason on screen, then `[ TRY THE MODEL AGAIN ]` returning the learner to the model with the
  notice gone and exactly two calls made). `bunx playwright test e2e/teachme.spec.ts --workers=1` against
  the managed preview: **9 passed / exit 0** (7 before this round). With the pre-fix catch restored, the
  two new specs fail; with the fix back, 9 pass again.
- **Nothing else moved.** `bun run test` - **91 files / 1481 unit tests, exit 0** (90/1473 before, so
  +8: the 6 component tests and 2 for `classifyTeachFailure`). `bunx tsc -b --noEmit` exit 0 and
  `bunx eslint` exit 0, both after the last edit.

### 32.3 What it deliberately does not do

- **It does not retry on its own.** One press is one request; a provider that answered with an error is
  reported and offered back, not hammered in a loop - the same discipline defect 40's round pinned for
  the encode path.
- **It does not change defect 42's rule for the workout path.** The launchpad still alerts on an
  answered error for a whole workout rather than fabricating cards for a provider outage, because that
  artefact is thirty minutes of the learner's time. A Teach Me lesson is one sheet with the failure and
  its reason both on screen, and the builder's own tagline says what it is ("A skeleton lesson so you
  can still study offline"), so the two paths now differ deliberately. This round did not touch the
  other one.
- **It does not park or auto-save the fallback.** `[ SAVE IT FOR LATER ]` stays the learner's decision;
  a fallback that silently occupied the saved-lesson slot would be the same class of bug as one whose
  only reader is a comment.

**Total: 45 distinct defects in 72 files** (the fix lands in `lib/services/teachLesson.ts` and
`components/TeachMeModal.tsx`, both already named by the finding; the coverage is new to this report in
`tests/unit/teach-fallback.test.tsx` and `e2e/teachme.spec.ts`, and `components/TeachInteractive.tsx` is
named here for the first time.)

## 33. Round 31 - defect 44, the twenty-two handlers that trusted their bodies

`lib/api-validation.ts` states its own purpose ("Before this module the route handlers trusted client JSON
bodies … bad input is rejected up front with a 400 that names the field") and was imported by five
handlers: `encode`, `evaluate`, `teach`, `youtube` and `forge`. The other twenty-two routes that read a
body called `await req.json()` and destructured the result. Two consequences, both real:

- **Free text reached a paid call with no ceiling.** `/api/triage` (`{ text }`) and `/api/roast`
  (`{ notes }`) are handed the learner's `rawNotes` by the same UI that gets a clean 400 from `/api/encode`
  for a paste that is too large, so a 300 kB paste was forwarded to the provider instead of refused. The
  same was true of `dump` (crisis), `claim` (inquisitor), `blurtText` (blurt), `layers` (probe) and every
  other free-text field on the list.
- **Malformed JSON answered 500.** `req.json()` threw inside the handler, so the route's own `catch`
  reported "Failed to …" as a server error for what is a client mistake.

Two of the twenty-two were milder versions of the same thing: `/api/encode/stream` already caught the parse
error itself but validated nothing (it forwards its body to the `/api/encode` handler in-process), and
`/api/remnote` already answered 400 for unparseable JSON but read `apiKey`/`markdown` through `typeof`
checks with no bounds.

### 33.1 The fix, and the five choices inside it

- **One schema per route, in the module that already holds them.** Twenty-one new exports in
  `lib/api-validation.ts` (the routes that share a body share a schema: `roast`/`prerequisites`/`pretest`
  and `segregate` are one `notesAndFile` shape, the four stage-level drills are one `stageDrill`, and
  `/api/encode/stream` reuses `encodeSchema` because its body is the encode body plus `stream: true`).
  Every route now calls `parseRouteBody` and answers `{ error: parsed.error }` at `parsed.status`.
- **The routes keep their own sentences for empty input.** A field the route itself checks for emptiness
  is deliberately left optional in its schema: a missing topic is still "Name the topic first — a crucible
  is timed against a chapter", not "Invalid request — topic: Required." The schema's job is the shape and
  the ceiling; the route's job is to say what to type. `tests/unit/api-route-validation.test.ts` pins six
  of those sentences so a later loosening cannot quietly replace them.
- **Two routes answer in their own envelope.** `/api/checkpoint` returns
  `{ passed, score, xpBonus, feedback }` on a schema failure (the client renders `feedback`, and its
  empty-answer path is a deliberate 200 that this round did not touch), and `/api/remnote` returns
  `{ success: false, message }` because that is the shape `lib/remnote.ts` reads.
- **An aliased import wherever the route already owns a `*Schema`.** Ten files declare a module-level
  `<name>Schema` for the model's RESPONSE schema (`archetype`, `crucible`, `discrimination`, `inquisitor`,
  `mutation`, `prerequisites`, `pretest`, `priming`, `probe`, `sequence`, `triage`), so the body schema is
  imported as `<name>BodySchema` with the reason in a comment rather than renamed away from the contract.
- **The file fragment had to accept an explicit `null`, and that is a defect this round found rather
  than created.** `fileAssetSchema` was `.optional()`, but the attachment is React state
  (`UploadedFileAsset | null`) and `JSON.stringify` keeps the null: "paste notes, upload nothing" posts
  `file: null`, which the first cut of the guard rejected with a 400. That path was live on the five
  already-guarded routes, so it is fixed here (`.nullish()`) and pinned for all five.

One route needed a schema-shaped stage rather than a bare passthrough: `regenerate-stage` serializes the
whole `activity` object into its prompt, so the fields the prompt quotes (`title`, `templateType`,
`prompt`, `contextSnippet`, `cognitiveGoal`, `keywords`, `stageNumber`) are typed and bounded while the
rest of the stage still passes through untouched.

### 33.2 Verified

- **Every route, one case per route.** `tests/unit/api-route-validation.test.ts` (new, 55 tests) posts a
  wrong-typed or oversized field to each of the 21 body-reading handlers and to `/api/checkpoint`, then
  malformed JSON to all of them: both must answer **400**, and the message must name the field
  (`text`, `notes`, `dump`, `claim`, `layers`, `include`, `settings.provider`, `minutes`, `tier`,
  `activity`, `file`, …). A third test posts every rejected body to every route and asserts the model was
  never called.
- **Two of them were broken in exactly the way the finding describes, and that is what the browser
  proves.** `e2e/api-validation.spec.ts` (new, 6 tests) posts over the wire to the real dev server — no
  page mocks, no intercepted route — an oversized `text` to `/api/triage`, an oversized `notes` to
  `/api/roast`, a malformed body to both, and `minutes`/`claim` to crucible and inquisitor. Each asserts
  the 400 **and** that the message names the field, plus triage's own empty-input sentence for `{}`.
  `PLAYWRIGHT_BASE_URL=… bunx playwright test e2e/api-validation.spec.ts`: **6 passed / exit 0**.
- **The tests fail without the fix.** With the pre-fix `await req.json()` restored verbatim in
  `app/api/triage/route.ts` and `app/api/roast/route.ts`, six of the new tests fail — the malformed-JSON
  case for both routes, the oversized-paste case for both, the field-naming case for roast, and the
  "never spends a model call" case; restored to the fix, all 55 pass.
- **Nothing else moved.** `bun run test` — **92 files / 1578 unit tests, exit 0** (91/1481 before this
  round). `bunx tsc -b --noEmit` exit 0 and `bunx eslint app lib tests e2e` exit 0, both after the last
  edit. The whole Playwright suite was run against the managed preview: **45 specs / 194 tests passed,
  0 failed** (`--workers=1`, in chunks, because the managed preview is restarted periodically and a
  mid-run restart surfaces as `ERR_CONNECTION_REFUSED`; each such chunk was re-run green after a
  `freebuff-preview restart`).

### 33.3 What it deliberately does not do

- **It does not re-specify what each route already checks.** Length limits the routes already enforce
  (`MAX_CLAIM_LENGTH`, `MAX_DUMP_LENGTH`, the crucible's 3–30 minute clamp, the 1–5 count clamp) stay
  theirs, so the sentences a learner reads for those cases are unchanged; the schema is a ceiling above
  them, not a replacement.
- **It does not touch the model's RESPONSE schemas.** The ten aliased imports exist precisely so the
  request contract could be added without renaming the response contract next to it.
- **It does not delete the routes nothing calls.** `/api/autopsy`, `/api/mutation` and `/api/synthesis`
  have no client caller (`lib/mr-m/autopsy.ts` names the autopsy route only in a comment, and the
  comparative-synthesis client posts to `/api/synthesis` from a sheet the workbench no longer opens).
  They read a body, so they are guarded like the rest; whether they should exist is a separate question
  this round did not act on.
- **It does not add content validation.** A chunk of JSON-shaped prose still reaches the prompt
  assembly; what is now impossible is a wrong type, a missing bound, or a malformed body.

**Total: 46 distinct defects** (this round's fix lands in `lib/api-validation.ts` and the 22 route files
it guards — `archetype`, `autopsy`, `blurt`, `checkpoint`, `crisis`, `crucible`, `discrimination`,
`encode/stream`, `inquisitor`, `invert-step`, `mutation`, `prerequisites`, `pretest`, `priming`, `probe`,
`regenerate-stage`, `remnote`, `roast`, `segregate`, `sequence`, `synthesis`, `triage` — all already named
by the finding; the coverage is new to this report in `tests/unit/api-route-validation.test.ts`, in the
schema cases added to `tests/unit/api-validation.test.ts`, and in `e2e/api-validation.spec.ts`.)
