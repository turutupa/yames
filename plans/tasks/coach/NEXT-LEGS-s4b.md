# Session 4, the second set: the model chooses, prose, a trained router, the rest of the app, Settings, docs, the reminder

Written 2026-11-20 by the brief-writer (branch `coach-briefs-b`). Same shape as `NEXT-LEGS.md` (which
this file does not edit): every brief names its worktree `/home/dgx-delgado/yames-coach-<leg>`, branch
`coach-<leg>`, logs `/tmp/coach-<leg>/`. **R** = the orchestrator's independent reviewer reads the diff
before merge.

## The legs

| Leg | Brief | Needs merged first | May run beside | Shares files with | R | Gates beyond tsc / vitest / build |
|---|---|---|---|---|---|---|
| c3b2a | `c3b2a-model-wiring.md` | c3b1, c2cb, chip1 | c5a1, c5a2, rem2, c6b, c3d1 | `src/coach/tools/run.ts`, `askTools.ts`, `AskPanel.tsx`, `askStore.ts` (chip1, pol2, t2c); `ipc.ts` only if needed | diff read (`run.ts`, the Ask files) | `ask`, `ask-tools`, `coach-model`, `short-window`, `smooth`, scenes |
| c3b2b | `c3b2b-model-measurement.md` | c3b2a; **the two GGUF files placed by someone allowed to download** | c5a1, c5a2, rem2, c6a, c6b, c3d1 (not c3c) | `scripts/coach-eval.mjs`, `src-tauri/src/bin/coach-eval.rs`, one line of `model.ts`, `Cargo.toml` (an eval-only feature) | **R** if `coach.rs` (item 6) or `Cargo.toml` change | `test:rust`; seven model runs as queue jobs (3 to 5 h) |
| c3d1 | `c3d-small-router.md` | c3b2b's verdict says a router is wanted | any | `evals/coach/train/`, `scripts/coach-train.mjs` (new) | – | the leakage test; one paraphrase job (`--gpu`) |
| c3d2 | same file | c3d1; base weights downloaded; a Python environment decided | any | none (training jobs, results) | – | the one-hour trial; the harness table against stock |
| c3d3 | same file (T5) | c3d2 wins; the owner decides hosting | not beside any `coach.rs` leg | `coach.rs`, `BRAIN_ARTIFACTS`, the selector | **R** | `test:rust` with `coach-llm`; the click-jitter probe with the adapter loaded |
| c3c | `c3c-prose.md` | c3b2a (c3b2b first if both are open) | c5a1, c5a2, rem2, c6b | `model.ts`, `grammar.ts`, Ask's answer rendering | diff read | `test:rust` (grammar fixture); `ask`, `ask-tools`, `smooth`, a scene; a prose run (queue) |
| c5a1 (+ c5a1b) | `c5a1-jam.md` | c2b2a, t1b2b, c2a2 | c5a2, c3b2b, rem2, c6b | `useHeard.ts`, `bus.ts` (a comment), `ToolCoach.tsx`, `blocks/types.ts` / `spec.ts` / `actions.ts`, `registry.ts` and the command tables (t2c), `planner.ts` (c4b2, t2d), the settings store and manifest | **R** (`planner.ts`, the settings store) | `jam`, `jam-watch`, `tool-coach`, `ask`, `ask-tools`, `planner`, `swap`, `smooth`, scenes |
| c5a2 | `c5a2-songs-and-today.md` | c1b2a, nf1; hd1 and rem2 if open | c5a1, c3b2b, c3d, c6b | `useSongAttempt.ts`, `SongReview.tsx`, `CoachNote.tsx`, `todayLine.ts` (nf1), `TodayView.tsx` (hd1, rem2, c4b2) | diff read | `songs-review`, `songs`, `songs-stage`, `coach-blocks`, `today-line`, `ask`, `short-window`, `phone-learning`, `smooth`, scenes |
| rem2 | `rem2-in-app-reminder.md` | c4a1, c4a2 | c3b2a/b, c3d, c5a1, c6b | `CoachSettingsSection.tsx` (c4a2, c6a), `TodayView.tsx` (hd1, c4b2, c5a2), the manifest, the settings store | **R** (settings store) | `today-line`, `settings`, `phone-learning`, `short-window`, `smooth`, scenes |
| c6a | `c6a-settings-and-wizard.md` | c4a2, rem2, c3b2a, every leg that adds a Settings → Coach row | c5a1, c5a2, c3b2b, c3d, c6b | `CoachSettingsSection.tsx` (alone in it), `CoachStep.tsx`, the `settings` and `onboarding` locales | diff read; **R** if store code moves | `settings`, `firstrun`, `tour`, `coach-model`, `phone-tabs`, `phone-header`, `short-window`, `theme-faces`, scenes |
| c6b | `c6b-docs.md` | best after all of the above | any | `plans/UI_DECISIONS.md`, `plans/COACH_UX.md`, `plans/MOBILE_IMPLEMENTATION_PLAN.md`, `TESTING.md` | – | none (docs only) |

