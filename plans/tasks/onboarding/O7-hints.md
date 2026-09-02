# O7 — Progressive first-time hints

Size: M. Branch: `onboarding/o7-hints`. Depends on: O1 merged.

## Goal

Six contextual hints that each appear once, at most one per session,
exactly where they help.

## Facts

- Session counter: `useSession` starts/ends sessions; history via
  `getSessionHistory`. Presets via `listPresets`/`savePreset`.
- Mini-report rendering: `CoachFeedMessage.tsx` `case "mini-report"`.
- Zen: `containers/zen/FullscreenView.tsx`; widget toggle action
  `toggle-widget`; MIDI hot-plug `onMidiDevicesChanged` + bindings
  `getMidiBindings`.

## Deliverables

1. `src/containers/onboarding/hints/useFirstTimeHint.ts` — `(id) =>
   { shouldShow, markShown }` backed by `hints.<id>` and the rate limit
   `hints.lastShownSession` (one hint per app session; the session
   counter increments on app start).
2. `HintCard.tsx` — small dismissible card with optional action button,
   anchored near a `data-hint="<id>"` element (reuse O6's anchoring
   helper if merged, else a minimal one).
3. The six hints from `ONBOARDING_PLAN.md` §5 with their triggers:
   `drill-first-open`, `preset-suggest` (same BPM/subdivision/groups in
   3 sessions with no matching preset → "Save as preset?" opens the save
   bar), `coach-ask`, `zen-first`, `widget-discover` (5th session, widget
   never opened), `midi-plugged` (device appears, no bindings → opens the
   capture flow from O3 if merged, else Settings → Hotkeys).
4. Settings → General: "Reset hints" (clears `hints.*`).
5. i18n keys `onboarding.hints.*` in all locales.
6. Tests: fires once; rate limit across sessions; each trigger predicate
   as a pure function with cases.

## Gates

- `tsc`, vitest, build green. Manual: two triggers in one session show
  only one hint; next session shows the other.
