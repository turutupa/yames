# Leg pm: "pass mark", and the coach's translation brief

Branch `coach-pm`. Commits: `c965c17c` (WIP, English), `940833b2` (the brief), `f9ca56bd` (fourteen
locales), plus this file.

## What landed

- The threshold is the **pass mark** in the app's English; "bar" is music only. Keys unchanged
  (`session.bar.*`, `session.why.belowBar.*`, `session.result.bar*` keep their names).
- `plans/COACH_I18N_BRIEF.md`: the UI-locale translation brief (files, plurals, placeholders, the test;
  a glossary per locale for seventeen terms taken from the locale files; DESIGN §2's voice as rules;
  the never-add list; layout facts; how helpers return work and how a leg checks it).
- Fourteen locales checked by three Sonnet helpers and re-read here (diff reviewed key by key).

## The English table (threshold sentences; everything else with "bar" is music and stays)

| Key | Old | New |
|---|---|---|
| session.why.belowBar.even / heard / accents / notes | … The bar is {{bar}}%. | … The pass mark is {{bar}}%. |
| session.why.belowBar.extras | The bar is {{bar}} over four bars. | The pass mark is {{bar}} or fewer in four bars. ("over" read as "more than") |
| session.why.belowBar.plain | didn't meet the bar | didn't meet the pass mark |
| session.why.easing.even / heard / accents / notes | and the bar is {{bar}}% | and the pass mark is {{bar}}% |
| session.why.easing.plain | didn't meet the bar | didn't meet the pass mark |
| session.why.climb | you met the bar | you met the pass mark |
| session.why.climbFast | well over the bar | well over the pass mark |
| session.why.edge / edgeFirst | meets / meet the bar | meets / meet the pass mark |
| session.bar.summary | The bar: … | The pass mark: … |
| session.result.barMet | Pass bar met | Pass mark met |
| session.result.barChip | Bar {{bar}}% | Pass mark {{bar}}% |
| session.result.barChipCount | Bar: {{bar}} or fewer | Pass mark: {{bar}} or fewer |
| session.result.barMissed | Bar not met | Pass mark not met |
| session.edge.how / slipped / none / offerBody | the bar | the pass mark |
| session.coach.below.even / evenSome | against a bar of {{bar}}% | against a pass mark of {{bar}}% |
| session.progress.cleanMeans | The fastest you met the bar, over any eight bars | … met the pass mark, over any eight bars |
| onboarding.tour.learn.progress.body / bodyAsk | the fastest you met the bar | the fastest you met the pass mark |
| `src/coach/templateCatalog.ts` drill_step_up / down | clears the bar / is under the bar | meets the pass mark / is under the pass mark |

29 locale values in English, 2 template literals. Also updated: the `howText.test.ts` fixture, the
`todayPlan.ts` comment quoting the sentence, `tests/e2e/run.mjs` (`PASS MARK MET`, `against a pass mark
of`) and `tests/e2e/README.md`.

Music, stays: every other "bar" in `src/locales/en` (songs, jam, setlist, drill, metronome, settings,
shell, `session.run.bars`, `session.result.bars*` / `barHeld` / `barSlipped` / `barThin`, `barOf`,
`pausedAt`, the `session.where.*` lines). Pack text under `src/paths/`: no threshold use of "bar" (all
"over the bar line", "the bar is silence" etc. are music), so no regeneration. Rust: no player-facing
phrase uses it (only comments and test messages).

## Other locales (strings changed)

No locale used its bar-of-music word for the threshold; each already had its own word. Changes:
de 1, es 1, fr 3, it 3, ja 2, ko 6, nl 1, pl 3, pt-BR 1, ru 3, tr 1, vi 3, zh-CN 3, zh-TW 3 (34).
- `belowBar.extras` now says "at most" in thirteen (ja already did).
- The onboarding clean-tempo sentence used a second threshold word in ten locales; fr said "la barre"
  (literally the bar). Now each uses its pass-mark word.
- ko: 기준 → 통과 기준 in climbFast and coach.below.even / evenSome.

## Left alone on purpose

- Developer vocabulary: `passBars`, `BarCheck`, "pass bar" in code comments, `paths/review.ts` (an
  authoring review page, not player-facing), the verdict code `belowBar`. Renaming them is churn with no
  player-visible effect.
- `SessionView.tsx` comments that quote "Bar 85%" (lines ~744, ~780): c1b1 is editing that file; left to
  avoid a conflict. Whoever next touches DecidingNumber can update them.
- Translation choices that are the high-jump metaphor (de Latte, es listón, it asticella, nl lat, pl
  poprzeczka, ru планка, tr çıta): not ambiguous with music in those languages, so kept (leg rule).
  pt-BR "meta" (target) is a weaker fit for a minimum; kept, open point below.
- The short chip forms (de Latte, ko 기준, vi mức) where the file already used them.

## Gates

- tsc: pass (`/tmp/coach-pm/tsc.log`).
- vitest: 380 of 381 files, 11468 tests pass; the one file is the known `TabStage.render.test.tsx`
  (`Denied ID …Bravura.woff2?url`, the node_modules symlink) (`/tmp/coach-pm/vitest.log`).
- build: pass (`/tmp/coach-pm/build.log`).
- Layout: session, result-number, grading, session-polish: 174 passed (`/tmp/coach-pm/layout.log`).
- paths check / test:paths:rust: not needed (no pack text changed).

## Open points

- English chip "Passed · Pass mark 85%" repeats "pass"; it reads fine but c1b1 may prefer "Passed · 85%
  needed" in the new note design.
- pt-BR "meta" vs a true minimum ("nota mínima"): an owner/native-reader call.
- The e2e regexes changed with the English; the e2e probe was not run in this leg.
