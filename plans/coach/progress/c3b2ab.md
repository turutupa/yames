# c3b2ab: the review's fixes to c3b2a (M1, M2, L2, L3)

Branch `coach-c3b2a` (same worktree). Logs `/tmp/coach-c3b2ab/`. Review: `/tmp/coach-orch/c3b2a-review.md`.

## Fixes

- **M1** (a chip's words reached the model without the tool's answer): `askContext.ts` exports
  `answeredByTool`; `askModelTurn.ts` `lastUserText()` skips a `user` turn it would skip (one rule with the
  old chat's prompt). Tests (`askModelTurn.test.ts`): a typed command, then a typed line, and a chip press,
  then a typed line: the request's `context` has no `Before:`; a line only the plain statement answered is
  still the `Before:`.
- **M2** (a model's `go` proposal could stop the click without saying so): `run.ts` `confirmCoachTool` asks
  `stopsAtPress` again (a `go` tool that leaves: `leavingStops`; a `confirm` tool that leaves, i.e.
  `start_today`: `host.sounding()`, as `run` asked it at the mint). Something would stop and the line did not
  say so: `notNow` / `coachTools.why.notNow.sounding`, and the proposal stays issued. Same three lines for
  both kinds, so `start_today`'s staleness is fixed here too. Ask: `pressProposal` keeps the card open with
  the reason as a note (`note` on the proposal body, `ask-proposal-note` in `AskToolTurn.tsx`); `run.ts`
  exports `proposalOpen`. Tests: `askModelTurn.test.ts` (model proposal, click started, press refused,
  nothing moves, card open with the note; click stopped, press goes), `practice.test.ts` (start_today the
  same; a proposal that said "stops the click" still starts while it plays).
- **L2** ("Getting ready…" promised a retry nothing makes): reworded as the fact by reusing the existing
  `ask.reply.gettingReady` ("The model is still getting ready. Ask again in a moment.", already in fifteen
  locales); `ask.model.gettingReady` removed from all fifteen. No retry.
- **L3** (two lines promised words the model does not write): `ask.model.working` "Looking for more in my own
  words…" → "Looking for more…"; `ask.footer.choice` "…and in its own words on this computer…" → "…with
  help from the model on this computer…"; fifteen locales (sonnet helper, second pass).

## Not done here

- L1 (the CPU gate) belongs to the leg that turns a language on. L4 (a jam take render on cancel), L5
  (Notebook tab cancels a turn: acceptable, now written here), L6: for c3b2b.

## Gates

(below, after the merge with `coach`)
