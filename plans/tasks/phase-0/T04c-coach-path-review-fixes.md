# T04c — Coach/LLM path: review findings to fix

Size: L. Branch: `phase0/t04c-coach-review-fixes`. Depends on: main after
T05 (#15) merges (touches `models.rs`/`commands.rs` too).

Source: eight-angle review of the merged coach path (T01/T03/T04/T07)
on main aa20a02, verified against the code. Fix all of these; each item
names the deeper fix, not a patch.

## Correctness

1. **Main-thread freeze via sync commands.** `is_coach_loaded` and
   `get_coach_capabilities` are non-async Tauri commands (main thread)
   that lock `SharedCoachEngine`, while `coach_generate` and
   `load_coach_model` hold that mutex for the whole generation / GGUF
   load. Fix: the engine mutex must never be held across a blocking
   wait. Keep a lock-free status snapshot (`Arc<CoachStatus>` with
   atomics/`RwLock`: resident, name, backend, loading flag) that the
   read-only commands consult; `coach_generate` takes the lock only to
   hand the job to the worker channel and waits on the reply outside the
   lock; `load_coach_model` marks `loading` and releases the lock while
   the worker spawns. Make the two read commands `async` anyway.
2. **Double load on cold start / reload destroys a working worker.**
   `useSession.ts` calls `loadCoachModel()` from the mount effect and
   again from `startSession` while the first is in flight; Rust
   `load_model` unconditionally drops the resident worker before
   spawning, so a failed reload leaves no brain. Fix: Rust `load_model`
   is idempotent — if a worker for the same path+mtime+size is resident
   (or a load is in progress) return `Ok(true)` without reloading; spawn
   the new worker *before* dropping the old one when the file changed
   (backend one-shot permitting — if `LlamaBackend` forbids two
   instances, keep the old worker until the new load succeeds by
   loading on the same thread sequentially and only then swapping).
   TS: one `ensureCoachLoaded()` helper (dedupes the in-flight promise)
   used by both sites.
3. **New weights never reloaded.** After a download or "Update brain",
   nothing reloads the model; the old weights keep answering. Fix: the
   download-complete path (Rust `do_download` success, or the TS
   `model-download-complete` handler) triggers `load_coach_model`;
   `load_model` reloads when path/mtime/size changed (item 2).
4. **Worker death leaves the coach "active" but erroring.** If the
   inference thread dies, `engine.llm` stays `Some`, `generate` returns
   `Err` forever and status says active. Fix: on a dead channel, clear
   residency (status snapshot), log once, and fall back to
   `generate_template` for that call; the next `ensureCoachLoaded()`
   reloads.
5. **Empty and truncated generations.** `strip_think` can return `""`
   (all-reasoning) and the 64-token rephrase budget can cut mid-sentence
   (loop exits on budget, not EOG). Callers `useSegmentCoach.ts` mini-
   report and `useSession.ts` session summary assign the result
   unconditionally. Fix at the source: `generate` returns the template
   fallback when the model output is empty, and returns
   `Err("truncated")`/falls back when the budget was exhausted without
   EOG for rephrase-class prompts; TS callers keep their template on
   empty/error (make all four sites consistent).
6. **Explicit generation kind instead of prompt sniffing.**
   `token_budget` and `generate_template` classify by magic substrings
   ("Rephrase this practice-coach…", "User asks:"); the adaptive-drill
   comment prompt misses the marker and gets the chat budget. Fix: add a
   `kind: "tip" | "greeting" | "report" | "summary" | "chat" | "drill"`
   argument to `coach_generate` (IPC + `ipc.ts`), carry it into
   `LlmWorker` jobs for the token budget and into `generate_template`
   for the branch; per-kind frontend timeouts (tip 3 s, report 8 s,
   summary/chat 15 s) replacing the single `COACH_GENERATE_TIMEOUT_MS`.
   On the CPU backend, tips skip the LLM (template only) — this is the
   AGENTS.md tier rule; update AGENTS.md wording to "no *blocking*
   inference on the tip path: rephrase only within the 3 s budget on a
   GPU backend, template otherwise".
7. **Studio RAM gate rejects real 16 GB machines.** Windows/Linux report
   installed RAM minus reservations (~15.9 GB). Fix: compute the
   recommendation in Rust (`ModelStatus`/`CoachCapabilities` gain
   `studioRecommended`, `standardRecommended`, `brainUpdateRecommended`)
   with thresholds 15 GiB for Studio and 7.5 GiB for Standard, and
   `CURRENT_BRAIN_FAMILY` only in Rust; TS `brainTiers.ts` and
   `coachRecommendation.ts` consume the booleans (delete the duplicated
   constants). Settings gets the Standard floor too (today only the
   wizard has it).
8. **Model identity.** `model_name` is always `model.bin`, so the status
   line reads "model.bin on vulkan". Fix: read `general.name` /
   `general.basename` from GGUF metadata after load (llama-cpp-2 exposes
   model metadata) and fall back to the marker's family+tier; show
   "Qwen3 4B on Vulkan".
9. **Legacy weights vs ChatML.** A pre-Qwen3 `model.bin` loads and gets
   ChatML prompts → visible template artifacts. Fix: `load_model`
   refuses (returns `Ok(false)` with a reason surfaced in capabilities)
   when the marker is missing or the family is not `qwen3`; the UI
   already offers "Update brain".
10. **Studio download times out.** `curl --max-time 600` cannot fetch
    4.7 GiB on ordinary broadband and each retry restarts. Fix: drop
    `--max-time` in favour of `--speed-time 60 --speed-limit 10240`
    (abort only when stalled), always pass `-C -` so retries resume,
    and keep `.part` on failure.
11. **Thread count on non-SMT CPUs.** `inference_threads()` halves
    logical cores, giving 2 threads on an 8-core M1 and 1 on a 4-core
    box. Fix: use `num_cpus::get_physical()` (add the crate) and
    `max(1, physical - 2)`; on Apple Silicon use performance cores if
    exposed, else physical.
12. **"Remove models" while resident.** `deleteModels` fails on Windows
    (file mapped) and the error is swallowed; on macOS the worker keeps
    running deleted weights. Fix: unload the worker first (Rust command
    `unload_coach_model` or `delete_models` does it), then delete;
    surface errors in the UI.
13. **Onboarding W4 ignores brain family.** `CoachStep`'s "already
    installed" short-circuit matches tier but not `brainFamily`, so a
    legacy install skips the update. Fix: include family (use the Rust
    `brainUpdateRecommended` from item 7).

## Cleanup (do alongside)

- One `brain_model_path(app)` helper (three hand-built paths).
- One size-floor table for brain/piper/voice downloads.
- `get_coach_capabilities` reuses `check_model_status`'s size instead
  of a second `stat`.
- Persisted tier id `full` vs label Studio: leave the id (migration
  cost) but centralise the label mapping in one place.

## Gates

`tsc`, vitest, build, `cargo test --lib --no-default-features`,
dsp + highbpm fixtures, `cargo test --features coach-llm --lib` with the
0.6B smoke GGUF (in `<scratchpad>/gguf/`), plus new tests: idempotent
load, reload on file change, dead-worker fallback, empty/truncated
generation fallback, kind-based budgets, recommendation booleans,
resume flags on the curl command line. Run the jitter probe once with
the CPU model to confirm nothing regressed.
