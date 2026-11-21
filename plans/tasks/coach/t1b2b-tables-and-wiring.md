# Leg t1b2b: typed commands in fifteen languages, wired into Ask's text box

Worktree `/home/dgx-delgado/yames-coach-t1b2b`, branch `coach-t1b2b`. Logs under `/tmp/coach-t1b2b/`.

The second half of `t1b2-typed-commands.md` (read it: items 2, 3 and 5 and the gates are yours).
t1b2a is merged: read `plans/coach/progress/t1b2a.md` first (the router, the table's shape, the one
call that wires it, the strings it left owed), then `progress/t1b1.md` (how Ask shows a tool result).

## What to build

1. **Fourteen command tables**, `src/coach/ask/commands/<code>.json` in `en.json`'s shape, for the
   app's other fourteen locales (`src/locales/` lists them). Written by sonnet helpers (three or
   four locales each), each given `plans/COACH_I18N_BRIEF.md`, `en.json`, and that locale's own
   `src/locales/<lng>/*.json` so a verb or a screen's noun is **the word that locale's UI already
   uses** (never an invented synonym a player would not type), plus the two or three everyday ways
   a player would really type it. `noSpaces: true` for ja, zh-CN, zh-TW and ko, with their particles
   in `fillers`. The `notCommand` words and the never-list words matter most: a table that lets a
   question through as a command is the failure. Every file passes `validateCommandTable`.
2. **A table test per language**: the same dozen commands as English, each reaching the same tool
   call; and **a near-miss table per language of at least fifteen lines** (questions, statements
   with a number, a negation, a never-list request) that must return `none` or `yours`. The helper
   that wrote a table writes its lines; you read them for sense, and a second sonnet helper per
   group of locales re-reads the near-misses as a native speaker would type them and adds five more
   each. A near-miss that routes to a call is fixed in the table, never in the test.
3. **The wiring** in Ask's text box (`AskPanel.tsx`'s send path; you own it): one function
   `answerTyped(text)`: the router first (`routeCommand(text, commandTableFor(lng), askCommandFacts())`);
   `call` → `runAskCall`, `which` → the refusal turn with the choices, `yours` → `askYours`,
   `none` with `notHere` → the runner's explanation (nothing changes); `none` → **a slot for the
   next answerer** (an exported, replaceable function that today answers "no": leg c2b1a, running
   beside you, exports `answerCardFor(text)` and c2b1b plugs it in), then what Ask does today (the
   model when one is selected; otherwise the plain statement). With a model selected the router
   still runs first. Nothing here runs per beat; nothing is typed or sent during a Take (Ask is not
   mounted in a Take: keep it so).
4. **The owed strings** in fifteen locales (`coachTools.command.minutes`, `.jam`, `.preset`,
   `.swapHarder`, `.swapDifferent`, `.swapStyle`, `.other`), and any new visible words. A line under
   the text box that says what can be typed ("Try: slower, 80, open paths") only if DESIGN 5.5 or
   mock 16 shows one: read them before adding anything.
5. **Layout**: one new scene, a typed command and its receipt, at 1440 and a phone, one of them in
   German or Japanese. Pictures only when an env var names a folder (never a fixed `/tmp` path).

## Not yours

`router.ts`'s rules (a real defect you find in it: fix it with a test and say so). The fact cards
(c2b1a owns `intents.ts`, `cards.ts`, `suggest.ts`, `match.ts`, the card turn kind and its drawing,
and the chips; it does not touch the send path). A model (c3b).

## Gates

tsc, vitest, build; layout by name: `ask.spec.ts`, `ask-tools.spec.ts`, `smooth.spec.ts`,
`short-window.spec.ts` and your new scene.

## Report

As the rules block's "The end of the leg", with the dozen commands in English and two other
languages (one without spaces), the near-miss counts per language and what the second readers
changed, the wiring's diff as a "diff for review" paragraph (every hunk in `AskPanel.tsx` and
`askStore.ts`), the slot's name for c2b1b, and the locales that want a native read.
