# c2cb: the help set, `explain_screen`, help and search wired into Ask

Branch `coach-c2cb` (from `coach` at `aadecbdd`). Logs `/tmp/coach-c2cb/`.

## Status

Items 1 to 5 done (English read against the code by a sonnet helper, eight fixes taken; fourteen locales by
three sonnet helpers). Item 6 (scenes) handed to c2cc: `c2cb-HANDOFF.md`. `coach` merged in.

## Gates (logs in /tmp/coach-c2cb/)

- tsc after the merge: pass (`coach-c2cb-tsc-3`). Build: pass (`coach-c2cb-build`).
- vitest full (`vitest.log`): 51270 passed; failed only the known `TabStage.render.test.tsx` (symlink) and two of
  mine (the namespace list, a chip test), fixed and re-run with the i18n / parity / Ask files: 111 passed (`coach-c2cb-vt3`).
- Layout `ask ask-tools short-window phone-header ask-cards ask-typed` (`layout.log`): 132 passed, 15 failed, every
  one a 30 s timeout loading the shot page at load 40+; `ask-tools` + `ask-cards` again with `--workers=2`: 23 of 23
  passed (`layout-2.log`).

## Also changed

- The seven `ask.json` keys that said typed questions need a model are removed in fifteen locales (listed in
  `localeKeys.test.ts`' `DELIBERATELY_REMOVED`); their places are `help.ui.*`.
- The tuning line also runs before the cards (not only before search).

## What landed

| File | What |
|---|---|
| `src/coach/ask/help.ts` (new) | `HELP`: 39 entries (19 screens incl. the Session's five phases, the model selector, Settings, Ask; 20 words), places, English names; `helpForScreen` (typed complete: `Record<CoachScreen>` and `Record<RunPhase>`), `explainScreen`, `helpCard`, `isHelpLine`, `TUNING_KEY`. |
| `src/coach/ask/helpMatch.ts` (new) | `matchHelp` (English, exactly one entry or null), `asksAboutTuning`. |
| `src/coach/ask/cards.ts` | `CardShape` gains `AnswerShape = "help" \| "search"` (not cards; never in `FACT_CARDS` or the registry). |
| `src/coach/tools/read.ts` | `explain_screen`'s `run` returns the entry (name, kind, note, args unchanged). |
| `src/coach/ask/suggest.ts` | `SCREEN_HELP_CHIP` ("What is this screen for?") last in Ask's empty state, cards keep two places. |
| `src/containers/coach/askAnswerers.ts` (new) | tuning → cards → help → search, one function each; `typedRuleAnswerer` for the slot. |
| `src/containers/coach/askTools.ts` | `writeOutcome`: a help-entry receipt (typed "explain this screen") is written as a help card. |
| `src/containers/coach/askCards.ts` | `cardBodyFor(explain_screen)`: the help card (the chip). |
| `src/containers/coach/AskPanel.tsx` | slot plugs `typedRuleAnswerer`; empty text / placeholder / footer keys; "About your last Take:" only over a Take card. |
| `src/containers/coach/useCoachPanel.ts` | the plain statement's keys (`help.ui.reply.*`). |
| `src/locales/en/help.json` (new) | every string of this leg. |

## Engine order

router → tuning (English) → cards (English) → help (English) → search (every language) → the model (when one is
ready) or the plain statement. Tuning sits before the cards too, so nothing that mentions tuning answers it.

## To translate

Every key of `help.json`.
