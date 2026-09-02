# O6 — Spotlight tour (six stops)

Size: M. Branch: `onboarding/o6-tour`. Depends on: O1 merged.

## Goal

A thirty-second guided tour that highlights six real controls with one
sentence and the hotkey each, re-openable any time.

## Facts

- No third-party UI libraries (CSP is null but keep the bundle lean;
  nothing else in the app uses one). Build it in-house.
- Targets: BPM dial and subdivision/groups in `MetronomeView.tsx` +
  `GroupEditor.tsx`; presets sidebar `components/presets/PresetSidebar.tsx`;
  tab bar in `MainHeader.tsx`; coach card `CoachCard.tsx`; zen/widget
  buttons in `MainHeader.tsx` / `FloatingPlayButton.tsx`.
- Hotkeys from `src/hotkeys.ts` — read, don't hardcode.

## Deliverables

1. `src/containers/onboarding/tour/Tour.tsx` + `useTour.ts`: overlay
   with a rounded cut-out around the target (`clip-path` or an SVG mask),
   card anchored to the target with flip logic, ←/→/Esc, progress "2 of
   6", "Done" on the last stop; re-measures on resize/scroll; reduced
   motion disables easing.
2. `data-tour="<id>"` attributes on the six targets (ids: `bpm`,
   `subdivision`, `presets`, `drill-tab`, `coach`, `zen-widget`). The tour
   switches tabs as needed (drill stop) and restores the previous tab.
3. Stops and copy per `ONBOARDING_PLAN.md` §4; hotkeys rendered from
   `hotkeys.ts` (platform-aware Cmd/Ctrl).
4. Entry points: O1's W7 "Show me around" (wire the prop), Settings →
   General "Take the tour", and a `?` Help button in the header if O8
   has not landed yet (O8 will fold it into the Help menu).
5. Store `tour.seenVersion = 1` on finish or dismiss; existing users
   (migration case in O1) get a one-time toast offering the tour.
6. i18n keys `onboarding.tour.*` in all locales.
7. Tests: anchoring math (pure function), keyboard navigation, tab
   switch/restore, seenVersion persistence.

## Gates

- `tsc`, vitest, build green. Manual at 480×780 and 800×900: every stop
  is visible and the card never overflows the window.
