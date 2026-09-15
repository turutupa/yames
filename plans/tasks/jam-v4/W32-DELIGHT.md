# W32 — the first minute

Branch `jam-v4-w32-delight` from `jam-v4`. Read the shared BRIEF's
contract, `plans/JAM_KILLER.md` §2 A4, `src/containers/jam/VibePicker.tsx`,
`JamEmpty.tsx`, the kit preview path in `useJamSession.ts` (`previewKit`,
`onPreviewKit`, how it plays two bars and hands back), the rail in
`MainWindow.tsx` / the sidebar, and the hint system (`src/styles/hints.css`
and where Jam's first-run hints are declared). Area per the BRIEF's table.

## 1. Every vibe tile plays
Hover a tile (or hold it on touch, or focus it and press Space) and the
band plays two bars of that vibe's default variation on the real engine,
through the same path the kit preview uses, without changing the jam; move
off and it stops, or the two bars end and it stops. On a variation tile
the same, with the variation. When the band is already playing, a preview
waits for the bar line, plays its two bars, and the jam's own table comes
back at the bar line after — no gap, no click. A small "playing" mark on
the tile while it sounds. `previewVibe(vibeId, variationId?)` and
`stopPreview()` on `useJamSession`, built on the existing preview
mechanism rather than beside it. Tests on the hook: the engine receives a
compiled table for the vibe, the jam record is untouched, the previous
table is restored.

## 2. Jam now
One button, **Jam now**, on the empty Jam screen (above the library's
hint) and in the rail's Jam entry as a small play glyph when no jam is
open. It picks the vibe for the player's instrument (guitar → rock, bass
→ funk, keys → jazz, drums → rock, voice → pop, else rock), creates a jam
named for the vibe ("Rock jam"), loads it, and starts the band with the
jam's count-in. If the library already holds a jam made this way, it
starts that one instead of making another. The setup sheet does not open
(the point is to be playing in one tap); the vibe chip in the context bar
says what is playing. Tests.

## 3. The first-run hints for Jam
Cut them to three, shown once each: on the first Jam now / first load
("Set up changes the band; Chords is your cheat sheet"), the first time a
sheet is open while playing ("Everything here changes at the next bar"),
and the first breakdown or ending the band plays ("The band builds and
breaks down on its own — Loop in Set up turns that off"). Any other jam
hint goes. Locales in fifteen files.

## Gates
`npx tsc --noEmit`, `npx vitest run`. Report what the preview does at the
bar line while playing, and the hint texts.
