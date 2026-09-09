# Manual test checklist — Phase 0 close

Covers everything merged for Phase 0 and the onboarding track. All of it
passed the automated gates (tsc, vitest, cargo, DSP and high-BPM
fixtures, LLM smoke, jitter probe) — and since 2026-09-03 those gates run
in CI on all four shipping platforms, not just on a developer laptop.
These are the checks only a person at the instrument can do. Tick what
works; anything that fails goes back as a task before any release.

Phase 0 §0.5c (T06b, the allocation-free beat queue) is deliberately
*not* in this build — it rewrites the audio callback and would put fresh
risk into the very path §4 and §5 are here to test.

**Setup for the fresh-install checks:** either move your real store aside
(`%APPDATA%\com.yames.metronome\settings.json` on Windows,
`~/Library/Application Support/com.yames.metronome/` on macOS) or run a
dev build with a different identifier. Restore it afterwards.

## 1. First run (onboarding O1–O8, O1b)
- [ ] Fresh install opens the **main window** (not the floating widget) with the Welcome screen and a soft 80 BPM click.
- [ ] "Just give me the click" → metronome usable within seconds; a "Finish setup" chip appears; it opens the wizard at Instrument; disappears after two dismissals or completion.
- [ ] "Set me up" → Instrument: clicking a card only highlights it; Next advances; misclicks harmless; Skip persists nothing.
- [ ] Sound & look: hovering a sound card changes the click within a beat; hovering a theme restyles the window; Esc/Back restores; "More themes in Settings" detours and comes back to the wizard.
- [ ] Hands-free: keyboard card shows your real bindings; plug a MIDI pedal → the card lists it and one tap maps Play/Stop; unplug → calm no-device copy.
- [ ] Coach opt-in: the recommendation matches your RAM (Studio greyed below ~15 GiB with the reason); choosing Standard starts the download in the background and the wizard continues.
- [ ] Audio input: pick mic or interface; meter moves; Next enables after about a second of signal; skip available.
- [ ] Hear it work: count-in, eight beats, your onsets light the dots and move the needle; one honest sentence at the end; silence gives "Didn't hear anything" with Back.
- [ ] Ready: every row jumps back to its step; Always-on-top toggle works; Start practicing lands on the metronome at 80 BPM.
- [ ] Tour: six stops highlight the right controls at 800×900 and at the minimum 480×780 window; ←/→/Esc; re-openable from Settings and the `?` Help menu.
- [ ] Hints: over a few sessions you see at most one hint per session (Drill first open, "save as preset?", "press ? to ask", Zen, widget, MIDI plugged); Settings → Reset hints brings them back.
- [ ] Existing store (your real one): no wizard, one-time tour offer, what's-new modal once; Settings → General has Run setup again / Take the tour / Reset hints.
- [ ] Help menu (`?` and Cmd/Ctrl-/): tour, setup, shortcuts sheet fits at 480 px, Report a problem writes the diagnostics bundle.

## 2. Coach and local model (T01, T03, T04, T04b, T04c)
- [ ] Settings → Coach shows the truthful status: template coach / ready, not loaded / warming up / active with the model's real name and backend.
- [ ] Second status line (T04b) matches reality on the machine you are on. On your RTX 3080 laptop, once a session has produced one tip, expect "Tips, reports and chat all use the AI". Forcing the CPU path (`YAMES_LLM_GPU_LAYERS=0`) should instead give "Tips: instant templates · Reports and chat: AI (~3.8s each)" — and tips should then arrive *instantly* as templates rather than pausing ~3 s first. Before the first rephrase the line omits the number rather than guessing it.
- [ ] Download Standard (Qwen3-4B) from Settings on a normal connection; progress bar; no model loads yet (RAM stays flat).
- [ ] Start a session with the brain on: "warming up", then tips arrive rephrased; stop the session, wait 10 minutes → RAM drops (unloaded); next session reloads.
- [ ] Turn the brain tier off → unloaded immediately. Remove models works while a session is off and shows an error if something holds the file.
- [ ] Chat with the coach after a session (up to 15 s answers on CPU, well under 1 s on a GPU); mini-report and session summary are never blank.
- [ ] On a GPU machine the status backend says vulkan/metal; on CPU-only, live tips stay templates while reports and chat use the model.
- [ ] macOS only: the Metal build loads and answers (the macOS path was never run by a worker).

## 3. Voice (T05)
- [ ] Download a voice; hear the greeting through your selected output device; the metronome dims during speech and restores after.
- [ ] Stop speech mid-sentence (voice off / new session) → it cuts within a beat.
- [ ] macOS regression: playback no longer uses `afplay`; `say` fallback still works if Piper is missing.
- [ ] Linux: voice download and playback (nobody has run this).

## 4. Metronome, meter, FREE mode (#10 follow-ups, #11)
- [ ] The live early/late needle is visible while playing with evaluation on (it was invisible before today).
- [ ] FREE mode: chip collapses groups; chevrons wrap 16→1 and 1→16; no accent on any beat, including during a drill ramp; switching to 7/8 restores groups.
- [ ] The meter row reads ascending: FREE, 2/4, 3/4, 4/4, 5/4, 6/8, 7/8, 8/8, 9/8, 12/8. It used to run 4/4, 3/4, 2/4 and then ascend, which reversed direction halfway.
- [ ] Cycling meters with the hotkey/widget/Zen walks that same order and wraps at both ends (12/8 → 2/4, and 2/4 back → 12/8); from a 2+2+3 variant the next is still 8/8.
- [ ] A meter the app doesn't recognise (e.g. a hand-edited grouping) still lands on **4/4** when you press next/previous — not on 2/4. This is the one thing the reorder could have broken silently.
- [ ] Change meter mid-play: main window dots, floating widget dots and Zen dots all stay aligned with the audible accent.
- [ ] Zen on the Drill tab with a 7-beat meter: a dot lights on every beat.
- [ ] Clicking meter chips mid-practice does not erase the open practice segment from the session report.
- [ ] Old presets saved with "Never" accent load fully (they now map to FREE mode).
- [ ] Per-beat hit/miss colouring on the metronome dots while evaluation is on.

