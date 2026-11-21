# Leg cues12: Tapping's cues (one thing to try)

Branch `coach-cues12`, worktree `/home/dgx-delgado/yames-coach-cues12`, logs `/tmp/coach-cues12/`.
Cues: `src/paths/specs/tapping-cues.ts`, attached with `withCues` in `tapping.ts`.

## State

- [x] Step 1: read; 52 Exercises (49 graded in 15 Steps, 3 warm-ups). Dump
  `/tmp/coach-cues12/tapping-dump.txt`. Possible triggers: no `shift`, no `openString`, no `notes` anywhere
  (the pass marks are timing, notes heard and extras); `stringChange` on 11, `afterHeld` on one.
- [x] Level 1 (Beginner: first-taps, moving-the-tap, changing-the-chord, cell-in-e-minor, warm-up
  cell-around), 14 Exercises. `check`: 0 errors, 0 refused, 0 cues rewritten (`gc2.log`).
- [ ] Level 2
- [ ] Level 3
- [ ] Proof-read
- [ ] Translations
- [ ] Gates

## Refusals and rewordings

Level 1: the G-string variants of the Step 1 cells hammer with the third finger, so "the little finger"
was refused three times -> "Land each hammer-on firmly enough to sound.", "Bring the tap down as the
hammer-on lands.", "Flick the last pull-off toward the floor.". `cue.specific` refused "for the E chord"
(a bare E reads as a string) -> "for the last chord".
