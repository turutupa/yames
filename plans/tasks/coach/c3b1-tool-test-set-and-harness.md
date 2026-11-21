# Leg c3b1: the hand-written tool test set, the grammar from the registry, and the eval harness (no model needed)

Worktree `/home/dgx-delgado/yames-coach-c3b1`, branch `coach-c3b1`. Logs under `/tmp/coach-c3b1/`.

PLAN's c3b, the model-free half. c3b2 (later, not briefed) measures stock Qwen3 4B / 8B with what you
build and wires `ask/model.ts` into the app; c3d (approved by the owner 2026-11-20 18:35, after c3b2's
numbers) may train a small router. **Needs t1b2b, c2b1b and c2b2a merged** (the fifteen command tables
and every card id the expected answers name); c2ca / c2cb if merged (the baseline then includes search
and help). It edits no Ask UI file: it may run beside c2b2b, c2cb, pol2 and the c4 legs.

Read: `plans/tasks/coach/BRIEF.md`; `plans/coach/progress/t1a1.md` (`COACH_TOOLS`, `toolCatalogue()`,
`TOOL_CATALOGUE_VERSION`: player tools only, plain data, "the generator's input"), `t1a2.md`,
`t1b2a.md`, `t1b2b.md` (the router, `answerTyped`), `c2b1a.md`, `c2b2a.md` (card ids), `c3a.md` (all of
"For c3b" and "Review fixes": `AskRequest`, `AskOutcome`, budgets, `precheck_grammar` and its bounds,
the cached prefix). Design, read-only: `TOOLS.md` 2.1, 2.3, 3.4 (item 4: the hard cases and the 4 / 4 / 2
mix), 3.5 (all of it); `DESIGN.md` 5.3 (engine 4a), 5.5 (budgets: system and intent list 900, context
450, output 48), 10 (C3b's row), 13.

## What to build

1. **The test set**, `evals/coach/tools/<lng>.jsonl`, one item per line: `id`, `lang`, `situation` (the
   screen and the plain facts the router and `when(ctx)` read: Session phase, whether a tempo / minutes
   can be set, the Path / Step / Exercise showing, grading), `text` (what a player types), `expect`
   (`{ kind: "call", tool, args }` | `{ kind: "card", card, args }` | `{ kind: "which" }` | `{ kind:
   "yours" }` | `{ kind: "none" }`), `tags` (terse / chatty / typo / slang / near-miss / never /
   ambiguous / wrong-screen), `writer`, `reader`. **About 300 items, at least 20 per language**, and at
   least 60 in each of en, es, de (DESIGN C3b). The mix of TOOLS 3.4: about four in ten actions, four in
   ten answers (cards), two in ten ask or refuse. Names are real titles from the pack overlays in that
   language.
2. **Written by hand, cross-read**: sonnet helpers, one writer per language (or two languages) given
   the registry's descriptions, the card list, the locale's own UI words and the item format; a
   **second sonnet helper per language re-reads** every item as a native player would type it, fixes
   the unnatural ones and marks each `reader`. You read every English item and a sample of each other
   language for sense. **Never generated from the app's own templates or command tables** (that would
   measure the tables against themselves); say so in a header file `evals/coach/README.md`, and that
   **this set is held out: never used for training** (c3d must check it; record a hash of each file).
3. **A validator test** (vitest): every item parses; every `expect` names a tool or card that exists;
   every expected `call` is accepted by `when(ctx)` and resolution in its situation (the runner is the
   judge, TOOLS 3.4); counts per language and per kind meet item 1. A tool or card renamed later fails
   this test, not the eval.
4. **The grammar from the registry**, `src/coach/ask/grammar.ts`: `choiceGrammar(catalogue, cards,
   situation?)` → GBNF for one object (`{"tool":…,args}` or `{"card":…,args}` or `{"answer":"none"}`),
   argument values from closed sets, `query` as a bounded string, **`ws` bounded** (`" "?` or
   `[ \t\n]{0,2}`; c3a's note). Tests: generated, never hand-written; no never-list tool can appear; a
   Rust test (`npm run test:rust`) feeds the generated grammar (written to a fixture by the TS test) to
   `coach::precheck_grammar` and it passes the size, rule, alternative, depth and stack bounds.
5. **The prompt for a choice**, `src/coach/ask/choicePrompt.ts` (pure): a prefix that is **byte-identical
   turn to turn** (no time, no counter: a test) holding the tool and card list with one-line
   descriptions, and a context string from the situation; a token-budget test (prefix ≤ 900, context ≤
   450 tokens, with the tokenizer estimate c3a used). c3b2 uses it in the app.
6. **The harness**: `scripts/coach-eval.mjs` (bundles the TS it needs with esbuild, as `scripts/paths.mjs`
   does) builds one request per item, calls an engine, scores, and writes `results.json` and
   `summary.md` to a folder given by `--out` (no default; never a fixed `/tmp` path).
   `src-tauri/src/bin/coach-eval.rs` (feature `coach-llm`; **generate only**: reads requests as JSONL,
   loads `--gguf`, runs each through the same Ask path as `coach_ask` with its grammar and deadline,
   writes outcomes with `promptMs`, `totalMs`, `prefixCached`). Scores, per language and overall: right
   tool, right arguments, **wrong-action rate** (did or proposed anything other than asked; "none" or
   "which" is never a wrong action), asked when unsure, and time (median and slowest tenth). **Only
   `answered` is an answer**: `truncated`, `deadEnd`, `timedOut`, `cancelled`, `noModel` count as no
   answer (c3a), reported as their own column.
7. **The baseline with no model** (`--engine rules`): the same set through the rule chain the app runs
   today (`answerTyped`'s router, the English card matcher, search and help if merged). Its numbers in
   the report per language: this is what every device already gets, and what c3b2's model must beat
   without raising the wrong-action rate.
8. **A smoke run with a model**, to prove the pipe only: Qwen3 0.6B
   (`~/scratch/yames-c3a-models/Qwen3-0.6B-Q8_0.gguf`), CPU build, twenty items, as a queue job
   (`--ram 8G --est 20m`). Its numbers are not a measurement; say so.

## For c3b2, not yours (from `HANDOFF-ORCHESTRATOR.md` "c3b must" and `PROGRESS.md` "For c3b")

Measuring Standard and Studio four ways (TOOLS 3.5) on a GPU and a CPU; `ask/model.ts` and the speed
gate `asksUseModel` (8 s a turn); **how the router and the model meet** (today the router runs first;
your baseline is the evidence); a tip's time with and without the cached Ask prefix (c3a finding 6);
**cancelling an Ask generation when a Take starts**; on a CPU-only build, capping the generation's
threads or keeping model answers off while the click plays, measured with the probe; checking that a
chip's words never reach the model without the tool's answer (t1b2a fixed `askPrompt`). Write
anything you learn about these in `progress/c3b1.md` under "For c3b2".

## Gates

tsc, vitest, build; `npm run test:rust` (the grammar fixture test; the new bin compiles with
`--features coach-llm`). No layout run. No probe (nothing runs in the app).

## Report

As the rules block's "The end of the leg": the set's counts (language × kind), what the cross-readers
changed, the rule baseline's table per language, the smoke run's line, the file hashes, and "For c3b2".
