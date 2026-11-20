# Leg ms1: the model selector and the resident model

Worktree `/home/dgx-delgado/yames-coach-ms1`, branch `coach-ms1`. Logs under `/tmp/coach-ms1/`.
Read `plans/tasks/coach/BRIEF.md` first (its "model selector" decision is this leg). Design: DESIGN.md
9.4 (row "In a Path Session"), 5.5, section 1 rows 2 and 3, and REVIEW.md row 5 of "The ten that mattered
most". Top priority of the first milestone.

## The owner's words

A selector at the right end of the bottom rail (desktop; the phone equivalent in the header / sheet)
with: **Off** (no language model loaded; the coach still works rule-made), the repo's two local tiers,
named by what they are, with "not on this device" states, and later **Cloud** (hidden until it exists).
The choice persists. A selected local model stays loaded across the app: loaded once after startup in
the background (never during a Take, never delaying first paint), kept loaded, unloaded only when the
player picks Off or another model. No more starting or ending coach sessions for the model. Show load
state (loading / ready / failed) and memory honestly; on low-memory devices offer Off by default.

## Investigate first (30 minutes, then write what you found into your progress file)

- `src/hooks/coachLoader.ts` (`ensureCoachLoaded`, `unloadCoach`, the idle unload),
  `src/hooks/useSession.ts` (where a session loads the model: around `startSession`; where the idle
  unload is armed; where tips are generated: the design says "nothing gates its tip pipeline" in a quiet
  session), `src/hooks/useCoachDownload.ts`, `src/coach/brainTiers.ts`, `src-tauri/src/models.rs`
  (`check_model_status`, the tier marker, RAM recommendations), `ipc.ts` (`loadCoachModel`,
  `unloadCoachModel`, `is_coach_loaded`), the `coachBrainTier` settings key, and the rail's foot
  (`src/containers/main-window/Rail.tsx`, `rail-footer`, the Ask row with its `rail-action-status`).
- Does the model store hold one brain at a time, or can both tiers sit on disk? What does setting
  `coachBrainTier` to off do today: unload only, or more?
- How does the old code decide the model is "fast enough" for tips (`should_use_model`,
  `rephrase_p50_ms`)? That stays as it is.

## What to build

1. **One owner for the model's life**: a small module (grow `coachLoader.ts`; a hook
   `useCoachModel` for the UI) holding the player's choice and the state
   `off | notDownloaded | notOnThisDevice | waiting | loading | ready | failed`. It loads the chosen model
   once after startup: after first paint, when the app is idle, **never starting a load while a Take is
   running** (it waits for the Take to end), and keeps it loaded. It unloads only when the player picks
   Off or another model. A failed load says so and offers Retry; it never loops.
2. **Sessions stop owning the model.** `startSession` / `endSession` (and the quiet session a Path Session
   runs) no longer load, unload or arm the idle unload; the ten-minute idle unload goes. Call order
   inside `useSession` is otherwise unchanged (the parity suite `src/test/parity/doors.test.ts` is the
   guard; an independent reviewer will read this diff).
3. **A quiet Path Session generates nothing**: no tip, greeting, report or summary from the model while
   the Session owns the quiet coach session, whether or not a model is resident. With a test
   (`useSession.brainLoad.test.tsx` is the place the design names). The tools' own coach (a session the
   player started in the tools) keeps using the model exactly as today when one is ready.
4. **The selector.** At the foot of the rail, at the right end of the Ask row where `rail-action-status`
   sits today: a small button naming the current choice and its state, opening a menu (a real listbox /
   menu: arrow keys, Enter, Esc, focus returned, `aria-*` right; it opens upward and stays inside the
   window at every width the rail has). The Ask row itself keeps opening the panel; the selector is its
   own control, not nested inside that button.
   - Entries: **Off**; each local tier **named by what it is** (model name and size on disk, a word for
     speed if the repo has a measured one; reuse `brainTierLabelKey` and the display names Rust gives);
     nothing for Cloud (leave a typed place for it, render nothing).
   - Each local entry shows its truth: ready, loading (with progress if Rust reports any, else an
     indeterminate state that respects reduced motion), failed (why, Retry), **not downloaded** (the row
     leads to Settings → Coach, where the download is the player's own press: the selector never
     downloads), **not on this device** (the RAM recommendation says no, or this build has no model
     support: `llm_compiled()` false, every phone).
   - Memory, honestly: what the loaded model takes (what Rust can report; the file size on disk is an
     honest lower bound if nothing better exists) beside the machine's memory.
   - Where the rail is icons only (under 620 px) the selector is not shown there; Settings → Coach
     carries the same choice (it already has the tier control: make the two one state). On a phone
     nothing is shown (no local model exists there); leave the hook returning `notOnThisDevice`.
   - Looks: theme tokens only, the rail's own type scale, no coach colour, no new solid button. Check it
     in two dark themes and one light one.
5. **The choice persists.** Decide, from what you found, whether the existing `coachBrainTier` key is the
   choice (preferred if "off" there can mean "unloaded, still on disk") or a new key is needed; no saved
   install may lose its model or its setting (add a migration test if you add a key, and add any new key
   to the settings manifest in `src/test/parity/surface.test.ts`). **Off never deletes anything.**
   Default: the saved choice; on a fresh install whatever the wizard sets today; where Rust says the
   machine is too small, Off.
6. **The Ask row's status text** ("Start", the session state) keeps working for now: the old panel and
   its Start button are removed by a later leg (c2a2), not here. Do not delete `CoachCard`.

## Not in this leg

Downloads, the wizard, Settings regrouping, the Ask panel, any Rust change to the audio path. If both
tiers cannot sit on disk today, do not rebuild the store: say what it would take (a later leg, ms2).
A Rust change is welcome only if the UI cannot be honest without it (for example a memory figure or a
load-progress event): keep it small, list it under "Rust diff for review".

## Gates

tsc, vitest (loader state machine: every transition, "a Take is running" defers a load, a pick during a
load, Off during a load, failure and retry; sessions no longer load or unload; quiet session generates
nothing; persistence), build; layout: `rail.spec.ts`, `short-window.spec.ts`, `settings.spec.ts`,
`tour.spec.ts`, and a new scene for the open selector at the rail's widths (inside the window, nothing
clipped, 44 px targets where the rail is touch-sized); `npm run test:rust` if Rust changed; parity suites
(`src/test/parity/*`) green; `check:mobile-bundle` green. Strings in all fifteen locales.

## Report

As BRIEF "The end of a leg", plus: the answer to "one brain or two on disk", what ms2 would take, and the
diff range for the reviewer (`useSession.ts` call order; any Rust).
