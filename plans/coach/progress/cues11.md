# Leg cues11: Arpeggios over Changes' cues (one thing to try)

Branch `coach-cues11`, worktree `/home/dgx-delgado/yames-coach-cues11`, logs `/tmp/coach-cues11/`.
Cues: `src/paths/specs/arpeggios-over-changes-cues.ts`, attached with `withCues` in `arpeggios-over-changes.ts`.

## State

- [x] Step 1: read; 57 Exercises (54 in 16 Steps: 49 graded, 5 self-checked with the general cue only; 3
  warm-ups, key- and shape-varied). Four Step Exercises are key-varied (`two-five-one-keys`,
  `four-chords-keys`, `the-line-keys`, `minor-line-keys`, `song-sweeps-keys`). Dump
  `/tmp/coach-cues11/arpeggios-over-changes-dump.txt`.
- [x] Level 1 (Beginner: one-octave, four-chords, four-chords-in-g, nearest-note, nearest-note-again, warm-up),
  18 Exercises. Two `cue.specific` refusals: "Root on fret ten for C, fret seven for A minor." and the G / E
  minor one ("Root on fret five for G, ...") -> "Start C at fret ten, A minor at fret seven." /
  "Start G at fret five, E minor at fourteen." (`gc2.log`: 0 errors, 0 refused, 0 rewritten).
- [x] Level 2 (Intermediate: sevenths, sevenths-in-g, two-octaves, two-octaves-more, sevenths-across,
  a-whole-form, warm-up), 20 Exercises. Refusals: `cue.specific` on "Seventh at fret seven for C, three for A
  minor." and its G twin (a second fret number with no "fret" before it, after "for <chord>") -> "Put each
  seventh on top: fret seven, then three." / "..., fret two, then ten."; `cue.refused` on the intermediate
  warm-up's coming-down variants for "Keep the pick close as it crosses strings." -> "Keep the pick close to
  the strings." (`gc4.log`: 0 errors, 0 refused, 0 rewritten). Level 1's quarter-note Exercises had the
  eighth-note shift cue; changed to "Move as each chord's last note ends.", and the one-octave `lastBars`
  (it repeated `afterHeld`) to "Keep the way down as even as the way up.".
- [ ] Level 3
- [ ] Proof-read
- [ ] Translations
- [ ] Gates
