# Jam — the band pass (bass, keys, changes)

Written 2026-09-16, when the owner asked for the bass and the keys to get
what the drummer already has: "different rhythm and stuff", chord
progressions that follow the style, and a sheet that shows whose setting is
whose. The owner is not a musician and asked for the musical calls to be
made here; they judge the result by ear.

## What was decided

**The engine** grew two optional per-note arrays on the bass and keys lines:
`velocities` (how hard; also picks the recorded layer) and `lengths` (how
long, in ticks). Before, every note was the same stroke and rang until the
next one, so a detached funk or reggae note could not be written.

**Changes** (`src/jam/changes.ts`) — a library of named progressions per
form and key mode, tagged with the styles they belong to and written with
that style's chord colour. `auto` picks by the groove's family and falls back
to the form's classic, kept bar for bar under its own name. Typed chords win.

**Bass** (`src/jam/bassFigures.ts`) — fifteen figures, a busyness, phrase
fills every fourth bar and on the form's last bar, and notes that follow a
chord arriving mid-bar. `auto` follows the drummer.

**Keys** (`src/jam/keysFigures.ts`) — nine comping styles, voicings by style,
and `auto` by groove.

## Corrections the plan review made, all built in

1. No power chords on keys: a left-hand root under a triad; a `5` chord is
   root-fifth-octave over the left hand.
2. Rootless jazz grips only when a bass is playing; the root comes back
   without one.
3. Montuno only over salsa-family grooves; bossa grooves get bossa comping.
4. Eight-bar loops are four-chord, not three (`i–bVI–bVII–i`), and the
   natural-minor loop `i–bVI–bIII–bVII` is in.
5. The walking line uses scale steps, chord tones and a chromatic approach,
   and turns differently on alternate bars.
6. Jazz comping rotates between four rhythms rather than repeating one.
7. Per-note dynamics, and the keys push the next chord at a phrase end.
8. The chord sheet reads the new chords (every library chord has scales).

Two calls made while building:

- The velocity wobble is per tick, not per bar, so a vamp is the same bar
  again: the bar-ahead handshake stays quiet, and a bassist on a one-chord
  groove does repeat the bar.
- Over an unchanging chord, the phrase-end note is the fifth or octave, not a
  chromatic approach (which over a rock power chord is a wrong note).
- The slow change stays the blues family's default twelve-bar; quick change
  is rock and country's.

## The sheet

One section per player — The song, Drums, Bass, Keys, Percussion — each with
a mark and a colour from the theme's two accents, and the player's on/off
switch on its heading. Feel moved to the song (the bass swings with it). The
playing screen's bass and keys rows each carry their own style picker, and
the header says "Band feel" and "Drum intensity".

## Listening

```
npx tsx scripts/sounds/band_demo.ts <dir>
YAMES_BAND_DEMO=<dir> node scripts/rust-test.mjs --release --lib --no-default-features \
  render_band_demos -- --ignored --nocapture
```

Fourteen demos, eight bars each, rendered through the engine's own mixer with
the shipped kits and recorded voices.

## Open

- Bass and keys are judged by ear; the owner has the first renders.
- `worst_bar_peak` re-measures when a bar's line changes (open item 5 of the
  main-thread note); more varied lines make that more frequent.
- No per-player "hint" line under each style name yet.
