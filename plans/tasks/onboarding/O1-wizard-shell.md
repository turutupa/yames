# O1 — Wizard shell, state machine, W0 / W1 / W7, reset path

Size: M. Branch: `onboarding/o1-wizard-shell`. Blocks: O2–O8.

## Goal

A first launch opens a polished welcome overlay, walks through
instrument selection and a "ready" summary, and lands on a working
metronome. The skip path reaches an audible click in under ten seconds.
Everything is re-openable from Settings. Later steps plug into the
shell without touching it.

## Facts about the code

- First-run today: `src/containers/main-window/MainWindow.tsx` ~259–275
  loads `instrument` from the store; if empty it sets
  `showInstrumentPicker` and mounts `InstrumentPickerModal` (~811–820),
  which persists `instrument`, calls `setInstrument` (backend) and
  closes. Skip = `electric-guitar`.
- `src/components/InstrumentPickerModal.tsx` — keep its grid as the body
  of step W1; styles `.instrument-picker-*` in `src/styles/main-window.css`
  (~4662–4770) are the visual baseline for the wizard.
- Beat events: `onBeat` in `src/ipc.ts`; metronome control via
  `useMetronome` (`togglePlayback`, `setBpm`, `setVolume`). The engine
  is started by `MainWindow`; the wizard can request "play softly at 80
  BPM" through props from `MainWindow`, and must restore the previous
  BPM/volume on close.
- Settings general section: `src/containers/settings/GeneralSettingsSection.tsx`.
- i18n: `src/locales/*.json` (15). `src/test/i18n.locales.test.ts`
  enforces exact key + placeholder parity across ALL locales — add every
  new key to every locale (translate; do not leave English copies
  untranslated in non-English files where a translation is obvious).
- View transitions pattern: `src/components/ViewTransition.tsx`,
  preference `viewTransitions` in `useUiPreferences`.
- Window minimum is 480×780 (`src-tauri/tauri.conf.json`).

## Deliverables

1. `src/containers/onboarding/`
   - `onboardingMachine.ts` — pure reducer: states `idle | welcome |
     step(<id>) | done`, events `START_SETUP | SKIP_ALL | NEXT | BACK |
     SKIP_STEP | JUMP(<id>) | CLOSE`; context `{ skipped: string[],
     visited: string[], coachTier?: ..., inputConfigured?: boolean }`;
     `nextEnabledStep()` honours `isEnabled` from the step registry.
   - `useOnboarding.ts` — loads/saves the store keys from the README,
     implements first-run detection (three cases in the README), exposes
     `{ open, openAt(stepId), close, state, dispatch, chipVisible,
     dismissChip }`.
   - `OnboardingWizard.tsx` — full-window overlay (reuse the
     `.instrument-picker-overlay` look), card with progress dots, Back /
     Skip / Next footer, focus trap, Esc = skip step (on W0 Esc =
     "Just give me the click"), ←/→ navigation, `aria-modal`, respects
     reduced motion and the `viewTransitions` preference.
   - `steps/types.ts` (contract in README), `steps/index.ts` (registry:
     welcome, instrument, ready for now — leave the other ids commented
     so O2–O5 insert in flow order), `steps/WelcomeStep.tsx`,
     `steps/InstrumentStep.tsx` (wraps the existing picker grid),
     `steps/ReadyStep.tsx`.
   - `FinishSetupChip.tsx` — small header chip "Finish setup" shown when
     the user skipped from W0; opens the wizard at W1; hidden after
     completion or two dismissals.
2. `MainWindow.tsx`: replace the `InstrumentPickerModal` mount with
   `<OnboardingWizard …/>` + the chip; keep `InstrumentPickerModal`
   exported (now used inside `InstrumentStep`). The wizard receives
   `{ startSoftClick(), stopSoftClick() }` callbacks implemented in
   `MainWindow` via `useMetronome` (80 BPM, volume 0.35, restore
   previous values on close; never start audio if the user chose
   "Just give me the click" — that path just closes).
3. W0 copy (en): title "Yames", line "A metronome built for real
   practice. Hands stay on the instrument.", buttons "Set me up (about a
   minute)" / "Just give me the click", footer "Free · local · open
   source · v{version}". Logo pulses on `onBeat` while the soft click
   plays.
4. W7 summary: rows for instrument, sound, theme, control, coach, input
   (rows for steps not yet implemented show the current setting), each
   row a button that `JUMP`s to that step; "Always on top" row with a
   toggle bound to the existing `setAlwaysOnTop`; primary button "Start
   practicing" → `CLOSE` → metronome tab, BPM 80, coach card collapsed;
   secondary "Show me around (30 s)" → emits `onRequestTour()` (O6 wires
   it; until then the button is hidden behind a prop).
5. Settings → General: "Run setup again" button → `openAt("welcome")`.
6. i18n keys under `onboarding.*` in all 15 locales.
7. Tests: `onboardingMachine.test.ts` (every transition, skip paths,
   `isEnabled` hiding, JUMP), `useOnboarding.test.ts` (three first-run
   cases with mocked store), component tests for the three steps and
   the chip (`@testing-library/react`, happy-dom, see `src/test/`).

## Gates

- `bun run tsc --noEmit`, `bun run test` (incl. i18n parity), `bun run
  build` green.
- Manual under `npm run tauri dev` on Windows (MSVC, see AGENTS.md):
  clear the store (`settings.json` in the app data dir) → W0 appears;
  "Just give me the click" → metronome plays when Space is pressed
  within 10 s; "Set me up" → W1 → W7 → "Start practicing" lands on the
  metronome; Settings → Run setup again reopens W0. Verify at 480×780.
- Existing-user migration: with `instrument` set and no
  `onboarding.version`, no wizard appears.

## Do not

- Do not implement W2–W6 (other briefs). Do not add a tour or hints.
- Do not change engine/IPC code; everything is frontend + store.
