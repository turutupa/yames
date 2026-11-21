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

Eight changed `help.json` entries, five new `help.ui.*` keys, two `ask.json` keys, in fourteen locales (commit
`99a28f86`): three sonnet translators (de/es/fr/it/nl; pl/pt-BR/ru/tr/vi; ja/ko/zh-CN/zh-TW), then three separate
sonnet proof-readers. `jq empty` on every file. Native reads wanted: "milestone" words (no earlier screen term in most
locales); the count-in switch's name (no locale string for it); pass-mark words de Messlatte, es listón, it asticella,
nl lat, pl poprzeczka, ru планка, tr çıta are the glossary's existing words (crossbar-like; a decision for the owner,
not changed here).

## Part 2: scenes

`tests/layout/ask-help.spec.ts` (commit `df62d9b6`): en search passage + tuning line + "the tune" left alone (1440,
Ember, Today); ja search passage (phone, Manuscript); "What is this screen for?" on Today (1440 Manuscript, phone Ember)
and on the result (1440 Ember, phone Manuscript). Pictures only to `$YAMES_SHOT_DIR`.

## Merge of `coach` (`946262c3`)

Conflicts in `cards.ts` (both `suggest_path` and `AnswerShape` kept), `suggest.ts` (c4b3's Paths/Progress filter, then
the help chip last), `askCards.ts` (imports), `AskPanel.tsx` (imports: `pressSource` kept, `typedRuleAnswerer` in
place of `typedCardAnswerer`). Ask's empty state: three chips at most; on Paths and Progress "Suggest a Path" (first two
card chips kept) then "What is this screen for?"; on Today and in a Session the screen's cards (two at most) then the
help chip (`askCards.test.tsx` "with the help chip").

## Gates (after the merge)

- tsc: pass (`coach-c2cc-tsc2`). Build: pass (`coach-c2cc-build`).
- `npm run test`: 484 of 485 files, 51,918 passed, 10 skipped; the one failed file is the known
  `TabStage.render.test.tsx` (`/tmp/coach-c2cb/c2cc-test.log`).
- Layout `ask ask-tools ask-cards ask-typed short-window phone-header ask-help` (`--lock coach-layout`): 152 passed,
  1 failed: my ja search scene, which tried only the first eight fixture questions (`/tmp/coach-c2cb/c2cc-pw.log`).
  Fixed to try them all; `ask-help.spec.ts` alone (`--workers=2`, `coach-c2cc-pw2`): 6 passed.
- Shots: `/tmp/coach-c2cb/shots/` (`ember-help-search-1440`, `manuscript-help-search-phone-ja`,
  `ember-help-result-1440`, and the rest of the scenes).
- Observation for c2ca: in ja only one of the fixture questions (休符のところでもテンポをキープするには) got a passage in
  the phone scene; the others got "Nothing in your Paths answers that".