## 5. Audio safety (T06)
- [ ] Play for a minute at a fast tempo while the coach generates; no click dropouts or glitches. Optional: `bun run yames:jitter-probe --gguf <model>` prints zero missed beats.

## 6. Housekeeping — done 2026-09-03, nothing left for you here
- [x] Leftover worker target dirs deleted: `C:\yo4`, `C:\yo8`, `C:\yo1b`, `C:\yt01`, `C:\yt04r`, `C:\yt06`, plus a duplicate copy of the test weights. 63 GB reclaimed.
- [x] `%APPDATA%\com.yames.metronome.o1check` was already gone.
- **Kept on purpose:** `C:\yt06models` (2.7 GB, Qwen3-0.6B + Qwen3-4B). It is the only remaining copy of those weights and the optional jitter probe in §5 needs it. Delete it yourself if you would rather re-download.
- Still on disk: 22 stale worktrees under `.claude/worktrees/`. All content-merged; `git worktree prune` after removing them is safe whenever you want the space.

## 7. Setlists (U9, and the two-room split)

The runtime has never run against the real audio engine — `REVAMP_PARITY.md`
§6 says so, and unit tests cannot close it. This section is what closes it.
Build a setlist of four or five short steps first: mix the trigger kinds so
one ends on bars, one on a time, and one waits for you.

**Upgrade path**
- [ ] A build from before the rename had "chains" saved. Open this build: they
      are all there, named the same, under **Setlists** in the sidebar. Nothing
      is empty, nothing is duplicated.
- [ ] Save an edit, quit, reopen: it persisted. (It is now stored under a
      `setlists` key; the old `chains` key is read once and left alone.)

**The editor**
- [ ] Clicking a step opens it into its sentence; the row you clicked stays put
      and the sentence opens beneath it.
- [ ] Every phrase edits and is **audible immediately**: tempo, meter,
      subdivision, sound, volume. The click changes as you change it. (This was
      broken once — the phrases looked dead because the edit was being read
      back off the engine and undone.)
- [ ] The trigger phrase and the transition phrase open the same window, and it
      lands where you clicked rather than off the bottom of a long setlist.
- [ ] "+ Add a step" copies the step above it, not whatever the metronome was
      last set to. On an empty setlist the first step takes the metronome's
      current settings.
- [ ] Reorder, duplicate and remove are on the open step only, and do what they
      say. Removing the open step does not leave the editor stranded.

**Triggers, live**
- [ ] A **bars** step ends on the bar it says, and the switch lands on a
      downbeat — count it. Nothing is cut in half (U9.3).
- [ ] A **seconds** step ends within a beat of its time, and the player's
      "bar N of M" agrees with what you are counting.
- [ ] A **when I say** step waits indefinitely. The transport's *Skip to next*
      goes solid amber while it waits — it is the only thing that moves the
      setlist on.
- [ ] Skip pressed mid-step lands on the next downbeat too, not instantly.

**Transitions**
- [ ] **Cut**: the next step starts on the next downbeat, at the new tempo.
- [ ] **Count me in N bars**: the beats sound at the NEW step's tempo, and the
      last of them is beat one of that step.
- [ ] **Rest N bars**: silence for exactly that many bars, then the next step at
      its own volume — the rest must not leave the volume down (U9.2).

**The count-in at the top**
- [ ] Set "Count in — 4 beats" and press Start: four beats at step one's tempo
      before step one begins, with the player's big number counting them down.
- [ ] "No count-in" starts immediately, the way it always did.
- [ ] It does not fire again on the second pass of a repeating setlist.

**Repeat and the end**
- [ ] "Once through" stops at the end of the last step and the transport shows
      it finished, rather than looping silently.
- [ ] "3 times through" plays three passes. "Until I stop it" keeps going.
- [ ] A last step set to *when I say* keeps playing until you stop the
      transport.

**The player**
- [ ] Start swaps the editor for the player. The step's **name** is the largest
      thing after the tempo, and both are readable from where you actually sit
      with the guitar.
- [ ] The dots follow the step's own grouping, and change when the step does.
- [ ] The ribbon fills across the current step and marks the ones behind it.
- [ ] "then <next step>" names what is coming; a clean cut says nothing extra.
- [ ] **Edit the setlist** returns to the paragraph **without stopping the
      run**, the running row is filled amber, and *Back to playing* returns.
- [ ] Editing a step you are NOT hearing, mid-run, does not retune the one you
      are hearing.

**Fit**
- [ ] At your smallest usable window, neither room overflows: nothing hides
      behind the transport and nothing needs scrolling that should not.
- [ ] A setlist of ~20 steps scrolls the list downward, in the themed lane, and
      never sideways.

## 8. Revamp regression (things that were fine and must still be)

- [ ] Drill: the plan sentence still edits, the climb still scrolls, ascending
      and descending drills both run and finish.
- [ ] Sounds: click, wood, beep, drum and snare all sound, and the accent is
      clearly the same instrument hit harder. Snare and drum on laptop speakers
      as well as headphones.
- [ ] Themes: every one, dark and light. Text stays legible on cards and inside
      popovers, not just on the page.
- [ ] Shell: dragging the window by the header and by empty stage works;
      dragging a horizontal scrollbar scrolls it rather than moving the window;
      clicking a setlist in the sidebar selects it (Windows and macOS both).
- [ ] Zen and the floating widget still open, and follow the beat.
