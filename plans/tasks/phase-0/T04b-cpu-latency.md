# T04b — Make the CPU-only brain usable (tier-aware LLM use + prompt caching)

Size: M. Branch: `phase0/t04b-cpu-latency`. Depends on: T04 merged.

## Why

T04 measured Qwen3-4B Q4_K_M on the owner's laptop (Ryzen 9 5900HS,
8 cores):

| Build | rephrase p50 / p95 | chat p50 | tok/s |
|---|---|---|---|
| Vulkan (RTX 3080) | 0.31 s / 0.32 s | 0.55 s | 55–66 |
| CPU-only, 6 threads | 9.3 s / 11.4 s | 7.4 s | 1.8–4 |

The frontend times out a `coachGenerate` call after 3 s
(`COACH_GENERATE_TIMEOUT_MS` in `src/ipc.ts`), so a CPU-only user on the
Standard tier never hears the model: every call falls back to the
template. The GPU-first ladder works; the CPU fallback is decorative.

Two observations point at the fix:
- A rephrase produces ~17 tokens but takes 9 s. Generation is not the
  cost; **prompt evaluation is** (the system prompt + narrative context
  is hundreds of tokens, evaluated from scratch on every call).
- The coach already has latency tiers (AGENTS.md): mid-session tips
  1–3 s, mid-session report 3–8 s, post-session report 5–15 s. Only the
  first tier is truly latency-bound; the others can afford a CPU model.

## Deliverables

1. **Prompt-prefix KV caching** in `coach.rs::llm`: keep the system
   prompt (and, per session, the stable narrative prefix) evaluated in
   the persistent context; on each call only evaluate the suffix that
   changed. Use llama.cpp's sequence/KV APIs through `llama-cpp-2`
   (evaluate the prefix once, `n_past` bookkeeping, clear only the
   suffix cells between calls — see T04's note that
   `clear_kv_cache()` zeroes the buffer and cost 1.8 s on Vulkan;
   use the seq-range variant). Re-measure CPU rephrase; target p50
   ≤ 3 s on this laptop.
2. **llama.cpp worker priority**: T06 found `with_below_normal_priority`
   (and T04's lowered inference thread) demote only the calling thread;
   llama.cpp's compute workers start at normal priority and disable
   power throttling. Use `llama_attach_threadpool` with
   `GGML_SCHED_PRIO_LOW` through `llama-cpp-sys-2` (or upgrade
   `llama-cpp-2` if a release exposes it) so every inference thread is
   below normal. Re-run the jitter probe on CPU afterwards.
3. **Thread count**: `inference_threads()` gives 6 on a 16-logical-core
   Zen3 and yields 1.8 tok/s, which is far below what 4B Q4_K_M should
   do on this CPU. Measure 4/6/8/12 threads and pick the rule that
   maximises tok/s while leaving two physical cores free; keep the
   generation thread below normal priority.
4. **Tier-aware LLM use**: add a `latency_tier` argument to the generate
   path (`tip` | `report` | `chat`). Timeouts: tip 3 s (unchanged),
   report 8 s, chat 15 s, matching AGENTS.md. On the CPU backend, the
   first call measures itself; if a tip call would exceed its budget
   (moving p50 > 2.5 s), tips skip the LLM and use templates while
   reports and chat still use it. Expose the measured p50 in
   `getCoachCapabilities()` so Settings can show "Tips: template · Reports: AI".
5. **Honest copy**: Settings brain hint for Standard says the truth on a
   CPU-only build ("Reports and chat use the AI; live tips stay instant
   templates"). i18n in all 15 locales.
6. **Gates**: LLM smoke test still passes; a new `latency_bench` run on
   CPU and Vulkan recorded in the PR; vitest for the tier routing;
   jitter probe (T06) still green while the CPU model generates.

## Decision recorded (2026-09-02)

Standard stays Qwen3-4B on every machine (no smaller tier). CPU-only
machines get the model where latency allows (reports, chat) and templates
where it does not (live tips). This keeps one model, one download, and
honest expectations.
