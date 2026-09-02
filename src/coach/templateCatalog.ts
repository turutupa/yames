/**
 * C5 — Seeded Template Catalog.
 *
 * The plan calls for ~5 instruments × ~30 scenarios × ~3 severities =
 * ~450 slots with 3–5 variants each (≈ 1800 lines of authored
 * content). The full catalog is content-design work: each phrasing
 * needs an instrument-appropriate vocabulary check (drums never says
 * "downstroke", guitar never says "ghost note on snare") and a
 * musician's ear for severity grading.
 *
 * What ships here:
 *   - The `generic` vocabulary covers every gatekeeper scenario at
 *     all three severities, so the system always has a fallback.
 *   - All five instrument vocabularies (`drums`, `electric-guitar`,
 *     `acoustic-guitar`, `bass`, `piano`) cover the nine highest-
 *     frequency scenarios with instrument-specific overrides:
 *     accuracy_drop, rushing_trend, dragging_trend, personal_best_streak,
 *     new_band_locked, recovery, fatigue, tempo_milestone, check_in.
 *   - Remaining scenarios (`low_confidence`, `boundary_signal_a`,
 *     `boundary_signal_b`) fall through to the `generic` catalog,
 *     which is intentional — those scenarios are about the
 *     metronome/signal layer, not the instrument, so a single
 *     consistent voice across instruments is the right call.
 *
 * Authoring guidance (from the plan's "voice rules"):
 *   - Coach voice, not chatbot voice.
 *   - Specific metrics, not generic encouragement.
 *   - Instrument-appropriate vocabulary baked in at authoring time.
 *   - Severity-graded: encouragement vs. neutral observation vs.
 *     technical correction. Same observation, different tone.
 */

import type { ScenarioCatalog, TemplateCatalog } from "./templates";

// ---------------------------------------------------------------------------
// Generic (always available — fallback path)
// ---------------------------------------------------------------------------

