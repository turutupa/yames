# Leg cues14: Shred's cues (one thing to try)

Branch `coach-cues14`, worktree `/home/dgx-delgado/yames-coach-cues14`, logs `/tmp/coach-cues14/`.
Cues: `src/paths/specs/shred-cues.ts`, attached with `withCues` in `shred.ts`.

## State

- [x] Step 1: read; 56 Exercises (53 graded in 15 Steps, 3 warm-ups), 221 variants. Dump
  `/tmp/coach-cues14/shred-dump.txt`.
- [x] Level 1 (Beginner: one-string, accents, crossing, warm-up one-string-climb), 12 Exercises.
  `check`: 0 errors, 0 `cue.refused`, no cue of mine rewritten for a variant (`gc2.log`).
- [x] Level 2 (Intermediate: chromatic, gilbert, three-per-string, sequences, speed-bursts,
  string-skipping, economy, warm-up scale-round), 27 Exercises. `check`: 0 errors, 0 refused (`gc5.log`).
- [x] Level 3 (Advanced: legato-one, legato-two, sweep-basics, five-string-sweeps, tapping-etude,
  warm-up loop-round), 17 Exercises. `check`: 0 errors, 0 refused, 0 cues said in other words (`gc8.log`).
- [x] Proof-read (below); `check` after the fixes: 0 errors, 0 refused (`gc10.log`).
- [ ] Translations. - [ ] Gates.

## The proof-read (three separate sonnet readers, one per Level)

41 objections (`/tmp/coach-cues14/proof-shred/objections-{a,b,c}.md`), 33 taken, 8 answered.
Taken (was -> now): open-a / loop-round "Keep every stroke the same size." (feel) -> "Keep the same small
stroke on every note." · chromatic-on-g lastBars (a result) -> "Count '1 e and a' through the walk down."
· walking-accent early "do not rush the accent" (two ideas) -> the beat cue · sextuplet-accent general
(two ideas) -> "Accent the first of each six." · three-against-four lastBars "meets the '1'" (ambiguous)
-> "Keep the foot on the click to the last note." · outside-pairs general (two ideas) -> "Keep the strokes
the same as the notes change."; inside-pairs general (pointed at another Exercise) -> "Down on the higher
string, up on the lower."; both heard "as firmly as" (implied loudness heard) -> "Pick both strings of
every pair." · "Know the next pair / string pair / chord" (no action; three readers) -> "Look at the next
pair a beat ahead." / "Look at the next string pair a beat ahead." / "Say the next chord's name before it
comes." · one-string-climb lastBars -> "Count '1 e and a' through the highest notes." · petrucci lastBars
"pass down" -> "Keep the last pass as even as the first." · six-note-up general (another Exercise) -> "Land
the last note right on beat four." · threes general (two ideas) -> "Count '1-trip-let' and keep it even."
· expanding general (false for its last four beats) -> "Add one beat to the burst in each bar."; extras
"Stop each burst ... on the long note" (no long note at the end) -> "Keep the pick on one string only."
· octaves heard "as firmly" -> "Pick both strings of every pair." (after "Pick both notes of every octave."
was refused: "an interval"); extras "Rest a finger on the skipped string" contradicted "Stay clear of the
skipped string" -> "Keep the stroke small: just the two strings."; notes -> "Say each octave's name as the
beat starts." · skipped-triad notes "chord tone" -> "Say the chord's three note names before you go." ·
scale-round shift (two ideas) -> "Shift right as each bar starts." · five-seven-eight general (two ideas)
-> "Pick only the first note of each beat." · pentatonic-pulls extras duplicated stringChange -> "Keep the
stroke small: just the strings in use." · hammer-ascent general false for the low E -> "Hammer each new
string's first note hard."; its stringChange duplicated it -> "Keep the pick close as you cross." ·
three-both-ways stringChange duplicated the general -> "Keep the push one smooth stroke." · tap-changes
general false for the second G -> "Move the tap on the last hammer before a change."; lastBars (an order
to stay still) -> "Count the taps right through the second G." · the-run heard "Pick every note" (bars 6
and 7 are tapped and pulled) -> "Keep every note sounding right through."; lastBars (count what) -> "Count
'1 e and a' through the run home." · the-link lastBars (a result) -> "Count the loops right through to
the end." (after "of the new chord" was refused on Am-to-Dm).

Answered, not changed:
- *"Press each finger right behind the fret." implies the app heard poor fretting*: it is an order, plain
  teaching for notes not heard, with no cause claimed; Alternate Picking says the same.
- *three-strings / stamina-minute shift "Have each new string's first note ready." is a string-change cue*:
  `shift` fires there only on the string-set variants whose hand moves at a string change, and those
  variants refuse any sentence about the hand ("Shift during ...", "Move the hand ..."); the cue says what
  the player does at that place in the words they allow.
- *three-strings notes "Have every finger ready" is vague*: the fingering differs by string (1-3-4 or
  1-2-4) and by variant, so it cannot name fingers.
- *sixes general "Lean a little on the first of each six" is feel*: an accent as plain teaching, the way
  Alternate Picking teaches sextuplets; nothing claims it was heard.
- *expanding afterHeld "Count the rest out, then start the burst."*: true where it can fire, the first note
  of the second and third bursts after the landing and its rest.
- *five-seven-eight notes "the middle note" is ambiguous*: in 5-7-8-7 the middle note is the 7, which is the
  how-to's point; "the middle finger" is refused on the semitone variants.
- *outside-lick notes names only the first note*: kept, the stock Alternate Picking line; the lick repeats
  twice a bar, so starting on the right note is the order.
- *three-against-four's original lastBars suggestion "every third"*: replaced by a count order instead.

## Refusals and rewordings

Level 1: the beginner warm-up's string/key variants refused "Move the hand up as each bar starts."
("the hand's position, and the frets moved differently") -> "Start one note higher as each bar starts."

Level 2: `cue.specific` (an error) on the intermediate warm-up: "the second position" (a position the
Exercise does not start in) -> "Keep the second run as even as the first.". Refused on variants: "Reach one
fret less below the top pair." (down-the-box, keys D and E: "a stretch or a reach") -> "Know the next
string pair before it comes."; "Shift during the string change, not after." on the string-set variants of
three-strings and the four sequences (the shift exists only on those variants, and they refuse a sentence
about the hand's position) -> "Have each new string's first note ready."; octaves "Shift during each beat's
last note." -> "Arrive at the next pair as each beat starts."; "Let the first finger rest ..." and "Keep
the same two fingers ..." (D-and-B uses other fingers) -> "Rest a finger lightly on the skipped string." and,
after "Keep the same shape on every pair." was refused too (not a uniform transposition), "Name each
octave's note before you play it."

Level 3: `cue.specific` (an error) on the advanced warm-up's `openString` cue (only some keys have an open
string): dropped. Refused on variants: "Keep the first finger down the whole trill." / "Keep the middle
finger down as you hammer." (the semitone variants use other fingers) -> "Keep the lower note fretted the
whole trill." / "Keep the middle note fretted as you hammer."; the-link "Move to the nearest note of the
new chord." (Am-to-Dm declares another chord) -> "Move as little as you can at the change."; the
advanced warm-up's G-and-B variants refused "Make the hop smaller, not faster." and then "Keep the pick
close as you cross." ("which string is next") -> "Keep every stroke the same size."
