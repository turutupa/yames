# nf1c: the last fixes for "not fair" Takes (review of nf1b: M1, M2, L1 to L5)

Branch `coach-nf1` (same worktree), merged with `coach` first (L5: c4a1, c5c1, the
`useSession` split; clean merge). Work list `/tmp/coach-orch/nf1b-review.md`. Logs in
`/tmp/coach-nf1c/`.

## Gates (after the merge of `coach`)

- `npx tsc --noEmit`: pass (`coach-nf1c-tsc-2`); `npm run build`: pass (`build.log`).
- `npm run test`: 48571 passed, 10 skipped; only the known `TabStage.render.test.tsx`
  cannot load (`vitest.log`).
- Layout `today-line`, `session`, `planner`, `short-window`: 231 passed (`layout.log`).
  Full suite owed.
- `npm run test:rust`: not run (no Rust, the shared fixture unchanged).

## The rule (the orchestrator's decision for M1 and M2)

A plan reason quotes a clean tempo ONLY when the clean tempo the app shows for the
Exercise it speaks about equals the ceiling the planner computed from
(`quotableCleanTempoOf` in `progress.ts`). Then the sentence is true and agrees with
Progress and with the tempo printed beside it. When they differ (a Take marked not fair
holds the ceiling) or nothing is shown, the reason takes a variant that names no clean
tempo. Tempo, Exercise choice, parking, rotation and minutes do not change:
`plannerQuotes.test.ts` compares the marked plan with the unmarked one field by field
(all but each reason's code and values) over 120 histories (fair Take from 30 under the
pass mark to 5 over it, the not-fair one 20 over it, 1 to 20 days ago, 5 to 20 minutes),
with planned tempos above, on and below the shown one.

| Reason | With a number (ceiling shown) | Without (ceiling not shown / none) |
|---|---|---|
| warm-up | `warmUpClean` "A warm-up at {bpm} BPM, under your clean tempo of {clean}." | `warmUp` "Just you and the click at {bpm} BPM, before anything counts." |
| back after a break | `backEased` "...starts at {bpm} BPM. Your clean tempo is {clean}." | `backEasedNoClean` "It has been {days} days, so this starts at {bpm} BPM." |
| new from a sibling | `newFromSibling` "...about 80% of your clean {clean} BPM on {sibling}." | `newFromSiblingNoClean` (new) "New. It starts at {bpm} BPM, worked out from your Takes on {sibling}." |
| passed, keep it | `passedKeepGoing` "You've passed this at {bpm} BPM. This is to keep it." | `passedKeepGoingNoClean` (new) "You've passed this. This is to keep it." |
| Find my edge | `edgeCheck` "To check your clean tempo. Last time it was {clean} BPM." | `edgeFirst` "To find your clean tempo. It starts at {bpm} BPM and goes up while you meet the pass mark." |
| review | `reviewDue` "...Two Takes at your clean tempo, {bpm} BPM." | `reviewDueNoClean` (new) "A review: passed {days} days ago. Two Takes to keep it." |

The codes stay (`passedKeepGoing`, `newFromSibling`, `reviewDue`, `backEased`): Today's
line and `replanRest` read them. `reasonLine` picks the variant from the missing value.
Today's short forms `passedKeepGoingNoClean` / `reviewDueNoClean` copy the existing short
ones (they already had no number). New keys are in all fifteen locales (two sonnet helpers).

`passedKeepGoing` with no ceiling row quotes the last Take's tempo only when that Take is
not marked not fair. `reviewDue` keeps its number when slipped (`reviewDueSlipped` names
a rung) or left over (`reviewDueLeft`): neither calls it a clean tempo.

Not changed, on purpose (they quote a verdict, "passed", not a clean tempo):
`climb` ("Because you met the pass mark at {bpm}", short "Clean at {bpm} last time"),
`finisher` ("...at {bpm} BPM, a tempo you've passed", at the ceiling), `benchmark`. If the
owner wants a Take marked not fair kept out of these too, they need the same treatment.

## L1: what is stored

Edge Takes save `reason: stepNow.why.code`. When the ceiling is not the shown tempo the
code is now `edgeFirst` where it used to be `edgeCheck`. Its only reader is the export
(`exportData.ts`, plannerReasons); nothing about tempo, rotation or passes reads it.

## L2 to L4

- L2: `lastRaisedOutcome(progress, outcomes, among?)` (progress.ts) is the recap headline
  (`SessionView.tsx`) and the recap's coach line (`SessionCoach.tsx`); "raised" is judged
  against `cleanBeforeOutcome`. The model's `takeLine` (`context.ts`) reads
  `cleanBeforeOutcome` with the run's outcomes and drops "clean tempo before N" when N is
  no longer what it reads now. Tests: `cleanTempo.test.ts` "nf1c L2", `context.test.ts`
  "reads 'before' now".
- L3: `cleanTempoRows.test.ts` reads the fixture and the runner's source from
  `import.meta.url`.
- L4: the tripwire stays; it collapses whitespace and reads only `cleanBefore:` values that
  are calls, so a reflow, a type or a comment does not trip it. Still "look", not "bug".

## The question that stays with the owner

**Should the planner's own arithmetic also ignore a Take marked not fair?** Today it
does not: the stored ceiling (which keeps a not-fair Take) decides every tempo. What a
player sees today when a Take marked not fair holds the ceiling (e.g. pass mark 80, a fair
clean Take at 70, a not-fair one at 100; Progress shows 70):
- Find my edge starts at 100 and says "To find your clean tempo. It starts at 100 BPM...".
- the warm-up plays at 80% of 100 and says "Just you and the click at 80 BPM...".
- back after a break eases from 100 ("starts at 80 BPM", no clean tempo named).
- a new sibling starts at 80% of 100 "worked out from your Takes on" the sibling.
- the next Take after a pass climbs from 100 ("You've passed this. This is to keep it.").
- a review plays at 100 ("Two Takes to keep it.").
- a finisher plays at 100 ("a tempo you've passed"), and `climb` still says "Clean at N".
Every sentence is true; the tempos still come from the Take the player said was not fair.
