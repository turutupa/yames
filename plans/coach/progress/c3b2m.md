# Leg c3b2m: stock Qwen3 4B (Standard) and 8B (Studio) measured on the held-out tool set

Branch `coach-c3b2m` (from `coach`). Logs in `/tmp/coach-c3b2m/`; raw outputs (requests, outcomes,
results.json, per-run logs, the frozen binary) in `/home/dgx-delgado/scratch/yames-c3b-results/`.
Committed: the harness arms and the summaries in `evals/coach/results/2026-11-20-*.md`
(`2026-11-20-tables.md` is every table below and the per-language rows). No app change.

## What landed

| File | What |
|---|---|
| `src/coach/ask/evalRun.ts` | `askRequestFor` takes `grammar: situation \| full \| none` and `prompt: notes \| names`; `chainAnswer(order, rules, model)`; `ItemScore.prefixCached`; `Summary.noAnswerBy`, `prefixCached`; `commonErrors` / `errorsMarkdown`. |
| `src/coach/ask/choicePrompt.ts` | `choicePrefix(…, { notes: false })`: each tool as `name(args)` without its line (the "plain prompt" arm). The default output is byte-identical to before. |
| `scripts/coach-eval.mjs` | `--grammar none`, `--prompt names`; `chain --outcomes F --order rules-first\|model-first`; `errors.md` beside `summary.md`; the set's sha256 checked against the README before requests are written. |
| `src-tauri/Cargo.toml` | `coach-llm-cuda-eval = ["coach-llm", "llama-cpp-2/cuda"]`: eval only, off by default, named by nothing else. No new crate (`find_cuda_helper` was already in the lock). |
| Tests | `evalRun.test.ts`: the two arms' requests, strict reading of a raw answer, both chain orders, the error grouping, no-answer by status. |

## The build

**CUDA worked on the first try** (`coach-c3b2m-cuda-build`, 8 min 45 s, env `CUDACXX=/usr/local/cuda/bin/nvcc
CUDA_PATH=/usr/local/cuda CUDAARCHS=121`). `coach::llm::BACKEND` still says `cpu` on it (no `coach.rs`
change), so the runs set `YAMES_LLM_GPU_LAYERS=99`: the log shows 37/37 layers on CUDA0 (GB10). The binary
was copied to `…/yames-c3b-results/coach-eval-cuda` so another leg's build cannot replace it mid-run.
One run (4B, no grammar) died at `cudaSetDevice` with "CUDA error: out of memory" when the machine was
full; re-run unchanged, it passed.

```
bash …/plans/coach/tools/run.sh cargo build --release --manifest-path src-tauri/Cargo.toml --features coach-llm-cuda-eval --bin coach-eval
node scripts/coach-eval.mjs model --bin <bin> --gguf <gguf> --out <dir> [--grammar situation|full|none] [--prompt notes|names]
node scripts/coach-eval.mjs chain --outcomes <dir>/outcomes.jsonl --out <dir2> --order rules-first|model-first
```
The scripts used: `…/yames-c3b-results/run-arms.sh`, `run-chains.sh`, `tabulate.mjs`, `unread.mjs`.

## How the prompt handles Qwen3's thinking

The app's Ask path decides it (`coach::ask_prompt_head` / `ask_prompt_tail`): `/no_think` at the end of
the system turn and an empty `<think>\n\n</think>` prefilled into the assistant turn, then `strip_think` on
the output. So none of the 48 tokens of `ASK_CHOICE_MAX_TOKENS` goes to reasoning: no outcome of the two
no-grammar runs (the only ones where it could show) contained `think`, and the budget cut one answer in 2,016 (4B, shipped arm: `truncated` 1). Not tested:
a thinking turn (it could not fit in 48 tokens anyway).

## Numbers (252 items: 168 calls, 24 which, 24 yours, 36 none; prefix cache on; deadline 8 s)

Times are THIS machine's (GB10, CUDA, all layers on the GPU), per item, prefix cached on 251/252 (the
first item decodes it). The target's latency is the relay's (RTX, Vulkan, 4B: chat p50 0.511 s for 34
tokens), not these.

