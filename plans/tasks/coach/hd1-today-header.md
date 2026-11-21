# Leg hd1: Today's header says the plain fact; two tests get headroom

Worktree `/home/dgx-delgado/yames-coach-hd1`, branch `coach-hd1`. Logs under `/tmp/coach-hd1/`.
A small leg: aim for under 120k tokens.

## 1. Today's header (the owner's decision)

`~/yames-coach-design-out/OWNER-UPDATES.md`, "owner decisions on the 1k questions", item 4: *Today
header: replace "WELCOME BACK. IT HAS BEEN 12 DAYS" with the plain fact (same register as the
back-after-a-break line); all locales.*

- Find the header's kick (the small line above Today's title; grep the `en` locale for "welcome"
  and "it has been", case-insensitively, then the component that picks it). List every greeting
  variant that header can show and its conditions in your progress file.
- The register to match is pol1's sentence in Today's line: "Last Session, X: 79% even at 90 BPM.
  That was 12 days ago. Today starts at 85 BPM." A fact, no welcome, no exclamation, no judgement
  of the gap, nothing about the player ("you've been away").
- English: **"Last Session: 12 days ago"** (the header's own casing is CSS; keep the stored string
  in sentence case if that is how its neighbours are stored). Keep the existing plural handling
  ("1 day ago" / "yesterday" as the neighbours say it). If any other variant of that header greets
  ("Welcome", "Good to see you", "Welcome back"), reword it the same way or drop it to the plain
  date line the header shows on an ordinary day; say which you chose.
- All fifteen locales (sonnet helpers, `plans/COACH_I18N_BRIEF.md`; tell them: a fact, not a
  greeting; "Session" as the locale already says it). Remove keys nobody reads any more
  (`DELIBERATELY_REMOVED` if the locale test needs it).
- The header must not duplicate Today's line beneath it word for word: look at the two together
  on the back-after-a-break fixture (a screenshot at 1024 px and on a phone, `YAMES_SHOT_DIR` set
  to a folder under `/tmp/coach-hd1/`) and say what they read together.

## 2. Two tests that failed once under load (the relay's note of 19:35 in OWNER-UPDATES)

- `src/paths/generate.test.ts`, the test whose name has "mostly" (it names a grid; QA 2 #14): a
  longer per-test timeout (60 s), nothing else changed.
- `tests/layout/smooth.spec.ts`, "Ask commits nothing during a running Take" (about line 172): it
  waits on time; make it wait on the state it needs (the Take running, the panel settled) and then
  measure. The assertion itself must not get weaker: say exactly what changed.

## Gates

tsc, vitest, build (queue jobs); layout by name: `today-line`, `today-anchor`, `today-focus`,
`planner`, `short-window`, `smooth`, and the phone spec that shows Today's header. The full layout
suite is the orchestrator's (you changed text on a screen: say so).
