# c3a: the worker (an Ask kind, a grammar, cancel, a cached prefix, two probe modes)

Branch `coach-c3a`, from `a850d3ed`. Rust (`coach.rs`, `commands.rs`, `lib.rs`, `bin/click-jitter-probe.rs`)
plus the IPC wrapper. Nothing in the app calls the new kind yet (c3b does). No audio callback, engine,
queue, settings or SQLite code touched.

## Investigate first: what was found

**The grammar API at llama-cpp-2 0.1.146** (`Cargo.lock`; source in `~/.cargo/registry/src/.../llama-cpp-2-0.1.146`,
llama.cpp vendored in `llama-cpp-sys-2-0.1.146/llama.cpp`):

- Constructor: `LlamaSampler::grammar(&model, grammar_str, "root") -> Result<LlamaSampler, GrammarError>`.
  The Rust side refuses a string without the root's name in it (`RootNotFound`) or with a NUL; then it
  calls `llama_rs_sampler_init_grammar`, a C++ shim in `wrapper_common.cpp` that wraps
  `llama_sampler_init_grammar` in `try { } catch (...) { return nullptr; }`. llama.cpp's parser catches
  its own exceptions, logs, and returns null for: a syntax error, an undefined rule, a missing root, left
  recursion. Null becomes `GrammarError::NullGrammar`. **A malformed grammar is an error, not a crash**,
  with one exception found by reading the parser: `{m,n}` with `n < m` underflows
  (`n_opt = max_times - min_times`, `llama-grammar.cpp` `handle_repetitions`) and loops allocating
  rules until memory runs out. `coach::precheck_grammar` refuses that before llama.cpp sees it (also: size
  over 32 KB, no `root ::=`, NUL, repeat counts over llama.cpp's 2000).
- What aborts the process (all in llama.cpp, none catchable from Rust):
  1. `llama_grammar_accept_impl` calls `GGML_ABORT` when handed an end-of-generation token while no
     grammar stack is complete;
  2. `llama_grammar_accept_token` **throws** when a token empties the stacks, and leaves the grammar with
     empty stacks; the next `apply` then hits `GGML_ASSERT(!stacks.empty())`;
  3. `LlamaSampler::sample` is `llama_sampler_sample`, which runs `accept` with no `try`: a throw there
     unwinds C++ into Rust, an abort.
  `LlamaSampler::try_accept` goes through `llama_rs_sampler_accept`, which does catch.
- **When the grammar is completed and sampling continues**: `apply` sets every non-EOG token to -inf and
  leaves EOG allowed. With the grammar inside a chain and `sample`, a chain that had filtered the EOG
  tokens out would pick a -inf token, `accept` would throw: abort (case 3). That is the case the
  design's reviewer could not verify.
- Reuse: the crate has no `clone` for a sampler; `reset()` is the only way back to the start state, and
  llama.cpp's grammar reset re-parses the stored string (sub-millisecond for these grammars).

**Shipped, made safe this way** (`llm::sample_step`): the grammar is never in a chain and never under
`sample`. Pick with the chain on the raw logits; check the pick against the grammar on a one-candidate
array (llama.cpp's own `common_sampler` fast path); if refused, apply the grammar to the whole vocabulary,
dead-end if nothing is finite, pick again and re-check. An EOG pick ends the answer and is never given to
`accept` (abort 1). Anything else goes through `try_accept`; a caught throw marks the grammar poisoned and
it is dropped, never reused (abort 2). Compiled grammars are cached per string (8 at most), taken out for a
generation, `reset()` on reuse, put back only if healthy. A runaway `ws` is bounded on the worker: six
whitespace-only tokens in a row under a grammar end the answer (`finished: false`).

**What can be tested here.** `--features coach-llm` builds on this aarch64 DGX through the wrapper (cold
llama.cpp build about 2 min). No small model was on the machine (only 27 B / 30 B / 74 B GGUFs and
llama.cpp's vocab-only files), so **one download**: `Qwen3-0.6B-Q8_0.gguf`, 639,446,688 bytes, from
`https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf`, to
`~/scratch/yames-c3a-models/`. The grammar fuzz uses `~/src/llama.cpp/models/ggml-vocab-qwen2.gguf`
(vocab only, the Qwen3 tokenizer). Also fetched: the crates in `Cargo.lock` (`cargo fetch`, 147 MB of
`.crate` files; the registry had none).

**coach.rs as found**: matches the design except that a longest-common-prefix KV reuse (T04b) already
existed in sequence 0. It saves a shared head only between two consecutive calls; any other kind in
between evicts it. Hence the Ask prefix lives in a sequence of its own (below).

## What landed

- `GenKind::Ask` (serde `"ask"`). `generate` and the template engine refuse it
  (`ASK_NOT_THROUGH_GENERATE`); the six old kinds are untouched: their prompt is now built by
  `coach::chat_prompt` (moved out of `llm::build_prompt`, same format string) and **pinned byte for byte**
  by `ask_tests::the_existing_kinds_prompt_is_byte_identical`, budgets by `the_existing_kinds_keep_their_budgets`.
- `AskRequest { generationId, mode: "choice" | "prose", prefix, context, question, grammar?, deadlineMs? }`,
  `AskOutcome` `answered { text, prefixCached, promptMs, totalMs } | truncated { text, by, ... } |
  deadEnd { why } | cancelled | timedOut | noModel` (as changed by c3ab, "Review fixes" below).
  Budgets: choice 48 tokens (greedy under the grammar), prose 96 (temp 0.7 / top-p 0.9, as the other
  kinds). Context checked at 450 tokens on the worker (error otherwise). One call a turn, no tool loop.
  Its own system lines (`ASK_SYSTEM_PROMPT`) come first, then the caller's prefix; ChatML as the others,
  thinking off.
- Cancel: `coach::cancel` board (id -> flag), `cancel_generation(id)`. Checked before a queued job starts,
  between 256-token prompt chunks (prefix and tail), and per output token. The waiting caller polls its
  flag every 20 ms, so a turn queued behind another kind's generation returns at once; the worker skips
  it when it gets there. A cancel that beats its own `coach_ask` to the board is remembered (32 ids) and
  the turn starts cancelled. Nothing is freed off the worker: KV, sampler and grammar live there.
- Prefix cache: the context is now `n_seq_max 2`, `kv_unified true` (same 4,096 cells, same buffer size,
  each sequence may use the whole window). Sequence 1 holds the Ask head (`ask_prompt_head`); a turn
  clears sequence 0, copies sequence 1 into it (cell bookkeeping, no data copy) and decodes only the
  tail. Keyed on tokens. Invalidated by a different prefix, a model swap (dropped with the context; the
  grammars are dropped explicitly first, they hold the vocab by raw pointer), an unload (the thread
  ends), and given up whenever another kind's prompt plus budget would not fit beside it.
  `YAMES_LLM_NO_PREFIX_CACHE=1` turns it off too.
- Commands `coach_ask` (spawn_blocking, like `coach_generate`) and `cancel_generation` (sync, a flag);
  `ipc.ts`: `coachAsk` (8 s timeout that also cancels in Rust, rejects `coach_ask_timeout`),
  `cancelGeneration`, `newGenerationId` (seeded from the clock: a webview reload must not reuse an id the
  Rust process remembers); mocks; parity manifest updated (`UPDATE_PARITY_MANIFEST=1`).
- Probe: `--llm-load` (no load before the window; load, one Ask choice, unload, again, for the whole run)
  and `--llm-cancel` (Ask turns, choice or prose at random, cancelled 0-1.5 s in; the prefix changes every
  fourth turn so its chunked decode is cancelled too). Both print the four gate numbers as before.
- No load or unload path added to the app (ms1's loader owns that).

## Numbers (Qwen3 0.6B Q8_0, CPU build, this DGX with load average 25 to 70 throughout)

Prefix cache, time to first token (`promptMs`), release build, ~900-token prefix:
**215 ms cached (median of 5) against 9,172 ms uncached on a warm worker (median of 3)**; 27.9 s on the
cold first turn. A debug-build run: 243 ms against 19,507 ms. The machine was overloaded (18 inference
threads against a load of 35+), so the uncached figure is inflated; the ratio is what to keep: the turn
decodes about 40 tokens instead of about 940.

Cancel: a running turn returned 0.4 to 1.4 ms after `cancel_generation`; a turn queued behind a 256-token
chat returned 10.6 ms after it.

Probe, release, CPU build, 60 s each, `--volume 0.01`, **on a busy machine** (load 46 falling to 16 across
the set): functional checks only. The hard gates are meaningful (they do not depend on load); p99 is not,
the baseline itself read 2.98 ms. Logs `/tmp/coach-c3a/probe-busy-*.log`.

| Run | LLM work in the window | p99 ms | missed | allocs / frees | dropped |
|---|---|---|---|---|---|
| `--no-llm` (load 46) | none | 2.98 | 0 | 0 / 0 | 0 |
| `--llm-load` (34) | 8 loads under the click (0.30 s each), 8 Asks | 3.67 | 0 | 0 / 0 | 0 |
| `--llm-cancel` (36) | 84 Ask turns cancelled, 0 finished (the 900-token prefix took ~9 s to decode at this load, so every turn was cancelled in the queue or the prefix) | 3.08 | 0 | 0 / 0 | 0 |
| `--jam-swap --jam-move --jam-take` + LLM (25) | 46 chats | 2.76 | 0 | 0 / 0 | 0 |
| `--song-loop --song-take` + LLM (19) | 78 chats | 2.90 | 0 | 0 / 0 | 0 |

The gate runs on a quiet machine are **owed** (commands below).

## Gates

- `npm run test:rust` (no feature): 1156 passed, 15 failed, all 15 `take_video::tests`, PermissionDenied
  on `/tmp/yames-take-video-*` directories owned by another account (`dgx-personal`) that ran the same
  suite; not this leg's code. Log `/tmp/coach-c3a/rust.log`.
- `--features coach-llm` lib suite with `YAMES_TEST_GGUF` and `YAMES_TEST_VOCAB_GGUF`: 1166 passed, the
  same 15 `take_video` failures (`/tmp/coach-c3a/rust-llm.log`); the coach tests alone after the last fix:
  42 passed (`/tmp/coach-c3a/test-coach-llm.log`).
- Byte-identical prompt test, grammar fuzz (`grammar_fuzz_malformed_is_an_error_and_nothing_aborts`:
  1,500 mutated grammars, 151 compiled and were sampled under; `a_completed_grammar_cannot_abort_the_process`:
  200 rounds of noise to completion, then hostile logits past the end, then `accept` past the end):
  pass.
- tsc pass; vitest 11,472 passed, 1 file failed: the known `TabStage.render.test.tsx` (Bravura symlink);
  build pass. Logs `/tmp/coach-c3a/{tsc,vitest,build}.log`.

## Owed: the probe on a quiet machine (load under 6)

`bash /tmp/coach-c3a/probe-set.sh` runs all five and skips any run whose start sees load >= 6. The
commands, from the worktree (release build, `--features coach-llm`; `XDG_RUNTIME_DIR=/run/user/1000` for
PipeWire), each with `--volume 0.01`:

    click-jitter-probe --no-llm
    click-jitter-probe --gguf <Qwen3-0.6B-Q8_0.gguf> --llm-load
    click-jitter-probe --gguf <...> --llm-cancel
    click-jitter-probe --gguf <...> --jam-swap --jam-move --jam-take
    click-jitter-probe --gguf <...> --song-loop --song-take

The shipping Standard model (Qwen3 4B) and the Vulkan build were not available here: the same runs with
it on the owner's machine are still worth doing.

## For c3b

- Send `grammar` with a `root` rule and a **bounded** `ws` (`ws ::= " "?` or `[ \t\n]{0,2}`):
  `coach-answer.gbnf`'s `ws ::= [ \t\n]*` works but leans on the worker's six-token guard.
- A rejection starting `grammar:` is a bug in the grammar (malformed, over the size or shape bounds
  below, or one llama.cpp poisoned itself on). Only `answered` is an answer to act on: `truncated`
  (`by: "budget" | "whitespace"`), `deadEnd`, `cancelled`, `timedOut` and `noModel` all mean the
  rule-made answer stands. (Changed by c3ab: `answered.finished` is gone.)
- Keep the prefix byte-identical turn to turn (no timestamps, no counters) or the cache never hits; put
  everything that changes in `context` (450 tokens) or `question`.
- Ids: `newGenerationId()`, one per turn. Rust ends a turn at `deadlineMs` (8 s unless sent);
  `coachAsk`'s own timer is a backstop 1 s after it that cancels in Rust and rejects `coach_ask_timeout`.
- **Note from the c3a review (finding 6), for c3b to measure:** with `kv_unified` the Ask prefix's cells
  (about 900) sit in the range every other kind's decode attends over. Tips have a 3 s budget on a GPU.
  Measure a tip's time with and without a cached Ask prefix resident (same model, same backend, a few
  runs each); if it costs, drop the prefix before a tip (`AskPrefix::forget`, which clears sequence 1).
  Nothing was measured for this in c3a or c3ab.

## Review fixes (leg c3ab, 2026-11-20)

The reviewer's verdict on the Rust diff (`a850d3ed..70bdd641`) was MERGE AFTER FIXES. What changed:

1. **A grammar's expanded size is bounded.** `measure_grammar` (behind `precheck_grammar`) estimates
   from above the elements llama.cpp's parser writes out: a literal or class counts a byte as an
   element, `S{m,n}` counts `(|S| + 3) * n` (the copies plus the rule bookkeeping), `*`/`+` two copies,
   and a group's size is multiplied wherever it is repeated, so nested repetitions multiply through.
   Cap `ASK_GRAMMAR_MAX_ELEMENTS = 100,000` (about 800 KB of elements; `coach-answer.gbnf` measures
   under 10,000, a choice grammar a few hundred). The reviewer's `root ::= "<32 KB>"{1999}` is refused
   before llama.cpp sees it. The cache holds at most 8 grammars and `4 * 100,000` elements in all
   (`GRAMMAR_CACHE_MAX_ELEMENTS`), so the re-parse every `reset()` does on reuse is bounded too.
   Tests: `precheck_bounds_what_a_grammar_expands_to` (the reviewer's example, nested repeats, many
   rules), `the_grammar_cache_holds_a_bounded_total` (vocab; also that the reviewer's grammar never
   compiles through the cache).
2. **Sampling work per step is bounded where it can be, and a turn has a deadline.** The precheck also
   refuses more than 512 rules and groups, 128 alternatives in one rule or group, and groups nested
   deeper than 16 (the answer grammar: about 65 rules, 31 alternatives at most, depth 2). `AskRequest`
   takes `deadlineMs` (default 8,000, at most 60,000), measured from the moment `coach::ask` is called;
   it is checked with the cancel flag before a queued job starts, between 256-token prompt chunks, per
   output token, and by the waiting caller every 20 ms. On expiry the outcome is `timedOut`, distinct
   from a player's `cancelled`. Tests: `precheck_bounds_rules_alternatives_and_depth`,
   `an_ask_stops_on_a_cancel_or_its_deadline`, and in `ask_cancel_queued_and_running` (model) a deadline
   already past and a 50 ms deadline inside an uncached prefix's decode, both `timedOut`, the second
   returning within 1 s, then an ordinary turn.
3. **`--llm-load` measures what it says.** The LLM thread waits for the measured window to open (main
   stamps its start) instead of a fixed delay from `start_llm`; every load's start and end are kept, and
   the report counts loads that **started** inside the window and loads that **began and finished**
   inside it (the window ends where the stream is shut down), the average over the latter. Test:
   `loads_are_counted_against_the_measured_window` (in the probe binary: `node scripts/rust-test.mjs
   --bin click-jitter-probe`).
4. **A runtime dead end is its own outcome.** A non-poisoned `DeadEnd` (a valid grammar the model
   cannot continue under, or a sampler that picked nothing) is `{status: "deadEnd", why}`, not a
   `grammar:` error. A poisoned one (llama.cpp allowed a token, then refused it) stays a `grammar:`
   error: only a grammar construct brings it about. Test: `how_a_generation_ended_decides_its_outcome`.
5. **A truncated answer cannot pass for an answer.** `Answered` lost `finished`; an answer the budget
   or the six-whitespace guard cut off is `{status: "truncated", text, by: "budget" | "whitespace", ...}`
   in Rust, in `ipc.ts` (`CoachAskOutcome`) and in the typed mock (`src/test/mocks.ts`). Tests:
   `how_a_generation_ended_decides_its_outcome`, the wire-shape test, `ipc.coachGenerate.test.ts`, and
   with the model `ask_prose_bad_grammars_and_budgets` (the loose-`ws` grammar is `answered` and
   complete or `truncated` by whitespace; of three long prose asks at least one is `truncated` by
   budget).
6. Finding 6 is the note in "For c3b" above (nothing measured).
7. **Model-gated tests say when they skipped.** The fuzz, the completed-grammar test, the cache test
   and the three `ask_*` tests write `SKIPPED: no model: <test> (set <var>)` straight to stderr, past
   the harness's capture, so the line shows in a green run too. A green CI without the variables is not
   evidence for them. The command that runs them with the model on this DGX (through the wrapper):

       cd /home/dgx-delgado/yames-coach-c3a
       YAMES_TEST_GGUF=/home/dgx-delgado/scratch/yames-c3a-models/Qwen3-0.6B-Q8_0.gguf \
       YAMES_TEST_VOCAB_GGUF=/home/dgx-delgado/src/llama.cpp/models/ggml-vocab-qwen2.gguf \
         node scripts/rust-test.mjs --features coach-llm --lib coach::llm_tests

   (`/tmp/coach-c3a/test-llm.sh` is that, with any filter as its argument.)

**What remains uninterruptible.** The cancel flag and the deadline are read between steps, never
inside one, so a turn can overrun its deadline by the longest single step:

- one `ctx.decode` of a 256-token prompt chunk (on this DGX's CPU build with the 0.6B model, a few
  hundred ms on a quiet machine; seconds under load);
- one `sample_step`: a grammar `apply` over the whole vocabulary (about 150,000 tokens) against every
  live parse stack. The precheck bounds the grammar's size, rules, alternatives and nesting, but an
  ambiguous grammar inside those bounds can still hold many stacks at once; there is no bound on the
  number of stacks llama.cpp keeps, and no way to interrupt `apply` from Rust;
- `LlamaSampler::grammar` (first compile) and `reset()` (re-parse on reuse), both bounded by the size cap;
- a model load (the selector's, not this path's).

The caller returns at the deadline in any case (it polls every 20 ms); what overruns is the worker,
and the next job waits behind it.

### Gates after the fixes and the merge of `coach` (c3ab)

- `npm run test:rust` (no feature): 1175 passed, 0 failed (the 15 `take_video` failures are gone with
  the wrapper's own `TMPDIR`). `/tmp/coach-c3ab/rust.log`.
- `--features coach-llm` lib suite with the model and the vocabulary: 1186 passed, 0 failed, no
  `SKIPPED` line. `/tmp/coach-c3ab/rust-llm.log`. The same suite without the variables prints six
  `SKIPPED: no model` lines (`/tmp/coach-c3ab/test-skip-lines.log`).
- Probe binary's own test: `/tmp/coach-c3ab/test-probe-bin.log`.
- tsc pass; vitest 11,767 passed, 1 file failed: the known `TabStage.render.test.tsx` (Bravura); build
  pass. `/tmp/coach-c3ab/{tsc,vitest,build}.log`.
- Probe, release, CPU build, `--volume 0.01`, the binary at `/tmp/coach-c3a/click-jitter-probe` rebuilt
  from this branch. **Busy machine**: hard gates only, p99 not evidence either way.

  | Run | load at start, end | LLM work in the window | p99 ms | missed | allocs / frees | dropped |
  |---|---|---|---|---|---|---|
  | `--llm-load` | 5.8, 13.6 | 12 loads started inside, 12 began and finished inside (0.27 s each), 13 Asks | 3.05 | 0 | 0 / 0 | 0 |
  | `--llm-cancel` | 12.7, 20.6 | 84 Ask turns cancelled, 0 finished first | 3.47 | 0 | 0 / 0 | 0 |

  Logs `/tmp/coach-c3ab/probe-llm-{load,cancel}.log`.

## Owed after c3ab

- The five quiet-machine probe runs (load average under 6): `bash /tmp/coach-c3a/probe-set.sh`, which
  skips any run whose start sees load >= 6.
- Finding 6's tip-latency measurement (c3b).
- The same runs with the shipping Standard model and the Vulkan build on the owner's machine.

## Design vs code

- DESIGN 9.4 "Load: when Ask first needs it ... idle unload": superseded by the owner's model selector;
  this leg adds no load path. The probe's `--llm-load` measures the selector's background load instead.
- DESIGN 11's risk ("the grammar sampler is not reachable, or aborts"): reachable; it can abort when used
  the obvious way (in the chain, through `sample`); used as above it does not, and the fuzz holds it.
