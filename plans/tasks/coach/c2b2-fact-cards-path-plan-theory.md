# Leg c2b2: fact cards, second half: the Path, the plan, theory; the source line opens what it cites

Worktree `/home/dgx-delgado/yames-coach-c2b2`, branch `coach-c2b2`. Logs under `/tmp/coach-c2b2/`.

The second half of PLAN's leg c2b. Read: `plans/tasks/coach/BRIEF.md` ("Owner decisions");
`plans/coach/progress/c2b1.md` (the machinery you add shapes to: `ask/intents.ts`, `cards.ts`,
`suggest.ts`, the English matcher, how a card's source is attached) and the progress files it names;
`c4c.md` (cues: "what should I try" answers from them). Design, read-only:
`/home/dgx-delgado/yames-coach-design-out/DESIGN.md` 5.3 (the table of topics, rows 2 to 5), 5.4, 3.6
(the Source row: "tapping it opens what it cites"), 4.3 (history, rungs and review in the coach's
words); mock `08`.

## What to build

1. **The Exercise and the Step** ("what is this for", "what should I try", "how do I play it", "what
   is graded here and what is not"): from the pack's text in the player's language and the cues
   (`cueFor`); source "From the Path · Step N". The app quotes the Path; it does not paraphrase it.
2. **The plan** ("why this", "why this tempo", "what's next", "can I skip ahead", "I have 5 minutes",
   "when does this come back"): from `Reason`, `bigAction`, `testOutSteps`, the minutes picker, the
   review schedule; source "The app". Where the honest answer is an action (test out, fewer minutes),
   the card ends in the matching tool's **proposal** (t1a2's `test_out`, `set_minutes`): the player
   presses; the card never acts.
3. **Theory** ("what fits over F", "show me the next position", "what notes are in this chord"): from
   `src/jam/harmony.ts`, `scales.ts`, `src/paths/theory.ts`, as `fretboard` and `chordShape` blocks
   through t1a1's `show_scale` / `show_chord`; source "Worked out by the app".
4. **The app's own terms**, the handful that are computed rather than written ("what does 85% even
   mean" answered in milliseconds at this tempo; "what is a clean tempo" with the player's own number;
   "why didn't that count"): the written help entries are leg c2c's: leave those typed.
5. **Tapping a source line opens what it cites** (DESIGN 3.6; owed since c1b1): "Measured · Take 2"
   opens that Take's review; "From the Path · Step 2" opens the Step (through `open_step`, with its
   receipt and way back); "Worked out by the app" and "General advice" open a one-line explanation of
   what that label means. On a phone only where the line is a 44 px target; otherwise it is not a
   target. In a Session nothing navigates away from the Session: the source opens in Ask.
6. Chips for these shapes through `suggest.ts` (still at most three; a table test per screen), the
   English matcher's entries, strings in fifteen locales, the honesty lint.
7. Layout: a scene per kind of answer (a Path passage quoted; a plan card ending in a proposal; a
   fretboard answer), at 1440 and a phone, Ember and Manuscript, one in German or Russian.

## Not yours

Search and the written help set, `explain_screen` (c2c). A model (c3b). Jam's and Songs' own cards
(c5a).

## Gates

tsc, vitest, build; layout by name: `ask.spec.ts`, `coach-session.spec.ts`, `short-window.spec.ts`,
`smooth.spec.ts`, your new scenes. The full layout suite is the orchestrator's on a weekday before
8 PM Pacific (run it yourself after 8 PM or at a weekend).

## Report

As the rules block's "The end of the leg", with the table of shapes added, what each source line
opens, and the screenshot paths.
