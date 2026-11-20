# Leg c3a: the worker (an Ask kind, a grammar, cancel, a cached prefix, two probe modes)

Worktree `/home/dgx-delgado/yames-coach-c3a`, branch `coach-c3a`. Logs under `/tmp/coach-c3a/`.
Read `plans/tasks/coach/BRIEF.md` first; AGENTS.md sections "Building with the coach LLM", "Audio-safety
gate" and "Coaching pipeline — latency tiers" are this leg's ground rules. Design: DESIGN.md 9.4 (the
whole table), 5.5 (budgets), 5.4 (guardrails 1 and 2), the C3a row of section 10 and the "grammar
sampler" row of section 11; TOOLS.md 2.3 (one call per turn, three checks). An independent reviewer
reads this leg's whole Rust diff before it merges.

Rust only, plus the thin IPC wrapper. Nothing in the app calls the new kind yet (leg c3b does). The
existing kinds (tip, greeting, report, summary, chat, drill) and their prompts stay **byte-identical**:
a test holds that.

## Investigate first, and write what you find into your progress file before building

1. **The grammar API.** `llama-cpp-2` is pinned (AGENTS.md says 0.1.146: check `Cargo.lock`). Read the
   crate's source in `~/.cargo/registry/src/` for the sampler chain and its grammar sampler: the exact
   constructor, what it returns on a malformed grammar, and what happens when the grammar is completed
   and sampling continues (the design's reviewer could not verify this; a C++ exception across FFI
   kills the app). If the grammar sampler is not reachable or cannot be made safe at this version, stop
   building that part, write exactly why, and deliver the rest: the design says engine 4 then does not
   ship and nothing else changes.
2. **What can be tested here.** Does the crate build on this machine (aarch64 Linux) with
   `--features coach-llm` through the wrapper? Is there a GGUF on this machine for the smoke test and
   the probe (look under `~/models`, the app's data directory, `~/.cache`; a small Qwen3 GGUF is
   enough; do not download anything larger than 1 GB, and nothing at all without saying so in your
   report: `~/.local/bin/web-look` for a lookup, plain `curl` to a model host is a download you must
   name)? If no model can be had, the model-dependent gates are reported as not run, plainly.
3. `coach.rs` (2,500 lines: grep, read in parts): `GenKind`, how `coach::generate` routes a kind, the
   worker thread (`coach::llm::LlmWorker`), how the prompt is decoded and tokens sampled, where a
   generation could be interrupted.

## What to build

1. **`GenKind::Ask`** with its own system prompt and its own budget: output at most 48 tokens for a
   choice and 96 for prose (two sub-modes), one call a turn, no tool loop. The caller passes the static
   prefix (system text and the tool / intent list), the context (at most 450 tokens) and the question;
   Rust does not know the tools: they live in TypeScript.
2. **The grammar.** The Ask kind takes an optional GBNF grammar string from the caller (the frontend
   generates it from its registry; `src/coach/blocks` already generates `coach-answer.gbnf` and tests
   it: look at how) and samples under it. Whitespace bounded in the grammar's root. A **fuzz test** that
   a completed grammar cannot abort the process and that a malformed grammar is an error returned to
   the caller, never a panic or an abort. The grammar is compiled once per distinct string and reused.
3. **Cancel.** A generation id per request: checked before a queued job starts, between chunks of the
   prompt (decode the prompt 256 tokens at a time), and per output token. `cancel_generation(id)` as a
   command; a cancelled job returns promptly with a distinct result, frees nothing on the wrong thread,
   and leaves the worker ready for the next job. The existing kinds gain nothing and lose nothing.
4. **The cached prefix** (the owner asked for prompt caching to be part of what is measured): for the
   Ask kind, the static prefix is decoded once and its state kept, so a turn decodes only the context
   and the question. Invalidate on a different prefix, a different model, or an unload. Report the
   measured saving (time to first token with and without) if a model is available.
5. **IPC**: `coach_ask` (or the existing generate command with the new kind: follow the house pattern)
   and `cancel_generation` in `commands.rs`, typed wrappers in `src/ipc.ts`, and the mock backend the
   frontend tests use; `ipc.coachGenerate.test.ts` extended.
6. **Probe modes** in `src/bin/click-jitter-probe.rs`: `--llm-load` (the model is loaded while the
   click runs: the load in flight at a Take's start, which the model selector allows) and
   `--llm-cancel` (generations started and cancelled repeatedly under the click). Both report the four
   gate numbers as the existing runs do.
7. The model's life is the selector's (leg ms1: one loader in the frontend, loaded once, kept): do not
   add a load or an unload path, and do not touch the audio callback, the engine or the queue.

## Gates

`npm run test:rust` (no feature) and the same with `--features coach-llm` through
`node scripts/rust-test.mjs` (the wrapper script, AGENTS.md); the byte-identical prompt test; the fuzz
test; tsc, vitest, build for the IPC wrapper. With a model on this machine: the smoke test
(`YAMES_TEST_GGUF`), and the probe on a quiet machine (load under 6): baseline, `--llm-load`,
`--llm-cancel`, and the `--jam-swap --jam-move --jam-take` and `--song-loop --song-take` pairs with the
LLM generating, each with its four numbers. Without a model: say which runs are owed and the exact
commands.

## Report

As BRIEF "The end of a leg", with: the grammar API as you found it; the Rust diff range for the
reviewer; the probe table; the measured prefix-cache saving; anything owed.
