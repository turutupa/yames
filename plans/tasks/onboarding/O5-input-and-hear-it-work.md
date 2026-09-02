# O5 — W5 audio input + W6 "Hear it work"

Size: M. Branch: `onboarding/o5-input-hear-it-work`. Depends on: O4.

## Goal

The user picks an input, sees a real level meter, then plays along to
eight beats and watches their own timing dots. The result is honest:
real onsets, or "didn't hear anything".

## Facts

- Input devices and levels: `AudioInputDropdown.tsx`, `ChannelDropdown.tsx`,
  `AudioInputTestModal.tsx` (level meter + record/playback),
  `useEvaluation.ts` (`evaluationDevice`, `evaluationChannel`, start/stop),
  events `onAudioSpectrum`, `onBeatFeedback`.
- Real-time visuals: `DriftMeter.tsx`, `SpectrumAnalyzer.tsx`, the
  evaluation panel in `containers/drill/evaluation/`.
- Calibration is learned by the timing analyzer during play and cached
  per (instrument, device) — W6 must run the normal evaluation path so
  the seed is real (`startEvaluation` / `stopEvaluation`).

## Deliverables

1. Extract the level meter from `AudioInputTestModal` into a reusable
   `src/components/InputLevelMeter.tsx` (modal keeps using it).
2. `steps/AudioInputStep.tsx` (`audio-input`): device dropdown, channel
   picker when > 1 channel, live meter, per-instrument guidance line.
   "Next" enables only after ≥ 1 s of signal above the noise floor;
   "Skip, I'll set this up later" always available. `isEnabled`: shown
   when coach tier ≠ off, or when the user accepted the optional "Try
   the listening feature" prompt (rendered at the end of W4 for
   timing-only users, decision 3).
3. `steps/HearItWorkStep.tsx` (`hear-it-work`): starts evaluation at
   80 BPM for 8 beats with a 4-beat count-in, renders onset dots and the
   timing ring inside the card, stops evaluation, shows one sentence from
   the template coach path (`coachGenerate` with the segment context, no
   LLM required). No onsets → "Didn't hear anything — check the input
   level" with Back to W5. Never fabricate a score.
4. W7 rows for input device and "listening" state come from O1's
   summary hooks.
5. i18n keys `onboarding.audioInput.*`, `onboarding.hearItWork.*`.
6. Tests: meter gating, `isEnabled` matrix, no-onset path, evaluation
   start/stop called exactly once.

## Gates

- `tsc`, vitest, build green. Manual (owner): laptop mic and an
  interface; onsets appear while playing; calibration cache entry exists
  afterwards (Settings → Devices shows it).
