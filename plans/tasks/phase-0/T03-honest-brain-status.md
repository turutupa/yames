# T03 — Honest brain status (never claim an LLM that isn't running)

Size: S. Branch: `phase0/t03-honest-status`. Parallel-safe.

## Goal

The app knows, and shows, whether a real model is resident, whether the
build can run one at all, and which backend is in use. Template mode is
an explicit, visible state — not something the user discovers by
noticing the coach repeats itself.

## Facts

- `src-tauri/src/coach.rs::load_model` returns `Ok(true)` and sets
  `engine.loaded = true` when the `coach-llm` feature is **absent** and
  the file exists (lines ~74–80). `is_coach_loaded` therefore reports
  true in template mode.
- `src/hooks/useSession.ts` (~line 379 and ~1122) sets
  `coachLoadedRef.current` from `loadCoachModel()` / `isCoachLoaded()`
  and uses it to decide whether to call the LLM (rephrase, chat,
  adaptive drill).
- `src/hooks/useCoachDownload.ts` owns model status for the UI;
  `src/containers/settings/CoachSettingsSection.tsx` renders the Brain
  toggle (`off` / `standard` / `full`) with hints from
  `src/locales/en.json` keys `settings.coach.brain*`.
- IPC wrappers live in `src/ipc.ts` (`getModelStatus`, `loadCoachModel`,
  `isCoachLoaded`).

## Steps

1. `coach.rs`:
   - Add `pub fn llm_compiled() -> bool` (`cfg!(feature = "coach-llm")`).
   - Add `pub fn backend_name() -> &'static str` returning `"metal"`,
     `"vulkan"` or `"cpu"` from the T01 feature set (`"none"` when not
     compiled). If T01 has not merged yet, implement against feature
     names `coach-llm`, `coach-llm-metal`, `coach-llm-vulkan` and note
     it.
   - `CoachEngine`: split `loaded` into `model_resident: bool` (a real
     `LlmModel` is held) and keep a separate `template_mode()` accessor.
     `is_loaded()` must mean "real model resident". On the non-feature
     path `load_model` returns `Ok(false)`.
   - Add `model_name: Option<String>` captured at load (file name is
     enough for now; T04 may improve it).
2. New Tauri command `get_coach_capabilities` in `commands.rs` returning
   `{ llmCompiled, modelResident, backend, modelName, ramEstimateMb }`
   (`ramEstimateMb` = model file size × 1.2, rounded). Register it in
   `lib.rs`; add the wrapper + type to `src/ipc.ts`.
3. Frontend:
   - `useSession.ts`: keep calling `loadCoachModel()`; `coachLoadedRef`
     now truthfully reflects a resident model, so template mode never
     calls `coachGenerate` expecting an LLM. Check every use of
     `coachLoadedRef.current` still behaves (rephrase falls back to the
     template text, chat answers with the template path, adaptive drill
     does not call the model). Do not change adaptive-drill logic
     beyond that (T07 owns it).
   - `CoachSettingsSection.tsx`: show one status line under the Brain
     toggle from `getCoachCapabilities()`:
     - "Template coach — this build can't run a model" when
       `!llmCompiled`,
     - "Model downloaded, not loaded" when compiled, file present,
       `!modelResident`,
     - "AI brain active — {modelName} on {backend}" when resident.
     Add keys to `en.json` under `settings.coach.status*`.
   - `SystemStatusChip.tsx` (if it exposes coach state) gets the same
     truth; otherwise leave it.
4. Tests: vitest for the status-label mapping (pure function, put it in
   `src/containers/settings/coachStatus.ts`); Rust test that
   `load_model` without the feature returns `Ok(false)`.

## Acceptance

- `bun run test:rust` (no feature) and `--features coach-llm` (if you
  can build it) both pass.
- Running `npm run tauri dev` without the feature and toggling Brain to
  Standard with a downloaded model shows "Model downloaded, not loaded"
  or "Template coach", never "active".
- All vitest green; `tsc --noEmit` clean.
