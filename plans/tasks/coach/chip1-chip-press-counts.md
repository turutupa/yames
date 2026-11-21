# Leg chip1: a chip's own press counts for a reversible one-step change

Worktree `/home/dgx-delgado/yames-coach-chip1`, branch `coach-chip1`. Logs under `/tmp/coach-chip1/`.

**The owner's decision** (`~/yames-coach-design-out/OWNER-UPDATES.md`, "owner decisions on the 1k
questions", item 1): *Suggestion chips: one press of the chip IS the press for reversible one-step
changes (e.g. "Slower"), always with Undo. Anything multi-step or not undoable still goes through
a proposal.* Until now a chip for a `confirm` tool showed its proposal first, so "Slower" took two
presses (`plans/coach/progress/t1b1.md`, "A reading to confirm with the owner").

Read: `progress/t1a1.md`, `t1a2.md`, `t1b1.md` (the runner, proposals, undos, receipts; how a
proposal and an undo are issued by the runner, single-use, bound to the screen and in a Session to
the block and Exercise); `t1b2b.md` and `t1b2c.md` (typed commands); `TOOLS.md` 2.1 to 2.3 and
DESIGN 13 in `/home/dgx-delgado/yames-coach-design-out/` (the three sorts: at once with a receipt
and undo / one press / never).

## What to build

1. **Which tools qualify is data, not judgement at the call site.** A field on the registry entry
   (name it for what it means, e.g. `chipPress: true`), set only where ALL of these hold: the tool
   is `confirm`; it changes exactly one value; its undo exists and puts back exactly what was there
   (including "no choice", as the band volume's `auto`); it starts no sound, stops no sound, does
   not navigate, stores nothing beyond what that control's own setter stores; the proposal it
   replaces had nothing to preview beyond "X → Y". By these rules: the tempo nudges (Slower,
   Faster; in a Session the one-rung nudges that exist), the click's subdivision, and the safe
   settings whose proposal is one line. **Not**: starting today's Session or playing an Exercise
   (sound starts), Find my edge, Test out, swapping a part / minutes / focus (the plan as it would
   be is a preview the player should see), `follow_path` (no undo), `load_jam` / `load_preset`
   (the unsaved-work question), anything whose proposal says "The click stops." or "This can't be
   undone here.". Write the final list with the reason per tool in your progress file; a registry
   test walks every flagged tool and fails if one has no undo, navigates, or can start or stop sound.
2. **The chip path.** Pressing a chip for a flagged tool runs it at once through the runner (the
   same checks a confirmed proposal's press makes: the screen, the value still as shown, nothing
   during a Take, the never-list) and leaves a **receipt with Undo** ("Tempo 120 → 115 BPM" ·
   Undo). The Undo is the runner's (single-use, good only on the screen, and in a Session the block
   and Exercise, where it was issued). **Its lifetime**: the player saw no proposal, so the ten
   seconds a confirmed change gets is too short to count as "always with Undo": the Undo stays
   pressable until the value is changed again (by anyone), the player leaves that screen (or block /
   Exercise), or a Take starts; then the receipt stays as a plain line. If the runner's undo model
   makes that impossible without a redesign, say so and give the longest honest lifetime it allows.
3. **What does not change.** A typed command ("slower", "80") keeps its proposal: free text can be
   misread, a chip cannot (a reading of the owner's words, which name chips: record it in your
   report so the owner can overrule). A tool call chosen by a model (c3b, later) never runs at
   once on this flag. The `accept-suggestion` binding keeps accepting the proposal on screen. A
   chip for an unflagged tool still shows its proposal. Nothing during a Take.
4. **A double press** of the chip is one change, not two (t1b1b's rule for buttons); a second,
   separate press is a second change with its own Undo, and the first receipt's Undo retires.
5. Strings: reuse the receipt and Undo strings that exist. A new key only if a sentence is
   missing; then all fifteen locales (sonnet helpers).

## Gates

tsc, vitest, build; layout by name: `ask`, `ask-tools`, `ask-typed`, `smooth`, `short-window`,
`coach-session`; update the `ask-tools` scenes that show a "Slower" proposal from a chip (the
proposal scenes for unflagged tools and for typed commands stay). No Rust.

## Report

"Diff for review": every hunk in the runner (`src/coach/tools/run.ts`), the registry, the host,
`askTools.ts`, `AskPanel.tsx`, and anything that writes a setting. An independent reviewer reads
it before merge (the question: can anything now change without a press, or change something that
cannot be put back).
