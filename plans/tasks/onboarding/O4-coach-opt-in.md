# O4 — W4 "Practice coach" opt-in with honest tiers

Size: M. Branch: `onboarding/o4-coach-opt-in`. Depends on: O1, and
roadmap T03 (`getCoachCapabilities`) + T04 (`getSystemMemoryMb`, Qwen3
tiers) merged.

## Goal

The user understands what the coach is, what it costs in disk and RAM
on *their* machine, and picks a tier — or timing-only — without being
oversold. A chosen brain downloads in the background while the wizard
continues.

## Facts

- Tiers and download: `src/hooks/useCoachDownload.ts` (`MODEL_URLS`,
  `handleStartDownload`, progress events), settings UI in
  `CoachSettingsSection.tsx`; status truth from `getCoachCapabilities()`
  (T03); RAM from `getSystemMemoryMb()` (T04). Tier ids stay
  `standard` / `full` internally (Full is labelled Studio).
- Decision 5 in the plan: Studio is shown greyed with the RAM reason
  below 16 GB.
- Privacy line must be true: audio never leaves the machine and is not
  recorded in release builds (`session_audio.rs` is debug-only).

## Deliverables

1. `steps/CoachStep.tsx` registered as `coach` after `hands-free`.
2. Copy: two lines on what it does, one privacy line. Three choices:
   *Timing feedback only* (no download), *Standard brain* (size + RAM
   from real numbers), *Studio* (greyed below 16 GB with the reason).
   Recommended choice preselected: Standard when RAM ≥ 8 GB and
   `llmCompiled`, otherwise timing-only with the honest reason ("this
   build can't run a model" / "not enough memory").
3. Selecting a brain: persist `coachBrainTier`, start the download via
   the existing hook, show a thin progress bar in the wizard footer that
   survives step changes; the wizard never blocks on it.
4. Voice: not chosen here. When the voice download completes (existing
   event), a toast offers "Pick a voice" → Settings → Coach.
5. Machine context: set `coachTier` so O5's `isEnabled` can decide
   whether W5/W6 are mandatory or the optional "Try the listening
   feature" branch (decision 3).
6. i18n keys `onboarding.coach.*` in all locales.
7. Tests: recommendation matrix (RAM × llmCompiled × existing download),
   Studio disabled reason, download hand-off called once.

## Gates

- `tsc`, vitest, build green. Manual: on this laptop the recommendation
  matches its RAM; choosing Standard starts the download and W5 appears
  while the bar keeps moving.
