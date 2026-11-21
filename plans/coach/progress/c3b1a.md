# Leg c3b1a: the tool test set's first half, the grammar, the choice prompt, the harness, the rule baseline

Branch `coach-c3b1a` (from `coach`). Logs in `/tmp/coach-c3b1a/`. No UI, no strings, no app wiring.

## What landed

| File | What |
|---|---|
| `evals/coach/tools/<lng>.jsonl` | 252 hand-written items: en / es / de 36 each (24 call, 4 which, 4 yours, 4 none), the other twelve 12 each (8 call, 1 which, 1 yours, 2 none). Written by one sonnet helper per language (or group), re-read by a second. |
| `evals/coach/README.md` | Held out (never for training), never generated from the app's tables, the format, the sha256 of each file. |
| `src/coach/ask/evalWorld.ts` | The item format and `parseItem` / `parseSetFile`; a situation -> `CoachContext` (`contextFor`) and an eval host (`evalHost`: the Paths in the item's language, 3 followed Paths, 3 jams, 3 presets, a 3-part plan, settings); `effectOf` (a call run through `runCoachTool` as plain data); `judgeExpected` (the runner is the judge; `notWiredYet` counts as accepted). |
| `src/coach/ask/evalCards.ts` | THE card list (`EVAL_CARDS`, `CARD_IDS`): empty, the cards are not on `coach`. One edit for c3b1b. |
| `src/coach/ask/grammar.ts` | `choiceGrammar(catalogue, cards, situation?)`: GBNF for `{"tool":…,"args":{…}}`, `{"card":…}`, `{"answer":"none"|"which"|"yours"}`; enums closed, queries `qc{1,60}`, integers by digits, optional args as groups, `ws ::= " "?`; `situation.possible` narrows the tools. `parseChoice`. Fixture `choice-grammar.gbnf` (7.9 KB). |
| `src/coach/ask/choicePrompt.ts` | `choicePrefix` (static, byte-identical, <= 900 est. tokens) and `choiceContext` (<= 450, lines dropped whole). |
| `src/coach/ask/evalRun.ts`, `evalEntry.ts` | `rulesAnswer` (router as `answerTyped` runs it, whole-words rule, a name that names nothing goes on, then `answerSearchFor`), `askRequestFor`, `modelAnswer` (only `answered` is an answer), `scoreItem`, `summarize`, `summaryMarkdown`. |
| `scripts/coach-eval.mjs` | esbuild bundle (Vite's eager `import.meta.glob` written out by a small plugin; lazy ones become `{}`); `rules`, `requests`, `model`, `score`, `check`, `titles`, `prompt`, `grammar`. `--out` has no default. |
| `src-tauri/src/bin/coach-eval.rs` | Generate only: requests JSONL -> `load_model` -> `coach::ask` (via `yames_lib::probe`, no `coach.rs` change for the bin) -> outcomes JSONL (`status`, `text`, `promptMs`, `totalMs`, `prefixCached`, `id`). Without `coach-llm` it exits 2. No `Cargo.toml` change: bins under `src/bin/` are auto-discovered, gated with `cfg` as the probe is. |
| `src-tauri/src/coach.rs` | ONE test, in `ask_tests`: `the_generated_choice_grammar_passes_the_precheck` (include_str of the fixture; precheck Ok; elements and stacks under half the caps). Nothing else. |
| Tests | `evalSet.test.ts` (validator: parse, names exist, the runner accepts every expected call per language, this half's counts, hashes = README; the full-mix count test is `it.skip`, c3b1b's), `grammar.test.ts`, `choicePrompt.test.ts`, `evalRun.test.ts`. |

## Decisions

- **Counts**: the minimums (12 a language, 36 in en / es / de) add to 252, more than the "about 180" in the
  prompt; the minimums were kept. Mix 2 : 1 (call : ask-or-refuse) in every language.
- **The answer object has `which` and `yours` besides `none`** (`{"answer":…}`): without them a model cannot
  ask or refuse, and "asked when unsure" could not be scored.
- **A call is scored by what the app would do**, not by its spelling: two calls with the same receipt or
  proposal line are the same action; a call the runner refuses did nothing (never a wrong action); a
  runner "Which one?" counts as asking. `none` / `which` / `yours` / a search passage are never wrong actions.
- **Wrong-screen requests are `none`** (tagged `wrong-screen`): the app refuses them and changes nothing.
- **The rule baseline includes Path search** (c2ca); no cards (not on `coach`), no help set.
- Writers were told not to use `show_bars`, `explain_screen`, `loop_bars`, `make_exercise` (no song in the
  world; the others are not wired).

## Numbers

Rule baseline (`/tmp/coach-c3b1a/rules-2/summary.md`): 252 items, right tool 25/168 (15%), wrong actions 0,
asked 11/24, yours 11/24, none 36/36, search answered 2. Per language: en 8/24 tools, es 5/24, de 3/24, it 2/8,
pl 2/8, fr / nl / ru / ja / zh-CN 1/8, pt-BR / tr / vi / ko / zh-TW 0/8. The router is built to prefer
nothing to a guess: it misses most chatty wordings and never acts wrongly here.

Smoke run (pipe only, NOT a measurement; Qwen3 0.6B Q8_0, CPU build, 20 items, all `call` items, busy
machine): 20/20 answered, right tool 16/20, right args 12/20, wrong actions 4, median 29 s, p90 48 s; the
prefix cached from the second request on (`promptMs` 1.5 to 14 s cached against 14.4 s for the first).
`/tmp/coach-c3b1a/smoke/`.

## For c3b1b (the card items)

1. Point `EVAL_CARDS` (`src/coach/ask/evalCards.ts`) at the cards' own list (id + one-line note).
2. Regenerate the fixture: `node scripts/coach-eval.mjs grammar --out src/coach/ask/choice-grammar.gbnf`
   (or `UPDATE_CHOICE_GRAMMAR=1` with `grammar.test.ts`); `npm run test:rust` re-checks it.
3. Write the ~120 card items with the same kit (`/tmp/coach-c3b1a/WRITER-KIT.md` / `READER-KIT.md` are the
   briefs used; copy them, adding the card list) into the same files, ids continuing.
4. Turn on the skipped full-mix test in `evalSet.test.ts`, record the new hashes in the README.
5. Check the prefix with 40 cards still fits 900 (`choicePrompt.test.ts` reports but does not gate it now).
6. `rulesAnswer` gets the card matcher between the router and search.

## For c3b2

- `node scripts/coach-eval.mjs model --bin <target>/release/coach-eval --gguf <file> --out <dir>`
  (`--grammar full` for the "stock with the grammar but no narrowing" arm; `--deadline-ms` up to 60000).
  The four arms of TOOLS 3.5 need a "no grammar" and a "plain prompt" switch: not built.
- The 0.6B smoke shows the prefix cache works across items (one decode of the ~900-token head).
- The router runs first today; with a 15% right-tool baseline and 0 wrong actions, a model must add calls
  without adding wrong actions: run the model only where the router says `none`, and score both orders.
- Cancelling an Ask on Take start, the CPU-thread question, tip latency with a resident Ask prefix (c3a
  finding 6): nothing measured here.
- The rule baseline's `which` misses (13/24) are mostly words that name several Steps or a Path and a jam.

## Gates

- tsc: pass (`coach-c3b1a-tsc-2`). Eval vitest files: 39 passed, 1 skipped (`coach-c3b1a-vt-2`).
- build: pass (`coach-c3b1a-build`).
- `npm run test:rust`: 1229 passed, 1 failed: `timing::tests::sixteenths_light_one_by_one_while_the_pass_is_running`
  (a wall-clock test, "judged 783 ms later" under load; `timing.rs` untouched by this leg). The new
  precheck test passed. `/tmp/coach-c3b1a/rust.log`. That test alone, re-run: pass (`coach-c3b1a-rust-timing`).
- Smoke: the bin builds and runs with `--features coach-llm` (release), `coach-c3b1a-smoke`.
- Full vitest: 48430 passed, 11 skipped; the one file failing is the known `TabStage.render.test.tsx`
  (Bravura through the symlink). `/tmp/coach-c3b1a/vitest.log`.
