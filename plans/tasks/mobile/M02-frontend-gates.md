# M02 — Frontend: a mobile bundle with no coach and no desktop chrome

Size: L. Branch: `mob/m02-frontend-gates`, from `mobile`. Blocks:
M03 (layout pass). Parallel-safe with M01 (owns `src-tauri/`), M03a
(owns `src/styles/`), M05a (docs, CI).

## Goal

`YAMES_MOBILE=1 npm run build` produces a `dist/` that contains none of
the coach, evaluation, voice, MIDI, widget, hotkey or window-management
code, and the app composed from it is metronome + drills + setlists +
zen + presets + settings + a four-step onboarding. The desktop build
and every desktop test are unchanged.

## Why (context you would otherwise lack)

- Read `plans/MOBILE_IMPLEMENTATION_PLAN.md` §1–§3. "Gone" means not
  in the bundle and never mentioned in the UI — no greyed tiles, no
  "coming soon".
- Views are `beat`, `drill`, `setlist`, `settings` plus the fullscreen
  overlay (`useTabRouting` in `MainWindow.tsx`). There is no coach tab;
  the coach is composed into:
  - `MainWindow.tsx`: `CoachCard`, `useCoachDownload`, `useEvaluation`,
    `useSession`, `CoachVoiceToast`, `useVoicePrompt`, `coachDebug`,
    the `WizardCoachEnv` / `WizardEvaluationEnv` wiring, `useMidi`,
    `useGamepad`, `useKeybindings`, `useDrag`, `TitleBar`,
    `getCurrentWindow`.
  - `MetronomeView.tsx`: `LastSession` (session history — cut);
    `AccentControl` and `MeterPresets` read `useSession` for metronome
    state, not coach state.
  - `FullscreenView.tsx` and `useActionDispatcher.ts`: `useSession` +
    window APIs.
  - `SettingsView.tsx`: `CoachSettingsSection`, `CoachDownloadStatus`,
    `AudioInputTestModal`, `InputTesterModal`, the input half of
    `DevicesSettingsSection`, `HotkeysSettingsSection`,
    `KeybindingModals`, `WidgetSettingsSection`, `UpdateBanner`.
  - Onboarding: `CoachStep`, `AudioInputStep`, `HearItWorkStep`,
    `HandsFreeStep`, `coachRecommendation.ts`. Mobile keeps
    Welcome → Instrument → Sound & look → Ready.
  - `src/coach/*` (≈20 modules), `src/containers/practice-coach/*`,
    `src/hooks/useSession.ts` (2 398 lines), `useEvaluation.ts`,
    `useCoachDownload.ts`, `coachLoader.ts`, `useMidi.ts`,
    `useGamepad.ts`, `useKeybindings.ts`, `useDrag.ts`,
    `components/WindowControls.tsx`, `components/TitleBar.tsx`,
    `components/DriftMeter.tsx`, `InputLevelMeter.tsx`,
    `SpectrumAnalyzer.tsx`, `SystemStatusChip.tsx` (check what it
    reports; if it is coach/brain status, cut), `AudioInputDropdown`,
    `MidiDeviceDropdown`, `containers/floating-widget/*`.
- Tour, hints, help menu and the shortcuts sheet are cut on mobile in
  v1 (plan §6 Q2). What's-new stays.
- `src/ipc.ts` wraps 87 commands. Roughly a third are coach,
  evaluation, TTS, MIDI, window or updater. M01 makes those return an
  error on mobile; your job is that nothing on the mobile import graph
  calls them.
- The `useSession` split is the hard part and the main regression
  risk. `MetronomeView`, `AccentControl`, `MeterPresets`,
  `FullscreenView`, `useActionDispatcher` need the metronome-state
  slice (bpm, subdivision, beat groups, accents, playing, mode…). The
  evaluation / coach / voice slice must move out so the metronome hook
  has no coach imports. Existing tests
  (`useSession.brainLoad.test.tsx`, `useSession.meterBoundary.test.tsx`,
  the MetronomeView / AccentControl / MeterPresets / FullscreenView
  suites) are your safety net; they must stay green unchanged, or
  changed only to import from the new location.
