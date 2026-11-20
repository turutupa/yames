# Leg ms1: the model selector and the resident model

Worktree `/home/dgx-delgado/yames-coach-ms1`, branch `coach-ms1`. Logs under `/tmp/coach-ms1/`.
Read `plans/tasks/coach/BRIEF.md` first (its "model selector" decision is this leg). Design: DESIGN.md
9.4 (row "In a Path Session"), 5.5, section 1 rows 2 and 3, and REVIEW.md row 5 of "The ten that mattered
most". Top priority of the first milestone.

## The owner's words

(As corrected on 2026-11-20: "the bottom rail" is the bottom of the RIGHT-hand coach panel, and a model
that is not downloaded gets a Download button in the selector. Item 4 below has both.)

A selector at the bottom of the right-hand coach panel (desktop; on a phone the Ask sheet's head and
Settings → Coach) with: **Off** (no language model loaded; the coach still works rule-made), the repo's two local tiers,
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
  `unloadCoachModel`, `is_coach_loaded`), the `coachBrainTier` settings key, and the foot of the
  right-hand coach panel (`src/containers/practice-coach/CoachCard.tsx`, where Start sits).
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
4. **The selector** (placement and download corrected by the owner on 2026-11-20; see
   `~/yames-coach-design-out/OWNER-UPDATES.md`, entries 2 and 3). **At the bottom of the right-hand coach
   panel**, where the old coach card's Start button sits: not the left rail. Today that panel is
   `CoachCard`; a later leg (c2a1) replaces it with the Ask dock and mounts the same component at the
   dock's foot, so build it as a self-contained component (`CoachModelSelector`, fed by `useCoachModel`)
   that takes no prop from `CoachCard`, and mount it at the foot of the existing panel. The old Start
   button stays for now (c2a2 removes it): the selector sits beside or under it at the panel's foot
   without displacing the tools' session controls. A small button naming the current choice and its
   state, opening a menu (a real listbox / menu: arrow keys, Enter, Esc, focus returned, `aria-*` right;
   it opens upward and stays inside the panel and the window at 380 and 320 px of panel width). The
   left rail keeps its Ask row and status exactly as on `coach`: **take the selector out of `Rail.tsx`
   and the rail's styles if the earlier work in this worktree put it there.**
   - Entries: **Off**; each local tier **named by model and size** ("Standard · Qwen3 4B · 2.5 GB"; reuse
     `brainTierLabelKey` and the display names Rust gives; a word for speed only if the repo has a
     measured one); nothing for Cloud (leave a typed place for it, render nothing).
   - Each local entry shows its truth: ready, loading (with progress if Rust reports any, else an
     indeterminate state that respects reduced motion), failed (why, Retry), **not on this device** (the
     RAM recommendation says no, or this build has no model support: `llm_compiled()` false, every
     phone), and **not downloaded**: its size and a **Download button in the row itself**.
   - **Download in the selector.** Reuse the existing download path (`src/ipc.ts`,
     `commands.rs` `download_model`, `useCoachDownload.ts`, `models.rs` `start_download`): the press
     starts it; the row shows progress, pause / resume, the checksum check and cancel, and a warning
     before starting on a metered connection or when free storage is short; when it finishes the model
     can be selected and loads as usual. The download runs while the menu is closed and while the player
     moves through the app; the selector's button shows it is in progress. Use what the existing path
     already offers and report precisely what it does not (pause / resume? checksum? a storage or
     metered-connection check?): build a missing piece here only if it is small and does not touch Rust
     beyond `models.rs`; otherwise it is leg ms2, and the row offers only what is true (never a pause
     button that cancels). If the store holds one brain at a time, a download of the other tier must
     not silently remove the one on disk: either make the two sit side by side here if that is a small
     change, or do not offer the second download until ms2 does it, and say which you chose.
     Selecting, downloading and Off never delete anything; delete and manage stay in Settings → Coach.
     The player starts every download with a press: nothing downloads on its own, on startup, or
     because a model was selected.
   - Memory, honestly: what the loaded model takes (what Rust can report; the file size on disk is an
     honest lower bound if nothing better exists) beside the machine's memory.
   - Settings → Coach carries the same choice (it already has the tier control: make the two one
     state). On a phone the selector will sit in the Ask sheet's head (leg c2a1 mounts it); there is no
     local model there today, so the hook returns `notOnThisDevice` and the rows say so.
   - Looks: theme tokens only, the panel's own type scale, no coach colour, no solid button (Download
     is a tonal button). Check it in two dark themes and one light one.
5. **The choice persists.** Decide, from what you found, whether the existing `coachBrainTier` key is the
   choice (preferred if "off" there can mean "unloaded, still on disk") or a new key is needed; no saved
   install may lose its model or its setting (add a migration test if you add a key, and add any new key
   to the settings manifest in `src/test/parity/surface.test.ts`). **Off never deletes anything.**
   Default: the saved choice; on a fresh install whatever the wizard sets today; where Rust says the
   machine is too small, Off.
6. **The Ask row's status text** ("Start", the session state) keeps working for now: the old panel and
   its Start button are removed by a later leg (c2a2), not here. Do not delete `CoachCard`.

## Not in this leg

The wizard, Settings regrouping, the Ask panel, any Rust change to the audio path. Download pieces the
existing path lacks and that are not small (see item 4) are leg ms2: say exactly what it would take.
A Rust change is welcome only if the UI cannot be honest without it (for example a memory figure or a
load-progress event): keep it small, list it under "Rust diff for review".

## Gates

tsc, vitest (loader state machine: every transition, "a Take is running" defers a load, a pick during a
load, Off during a load, failure and retry; sessions no longer load or unload; quiet session generates
nothing; persistence; the download states of a row: idle, running with progress, cancelled, failed,
finished and selectable; nothing downloads without a press), build; layout: `rail.spec.ts` (unchanged
rail), `short-window.spec.ts`, `settings.spec.ts`, `tour.spec.ts`, and a new scene for the open selector
at the foot of the coach panel at 380 and 320 px of panel width, with a not-downloaded row and with a
download in progress (inside the panel and the window, nothing clipped, the Start button and the feed
still usable); screenshots of those scenes in Ember, Neon and Manuscript under `/tmp/coach-ms1/shots/`;
`npm run test:rust` if Rust changed; parity suites
(`src/test/parity/*`) green; `check:mobile-bundle` green. Strings in all fifteen locales.

## Report

As BRIEF "The end of a leg", plus: the answer to "one brain or two on disk", what ms2 would take, and the
diff range for the reviewer (`useSession.ts` call order; any Rust).
