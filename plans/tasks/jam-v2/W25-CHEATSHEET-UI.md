# W25 — the cheat sheet on screen, and everything that appears arrives

Branch `jam-v2-w25-cheatsheet-ui` from `jam-v2` (tip 00487cf or later).
Read `plans/tasks/jam-v2/BRIEF.md`, then decisions **A10** and **A11** in
`plans/JAM_UX_DECISIONS.md`, then `src/containers/jam/ChordSheet.tsx`,
`JamSheet.tsx`, `JamView.tsx` (the `screen` state and the two sheets at the
bottom), `src/containers/zen/ZenTransition.tsx` and
`src/components/ViewTransition.tsx` (how the app already animates and what
switches it off), and `src/hooks/useReducedMotion.ts`. Area: `src/containers/
jam/**`, `src/components/**` (a new presence primitive), `src/styles/jam.css`
(and a new `src/styles/motion.css` if the tokens belong nowhere else), all
fifteen `src/locales/*/jam.json`, and tests. **No `src/jam/` data modules,
no `src-tauri/`.**

W24 is building `src/jam/cheatSheet.ts` and the `"5"` chord type at the
same time, to the contract in `plans/tasks/jam-v2/W24-CHEATSHEET-DATA.md`
§3. Until it lands, write `src/jam/cheatSheet.ts` yourself as a **stub that
implements that contract with the simplest true behaviour** (e.g. `"power"`
returning the triads with quality `"maj"`, `fitsKey` using the major scale
only), mark the file `// W25 stub — W24 replaces this file wholesale`, and
never import anything from it that the contract does not list. The
orchestrator drops your stub at merge. Do not add `"5"` to any union.

## Part one — the sheet (A10)

### The frame

The Chords sheet keeps its title, its Done button and its docked geometry.
Under the header, a two-way page control: **In key · All chords**
(`Segmented` exists; use it). The page is screen state in `useJamScreen`
(or wherever `screen.sevenths` lives): `chordPage: "key" | "all"`, and
`screen.sevenths` becomes `chordFlavour: ChordFlavour`, initialised with
`defaultFlavour(jam)` when the sheet opens for a jam and remembered for the
screen session. The "every way to play it" section and the pin, the
Follow-the-jam switch and the static fretboard stay where they are, under
whichever page is open; Follow the jam is shown only on In key.

### In key

What is there today, with the flavour control in place of Triads/7ths:
**Triads · 7ths · Colours · Power**, four segments. Cards come from
`chordsAtFlavour(playedKey.root, playedKey.mode, flavour)`. At Colours the
cards are grouped by degree: a slim degree label ("V") above its group,
cards inside ("Gsus4", "Gsus2", "G9"). At Power, the degree under the card
reads "I5". A key with no colours at a degree simply has no group for it.

### All chords

