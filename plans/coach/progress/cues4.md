# Leg cues4: Know the Neck's cues (one thing to try)

Branch `coach-cues4`, worktree `/home/dgx-delgado/yames-coach-cues4`, logs `/tmp/coach-cues4/`.
Cues: `src/paths/specs/know-the-neck-cues.ts`, attached with `withCues` in `know-the-neck.ts`.

## State

- [x] Step 1: read; 57 Exercises (54 in 15 Steps, 3 warm-ups): 52 graded, 2 self-checked (general cue only), 3
  key- or string-varied warm-ups. Dump `/tmp/coach-cues4/know-the-neck-dump.txt` (with the triggers every variant
  of a varied Exercise can produce).
- [x] Level 1 (Beginner: low-strings, octaves, chord-roots, upper-strings, in-between, warm-up walk-a-string),
  21 Exercises (`f398c93f`).
- [x] Level 2 (Intermediate: top-strings-keys, thirds, roots, roots-other-keys, triads, warm-up thirds-around),
  18 Exercises (`83ce0cfe`).
- [x] Level 3 (Advanced: five-boxes, boxes-second-key, arpeggios, the-changes, changes-in-g, warm-up
  two-boxes-up), 18 Exercises (`dca29513`).
- [x] Proof-read (below): three sonnet readers, one per Level, 36 objections, 31 taken, 5 answered (`fbafd7a2`).
- [x] Translations (`2384c30b`): four sonnet helpers (de fr es it · nl pl pt-BR ru · tr vi ja · ko zh-CN zh-TW),
  212 sentences each, each file checked again by me with `check_i18n.py` (problems 0 in all fourteen). One fix
  after: es "Rasga C" (a strum) for "Roll C once" -> "Arpegia C". Merged: every overlay 1212 of 1212, 0 errors
  (`/tmp/coach-cues4/merge.log`).
- [x] Gates (below).

## Gates

- `npm run paths -- check` (every pack): 16 Paths ok, 0 errors (`/tmp/coach-cues4/check-all.log`).
- `npx tsc --noEmit`: clean (`/tmp/coach-cues4/tsc.log`).
- `npm run test`: 405 of 406 files, 26,186 of 26,186 tests passed (`/tmp/coach-cues4/vitest.log`); the one file is
  the known worktree-only `TabStage.render.test.tsx`.
