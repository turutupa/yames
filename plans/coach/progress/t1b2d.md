# t1b2d: the fixes from the second review of typed commands

Worktree `/home/dgx-delgado/yames-coach-t1b2b`, branch `coach-t1b2b` (no new branch), logs
`/tmp/coach-t1b2d/`. Work list: `/tmp/coach-orch/t1b2c-review.md` (MERGE AFTER FIXES, five findings).
`coach` was not merged in again.

## What landed

1. **MEDIUM, a no-spaces leftover still got a chip, and the model was never asked.** `answerTyped`
   now resolves a named `go` (`open_path {path}`, `open_step` with a Path or a Step named) before it
   writes anything, through `typedGo(call)` in `askTools.ts` (the host's Paths, `resolvePath` /
   `resolveStepCall`):
   - nothing found: the sentence goes on to the next answerer, then the model / the plain statement,
     exactly as a `call` whose name named nothing;
   - one found: the one-choice "Which one?", its label AND its call carrying the resolved title
     (`coachTools.choice.path {path: title}` / `coachTools.choice.step`), never the typed leftover;
   - several, or a Step number the Path lacks: the runner's own answer (its choices, its refusal).
   Tests (`askTyped.test.ts`): ja "設定を開くのは面倒", "コースを開けといて", "コースを開いて弾く";
   ko "냉장고 열어줘"; zh-CN "打开冰箱"; zh-TW "打開冰箱": each still a `which` from the router alone
   (so the test is on the mechanism, not on `notCommand`), and `asked` with no turn written and
   nothing changed through `answerTyped`. The seven existing one-press lines now also assert the chip's
   label is the resolved title ("ブルースを開いて" shows "ブルースとペンタトニック").
2. **LOW, "open step 12 of triads" lost its refusal.** `runTypedCall` falls through only on a name's
   notFound (`nameNotFound`: no choices and the line carries the name as `query`); "no Step N there"
   carries a number and is written. Test: en "open step <steps+1> of triads" gives the
   `coachTools.why.notFound.step {step}` refusal, the model not asked; "open step 2 of triads" opens.
3. **LOW, the 2-character guard was untested.** `routeCommand("コース開けれ")` is `none`, and
   "コース開けれれ" (two left) gets past it. Checked: with the guard disabled the test fails
   (`/tmp/coach-t1b2d/noguard.log`); the guard is restored, `router.ts` unchanged.
4. **LOW, the slot's answerer may return a Promise.** Synchronous by contract, documented at
   `AskNextAnswerer` and `setAskNextAnswerer`; a non-boolean return is "not answered" and
   `console.warn`s under `import.meta.env.DEV`. Test: a Promise, a string, 1 and undefined are all
   `asked`, four warnings; true / false warn nothing.
5. **LOW, casual text opened a Path by a partial word.** An at-once `open_path` / `open_step` from
   typed text needs `wholeTitleWords(typed, title)` (`resolve.ts`): the whole title (spaces ignored),
   or a run of two or more whole title words in order. A prefix, one word of a longer title, or
   words out of order becomes one press with the resolved title. Chips and model tool calls
   (`runAskCall`, the runner) are unchanged: they pass an exact title. Tests: en "go to class",
   "go first", "open first", "go to arpeggios"; de "geh zu erste"; es "ve a rock" are one press
   labelled with the title, and the press opens it; en "open classic rock", "open triads", de "öffne
   classic rock", es "abre rock clásico" open at once. en "go over" never reached a Path on this
   branch ("over" is in en `notCommand` since t1b2c); a test pins that it opens nothing.
   `resolve.test.ts` has `wholeTitleWords` cases.

## answerTyped's contract (for c2b1c, which merges this branch)

Unchanged order: the router, then the slot, then the model or the plain statement. What changed
inside the router step: a `call` or a single-choice `which` that is a named `go` is resolved first
(`typedGo`); nothing found now goes on to the slot / model (before, a no-spaces `which` was written
at once with the leftover as its label); a partial match in a spaced language is now `"which"`
instead of `"call"`. The slot now treats any non-boolean as false (before: anything but `true`).

## Gates

- `npx tsc --noEmit`: pass (job coach-t1b2d-tsc-2; the first run caught a null `go`, fixed).
- `npm run test`: 47149 tests pass, 418 of 419 files; the one is the known
  `TabStage.render.test.tsx` symlink file (`/tmp/coach-t1b2d/test.log`).
- `npm run build`: pass (coach-t1b2d-build).
- Layout, the five specs: 139 passed, 3 failed, all `smooth.spec.ts:74` long tasks under load
  (`/tmp/coach-t1b2d/layout.log`); re-run alone with one worker: 5 of 5 pass (coach-t1b2d-smooth).
  Nothing here runs during a Take (Ask is not mounted there). The full layout suite is owed
  (the orchestrator's).
