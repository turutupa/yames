# Writing cues: one thing to try (for the content legs)

A cue is the Path author's order for the next Take: the ready note's headline, the one line on screen
during the Take, and "Next time: …" under the finding on the result, always with "From the Path · Step N".
The app picks it from what the last Take measured (`src/coach/cues.ts` `cueFor`); the author only writes
it. Worked example: `src/paths/specs/alternate-picking-cues.ts` (436 cues, 59 Exercises). One file per Path, `src/paths/specs/<path>-cues.ts`, a `CueBook` keyed by the pack id
(`<step>.<exercise>`, `warmup-<level>.<exercise>`), attached in the spec with
`export default withCues(definePath({...}), BOOK)`. `c(when, say, more?)`; `g(say, more?)` is the general
cue; `more` is the how-to line "What should I try?" opens on. Shared sentences as constants: translated once.

## The triggers, and when each fires (first match wins, in this order)

| Trigger | Fires when |
|---|---|
| `heard` / `extras` / `notes` | that check decided a Take below the pass mark (notes missed / extra notes / wrong pitches) |
| `afterHeld` | the bar that slipped has a note right after a held one (a beat or longer, twice the usual note) |
| `openString` | the slipped bar has open-string notes (first if the late notes were mostly the open one) |
| `shift` / `stringChange` | the slipped bar has a change of hand position / of string |
| `lastBars` | the slip is in the tune's last bar, or a long (stamina) Take came apart from a round on |
| `late` / `early` | the slipped bars leaned that way against the rest of the Take |
| `even` | evenness decided it and nothing above has a cue |
| general (`g`) | nothing measured: before the first Take, ungraded, not caught, or after a pass that moves on |

Write one general cue per Exercise (every Take then has an order) and one cue per trigger the Exercise
can produce; a second cue for a trigger is said the second time at the same spot. `cue.trigger` refuses a
trigger no Take of the Exercise can produce (no open string, no `openString` cue).

## The rules

- An order, imperative, one idea, about the hands or the count. At most 48 characters, in every language.
- Never a reason for a slip ("because…"). Never pick direction, muting, posture, tension, fingering, tone
  or feel as something the app heard; as plain teaching it is allowed, sparingly.
- Never "the bar" (not even "the bar line": write "as each bar starts"); never the pass mark, a grade, a
  percentage; nothing about tuning, the microphone or grading; no praise, no "!", no question.
- True of the tab: a fret, string, note or finger it names must be in the Exercise. Where the Exercise
  changes key, string or position between Takes, name none (`cue.specific` refuses a cue a variant cannot
  say). No cue for a trigger only some variants have.
- Spell numbers out of known contexts ("two beats"); a stray digit is refused. Counts go in quotes.
- If a cue disappears from a variant, `cueTexts` (`variantText.ts`) says why; reword it to name less.

## Ten good

| Cue | Why it works |
|---|---|
| Count the long note's two beats, then go. | `afterHeld`: the count, at the place |
| Put the open D right on the click. | `late`, on an open-D tune: where, and what to do |
| Wait for the click before the open D. | `early`: the same place, the other way |
| Keep the pick on the B string only. | `extras`: one action, no cause claimed |
| Say E, F, G as you fret them. | `notes`: names the tune's own notes |
| Move to the next string during the long note. | general on a string-per-bar line: the Exercise's point |
| Shift during each bar's last note. | `shift`: when to move, from the how-to |
| Count '1 e and a' right to the end. | `lastBars`: counting, quoted syllables |
| Make the hop smaller, not faster. | `stringChange` on inside crossings |
| Start well under your clean tempo. | warm-up general: true of every variant |

## Ten bad

| Cue | Why not |
|---|---|
| The open Bs are where the time tends to move. | a description, not an order |
| Your pick is late on the B. | claims the app heard the pick (and starts "Your") |
| Relax your wrist, it is tense. | tension as a judgement, and a reason |
| Get 85% even this time. | names a grade |
| Clear the bar on every round. | "the bar" for the pass mark |
| Check your tuning, then play. | tuning |
| Great, now do it faster! | praise, exclamation |
| Slow down here? | a question |
| Put fret 7 on the click. (on a moving-key Exercise) | names a fret other variants do not have |
| Count every eighth out loud and keep the hand loose too. | two ideas, 56 characters |

## Check, translate, proof-read

1. `npm run paths -- gen <path> && npm run paths -- strings <path> && npm run paths -- check <path>`:
   every `cue.*` rule, and every overlay's cue at most 48 characters, counted in characters (an error).
2. Proof-read before translating: a fresh reader (`model: "sonnet"`) that did not write them gets only
   the cues, each Exercise's tab and purpose, the triggers and these rules, reads as a guitar teacher and
   objects; fix or answer every objection, both lists in the leg's progress file (c4c's is the example).
3. Translate: `strings todo <lng> --out f`, keep only the `.cue.` keys, helpers per four or five locales
   with `plans/paths/I18N_BRIEF.md` and `plans/COACH_I18N_BRIEF.md` and the 48-character cap; then
   `strings merge <lng> f` and `check` again. `src/coach/noteStrings.test.ts` lints every English cue.
