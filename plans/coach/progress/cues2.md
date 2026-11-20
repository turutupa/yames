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
- [x] Level 3 (advanced: two-boxes, up-the-neck, box-five, three-choruses, three-choruses-in-e,
  major-and-minor, sixths, guide-tones, slow-blues, slow-blues-in-c, warm-up two-boxes-keys). Refusals:
  `cue.specific` x2 "Keep the B string quiet between the two." (sixths: the B string is never played) -> "the
  middle string"; `cueTexts` x2 "Move the hand while the held note rings." (both-tones, E: the hand's position)
  -> "Arrive on the new note as each bar starts."; "Keep pressing through the slide to the new fret." (warm-up,
  E: a layout of frets) -> "Keep pressing all the way through the slide." All 100 Exercises: 763 cues, 312
  distinct sentences, 0 refusals, check 0 errors (`gc6.log`).
- [x] Proof-read (below): two sonnet readers (Levels 1-2 and warm-ups; Level 3), 30 objections, all taken.
  763 cues, 317 distinct sentences, 0 refusals, check 0 errors (`gc7.log`).
- [ ] Translations
- [ ] Gates

## The proof-read (two separate sonnet readers: cues, tabs, purposes, how-tos, the guide's rules only)

30 objections (`/tmp/coach-cues2/proof-blues-pentatonics/objections-a.md`, `objections-b.md`), all taken
(was -> now):
three-as, riffs-in-c general "Start each bar on its A/C" and late "each bar's first A/C" (bar 4 starts on E/G)
-> "Start each riff on its A/C without looking." / "Put each bar's first note right on the beat." ·
chorus-in-keys general named the low E string on a moving-key Exercise -> "Find the key's root before you
start." · landing-chorus general "Hold each third its full two beats." (bar 11's C# is short) -> "Land each
phrase on its third and let it ring." · the-turn general "Hold each chord's own note" (the last G# is a
quarter) -> "Land on ..." · nine `lastBars` cues that repeated the `afterHeld` hold (first-lick, lick-in-e,
blue-third, passing, bend-and-release, the five arpeggio licks) -> "Keep the long-short swing / the shuffle /
the eighths even right to the last ...", and for the arpeggio licks "Walk down G, E, D, C, then settle on C#."
and its moves (c7: "... to the third.") · two-on-two-off: three cues counted the silent bars -> afterHeld
"Count '1, 2, 3, 4' twice, then play.", lastBars "Let the last note go and stay off the strings." ·
four-answers afterHeld repeated late/early -> "Hum the call while it plays, then answer." · two-boxes-keys
shift "Let the slide carry the hand." (only bar 1 slides) -> "Move to each new place in one calm motion." ·
"Move the hand while the held note rings." (shift, eight Exercises: a held fretted note cannot be left while
it rings) -> "Arrive at the new fret right on its beat." · chorus-peak afterHeld "the bend's two beats" (only
bars 5 and 7 bend) -> the stock held-note count · e-chorus-climb extras "Rest one beat after each bend" (the
second bend has no rest) -> "Leave the beat after the first bend silent." · chorus-low, e-chorus-low,
play-less extras "Play nothing in the empty bars." (repeated the general) -> "Rest both hands in the empty
bars." · a7-sixths, sixths-twelve stringChange "Keep the pick close as you cross strings." (the sixths never
cross) -> "Keep both fingers on their strings as you move." / "Let the third finger take the top string on D7."

Answered, not changed: none. A tab point outside the cues, for the Path's owner: quick-chorus bar 2 reads
D, C, A, A, F# (`4:7` twice); the reader thinks a G (`4:5`) was meant. Not mine to change.
