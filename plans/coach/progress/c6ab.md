# Leg c6ab: the fixes from review c6a (MERGE AFTER FIXES)

Branch `coach-c6a` (the existing worktree `/home/dgx-delgado/yames-coach-c6a`), `coach` merged in first
(clean, no conflicts). Logs `/tmp/coach-c6a/`. Fix diff (non-locale source): `/tmp/coach-orch/c6ab-fix.diff`.

## Done

- **H1** An entry of `coach.suppressed` this build cannot read (loaded as `Infinity`, the store's "fails
  closed") threw a RangeError from `dayOf` in Settings → Coach → Notebook's render and blanked the app.
  `CoachNotebookGroup` lists only entries whose time is finite (Bring back only for those); unreadable ones
  get one plain line (`settings.coach.notebook.unreadableEntries`, no date, no button) and stay on disk as
  stored (nothing written, nothing deleted). `dayOf` is now one function, exported from `Notebook.tsx`, and
  never throws (non-finite or out-of-Date-range time → ""). **The same defect in Ask's Notebook tab**: it never
  formats a suppressed entry's day, but its goal line did: `readGoal` accepts any finite `at` >= 0, so a
  stored goal with `at: 1e20` threw the same RangeError in both Notebooks. Now "You said" undated.
  Tests: `CoachNotebookGroup.test.tsx` (seeded `{"x":"bad","y":null}`; a readable entry beside unreadable
  ones; the goal at 1e20; the whole `CoachSettingsSection` rendered with the bad entries; `dayOf`).
- **M1** Verified in the code: with a model `ready`, `answerTyped` (router → next answerer → `sendAsk`) hands a
  sentence nothing answered to `answerAsk` → `coachGenerate("chat")`, shown labelled general advice
  (`AskPanel.tsx`). So the question is true and stays; under the tiers a new line
  `onboarding.coach.modelBuys`: "With a model, a question the app's own answers don't cover gets a reply in
  the model's own words, labelled as general advice. Everything measured comes from the app either way."
  (Not "one thing": the model also rewords tips and reports.) Test in `CoachStep.test.tsx`.
- **L1** `answersLine(tier, lang, usable, langs)`: the languages only when the chosen tier's row is
  `ready | loading | waiting | onDisk` (`modelUsable`; `notDownloaded`, `failed`, `notOnThisDevice` (phone,
  no-LLM build) → the Takes-and-Paths line). Today's output unchanged. Tests in
  `CoachSettingsSection.groups.test.tsx`, langs mocked with `__setModelLangsForTests`.
- **L3** No confirm exists (one press). The label is now "Remove models and voices". Behaviour unchanged.
- **L5** `mobileComposition.test.tsx`: no `[data-coach-group="voice"|"tools"]` anywhere on the page, no
  "Remove models", no "Hear what I play".
- **L4** left as is (unreachable: Ask is not shown with Settings). **L2** left (recorded in c6a).

## Strings

Three strings in 15 locales (`onboarding.coach.modelBuys`, `settings.coach.notebook.unreadableEntries`,
`settings.coach.removeModels`): sonnet translator, then a separate sonnet proof-reader (no fixes needed).

## Gates (all after the merge of `coach`)

- tsc: pass (job coach-c6ab-tsc).
- vitest, the five touched files: 86/86 (coach-c6ab-vitest).
- `npm run test`: 484 files pass, 51804 tests; 1 file fails, the known `TabStage.render.test.tsx` (symlink)
  (coach-c6ab-test, `/tmp/coach-c6a/test-full.log`).
- `npm run build`: pass (coach-c6ab-build).
- Layout, the six specs: 86 passed, 5 failed (firstrun's theme cards, all 30 s timeouts on a busy queue)
  (coach-c6ab-layout-2, `/tmp/coach-c6a/layout.log`); `firstrun.spec.ts` re-run alone with `--workers=2`:
  28/28 (coach-c6ab-layout-3).
