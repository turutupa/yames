# T07 — Adaptive drill decisions come from the engine, not the model

Size: S. Branch: `phase0/t07-adaptive-drill`. Parallel-safe. Good first
task.

## Goal

The adaptive speed drill always moves according to the engine's own
accuracy thresholds. The LLM may only comment on a decision that has
already been made.

## Why (the bug)

- `src-tauri/src/engine.rs` ~line 488 has `adaptive_thresholds(...)`
  (up/down accuracy thresholds and step sizes per aggressiveness) and
  at ~line 1357–1385 uses them — **unless** a model decision was stored
  in the `adaptive_model_decision` atomic, which overrides them.
- `src/hooks/useSession.ts` ~line 779–810 listens to `onAdaptiveEval`,
  and when `coachLoadedRef.current` is true it calls `coachGenerate`
  with a free-text prompt (`formatAdaptiveEvalContext`, ~line 2246) and
  parses the first line with `parseAdaptiveDecision` (~line 2270),
  which returns `"hold"` for anything that isn't `UP`/`DOWN`.
- In shipped builds the LLM is not compiled (see ROADMAP §2), template
  replies never start with UP/DOWN, so every decision becomes `hold` and
  overrides the thresholds. Anyone who downloaded a brain gets a drill
  that never changes tempo.

## Steps

1. `engine.rs`: remove the override. Delete `adaptive_model_decision`,
   the `DECISION_*` constants and the `swap` at ~1368; the direction is
   always computed from `adaptive_thresholds`. Keep the
   `AdaptiveEvalRequest` event but add the engine's decision to it
   (`decision: "up" | "hold" | "down"`, plus `newBpm`).
2. `commands.rs`: delete `set_adaptive_decision`; `lib.rs`: unregister
   it; `src/ipc.ts`: remove `setAdaptiveDecision` and extend the
   `AdaptiveEvalRequest` type.
3. `useSession.ts`: the `onAdaptiveEval` handler no longer decides. If
   a model is resident, ask for a one-sentence comment on the given
   decision (rewrite `formatAdaptiveEvalContext` to include the
   decision and forbid changing it; keep the numbers-lock rule). Without
   a model, use a template line (add `drill_step_up` / `drill_step_down`
   scenario strings to `src/coach/templateCatalog.ts` for the `generic`
   vocabulary at minimum). Delete `parseAdaptiveDecision`.
4. Tests: Rust unit tests for `adaptive_thresholds` (all three
   aggressiveness values, boundary scores); vitest for the new comment
   prompt/template path.

## Acceptance

- `bun run test:rust`, `bun run test`, `tsc --noEmit` green.
- Manual under `npm run tauri dev` (no LLM feature): run an adaptive
  drill with a brain downloaded; the tempo goes up after good rounds and
  down after bad ones; a comment line appears in the feed.
- No other engine behaviour changes (beat log, ramp modes `linear`,
  `zigzag`, `cyclic` untouched).
