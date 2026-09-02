# O2 — W2 "Sound & look" step with live preview

Size: S. Branch: `onboarding/o2-sound-look`. Depends on: O1 merged.

## Goal

Choosing the click sound and the theme is a five-second, hands-on
moment: hovering a sound card changes the softly playing click; picking
a theme restyles the whole window behind the overlay.

## Facts

- Sound sets: `SoundType` in `src/types.ts` and `setSoundType` in
  `src/ipc.ts`; the metronome dropdown in `MetronomeView.tsx` lists them.
- Themes: `src/themes.ts` (11 themes, `id`/`name`), applied via
  `setTheme` + `ThemeEffects.tsx`; the appearance section is
  `AppearanceSettingsSection.tsx`.
- The wizard keeps a soft click running at 80 BPM (O1's
  `startSoftClick`).

## Deliverables

1. `steps/SoundLookStep.tsx` registered as `sound-look` after
   `instrument`.
2. Left column: one card per sound set with an icon and name; focus or
   hover previews it by calling `setSoundType` (debounced ≤ 100 ms);
   Enter/Space selects; the selection persists exactly as the Settings
   dropdown does.
3. Right column: three curated theme cards — Obsidian (preselected),
   Aurora, Ivory — live preview on focus/hover by applying the theme;
   "More themes in Settings" link (opens Settings → Appearance and
   returns to the wizard on close). Esc or Back restores the previously
   confirmed theme and sound.
4. i18n keys `onboarding.soundLook.*` in all locales.
5. Tests: preview calls on focus, restore on Esc/Back, persistence on
   Next.

## Gates

- `tsc`, vitest, build green. Manual: sound changes within one beat of
  hovering; theme preview visible behind the overlay; Esc restores.
