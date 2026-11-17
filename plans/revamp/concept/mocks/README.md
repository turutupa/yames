# Yames Coach: concept mocks

Open `index.html` from disk. 34 screens, each in desktop and phone (68 frames). Fake data, no audio.
Any button or tab inside a frame opens a tap-through; "Tap through from Today" starts at the home screen.
The 5/10/15/20 buttons on Today rebuild the session.

## Screens

- **A. First run:** Welcome; Pick input; Soundcheck; What do you want to get better at?; Placement test; Placement result
- **B. Today:** First time; Returning; Back after a break
- **C. Session:** Theory exercise running; Mechanics exercise running; Between takes; Take result (Theory); Take result (Mechanics, with the Ramp offer); "I didn't catch enough"; End of session
- **D. Paths:** Paths list; Blues path; Alternate Picking path; Landing on chord tones step; Even sixteenths step
- **E. Progress:** Clean tempo chart and per-skill trends
- **F. Tools:** Tools list; Metronome click drop-out, and result; Ramp up Find my edge, and result; My setlist editing, and running; Jam with typed chords
- **G. Coach:** Why does that note clash, with show me; Why this exercise; What it will not claim
- **H. Settings:** Input, audio, foot pedal, coach voice, coach model

Added beyond the brief: Placement result, Tools list, Metronome result, a second take result and step detail for Mechanics, and "What it will not claim".

## Concept questions the mocks raised

1. **Clean tempo needs a definition.** The mocks use "at least 85% even for 4 bars". Is it per exercise, per path, or one number? Progress shows only sixteenths.
2. **Does evenness work on a microphone?** Mechanics hangs on a timing score at 80+ BPM sixteenths. If detection can't hold up, "I didn't catch enough" becomes the common screen. Worth testing before building the Alternate Picking path.
3. **Tap input and timing.** Does tapping a fretboard earn a mechanics grade at all, or is tap Theory-only?
4. **Who owns time when a tool interrupts a session?** "Ramp this" mid-session either eats the session time or overruns it. The mock says "uses your session time, or adds 2 minutes".
5. **Do setlist runs count?** Should an exercise passed in a setlist or from a step page move the path? The mocks assume yes.
6. **What does Tools feeding Today change?** "Use 92 next session" implies a tool result can reset an exercise tempo. Can it also pass an exercise?
7. **Is Jam silent?** Jam lights the chord tones but never colours your notes green or red. Colouring would be feedback, even with no score. The mocks keep it out.
8. **Swapping out the coach's plan.** "Why this exercise?" offers a swap. How far can a player override before the session stops being the coach's, and does a skipped exercise come back?
9. **Pedal mapping.** One tap does the big action, so a stray stomp skips ahead. Does tap need a confirm, or is an "undo" by voice enough?
10. **Voice with a band playing.** Between takes the band is quiet, so "listening" is plausible, but stopping a take by voice during the band is not proven.
11. **Break length.** The mock eases in after 12 days. What counts as a break, and how much tempo drops?
12. **Two paths in 5 minutes.** A short session splits very thinly (3 + 2 min). Should it pick one instead?
13. **Model off.** If there's no local model and no key, does the coach still explain from fixed text? The mocks assume grading never needs a model.
