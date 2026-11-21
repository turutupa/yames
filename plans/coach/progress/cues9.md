# Leg cues9: Funk Lines' cues (one thing to try)

Branch `coach-cues9`, worktree `/home/dgx-delgado/yames-coach-cues9`, logs `/tmp/coach-cues9/`.
Cues: `src/paths/specs/funk-lines-cues.ts`, attached with `withCues` in `funk-lines.ts`.

## State

- [x] Step 1: read; 49 Exercises (46 graded in 14 Steps, 3 warm-ups). Dump
  `/tmp/coach-cues9/funk-lines-dump.txt`.
- [x] Level 1 (Beginner: the-engine, holes, holes-mixed, first-lines, lines-second-key, warm-up swing-up),
  18 Exercises (`c81a7248`). `check`: 0 errors, 0 refused (`gc1.log`).
- [x] Level 2 (Intermediate: stabs, line-and-stab, second-pair, octaves, warm-up hole-up), 14 Exercises
  (`44c0c271`). One `cue.specific` ("Keep the E's half as even as the D's.": a letter that could be a
  string) -> "Keep the second half as even as the first." (`gc2.log`, `gc3.log`).
- [x] Level 3 (Advanced: displaced, displaced-shapes, the-sixth, the-pocket, long-form, warm-up threes-up),
  17 Exercises (`ef83291e`). `check`: 0 errors, 0 refused (`gc4.log`).
- [ ] Proof-read: three sonnet readers, one per Level (`/tmp/coach-cues9/proof-funk-lines/`).
- [ ] Translations.
- [ ] Gates.

## How these cues are written

Funk is the count. Most cues say where a note sits in '1 e and a', which sixteenth stays silent, or what
to wait out, with digits only inside quoted counts. The `extras` cues are the one place a stray note is
named, always as an order ("Leave the 'e' of every beat silent."). The app hears neither ghosted strokes
nor the swing of the hand nor how short a note was; "keep the pick swinging" and "keep every stab the same
length" appear only as teaching (a general cue, or a `late` cue as an order), never as a reason. The
key-moving Exercises (the three warm-ups, "The second vamp with the band", "Eight bars with the band")
name no fret, string, note or chord.
