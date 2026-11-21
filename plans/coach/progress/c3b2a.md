# c3b2a: the model chooses, wired into Ask (dark)

Branch `coach-c3b2a`. Logs `/tmp/coach-c3b2a/`.

## What landed

- `src/coach/ask/model.ts` (new, pure where it can be): `MODEL_LANGS` (empty for `standard` and `full`:
  the model path ships dark), `modelLangOn`, the budgets (`ASK_PREFIX_TOKENS` 900, `ASK_CONTEXT_TOKENS`
  450, `ASK_EXCHANGE_TOKENS` 150, `ASK_CHOICE_OUTPUT_TOKENS` 48, `ASK_DEADLINE_MS` 8000), `exchangeLine` /
  `fitContext` (the last exchange is dropped first when the context would pass 450), `askChoicePrefix`
  (memoised, byte-identical), `choiceFactsFrom(ctx, commandFacts, lists)`, `choiceRequest`, `readChoice`
  (only `answered` + a parse is a call or a card; which/yours/none and every other status are `none`),
  the speed gate `asksUseModel(caps, tier, lang, sounding, { medianMs?, langs? })`, `noteChoiceTime`
  (answered `totalMs`; a timed-out turn counts as 8001 ms), `askModelChoice` (one `coachAsk`, a `grammar:`
  rejection logged once).
- `src/containers/coach/askModelTurn.ts` (new): the turn in the thread. `answerTyped` calls it last,
  after the router and the synchronous answerer stack, only when `modelTurnWanted(lang)`; otherwise
  `sendAsk` as before. Plain statement at once, then (gate yes) the working line "Looking for more in my
  own words… Stop", then a card / a `read` receipt / a model proposal replaces it, or it goes.
- Runner: `runCoachTool(call, host, ctx, registry, { via: "model" })`: a `go` tool is run dry
  (`proposeGo`) and minted as a proposal under `coachTools.propose.*`; a refusal or a dry run that moves
  nothing comes back as is. `confirmCoachTool` unchanged (every `go` tool is `leaves: true`).
- `askTools.ts`: `modelCallBody` (proposal bodies get `via: "model"`; a refusal or a non-read receipt adds
  nothing), `onAskTakeStart` (called by `noteAskTake` and `noteAskJamTake(true)`), `askTakeNow`,
  `askToolHost`. `askStore.ts`: turn kind `model`, `settleAskTurn(id, "gone")`, `askTakeGate()`.
  `AskPanel.tsx`: the working line + Stop, unmount stops, footer `ask.footer.choice`. `AskToolTurn.tsx`:
  the model-reading label. `askCards.ts`: `cardBodyFor` exported.
- Strings: `ask.model.{plain,working,stop,gettingReady,reading}`, `ask.footer.choice` (6), 15 locales.

## Cancels (each tested in `askModelTurn.test.ts`)

`takeStarted` on the coach bus; `noteAskTake`; `noteAskJamTake(true)`; Stop; a new typed line
(`answerTyped` calls `stopModelTurn` first); the panel unmounting (`askModelPanel.test.tsx`). None starts
when the take gate, the context's Take or a jam take says so. A result after a cancel is dropped.

## Gates

- tsc: pass (`coach-c3b2a-tsc3`). Build: pass (`coach-c3b2a-build`).
- vitest named (12 files, 509 tests): pass. Full `npm run test`: 50068 passed, 1 file failed: the known
  `TabStage.render.test.tsx` (symlink). `/tmp/coach-c3b2a/vitest.log`.
- Layout `ask ask-tools ask-typed ask-cards coach-model short-window smooth`: 170 passed, 3 failed, all
  `smooth.spec.ts` long tasks (`/tmp/coach-c3b2a/pw2.log`). Re-run of smooth alone: 4 failed
  (`smooth2.log`); `coach` untouched, same spec, same hour: 6 failed (`smooth-coach.log`). Load average
  60 to 107 throughout: not evidence either way. Ask is not mounted in a Take and this leg adds nothing per
  beat. Owed: smooth on a quiet machine.

## Open

- CPU backend: a click starting while a generation is in flight does not cancel it (the gate only stops
  one starting). Dark until c3b2b; worth a hook on `sounding` before a language goes on for a CPU tier.
- Scenes (item 9) not built: the shot harness has no `coach_ask` mock; needs `__setModelLangsForTests`
  in a scene and a mocked answer.
