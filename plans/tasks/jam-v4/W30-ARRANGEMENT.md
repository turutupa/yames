# W30 — the band plays a song

Branch `jam-v4-w30-arrangement` from `jam-v4`. Read the shared BRIEF's
contract first, then `plans/JAM_KILLER.md` §2 A1, then `src/jam/compile.ts`,
`forms.ts`, `intensity.ts`, the bar-ahead sender in
`src/containers/main-window/hooks/useJamSession.ts`, `FormTimeline.tsx`
and the setup sheet's form group. Area per the BRIEF's table.

## What to build

1. **`src/jam/arrangement.ts`**: `bandMoment(jam, chorus, formBar)` per
   the contract, and the rules behind it, written as data a musician could
   read (a table per mode, per style family where the style differs):
   - `loop`: every moment is full / normal / no crash beyond `crashOnOne`,
     the fill every N as today. Byte-for-byte what plays today.
   - `build`: intro `fill` → the count-in's last bar carries a small fill
     (when the count-in is None, bar one simply starts with a crash).
     Chorus 1 soft (closed hats, bass sparse: roots and fifths on the
     strong beats, keys sparse: one voicing per bar); chorus 2 normal;
     chorus 3+ loud where the style goes loud (rock, hard rock, metal,
     funk, pop, country: yes; jazz, bossa, ballad: normal with the ride
     opening up — express it as intensity normal + `crash` on section
     tops). Breakdown every `breakdownEvery` choruses (default 4): drums
     `hatsAndKick`, bass full, keys off for the first half of the chorus,
     everything back at the second half with a big fill into it. Stop-time
     on the last bar of the form's last section for blues and rock
     families (`stopTime`: hits on beat one only, bass and keys on one,
     silence after), once every two choruses. A crash at the top of every
     chorus and at the top of a breakdown's second half. Fills: `small` at
     section seams, `big` into a chorus top and out of a breakdown.
   - `song`: build, for `choruses` choruses, then `ending`: `hold` where
     the style holds (a final downbeat hit with crash, bass and keys on
     the root, nothing after — the engine stops after the bar), `stop` for
     styles that stop dead (funk, metal, hard rock). The bar before the
     ending gets a `big` fill.
2. **`compileJam`** takes `chorus`, calls `bandMoment`, and applies it:
   drums `hatsAndKick` removes snare/ride/crash/toms rows and keeps the
   hats and kick; `stopTime` keeps only tick 0 of the bar on every lane
   at accent; `off` silences lanes; bass `sparse` keeps the notes on
   beats 1 and 3 (or 1 in three-time) and drops the rest; keys `sparse`
   keeps one voicing per bar; `fill` maps to the groove's fill (`small` =
   the fill's last beat only; `big` = the whole fill at peak on its last
   tick); `crash` forces tick 0 of the crash lane to peak. Sets `applyAt:
   "barLine"` when the moment differs from the previous bar's (the sender
   knows), and `endsForm` on the last bar of a song. Everything is pure
   and tested per mode and per style family: a table of expected moments
   for a 12-bar blues over 8 choruses in `build`, and the same in `song`
   with `choruses: 3`, asserted bar by bar.
3. **The bar-ahead sender**: passes `chorus` (from `BeatEvent.chorus`),
   sets `applyAt` from the moment change, listens for `jam-ended` and
   puts the transport into stopped state (the takes hook must finish the
   take as a stop does — check `useJamTakes`).
4. **Setup sheet, THE FORM group**: a segmented **Loop · Build · Song**,
   with `choruses` (a stepper 2–32) beside Song, and **Breakdown every**
   (Off · 2 · 4 · 8) under a MORE-style disclosure. One line under it that
   says what the mode does. New jams default to Build; loaded jams
   without the field are Loop, so nothing anyone saved changes.
5. **The timeline**: a thin dynamics mark per bar (three heights for soft,
   normal, loud; a hatched bar for a breakdown; a dot for a crash), drawn
   from `bandMoment` for the chorus on screen, so a player can see the
   build coming. Nothing that moves except the current-bar highlight.
6. **Locales**: every new string in fifteen files.

## Gates
`npx tsc --noEmit`, `npx vitest run`. Report the moment tables you settled
on per style family, in words.
