# Leg cues8: Triads' cues (one thing to try)

Branch `coach-cues8`, worktree `/home/dgx-delgado/yames-coach-cues8`, logs `/tmp/coach-cues8/`.
Cues: `src/paths/specs/triads-cues.ts`, attached with `withCues` in `triads.ts`.

## State

- [x] Step 1: read; 72 Exercises (65 graded and 3 self-checked in 20 Steps, 4 warm-ups). Dump
  `/tmp/coach-cues8/triads-dump.txt`, compact (no variant tables) `/tmp/coach-cues8/compact.txt`.
  Level 1 = Steps 1-6 + one warm-up (22), Level 2 = Steps 7-13 + one warm-up (26, one self-checked),
  Level 3 = Steps 14-20 + two warm-ups (24, two self-checked). Key-varied: the seven `-keys` Exercises
  (one line moved along the same strings) and the four warm-ups (key and shape; bars jump an octave
  where the neck runs out, so the variants are not one transposition).
- [x] Level 1 (Beginner), 22 Exercises. `check` 0 errors, 0 refused, 0 rewritten (`gc4.log`).
- [x] Level 2 (Intermediate), 26 Exercises (your-line self-checked: general only). `check` 0 errors, 0
  refused, 0 rewritten (`gc6.log`). Two at 49 characters, shortened.
- [x] Level 3 (Advanced), 24 Exercises (two self-checked: general only). `check` 0 errors, 0 refused,
  0 rewritten (`gc8.log`). One refusal: "Lay finger one flat for C and for D." (`cue.specific`, "a
  sentence about the other variants": "for D" read as a string) -> "Barre with finger one for the C
  and D chords." All 72: 617 cues.
- [x] Proof-read (below): three sonnet readers, one per Level, 31 objections, 31 taken (some by a
  wider fix than the one suggested). `check` after the fixes: 0 errors, 0 refused, 0 rewritten
  (`gc9.log`).
- [ ] Translations
- [ ] Gates

## The proof-read (three separate sonnet readers: cues, tabs, purposes, how-tos, per-bar triggers, the guide's rules)

Objections in `/tmp/coach-cues8/proof-triads/objections-{a,b,c}.md`: 12 + 11 + 8. Taken (was -> now):

- **The loop cues** (`lastBars` "From fret ten, drop to fret five as it loops." and its kin on every
  up-and-back Exercise): the slip is inside the last bar, the cue spoke of the move after it. Readers
  objected on five; fixed on all fourteen: the last bar of an up-and-back Exercise is the arrival from
  the top shape, so "Come back to the middle shape right on '1'." (shape two in all-three); first-two
  and second-and-third, whose last bar repeats the new shape, "Keep shape two / three down to the last
  note."
- **`notes` true of one shape of three** ("Barre fret ten with finger one for D minor.", "Finger one
  across the D and G strings at five.", "Second finger on the G string, fret fourteen.", and so on: 12
  objected; fixed on all seventeen one-chord-in-three-places Exercises): the chord's letters, "Say D,
  F, A as you fret each shape." (C, E, G · A, C, E · E, G, B · F, A, C · G, B, D · B, D, F).
- **`shift` tied to one move where `shift` fires on most bars** (shape-three-moves, stay-put,
  stay-put-high, five-before-four, twelve-bars, whose "second C" is where `shift` cannot fire;
  c-and-a-minor): -> "Start each change on the last eighth." (shape-three-moves: "Keep the fingers in
  shape as the hand slides.", true of every move there).
- "Keep the hand still until chord five." (four-chords-keys, four-chords-middle-keys, the low-set keys
  Exercise: the hand moves in bar 2) -> "Start each change on the last eighth."; on four-chords.low (no
  numbers in that Exercise) -> "Keep the hand around fret five until G."
- four-chords.mid general "Keep finger one on the top string at fret eight." (G is at seven) -> "Keep
  the top string at fret eight until G."; stay-put notes the same fault -> "Put fingers three and four
  at fret ten for F."
- "For G, lay finger one across fret three." (finger one covers two strings) -> "For G, barre the top
  two strings at fret three."
- three-minors / three-minors-middle lastBars "go straight back to A minor" (the last bar already is A
  minor) -> "From E minor, land A minor right on '1'."
- pick-three notes "Find the high one at fret thirteen." (clashes with the numbers) -> "Play the high C
  at fret thirteen."
- inside-open-c openString named the open G (bar 2 starts on the open top string) -> "Put each open
  string right on its click."
- add-a-seventh notes "Finger one across the G and B strings at five." (bar 4 is F) -> "Keep the G
  string at fret five all four bars."
- a-song.eight-bars notes "For A minor, put finger three at fret ten." (the first A minor is a barre at
  five) -> "For the high A minor, put finger three at ten."

Answered, not changed: the readers' suggested "Say A, C, E as you fret each note" became "each shape"
(the order is per shape). Not objected to but left as is: first-two / second-and-third `notes` name
the new shape (two shapes in the Exercise, and the new one is its point); eight-bars `shift` "From G to
F, move finger one to fret eight." (the one move where nothing stays, howTo 4).

## Refusals and rewordings

Level 1: "Play four at fret six: B flat, not B." (`cue.specific`: B is a note the Exercise does not
play) -> "Play four at fret six: B flat."; one at 49 characters. The beginner warm-up's variants refused
"shape" ("not a uniform transposition"), "next shape" and "crosses strings" ("the strings moved
differently"), "back" and "down" (a direction), "fret every note" (a layout of frets): the warm-up's
cues now name only chords, notes, the count and the pick ("Sound all three notes of every chord.",
"Have the new chord ready before '1'.", "Keep the pick close to the strings.").