**Size risk.** c3b2a: medium-high (TS across the Ask chain, the runner, under ten strings; it stops
before scenes if it must). c3b2b: low in tokens, long in queue time (3 to 5 h of model runs; the
first 20-item run sets `--est`). c3d1: medium; c3d2: low in tokens, unknown in GPU time; c3d3: medium,
Rust. c3c: low-medium. c5a1: **high** (five features; a conditional c5a1b at 170k takes item 5, the
finisher). c5a2: medium. rem2: low-medium. c6a: medium-high (a 935-line section moved group by group,
fifteen locales). c6b: low.

## Suggested waves

1. When c3b1, c2cb and chip1 merge: **c3b2a** ‖ **c5a1** ‖ **c5a2** (after nf1; hd1 / rem2 merged or
   not open) ‖ **rem2** (after c4a2).
2. When c3b2a merges and the two GGUF files are in `~/scratch/yames-c3a-models/`: **c3b2b** ‖ **c3c**
   (merge c3b2b's `model.ts` line first) ‖ the c5 legs if still running.
3. On c3b2b's verdict: **c3d1** if a router is wanted; **c6a** once rem2 and c3b2a are in.
4. **c3d2** (after the downloads and the Python decision below); **c6b** last; **c3d3** only if c3d2 wins.

## Questions for the orchestrator (found while writing; nothing was downloaded or installed)

- **Model files**: on the DGX only `~/scratch/yames-c3a-models/Qwen3-0.6B-Q8_0.gguf` (639 MB) and an
  unrelated `~/scratch/pr2012/models/Qwen3.8-27B-UD-Q4_K_M.gguf` (16.5 GB). No Qwen3 4B or 8B GGUF
  anywhere (`~/.cache/huggingface/hub`, `~/scratch`, no app data folder). c3b2b needs the two pinned
  files (`progress/ms2.md`, `BRAIN_ARTIFACTS`).
- **Training base weights**: no safetensors of Qwen3 0.6B / 1.7B / 4B on the machine (c3d2).
- **Python**: no environment of the build's own. CUDA PyTorch exists only in two services' venvs
  (`~/services/photo-studio/venv`: torch 2.14.1+cu130, transformers 5.23.0; `~/services/openwebui/venv`:
  torch 2.15.0 with CUDA 13 libraries, transformers 5.5.4, accelerate, scikit-learn,
  sentence-transformers, onnxruntime). No `peft`, `trl`, `datasets` anywhere. Borrow read-only, or a
  new venv with `pip install` (forbidden to a leg): the owner's or the orchestrator's call.
- **BRIEF.md still says "No fine-tuning"** (Owner decisions, line 24); OWNER-UPDATES 18:35 approved
  training. The brief's line wants the same amendment PLAN.md got.

## Judgement calls (the design was silent or could be read two ways; overrule any)

1. c3b2a: router, card and help matches end the turn (no model). Otherwise search's passage or the plain
   statement shows at once and the model runs after it, adding below ("router → cards → help → search →
   model → plain statement" read as the display order, with DESIGN 5.5's states). A chain that stopped at
   search would never call the model in fourteen languages, where cards match only by chip.
2. c3b2a: a `read` tool or a card the model chose is shown at once (it changes and stores nothing);
   every `go` and `confirm` call from the model is a one-press proposal. Overrule → every model output
   is a proposal.
3. c3b2a: the model path ships dark (`MODEL_LANGS` empty) and c3b2b fills it per tier and language.
4. c3b2a: before any measured turn, the gate says yes on a GPU backend and no on the CPU, as
   `should_use_model` does for tips.
5. c3b2a: on a CPU backend, Ask's model is off while anything sounds. Capping threads per generation is
   not reachable: llama-cpp-2 0.1.146 sets threads at context creation only (`inference_threads()`).
6. c3b2a / c3b2b: the wrong-action < 2% gate is measured and recorded but changes nothing in this
   build: model calls stay one-press. It answers the owner's later "goes at once" question.
7. c3b2b: TOOLS 3.5's four ways = plain prompt / grammar with names only / grammar with descriptions /
   trained (c3d). An eval-only `coach-llm-cuda` feature (llama-cpp-2's `cuda`; `nvcc` is installed) is
   allowed if it builds in one try, never shipped. Accuracy on the DGX; latency from the relay's RTX.
8. c3b2b / c3d: "falls short" = in the chain, right tool under 90% in a language for a tier, or a
   median turn over 8 s on the target. The switch is filled from way (c) only, 20 items or more.
9. c3d1: paraphrases by a local model in a queue job (no player data, no network). The 27B file in
   `~/scratch/pr2012/` is another project's: using it read-only is the orchestrator's call. Candidates
   in order: a LoRA of the 4B, then a small router; the classifier only as a research note.
10. c3c: prose is triggered by a choice alternative `{"answer":"advice"}` and a second call inside the
    same 8 s, which amends DESIGN 5.5's "one model call a turn". The alternative: a "General advice"
    chip, one call per press.
11. c3c: the note-name check rejects every one-letter word A to G except the article "a"; false
    positives only cost a prose answer.
12. c3c: prose longer than three sentences keeps its first three whole sentences.
13. c3c: pain is answered by a fixed rule-made sentence (English word list); "tired" and "sore" go on to
    the model as advice.
14. c5a1: the Jam line sits in the tools' line slot under Jam's stage, desktop only (c2a2: no tools'
    coach on a phone).
15. c5a1: the guide-tone line only on the Jam screen with a chart loaded.
16. c5a1: "Make this my finisher" stores `coach.finisher` for that day's plan only, and the finisher
    becomes the jam itself, ungraded. DESIGN says only "hands the jam to Today".
17. c5a1: pinning is refused in a Take; Undo restores the shape pinned before.
18. c5a2: `songDue` comes after the Path line, names one passage (due longest ago), in printed bars, not
    on the first day.
19. c5a2: the Songs dock is measured, not built: Ask already mounts and docks there.
20. rem2: the English is "Your reminder: guitar at {{time}}." (a fact); DESIGN 12 q8's "Guitar?" is the
    alternative.
21. rem2: "a Session today" = a stored Path Session Take or a saved tool run, dated today.
22. rem2: the first On fills 18:00 and all seven days.
23. rem2: "off after three ignored" becomes "Today stops mentioning it" after three reminder days in a
    row whose time passed with no Session (opened or not), computed from the Takes; the setting stays
    On, nothing is stored, the next Session brings it back. The app never switches it off.
24. rem2: the row shows on a phone too (the line is rule-made).
25. rem2: the reminder line is not a proactive card and does not spend c4b2's one-card budget.
26. c6a: the Answers group names the languages the model answers in, from `MODEL_LANGS`.
27. c6a: the Notebook group = the left-out lines with "Bring back" plus the goal's Edit; nothing deleted.
28. c6a: on a phone, Answers (the rows "not on this device"), Suggestions and Notebook: the owner's
    selector placement (Settings → Coach on a phone) wins over DESIGN 8's two groups.
29. c6a: "Try the listening feature anyway" leaves the wizard's coach step (an input and eight beats: a
    microphone push); dropped and named if it has no other home.
30. c6a: "Hear what I play" goes in "In the tools"; the jam's spoken cues in "Voice"; on a phone the
    wizard's coach step asks nothing.
31. c6b: runs last and documents only what is merged; U4.4 is recorded as contradicted by the code.

## Not found in the design

How prose is triggered; what "Make this my finisher" stores and for how long; the reminder's wording,
defaults and what "ignored" means without a notification; what Settings → Coach's Notebook group
holds; the wizard on a phone; where on Today the reminder and the due passage sit against Today's line;
how training paraphrases are produced on this machine.

## Design against the code (verified 2026-11-20)

- `bus.ts`' comment says `useJamSession.ts` publishes `jamStopped`; `harmonyStop()` returns in
  `src/jam/useHeard.ts`, and nobody publishes `jamStopped` or `songPassReviewed` yet.
- DESIGN 3.1 "Songs: Dock (Songs has none today)": Ask mounts on Songs (`askShownOn`) and docks there
  from 1160 px since c2a1.
- DESIGN C3b's set `evals/coach/choices.jsonl` and gate "right card ≥ 80% Standard, ≥ 90% Studio" are
  replaced by c3b1's `evals/coach/tools/<lng>.jsonl` and PLAN / TOOLS' "right tool ≥ 90% per language".
- TOOLS 3.3 "loading an add-on at the pinned version, not verified": llama-cpp-2 0.1.146 has
  `lora_adapter_init` / `lora_adapter_set` / `lora_adapter_remove`.
- DESIGN 9.4's load-when-Ask-needs-it and idle unload: superseded by the selector (c3a noted).
- `UI_DECISIONS.md` U4.4 says `CoachCard` ships inside the dock; c2a2 deleted it.
- The wizard's coach step still says the coach "listens through your audio input and scores…"
  (`onboarding.coach.what1`) and offers "Try the listening feature anyway".
