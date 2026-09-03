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
- [ ] 2/4 exists; cycling meters with the hotkey/widget/Zen steps through variants correctly (from 2+2+3 next is 8/8, not 4/4).
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