- `App.tsx` reads `?window=floating`; on mobile there is one window and
  no query. Drop the floating branch behind the flag.

## Design (follow it; deviations go in the PR description)

1. `src/platform.ts`:
   ```ts
   declare const __YAMES_MOBILE__: boolean;
   export const IS_MOBILE: boolean = typeof __YAMES_MOBILE__ !== "undefined" && __YAMES_MOBILE__;
   ```
   `vite.config.ts`: `define: { __YAMES_MOBILE__: JSON.stringify(process.env.YAMES_MOBILE === "1") }`.
   `vitest.config.ts`: same define, false; tests that need the mobile
   composition use `vi.stubGlobal("__YAMES_MOBILE__", true)` — check
   that works with `define`; if not, have `platform.ts` read a
   `globalThis.__YAMES_MOBILE_OVERRIDE__` in test mode only.
2. Desktop-only and coach-only subtrees load with `React.lazy` inside
   `if (!IS_MOBILE)` branches (or a `DesktopOnly` component that
   returns `null` on mobile and lazily renders its child otherwise),
   so Rollup drops them from the mobile bundle. Verify with the bundle
   check, not by assumption.
3. `src/ipc.ts` keeps commands both platforms have. New
   `src/ipc.desktop.ts` holds coach, evaluation, TTS, MIDI, window,
   widget, updater, hotkey calls and is imported only from desktop-only
   modules. Re-export nothing from one to the other.
4. `useSession.ts` → `useMetronomeState.ts` (platform-neutral slice)
   + `useSession.ts` (desktop, composes the neutral hook and adds the
   coach slice). Callers that only need metronome state import the
   neutral hook.
5. `scripts/check-mobile-bundle.mjs`: reads every file in `dist/assets`
   and fails if any of these strings appear: `coachBrainTier`, `piper`,
   `start_evaluation`, `tts_speak`, `show_floating`, `globalShortcut`,
   `connect_midi_device`, `set_always_on_top`, `check_update`,
   `practice-coach`, `CoachCard`. Add `"build:mobile": "cross-env-free"`
   — i.e. a script that sets `YAMES_MOBILE=1` portably (use
   `node -e` or a tiny `scripts/build-mobile.mjs`; do not add
   `cross-env` as a dependency) and then runs the check.
6. `index.html`: `viewport-fit=cover` on the viewport meta.
7. Onboarding on mobile: the four steps; the wizard's env types lose
   the coach / evaluation members behind the flag rather than
   receiving stubs.
8. Composition tests (vitest, `IS_MOBILE` true): `MainWindow`,
   `MetronomeView`, `SettingsView`, `OnboardingWizard` render; none of
   the cut components' test-ids or strings appear; `screen.queryByText`
   for "coach" (case-insensitive) is null across all four.

## Rules

- Do not touch `src/styles/**` beyond adding a conditional import if
  M03a asks for one via its brief (it does not; leave CSS alone).
  Do not touch `src-tauri/**` (M01).
- New user-visible strings in `src/locales/en.json`; none should be
  needed.
- Do not run `npm run tauri dev`: the owner is releasing today and the
  desktop settings store and port 1420 are theirs. Verify with tests
  and the bundle check. If you need to look at the app in a browser,
  `npx vite --port 1430` and accept that IPC rejects.
- Never `npm install`; `node_modules` is already in the worktree.

## Acceptance gate

- `bun run tsc --noEmit`, `bun run test` green with the flag off.
- `YAMES_MOBILE=1` build passes `scripts/check-mobile-bundle.mjs`.
- The four mobile composition tests pass.
- `git diff --stat main -- src-tauri src/styles` is empty.

## Report

What was done, the final list of files behind the flag, the
`useSession` split shape, exact commands and results, anything not
verified, open questions for M03. Open a PR against `mobile`; do not
merge; do not push to `main`.