const GENERIC: ScenarioCatalog = {
  session_start_cold: {
    neutral: [
      "Hey — play when you're ready and I'll start tracking your timing.",
      "Good to have you. Start when you feel warm.",
      "Ready when you are. I'll start listening as soon as you play.",
      "Take your time getting set up — I'll pick up your timing from the first note.",
      "No rush. Start when you're settled and we'll go from there.",
      "Hit play whenever you're ready. I'll catch you from the first beat.",
      "Set up, settle in, then start playing whenever.",
      "Whenever you're ready — I'm listening.",
    ],
  },
  session_start_returning: {
    neutral: [
      "Welcome back. Last time: {lastScore} at {lastBpm} BPM. Let's build on that.",
      "Good to see you again. You hit {lastScore} at {lastBpm} BPM last session.",
      "Back at it. You were at {lastScore} / {lastBpm} BPM last time — let's keep climbing.",
      "Welcome back — {lastScore} at {lastBpm} BPM last session. Ready when you are.",
      "Last session: {lastScore} at {lastBpm} BPM. Let's pick up where you left off.",
      "Back again. You finished at {lastScore} at {lastBpm} BPM — good baseline.",
      "Welcome back. {lastScore} at {lastBpm} BPM last time. Let's see what today brings.",
      "Good to have you back. Last time you hit {lastScore} at {lastBpm} BPM.",
    ],
  },
  accuracy_drop: {
    encouragement: [
      "A few misses crept in — ease up, breathe, then come back to it.",
      "You were locked in, then a wobble. Reset on the next strong beat.",
      "Quick dip. Slow the pulse in your head and pick it up again.",
      "Small slip — no big deal. Find the click again on the next bar.",
      "Lost the thread for a second. Catch the next downbeat clean.",
      "Tiny stumble. Take a breath and ride the next click in.",
      "Cool — just feel the next beat land before you play.",
      "A little drift. Let the metronome lead you back in.",
    ],
    neutral: [
      "Hit rate's slipped a bit — reset on the next bar.",
      "Accuracy is sliding. Let it settle on the next downbeat.",
      "Things are slipping — slow it in your head, then start fresh.",
      "Some misses stacking up. Find a clean bar, then keep going.",
      "Quality's drifting. Lock in with the click for one full bar.",
      "Misses creeping up — take a breath, hear the click, then play.",
      "Drift showing. Sit one bar quiet with the click before coming back.",
      "Hits dropping off. Wait for the strong beat and re-set.",
    ],
    correction: [
      "The slip is sustained — try dialing the tempo down a few BPM.",
      "Hits are scattering. Slow down and rebuild from a clean bar.",
      "Get one clean bar, then climb again.",
      "Pattern's coming apart — pause, count yourself in slow, then play.",
      "Stop, count a full bar with the click, then come back in.",
      "Drop the tempo five BPM. Get it clean, then bring it back up.",
      "Pull back. Get one solid bar against the click before adding speed.",
      "Reset hard — silence one bar, count it, then start fresh.",
    ],
  },
  rushing_trend: {
    encouragement: [
      "Sitting just ahead of the click — breathe and ride it.",
      "Slight rush creeping in. Plant your foot, let the metronome lead.",
      "A little early — settle into the next click.",
      "You're a hair ahead. Wait for the click instead of chasing it.",
      "Just a tiny bit hot. Relax your hands and let the click pull you.",
      "Pulse is creeping up. Take a breath and let the next click meet you.",
      "Edge of rushing. Lean back into the seat and ride the click.",
      "A touch early. Hear the click first, then play.",
    ],
    neutral: [
      "Trending a touch early — try riding the back of the beat.",
      "You're nudging ahead of the click — let it come to you.",
      "Drifting early. Sit deeper into each click.",
      "Each note's landing a little early. Wait for the click.",
      "You're leading the metronome. Let it lead you instead.",
      "Pace is creeping up. Match the click, don't push it.",
      "Notes are arriving too soon. Hold each one a beat longer in your head.",
      "Drift forward. Take a breath and let the click set the pace.",
    ],
    correction: [
      "Still leaning early — count the in-betweens and land each note right on the click.",
      "The rush is sticking. Slow down, count the offbeat between each click.",
      "Pause, count yourself in slow, then start playing again.",
      "Drop a few BPM. Get the click to lead before bringing it back up.",
      "Hands are racing. Stop, take a breath, start on the next strong beat.",
      "Reset — silence one bar, hear the click, then come in on beat 1.",
      "Push the tempo down five BPM until you can sit ON the click.",
      "Stop trying to drive the metronome. Let it drive you for one bar.",
    ],
  },
  dragging_trend: {
    encouragement: [
      "Sitting just behind the click — lift the tempo back under your fingers.",
      "Slight drag. Breathe and push back into the beat.",
      "A little behind — lean forward, you're close.",
      "You're a hair late. Lift your hands; meet the click on top.",
      "Just barely lagging. Push gently — the click will meet you.",
      "Drift back is small. Lean in and ride the front of each click.",
      "Touch late. Imagine playing slightly ahead and you'll land in time.",
      "Notes are arriving just after the click. Push a little.",
    ],
    neutral: [
      "Trending a touch late — try playing slightly ahead of the click.",
      "You're sitting behind the beat — push into each one.",
      "Drifting late. Reach for the front of each click.",
      "Each note's landing just after the click. Meet it head-on instead.",
      "The metronome's leaving you behind. Step into each click.",
      "Pace is sagging. Lift the hands and play on top of the click.",
      "Notes arriving late. Aim for the front edge of each beat.",
      "Drag is showing. Imagine the click is a half-step earlier than you think.",
    ],
    correction: [
      "Still hanging back — play with the click, don't wait for it.",
      "The drag is sticking. Push the tempo with your fingers.",
      "Stop, reset, and start fresh on beat 1.",
      "Drop the tempo a bit and lock in. The drag will clear once it feels easy.",
      "Pause one bar. Hear the click, then come in right on top of beat 1.",
      "Reset — count yourself in slow and play with more lift.",
      "Slow it down five BPM and aim for the front of every click.",
      "Stop, take a breath, then come in pushing slightly forward.",
    ],
  },
  personal_best_streak: {
    // v0.11: per user feedback, drop the numeric streak count from the
    // in-play affirmations — a glanceable "nice" lands better than a
    // figure the player has to register mid-bar. The numeric detail
    // still surfaces in the post-segment mini-report card.
    encouragement: [
      "Locked in — keep it going.",
      "Streak's going. Nice.",
      "On a run — stay there.",
      "Yes. Don't change anything.",
      "Riding it clean. Stay.",
      "That's the pocket — hold on to it.",
      "Beautiful. Just keep doing that.",
      "Eyes closed, keep going.",
    ],
    neutral: [
      "New session best — locked in.",
      "Cleanest stretch so far. Hold it.",
      "Best run yet today. Don't change a thing.",
      "Longest clean run of the session. Keep it.",
      "Top streak of today. Stay there.",
      "Tightest stretch yet — hold this feel.",
      "Best timing of the session right here.",
      "This is your session high — sit in it.",
    ],
    correction: [
      "Locked in — hold tempo, don't push faster yet.",
      "Streak's clean. Stay at this BPM until it's automatic.",
      "Exactly where you want to live for a minute.",
      "Don't speed up yet. Let this tempo settle into the hands.",
      "Stay flat — no climbing yet. Let it become muscle memory.",
      "Hold this for another minute before adding speed.",
      "Park here. Speed comes after this gets boring.",
      "Resist the urge to push. Burn this tempo in first.",
    ],
  },
  new_band_locked: {
    encouragement: [
      "{bpmLow} BPM — yours now.",
      "Locked at {bpmLow} BPM. Nice.",
      "Held this tempo clean — new ceiling.",
      "{bpmLow} BPM feels easy now. That's progress.",
      "You own {bpmLow} BPM. Don't lose it.",
      "Steady at {bpmLow}. That's the new floor.",
      "Clean at {bpmLow} BPM — keep it warm.",
      "{bpmLow} BPM — solid. Stay here a bit longer.",
    ],
    neutral: [
      "Sustained clean play at {bpmLow}–{bpmHigh} BPM for a minute.",
      "{bpmLow}–{bpmHigh} BPM band: locked in.",
      "New BPM band owned: {bpmLow}–{bpmHigh}.",
      "Clean for a full minute at {bpmLow}–{bpmHigh} BPM.",
      "{bpmLow}–{bpmHigh} BPM held steady. That's the new baseline.",
      "Locked into {bpmLow}–{bpmHigh} BPM for a long stretch.",
      "Held the {bpmLow}–{bpmHigh} band clean — that's a real win.",
      "Pocket sustained at {bpmLow}–{bpmHigh} BPM. Don't lose it now.",
    ],
    correction: [
      "{bpmLow}–{bpmHigh} is stable. Stay here, then push a touch.",
      "Held {bpmLow}–{bpmHigh} clean. Ready to climb when you are.",
      "{bpmLow}–{bpmHigh} feels owned. Next session, start here.",
      "{bpmLow}–{bpmHigh} BPM is locked in. Don't speed up yet.",
      "You can climb from {bpmLow}–{bpmHigh}, but earn it — two more clean minutes first.",
      "{bpmLow}–{bpmHigh} BPM is the new floor. Don't drop back below it.",
      "Stable at {bpmLow}–{bpmHigh}. Move up only when it feels boring.",
      "{bpmLow}–{bpmHigh} BPM owned. Build a couple of minutes here before climbing.",
    ],
  },
  check_in: {
    encouragement: [
      "You've been deep in it. Anything you want to focus on next?",
      "Five-plus minutes locked in. Want me to call out anything specific?",
      "Long stretch — pause if you want, I'm here.",
      "Solid run going. Want me to listen for anything in particular?",
      "Been in this a while. Take a breath if you need one.",
      "Quiet so far. Tell me what you're working on and I'll watch for it.",
      "Nothing to call out yet. What do you want me to listen for?",
      "Steady pocket. Keep going, or switch gears if you're ready.",
    ],
    neutral: [
      "Five minutes in, nothing to flag. Solid pocket. Keep going or switch focus?",
      "Quiet stretch. Tell me what you're working on.",
      "Long uninterrupted run. Anything you want feedback on?",
      "Five minutes deep. No issues to call out — keep going.",
      "Steady session. Want a different angle, or stay the course?",
      "Long run with no slips. What's next?",
      "You've been in the pocket. Take stock and pick a next focus.",
      "Quiet session so far. Pick a target if you want sharper feedback.",
    ],
    correction: [
      "Heads up — you've been in this a while. Take 10 if your hands need it.",
      "Five-plus minutes continuous. Check in with your body before you push more.",
      "Sustained session — stretch your fingers, then come back.",
      "Hands tired? Take a 60-second pause before the next pass.",
      "Long stretch — check the wrists and shoulders before continuing.",
      "Time for a quick break. Cold hands play sloppy.",
      "Pause and stretch. Two minutes off keeps the next twenty solid.",
      "Sustained run — give the hands a rest before pushing further.",
    ],
  },
  fatigue: {
    encouragement: [
      "Accuracy's been sliding the last few minutes. Take a beat.",
      "Hands tightening up? Quick stretch — come back fresh.",
      "Quality's drifting. Pause, breathe, return.",
      "Hands working harder than they should. Brief rest, then back in.",
      "You've been going a while — drop the instrument for 60 seconds.",
      "Body's getting heavier than the music. Quick break.",
      "Fingers stiffening up? Shake them out, then come back.",
      "Time for a short pause — fresh hands play cleaner.",
    ],
    neutral: [
      "Accuracy declined over the last 3 minutes at constant BPM — likely fatigue.",
      "Score trending down without tempo change. Take a rest.",
      "Sustained accuracy drop at the same BPM — call it a rest cycle.",
      "Same tempo, falling accuracy. Hands are getting tired.",
      "Quality's slipping but the tempo hasn't changed — that's fatigue.",
      "Misses climbing while the click stays the same. Time for a pause.",
      "Three-minute slide at one tempo. Rest the hands.",
      "Steady BPM, sliding accuracy — your hands are telling you something.",
    ],
    correction: [
      "Fatigue showing — stop now, 90 seconds off, then come back.",
      "You're past your peak window. Rest before quality drops further.",
      "Take the rest. Tired playing teaches the hands sloppy habits.",
      "Stop, stand up, walk around for a minute. Then come back.",
      "Quality's been dropping for minutes. Real rest — 90 seconds minimum.",
      "Hands are done for now. Pause, shake them out, hydrate.",
      "Pushing past tired locks in mistakes. Stop and recover.",
      "Set the instrument down. Two minutes off, then re-evaluate.",
    ],
  },
  recovery: {
    encouragement: [
      "Nice save — stay here.",
      "Pulled it back. Hold it.",
      "Recovered — keep this exact feel.",
      "Got it back. Sit in this for a minute.",
      "Back from the dip. Don't change anything now.",
      "You felt it slip and brought it back. That's the skill.",
      "Solid recovery. Stay loose, stay here.",
      "Caught it before it ran away. Hold this feel.",
    ],
    neutral: [
      "Back to clean after the dip. Keep this pace.",
      "Score's back up — hold it.",
      "Recovery confirmed — accuracy steady again.",
      "Clean again after the slip. Don't change anything.",
      "Accuracy's back where it was. Hold steady.",
      "Stabilized after the dip. Keep this tempo.",
      "You closed the gap. Stay at this BPM.",
      "Quality recovered. Park here a minute.",
    ],
    correction: [
      "Recovery's holding. Don't push the tempo yet.",
      "Back from the dip — stay flat, no climbing yet.",
      "You salvaged it. Hold this exact BPM for a full minute.",
      "Don't reward the recovery with a tempo bump. Sit here.",
      "Back on track. Resist the urge to speed up.",
      "Recovery is fresh — let it become habit before pushing.",
      "Stay at this BPM. Build a couple of clean bars before changing anything.",
      "You came back from the slip. Don't undo it by climbing too soon.",
    ],
  },
  recovery_confirmed: {
    encouragement: [
      "Got it back.",
      "Nice save — hold it.",
      "Back and clean.",
      "Pulled it back. Stay here.",
    ],
    neutral: [
      "Accuracy's back. Keep this feel.",
      "Back to clean after the dip.",
      "Recovery confirmed. Hold steady.",
    ],
    correction: [
      "Recovery's holding — don't push the tempo yet.",
      "Back on track. Resist the urge to climb.",
    ],
  },
  tempo_milestone: {
    encouragement: [
      "{bpmLow} BPM — new gear.",
      "Past {bpmLow} BPM, clean.",
      "{bpmLow}+ and holding. Nice.",
      "First time at {bpmLow} BPM today. Feels good.",
      "Crossed {bpmLow} clean. Stay loose.",
      "{bpmLow} BPM is on the menu now.",
      "You're in {bpmLow}-territory. Hold it lightly.",
      "Welcome to {bpmLow} BPM. Make it feel easy.",
    ],
    neutral: [
      "Crossed the {bpmLow}-BPM mark upward.",
      "Tempo milestone: now in the {bpmLow}-{bpmHigh} band.",
      "{bpmLow} BPM and climbing.",
      "{bpmLow} BPM reached. New band: {bpmLow}-{bpmHigh}.",
      "Moved into the {bpmLow}-{bpmHigh} BPM range.",
      "Climbing — {bpmLow} BPM is the new working tempo.",
      "{bpmLow} BPM hit. See if it sticks.",
      "Tempo bumped into the {bpmLow}-{bpmHigh} zone.",
    ],
    correction: [
      "At {bpmLow} BPM — stay here until clean, don't push higher yet.",
      "{bpmLow} BPM milestone. Stabilise before pushing.",
      "New band: {bpmLow}-{bpmHigh}. Make sure this one sticks before climbing.",
      "{bpmLow} BPM is brand new — don't speed up until it feels boring.",
      "Earn {bpmLow} BPM before chasing the next mark. Hold it.",
      "Park at {bpmLow} BPM. The next jump comes after a clean minute here.",
      "Hit {bpmLow} BPM — now lock it in before the next ramp.",
      "{bpmLow} BPM is fresh. Stay flat and let the hands catch up.",
    ],
  },
  low_confidence: {
    encouragement: [
      "Signal's a bit murky on my end — keep playing, I'll catch up.",
      "Audio's harder to read here, but you sound good.",
      "I'm having a slightly tough time reading you — keep going.",
      "Hard to hear you clean from here — don't let that distract you.",
      "Mic's catching some noise, but you're playing fine.",
      "Picking up some haze on the signal — keep going, I'm listening.",
      "My read on the audio is fuzzy. You sound on the beat though.",
      "Signal's a touch noisy. Trust your hands.",
    ],
    neutral: [
      "Detection confidence has been lower for the last 30s — readings may be noisier than usual.",
      "Lower onset confidence — feedback might be imprecise this stretch.",
      "Audio signal less clear; metrics slightly less reliable.",
      "Read quality's down a bit. Numbers may swing more than usual.",
      "Mic input's harder to parse — accuracy reading may drift.",
      "Background noise creeping in; feedback might lag a touch.",
      "Lower signal clarity for the last half-minute.",
      "Audio's harder to read — take the metrics with a small grain of salt.",
    ],
    correction: [
      "Hard to read your signal — check your input level or mic position.",
      "Signal's hard to read. Bump your input gain or move closer to the mic.",
      "Note detection is uncertain — the room might be too noisy.",
      "My read on you is unreliable. Move closer to the mic if you can.",
      "Input level may be too low. Check the meter before continuing.",
      "Hard to tell hits from noise. Mute anything in the room and try again.",
      "Signal's dropping out. Plug-in or USB-mic — check the connection.",
      "Audio quality's poor enough that scoring may be off. Fix the input first.",
    ],
  },
  boundary_signal_a: {
    encouragement: [
      "{change}. Fresh segment — take a beat, find the feel.",
      "{change} — reset your ear and ride this one out.",
      "Settings shifted: {change}. Let's see how this new shape feels.",
      "{change}. New segment, fresh start.",
      "{change} — clean slate, new score.",
      "{change}. Take a breath and lock in to the new feel.",
      "{change}. Old segment wrapped — this one's on its own.",
      "{change}. Reset your ear and ease into the change.",
    ],
    neutral: [
      "{change}. New segment opens here.",
      "Boundary marker — {change}. Next stretch is scored on its own.",
      "Settings change: {change}. Closing previous segment.",
      "{change}. Score for the next stretch starts now.",
      "{change} — the previous segment is closed and counted.",
      "Configuration shift: {change}. Fresh segment.",
      "{change}. New segment, new metrics.",
      "{change}. Boundary crossed — score resets.",
    ],
    correction: [
      "{change}. Get the new setup feeling natural before you push.",
      "{change} — old segment closed. Make sure this feels right before adding complexity.",
      "Settings changed mid-segment: {change}. The new config is scored separately.",
      "{change}. Take it slow on the new setup — don't carry over old habits.",
      "{change}. Bed the new feel in before adding speed.",
      "{change} — reset and treat the next stretch like a warmup.",
      "{change}. Play it simple until the new config feels familiar.",
      "{change}. Don't push the new segment yet — get clean first.",
    ],
  },
  stamina: {
    neutral: [
      "Score's dropping past the {staminaMinutes}-minute mark again — take 30 seconds, then come back at the same BPM.",
      "Past the {staminaMinutes}-minute mark your accuracy tends to slide. Brief rest, then back in.",
      "You tend to fade around minute {staminaMinutes}. Take a break and return fresh.",
      "Stamina wall around minute {staminaMinutes} — a short rest now saves quality later.",
    ],
  },
  ramp_complete: {
    neutral: [
      "Ramp done — {startBpm} to {endBpm}. You made it.",
      "Target reached: {endBpm} BPM. You climbed from {startBpm}.",
      "Ramp finished. {startBpm} → {endBpm} BPM complete.",
      "You held it to {endBpm} BPM. Ramp from {startBpm} done.",
    ],
  },
  pace_coaching: {
    neutral: [
      "Fourth time at {bpm} — the ceiling's real. Two sessions at {suggestedBpm} to consolidate, then push again.",
      "You've hit {bpm} BPM {attemptCount} times and it's not sticking. Drop to {suggestedBpm} for a week, build it solid.",
      "{attemptCount} attempts at {bpm} BPM. Ceiling work: two sessions at {suggestedBpm}, then revisit.",
      "Ceiling at {bpm} BPM — {attemptCount} attempts confirms it. Park at {suggestedBpm} and let it settle.",
    ],
  },
  grid_lost: {
    neutral: [
      "Grid correlation dropped — are you still playing to the click?",
      "Lost the grid there. Intentional fill, or drifting off the click?",
      "Correlation with the grid just dropped off. Still with the metronome?",
      "Looks like the groove parted ways with the click. Fill or free?",
    ],
  },
  bias_only: {
    encouragement: [
      "Very consistent timing — just {biasMs}ms {direction}. Nudge everything {correctionDirection} to sit on the beat.",
      "Great control — just a {biasMs}ms lean {direction}. A small shift {correctionDirection} will center it.",
    ],
    neutral: [
      "You're landing {biasMs}ms {direction} the beat — very consistent, just shifted. Try moving everything {correctionDirection}.",
      "Tight and consistent, but {biasMs}ms {direction} the click. Shift your attack {correctionDirection} to center it.",
      "Your timing scatter is low, but the whole pattern sits {biasMs}ms {direction}. Nudge {correctionDirection}.",
      "Low jitter, but offset by {biasMs}ms {direction}. That's a lean — adjust {correctionDirection} to land on the beat.",
    ],
    correction: [
      "Consistent {biasMs}ms offset {direction} — not random, just a lean. Shift everything {correctionDirection}.",
      "Every hit lands {biasMs}ms {direction}. That's a system bias, not jitter. Correct {correctionDirection}.",
    ],
  },
  boundary_signal_b: {
    encouragement: [
      "Nice segment — {score}% at {bpm} BPM. Take a beat.",
      "{score}% at {bpm} BPM — solid bookend.",
      "Wrapped that one at {score}% / {bpm} BPM. Good pause point.",
      "{score}% at {bpm} BPM closes that out — good work.",
      "Segment done — {score}% at {bpm} BPM. Nice.",
      "Quiet pause closed it: {score}% at {bpm} BPM.",
      "Clean wrap — {score}% at {bpm} BPM.",
      "{score}% at {bpm} BPM. Take a breather.",
    ],
    neutral: [
      "Segment ended after silence — {score}% at {bpm} BPM.",
      "Activity gap closed segment: {score}% scored.",
      "Quiet stretch — segment closed at {score}%.",
      "{score}% at {bpm} BPM — segment closed by the pause.",
      "Pause ended the segment: {score}%.",
      "Segment over — {score}% at {bpm} BPM logged.",
      "Closed segment at {score}% / {bpm} BPM.",
      "{score}% at {bpm} BPM saved. Take stock if you want.",
    ],
    correction: [
      "Segment ended at {score}% — review before the next pass.",
      "{score}% closed the segment. Check what slipped before the next attempt.",
      "Pause noted — {score}%. Replay the segment summary before continuing.",
      "{score}% at {bpm} BPM — worth a quick look at the breakdown.",
      "Segment closed below where you wanted: {score}%. Diagnose before pushing.",
      "{score}% at {bpm} BPM — slow it down on the next pass.",
      "Wrapped at {score}%. Dial in what slipped before another run.",
      "{score}% at {bpm} BPM. Read the segment summary, then try again.",
    ],
  },
  muddy_hits: {
    neutral: [
      "You're landing every beat but the signal is soft — try a sharper attack.",
      "Beats are all there, but the transient is weak. Hit with more intention.",
      "Coverage looks good but the hits are quiet. More force on the attack.",
      "You're playing through the click, just softly. Try to make more contact.",
    ],
  },
  grid_discontinuity: {
    neutral: [
      "You went off the grid — try locking back to the click before the next phrase.",
      "The beat wandered from the click. Reset and find the pulse before you continue.",
      "Grid tracking dropped — take a beat, then re-enter on the downbeat.",
      "Drifted from the click there. Stop, breathe, and lock back in.",
    ],
  },
  low_completeness: {
    neutral: [
      "You're hitting about half the expected beats — try to stay engaged for every one.",
      "Coverage is low — make sure you're landing each beat, not just the ones that feel natural.",
      "Around half the beats are going unplayed. Focus on completing the full pattern.",
      "Beat coverage is low. Try counting aloud to make sure you're not skipping any.",
    ],
  },
  ic_spacing_drift: {
    neutral: [
      "Your beat placement looks good — but the space between notes keeps wandering. Try counting the subdivisions out loud as you play.",
      "On the beat consistently, but note spacing is uneven. Tap your foot and count subdivisions as you go.",
      "The beat timing is there — the gap between notes is shifting though. Count eighth notes (or sixteenths) out loud to lock the spacing.",
      "Placement is solid, spacing is drifting. Try slowing down until the gaps feel even, then speed back up.",
    ],
  },
  ic_placement_drift: {
    neutral: [
      "Note spacing is even — but you're landing off the beat. Anticipate each click by a hair and land right on it.",
      "Even spacing, but the notes themselves are shifted from the grid. Focus on locking the first note of each group to the beat.",
      "The rhythm between your notes is consistent — work on where they land relative to the click. Try playing just slightly ahead of where you expect the beat.",
      "Good spacing feel. Now bring the whole phrase onto the grid — aim for the center of each beat.",
    ],
  },
  ic_both_locked: {
    neutral: [
      "Beat placement and note spacing are both locked in. That's the feel right there.",
      "Spacing and placement both on point. Clean session.",
      "Both dimensions solid — you're playing exactly where you intend to be.",
      "Timing is dialed in across the board. That's what consistent practice sounds like.",
    ],
  },
  // T07 — adaptive drill narration. The engine has ALREADY moved the
  // tempo by the time these are drawn, so the copy reports the move as
  // a fact and never asks or offers. `{bpm}` is the new tempo,
  // `{accuracyPct}` the score that earned it.
  drill_step_up: {
    neutral: [
      "{accuracyPct}% — tempo up to {bpm} BPM.",
      "Clean round at {accuracyPct}%. Moving you up to {bpm} BPM.",
      "That earned it: {accuracyPct}%. Now at {bpm} BPM.",
      "{accuracyPct}% clears the bar — {bpm} BPM from here.",
      "Solid at {accuracyPct}%. Stepping up to {bpm} BPM.",
      "Nice round — {accuracyPct}%. {bpm} BPM next.",
      "Up to {bpm} BPM. You held {accuracyPct}% last round.",
      "{accuracyPct}% says you're ready. {bpm} BPM.",
    ],
  },
  drill_step_down: {
    neutral: [
      "{accuracyPct}% — easing back to {bpm} BPM.",
      "That round slipped to {accuracyPct}%. Dropping to {bpm} BPM.",
      "Backing off to {bpm} BPM — {accuracyPct}% last round.",
      "{accuracyPct}%. Let's rebuild it at {bpm} BPM.",
      "Pulling back to {bpm} BPM after {accuracyPct}%.",
      "{accuracyPct}% is under the bar — {bpm} BPM for the next round.",
      "Down to {bpm} BPM. Get it clean before we climb again.",
      "Easing to {bpm} BPM; {accuracyPct}% needs firmer ground.",
    ],
  },
} as const;

