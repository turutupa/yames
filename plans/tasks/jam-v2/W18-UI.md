# W18 — the screen, restructured: two states, a vibe first, a chord sheet

Branch `jam-v2-w18-ui` from `jam-v2`. Area: `src/` except the files W19
owns (see BRIEF.md). Read the decision log entries A1–A9, B1, B5, B7; the
boards "Playing, calm", "Set up, a vibe first", "Rock, which one", "The
chord sheet", "The kit list".

## What to build

1. **Two states (A1, A5).** The jam screen becomes a PLAYING screen of
   five blocks in this order: NOW chord with the next change and two
   scales; the timeline; tempo with feel and intensity beside it; the band
   as one row (drums, bass, keys, you) with a mute each; the practice
   switches. Nothing else. A **Set up** button in the context bar opens a
   SETUP sheet docked to the right (640px, under the header, above the
   transport, the playing screen dimmed behind it). New jam opens the
   sheet; Play and Esc close it. Zen and the setlist player are unchanged.
2. **The setup sheet (A2, A3, A4, A9, B7).** In order: VIBE tiles (eight,
   from W19's `vibes.ts`; picking one applies its bundle to the jam and the
   sheet says "started from the Rock vibe"); the variation chips for the
   picked vibe, plus "one of yours" which lists your saved jams of that
   vibe; THE DRUMMER (groove cards in a 6-column grid, feel, intensity, a
   Kit dropdown with a Preview button that plays two bars of the current
   groove on that kit through the normal engine path, Fills); THE FORM
   (Shape dropdown, one Count-in control combining bars and sound, the key
   row, Edit changes); THE BAND (three toggles, and when a player is on, a
   Voice dropdown and a volume); MORE, collapsed: meter override, what you
   read, takes. Ticks per beat is removed from the UI. Spoken cues move to
   Settings › Voice as one switch. Transposition shows only when the
   instrument is not guitar, bass or keys.
3. **Drums only by default (B1).** `lineupFor` stays, but a new jam starts
   with `band: { drums: true, bass: false, keys: false }` for everyone
   except drummers (`{ drums: false, bass: true, keys: false }`).
4. **The chord sheet (A8).** Shapes leave the playing screen. A **Chords**
   button in the context bar opens a second docked sheet: the key's chords
   each as ONE basic shape (open, else the first barre; from
   `shapesFor`), a Triads / 7ths switch, "Follow the jam" off by default;
   tapping a chord expands every way to play it below; "Pin" puts one
   shape in the top-right corner of the playing screen where it stays
   until unpinned (`Jam.pinnedShape`). The fretboard is a switch on the
   same sheet showing one box for the key, static. `jam-next-shape` steps
   the expanded row.
5. **Intensity as a pattern (B5).** `compile.ts` applies W19's
   `applyIntensity` before compiling (stub as identity until W19 lands).
6. **Your own samples (B3).** In the Kit dropdown, under BUILT IN, a YOURS
   section with "A folder of your samples…" calling `pickKitFolder()`,
   then `inspectKitFolder(dir)` to show which voices were found and which
   fall back; stored as `Jam.customKit` and sent as `customKit`.
7. **Captions become hints (A7).** The four permanent captions become
   first-run hints through the onboarding hint system; the headphones line
   becomes the input chip's tooltip.
8. **Strings, tests, harness.** Every new string in all fifteen locales;
   tests for the sheet open/close, the vibe apply, drums-only default, the
   pin, the count-in merge; shots harness scenarios for the playing
   screen, the setup sheet, the chord sheet; screenshots in
   `.screenshots/`.

## Rules

Nothing in `src-tauri/`, `vibes.ts`, `grooves.ts`, `intensity.ts`. The
owner's app may hold port 1420; never touch it or the store.
