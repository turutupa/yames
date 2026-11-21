# Leg c4b2: the weekly look-back, the plateau question, milestones, the one-card budget, the Progress dot, the Path suggestion

Worktree `/home/dgx-delgado/yames-coach-c4b2`, branch `coach-c4b2`. Logs under `/tmp/coach-c4b2/`.

PLAN's leg c4b, second half. **Needs c4a1, c4a2 and c4b1 merged.** This is the largest brief here:
build it **in English with unit tests and the screens first**, commit, and if your context passes 170k
tokens at that point, stop: the fourteen locales and the layout scenes become leg c4b3 (the
orchestrator launches it from this file's items 7 and 8). Put every new key in all fifteen files as
English and list them in `progress/c4b2.md` under "to translate".

Read first: `plans/coach/progress/c4a1.md` (`coach.cards`, the 6.6 rules as functions, `coach.goal`,
`tendencies`), `c4a2.md`, `c4b1.md` (the long-view call, `weekTotals`), `c1b1.md` (the recap line),
`c1b2a.md` (Today's line). Design, read-only: `DESIGN.md` 6.2 to 6.6, 9.2 (`cleanTempoMoved`,
`stepOpened`, `levelDone`, `pathDone`, `appOpened`: they exist in `src/coach/bus.ts`); mock `10` (Read
it: the look-back card, the plateau's three tonal buttons and its chip, the dot on the rail).

## What to build

1. **`src/coach/weekly.ts`** (pure, table tests): the look-back for the last calendar week with three
   Sessions or more (fewer: nothing, and no remark about it). In order: one sentence; the benchmark if
   the week holds one (the same Take on day 1 and day 7; "Hear day 1 and day 7" **only when both
   recordings exist**: find out whether a Path Take keeps audio today; if not, no button, and say so);
   what moved, from → to; anything stuck, as the plateau question; the counts as one line at the foot.
   With grading off it speaks of minutes and tempos only. Every number names its window.
2. **The card on Progress** (`CompanionCard.tsx`, or the name the code suggests), first on the page,
   "Hide" with an Undo for a few seconds (`coach.cards`). The goal from `coach.goal` quoted when set.
3. **Plateaus** (`src/coach/nudges.ts`): after `PARK_AFTER_SESSIONS` Sessions without a new clean tempo
   the coach asks first: "Three Sessions at 90 on the A string. Keep at it, try it another way, or rest
   it till Saturday?" Keep at it leaves the plan alone; another way is the existing Swap
   (`swapOptions`) or the loop; rest is the planner's parking (`PARK_DAYS`, the day named). Each button
   goes through a tool's proposal (the player presses; the card never acts). If the planner parks on its
   own before the player answers, say what it does today and keep that behaviour unless the change is
   a pure read: anything in `planner.ts` or `useSessionRun.ts` makes this leg **R**.
4. **Milestones** (`src/coach/milestones.ts`), DESIGN 6.5's table, each **once** (stored in
   `coach.cards`): first Exercise passed and Step open on that result and the recap (subscribe to the
   bus events, as c1b1's note does); Level or Path done on the recap and one card on Today next open (the
   Path's own `payoff`, quoted); clean tempo up 20 BPM on one Exercise in the look-back (c4b1's query);
   benchmark improved on day 7, 14, 21 results. No confetti, no badge.
5. **The one-card budget** (6.6): one proactive card per app open (`appOpened`): milestone, then
   look-back, then plateau; the rest wait. "Not now" / "Hide": seven days, then after two dismissals
   not until asked. `coach.suggestions = "asked"` turns all of them off. Nothing proactive in a Session,
   the wizard or Settings. A budget test over a week of fixture app opens.
6. **The Progress dot** on the rail's Progress entry and the phone's tab bar: the look-back is waiting
   there. No count, no notification; gone once seen.
7. **The Path suggestion** (`src/coach/pathSuggest.ts`, 6.4): only when a Level is finished, or when
   asked ("suggest a Path" as a fact card in `intents.ts`). One suggestion, on Paths, last on the page,
   a chip-sized button that opens the Path (it never subscribes; `follow_path` stays a proposal). The
   reason is the curriculum's own (`buildsOnPaths`, `curriculumOrder`, `unmetPathPrerequisites`),
   ordered by `coach.goal` when one is set.
8. **Locales and scenes** (c4b3 if you split): fourteen locales by sonnet helpers; scenes: the look-back
   at 1160 with the dock (DESIGN 10, C4's gate) and on a phone, the plateau question, a milestone line on
   a result, the Path suggestion, the dot; Ember and Manuscript, one in German or Russian. Pictures only
   when `YAMES_SHOT_DIR` is set.

## Not yours

The long-view query (c4b1). The Notebook (c4a2). The reminder (rem). Ask's thread files, except the one
`intents.ts` entry for "suggest a Path" (coordinate: no card leg may run beside you).

## Gates

tsc, vitest, build; layout by name: `progress.spec.ts` (grep the name), `rail.spec.ts`,
`phone-learning.spec.ts`, `today-line.spec.ts`, `coach-session.spec.ts`, `short-window.spec.ts`,
`smooth.spec.ts`, your scenes. The full layout suite is the orchestrator's.

## Report

As the rules block's "The end of the leg": one fixture week's look-back in full, the budget test's
table, where each milestone shows, what was split to c4b3 if anything, the screenshot paths, and a
"diff for review" paragraph (any hunk in `planner.ts`, `useSessionRun.ts`, `useSession.ts`).