// ---------------------------------------------------------------------------
// Instrument-specific overlays (cover the highest-impact scenarios)
// ---------------------------------------------------------------------------

const DRUMS: ScenarioCatalog = {
  session_start_cold: {
    neutral: [
      "Ready when you are. I'll start tracking the kick from your first hit.",
      "Settle in and start whenever — I'll catch the timing from the first stroke.",
      "Take your time warming up the hands. I'll start listening when you play.",
      "Good to have you. Start when the sticks feel ready.",
      "Whenever you're set — hit the kit and I'll start picking up your timing.",
      "No rush. Get loose, then play when you're ready.",
      "Ready when you are. I'll track from the first beat.",
      "Set up whenever — I'm listening from your first stroke.",
    ],
  },
  session_start_returning: {
    neutral: [
      "Welcome back. Last session: {lastScore} at {lastBpm} BPM. Let's see if the groove comes back quick.",
      "Good to see you. You hit {lastScore} at {lastBpm} BPM last time — kick's got a baseline now.",
      "Back at the kit. {lastScore} at {lastBpm} BPM last session. Let's build on it.",
      "Welcome back — {lastScore} / {lastBpm} BPM last time. Ready when you are.",
      "Last session on the kit: {lastScore} at {lastBpm} BPM. Let's keep that going.",
      "Back at it. You were at {lastScore} / {lastBpm} BPM last time — solid starting point.",
      "Welcome back. {lastScore} at {lastBpm} BPM was the line last time. Let's hit it.",
      "Good to have you back. {lastScore} at {lastBpm} BPM last session — let's go.",
    ],
  },
  accuracy_drop: {
    correction: [
      "Kick is drifting. Lock the right foot to the click before the snare.",
      "Hits are scattering. Bring the kick and snare back to the grid.",
      "Stop, count a bar, restart with just the foot.",
      "Pull back to kick-and-hat only for a bar, then add the snare.",
      "Slow down. Play just the foot on every click for four bars.",
      "Pattern's falling apart. Drop everything but the kick, then layer back in.",
      "Stop the whole kit. One bar of just the click, then come in with the foot.",
      "Hands and feet are out of sync. Reset on the next downbeat.",
    ],
  },
  rushing_trend: {
    correction: [
      "Right hand is leading the kick — lay it back.",
      "Snare's rushing. Count the in-between 16ths and place beat 2 right on the click.",
      "You're driving the click. Slow the right hand; the foot will follow.",
      "Hi-hat's pushing ahead. Relax the right hand and let the click set the pace.",
      "Snare's racing. Ease into the groove and let it breathe.",
      "Drop a few BPM. Get the kick-snare to sit ON the click before bringing it back up.",
      "Sticks are leading. Hold them back — let the metronome arrive first.",
      "Pause the kit. Tap the click with just the foot for a bar, then bring the hands.",
    ],
  },
  dragging_trend: {
    correction: [
      "Right hand is lagging the kick — lean into the hi-hat.",
      "Snare's dragging. Lead beats 2 and 4 a touch, don't wait for the click.",
      "Push the hi-hat ahead; the kick should sit ON the click, not after.",
      "Stick attack's heavy. Lift earlier — meet the click on top.",
      "Backbeat's late. Push beats 2 and 4 forward.",
      "Hi-hat's behind. Come in earlier and play with more bounce.",
      "Drop the tempo and play with more lift. The drag clears when it feels easy.",
      "Sticks landing late. Imagine the click is a hair earlier than it is.",
    ],
  },
  personal_best_streak: {
    encouragement: [
      "Kick-snare locked.",
      "Pocket. Stay.",
      "Streak going — stay there.",
      "Limbs talking. Keep it.",
      "Yes. Don't change a thing.",
      "That's the groove. Sit in it.",
      "Tight. Keep going.",
      "Feet and hands synced. Hold.",
    ],
  },
  new_band_locked: {
    neutral: [
      "{bpmLow}–{bpmHigh} BPM band sustained — kick-snare relationship is locked.",
      "Pocket holding at {bpmLow}–{bpmHigh} BPM.",
      "Sustained at {bpmLow}–{bpmHigh} BPM — that's the new floor.",
      "Held {bpmLow}–{bpmHigh} BPM clean. Foot and hands are talking.",
      "Locked groove at {bpmLow}–{bpmHigh} BPM. Don't lose it.",
      "{bpmLow}–{bpmHigh} BPM owned. Stay here.",
      "Kit's behaving at {bpmLow}–{bpmHigh} BPM. New baseline.",
      "Pocket sustained at {bpmLow}–{bpmHigh} BPM for a full minute.",
    ],
  },
  recovery: {
    encouragement: [
      "Groove's back. Stay here.",
      "Kick-snare lock recovered. Hold it.",
      "Limbs talking again — keep it.",
      "You pulled the groove back. Don't change anything.",
      "Pocket recovered. Sit in it.",
      "Foot and hands re-synced. Hold.",
      "Back in the seat. Stay loose.",
      "Caught the slip before it ran away. Nice.",
    ],
  },
  recovery_confirmed: {
    encouragement: [
      "Back in the pocket.",
      "Groove's back. Hold it.",
      "Kick-snare lock — stay there.",
    ],
  },
  fatigue: {
    encouragement: [
      "Hands tightening up? Shake the wrists out and come back.",
      "Quality's drifting — get off the throne for 60 seconds.",
      "Forearms talking to you? Brief pause, then back in.",
      "Sticks feeling heavy? Set them down, stretch, then return.",
      "Grip getting tight? Step away from the kit for a minute.",
      "Wrists locking up — quick shake-out, then continue.",
      "Hands working harder than they should. Brief rest.",
      "Take the sticks down for a moment — let the arms reset.",
    ],
    correction: [
      "Fatigue's showing — stop now, drop the sticks, 90 seconds rest. Tired drumming locks in sloppy timing.",
      "You're past peak — sticks down, walk a lap, then re-evaluate.",
      "Stop before tension takes over. 90 seconds off, hydrate, return.",
      "Wrists are tight. Stop, stretch the forearms, two minutes off.",
      "Push past this and you'll hurt yourself. Real rest now.",
      "Stop drumming. Walk away from the kit for a couple of minutes.",
      "Sticks down. Forearms first, then hands, then return when loose.",
      "Hard stop. Two minutes off and a drink of water before you come back.",
    ],
  },
  tempo_milestone: {
    correction: [
      "At {bpmLow} BPM — stay here until the kick is automatic. Don't push higher yet.",
      "{bpmLow} BPM milestone. Make sure both feet are clean before pushing.",
      "New band: {bpmLow}-{bpmHigh}. Play one stroke per beat to the click before climbing.",
      "{bpmLow} BPM is fresh. Lock the kick on every click before adding fills.",
      "Park at {bpmLow} BPM. The next jump comes after a clean minute.",
      "Hit {bpmLow} BPM — now build a couple of clean bars before going higher.",
      "{bpmLow}-{bpmHigh} BPM is brand new. Stay flat and let the limbs catch up.",
      "Earn {bpmLow} BPM before chasing more. Hold it until it feels easy.",
    ],
  },
  check_in: {
    encouragement: [
      "Long stretch on the kit — anything specific you're working on?",
      "Five-plus minutes in. Want me to call out the kick, the hat, or both?",
      "You've been deep in the pocket. Tell me what you want next.",
      "Solid run on the kit. Anything you want sharper feedback on?",
      "Been at it a while. Want me listening for kick, snare, or limb sync?",
      "Pocket's been steady. What's the focus from here?",
      "Long groove going — pick a target and I'll lean into it.",
      "Five-plus minutes. Tell me where you want the next note of feedback.",
    ],
  },
  ramp_complete: {
    neutral: [
      "Ramp done — {startBpm} to {endBpm} on the kit. Solid climb.",
      "Made it to {endBpm} BPM. Kick held the ramp from {startBpm}.",
      "Ramp finished. {startBpm} → {endBpm} BPM — limbs stayed locked.",
      "Target reached: {endBpm} BPM. You drove it from {startBpm} on the kit.",
    ],
  },
  stamina: {
    neutral: [
      "Around minute {staminaMinutes} your hands tighten up. Drop the BPM 5 ticks and rebuild.",
      "Past the {staminaMinutes}-minute mark the limbs start to drift. Short break, then back at it.",
      "Fatigue shows around minute {staminaMinutes} on the kit. Rest the wrists, then return.",
      "You tend to lose the kick lock around minute {staminaMinutes}. Take a breather.",
    ],
  },
  bias_only: {
    neutral: [
      "{biasMs}ms {direction} the click, very tight. Shift your strike point {correctionDirection}.",
      "Your hits are locked together but sitting {biasMs}ms {direction}. Move the whole groove {correctionDirection}.",
      "Low scatter but consistently {direction} — bring the whole kit's feel {correctionDirection} to center.",
    ],
  },
  pace_coaching: {
    neutral: [
      "Ceiling at {bpm} — {attemptCount} attempts. Two sessions at {suggestedBpm} will lock the groove.",
      "{attemptCount} hits at {bpm} BPM and the kit score's stuck. Drop to {suggestedBpm}, groove it solid, then push.",
    ],
  },
  grid_lost: {
    neutral: [
      "Four beats without the grid — fill incoming or off-click?",
      "Lost the grid there. Planned fill or just drifting?",
    ],
  },
  muddy_hits: {
    neutral: [
      "Every beat landed but the hits feel soft — try punching harder into the kick.",
      "Good coverage but the stroke is light. Drive through the head, don't tap.",
      "Landing every beat, just quietly. Put more weight into the stroke.",
      "Beats are there but the signal is weak — increase velocity on the downstroke.",
    ],
  },
  grid_discontinuity: {
    neutral: [
      "Your kit wandered from the click. Come back in on the downbeat and lock it.",
      "Grid tracking dropped — stop the fill, find the pulse, re-enter clean.",
      "The tempo drifted from the click. Reset your kick pattern and re-lock.",
      "Went off-grid there. Take a rest, then re-enter with your hi-hat on the beat.",
    ],
  },
  low_completeness: {
    neutral: [
      "You're hitting about half the expected beats — try to play every stroke in the pattern.",
      "Coverage is low — make sure your kit lands each beat, not just the accents.",
      "Around half the beats are going unplayed. Focus on completing the full drum pattern.",
      "Beat coverage is low. Count aloud and make sure every hit has its place.",
    ],
  },
  ic_spacing_drift: {
    neutral: [
      "Your hits are landing on the beat, but the gaps between strokes keep shifting. Count the subdivisions out loud — let your mouth set the subdivision grid.",
      "Groove placement is solid, but stroke spacing is uneven. Tap your hi-hat on every subdivision to lock the feel.",
      "On the beat consistently, but the space between hits is wandering. Count sixteenths out loud while you play — let the words anchor the gaps.",
      "Beat placement looks good — spacing between strokes is drifting though. Slow the tempo down until the gaps feel equal, then ramp back up.",
    ],
  },
  ic_placement_drift: {
    neutral: [
      "Your stroke spacing is even — but the hits are landing off the click. Anticipate the beat slightly and drive your kick or snare right on it.",
      "Even spacing between strokes, but the placement relative to the click is drifting. Lock your downbeat kick to the pulse first, then build around it.",
      "The groove feel between strokes is consistent — work on where the whole pattern sits relative to the click. Try playing right on top of the beat, not slightly behind.",
      "Spacing is there. Now anchor the pattern to the grid — aim to land each stroke exactly with the click.",
    ],
  },
  ic_both_locked: {
    neutral: [
      "Stroke placement and spacing between hits are both locked in. That's pocket drumming.",
      "Spacing and beat placement both on point. Solid groove.",
      "Both dimensions dialed — you're playing with real precision right now.",
      "Timing's locked across the board. That's the feel you're building toward.",
    ],
  },
} as const;

