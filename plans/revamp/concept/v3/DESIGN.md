# Yames v3: practising at home with a good teacher

## The experience
Your own room at night. One tap, a ten-second soundcheck, and you're playing. A teacher's voice comes from your amp and waits for you. The ring on the speaker shows the bar; the room's LED strip washes the walls in your timing colour on each beat, so you catch it from the corner of your eye while looking at the fretboard. Between takes you say "go", or just start playing.

## Theme: a home practice room at night
The first concepts used space, then a stage. The owner's verdict: a bedroom player isn't performing, they're practising. So the world is a dim room: wall, wood floor, lamp, spare guitar, pedalboard, and an amp as the main object. Everything carries information:
- **LED strip and wash:** the beat, coloured by the beat just played (green pocket, blue early, orange late, pink missed).
- **Amp:** the coach's body. The jewel lamp glows and the cone flutters when it speaks. The cone pumps with the kick. Tubes glow with incoming signal. The first knob's pointer is the actual tempo.
- **Pedalboard LEDs:** one tile per bar, the take's history and progress.
- **Status light:** COACH, YOUR TURN, PLAYING.
- **Where am I:** the view tips up to sticky notes on the wall: ticked, today's circled in red, next, later. About 6 seconds, no interaction.

## Session script (about 7 minutes; a real 15-minute session would add takes)
1. **Soundcheck:** "Play or tap a few notes." Picks mic or tap, or falls back to an obvious DEMO. Then 4 clicks to hear, 4 to play along: sets the latency offset.
2. **New step, Sixteenths:** 3 takes of 12 bars. One short line after each ("Rushing 12 ms. Sit back."), then it waits.
3. **The number that moved**, from real input only: "94%, up from 63%, take 1" or against last session.
4. **Review, Pocket:** 3 takes of 8 bars.
5. **Free jam:** loops until you stop. No meter, score or grade.
6. **Wrap-up:** the real numbers, or "demo" with none.

## Scene per phase
- **Count-in:** 1-2-3-4 and a short playhead on the ring.
- **Take:** one ring plus a lit ±25 ms band. Pocket hits are small calm dots; errors get a stem to the grid and a halo (inside early, outside late); a miss is a large pink X. The hero is a per-bar verdict ("EARLY −12", "RUSHING", "IN THE POCKET") held for the bar, with four small beat dots. Pulses fade after bar 1 so timing stays in the ear.
- **Moved:** gauge fitted to width, with a tick at the comparison. **Jam:** giant chord and "next: F".

## Trust
Grading is deterministic: nearest grid note, ±25 ms, score = pocket notes / (expected + extra hits). Simulated hits never yield a number or history. A take holds one source; a real tap during a demo wipes it and takes over. Too few hits, or machine-tight mic hits (click bleed), grade as "didn't hear you". Taps use event timestamps; latency is output + base + calibration. Known limit: calibration can absorb a player's own lean.

## Voice and control
Commands: go, next, again, slower, faster, why, where am I, hang on / wait (pause), stop, soundcheck. Whole phrases, final results only; the coach's own words are ignored for 1.5 s after speaking. Unrecognised speech shows "Didn't catch that". **Between-takes rule:** the recogniser never runs during a graded take. Exceptions: "next" during coach speech (barge-in, desktop) and "stop" during the ungraded jam. Nothing auto-starts: after feedback it waits for go, a tap or your first note. Tap, Space or Esc skip speech; Esc or Stop ends a take uncounted. Coach lines die with their state: an explicit cancellable state machine.

## Readability
Type floor is 28 px at 1080p. Timing hues mean timing only; scores are white; listening is yellow; coach is lavender. Captions sit below the amp, never over a number. Reduced motion: flashes at 25%, no camera move or pulses.

## Mocked
Demo player; path steps beyond today; coach lines are templates over graded numbers. Mic and voice need HTTPS or localhost.

## Path to the real Tauri app
- **Keep:** one imperative three.js canvas and the state machine; React stays out of the frame loop. **Discard:** Web Audio, the worklet, grading and browser speech.
- **Clock:** Rust owns it. Add periodic engine-clock sync and interpolate the playhead.
- **Voice out:** Piper TTS already exists, mixed into the engine stream.
- **Voice in:** treat SpeechRecognition as unusable in Tauri webviews. Use a grammar-constrained keyword spotter (Vosk or sherpa-onnx) with VAD rather than Whisper. A DI input can't hear speech, so voice needs a separate mic stream.
- **De-risk in order:** clock sync with measured visual offset in all three webviews; grading on real instruments through speakers versus headphones; offline keyword spotting; WebGL on WebKitGTK and integrated GPUs; mobile last.