| run | right tool | right args | wrong action | asked (which) | no answer | median | p90 |
|---|---|---|---|---|---|---|---|
| rules alone | 25/168 (15%) | 25/168 | 0/252 (0%) | 11/24 | 0 | - | - |
| 4B shipped (grammar narrowed, descriptions) | 139/168 (82.7%) | 99/168 (58.9%) | 37/252 (14.7%) | 4/24 | 2 (truncated 1, unread 1) | 0.61 s | 0.89 s |
| 4B grammar full | 139/168 (82.7%) | 99/168 | 37/252 (14.7%) | 4/24 | 2 | 0.66 s | 0.98 s |
| 4B no grammar | 117/168 (69.6%) | 66/168 | 19/252 (7.5%) | 2/24 | 37 (unread 37) | 0.53 s | 0.88 s |
| 4B plain prompt (names only) | 135/168 (80.4%) | 92/168 | 49/252 (19.4%) | 2/24 | 0 | 0.56 s | 0.87 s |
| **4B chain rules-first (shipped arm)** | **130/168 (77.4%)** | 99/168 | **27/252 (10.7%)** | 14/24 | 2 | 0.51 s | 0.83 s |
| 4B chain model-first | 139/168 (82.7%) | 99/168 | 37/252 (14.7%) | 4/24 | 0 | 0.61 s | 0.89 s |
| 8B shipped | 141/168 (83.9%) | 122/168 (72.6%) | 34/252 (13.5%) | 0/24 | 0 | 0.93 s | 1.31 s |
| 8B grammar full | 141/168 (83.9%) | 122/168 | 34/252 (13.5%) | 0/24 | 0 | 0.96 s | 1.34 s |
| 8B no grammar | 141/168 (83.9%) | 119/168 | 24/252 (9.5%) | 0/24 | 0 | 0.92 s | 1.31 s |
| 8B plain prompt | 139/168 (82.7%) | 107/168 | 42/252 (16.7%) | 3/24 | 0 | 0.89 s | 1.22 s |
| **8B chain rules-first (shipped arm)** | **134/168 (79.8%)** | 120/168 | **18/252 (7.1%)** | 11/24 | 0 | 0.76 s | 1.23 s |
| 8B chain model-first | 142/168 (84.5%) | 123/168 | 34/252 (13.5%) | 0/24 | 0 | 0.93 s | 1.31 s |

A rules-first turn the rules answered counts 0 ms; the model ran on 190 of 252 items. The chain's right
tool is BELOW the model alone because a rules answer that is not `none` stands: a router `which` or a
Path-search passage on an item that wanted a call keeps the model from it (9 items with the 4B, 7 or 8
with the 8B).

Per language, the chain (rules-first, shipped arm) meets "right tool >= 90% and wrong action < 2%" in
**0 of 15 languages with the 4B** and **2 of 15 with the 8B** (fr, pt-BR; 8 call items each). Every
per-language row is in `evals/coach/results/2026-11-20-tables.md`. With 8 call and 12 items in twelve of
the languages, 90% means 8/8 and one wrong action is 8%: the per-language gates there are "no miss at all".

### Where the wrong actions come from (shipped arm, model alone; chain in brackets)

- 4B: expected `which` 12 (7), a call but another tool 12 (10), the right tool with other arguments 8 (6),
  `none` 3 (3), `yours` 2 (1). Chosen: show_scale 10, go_to 8, show_chord 5, set_goal 4, set_focus 3, ...
- 8B: expected `which` 17 (8), another tool 9 (5), other arguments 3 (2), `yours` 4 (2), `none` 1 (1).
  Chosen: open_step 8, show_chord 7, go_to 4, show_scale 4, open_path 3, set_setting 3, ...
- Neither model ever really asks: `which` 4/24 (4B) and 0/24 (8B) alone. It cannot know "picking" names
  two Paths: the context lists only the followed Paths, the jams and the presets, never the other titles.
- Many set_setting answers to `yours` items (`mute my mic` -> `set_setting coachVoice none`) are refused
  by the runner (value not allowed) and so are not wrong actions: all 18 such items of the 4B, at least 8
  of the 8B's 11. They are still not the "that one is yours" the player should get.
- No grammar: the 4B's 37 unreadable answers are 35 malformed JSON (an extra `}`, `{"tool":set_minutes`,
  the prompt's shorthand copied as argument names `"at#"`, `"bpm?#"`) and 2 non-scalar values. The 8B
  wrote valid JSON every time, and with fewer wrong actions than under the grammar (24 against 34): the
  grammar forces a tool on an answer the model would otherwise have left malformed or answered otherwise.
- Narrowing the grammar to the situation changed nothing in the tool counts (shipped = full); it moved
  four or five `none` items in the 4B.

### Five common errors per model (all in `errors.md` of each run)

