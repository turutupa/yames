# Leg vr1: the variant rewriter says false note names (a defect in shipped code)

Worktree `/home/dgx-delgado/yames-coach-vr1`, branch `coach-vr1`. Logs under `/tmp/coach-vr1/`.

Found by leg cues4 (`plans/coach/progress/cues4.md`, "Open points"). Read that first, then
`plans/coach/progress/c4c.md` (the row on `paths/variantText.ts`: `cueTexts`, `rewriteSentence`, the
how-to's rules) and `plans/coach/CUES_GUIDE.md`.

## The defect

An Exercise can have variants (other keys, other strings, other boxes). `variantText.ts` says each
how-to line and each cue again for a variant: a sentence that names nothing is the same everywhere; one
that names a note, a fret or a string is rewritten when the variant is a plain transposition, and
refused where the notes do not line up. **It does not refuse a note or key name when the variant moves
the same line to another string in the same key, or to another box**: it rewrites the name as if the
variant were a transposition, and the sentence comes out false. Example from Know the Neck: "Play F
sharp, the one sharp in G major." was shown, on a variant, as "Play A, the one sharp in G major."

The coach states only measured or authored facts. A wrong note name under "From the Path" is the worst
kind of error this build can ship, and it is on screen today: every Exercise's **how-to** lines go
through the same rewriter, and so do the **cues** of the Paths merged before cues4 (Alternate Picking,
Rhythm Foundations, First Chords, Blues Pentatonics, Chords in a Key), which were checked for dropped
cues but not for false rewrites.

## What to do

1. **Reproduce it as a failing test** in `variantText.test.ts`, from the real Exercise cues4 names (its
   progress file has the ids), before changing anything.
2. **Fix the rewriter**: a named note, key or fret is rewritten only when the variant really is that
   transposition for the note the sentence names (check the note the name refers to in the source tab
   against the note at the same place in the variant); otherwise the sentence is refused for that
   variant (dropped, as other unsayable sentences are), never rewritten into something else. The
   existing tests stay green; add the cases (same key on another string; another box; a true
   transposition still rewritten).
3. **Make the checker see it**: a rewrite that changes a sentence is listed by `npm run paths -- check`
   as information, and a rewrite the new rule would have refused is an error. `plans/coach/tools/cues/
   refusals-entry.ts` prints "rewritten" lines: fold what it does into `check` so content legs need no
   side script.
4. **Audit what is shipped**, with the fixed rewriter: for all sixteen packs, list every how-to line
   and every cue whose text changes between the Exercise and any variant (the generator's output
   before and after your fix: a script under your log folder that diffs the two packs' variant texts).
   Every sentence that was false before the fix is in your progress file, by Path and Exercise. Where
   the fix now drops a how-to line or a cue from a variant and that leaves the variant without its
   general cue or without a needed how-to line, reword the English to name less (the authoring rule:
   where variants differ, name nothing), regenerate, and translate the reworded sentences (sonnet
   helpers, `plans/paths/I18N_BRIEF.md`, `plans/COACH_I18N_BRIEF.md`, the 48-character cap for cues).
5. Gates: `npm run paths -- check` (every pack), `npm run test:paths:rust` if the pack format or a
   Rust reader is touched (neither should be), tsc, vitest, build; layout by name:
   `coach-session.spec.ts`, `short-window.spec.ts` (the how-to and the cue are on the Session's
   screens). The full layout suite is the orchestrator's on a weekday before 8 PM Pacific.

## Size

The rewriter fix and the checker are one sitting; the audit across sixteen packs may be large. Commit
the fix with its tests first. If the audit's rewording passes about 200k tokens, stop at a commit with
the list of what is left, by Path: a second agent finishes the rewording.

## Report

The failing case and the fix in one paragraph; the count of sentences that were false before the fix,
by Path, how-to lines and cues separately; what was reworded; the gates; what is left.
