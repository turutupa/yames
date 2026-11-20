# Leg t1b2: typed commands: every tool by a few words, with no model

Worktree `/home/dgx-delgado/yames-coach-t1b2`, branch `coach-t1b2`. Logs under `/tmp/coach-t1b2/`.

The second half of PLAN's leg t1b. Read: `plans/tasks/coach/BRIEF.md` ("Owner decisions");
`plans/coach/progress/t1a1.md`, `t1a2.md` (the tools and the runner) and `t1b1.md` (how Ask shows a
receipt, a proposal, "Which one?" and "that one is yours": you feed those, you do not redraw them).
Design, read-only: `/home/dgx-delgado/yames-coach-design-out/TOOLS.md` 2.1 (the "typed command" row)
and 2.5, `DESIGN.md` 5.3 (how a question is answered: the order of attempts) and 5.5 (what the panel
says with no model), mock `16`.

## What to build

1. **`src/coach/ask/router.ts`**: pure code that turns what the player typed into one tool call, or
   into "not a command". TOOLS 2.1: a verb, a number and a short word list per language. Examples that
   must work in English: "open paths", "start", "slower", "faster", "80", "80 bpm", "loop bar 3",
   "settings", "show a minor pentatonic", "open alternate picking", "step 7", "15 minutes", "follow
   blues". Rules:
   - A bare number is a tempo where a tempo can be set, minutes on Today where that is the only number
     that makes sense, and otherwise "Which one?" with both as choices. Never a guess.
   - Names (a Path, a Step, an Exercise, a jam, a preset, a scale) go to the tool as `query`: the app
     resolves them (t1a1's resolution), in the player's language.
   - The router never returns a call for anything on the never-list: those words ("record", "delete",
     "turn on the mic", "download", "grade") route to t1b1's "that one is yours" line.
   - A sentence that is not a command is not forced into one: it falls through to the next way of
     answering (today: Ask's plain statement that it cannot answer typed questions without a model;
     the fact cards arrive in leg c2b). A table test of near-misses per language proves the router
     prefers "not a command" to a wrong action: **a wrong action is the failure that matters**.
2. **A six-verb table per locale** (open / go, start / play, slower, faster, loop, show; plus the
   nouns for the screens and the units "bpm", "minutes", "bar", "step"), in `src/locales/<lng>/ask.json`
   or a file beside it, as data the router reads: the fifteen languages, written by sonnet helpers from
   the terms each locale already uses for those screens and actions (never invented synonyms a player
   would not type). ja, zh-CN, zh-TW and ko have no spaces: the router matches by contained words there.
   A table test per language: the same dozen commands, each reaching the same tool call as in English.
3. **Wire it into Ask's text box**: on send, the router runs first; a command becomes a tool call
   through `runCoachTool`, shown as t1b1 shows any tool result. With a model selected nothing changes
   yet (c3b decides how the two meet): the router still runs first.
4. **Every tool reachable**: a test walks the registry and proves each player tool has at least one
   English command that routes to it (or is listed, with the reason, as chip-only).
5. Strings: any new visible words in fifteen locales; the verb tables are data, covered by their own
   test instead of `i18n.locales.test.ts` if they live outside the translation files (say which).

## Not yours

The panel's drawing of results (t1b1). The fact cards and question shapes (c2b). A model (c3b).

## Gates

tsc, vitest, build; layout by name: `ask.spec.ts`, and one new scene: a typed command and its receipt
(1440 and a phone). The full layout suite is the orchestrator's on a weekday before 8 PM Pacific.

## Report

As the rules block's "The end of the leg", with the command table (what was typed → the call) in
English and one other language, the near-miss table, and the tools that are chip-only and why.