const ELECTRIC_GUITAR: ScenarioCatalog = {
  session_start_cold: {
    neutral: [
      "Ready when you are. I'll start tracking from your first pick.",
      "Get warmed up and hit play whenever — I'll start listening.",
      "Tune up, settle in, then play when you're ready.",
      "Good to have you. Start when the picking hand feels loose.",
      "Whenever you're set — play and I'll start catching your timing.",
      "No rush. Get the pick hand loose, then start when ready.",
      "Ready when you are. I'll track from the first note.",
      "Set up whenever — I'm listening from your first pick.",
    ],
  },
  session_start_returning: {
    neutral: [
      "Welcome back. Last session: {lastScore} at {lastBpm} BPM. Let's build on that picking.",
      "Good to see you. You hit {lastScore} at {lastBpm} BPM last time — good foundation.",
      "Back at the guitar. {lastScore} at {lastBpm} BPM last session. Let's push it.",
      "Welcome back — {lastScore} / {lastBpm} BPM last time. Ready when you are.",
      "Last session: {lastScore} at {lastBpm} BPM. Pick up where you left off.",
      "Back at it. {lastScore} at {lastBpm} BPM last time — solid baseline.",
      "Welcome back. {lastScore} at {lastBpm} BPM was the line last session. Let's match it.",
      "Good to have you back. {lastScore} at {lastBpm} BPM last time — let's go.",
    ],
  },
  accuracy_drop: {
    correction: [
      "Picking hand is losing the grid. Anchor your palm against the bridge.",
      "Hits are scattering. Slow the picking pattern and accent beat 1.",
      "Mute the strings and pick down-up to the click for a bar, then come back in.",
      "Stop, play just one open string to the click for four beats, then add the riff back.",
      "Picking's drifting. Drop the tempo and rebuild from a clean bar.",
      "Pattern's coming apart. Pause, count yourself in slow, then play.",
      "Lift the pick off the strings and just hear the click for a bar.",
      "Slow it down five BPM and play through it clean before bringing speed back.",
    ],
  },
  rushing_trend: {
    correction: [
      "Down-picks are leading — land the up-picks right on the click.",
      "Picking hand's rushing. Let the metronome lead each down-stroke.",
      "Count the in-between eighths and feel the gap between each click.",
      "Pull the tempo back five BPM and let the click pull each note out of you.",
      "Pause one bar. Hear the click, then come in right on beat 1.",
      "Drop your right hand to your lap, breathe, then start playing again.",
      "Hands are racing. Mute the strings and tap the click with the pick for a bar first.",
      "Stop trying to push the metronome. Let it pull you for one full bar.",
    ],
  },
  dragging_trend: {
    correction: [
      "Up-picks are lagging — meet the click on the down.",
      "Picking hand's dragging. Play with the click, don't wait for it.",
      "Let the pick lead — meet each note rather than reaching for it.",
      "Each note's landing late. Aim for the front edge of every click.",
      "Drop the tempo a bit and play with more lift. The drag clears when it feels easy.",
      "Imagine the click is a hair earlier than it is, and meet that.",
      "Stop, take a breath, then come in pushing slightly forward.",
      "The pick's catching — ease the pressure and let it flow.",
    ],
  },
  personal_best_streak: {
    encouragement: [
      "Picking's locked — keep going.",
      "Clean run going. Stay there.",
      "Streak holding — don't change anything.",
      "Right hand is in the pocket. Hold.",
      "That's the feel — keep it.",
      "Pick attack is even. Yes.",
      "Tight and clean. Don't speed up yet.",
      "Eyes closed. Keep going.",
    ],
  },
  new_band_locked: {
    neutral: [
      "{bpmLow}–{bpmHigh} BPM band sustained — picking hand is locked.",
      "Picking-hand pocket holding at {bpmLow}–{bpmHigh} BPM.",
      "Sustained at {bpmLow}–{bpmHigh} BPM — new floor for this riff.",
      "Held {bpmLow}–{bpmHigh} BPM clean. The pick attack's settled.",
      "Locked at {bpmLow}–{bpmHigh} BPM. New baseline for this part.",
      "{bpmLow}–{bpmHigh} BPM owned. Don't drop back below it.",
      "Down-up alternation is steady at {bpmLow}–{bpmHigh} BPM.",
      "Picking grooved at {bpmLow}–{bpmHigh} BPM for a full minute.",
    ],
  },
  recovery: {
    encouragement: [
      "Picking hand back — hold it.",
      "Pulled it back. Stay loose.",
      "Recovered — keep this feel.",
      "You felt the slip and brought it back. That's the skill.",
      "Right hand re-synced. Don't change anything.",
      "Back from the dip. Stay relaxed.",
      "Pocket recovered. Sit in it.",
      "Caught the drift. Hold this exact feel.",
    ],
  },
  recovery_confirmed: {
    encouragement: [
      "Clean again — stay there.",
      "Picking's back. Hold it.",
      "Back on the click. Keep it.",
    ],
  },
  fatigue: {
    encouragement: [
      "Picking arm tightening up? Shake it out, then back in.",
      "Wrist or forearm feeling locked? Quick pause, then come back in.",
      "Tension creeping in — set the guitar down for 60 seconds.",
      "Shoulder lifting? Drop it, breathe, then resume.",
      "Pick attack getting harder than it needs to be. Brief rest.",
      "Grip tightening on the neck? Loosen up, then play.",
      "Forearm working too hard — shake out and continue.",
      "Take 30 seconds, roll the shoulders, then back to it.",
    ],
    correction: [
      "Fatigue's showing in the pick attack — stop, rest the arm 90 seconds. Tired picking builds tension.",
      "You're past peak — guitar down, stretch the wrist, then back in.",
      "Stop before the tendons start complaining. 90 seconds off the strings.",
      "Wrist is straining. Set the guitar down, stretch the forearm, two minutes off.",
      "Real rest — guitar on the stand, walk around for a bit.",
      "Picking arm is done for now. 90 seconds minimum, then re-check.",
      "Stop. Wrist circles, forearm stretches, then come back fresh.",
      "Push past this and you'll buy yourself an injury. Hard stop.",
    ],
  },
  tempo_milestone: {
    correction: [
      "At {bpmLow} BPM — make sure the up-picks are as loud as the downs before pushing.",
      "{bpmLow} BPM milestone. Hold this until the pick attack is even.",
      "New band: {bpmLow}-{bpmHigh}. Pick down-up on a single open string before climbing.",
      "{bpmLow} BPM is fresh. Stay flat and let the right hand settle.",
      "Park at {bpmLow} BPM. The next jump comes after a clean minute.",
      "Earn {bpmLow} BPM before chasing more. Hold it until it feels boring.",
      "Hit {bpmLow} BPM — now build a couple of clean bars before going higher.",
      "{bpmLow}-{bpmHigh} BPM is brand new. Don't speed up until it's automatic.",
    ],
  },
  check_in: {
    encouragement: [
      "Long stretch with the guitar — riff, chords, something specific?",
      "Five-plus minutes in. Want me to call out picking, rhythm, or both?",
      "You've been locked in. Tell me what you want feedback on.",
      "Solid run going. Want sharper feedback on a specific section?",
      "Been at it a while. Picking? Strumming? Tell me where to listen.",
      "Pocket's been steady. Pick a target if you want closer feedback.",
      "Long stretch with the guitar. Anything you want me to flag?",
      "You've been deep in it. Tell me what to listen for next.",
    ],
  },
  ramp_complete: {
    neutral: [
      "Made it to {endBpm}. Solid ramp from {startBpm} — pick attack stayed even.",
      "Ramp done — {startBpm} to {endBpm}. Picking hand held the climb.",
      "Target reached: {endBpm} BPM. You picked through the whole ramp from {startBpm}.",
      "{endBpm} BPM reached. Ramp from {startBpm} complete — picking clean.",
    ],
  },
  stamina: {
    neutral: [
      "Past the {staminaMinutes}-minute mark your picking hand tenses. Shake it out, then resume.",
      "Around minute {staminaMinutes} the pick attack starts to drift. Quick break, then back in.",
      "Stamina wall at minute {staminaMinutes} — right hand tightens. Rest 30 seconds.",
      "You tend to lose edge on the picking around minute {staminaMinutes}. Short rest, then return.",
    ],
  },
  bias_only: {
    neutral: [
      "Your notes are consistently {biasMs}ms {direction} the click. Shift the whole phrase {correctionDirection} — it's a timing lean, not chaos.",
      "Every hit lands {biasMs}ms {direction}. That's a consistent lean — shift your timing {correctionDirection} to center it.",
      "Tight scatter, {biasMs}ms {direction}. Shift your timing {correctionDirection} to land on the click.",
    ],
  },
  pace_coaching: {
    neutral: [
      "{attemptCount} attempts at {bpm} and the score's not moving. Drop to {suggestedBpm}, lock it in, then push again.",
      "Ceiling confirmed at {bpm} — {attemptCount} tries. Park at {suggestedBpm} for a week and build it solid.",
    ],
  },
  grid_lost: {
    neutral: [
      "Lost the grid there — fill or free? If intentional, ignore me.",
      "Correlation dropped off the click — were you running a fill?",
    ],
  },
  muddy_hits: {
    neutral: [
      "You're landing the beats but the pick attack is light — try a firmer stroke.",
      "Good coverage, weak transient. Drive the pick through the string.",
      "Every beat lands, but softly. A harder attack sharpens the signal.",
      "Beats are all there — just dig in more with the pick for a cleaner attack.",
    ],
  },
  grid_discontinuity: {
    neutral: [
      "Your picking drifted from the click. Mute and re-enter on the downbeat.",
      "Grid tracking dropped — stop the riff, find the pulse, then come back in.",
      "Went off-tempo there. Let the click breathe and re-lock your strumming.",
      "The pick drifted from the grid. Take a beat and come back on the one.",
    ],
  },
  low_completeness: {
    neutral: [
      "You're picking about half the expected beats — try to hit every note in the phrase.",
      "Coverage is low — make sure each beat gets a pick, not just the ones that sit well.",
      "Around half the beats are going unplayed. Focus on completing the full riff.",
      "Beat coverage is low. Slow down if needed and make sure every beat lands.",
    ],
  },
  ic_spacing_drift: {
    neutral: [
      "Your note placement is solid — but the space between notes keeps wandering. Try counting the subdivisions out loud as you pick.",
      "On the beat well, but the gap between pick strokes is uneven. Tap your foot on every subdivision to anchor the spacing.",
      "Beat timing is there — but the space between notes is shifting. Count sixteenths out loud as you play and let your mouth set the grid.",
      "Placement is locked — spacing is drifting. Slow the riff down until the gaps feel even, then speed back up.",
    ],
  },
  ic_placement_drift: {
    neutral: [
      "Your spacing is really even — but you're landing off the beat. Try anticipating the click by a hair and drive each note right on it.",
      "Even spacing between notes, but the picks are shifted from the grid. Lock the first note of each riff to the beat, then let the rest follow.",
      "The rhythm between your notes is consistent — now bring the whole riff onto the click. Aim for the center of each beat, not the edge.",
      "Good spacing feel. Focus on where each note lands relative to the click — play just slightly ahead of where you expect the beat.",
    ],
  },
  ic_both_locked: {
    neutral: [
      "Spacing and placement both locked in. That's the groove right there.",
      "Note spacing and beat placement both on point. Clean riff.",
      "Both dimensions dialed — you're playing exactly where you intend to be.",
      "Timing is locked across the board. That's what the riff should feel like.",
    ],
  },
} as const;

