# Leg cues11: Arpeggios over Changes' cues (one thing to try)

Branch `coach-cues11`, worktree `/home/dgx-delgado/yames-coach-cues11`, logs `/tmp/coach-cues11/`.
Cues: `src/paths/specs/arpeggios-over-changes-cues.ts`, attached with `withCues` in `arpeggios-over-changes.ts`.

## State

- [x] Step 1: read; 57 Exercises (54 in 16 Steps: 49 graded, 5 self-checked with the general cue only; 3
  warm-ups, key- and shape-varied). Five Step Exercises are key-varied (`two-five-one-keys`,
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
- [x] Level 3 (Advanced: joined-sevenths, minor-two-five-one, first-sweeps, more-sweeps, sweeps-in-a-song,
  warm-up), 19 Exercises. Refusals: `cue.refused` on the advanced warm-up's third-lowest variants for "Move
  the shape as the last pull ends." (a shape, not a uniform transposition) and "Stop on the top note and hold
  it a beat." (a direction) -> "Move on as the last pull ends." / "Hold the last note for its full beat."
  (`gc6.log`: 0 errors, 0 refused, 0 rewritten).
- [x] Proof-read (below): three sonnet readers, one per Level, 24 objections, all taken (`gc8.log`: 0 errors,
  0 refused, 0 rewritten). One more refusal while rewording: "Look ahead to the next chord's first note." on
  the intermediate warm-up's coming-down variants ("next" reads as the next string) -> "Have the new chord in
  mind before '1'."
- [x] Translations: four sonnet helpers (de fr es it · nl pl pt-BR ru · tr vi ja · ko zh-CN zh-TW), 161
  sentences each (`/tmp/coach-cues11/i18n-arpeggios-over-changes/`). The session's subagent limit (20 at once,
  shared with the other legs) refused three of the four at first; they were started when slots freed. Every
  file checked again by me with `check_i18n.py` (problems 0 in all fourteen; ru had three over 48 on my first
  look, its helper fixed them before handing back). Merged (`merge{1,2,3}.log`): every overlay 1028 of 1028;
  `check` 0 errors (`gc9.log`).
- [ ] Gates

## How the cues are built

Every graded Exercise is a chord's notes one a string, one chord a bar, with a band or a click; the first
two Levels in eighths or quarters, the last Steps swept in triplets. The specific cues are the general (the
Exercise's point: the root's fret for each chord, the nearest note, the seventh falling to the next third,
the held root as the time to move), `notes` (the frets of the roots, the chord tone most likely to be wrong,
by finger and fret), `shift` and `lastBars` (the change back to the first chord on '1'). The stock orders
are the measured things: `heard` "Press each note fully before you pick it.", `extras` "Pick one string for
each note, no more.", `late` / `early` keyed on the change ("Land each new chord's root right on '1'." /
"Wait for '1' before the new chord's root.", or the first note where a line starts off the root), the
crossing cue, and their sweep twins ("Push the pick through all three strings.", "Start each sweep right on
the beat.", "Keep the push one slow, even motion."). Key-varied Exercises and warm-ups name only chord
numbers ("Let five's seventh fall to one's third.", "From five, go straight back to one on '1'.") and stock
orders.

## The numbers

465 cues on 57 Exercises (all covered: 49 graded and 5 self-checked in 16 Steps, the 5 with the general cue
only; 3 warm-ups), 161 distinct sentences. By trigger: general 57, heard 52, late 52, early 52, lastBars 52,
stringChange 50, extras 49, notes 40, shift 40, afterHeld 21. No `openString` (no open strings in the Path).
Final English `check`: 0 errors, 0 `cue.refused`, 0 `variant.rewritten` lines (none of this Path's how-to or
purpose sentences is rewritten for a variant either, so there were none to read).

## The proof-read (three separate sonnet readers, one per Level: cues, tabs, purposes, how-tos, the guide's rules)

24 objections (`/tmp/coach-cues11/proof-arpeggios-over-changes/objections-{a,b,c}.md`), all taken (was -> now):
nearest-note shared-note and joined shift "Reach down to fret five right after '1'." (true of bar 2 only; bar
1's shift is the jump up to ten) -> "Move the hand before the note that needs it." · four `notes` cues with
no verb ("Roots at frets ten, seven, twelve, five.", the G one, "Low roots at ...") -> "Start at frets ..." /
"Start low at frets ..." (also the two Level 1 twins) · the two-five-one lines' `lastBars` "Hold the last root
for all four beats." (six Exercises; repeated `afterHeld`, and a one-note last bar can only slip at its onset)
-> "Land the long last note right on '1'." · two-five-one-keys `notes` "Say two, five, one ..." (the general's
idea, nothing about pitches) -> "Know each chord's four notes before you start." · G major seven / E minor
seven shift "Cut each chord's last note short and move." (contradicted its how-to) -> "Move right after each
chord's last eighth." · one-four-five-across and minor-across `lastBars` "Hold the last root for its full two
beats." (repeated `afterHeld`) -> "Keep the last way down as even as the way up." · a-minor-seven-two `notes`
named one of the two sevenths -> "Play the seventh on the D and B strings."; g-seven-two "Finger one back to
fret one for the seventh." (the first seventh is finger two on the D string) -> "... for the high seventh." ·
two-five-one-across shift "Move the hand up as C major seven starts." (the loop's move is down) -> "Move the
hand as each chord's first note comes." · the quarter-note shift "Move as each chord's last note ends." (in
quarters that is '1' itself: makes the change late; three Exercises) -> "Look ahead to the next chord's first
note." (the warm-up: "Have the new chord in mind before '1'.") · minor-line `notes` "Keep the shared note as A
minor seven starts." (reads as sustain; it is picked again) -> "Pick the shared note again on '1'."; its shift
"Drop the hand to fret three for E seven." (wrong way for bar 3) -> "Move the hand before the note that needs
it." · low-four-sweep and slow-sweeps `lastBars` repeated `afterHeld` -> "Sweep F's three beats evenly, then
stop." / "Sweep the last chord evenly, then stop." · song-sweeps-keys "From four, ..." (read as bar four) ->
"From the last chord, go back to one on '1'."

Answered, not changed: none. (Reader a left "Use each bar's last note to see the next root." alone itself,
reading "see" as the how-to's "look at".)

## For the generator's owner (not changed, not mine)

`cue.specific` refuses "Root on fret ten for C, fret seven for A minor." and "Seventh at fret seven for C,
three for A minor." on one-version Exercises whose tab has exactly those frets; "Start C at fret ten, A minor
at fret seven." passes. It looks like "for <chord>" after a fret, or a bare second number, is read as a
claim the checker cannot place. And "next" in "Look ahead to the next chord's first note." is read as "which
string is next" on a shape-order variant. Both worked round in the wording.
