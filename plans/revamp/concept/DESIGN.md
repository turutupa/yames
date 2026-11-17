# Yames concept: Coach, Map, Stage

## Vision

Yames becomes a coach you play with, not tools you configure. Each day brings a short session: one new step, one review, one free jam. Each step opens the right tool already set up, grades only what the analyser measures, and ends with one number that moved. Progress lives on a glowing 3D map whose trunk alternates rhythm and theory steps, with style constellations in the distance. While you play, the screen goes flat, huge and quiet, readable from three metres away. The spectacle happens between takes, never during them. Nothing is locked: every tool and jam stays playable.

## Information architecture

```
Top bar:  [Map] [Today] (Session while running)   ......   [Tools] [Coach]
          |
Map (3D) --click node--> Node card --Start--> Session runner (stage mode)
Today (2D over dimmed map) --Start session--> Session runner --after 3 takes--> Recap
Recap --Next step--> Session runner (review step) | --Map--> Map (camera flies to node)
Tools drawer (always reachable) -> Metronome, Jam mode, Theory cheat sheet,
                                   Setlists, Coach history, Speed drill
Coach panel (always reachable, collapsible) -> can navigate and change presets
```

- **Today** (home): AI greeting, three steps, weekly goal ring (3 sessions a week; missed days are fine).
- **Map**: Act I trunk is R1 Pocket, R2 Sixteenths, T1 Pentatonic box 1, R3 Syncopation, T2 Chord tones, R4 Shuffle, T3 Call and response, T4 Blues scale, then the Boss (slow blues). Training grounds (Speed drill, Fretboard names) orbit the trunk; Act II branches fan out from the boss. Theory nodes say "arrives with the pitch coach" until it ships.
- **Session runner**: not a new tool, just a frame around the existing metronome, jam grooves and coach analyser, preconfigured from the step.
- **Tools**: the plain v1.2 tabs, unchanged and one click away.

## Core session loop

1. Today shows one line of context ("Tuesday: 54% in the pocket").
2. Start (Space or foot pedal) opens stage mode with tempo, groove and targets loaded.
3. One bar of count-in, then a 4-bar take. Each hit lights up as on time, early or late, with a large label.
4. The take result (% in the pocket) appears; the next take auto-starts after 4 seconds (Space skips).
5. After 3 takes, Recap shows the number that moved, the trend and one verified tendency ("the 'a' of 1 lands 17 ms late").
6. Next step or free jam. The weekly ring fills and the map node celebrates.

## What the AI does on each screen

| Screen | AI role |
|---|---|
| Today | Greets you and words why the (deterministic) planner picked these steps. |
| Map | Describes nodes, answers "what's next", flies the camera there. |
| Session | Silent during takes; at most one analyser fact between takes. "Slower" drops 5 BPM from the next take. |
| Recap | Explains the tendency musically and suggests a fix. Never invents a score. |
| Tools | Opens a tool with a preset on request. |

The AI never grades, unlocks or scores anything. Every number comes from the analyser (simulated in this PoC).

## Visual language

- **Palette:** a night background (#07090f), warm ink (#f4f1ea), amber for the current step (#ffb347), teal for rhythm (#3fe0c5), violet for theory (#a78bfa), grey-blue for distant content. Feedback colours: on time green (#5df29a), early blue (#5aa9ff), late coral (#ff7a5c). Every feedback state also carries a word and an arrow, so colour is never the only cue.
- **Type:** the system UI stack, with tabular numerals for tempos and scores. Stage mode uses clamp()-scaled sizes: 12 vw for the main feedback, a 6 rem tempo.
- **Stage mode rules:** flat 2D on a solid background, minimum 4.5:1 contrast, no camera motion, no particles and no blur. The only motion is the playhead and hit markers, which carry information. The WebGL render loop is stopped and the canvas hidden, so the GPU and main thread are free for audio and timing.
- **3D moments:** the map, flying to a node, the celebration burst on Recap, boss-jam intros (later), and an optional 3D fretboard (later). Bloom, a starfield and slow drift.
- **Reduced motion:** `prefers-reduced-motion` disables drift, pulses, bursts and screen transitions, and camera flights become instant cuts.

## Mocked in the PoC versus real later

| PoC (mock) | Real |
|---|---|
| Hits are simulated: random offsets that improve across takes, clearly labelled SIMULATED | Rust onset detection from the coach's timing analyser |
| Web Audio click and groove synthesised in the page | Rust audio engine, the existing jam grooves and kits |
| The coach is a regex-scripted chat | Templated, analyser-backed explanations; an optional LLM (local by default, BYOK) for wording only |
| History, streak and weekly goal are hard-coded | Local progress store, opt-in anonymous telemetry (first-node completion, return within 7 days, still active in week 4) |
| Tools are stubs (the metronome stub really clicks) | The existing v1.2 tabs, opened with a preset |
| The map is one static Act I, with Act II branches as dim silhouettes | A data-driven map; branches go live after the boss and launch metrics are in |