4B: (1) `faster` -> `set_tempo {"bpm":120,"direction":"faster"}` (18 set_tempo items with an invented bpm);
(2) `mute my mic` (yours) -> `set_setting {"key":"coachVoice","value":"none"}`; (3) `open picking` (which)
-> `open_path {"path":"open picking"}`; (4) `muéstrame la pentatónica menor de la` -> `show_scale A
naturalMinor rootOn5` (wanted minorPentatonic); (5) `make part 3 harder` -> `swap_part {"at":3,
"choice":"harder","to":"different"}` (an optional argument filled with junk).
8B: (1) `turn grading off for me` (yours) -> `set_setting practiceView noGrading`; (2) `abre los ajustes` on a
screen with no Settings door (none) -> `yours`; (3) `un poquito mas lento` -> `set_tempo bpm 70 slower`;
(4) `abre acordes` (which) -> `show_chord Am7` (the prompt's own example chord); (5) `apri tapping` ->
`open_step {"path":"Alternate picking","step":1}` (wanted open_path tapping).

## Verdict

**Neither stock tier meets the gate in the chain, in any language but two (8B: fr, pt-BR), and it misses
the wrong-action half by a lot**: 10.7% (4B) and 7.1% (8B) against < 2%, five and three times over. On
right tool the miss is smaller: 77% / 80% in the chain, 83% / 84% for the model alone, against 90%.

- By a little (prompt or description fixes could close part of it; none were made here, the set and the
  prompt stay as they are): the arguments. (a) The argument shorthand lists two enum values then `…`
  (`scale=major|naturalMinor…`, `chord=Am7…`): the models pick the listed examples, so `minorPentatonic`
  becomes `naturalMinor` and an ambiguous "chords" becomes `show_chord Am7`; list the values or give no
  example. (b) Optional arguments get invented values (`set_tempo` bpm beside a direction, `swap_part`
  `to`): say "leave out what the player did not say" in the prefix, or make the grammar's optional
  groups for direction/bpm exclusive. (c) `set_setting language` takes `japanese`, `english`: a value
  list per key. These would raise right arguments (59% / 73%) and remove the "same tool, other
  arguments" wrong actions (6 / 2 in the chain), not the rest.
- By a lot (c3d: a LoRA of the 4B first, then the small router, `plans/tasks/coach/c3d-small-router.md`):
  the decision to act or not. The models act where they should ask (`which`: 7 / 8 wrong actions in the
  chain) or refuse (`none`, `yours`), and pick a different tool on a fifth of the misses. No prompt line
  will teach "this name matches two Paths" without the titles in the context; the context fix (list the
  matching titles) would be a design change, and the remaining refuse-or-act errors are the kind a trained
  router or LoRA exists for.
- The 8B is not a fix on its own: +2 calls right, fewer wrong actions (18 vs 27 in the chain), still
  3.5 times over.
- Latency is not the problem on this machine (median 0.5 to 0.9 s, slowest tenth under 1.4 s) and the
  relay's RTX 4B numbers are in the same range; the latency half of "falls short" is not triggered.

## What these numbers do NOT cover

- The ~120 card items are not written yet (leg c3b1b): "answers" (cards) are not measured; the cards list
  is empty, so the prefix has no Cards section and nothing here says how a model chooses between a tool and a card.
- Latency on a player's machine: the relay's (OWNER-UPDATES, "pv1 Vulkan probe on the RTX"); the times
  here are a GB10 with CUDA.
- The tip-latency question (c3a finding 6), Ask cancel on Take start, and the c3b2a wiring: not here.
- Twelve languages have 12 items each: one item is 8%; treat their rows as indications, not rates.
- A model's `none` on a `none` item scored right also when the rules would have answered: the chain's
  `none` column is the model's.

## Gates

- tsc: pass (`coach-c3b2m-tsc`). Eval vitest files (evalRun, choicePrompt, evalSet, grammar): 45 passed,
  1 skipped (`coach-c3b2m-vt`).
- The CUDA build (`coach-c3b2m-cuda-build`), the 4B smoke (`coach-c3b2m-4b-smoke`), the runs
  (`coach-c3b2m-4b-arms`, `-4b-arms-2`, `coach-c3b2m-8b-arms`).
- `npm run build`: pass (`coach-c3b2m-build`). Full vitest: 49152 passed, 11 skipped; the one file failing
  is the known `TabStage.render.test.tsx` (symlink) (`coach-c3b2m-vitest`, `/tmp/coach-c3b2m/vitest.log`).
- Not run: `npm run test:rust` (no Rust source changed; `Cargo.toml` only gains a feature nothing enables).
