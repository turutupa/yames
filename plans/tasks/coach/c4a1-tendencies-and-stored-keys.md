# Leg c4a1: tendencies and the coach's stored keys, as code with tests (R)

Worktree `/home/dgx-delgado/yames-coach-c4a1`, branch `coach-c4a1`. Logs under `/tmp/coach-c4a1/`.

PLAN's leg c4a, first half (split by the size rule; c4a2 draws the Notebook, asks the goal, translates
and adds the scenes). This half is logic, storage and tests, **in English only, no layout scene**.
**R**: it adds keys to the settings store; the orchestrator's reviewer reads the diff before merge.
Needs nothing unmerged; it touches no Ask file, so it may run beside the card and search legs.

Read: `plans/tasks/coach/BRIEF.md` ("Owner decisions"); `plans/coach/progress/c1a.md` (`TakeFacts`,
`lean`, `heardIt`, `fair`), `c0.md` (`CoachContext`, `progress`), `t1a2.md` (`set_goal`, the
`coachSuggestions` entry of `set_setting`: both answer `notWiredYet` until this leg; the host's
`goal` / `setGoal` stubs; `useCoachToolHost.ts` line ~162 names you). Design, read-only:
`/home/dgx-delgado/yames-coach-design-out/DESIGN.md` 6 (the opening paragraph: every sentence names its
window), 6.6, 6.7, 9.1, 9.5; mock `10` (Read the PNG; the right-hand panel).

## What to build

1. **`src/coach/tendencies.ts`**: `tendencies(rows, now)` → the noticed lines as data (an id stable
   across runs, the kind, the values, the Exercises and Takes it rests on, the window's dates), from the
   stored `PathTakeRow`s (the 500-Take window). Each line **compares the player with themselves**
   (mock 10: "At 100 your eighths drop about ten points; at 90 they hold. From 6 Takes on three
   Exercises"; "the bar after a held note comes in late: 5 of your last 7 Takes on them"). Rules, each a
   test over fixture histories: at least five Takes of evidence; Takes marked not fair left out; an
   ungraded player gets tempo and minutes lines only; ids in `coach.suppressed` left out for thirty
   days, then allowed again; the 500-Take edge. Start with the kinds the stored facts can carry today
   (tempo against evenness, `lean` by bar position, after a held note / open string / shift as cues
   read them in `src/paths/cues.ts`); write in the progress file the kinds the design implies that the
   facts cannot support. **Measured facts only**: no cause, no advice, no praise.
   The old tool coach's "memory" in `useSession.ts` is a different thing: do not touch or reuse it.
2. **The four stored keys** (DESIGN 9.5), each with a typed reader and writer in one module
   (`src/coach/store.ts` or beside the settings code that already owns coach keys: grep
   `CoachSettingsSection.tsx` and say which), and each added to the settings manifest in
   `src/test/parity/surface.test.ts` (`UPDATE_PARITY_MANIFEST=1` as earlier legs did):
   - `coach.suggestions`: `"on" | "asked"`, default `"on"`;
   - `coach.cards`: per card kind, last shown and times dismissed (the shape c4b2's budget reads:
     define it now, with the seven-day and two-dismissals rules of 6.6 as pure functions and tests);
   - `coach.goal`: one sentence (at most 200 characters, as `set_goal` takes) and its date;
   - `coach.suppressed`: noticed-line ids with the date left out.
   A missing or malformed value reads as the default, never throws (a test per key). No SQLite table.
3. **Wire the stubs**: `set_goal` (proposal, receipt, undo to the previous goal) and the
   `coachSuggestions` entry of `set_setting` now read and write the real keys; their tests move from
   `notWiredYet` to the real behaviour. They stay `confirm` tools (one press).
4. **A context hook for c4a2**: what the Notebook needs as one plain object (`notebookFrom(rows,
   stored, now)`), built on demand, never in a render and never per beat.
5. Strings: the noticed lines' English templates only, in the locale namespace c4a2 will use, with
   every new key in all fifteen files as English and listed under "to translate (c4a2)". The English
   honesty lint covers them.

## Not yours

The Notebook's drawing, the tab, the goal question, Settings' row (c4a2). The weekly look-back,
plateaus, milestones, the one-card budget's use (c4b1 / c4b2). `useSession.ts`.

## Gates

tsc, vitest (including the parity suites `surface`, `localeKeys`, `savedFormats`), build. No layout run.

## Report

As the rules block's "The end of the leg": the tendency kinds built and left out (and why), one fixture
history with its lines, the four keys' shapes and defaults, and a "diff for review" paragraph naming
every hunk in the settings code and the manifest.
