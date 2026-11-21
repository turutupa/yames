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
- [x] Proof-read (below): three sonnet readers, one per Level, 20 objections, 19 taken, 1 answered. 600 cues, 159
  distinct sentences, 0 refusals, check 0 errors (`gc9.log`). Two more refusals while rewording: "Walk the root
  down the G string to D minor." (`cue.specific`: "to D" reads as the D string) -> "..., three chords."
- [x] Translations: four sonnet helpers (de fr es it · nl pl pt-BR ru · tr vi ja · ko zh-CN zh-TW), 159 sentences
  each, each file checked again by me with `/tmp/coach-cues3/check_i18n.py` (problems 0 in all fourteen; the `it`
  file's first draft had twelve over 48, its helper fixed them before handing back). Merged (`/tmp/coach-cues3/merge.log`: every
  overlay 1311 of 1311, 0 errors; all 1928 warnings are "different numbers" where a translation writes "fret
  five" as 5).
- [x] Gates (below)

## Gates

- `npm run paths -- check` (every pack): 16 Paths ok, 0 errors (`/tmp/coach-cues3/check-all.log`).
- `npx tsc --noEmit`: clean (`/tmp/coach-cues3/tsc.log`).
- `npm run test`: 401 of 402 files, 23,538 of 23,538 tests passed (`/tmp/coach-cues3/vitest.log`); the one file
  is the known worktree-only `TabStage.render.test.tsx`.
- `npm run build`: ok (`/tmp/coach-cues3/build.log`).
- No Rust file changed (no `test:paths:rust`); no layout run (the orchestrator's).

## The numbers

600 cues on 73 Exercises (69 in 20 Steps, 4 warm-ups; the 6 self-checked with the general cue only), 159 distinct
sentences, 0 refusals, 0 `cueTexts` drops. By trigger: general 73, heard 67, late 67, early 67, stringChange 67,
lastBars 67, shift 66, notes 63, extras 63. No `afterHeld` or `openString`: every graded bar is eight fretted
eighths. Longest cue per language (characters): en 48 · de 48 · es 48 · it 48 · nl 48 · pl 48 · pt-BR 48 · ru 48 ·
tr 48 · fr 47 · vi 46 · ko 34 · ja 33 · zh-CN 24 · zh-TW 24.

Want a native read: pl, pt-BR and ru write some seventh chords short ("G7", "Cmaj7", "Dm7") to fit, where their
overlays spell them out; ru says "мажорная септима" in places beside the overlay's "мажорный септаккорд"; vi keeps
"verse" and "bridge" in English as its overlay does for verse; de writes fingers as Zeigefinger / Mittelfinger /
Ringfinger / kleiner Finger (the English numbers them). fr and it shortened a few cues to fit.

## For the next chord Path

- A distance is refused even on a one-version Exercise ("Drop three frets for C": `cue.specific`): name the
  target fret instead ("Move finger one down to fret three for C.").
- "to D", "for E", "the last A" read as strings: write "chord five", "the last A chord", "for D minor".
- Chord numbers as words ("one, six, two, five", "chord five") pass on key-varied Exercises.

## Twelve cues to read

- **"One, four, five, one in F"** (Level 1). F, B flat, C, F around fret 5. general "Say one, four, five, one as
  each chord starts." · notes "Lay finger one across fret six for B flat." · shift "Put finger two on the G
  string, fret seven."
- **"C and A minor, F and D minor"** (Level 1). Each major chord, then its minor partner: one note moves. general
  "Move just one note in each pair." · notes "For D minor, put the G string at fret seven." · lastBars "From D
  minor, go straight back to C on '1'."
- **"One, six, four, five in G"** (Level 2). G, E minor, C, D; the top string holds G for three bars. general
  "Keep fret three on the top string, G to C." · notes "Slide finger two up a fret from E minor to C." · shift
  "Keep the C shape and move it up for D."
- **"G seven and B half-diminished"** (Level 3). G, G7, B diminished, B half-diminished; a long move from fret 10
  to fret 2. general "Look at fret two before you leave G seven." · notes "Lay finger one flat at fret ten for G
  seven." · lastBars "From fret two, jump up to fret ten for G."

## How the cues are built

Every graded Exercise is a chord picked low, middle, high, middle in straight eighths, one chord a bar, so all
63 graded Exercises can produce the same eight triggers (no `afterHeld`, no `openString`). The file has a helper
`arp(general, notes, shift, lastBars, stringChange = CROSS)` that adds the stock `heard` / `extras` / `late` /
`early` orders; the specific cues are the general (the progression's numbers, the form, or the move the
Exercise teaches), `notes` (the shape most likely to be wrong, by finger and fret), `shift` (which finger leads
or stays) and `lastBars` (what the last bar is and where the loop goes next). Key-varied Exercises and warm-ups
name only numbers ("one, six, two, five") and stock orders.

## The proof-read (three separate sonnet readers: cues, tabs, purposes, how-tos, the guide's rules only)

Objections in `/tmp/coach-cues3/proof-chords-in-a-key/objections-{a,b,c}.md`. Taken (was -> now):
upper-four shift "Lead each move up with the root on the D string." (repeated the general) -> "Move to the next
root before '1'." · "Say the pattern: major, minor, minor, major." (all-seven, the three seven-chords-of-a-key
Exercises and the warm-up: four words for eight chords, and false for the diminished one) -> "Say major, minor
or diminished for each chord." · majors-and-minors general "...; only the fingers change." (the frets change
too) -> "Stay near fret five as the chords change." · the key-varied `notes` "Find every shape of the key before
you start." (not doable in the count-in) -> "Say each chord's number before you play it." · one-four-five-f and
one-six-four-five-f generals ("F is home now", "and stop on C": a statement, and a stop inside a looping Take)
-> the plain "Say one, four, five, one / one, six, four, five as each chord starts."; the same fix to the two
minor-key generals ("A minor is home") · one-four-five-f shift repeated its notes cue -> "Put finger two on the
G string, fret seven." · one-six-two-five-home general named F, which it does not have -> "Say one, six, two,
five ..." · low-then-high notes (fret ten is only the high D minor) -> "... for high D minor." · two-homes notes
(only the first D is at fret two) -> "For the first D, lay finger one across fret two." · two-five-one-keys
lastBars repeated the general -> "After one, go straight into two on '1'." · minor-one-four-five shift named a
fingering, not the move -> "Move finger one down to fret three for E minor." · bridge general (G's G-string
note is not its root) -> "Walk the root down the G string, three chords." · aaba and aaba-keys general (two
ideas) -> "Count four-bar sections all the way round." · flat-seven general "down to fret one" (only the top
string is there) -> "Slide the whole C shape down for B flat." · seven-sevenths lastBars "drop to fret three"
(which string) -> "Back to the A string, fret three, for C." · two-five-one-sevenths lastBars (said nothing
about the return) -> "Hold C major seven, then D minor seven on '1'."

Answered, not changed: sevenths-keys `stringChange` "Skip the A string after a low E string root." (the reader
thought a key-varied Exercise may name no string): the variants are transpositions along the same strings, and
`cueTexts` says every variant can say it (0 drops).
