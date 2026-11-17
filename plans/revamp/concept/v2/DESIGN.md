# Yames v2: the coach is the interface

## The experience
Tap once, pick up your instrument, and you're on stage. A coach's voice runs a 15-minute session while the stage reshapes for each exercise. At its centre is an upright ring, like a drumhead: one trip around is one bar. Your notes land on it, and the truss lights pulse on each beat in your timing colour. There is nothing to navigate. Between takes you talk to the coach, and it answers out loud.

## Theme: a stage at night
The scene is a truss with six lights, a warm floor and haze. There is no space imagery. Musicians already read a stage, and the truss doubles as a setlist for "where am I". Every light carries information:
- **Takes:** the centre beams flash on every beat and the outer beams on the downbeat. Each flash is coloured by the beat just played: green for pocket, blue for early, orange for late, pink for missed.
- **Jam:** the beams split by part. Left follows the bass eighths, centre the drums, right the keys, in the chord's colour.
- **Between takes:** a yellow spotlight on the coach lamp means listening. Pink means the coach is talking.

## Session script
1. Greeting: the plan and the commands.
2. **New step, Sixteenths (76 BPM):** an intro, then a count-in and 3 takes. After each take, spoken feedback (percentage in the pocket, rushing or dragging in ms, misses), then a 5-second listening window, then the next take starts automatically.
3. **The number that moved:** "in the pocket 75%, up from 54%" on a gauge, with a tick at last time's score.
4. **Review, Pocket (eighths at 88 BPM):** the same loop.
5. **Free jam:** Am–F–C–G at 92 BPM with drums, bass and keys. Not graded, but the pocket is reported "for the record".
6. **Wrap-up:** both numbers and what's next. "Again" starts a new session.

## The scene per phase
- **Count-in:** a giant 1-2-3-4 and a sweeping playhead.
- **Take:** a hit lands at its note's angle: **on the ring** means pocket (±25 ms), **inside** early, **outside** late,. The centre shows the beat number, coloured by that beat's timing, with ms underneath. Finished bars slide upstage as fading rings, showing consistency. A meter shows the running pocket percentage.
- **Moved:** a gauge, a big percentage, and the six lights filling as a meter.
- **Where am I:** the camera pulls back to the whole truss and the lights come on in turn. Done steps show green with their score. "You are here" is yellow and swings onto your ring. Future steps glow faintly. About 6 seconds, then back.

## Voice commands
`again`, `slower` / `faster` (±6 BPM, redo the take), `next` (skip the wait), `why`, `where am I`, and `stop` (pause; "go" resumes).

**Between-takes rule:** recognition runs only in the listening window, after the coach stops speaking. It never runs during a take (the mic hears the instrument) or while the coach talks (echo). **Fallback:** if recognition is missing, denied or failing, the label reads "YOUR TURN", the chips stay, and tapping anywhere means "next".

## Readability rules
- One giant element inside the ring, sized from its on-screen radius. Captions are at least 20 px.
- Timing is shown three ways (position, colour, word), for colour-blind players and from 2 m away.
- During a take only the beat and your hits move. The coach never talks over playing.
- `prefers-reduced-motion`: camera cuts, no hit pops, softer pulses.

## What's mocked
- **Hits are simulated** by default: a labelled player that improves each take, audible as a muted pluck. Tapping or Space gives real tap hits. With mic permission, an AudioWorklet energy-spike onset detector supplies real hits. It is uncalibrated, and click bleed counts as hits, so use headphones.
- **Baselines** (Pocket 71, Sixteenths 54) are seeded on first run, then stored in localStorage.
- Coach lines are templates over graded numbers. Grading is deterministic: nearest grid note, ±25 ms.
- Mic and recognition need HTTPS or localhost. Over LAN HTTP on a phone you get simulated hits plus chips.

## Path to the real Tauri app
- **Grading:** use Yames' existing Rust timing analyser, with latency calibration.
- **Voice in:** SpeechRecognition is unreliable in Tauri webviews. Run a local Whisper-class model in Rust (whisper.cpp or whisper-rs, base.en) with a small command grammar and VAD, gated by the between-takes rule, and send commands to the UI as Tauri events.
- **Voice out:** OS TTS (`tts` crate) or a local neural TTS, keeping the captions.
- **Coach text:** templates over analyser output. A local LLM may rephrase but never produces numbers.
