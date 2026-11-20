# Leg c3ab: the worker's review fixes

Worktree `/home/dgx-delgado/yames-coach-c3a` (existing, branch `coach-c3a`, clean). Logs under
`/tmp/coach-c3ab/`. Read `plans/tasks/coach/BRIEF.md`, then `plans/tasks/coach/c3a-worker.md` (what the
branch is for) and `plans/coach/progress/c3a.md` in the worktree (what was built and how the grammar is
kept safe). An independent reviewer read the Rust diff: verdict MERGE AFTER FIXES, no confirmed way for
a caller to crash the app, the safety design sound. These are its findings. Fix 1 to 5, with a test
each; 6 and 7 are notes to write down.

1. **`precheck_grammar` does not bound a grammar's expanded size** (`coach.rs`, about lines 866 to 952:
   it checks `n ≥ m`, the 2,000 repeat cap, 32 KB, NUL, root). `root ::= "<32 KB of a>"{1999}` passes
   and expands to about 65 M elements: about 1.5 GB at peak in llama.cpp's parser, and
   `GrammarCache` keeps up to 8. The first compile is behind the crate's catch-all, but every later
   turn goes through `sampler.reset()` (`GrammarCache::take`), which re-parses with no catch: a
   `bad_alloc` there crosses FFI. Bound it in the precheck: a cap on the expanded size (the product of
   literal / class lengths and repeat counts, nested repeats multiplied through; a few hundred thousand
   elements is far more than any tool grammar needs: state the cap and why), and a cap on the cache's
   total. A test with the reviewer's example and with nested repeats.
2. **One sampling step can run long with no cancel.** Cancel is checked once per token (about line
   2780); an ambiguous grammar (many optionals and alternations) makes many live stacks, and one
   `apply` over the whole vocabulary against every stack is uninterruptible. Bound what can be bounded
   in the precheck (rule count, alternations per rule, nesting depth: generous for a tool grammar,
   stated), and give an Ask turn an overall wall-clock deadline checked per token (the design's budget
   is 8 s a turn: the caller passes it; on expiry the turn ends as cancelled-by-deadline, distinct from
   a player's cancel). Say plainly in the progress file what remains uninterruptible.
3. **`--llm-load` does not measure what its comment says** (`click-jitter-probe.rs`, about lines 1413 to
   1416). The start countdown runs from `start_llm`, before the engine is built, so a slow device setup
   lets the first load start before the measured window; and a load still running at the window's end
   is counted as "under the click". Start the countdown from the window's start, count only loads that
   began and finished inside it, and report both numbers (started inside, finished inside).
4. **A runtime dead end is reported as a grammar error** (about lines 2827 to 2832): a non-poisoned
   `DeadEnd` returns with the `grammar:` prefix, which the contract (about lines 661 to 663) reserves
   for "your grammar is wrong". Give it its own result so a valid grammar is not reported as a bug.
5. **A truncated answer looks like an answer.** Running out of budget, or the six-whitespace guard,
   returns `Answered { finished: false }` with a prefix of the grammar's language. Make the type say
   it: a distinct `Truncated` result (or the house equivalent) in Rust, in `ipc.ts` and in the mock
   backend, so no caller can parse half a tool call by forgetting a flag. Update
   `ipc.coachGenerate.test.ts`.
6. Note for leg c3b (write it in the progress file, measure nothing now): with a unified KV cache the
   Ask prefix's cells (about 900) sit in the range every other kind's decode attends over; tips have a
   3 s budget on a GPU: c3b measures a tip's time with and without a cached Ask prefix and, if it
   costs, drops the prefix before a tip.
7. Note: the fuzz test, the completed-grammar test and the `ask_*` tests return early without
   `YAMES_TEST_GGUF` / `YAMES_TEST_VOCAB_GGUF`, so a green CI is not evidence for them. Make each print
   one unmistakable line when it skips (`SKIPPED: no model`), and list in the progress file the exact
   command that runs them with the model on this machine (`~/scratch/yames-c3a-models/`).

Then: merge `coach` into the branch (`git -C /home/dgx-delgado/yames-coach-c3a merge coach`; leg ms2 is
changing `commands.rs` and `models.rs` on its own branch, not merged yet: keep your hunks local), and
run the gates: `npm run test:rust` with no feature and the lib suite with `--features coach-llm` and the
model (`node scripts/rust-test.mjs`, AGENTS.md; the wrapper now sets its own `TMPDIR`, which is what
`take_video`'s fifteen PermissionDenied failures were about: they should pass now; say if they do not);
tsc, vitest, build; the probe's two new modes once for the hard gates (0 missed beats, 0 callback
allocations and frees, 0 dropped notifications), with the load average you ran them at. The five
quiet-machine p99 runs stay owed unless the load is under 6: then run `bash /tmp/coach-c3a/probe-set.sh`
and report the table.

Report, at most 30 lines: commits; each finding, what changed, the test that holds it; gates with log
paths; the diff range since the reviewed commit (`70bdd641`) for a short re-read.
