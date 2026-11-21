# Leg vr1: the variant rewriter said false note names

Branch `coach-vr1` (from `coach` 705803b6). Brief: `plans/tasks/coach/vr1-variant-rewriter.md`.

## The defect and the fix

`variantText.ts` renamed a note by where it sat (`move.pcs`), as if every variant were a transposition.
Reproduced from the real Exercises cues4 named (`variantText.test.ts`, "a note or key name is rewritten
only where the variant is that transposition"): on g-major-strings / f-major-strings (same key, B or top
string) "Play F sharp, the one sharp in G major." came out "Play A, ..."; "Say G major's names." came out
"Say B major's names."; on each-box / e-minor-each-box (another box) "Find each A before you start."
came out "Find each C / D / E / G". All failed first, then passed.

The rule now (`rewriteSentence`, `mapNote`):
- A note whose pitch class changes is said again only where every note of the variant moved one interval
  (`move.pcShift` uniform). True transpositions still rewrite note, key and fret (test "a true
  transposition still rewrites ...").
- Exception, a note *put at a place*, which names the note the variant plays there: "D at fret 3" /
  "C at 8"; a list put on a string ("E, F, G on the B string"); three or more names in the order played
  ("C, B, A, B: pick, pull, ..."). A later sentence of the same text (one how-to line, a purpose, a cue)
  may name that note again; not carried from one how-to line to the next.
- Never under the exception: a sentence with "key", "tonic" or "home" ("The key note, G, is ...").
- A note renamed beside a key, scale or chart name that stayed (same key, figure moved) is refused:
  "Play B, the third of G major" would read "Play D, the third of G major".
- "G major's" is the key (the possessive was one token, so "G" was read as a note).
Otherwise the sentence is refused for that variant, as other unsayable sentences are.

Why the exception: without it the fix dropped 38 true sentences (Rhythm Foundations' bar-by-bar lines,
Legato's "D, E, F on the A string", Tapping's "the E at fret 5"). None of the false cases has that form.

## The checker

`npm run paths -- check` prints per pack (`src/paths/rewrites.ts`, `pipeline.variantRewrites`):
`info variant.rewritten` (from / to, cues, purposes, how-to lines), `info cue.refused` (cue, reason),
and `ERROR variant.rewrite` for a variant cue the rewriter does not say, or a variant purpose / how-to
line shaped like an Exercise line that the rewriter does not write. A line its build wrote by hand is
recognised by building the Path with `variantText` off, and left alone. Tests: `rewrites.test.ts`
(an injected old-rewriter how-to line and Know the Neck's false cue are both errors). CUES_GUIDE updated:
`refusals-entry.ts` is no longer needed.

## The audit (all sixteen packs, generated variant texts before the fix vs after)

Script: `/tmp/coach-vr1/audit-entry.ts` (base packs read with `git show 705803b6:...`, after built from
the specs); result `/tmp/coach-vr1/audit.txt`. Before the fix, variant sentences that differ from the
Exercise's (rewritten or hand-written): how-to/purpose 800 (alternate-picking 17, sweep 34, blues 20,
classic-rock 59, shred 139, legato 202, rhythm-foundations 40, metal-rhythm 22, know-the-neck 57,
scales-and-modes 80, tapping 57, funk 9, triads 28, chords-in-a-key 24, arpeggios 12, first-chords 0);
cues 0 in every pack (no shipped variant cue says anything in other words than its Exercise's).

**False before the fix: 0 how-to lines, 0 cues, in every Path.** The only false sentences were Know the
Neck's cues, which cues4 reworded before its merge. How I know: the before/after diff changes exactly
two sentences, both true (below); and every variant sentence with a note name on a variant whose notes
did not move one interval (112, `/tmp/coach-vr1/placed.txt`, script `placed-entry.ts`) was read by hand:
all true (most are hand-written key texts of Know the Neck; the rewriter's are Legato, Rhythm
Foundations and Tapping lists and placed notes).

What the fix changed in the packs:
- Rhythm Foundations, `other-strings.stops-higher-up#stringSet=B-and-top-E` lost its third how-to line,
  "Both rests come straight after the D, a fretted note. ..." (true; the D was put at fret 3 in another
  line). The English now reads "Both rests come straight after a fretted note." (true for every
  variant), regenerated, translated in fourteen languages (three sonnet helpers, edited from each
  locale's old line).
- Shred, `tapping-etude.tap-triplets#stringSet=G:-14-5-9` now gets the purpose's first sentence and the
  first how-to line ("A minor's" read as the key), the same English its B-string variant already had;
  translations copied from that variant.
No variant lost its general cue; no cue changed; nothing over 48 characters.

## Gates

`paths check` all sixteen ok, 0 errors (`/tmp/coach-vr1/check.log`); tsc ok; vitest 26304 passed, only
the known `TabStage.render.test.tsx` load failure (`vitest.log`); build ok; layout
`coach-session.spec.ts` + `short-window.spec.ts` 112 passed (`layout.log`). No Rust, no pack format
change, nothing in how the app shows a how-to or a cue. The full layout suite is the orchestrator's.

## For the next leg

Hole left on purpose: a positional name in a uniform same-key move with no key word ("Find each A" when a
box moved rigidly) would still be renamed; no shipped sentence has that form. Read `info variant.rewritten`
in `check` after any content change.
