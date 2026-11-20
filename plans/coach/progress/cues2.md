# Leg cues2: Blues Pentatonics' cues (one thing to try)

Branch `coach-cues2`, worktree `/home/dgx-delgado/yames-coach-cues2`, logs `/tmp/coach-cues2/`.
Cues: `src/paths/specs/blues-pentatonics-cues.ts`, attached with `withCues` in `blues-pentatonics.ts`.

## State

- [x] Step 1: read; 100 Exercises (97 in 24 Steps, 3 warm-ups): 79 graded, 15 self-checked, 3 practice-only
  (those 18 get a general cue only). Dump `/tmp/coach-cues2/blues-pentatonics-dump.txt`.
- [x] A partly cued Path passes `check` (Level 1 only cued: 0 errors, `/tmp/coach-cues2/gc2.log`), so a Path can
  land in two legs.
- [x] Level 1 (beginner: box-one, box-keys, straight-feel, landing, call-response, landing-review, warm-up
  box-around). Refusals on the first check: 5, all `cue.specific` on "the E" (a letter that could be a string):
  e7-arpeggio "then the E" -> "then the root"; c7-third's four cues on E -> "the third", "fret nine", "the last
  note".
- [x] Level 2 (intermediate: blues-scale, twelve-bar, quick-change, bends, open-e-blues, minor-blues,
  minor-blues-in-d, question-answer, warm-up boogie-keys). `check` 0 errors, but `cueTexts` (my
  `/tmp/coach-cues2/refusals-entry.ts`) dropped 21 variant cues silently: "long-short pair" and "cross strings"
  in the warm-up ("pair", "cross" say which string is next), "new root" in boogie-keys (an interval), "three
  frets in a row" (a distance) and "Let the hand move" (the hand's position) where the E variant is not a
  uniform transposition. Reworded (the shuffle's late/early everywhere -> "Put each beat's long note right on
  the beat." / "Wait for the beat before each long note."): 0 refusals.
- [ ] Level 3
- [ ] Proof-read
- [ ] Translations
- [ ] Gates