const BASS: ScenarioCatalog = {
  session_start_cold: {
    neutral: [
      "Ready when you are. I'll start tracking from your first pluck.",
      "Get warmed up and start whenever — I'll start listening from the first note.",
      "Loosen the plucking hand, then play when you're ready.",
      "Good to have you. Start when the fingers feel loose.",
      "Whenever you're set — play and I'll start picking up your timing.",
      "No rush. Get the right hand loose, then start when ready.",
      "Ready when you are. I'll track from the first pluck.",
      "Set up whenever — I'm listening from your first note.",
    ],
  },
  session_start_returning: {
    neutral: [
      "Welcome back. Last session: {lastScore} at {lastBpm} BPM. Let's build on that groove.",
      "Good to see you. You hit {lastScore} at {lastBpm} BPM last time — solid bass line.",
      "Back on the bass. {lastScore} at {lastBpm} BPM last session. Let's keep it going.",
      "Welcome back — {lastScore} / {lastBpm} BPM last time. Ready when you are.",
      "Last session: {lastScore} at {lastBpm} BPM. Pick up the groove.",
      "Back at it. {lastScore} at {lastBpm} BPM last time — good starting point.",
      "Welcome back. {lastScore} at {lastBpm} BPM was the mark last session. Let's hit it.",
      "Good to have you back. {lastScore} at {lastBpm} BPM last time — let's go.",
    ],
  },
  accuracy_drop: {
    correction: [
      "Right hand is drifting from the kick. Reset on beat 1.",
      "Hits are scattering. Slow the fingering and lock to the kick.",
      "Stop, play just root notes to the click, then add the line.",
      "Drop everything but the root and the click for a bar, then come back to the line.",
      "Pull back to one note per click. Build the line back up from there.",
      "Pause the line. Sit with the click for four beats, then come back in.",
      "Drop the tempo a few BPM and play it clean.",
      "Slow it down. Get the root note on every click before adding anything fancy.",
    ],
  },
  rushing_trend: {
    correction: [
      "Plucking hand is leading the kick — hold it back.",
      "Right hand's rushing. Sit deeper behind the beat with the drummer.",
      "Count the in-betweens — place each pluck right on the click, not before.",
      "Drop the tempo five BPM and let the click pull each note out of you.",
      "Pull the right hand back. The kick should land first, then your note.",
      "Stop, count yourself in slow, then play right on top of the click.",
      "Hands are racing. Mute the strings and tap the click with one finger first.",
      "Pause one bar. Hear the click, then come in on beat 1.",
    ],
  },
  dragging_trend: {
    correction: [
      "Plucks are lagging the kick — push slightly into each note.",
      "Right hand's dragging. Play with the click; don't wait for the kick to land.",
      "Lift the plucking finger sooner — meet the click on the front of the note.",
      "Each note's landing late. Aim for the front edge of every click.",
      "Push from the forearm — the finger's getting heavy.",
      "Drop the tempo a bit and play with more lift. The drag clears.",
      "Imagine the click is a hair earlier than it is, and meet that.",
      "Stop, take a breath, then come in pushing slightly forward.",
    ],
  },
  personal_best_streak: {
    encouragement: [
      "Locked with the kick.",
      "Pocket. Stay.",
      "Streak going — stay there.",
      "Yes. Don't change anything.",
      "Right hand in the pocket. Hold.",
      "Bass and click are one thing now. Keep it.",
      "Tight. Sit in this.",
      "That's the groove — stay there.",
    ],
  },
  new_band_locked: {
    neutral: [
      "{bpmLow}–{bpmHigh} BPM band sustained — bass-kick lock is solid.",
      "Root-note pocket holding at {bpmLow}–{bpmHigh} BPM.",
      "Sustained at {bpmLow}–{bpmHigh} BPM — new floor for this groove.",
      "Held {bpmLow}–{bpmHigh} BPM clean. Right hand's settled.",
      "Locked at {bpmLow}–{bpmHigh} BPM. Don't drop below it.",
      "{bpmLow}–{bpmHigh} BPM owned. New baseline.",
      "Bass and click together at {bpmLow}–{bpmHigh} BPM. Solid.",
      "Pocket sustained at {bpmLow}–{bpmHigh} BPM for a full minute.",
    ],
  },
  recovery: {
    encouragement: [
      "Back in the pocket. Stay.",
      "Pulled the line back. Hold it.",
      "Bass-kick lock recovered. Keep it.",
      "Right hand re-synced. Don't change anything.",
      "You caught the slip. Sit in this.",
      "Pocket's back. Stay loose.",
      "Recovery's clean. Hold this exact feel.",
      "Brought it home. Stay there a minute.",
    ],
  },
  recovery_confirmed: {
    encouragement: [
      "Groove's back.",
      "Bass-kick lock — hold it.",
      "Back in the pocket. Stay.",
    ],
  },
  fatigue: {
    encouragement: [
      "Plucking fingers tightening up? Quick stretch — back in.",
      "Forearm starting to lock? Bass down for 60 seconds.",
      "Tension building in the right hand? Brief break, then come back in.",
      "Fretting hand getting heavy? Take a moment, then continue.",
      "Right hand feels tight? Shake it out, then resume.",
      "Shoulder lifting? Drop it, breathe, then continue.",
      "Forearm working too hard. Quick rest.",
      "Take 30 seconds, roll the wrists, then back to it.",
    ],
    correction: [
      "Fatigue's showing in the attack — stop, 90 seconds off, then re-check.",
      "You're past peak — bass down, stretch, then back in.",
      "Stop now. Tired plucking teaches the hand a sloppy attack.",
      "Right hand is straining. Set the bass down, stretch the forearm, two minutes off.",
      "Real rest — bass on the stand, walk around for a bit.",
      "Plucking hand is done. 90 seconds minimum, then re-check.",
      "Hard stop. Wrist circles and forearm stretches before continuing.",
      "Push past this and you'll buy yourself an injury. Stop and recover.",
    ],
  },
  tempo_milestone: {
    correction: [
      "At {bpmLow} BPM — make sure each note rings clean before climbing.",
      "{bpmLow} BPM milestone. Lock root notes to the click before pushing.",
      "New band: {bpmLow}-{bpmHigh}. Walk it slow first, then add the fancy notes.",
      "{bpmLow} BPM is fresh. Stay here until each note sounds full.",
      "Park at {bpmLow} BPM. The next jump comes after a clean minute.",
      "Hit {bpmLow} BPM — now build a couple of clean bars before going higher.",
      "{bpmLow}-{bpmHigh} BPM is brand new. Hold it until it feels easy.",
      "Earn {bpmLow} BPM before chasing more. Stay flat.",
    ],
  },
  check_in: {
    encouragement: [
      "Long stretch on the bass — line, groove, something specific?",
      "Five-plus minutes locked with the kick. Anything you want to dial in?",
      "You've been deep in the pocket. What's next?",
      "Solid run going. Want sharper feedback on a specific part?",
      "Been at it a while. Walking line? Root notes? Tell me where to listen.",
      "Pocket's been steady. Pick a target if you want closer feedback.",
      "Long stretch on the bass. Anything you want me to flag?",
      "You've been holding it down. Tell me what to listen for next.",
    ],
  },
  ramp_complete: {
    neutral: [
      "Ramp done — {startBpm} to {endBpm}. Bass-kick lock held the climb.",
      "Made it to {endBpm} BPM. You plucked through the ramp from {startBpm}.",
      "Target reached: {endBpm} BPM. Ramp from {startBpm} complete — groove stayed.",
      "{endBpm} BPM reached. Solid ramp from {startBpm} on the bass.",
    ],
  },
  stamina: {
    neutral: [
      "Stamina wall at minute {staminaMinutes} — your groove loosens. Short break, then back in.",
      "Around minute {staminaMinutes} the plucking hand starts to fatigue. Rest and return.",
      "Past the {staminaMinutes}-minute mark the bass lock starts to slip. Brief rest, then resume.",
      "You tend to fade around minute {staminaMinutes}. Take 30 seconds, come back clean.",
    ],
  },
  bias_only: {
    neutral: [
      "Pluck is {biasMs}ms {direction} the click every time — low jitter, just offset. Adjust your attack {correctionDirection}.",
      "Your attack sits {biasMs}ms {direction}. Very consistent — just shift {correctionDirection} to land on the beat.",
    ],
  },
  pace_coaching: {
    neutral: [
      "Ceiling at {bpm} — {attemptCount} sessions in. Lock {suggestedBpm} first, then come back.",
      "{attemptCount} attempts at {bpm} BPM and the groove's not locking. Drop to {suggestedBpm} and consolidate.",
    ],
  },
  grid_lost: {
    neutral: [
      "Lost the grid there. Fill or improv? If intentional, carry on.",
      "Correlation dropped off the click — are you running a fill?",
    ],
  },
  muddy_hits: {
    neutral: [
      "Landing every note but the signal is soft — dig in more with your plucking hand.",
      "Good coverage but the attack is quiet. More finger pressure on each pluck.",
      "Every beat's there, just soft. Try plucking more aggressively.",
      "Beats are landing but the transient is weak — anchor harder on the string.",
    ],
  },
  grid_discontinuity: {
    neutral: [
      "Your groove drifted from the click. Mute and re-enter on the downbeat.",
      "Grid tracking dropped — stop the line, find the pulse, and re-lock.",
      "Went off-tempo there. Let the click breathe and re-anchor your bass line.",
      "The groove drifted from the grid. Take a beat and lock back in on the root.",
    ],
  },
  low_completeness: {
    neutral: [
      "You're playing about half the expected beats — try to lock in every note of the line.",
      "Coverage is low — make sure each beat gets a pluck, not just the root notes.",
      "Around half the beats are going unplayed. Focus on filling out the full bass line.",
      "Beat coverage is low. Slow down if needed and make sure every note lands.",
    ],
  },
  ic_spacing_drift: {
    neutral: [
      "Your plucking lands on the beat well — but the space between notes keeps shifting. Try counting the subdivisions out loud as you play.",
      "Beat placement is solid, but the gap between plucks is uneven. Tap your foot on every subdivision to lock the note spacing.",
      "On the beat consistently, but spacing between notes is wandering. Count the subdivisions out loud — let your voice set the grid.",
      "Good beat placement — the space between plucks is drifting though. Slow the line down until the gaps feel equal, then speed up.",
    ],
  },
  ic_placement_drift: {
    neutral: [
      "Your pluck spacing is even — but you're landing off the beat. Anticipate the click by a hair and drive each pluck right on it.",
      "Even spacing between notes, but the line is sitting off the grid. Lock the first note of each bar to the click, then let the rest follow.",
      "The rhythm between plucks is consistent — now anchor the whole line to the grid. Aim for the center of each beat.",
      "Good spacing feel in the line. Focus on where each pluck lands relative to the click — play slightly ahead of where you expect the beat.",
    ],
  },
  ic_both_locked: {
    neutral: [
      "Pluck spacing and beat placement both locked in. That's the pocket right there.",
      "Spacing and placement both on point. The bass line is sitting exactly where it should.",
      "Both dimensions dialed — you're grooving with real precision.",
      "Timing locked across the board. That's the bass line feel you want.",
    ],
  },
} as const;

