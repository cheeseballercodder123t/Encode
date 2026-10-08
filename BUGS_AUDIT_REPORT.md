# DeepEncode Bug Audit — 2026-10-08

Branch `freebuff/changes-7h8fxpxe` (based on `bf2f8cc`). Scope: the attack vectors in the request —
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

**Total: 12 distinct defects in 6 files** (3 SM-2, 1 hook lifecycle, 4 formula-pipeline, 1 cross-session state carry-over, 2 crucible clock, 1 Parsons scramble — defects 9, 10–11, 12 detailed in §3a and §3b).

### Tests added

| File | Purpose |
|---|---|
| `tests/unit/anki-sm2-hardening.test.ts` (114 lines) | Defects 1–3, plus happy-path guards (reps 0 → 1 d, reps 1 → 6 d, reps 3 @ ease 2.5 → 25 d, failure → 1 d with the 1.3 floor). |
| `tests/unit/roll-variables-hardening.test.ts` (151 lines) | Defects 5–8, plus regression guards: in-range draws over 400 seeded draws, `min > max`, `choices`, `step`/`decimals`, and same-seed determinism (proving no extra `rng()` draw was consumed on the valid path). |
| `tests/unit/xp-timer-cleanup.test.ts` (69 lines) | Defect 4, source-scan style (mirrors the existing `tests/unit/modal-a11y.test.ts` convention). |
| `tests/unit/clue-ladder.test.ts` (extended, +6 tests) | Defect 9: 4 runtime tests for the reveal counter (which had zero coverage) and 2 wiring guards for the workbench's reset boundary. |
| `tests/unit/crucible-budget.test.ts` (extended, +3 tests) | Defects 10–11: the overflow sum invariant, the non-finite clock, and the clock face. |
| `tests/unit/parsons.test.ts` (extended, +4 tests) | Defect 12: no tile in its own slot across 300 seeds, never a rotation across 300 seeds, order variety, and the three-link case where the only derangements *are* rotations. |

## 2. Verification performed

Run as plain commands, with exit statuses captured:

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc -b --noEmit` | **exit 0** |
| Unit suite (final) | `npx vitest run` | **exit 0** — 73 files, **1243 passed** (was 70 files / 1196 tests) |
| Lint (changed files) | `npx eslint <9 files>` | **exit 0** |
| E2E smoke | `npx playwright test e2e/modal-a11y.spec.ts --project=chromium` | **exit 0** — 3/3 |
| E2E Parsons drill | `npx playwright test e2e/sequence.spec.ts --workers=2` against the managed preview | **exit 0** — 3/3 (this is defect 12 verified in the real drill, not just in the unit test) |
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
   (unreachable today, since every caller strips the prefix) all remain.

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
 tests/unit/crucible-budget.test.ts          | +3 tests
 tests/unit/parsons.test.ts                  | +4 tests
```

No new exports were added or renamed in any source file; `calculateSM2`'s signature,
`rollVariables`/`rollVariable`'s signatures and every error string in `procedural-validator.ts` are
unchanged. The only module-private helper added is `finiteFallback` in `lib/procedural-validator.ts`
(no name collision).
