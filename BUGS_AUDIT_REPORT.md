# DeepEncode Bug Audit — 2026-10-08

Branch `freebuff/changes-7h8fxpxe` (based on `bf2f8cc`). **Defects 1–12 are merged on `main` (`1b0ffb0`, PR #34), 13–14 in `1f67f2e` (PR #35), 15–16 in `c324989` (PR #36), 17 in `e3c21a6` (PR #37), 18 in PR #39 (round 5, §7) and 19 in PR #40 (round 6, §8) — every defect this report records is on `main`.** Scope: the attack vectors in the request —
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