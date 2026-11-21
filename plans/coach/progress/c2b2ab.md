# c2b2ab: the review's fixes to c2b2a (H1-H3, M1-M3, L1-L8)

Branch `coach-c2b2a` (fix leg, same worktree). Base before the first commit: `ae9d3c88`. Logs: `job logs coach-c2b2ab-*`.

## Findings and fixes (tests in `pathCards.test.ts` PC, `pathMatch.test.ts` PM, `useAskHost.test.tsx` AH)

| Finding | Fix | Test |
|---|---|---|
| H1 plan cards read Today's plan | `CoachRun` carries `plan` and `startedAt`; `planStepHere` / `planNext` read `run.plan` (fixtures without it fall back to `ctx.plan`); `useAskHost`'s `plan` getter: the run's plan in a Session, Today's on Today; `contextForModel`'s "of M" from the run's plan | PC "the plan the Session runs…" (Test out from a Step's page, a step inserted, Today rebuilt; through `runReducer` + `buildCoachContext`), AH "the plan the cards read" |
| H2 `scale_fits` clashing scales | `PLACED`: m7b5 = ii of minor, dim = vii of major, dim7 = vii of minor, aug = III of minor, 7#5/7b9/7#9 = V of minor, 7/9/11/13/7sus = V of major; the sentence names key and degree. Only scales holding every chord tone are offered; none left = `scalesNone`, nothing drawn (G7#9) | PC hand-written FITS rows, "every quality, all twelve roots" |
| H3 chord letters | `CHORD_LETTER_OFFSETS` complete (every `ChordQuality`); `notesOfChord` no longer falls back to key-wide sharps | PC SPELLED rows (C9 = C E G Bb D …), "every quality … on all twelve roots" by degree |
| M1 `pass_mark_ms` | each asked mark gets its own sentence (evenness, evenness held = `holdMs`, notes heard = `heardMark`); another check = no card (`markOther`); a bare number without "%"/"percent" is no match | PC "pass marks, each in its own words", PM 90%, 75 %, bare 85/120 |
| M2 variant on the ready screen | `played()` = the Take's variant only on `result`, else the step's; `exercise_try` reads no Take of another variant | PC "an Exercise with two variants" |
| M3 repeat count | `noteForTake` (`takeNote.ts`) used by both `useTakeNote` (SessionCoach) and `noteOf`, with the Session's start | PC "the cue for what Take N measured is the result screen's" |
| L1 clean tempo rule | string | – |
| L2 Test out rule | string | – |
| L3 tempo reason | the reason only for codes that say the tempo (`saysTheTempo`) | PC "why this tempo: a reason that is not about the tempo…" |
| L4 key root respelled | key and scale roots spelled by letter from the root as typed (`spellAbove`, `spellScaleByLetter`) | PC FITS Gb, C# |
| L5 slash chord | matcher: no card for a slash bass ("6/9" kept) | PM D/F#, C/G |
| L6 return edges | "within N days"; no pass tempo = `returnNoPassTempo`; test that `reviewStateOf` counts a Take marked not fair | PC "the review schedule's edges" |
| L7 own exercises | `MY_EXERCISES_PATH` = `MY_EXERCISES_PATH_ID`; the path id falls back to the running plan step's; own words sourced "The app" | PC "the player's own exercises" |
| L8 weak tests | rewritten without early returns or self-comparison | the above |

Spelling callers: `spellChord` in `paths/generate.ts`, `validate.ts`, `variantText.ts`, `custom.ts` (arpeggio qualities only, all already in the table): `npm run paths -- check` passes, no pack changed. `canSpellScale` untouched (`spellScaleByLetter` is separate).

## Strings (English in all fifteen files; c2b2b translates)

Changed: `plan.why`, `plan.next`, `plan.nextBpm`, `plan.nextLast` ("today's plan" → "this Session's plan"), `plan.skip`, `plan.returnDays*` ("in" → "within"), `theory.scalesIntroMajor/Minor`, `term.clean`.
New: `plan.returnNoPassTempo`, `theory.scalesPlacedMajor`, `theory.scalesPlacedMinor`, `theory.scalesNone`, `term.holdMs`, `term.heardMark`, `term.markOther`.

## To translate (c2b2b)

Everything in c2b2a's list, plus the strings above.