const ACOUSTIC_GUITAR: ScenarioCatalog = {
  session_start_cold: {
    neutral: [
      "Ready when you are. I'll start tracking from your first strum.",
      "Get tuned up and start whenever — I'll listen from the first note.",
      "Strum a few open chords, then play when you're ready.",
      "Good to have you. Start when the strum hand feels loose.",
      "Whenever you're set — play and I'll start catching your timing.",
      "No rush. Get the strumming arm loose, then start.",
      "Ready when you are. I'll track from the first strum.",
      "Set up and start whenever — I'm listening.",
    ],
  },
  session_start_returning: {
    neutral: [
      "Welcome back. Last session: {lastScore} at {lastBpm} BPM. Let's build on that.",
      "Good to see you. You hit {lastScore} at {lastBpm} BPM last time — good foundation.",
      "Back with the acoustic. {lastScore} at {lastBpm} BPM last session. Let's keep it going.",
      "Welcome back — {lastScore} / {lastBpm} BPM last time. Ready when you are.",
      "Last session: {lastScore} at {lastBpm} BPM. Pick up where you left off.",
      "Back at it. {lastScore} at {lastBpm} BPM last time — solid starting point.",
      "Welcome back. {lastScore} at {lastBpm} BPM was the line last session. Let's match it.",
      "Good to have you back. {lastScore} at {lastBpm} BPM last time — let's go.",
    ],
  },
  accuracy_drop: {
    correction: [
      "Strumming hand is losing the grid. Lock to the downbeat first.",
      "Hits are scattering. Soften the strum and accent the downbeat.",
      "Just down-strums on open strings to the click, then come back in.",
      "Stop, play a single chord on every click for a bar, then add the pattern.",
      "Drop the pattern. One down-strum per click for four beats, then layer back in.",
      "Slow down. Get one chord per click clean before adding the up-strums.",
      "Pause and breathe. Find the click, then start fresh.",
      "Pull the tempo down five BPM and play it clean.",
    ],
  },
  rushing_trend: {
    correction: [
      "Strumming arm is leading — land the down-strum right on the click.",
      "Strumming hand's rushing. Let the click drive the strum.",
      "Count the in-betweens — feel the gap between each click.",
      "Pull the tempo back five BPM and let the click pull each strum out of you.",
      "Pause one bar. Hear the click, then come in on beat 1.",
      "Drop your strumming arm to your side, breathe, then start again.",
      "Hands are racing. Mute the strings and tap the click with the pick for a bar.",
      "Stop trying to push the metronome. Let it pull you for one full bar.",
    ],
  },
  dragging_trend: {
    correction: [
      "Strum is lagging — meet the click on the down.",
      "Strumming hand's dragging. Play with the click; don't wait for it.",
      "Give the strum more momentum and meet the click on the down.",
      "Each strum's landing late. Aim for the front edge of every click.",
      "Drop the tempo and play with more lift. The drag will clear when it feels easy.",
      "Imagine the click is a hair earlier than it is, and meet that.",
      "Stop, take a breath, then come in pushing slightly forward.",
      "The strum's getting caught — ease off and let it flow.",
    ],
  },
  personal_best_streak: {
    encouragement: [
      "Strumming's locked — keep going.",
      "Nice groove going. Stay.",
      "Streak holding — stay there.",
      "Right hand in the pocket. Hold.",
      "That's the feel — keep it.",
      "Down-up balance is right. Yes.",
      "Tight and even. Don't speed up yet.",
      "Eyes closed. Keep going.",
    ],
  },
  new_band_locked: {
    neutral: [
      "{bpmLow}–{bpmHigh} BPM band sustained — strumming is locked.",
      "Strumming pocket holding at {bpmLow}–{bpmHigh} BPM.",
      "Sustained at {bpmLow}–{bpmHigh} BPM — new floor for this pattern.",
      "Held {bpmLow}–{bpmHigh} BPM clean. The strum's settled.",
      "Locked at {bpmLow}–{bpmHigh} BPM. New baseline for this pattern.",
      "{bpmLow}–{bpmHigh} BPM owned. Don't drop below it.",
      "Down-up alternation is steady at {bpmLow}–{bpmHigh} BPM.",
      "Pattern grooved at {bpmLow}–{bpmHigh} BPM for a full minute.",
    ],
  },
  recovery: {
    encouragement: [
      "Strum back on the grid. Hold it.",
      "Pulled the pattern back. Stay loose.",
      "Recovered — keep this feel.",
      "You felt the slip and brought it back. That's the skill.",
      "Right hand re-synced. Don't change anything.",
      "Back from the dip. Stay loose.",
      "Pattern's clean again. Sit in this.",
      "Caught the drift. Hold this exact feel.",
    ],
  },
  recovery_confirmed: {
    encouragement: [
      "Back on track.",
      "Strum's clean again. Hold it.",
      "Pulled it back. Stay there.",
    ],
  },
  fatigue: {
    encouragement: [
      "Strumming arm tightening up? Shake it out, then back in.",
      "Wrist feeling locked? Quick stretch, then come back in.",
      "Tension creeping into the strum — guitar down for 60 seconds.",
      "Shoulder lifting? Drop it, breathe, then continue.",
      "Strum getting heavier than it needs to be. Brief rest.",
      "Grip tightening on the neck? Loosen up, then play.",
      "Forearm working too hard — shake out and continue.",
      "Take 30 seconds, roll the shoulders, then back to it.",
    ],
    correction: [
      "Fatigue's showing in the strum — stop, 90 seconds off the strings.",
      "You're past peak — set the guitar down, stretch the wrist, then return.",
      "Tired strumming buries the dynamics. Stop, rest, restart.",
      "Strumming arm is straining. Set the guitar down, stretch the forearm, two minutes off.",
      "Real rest — guitar on the stand, walk around for a bit.",
      "Strumming hand is done. 90 seconds minimum, then re-check.",
      "Hard stop. Wrist circles, forearm stretches, then continue when loose.",
      "Push past this and you'll buy yourself an injury. Stop and recover.",
    ],
  },
  tempo_milestone: {
    correction: [
      "At {bpmLow} BPM — make sure each strum has equal weight before climbing.",
      "{bpmLow} BPM milestone. Hold here until the down-up balance is even.",
      "New band: {bpmLow}-{bpmHigh}. Try the pattern on one chord first, then move.",
      "{bpmLow} BPM is fresh. Stay flat until the strum feels easy.",
      "Park at {bpmLow} BPM. The next jump comes after a clean minute.",
      "Hit {bpmLow} BPM — now build a couple of clean bars before going higher.",
      "{bpmLow}-{bpmHigh} BPM is brand new. Hold it until it feels boring.",
      "Earn {bpmLow} BPM before chasing more. Stay here.",
    ],
  },
  check_in: {
    encouragement: [
      "Long stretch on the acoustic — chords, fingerpicking, something specific?",
      "Five-plus minutes in. Want me to call out the strumming or the chord changes?",
      "You've been locked in. Tell me what you want feedback on.",
      "Solid run going. Want sharper feedback on a specific section?",
      "Been at it a while. Strumming? Chord changes? Tell me where to listen.",
      "Pocket's been steady. Pick a target if you want closer feedback.",
      "Long stretch with the acoustic. Anything you want me to flag?",
      "You've been deep in it. Tell me what to listen for next.",
    ],
  },
  ramp_complete: {
    neutral: [
      "Ramp done — {startBpm} to {endBpm}. Strumming held through the climb.",
      "Made it to {endBpm} BPM. You strummed through the ramp from {startBpm}.",
      "Target reached: {endBpm} BPM. Ramp from {startBpm} complete — pattern stayed.",
      "{endBpm} BPM reached. Good ramp from {startBpm} on the acoustic.",
    ],
  },
  stamina: {
    neutral: [
      "Your fretting pressure rises around minute {staminaMinutes}. Rest 30 seconds and re-approach.",
      "Around minute {staminaMinutes} the strumming arm tightens. Brief break, then back in.",
      "Past the {staminaMinutes}-minute mark your accuracy tends to slip. Short rest, then resume.",
      "Fatigue shows at minute {staminaMinutes} on the acoustic. Take a breather.",
    ],
  },
  bias_only: {
    neutral: [
      "Pick is landing {biasMs}ms {direction} consistently. Not chaos — shift your timing {correctionDirection} to center it.",
      "Consistent lean: {biasMs}ms {direction}. Shift the whole phrase {correctionDirection} and you'll be centered.",
    ],
  },
  pace_coaching: {
    neutral: [
      "{attemptCount} attempts at {bpm} and it's not settling. Try {suggestedBpm} for two sessions, then revisit.",
      "Ceiling confirmed at {bpm} — drop to {suggestedBpm} and let the fretting hand catch up.",
    ],
  },
  grid_lost: {
    neutral: [
      "Lost the grid there. Fill or improv? If intentional, carry on.",
      "Correlation dropped off the click — are you running a fill?",
    ],
  },
  muddy_hits: {
    neutral: [
      "You're landing every beat but the attack is light — try a firmer strum or pick.",
      "Good coverage, soft hits. More wrist force through the strings.",
      "Beats are all there, just quiet. Drive through the strings with more intent.",
      "Landing the beats but softly — try a sharper attack on the downstroke.",
    ],
  },
  grid_discontinuity: {
    neutral: [
      "Your strumming drifted from the click. Stop and re-enter on the downbeat.",
      "Grid tracking dropped — let the click run a bar, then strum back in.",
      "Went off-tempo there. Dampen the strings and re-lock to the click.",
      "The strum pattern wandered from the grid. Take a breath and re-enter clean.",
    ],
  },
  low_completeness: {
    neutral: [
      "You're strumming about half the expected beats — try to hit every beat in the pattern.",
      "Coverage is low — make sure each beat gets a strum, not just the strong ones.",
      "Around half the beats are going unplayed. Focus on completing the full strum pattern.",
      "Beat coverage is low. Count aloud and make sure every downbeat and upbeat lands.",
    ],
  },
  ic_spacing_drift: {
    neutral: [
      "Your strum lands on the beat well — but the space between strokes keeps shifting. Try counting the subdivisions out loud as you strum.",
      "On the beat consistently, but the gap between strums is uneven. Tap your foot on every subdivision to lock the spacing.",
      "Beat placement is solid — but spacing between strums is wandering. Count the subdivisions aloud and let your voice keep the pattern even.",
      "Good beat placement — the space between strums is drifting though. Slow the pattern down until the gaps feel equal, then speed back up.",
    ],
  },
  ic_placement_drift: {
    neutral: [
      "Your strum spacing is even — but you're landing off the beat. Anticipate the click by a hair and drive each strum right on it.",
      "Even spacing between strums, but the pattern is shifted from the grid. Lock the downstroke of each bar to the beat, then let the rest follow.",
      "The rhythm between strums is consistent — now anchor the whole pattern to the click. Aim for the center of each beat.",
      "Good spacing feel. Focus on where each strum lands relative to the click — play just slightly ahead of where you expect the beat.",
    ],
  },
  ic_both_locked: {
    neutral: [
      "Strum spacing and beat placement both locked in. That's a clean strum pattern.",
      "Spacing and placement both on point. The pattern is sitting exactly where it should.",
      "Both dimensions dialed — you're playing with real precision right now.",
      "Timing locked across the board. That's the strum feel you want.",
    ],
  },
} as const;

