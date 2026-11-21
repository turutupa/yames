# c2cb: the help set, `explain_screen`, help and search wired into Ask

Branch `coach-c2cb` (from `coach` at `aadecbdd`). Logs `/tmp/coach-c2cb/`.

## Status

Items 1 to 4 written (English); gates running. Item 5 (fourteen locales) by sonnet helpers after the English
proofread. Item 6 (scenes) pending.

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
