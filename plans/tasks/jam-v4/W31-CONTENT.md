# W31 — content at scale, and paste a chord chart

Branch `jam-v4-w31-content` from `jam-v4`. Read the shared BRIEF's
contract, `plans/JAM_KILLER.md` §2 A3, `plans/JAM_REFERENCES.md`,
`src/jam/grooves.ts` (the 25 grooves as W28 rewrote them, with their
dynamics rules — read W28's brief `plans/tasks/jam-v3/W28-GROOVES-DYNAMICS.md`
§2, which still binds every groove you write), `jams.ts`, `progression.ts`,
`harmony.ts`, and the setup sheet's form group. Area per the BRIEF's table.

## 1. Grooves: twenty-five to about one hundred and twenty
Authored, not generated. Per style family, the variations a working
drummer actually distinguishes, each with its own hats, ghosts, fill and
bass style mapping, each named the way players name it, each with a
two-line comment on what it is and where it comes from (a reference track
where one exists — title, artist, year, no lyrics). Rough targets: rock
18, blues 10, funk and soul 14, jazz 12, latin 14, pop and dance 14, metal
and punk 10, country and folk 10, world 10 (afrobeat, reggae variants,
ska, bhangra, flamenco rumba, tango, klezmer, bolero, cumbia, highlife).
`family` and `tags` on every groove, old ones included. The groove picker
groups by family with a filter chip row. Odd meters where the style has
them (5/4 jazz, 7/8 Balkan) through the existing meter path.

## 2. Fifty starter jams
Across the nine vibes, five or six each, each with a real progression a
musician would recognise as the style (not the same I–IV–V fifty times),
a tempo, a key, a form, a vibe and variation, a name that says what it is
("Slow blues in G", "Bossa in D minor", "Two-step in A"). The existing six
stay. The library sidebar gains a vibe filter (chips, all by default).

## 3. Paste a chord chart
`src/jam/chart.ts`: `parseChordChart(text)` reads the notations
musicians actually paste:
- bar lines: `| Am | F | C | G |`, `Am | F | C | G`, one chord per bar, two
  chords per bar as `| Am F | C G |` (split the bar evenly), `%` or `/` for
  "same as before", `x2` on a bar or a bracketed group;
- iReal-style: `Am7 D7 | Gmaj7 | ...` and `[A]` `[B]` section letters
  (become sections);
- a lyric sheet with chord symbols above the words: take the chords,
  ignore the words, one bar per chord unless bar lines are present;
- chord symbols per `harmony.ts`'s parser, plus the spellings people type
  (`Amin`, `A-`, `AM7`, `A∆7`, `Aø`, `A°`, `A5`, slash chords keep the
  root and note the bass in `warnings`).
Returns bars, beats per bar (4 unless `3/4` or `6/8` appears), a guessed
key (the diatonic fit of the chord set, ties to the first chord), and
warnings in plain words. `jamFromChart(name, text, base)` makes a jam:
form `custom` at the chart's length (up to `JAM_MAX_FORM_BARS`), the
progression set, the key set, the base jam's vibe and tempo kept. Tests
for every notation above and for the ugly cases (empty, only words,
unknown symbols).

UI: in the setup sheet's THE FORM group, beside "Edit changes", a **Paste
chords** link opening a text area with a placeholder showing the three
notations, a live preview line ("12 bars, key of A, 2 chords you may want
to check"), and **Use these chords**. Locales in fifteen files.

## 4. `plans/JAM_REFERENCES.md`
A card per new family, and every groove listed under its family with its
reference.

## Gates
`npx tsc --noEmit`, `npx vitest run` (the groove invariants from W28's
tests apply to every groove you add; the i18n contract test). Report the
groove table (family, count, names), the fifty jams, and the chart
notations handled.