const PIANO: ScenarioCatalog = {
  session_start_cold: {
    neutral: [
      "Ready when you are. I'll start tracking from your first note.",
      "Warm up the hands, then play whenever — I'll start listening.",
      "Get settled at the keys, then start when you're ready.",
      "Good to have you. Start when the hands feel loose.",
      "Whenever you're set — play and I'll start catching your timing.",
      "No rush. Let the hands warm up, then start when ready.",
      "Ready when you are. I'll track from the first key.",
      "Settle in and start whenever — I'm listening.",
    ],
  },
  session_start_returning: {
    neutral: [
      "Welcome back. Last session: {lastScore} at {lastBpm} BPM. Let's build on that.",
      "Good to see you. You hit {lastScore} at {lastBpm} BPM last time — good to be back.",
      "Back at the keys. {lastScore} at {lastBpm} BPM last session. Let's push it.",
      "Welcome back — {lastScore} / {lastBpm} BPM last time. Ready when you are.",
      "Last session: {lastScore} at {lastBpm} BPM. Pick up where you left off.",
      "Back at it. {lastScore} at {lastBpm} BPM last time — solid baseline.",
      "Welcome back. {lastScore} at {lastBpm} BPM was the mark last session. Let's match it.",
      "Good to have you back. {lastScore} at {lastBpm} BPM last time — let's go.",
    ],
  },
  accuracy_drop: {
    correction: [
      "Hands are drifting apart. Lock the left hand to the click first.",
      "Hits are scattering. Slow down — left hand alone, then add the right.",
      "Just left hand to the click for a bar, then bring the right hand in.",
      "Stop both hands. Play the click with just the left for four beats, then layer the right.",
      "Pull back to one note per click with the left hand, then build the piece back up.",
      "Drop the tempo and play hands separately before putting them together.",
      "Pause and breathe. Find the click, then start fresh.",
      "Slow it down five BPM and play it clean.",
    ],
  },
  rushing_trend: {
    correction: [
      "Right hand is leading the left — land the bass note right on the click.",
      "Rushing — sit deeper into the keys; let the click pull each note.",
      "Count the in-betweens — place each note where the click lands, not before.",
      "Pull the tempo back five BPM and let the click pull each note out of you.",
      "Pause one bar. Hear the click, then come in on beat 1.",
      "Drop your hands to your lap, breathe, then start playing again.",
      "Right hand's racing. Play just the left hand to the click for a bar first.",
      "Stop trying to push the metronome. Let it pull you for one full bar.",
    ],
  },
  dragging_trend: {
    correction: [
      "Left hand is lagging — lead with the bass, not the melody.",
      "Dragging — lead the downbeat with the left hand; don't wait for the click.",
      "Lead with the attack — meet the click on the front of each note.",
      "Each note's landing late. Aim for the front edge of every click.",
      "Drop the tempo and play with more lift. The drag clears when it feels easy.",
      "Imagine the click is a hair earlier than it is, and meet that.",
      "Stop, take a breath, then come in pushing slightly forward.",
      "The fingers are getting heavy. Lighten your touch and let them float.",
    ],
  },
  personal_best_streak: {
    encouragement: [
      "Hands locked. Stay.",
      "Both hands synced.",
      "Streak going — stay there.",
      "Two-hand lock is clean. Hold.",
      "Yes. Don't change anything.",
      "Left and right are talking. Keep going.",
      "Tight. Sit in this.",
      "Eyes closed. Keep going.",
    ],
  },
  new_band_locked: {
    neutral: [
      "{bpmLow}–{bpmHigh} BPM band sustained — both hands locked to the click.",
      "Hand-sync pocket holding at {bpmLow}–{bpmHigh} BPM.",
      "Sustained at {bpmLow}–{bpmHigh} BPM — new floor for this voicing.",
      "Held {bpmLow}–{bpmHigh} BPM clean. Both hands are settled.",
      "Locked at {bpmLow}–{bpmHigh} BPM. New baseline for this piece.",
      "{bpmLow}–{bpmHigh} BPM owned. Don't drop below it.",
      "Two-hand sync steady at {bpmLow}–{bpmHigh} BPM.",
      "Pocket sustained at {bpmLow}–{bpmHigh} BPM for a full minute.",
    ],
  },
  recovery: {
    encouragement: [
      "Hands back in sync. Hold it.",
      "Two-hand lock back. Don't change anything.",
      "Recovered — stay loose in the shoulders.",
      "You caught the drift. Sit in this.",
      "Left and right re-synced. Stay there.",
      "Back from the dip. Don't change anything.",
      "Pocket recovered. Hold this exact feel.",
      "Brought it home. Stay there a minute.",
    ],
  },
  recovery_confirmed: {
    encouragement: [
      "Touch is clean again.",
      "Hands back in sync. Hold it.",
      "Back on the keys. Stay.",
    ],
  },
  fatigue: {
    encouragement: [
      "Wrists tightening up? Lift the hands, breathe, then back in.",
      "Forearms feeling locked? Pause, drop the hands, breathe.",
      "Tension creeping into the shoulders — 60 seconds off the keys.",
      "Fingers feeling heavy? Quick stretch, then resume.",
      "Hands working harder than they should. Brief rest.",
      "Shoulders climbing? Drop them, breathe, then play.",
      "Take 30 seconds, roll the wrists, then back to it.",
      "Wrist tension building. Pause, drop the hands to your lap, breathe.",
    ],
    correction: [
      "Fatigue's showing in the touch — stop, hands down 90 seconds.",
      "You're past peak — get off the bench, shake it out, then return.",
      "Tired playing buries the dynamics. Stop, rest the wrists, restart.",
      "Wrists are straining. Set the hands down, stretch the forearms, two minutes off.",
      "Real rest — stand up, walk around, come back fresh.",
      "Hands are done for now. 90 seconds minimum, then re-check.",
      "Hard stop. Wrist circles and shoulder rolls before continuing.",
      "Push past this and you'll buy yourself an injury. Stop and recover.",
    ],
  },
  tempo_milestone: {
    correction: [
      "At {bpmLow} BPM — make sure the left hand is rock-solid before climbing.",
      "{bpmLow} BPM milestone. Hold here until both hands are independent.",
      "New band: {bpmLow}-{bpmHigh}. Hands separately first, then together.",
      "{bpmLow} BPM is fresh. Stay flat until both hands are independent.",
      "Park at {bpmLow} BPM. The next jump comes after a clean minute.",
      "Hit {bpmLow} BPM — now build a couple of clean bars before going higher.",
      "{bpmLow}-{bpmHigh} BPM is brand new. Hold it until it feels easy.",
      "Earn {bpmLow} BPM before chasing more. Stay flat.",
    ],
  },
  check_in: {
    encouragement: [
      "Long stretch at the keys — piece, exercise, something specific?",
      "Five-plus minutes in. Want me to call out the left hand, right hand, or both?",
      "You've been locked in. Tell me what you want feedback on.",
      "Solid run going. Want sharper feedback on a specific passage?",
      "Been at it a while. Left hand? Right hand? Voicings? Tell me where to listen.",
      "Pocket's been steady. Pick a target if you want closer feedback.",
      "Long stretch at the keys. Anything you want me to flag?",
      "You've been deep in it. Tell me what to listen for next.",
    ],
  },
  ramp_complete: {
    neutral: [
      "Ramp done — {startBpm} to {endBpm} at the keys. Both hands held the climb.",
      "Made it to {endBpm} BPM. You played through the ramp from {startBpm}.",
      "Target reached: {endBpm} BPM. Ramp from {startBpm} complete — hands stayed locked.",
      "{endBpm} BPM reached. Good ramp from {startBpm} on the keys.",
    ],
  },
  stamina: {
    neutral: [
      "Tension in your touch around minute {staminaMinutes}. Release, breathe, come back clean.",
      "Around minute {staminaMinutes} the wrist tension creeps in. Brief rest, then resume.",
      "Past the {staminaMinutes}-minute mark the touch gets heavier. Short break, then back at the keys.",
      "Fatigue in the hands shows around minute {staminaMinutes}. Rest, then return.",
    ],
  },
  bias_only: {
    neutral: [
      "Keys are falling {biasMs}ms {direction} the click with low scatter. Shift your attack timing {correctionDirection}.",
      "Consistent {biasMs}ms {direction} — that's a lean, not jitter. Move everything {correctionDirection} to center it.",
    ],
  },
  pace_coaching: {
    neutral: [
      "Keys ceiling at {bpm} — {attemptCount} attempts. Two sessions at {suggestedBpm} to consolidate.",
      "{attemptCount} tries at {bpm} and the hands aren't settling. Park at {suggestedBpm} and groove it in.",
    ],
  },
  grid_lost: {
    neutral: [
      "Grid correlation dropped. Still with the click, or running a phrase?",
      "Lost the metric grid there. Fill or free passage?",
    ],
  },
  muddy_hits: {
    neutral: [
      "Beats are all there but the attack is gentle — try a more intentional finger weight.",
      "Good coverage but the keystrokes are soft. Push into the keys with more intention.",
      "Every beat lands, just quietly. Commit more weight to each keypress.",
      "Landing every note but the signal is weak — increase velocity through the key bed.",
    ],
  },
  grid_discontinuity: {
    neutral: [
      "Your playing drifted from the click. Pause and re-enter on the downbeat.",
      "Grid tracking dropped — let the click run a bar, then come back in.",
      "Went off-tempo there. Lift your hands, find the pulse, and re-enter.",
      "The phrase wandered from the grid. Take a beat and lock back to the click.",
    ],
  },
  low_completeness: {
    neutral: [
      "You're playing about half the expected beats — try to land every note in the phrase.",
      "Coverage is low — make sure each beat gets a note, not just the melodic peaks.",
      "Around half the beats are going unplayed. Focus on completing the full passage.",
      "Beat coverage is low. Slow down and make sure every beat lands before moving on.",
    ],
  },
  ic_spacing_drift: {
    neutral: [
      "Your note placement is solid — but the space between keystrokes keeps wandering. Try counting the subdivisions out loud as you play.",
      "On the beat well, but the gap between notes is uneven. Tap your foot on every subdivision to lock the spacing between keystrokes.",
      "Beat placement is there — but the space between notes is shifting. Count the subdivisions aloud and let your voice keep the gaps even.",
      "Good beat placement — note spacing is drifting though. Slow the passage down until the gaps feel equal, then build speed again.",
    ],
  },
  ic_placement_drift: {
    neutral: [
      "Your note spacing is really even — but you're landing off the beat. Anticipate the click by a hair and drive each keystroke right on it.",
      "Even spacing between notes, but the keystrokes are sitting off the grid. Lock the first note of each phrase to the beat, then let the rest follow.",
      "The rhythm between keystrokes is consistent — now anchor the whole phrase to the click. Aim for the center of each beat.",
      "Good spacing feel. Focus on where each note lands relative to the click — try playing slightly ahead of where you expect the beat.",
    ],
  },
  ic_both_locked: {
    neutral: [
      "Note spacing and beat placement both locked in. That's clean piano timing.",
      "Spacing and placement both on point. The phrase is sitting exactly where it should.",
      "Both dimensions dialed — you're playing with real precision right now.",
      "Timing locked across the board. That's the feel you've been building toward.",
    ],
  },
} as const;

// ---------------------------------------------------------------------------
// Catalog export
// ---------------------------------------------------------------------------

export const TEMPLATE_CATALOG: TemplateCatalog = {
  generic: GENERIC,
  drums: DRUMS,
  "electric-guitar": ELECTRIC_GUITAR,
  "acoustic-guitar": ACOUSTIC_GUITAR,
  bass: BASS,
  piano: PIANO,
};

// ---------------------------------------------------------------------------
// Default-mode overlay catalog
//
// Variants here are checked FIRST when the caller passes this catalog as the
// `modeCatalog` argument to `pickTemplate`. They override (or introduce) the
// phrasing for scenarios that are specific to the "default" (musical-feel)
// scoring mode. The main TEMPLATE_CATALOG remains the fallback for any
// scenario / severity not covered here.
//
// All entries use the `generic` vocabulary and `neutral` severity so they
// apply regardless of instrument and tone.
// ---------------------------------------------------------------------------

