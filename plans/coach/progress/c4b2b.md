# c4b2b: the fixes from c4b2's review (`/tmp/coach-orch/c4b2-review.md`)

Branch `coach-c4b2` (no new worktree). Logs `/tmp/coach-c4b2b/`, jobs `coach-c4b2b-*`.
First commit of the leg follows `d9372f2c`.

## Findings → fixes (each with a test that fails without it)

- **M1** plateau inside the look-back ignored "Not now" ×2: `CompanionCard` passes
  `cardMayShow(stored, "plateau", now, states)` (subscribed to the store). Test: `CompanionCard.test.tsx`
  "does not ask it after 'Not now' twice on the plateau card (M1)".
- **M2** "Hidden for seven days" on the second Hide; nothing called `saveCardAsked`: the Undo's line is
  fixed at the press (`dismissed + 1 >= CARD_DISMISSALS_TO_STOP` → `companion.hiddenUntilAsked`), and the
  way back is real: pressing **On** under Settings → Coach → Suggestions calls the new
  `saveCardsAsked(BUDGET_ORDER)` (one write of `coach.cards`, nothing when no card was hidden).
  Tests: "the second Hide says 'until you ask'"; `CoachSuggestionsRow.test.tsx` "On asks for the cards
  hidden twice again".
- **M3** benchmark across variants: `benchmarkOf` also requires the same Exercise id, the same tempo and
  the same version (`variantIndexOf` in `session/take.ts`, `withVariant`'s rule, as cards.ts's
  `variantIndex`). Test: "compares the benchmark on the same version of the Exercise only (M3)".
  Owner/R: the planner pinning the benchmark's seed is a separate change, not made.
- **M4** "moved" from the 500 Takes: `cleanMoved` is driven by the spans (best set before the week → no
  row; best in the week → moved to it; first in the week → "first clean tempo"; best after the week →
  moved only when the Takes in memory reach back to the span's first). "From" only when the Takes reach
  back (`oldestRead`), else the row reads "now {{to}}, a new clean tempo". A graded look-back waits for
  the spans (`needsSpans`): no flash. Tests: four in `weekly.test.ts` (M4), and the card's first test.
- **M5** "Try it another way": offered only for a part on the stuck Exercise (`anotherWayPart`); the
  question then asks three or two (`plateau.ask` / `askTwo`). Tests in `CompanionCard.test.tsx`.
- **L6** +20 milestone said again: said only in the week whose best first crossed +20 (needs the Takes
  back to the span's first; else not said). Test "is not said again in a later week (L6)".
- **L7** a first clean tempo counted as moved: the sentence counts `!isNew` rows only. Test (L7).
- **L8** watch blocked by the view only: `companionBlocked({inSession, phase, wizardOpen})` = the shell's
  `holdNudges` rule plus the wizard. Test "is blocked by any phase of a run but idle (L8)".
- **L9** `playerWeekStart` per beat: `useMemo` keyed on `i18n.language` in MainWindow.
- **L10** foot/ungraded sentence undercount: `leftOut` → `footLeftOut` / `say.ungradedLeftOut` name what
  is left out (no number for it). Test (L10).
- **L11** "Rest it till {day}": `{day}` is now the weekday and the time (`toLocaleString`).
- **L12** `CompanionCard.test.tsx`: 13 tests (Hide/Undo/commit/unmount, the three answers, the watch).

## Strings (English in all fifteen `companion.json`; c4b3 translates)

New: `hiddenUntilAsked`, `weekly.say.ungradedLeftOut`, `weekly.movedRisen`, `weekly.footLeftOut`,
`plateau.ask`, `plateau.askTwo`. Changed: `plateau.say` and `plateau.sayRange` lose their closing
question ("Keep at it, try it another way, or let it rest?"), now `plateau.ask`.

## Merge and gates (after `merge(coach): into coach-c4b2`, no conflicts)

- tsc 0 (`coach-c4b2b-tsc-2`); build 0 (`-build`); test:rust 1279 passed, 0 failed (`-rust`).
- `npm run test`: 466 of 467 files, 50354 passed, 10 skipped; the one failed file is the known
  `TabStage.render.test.tsx` (node_modules symlink, `Denied ID ... Bravura.woff2?url`) (`-vitest`).
- Layout `rail`, `today-line`, `coach-session`, `short-window`: 144 passed, 52 skipped
  (`/tmp/coach-orch/c4b2b-pw.log`).

## Owed

- Layout `smooth` and `phone-learning` not run tonight.
- c4b3: translate the keys above; "seen" per run (owner question, unchanged).
