# Leg c3b2a: the model chooses, wired into Ask (English machinery and tests; ships dark per language)

Worktree `/home/dgx-delgado/yames-coach-c3b2a`, branch `coach-c3b2a`. Logs under `/tmp/coach-c3b2a/`.

PLAN's c3b, the app half. c3b2b (after you) measures stock Standard and Studio with c3b1's harness and
fills the per-language switch you build here; c3d trains a router only if those numbers fall short.
**Needs merged: c3b1** (`src/coach/ask/grammar.ts` `choiceGrammar`, `choicePrompt.ts`, the test set,
`scripts/coach-eval.mjs`), **c2cb** (the answer chain in `answerTyped`), **chip1** (it edits `run.ts`,
`askTools.ts`, `AskPanel.tsx` as you do). Not beside pol2, t2c or any leg in those three files.

Read: `plans/coach/progress/c3a.md` ("What landed", "For c3b", "Review fixes", "What remains
uninterruptible"), `c3b1.md` (all of "For c3b2"), `t1a1.md` (the runner: `runCoachTool`,
`confirmCoachTool`, `mint`, `dryRun`, `runGo`), `t1b1.md` (`runAskCall`, `pressProposal`, `onePress`),
`ms1.md` (`coachBrainTier`, residency), `PROGRESS.md` (the probe section's "For c3b"). Design,
read-only: `DESIGN.md` 5.3, 5.4, 5.5, 9.4, 13; `TOOLS.md` 2.5, 3.5. `NEXT-LEGS-s4b.md` judgement calls 1 to 6.

## The owner's rules where they bite here

- **A tool call the model chose never runs at once.** Every `go` and `confirm` call from the model comes
  back as a one-press proposal ("Open Alternate Picking · Step 7?" with the tonal button and Not now),
  whatever the wrong-action rate. The owner's chip decision (one press of a chip is the press) covers
  chips only. A `read` tool or a card from the model is an answer, shown at once (judgement call 2).
- Never-tools stay unreachable: they are not in the grammar (c3b1 tests it); keep `checkCall`'s
  `audience: "player"` check on the model's path too.
- Nothing during a Take: no generation starts in a Take, and one in flight is cancelled when a Take
  starts. Ask is not mounted during a Take (`MainWindow.tsx`, `askState.open && askShownOn(view)`);
  the cancel must not depend on that alone.
- Only `answered` is an answer. `truncated`, `deadEnd`, `timedOut`, `cancelled`, `noModel` and a parse
  that fails mean the rule-made answer stands and nothing more is shown.

## What to build

1. **`src/coach/ask/model.ts` (new), pure where it can be**: `askModelChoice(question, situation,
   deps)` builds the request from c3b1's `choicePrompt` (the prefix byte-identical turn to turn; what
   changes goes in `context`) and `choiceGrammar(catalogue, cards, situation)`, sends it with
   `coachAsk` (`mode: "choice"`, `deadlineMs` 8,000, one `newGenerationId()` a turn), and parses the one
   object into `{ kind: "call", call } | { kind: "card", card, args } | { kind: "none" }`. Tests with
   the typed mock: every outcome status maps as above; a malformed object is `none`; a `grammar:`
   rejection is logged once and is `none`.
2. **Token budgets, tested** (DESIGN 5.5): prefix ≤ 900, context ≤ 450, last exchange ≤ 150, output 48,
   with c3a's estimate. A context that would pass 450 is cut by rule (oldest first), never sent over.
3. **The speed gate, `asksUseModel(caps, tier, lang, sounding)`**, pure, one function: true only when a
   model is resident, the tier is not Off, **the language is on for that tier** (item 6), the
   measured median of this run's `answered.totalMs` for choices is ≤ 8,000 (before any is measured: on
   a GPU backend yes, on `BACKEND == "cpu"` no, as `should_use_model` does for tips), and, on a CPU
   backend, nothing sounds (`host.sounding()` is null). The last clause is the probe section's "keep
   model answers off while the click plays": llama-cpp-2 0.1.146 has no per-call thread setter (threads
   are fixed at context creation, `inference_threads()`), so capping threads per generation is not
   reachable through the safe API (verified by grep; judgement call 5). A table test over the clauses.
4. **Where the model sits** (judgement call 1): a router command, a card match or a help match ends the
   turn and the model is not called. Otherwise the rule-made answer (search's passage, or the plain
   statement) shows at once, and, when `asksUseModel` is true, the model is asked; meanwhile the panel
   shows "Looking for more in my own words… Stop" (mock 11; Stop calls `cancelGeneration`). An
   `answered` card or `read` call is added under the rule-made answer with its own source label; a `go`
   or `confirm` call is added as a proposal; `none` adds nothing. A table test over typed lines names
   which engine answered and whether the model was called.
5. **Model calls as proposals**: an option on the runner (`runCoachTool(call, host, ctx, registry,
   { via: "model" })` or a separate export; your choice, named in the report) that returns every `go`
   tool as a proposal by the existing dry-run path (`dryRun`, keys under `coachTools.propose.`), and
   `confirmCoachTool` accepting such a proposal once. Tests: each `go` tool via the model is a proposal
   and changes nothing until pressed; Not now drops it; a Take started between proposal and press
   refuses (the existing `checkContext`); chips and typed commands behave exactly as before.
6. **The per-language switch**: `MODEL_LANGS: Record<"standard" | "full", readonly Lang[]>`, **empty
   in this leg** (the model path ships dark). c3b2b fills it from measured numbers: a language is on
   for a tier only with right tool ≥ 90% (TOOLS 3.5). Test: an empty list never calls `coachAsk`.
7. **Cancel**: a Take starting (`takeStarted` on the coach bus), the panel unmounting, a new turn, or
   Stop cancels the turn in flight (`cancelGeneration`). Tests for each with the typed mock.
8. **Strings** (English, then fourteen locales by sonnet helpers with `plans/COACH_I18N_BRIEF.md`):
   the working line and Stop, "Getting ready…" (DESIGN 5.5), the footer's model variant ("…and in its
   own words on this computer. Nothing leaves it."), the proposal lines the dry run needs if any `go`
   tool lacks a `coachTools.propose.*` key today. Under ten keys; if more, stop and say why.
9. **Layout scenes** (pictures only when `YAMES_SHOT_DIR` is set): the working line under a passage,
   a model proposal, at 1440 with the dock and in the drawer at 1024; one Manuscript, one German.

## Not yours

Running the measurements and filling `MODEL_LANGS` (c3b2b). Prose (c3c). Training (c3d). The worker
(c3a's Rust is done; a change there stops the leg). The selector, downloads, Settings.

## Gates

tsc, vitest, build; layout by name: `ask.spec.ts`, `ask-tools.spec.ts`, `coach-model.spec.ts`,
`short-window.spec.ts`, `smooth.spec.ts` (Ask commits nothing during a running Take), your scenes. No
probe: no new background compute runs while `MODEL_LANGS` is empty (c3b2b owes the probe).

## Report

As the rules block's "The end of the leg", plus: the engine table, the gate's clauses, which outcome
statuses you saw in the mock tests, and a **diff for review** paragraph naming every hunk in
`src/coach/tools/run.ts` (the model-origin proposal and `confirmCoachTool`), `askTools.ts`,
`AskPanel.tsx`, `askStore.ts` and `ipc.ts` if touched.