const DEFAULT_MODE_GENERIC: ScenarioCatalog = {
  muddy_hits: {
    neutral: [
      "You're hitting the beats but the signal is coming in soft — try playing with a firmer touch.",
      "The rhythm is there but your attack is light — dig in a bit more.",
      "Beats are landing but with a soft touch — try a stronger stroke.",
      "Good rhythm, but the signal is a little soft — put more into each note.",
      "You're connecting with the beats, but try adding more weight to each stroke.",
    ],
  },
  ic_both_locked: {
    neutral: [
      "Your timing is locked in — spacing and placement are both solid.",
      "Nice and tight — your notes are landing in the right spots and they're evenly spaced.",
      "Really consistent — your beat placement and note spacing are both dialled in.",
      "Great feel — evenly spaced notes hitting right on the pulse.",
      "Your timing is right in the pocket — spacing and placement are both there.",
    ],
  },
  ic_placement_drift: {
    neutral: [
      "Your notes are evenly spaced but drifting off the click — try anchoring to the pulse more.",
      "Good even spacing but you're a little off the beat — try locking to the pulse.",
      "The gaps between your notes are consistent but they're not quite on the beat — anchor to the click.",
      "Even note spacing but the placement is wandering — focus on landing each note on the beat.",
      "Your internal timing is consistent but the notes are drifting off the pulse — anchor to the click.",
    ],
  },
  ic_spacing_drift: {
    neutral: [
      "You're landing close to each beat but the spaces between notes are uneven — focus on making those gaps more equal.",
      "Good beat placement but uneven note spacing — try keeping the gaps between notes equal.",
      "You're close to the beat but the spacing between notes varies — focus on even gaps.",
      "Your note positions are close but the spacing is a bit scattered — even out the gaps.",
      "Landing near the beat positions but the note spacing is inconsistent — work on keeping the spaces equal.",
    ],
  },
  great: {
    neutral: [
      "Really locked in — your timing is right there.",
      "Solid feel, keep riding that groove.",
      "Your timing is sitting right where it should be.",
      "Clean rhythm — that's the pocket.",
      "Locked in tight — great work.",
      "That's a great feel — tempo is solid throughout.",
    ],
  },
  good_steady: {
    neutral: [
      "Nice and steady — good consistent tempo.",
      "Keeping it together — solid timing through the segment.",
      "Tempo is holding well.",
      "Good rhythm feel — consistent pulse.",
      "Steady timing — you're building a solid foundation.",
    ],
  },
  rushing: {
    neutral: [
      "You're leaning into the beat a little — try letting it come to you.",
      "Arriving a touch early — sit back and let the pulse breathe.",
      "The tempo is pushing forward — ease off the attack slightly.",
      "You're ahead of the beat — try staying back with it.",
      "A bit of a rush happening — slow your attack, not your tempo.",
    ],
  },
  dragging: {
    neutral: [
      "Settling a bit behind the beat — try staying a little more forward.",
      "The tempo is dragging back — keep your attack crisp.",
      "You're lagging slightly — push the attack forward.",
      "Behind the beat — try keeping the energy moving forward.",
      "A bit of drag happening — sharpen the attack.",
    ],
  },
  oscillating: {
    neutral: [
      "The tempo is moving around — speeding up and slowing down.",
      "Note spacing is uneven — try keeping the gaps between notes equal.",
      "The pulse is wandering a bit — focus on steady spacing between notes.",
      "Rushing then dragging — try locking into one steady feel.",
      "Tempo consistency needs work — focus on equal note spacing.",
    ],
  },
  low_score_solid_timing: {
    neutral: [
      "Your timing center is good — focus on hitting more of the beats.",
      "Timing is in the right place, but you're missing some positions — fill those gaps.",
      "Good timing feel, but the rhythm needs more coverage — play more of the beats.",
      "The pulse is there but the rhythm is thin — try hitting more positions.",
      "Your timing is centered well — now work on density.",
    ],
  },
  low_coverage: {
    neutral: [
      "I'm only hearing some of your playing — check your input level or play a touch louder.",
      "Signal is coming in low — try playing with a bit more attack.",
      "Low detection rate — you may need to turn up your input gain.",
      "Only picking up part of your playing — check the input level in settings.",
      "Weak signal coming in — play louder or check your input gain.",
    ],
  },
  noodling: {
    neutral: [
      "Good free feel — let the ideas flow.",
      "Nice exploration — when you're ready, bring it back to the pulse.",
      "Creative space — use it well.",
      "Good free play — follow the feel.",
      "Let it breathe — come back to the grid when you're ready.",
    ],
  },
  flat_dynamics: {
    neutral: [
      "Your playing is very even dynamically — try letting the downbeats breathe a little.",
      "Every note is about the same volume — experiment with accenting the main beats.",
      "Nice consistency, but try adding some dynamic shape — hit the downbeats a touch harder.",
    ],
  },
  weak_downbeats: {
    neutral: [
      "Try hitting beats 1 and 3 a touch harder — your downbeats are blending in.",
      "Your upbeats are a little strong — ease off them and push the downbeats.",
      "The main beats need more weight — let beats 1 and 3 lead.",
    ],
  },
  good_accents: {
    neutral: [
      "Nice dynamic shape — your downbeats have good weight.",
      "Great accent on the main beats — the groove has a clear pulse.",
      "Your downbeats are coming through clearly — nice feel.",
    ],
  },
  subdivisions_too_loud: {
    neutral: [
      "The fills are a bit heavy — let the in-between notes sit lighter.",
      "Try making the subdivision fills softer — let the main beats carry the weight.",
      "The fill notes are competing with your downbeats — ease off between the beats.",
    ],
  },
};

export const DEFAULT_MODE_CATALOG: TemplateCatalog = {
  generic: DEFAULT_MODE_GENERIC,
};

// ---------------------------------------------------------------------------
// Pro mode catalog — mode-aware overrides for PRO_MODE
// ---------------------------------------------------------------------------

const PRO_MODE_GENERIC: ScenarioCatalog = {
  muddy_hits: {
    neutral: [
      "Your beats are landing but the signal confidence is low — try a firmer attack on each note.",
      "The detector sees your hits but with low confidence — your transients may be too soft.",
      "Beats are registering but the signal is weak — sharpen the attack to get a cleaner transient.",
      "Low signal confidence on your hits — dig in more to improve the attack strength.",
      "Your attack is too soft for reliable detection — play with more conviction.",
    ],
  },
  ic_both_locked: {
    neutral: [
      "Note spacing is consistent and beat placement is solid — tight all-round timing.",
      "Both note spacing and beat placement are on point — clean timing overall.",
      "Even note spacing and accurate beat placement — this is what locked-in feels like.",
      "Spacing and placement are both dialled in — timing is solid.",
      "Consistent spacing and clean beat placement — nothing to fix here.",
    ],
  },
  ic_placement_drift: {
    neutral: [
      "Note spacing is even but beat placement is drifting — your internal clock is consistent but not synced to the pulse.",
      "Consistent note spacing but the beats are landing off-center — your internal rhythm is good, just anchor it to the grid.",
      "Even spacing between notes but the placement is wandering off the beat — sync to the pulse.",
      "Your note spacing is reliable but the beat positions are drifting — the internal clock is there, just align it to the click.",
      "Spacing consistency is good but beat placement is off — focus on landing each note on the pulse.",
    ],
  },
  ic_spacing_drift: {
    neutral: [
      "Beat placement is on target but subdivision spacing is inconsistent — anchor points are right, the fills between them are scattered.",
      "Good beat placement but the gaps between notes vary — your positions are correct, the spacing is not.",
      "You're close to the beat positions but note spacing is uneven — the placement is there, even out the gaps.",
      "Accurate beat placement, inconsistent note spacing — the anchor points are correct, work on even gaps.",
      "Beat positions are solid but subdivision spacing is irregular — the placement is there, now even out the fills.",
    ],
  },
  great: {
    neutral: [
      "Tight beat placement and even note spacing — clean all-round timing.",
      "Beat placement solid, spacing consistent — push the tempo when you're ready.",
      "All timing components clean — good session.",
      "Note spacing and placement both dialled in.",
      "Timing is locked — consider bumping the tempo or tightening the subdivisions.",
    ],
  },
  good_steady: {
    neutral: [
      "Consistent spacing and placement — solid foundation. Push tempo 5 BPM or sharpen the attack.",
      "Good timing consistency — a few positions drift but the center holds.",
      "Placement and spacing reliable — room to push harder.",
      "Timing center is on, spacing is consistent — push the tempo to challenge it.",
      "Solid timing foundation — focus on sharpening the attack on weaker beats.",
    ],
  },
  rushing: {
    neutral: [
      "Consistently arriving early — directional early bias in the attack timing.",
      "Note attacks are arriving before the beat — ease the onset forward slightly.",
      "Early attack pattern — your notes are preceding the beat consistently.",
      "Consistent early bias — the attack is rushing the pulse.",
      "Timing is shifted early — let the beat land first, then hit.",
    ],
  },
  dragging: {
    neutral: [
      "Consistently arriving late — directional late bias in the attack timing.",
      "Note attacks are landing after the beat — sharpen the attack slightly.",
      "Late attack pattern — notes are trailing the beat consistently.",
      "Consistent late bias — the attack is dragging the pulse.",
      "Timing is shifted late — push the attack to meet the beat.",
    ],
  },
  oscillating: {
    neutral: [
      "High timing variance despite a near-neutral average — the timing is genuinely unstable.",
      "Not a directional bias — the timing is alternating early and late.",
      "Tempo instability: note spacing is inconsistent across the segment.",
      "Rushing-dragging pattern — not a fixed offset, true variance in the timing.",
      "Timing variance is high — focus on keeping note spacing consistent.",
    ],
  },
  low_score_solid_timing: {
    neutral: [
      "Timing center and spacing are clean but beat coverage is low.",
      "Good placement accuracy but too many beat positions are empty.",
      "Note spacing is consistent but density is low — hit more of the grid positions.",
      "Timing fundamentals are solid, coverage is the gap — fill out more positions.",
      "Placement is accurate — focus on hitting more of the beat positions.",
    ],
  },
  low_coverage: {
    neutral: [
      "Only a fraction of beat positions had a detected hit — signal may be too quiet.",
      "Detection rate is low — check your input gain or play louder.",
      "Most beat positions are empty — check the input level, this isn't a playing-quality issue.",
      "Low hit detection — increase input gain or attack strength.",
      "Signal is too quiet for reliable detection — play louder or adjust your input level.",
    ],
  },
  noodling: {
    neutral: [
      "Free-play mode — beat placement isn't being graded here.",
      "Exploring freely — use it to warm up, then rein it back to the grid.",
      "No scoring in free play — this is your creative space.",
      "Free-form mode active — grading resumes when you lock back to the pulse.",
      "Ungraded free play — let it flow, come back to the grid when ready.",
    ],
  },
  flat_dynamics: {
    neutral: [
      "Low amplitude variation across beat positions — try varying your pick attack.",
      "Minimal dynamic shaping across the bar — increase accent differential on the downbeats.",
      "Amplitude is consistent across positions — build in a dynamic hierarchy: downbeats strongest, upbeats lighter.",
    ],
  },
  weak_downbeats: {
    neutral: [
      "Anti-accent pattern detected — downbeats are quieter than upbeats.",
      "Your upbeats are dominating — increase pick attack on beats 1 and 3.",
      "Downbeat amplitude is below upbeat amplitude — reverse the dynamic hierarchy.",
    ],
  },
  good_accents: {
    neutral: [
      "Healthy accent differential — downbeats are clearly stronger than upbeats.",
      "Good dynamic shaping — downbeat amplitude is well above upbeat amplitude.",
      "Strong accent structure — downbeats leading the dynamic hierarchy.",
    ],
  },
  subdivisions_too_loud: {
    neutral: [
      "Subdivision amplitude is close to downbeat amplitude — fills are overwhelming the accent structure.",
      "The fills are as loud as the main beats — reduce attack on the subdivision notes.",
      "No dynamic hierarchy between beats and fills — downbeats should lead, subdivisions should follow.",
    ],
  },
};

export const PRO_MODE_CATALOG: TemplateCatalog = {
  generic: PRO_MODE_GENERIC,
};