- `npm run build`: ok (`/tmp/coach-cues4/build.log`).
- No Rust file changed; no layout run (the orchestrator's).

## Longest cue per language, and what wants a native read

en 48 · de 48 · es 48 · fr 48 · it 48 · nl 48 · pl 48 · pt-BR 48 · ru 48 · tr 48 · vi 45 · ko 32 · ja 30 · zh-CN 23 ·
zh-TW 23. Read first: "Roll C once" (near-triads lastBars) in every language (pl "Przeciągnij", ru "Разыграйте"
are loose); the "key note" word where the overlay had none (vi "chủ âm", tr "ana nota", ru "главная нота", nl
"grondtoon", the same word as root); zh-TW mixes 指型 and 形狀 for shape as its overlay does; zh writes 降 E / 升 F
in two cues where its overlay prose writes Eb / F#; fr says "position" for box; de, fr and it drop a final period
in a few cues to fit.

## Refusals and rewordings

`check` refused three (`cue.specific`): "Skip the A string / D string between the two notes." (octave-e-d,
octave-a-g: the skipped string is not played) -> "Skip the string between the two notes."; "Say G, C, D, G as each
bar starts." (g-tune: no C is played) -> "Say each chord's name on its first beat."; "Move up two frets for E, then
back for A." (two key letters: "a sentence about the other variants") -> "... for the third chord.", later
reworded again by the proof-read.

`refusals-entry.ts` (what `cueTexts` drops silently) listed 88 on the first Level, all on the ten Exercises
whose notes move between Takes. What it refuses there, and what this Path cannot say on them: an unnumbered
"fret" ("Press right behind each fret"), "shape", "box", "reach", "octave", "root", "next" and "cross" (which
string is next), "the string between", "down" / "up" where the contour changes, "open", "hand" with "move", and on
roots-walk (whose second progression has a different number of notes) anything specific at all. So the varied
Exercises use a second set of stock orders that name nothing: "Press each note firmly so it rings.", "Say each
note's name before you play it.", "Find each note's place before its click.", "Keep the pick close to the
strings.", "Look ahead while each note rings.", "Put the unfretted notes right on the click.". Final: 0 drops.

**A generator point for the owner (not changed, not mine):** on Exercises whose variants move the same line to
another string in the same key (g-major-strings, f-major-strings) or to another box (each-box,
e-minor-each-box), `cueTexts` does not refuse a note or key name: it rewrites it as if the move were a
transposition, and the result is false. "Play F sharp, the one sharp in G major." became "Play A, the one sharp
in G major." on the B string; "Say G major's names" became "Say B major's names"; "Find each A before you start."
became "Find each C / D / E / G" on boxes 2 to 5. `refusals-entry.ts` prints these as "rewritten", not as
refusals, so a leg must read its rewritten lines too. I reworded all of them to name no note or key ("Name the
key's one sharp every time it comes.", "Find every key note before you start."). The how-to lines of those
Exercises go through the same rewriter and may have the same fault.

## The numbers

519 cues on 57 Exercises, 212 distinct sentences, 0 refusals, 0 `cueTexts` drops. By trigger: general 57, heard
55, late 55, early 55, lastBars 55, notes 52, extras 52, stringChange 44, shift 39, afterHeld 36, openString 19.
The two "your turn" Exercises have the general cue only; the warm-ups have no `notes` or `extras` check.

## The proof-read (three separate sonnet readers: cues, tabs, purposes, how-tos, the guide's rules only)

Objections in `/tmp/coach-cues4/proof-know-the-neck/objections-{a,b,c}.md`. Taken (was -> now):
two-places notes "Play the A string five frets below the low E." -> "Find it five frets lower on the A string.";
shift "Shift on the way back to the low E string." -> "Find the low E fret before the hand moves." ·
roots-wide-shape notes "Reach the octave with the little finger." (the open D's octave takes finger three) ->
"Reach three frets up, two strings over." · b-string-naturals shift named fret seven, which the B string walk does
not play -> "Find frets five and twelve by the dots." · between-a-string notes "three in a row" (bars 1 and 4 are
not) -> "Keep one finger per fret as the hand moves." · every-fret lastBars named flats in a bar holding only the
open string -> "Land on the open string and let it ring." · g-major-strings / f-major-strings notes repeated the
late cue and said nothing of finding the note -> "Find the sharp just under the key note." / "Find the flat just
under its natural note." · fifth-position-keys notes "Picture each place" (vague) -> "Find each place from the
one before it." · thirds-g-b, thirds-top and the thirds warm-up shift ("Let finger two guide", "Move finger one
up": vague, or false where the pairs go down) -> "Move the hand with each new pair, not after." ·
roots-and-fifths shift true of one move only -> "Move the shape to the next root before '1'." · c-three-places
and am-three-places shift duplicated late -> "Move the whole shape in one go, on the beat." · near-triads shift
duplicated the general and was false (the shape does move) -> "Move only the fingers the new chord needs." ·
each-box / e-minor-each-box notes said nothing of finding a note -> "Find the key note first, then count from
it." · ladder notes "Say which box you are in" -> "Say each note's name, then find its fret."; shift "Put finger
one where the higher finger just was." (false coming down) -> "Move the whole hand to the next box's frets." ·
e-minor-ladder shift "Keep the hand still for boxes one and two." (fired on the moves) -> "Move the hand as one to
each new box." · e-minor-three-octaves stringChange true of one crossing -> the stock "Keep the pick close as you
cross strings." · am-up notes repeated its shift cue -> "Find each A first: frets five, seven and ten." · c-up
general and notes said "hold the chord" (false at frets 3 and 8 of the top string, and a duplicate) -> "Pick each
string of the open C chord in turn." / "Say which of C, E and G each string is."; shift "Slide" (it is a new
finger, not a slide) -> "Play fret eight with the little finger." · changes-in-position notes "Move only the notes
that change" (false from C to G) -> "Find each chord's notes from the one before it." · thirds-of-the-chords notes
"Sit a fret low" -> "Find each third from its chord's root." · g-three-lines notes (finger one at fret two is
bar 8 only) -> "Name the note's job, then find it by fret." · g-arpeggios lastBars duplicated shift -> "Go back to
the G shape on '1'." · two-boxes-up shift duplicated afterHeld -> "Move up as the held note ends."

Answered, not changed:
- *octave-d-b, between-by-octave notes and g-major-strings shift name a finger on a varied Exercise*: every
  variant uses the same fingers, and `cueTexts` says each variant can say them (0 drops). The brief told the
  readers "no finger"; that was stricter than the rule.
- *every-a notes "Use the octave shape or the same-note pair."* and *roots-walk notes "Find each note by the
  octave shape."*: "shape", "octave" and "or" are refused on those Exercises' variants; the cues stay general.

## Twelve cues to read

- **"The low E string, by name"** (Level 1). E to E by the natural notes, frets 0 to 12 and back. general "Name
  each note aloud: E, F, G, A, B, C, D." · notes "Find F at fret one and C at fret eight." · openString "Put the
  open E right on the click."
- **"Octaves from the low E string"** (Level 1). G, A, B, C on the low E string, each answered on the D string.
  general "See the octave shape: two strings, two frets." · notes "Put finger three two frets up on the D
  string." · extras "Skip the string between the two notes."
- **"One, six, four, five in D"** (Level 2). D, B minor, G, A roots in eighths over a band. general "Say each
  chord's name on its first beat." · notes "Move finger one to fret two for B minor." · lastBars "Go back to the A
  string on '1' for D."
- **"C major, low to high"** (Level 3). C, E, G through the open C chord and up the top string to fret 8. general
  "Pick each string of the open C chord in turn." · notes "Say which of C, E and G each string is." · shift "Play
  fret eight with the little finger."

## Legato

Not started: the brief allows the second Path only under about 110k tokens of context after the first is gated,
and this leg is past that.