- A root row: twelve pills from `rootNames(playedKey)`, the key's own root
  first-selected, the roots of the key's chords carrying the in-key mark
  (a small dot in the accent colour, with an `aria-label` that says "in
  key"). Selecting a root is screen state (`chordRoot: PitchClass`).
- Under it, for that root, three groups with labels **Basic · Sevenths ·
  Colours** from `CHORD_FAMILIES` / `qualitiesInFamily`: one card per
  quality, drawn once as `basicShape(shapesFor(root, quality))`, named by
  `chordName`. Cards whose chord `fitsKey` carry the same in-key mark.
- A switch **Only in key**, off by default, screen state, that hides the
  cards that do not fit. When every card in a group is hidden, the group
  label goes too. When nothing at all fits (a root outside the key with
  the switch on), one quiet line: "Nothing from {{root}} fits {{key}}".
- Tapping a card expands "every way to play it" underneath, exactly as
  In key does; the expanded chord is the same `screen.pinnedChord` state
  so the section is shared. Pin works from here and the pinned shape shows
  on the playing screen even when it is not a chord of the key.

### Players with no neck

`instrument === null` (a player who chose neither guitar nor bass): both
pages still list the names, as In key does today, and the shapes section
stays hidden. Bass players get bass shapes everywhere.

### Copy

Plain words a musician would use, in all fifteen locales, the same keys in
every file (the contract test enforces it). New keys under `jam.chords.*`:
the two page names, the four flavours, the three families, "Only in key",
"in key" (the mark's label), the nothing-fits line, the sheet subtitle for
All chords ("every chord, one grip each — tap for the rest"), and a locale
key for the `"5"` quality in the progression picker if W24's report names
one. English is yours to write well; the other fourteen are translations
of it, in each language's own musical vocabulary (a power chord is a
"quinta" in Spanish, an "accord de puissance" in French, "Powerchord" in
German). Do not leave English in a non-English file.

## Part two — everything that appears, arrives (A11)

### The primitive

`src/components/Presence.tsx`: `<Presence open={boolean} onExited?>` that
renders its child while open, and on close keeps it mounted with a
`data-state="exiting"` attribute until the exit animation ends (listen for
`animationend` on the child's element, with a timeout fallback of the exit
duration plus 50 ms so a surface never gets stuck), then unmounts. While
entering it carries `data-state="entering"`, then `"open"`. It reads
`useReducedMotion(viewTransitions)` and the theme id, and when motion is
off it mounts and unmounts in one frame with `data-state="open"` only —
the same three inputs `ViewTransition` takes (`themeId`, `disabled`,
`level`); thread them into `JamView` the way MainWindow threads them into
`ViewTransition`. Tests: mounts on open, keeps the child through the exit,
unmounts after `animationend`, unmounts on the fallback timer, skips both
when motion is off.

### The tokens

In one place (`src/styles/motion.css`, imported where the other style
sheets are): `--motion-enter: 240ms`, `--motion-exit: 160ms`,
`--motion-ease: cubic-bezier(0.2, 0, 0, 1)` (or the easing the app already
uses in `ViewTransition`'s stylesheet, if it has one — reuse before
inventing), and the keyframes: `sheet-in` / `sheet-out` (translateX 100% ↔
0), `scrim-in` / `scrim-out` (opacity), `drawer-in` / `drawer-out`
(translateY 100% ↔ 0, for the editor drawer at the bottom), `unfold-in` /
`unfold-out` (opacity + a 6 px translateY, for sections that open in
place). `@media (prefers-reduced-motion: reduce)` and
`[data-theme-transition="mono"]` set every one of them to `none`.

### The surfaces

Each of these gets the primitive and a pair of keyframes; nothing inside
them animates on its own:

- The setup sheet and the chord sheet (`JamSheet`): slide in from the
  right, slide out. The scrim behind setup fades in and out.
- The groove editor drawer (`GrooveEditorDrawer`, `open` prop): rises,
  sinks.
- "Every way to play it" and the Colours degree groups: unfold.
- A vibe's variation row in the setup sheet, the pinned shape on the
  playing screen (`PinnedShape`), the first-run hints, the takes intro
  dialog (`TakesIntroDialog`) and its scrim.
- Changing page or flavour inside the chord sheet does **not** animate
  the cards — a cheat sheet that shuffles is the thing A8 removed.

Focus rules hold: the sheet still takes focus on open (after the mount,
not after the animation), and Escape still closes it during the entry.
Closing and reopening quickly must not leave a ghost: opening while
exiting cancels the exit and re-enters from where it is.

### Prove it

Tests with fake timers for the primitive; a JamView test that opens the
chord sheet and finds it `data-state="entering"` then `"open"`, closes it
and finds `"exiting"` then gone; a test that with `viewTransitions: "off"`
it is `"open"` at once. Then a real look: `npm run dev` is **not** allowed
(the owner's instance holds the port); use the shots harness
(`scripts/take-screenshots.mjs`, `shots.html`, `src/shots/mockIpc.ts`) to
render the chord sheet on both pages, at Colours and at Power, and All
chords with Only in key on, and put the PNGs in your report.

## Gates

`npx tsc --noEmit`, `npx vitest run` (whole suite; restore
`src/containers/onboarding/__snapshots__/emptyStates.test.tsx.snap` with
`git checkout --` afterwards, vitest rewrites its line endings), the i18n
contract test green with your keys in all fifteen files.

## Report

What you built, the screen-state fields you added, every locale key you
added, the PNGs, and anything in the W24 contract you had to work around.
