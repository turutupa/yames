# Leg cues3: Chords in a Key's cues (one thing to try)

Branch `coach-cues3`, worktree `/home/dgx-delgado/yames-coach-cues3`, logs `/tmp/coach-cues3/`.
Cues: `src/paths/specs/chords-in-a-key-cues.ts`, attached with `withCues` in `chords-in-a-key.ts`.

## State

- [x] Step 1: read; 73 Exercises (69 in 20 Steps, 4 warm-ups): 63 graded, 6 self-checked (general cue only), the
  warm-ups key-varied. Dump `/tmp/coach-cues3/chords-in-a-key-dump.txt`, and a compact one with each bar's chord
  and its string:fret+finger notes, `/tmp/coach-cues3/compact.txt` (`compact-entry.ts`).
- [x] Level 1 (Beginner: Steps 1-6 and the warm-up), 22 Exercises (`e43b56f8`). One refusal: "Drop three frets for
  C, then back for B flat." (`cue.specific`: a distance) -> "Move finger one down to fret three for C."
- [x] Level 2 (Intermediate: Steps 7-14 and the warm-up), 27 Exercises. Refusals: "Move to the top three strings
  for the E chord." (`cue.specific`: E could be a string) -> "... for chord five."; one at 49 characters.
- [x] Level 3 (Advanced: Steps 15-20 and two warm-ups), 24 Exercises. Refusals: three at 49 characters, shortened.
  All 73: 600 cues, 160 distinct sentences; `refusals-entry.ts` lists 0 drops (`cueTexts`) on every variant.
- [ ] Proof-read (three sonnet readers, one per Level)
- [ ] Translations
- [ ] Gates
