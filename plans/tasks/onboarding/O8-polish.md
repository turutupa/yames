# O8 — Empty states, what's-new, Help menu, motion audit

Size: S–M. Branch: `onboarding/o8-polish`. Depends on: O1 merged
(parallel-safe with O2–O7; coordinate the header `?` button with O6).

## Deliverables

1. **Empty states** with one action each: presets sidebar ("Save your
   first preset" → opens save bar, shows the P hotkey), session history
   (`CoachHistoryList.tsx`: "Your sessions show up here after you stop
   the metronome"), drill idle (`DrillView.tsx`: one line per mode).
   Keep the existing coach-card empty state.
2. **What's new**: after an update, show the release notes for the
   installed version once. The updater fetches `latest.json`
   (`useAppUpdates.ts`, `checkForUpdate`); read `notes`, render as a
   modal on first launch of a new version, store `whatsNew.seenVersion`.
   Existing users upgrading into this build see it too.
3. **Help menu**: header `?` button and Cmd/Ctrl-/ → menu with: Take the
   tour (O6 entry; hidden if O6 not merged), Run setup again (O1),
   Keyboard shortcuts (read-only sheet reusing `HotkeysSettingsSection`
   content), Report a problem (existing `exportSessionLogs` flow),
   Website, Version.
4. **Always-on-top**: O1's W7 row; also make sure the first-run chip or
   Help mentions it — no extra UI beyond W7 unless missing.
5. **Motion audit**: every new onboarding animation honours
   `prefers-reduced-motion` and the `viewTransitions` preference; add a
   shared `useReducedMotion()` if none exists.
6. i18n keys under `onboarding.help.*`, `emptyStates.*`, `whatsNew.*`.
7. Tests: what's-new shows exactly once per version; help menu items
   present/hidden by feature availability; empty-state snapshots.

## Gates

- `tsc`, vitest, build green. Manual: simulate a version bump (edit the
  stored `whatsNew.seenVersion`) and confirm the modal appears once.
