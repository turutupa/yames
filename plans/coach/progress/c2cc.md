# c2cc: the c2cb review's fixes for the help set, then its layout scenes

Branch `coach-c2cb` (worktree `/home/dgx-delgado/yames-coach-c2cb`). Work list: `/tmp/coach-orch/c2cb-review.md`.
Logs `/tmp/coach-c2cb/c2cc-*`, jobs `coach-c2cc-*`.

## Part 1: the fixes

Tests first: `help.test.ts`'s new rows failed 18 of 105 on the old `helpMatch.ts` (job `coach-c2cc-help-before`,
`/tmp/coach-c2cb/c2cc-help-before.log`).

- **H1** `helpMatch.ts` TUNING: `tune` only before an instrument or its strings (`tune my guitar`, `tune the B
  string`); "how do I / you tune"; in tune / out of tune; tuner; tuning. `fine tune`, `fine tuning`, `fine tuned`
  excluded by look-behind. The review's five sentences and thirteen of mine with "the tune" as a piece are in the
  NO list; five tuning sentences stay YES.
- **M1** `helpMatch.ts`: word shapes take only `a / an / the`; a screen takes `this` only with `screen / page /
  view / tab` after it. NO: "What is this step for?", "explain this take", "What is this song?", "What is my pass
  mark?", "what is my level?", "what is that rung", "what is this drill for", "explain your notebook". YES: "what
  is a take", "what is the pass mark", "this drill screen", "this metronome page".
- **M2, M3, L10** `src/containers/coach/askEmpty.ts` (new, pure): `askEmptyKey` / `askNothingKey` choose by phone,
  model state, English (`isEnglish`) and whether the build can run a model (no selector row with `why ===
  "noLlm"`). Outside English: `help.ui.empty.search` / `searchLoading` / `searchModel`, `help.ui.reply.search` /
  `searchLocal` (Paths only; the chips for Takes and the screen). `AskPanel.tsx` and `useCoachPanel.ts`
  (`answerAsk` takes the language) use them. `ask.empty.loading` / `ask.empty.model` reworded.
- **M4** `screen.modelSelector`: downloads need a press; a chosen model loads by itself after startup, never during
  a Take (`hooks/coachLoader.ts:5-16`, `holding()` :226), stays loaded until Off or another one.
- **L1** `screen.progress`: Tool runs "in the tools and in Sessions" (`help.json` word.toolRuns, `session.json:573`).
- **L2** `word.passMark`: "every one it could measure" (`session/grade.ts:207-217`: `met === null` is not failed).
- **L3** `word.benchmark`: day 1 is the subscription day, first after the placement Session, a week late is skipped
  (`session/rotation.ts:42-45, 309-318`).
- **L4** `help.ts` SESSION_HELP: `looping` → `word.loop` (`session/runner.ts:209,663`).
- **L5** `word.take`: Songs has no pass mark but shows which notes landed (`songs.json:97,280-296`).
- **L6** `word.countIn`: one bar before each Take in a Session (`session/take.ts:27-28`); on the Metronome and in
  Drill it is the bottom bar's switch, a bar at the meter up to eight beats (`main-window/countIn.ts:17-19,64-113`;
  Drill's own toggle writes 4 beats, `DrillView.tsx:520`; on by default, `src-tauri/src/state.rs:69`): "a few beats".
- **L9** (c4b3 on `coach`): `screen.progress` names the coach's note at the top (week, milestone, question:
  `ProgressView.tsx:294` CompanionCard); `word.notFair` "earns no milestone", `word.cleanTempo` "or toward a
  milestone" (`c4b3.md` 2: a Take marked not fair earns none).
- **L7, L8** left, as asked: the tuning line is English-only matching; the one tuning-ish passage search could quote
  is about bend pitch.
- **Settings (item 7)**: `screen.settings` names the tabs only, and the tab is labelled "Practice Coach" on `coach`
  and on `coach-c6a` (`settings.json` tabs.smartCoach): no group named, true before and after c6a.

## Locales

(pending)

## Part 2: scenes

(pending)

## Gates

(pending)
