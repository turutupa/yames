/**
 * Alternate Picking: one thing to try, per Exercise (leg c4c, 2026-11-20).
 *
 * The worked example for `plans/coach/CUES_GUIDE.md`. Every Exercise has one
 * general cue (said before its first Take, after an ungraded one, and as its
 * evenness cue) and one cue for each other trigger it can produce: what the
 * pass marks check (notes heard, extras, right notes), the way a slipped bar
 * leaned (late, early), and what its bars hold (a held note, an open string,
 * a change of string, a shift, the last bars). `more` points at the how-to
 * line the cue comes from.
 *
 * Orders, at most 48 characters, about the hands or the count. Never a reason
 * for a slip, never pick direction, muting, tension or tone as something the
 * app heard. Exercises that change key, string or position between Takes get
 * cues that name no fret, string or note, so every variant can say them, and
 * no open-string cue where only some keys have an open string (the first,
 * the Exercise's own notes, has none).
 * Drafts, proof-read by a second reader: see `plans/coach/progress/c4c.md`.
 */
import type { Cue, CueTrigger } from "../format";
import type { CueBook } from "../spec";

const c = (when: CueTrigger, say: string, more?: number): Cue => (more === undefined ? { when, say } : { when, say, more });
/** The general cue: said with nothing measured, and when evenness decided a Take. */
const g = (say: string, more?: number): Cue => ({ ...c("even", say, more), general: true });

// Shared orders, word for word, so each is translated once.
const COUNT_EIGHTHS = "Count '1 and 2 and' out loud as you play.";
const RIGHT_THROUGH = "Pick every note right through.";
const BEAT_LATE = "Put the first note of each beat on the click.";
const BEAT_EARLY = "Wait for the click at the start of each beat.";
const CROSS_CLOSE = "Keep the pick close as you cross.";
const CROSS_SMALL = "Keep the stroke small as you cross strings.";
const TWO_STRINGS = "Keep the stroke small: just the two strings.";
const IN_USE = "Keep the stroke small: just the strings in use.";
const HOP = "Make the hop smaller, not faster.";
const GROUP_LATE = "Put each group's first note on the click.";
const GROUP_EARLY = "Wait for the click before each group.";
const HELD_OUT = "Count the held note out, then start again.";
const LONG_BEAT = "Count the long note's beat, then come in.";
const LONG_LENGTH = "Give each long note its full length.";
const SHORT_FIRM = "Pick the short notes as firmly as the long.";
const BAR_FIRST_LATE = "Put each bar's first note on the click.";
const BAR_FIRST_NOTE = "Say each bar's first note before it comes.";
const UP_DOWN = "Keep the way down as even as the way up.";
const SWING_ON = "Keep the swing going into the last beat.";
const OPEN_G = "Keep the open G on time with the rest.";
const QUIET_HEARD = "Keep the quiet notes loud enough to hear.";
const LIGHT_E = "Play the open Es lightly and evenly.";
const SIX_NOTES = "Say the six notes once before you start.";
const LICK_FIRST = "Say the lick's first note before you start.";
const BURST_HEARD = "Pick every note of the burst right through.";
const BURST_LATE = "Start each burst right on the click.";
const BURST_EARLY = "Wait for the click before each burst.";
const BURST_STOP = "Stop each burst cleanly on the long note.";
const TO_THE_END = "Pick every note right through to the end.";
const WHOLE_MINUTE = "Pick a rung you can hold for the whole minute.";
const LAST_SECONDS = "Keep the last seconds as small as the first.";
const WITH_BAND = "Land each bar's first note with the band.";
const FINGER_FOUR = "Have the first finger ready for fret 4.";
const WELL_UNDER = "Start well under your clean tempo.";
const MOVE_LATE = "Arrive at the new position before the click.";
const MOVE_EARLY = "Wait for the click after each move.";
const NEW_PAIR_LATE = "Put each new pair right on the beat.";
const NEW_PAIR_EARLY = "Wait for the click before each new pair.";
const NEXT_FINGER = "Have the next finger ready before each pair.";
const TOP_ONLY = "Keep the pick on the top string only.";
const B_ONLY = "Keep the pick on the B string only.";
const TRIPLETS = "Count '1-trip-let' and keep it even.";
const B_AS_G = "Pick the B string as firmly as the G string.";
const G_AS_B = "Pick the G string as firmly as the B string.";

export const ALTERNATE_PICKING_CUES: CueBook = {
  // Step 1: even eighths
  "even-eighths.open-string": [
    g(COUNT_EIGHTHS, 0),
    c("heard", "Pick each open E as firmly as the tune."),
    c("extras", TOP_ONLY),
    c("notes", "Say the tune's note before you fret it.", 1),
    c("late", "Put each fretted note right on the click."),
    c("early", "Wait for the click on each fretted note."),
    c("openString", "Move the fretting hand while the open E rings.", 2),
    c("lastBars", "Keep counting as the tune comes round."),
  ],
  "even-eighths.four-fingers": [
    g("Land each finger exactly as the pick strikes."),
    c("heard", "Press each finger right behind the fret."),
    c("extras", "Keep each finger down until the next lands.", 1),
    c("late", "Put fret 5 right on the click."),
    c("early", "Let the click come to you on fret 5."),
    c("lastBars", "Keep the walk down as even as the walk up."),
  ],
  "even-eighths.a-minor-one-string": [
    g("Count '1 and 2 and' while the hand slides.", 0),
    c("heard", "Keep the finger pressed as the hand slides."),
    c("extras", "Lift just enough to move, no more.", 0),
    c("notes", "Sing each note before you play it.", 1),
    c("late", "Arrive at each fret before the click."),
    c("early", "Wait for the click before each slide."),
    c("shift", "Slide as soon as each note is picked."),
    c("lastBars", UP_DOWN),
  ],
  "even-eighths.pedal-riff": [
    g("Keep the pick going down-up on every note.", 1),
    c("heard", "Keep the palm light so the open E still sounds.", 0),
    c("extras", "Keep the pick on the low E only."),
    c("notes", "Press each fretted note fully down."),
    c("late", "Put fret 3 and fret 5 right on the click."),
    c("early", "Wait for the click on every fretted note."),
    c("openString", "Give the open Es the same weight as the rest."),
    c("lastBars", "Count the last four notes out loud."),
  ],

  // Step 2: other strings
  "other-strings.d-string-tune": [
    g("Down on the beat, up on the 'and'.", 0),
    c("heard", "Dig into the D string a little more."),
    c("extras", "Keep the pick on the D string only."),
    c("notes", "Say A, B, C as you fret them.", 1),
    c("late", "Put the open D right on the click."),
    c("early", "Wait for the click before the open D."),
    c("afterHeld", "Count the long note's two beats, then go.", 3),
    c("openString", "Keep the open D as firm as the fretted notes."),
    c("lastBars", "Hold the last A for both beats."),
  ],
  "other-strings.a-string-tune": [
    g(COUNT_EIGHTHS, 0),
    c("heard", "Dig into the A string a little more."),
    c("extras", "Keep the pick on the A string only.", 3),
    c("notes", "Say D, E, F as you fret them.", 1),
    c("late", "Put the open A right on the click."),
    c("early", "Wait for the click before the open A."),
    c("afterHeld", "Count the long note's two beats, then go.", 2),
    c("openString", "Have the next finger ready as the open A rings."),
    c("lastBars", "Hold the last open A for both beats."),
  ],
  "other-strings.b-string-tune": [
    g(COUNT_EIGHTHS, 0),
    c("heard", "Pick the thin B string a little deeper."),
    c("extras", B_ONLY),
    c("notes", "Say E, F, G as you fret them.", 1),
    c("late", "Put the open B right on the click."),
    c("early", "Wait for the click before the open B."),
    c("afterHeld", "Count the long note's two beats, then go.", 2),
    c("openString", "Keep the first finger just above fret 5.", 3),
    c("lastBars", "Hold the last E for both beats."),
  ],
  "other-strings.string-per-bar": [
    g("Move to the next string during the long note.", 3),
    c("heard", "Pick the first note of each bar firmly."),
    c("extras", "Ease off the long note as the next bar starts.", 4),
    c("notes", BAR_FIRST_NOTE, 1),
    c("late", "Put each bar's first note right on the click."),
    c("early", "Give the long note its whole beat."),
    c("afterHeld", LONG_BEAT),
    c("openString", "Keep the open notes as firm as the rest."),
    c("stringChange", "Rest the pick on the new string, then wait.", 3),
    c("lastBars", "Keep the last bar as steady as the first."),
  ],

  // Step 3: even sixteenths
  "even-sixteenths.gear-change": [
    g("Make the stroke smaller for the fast half.", 1),
    c("heard", "Keep the pick moving: never skip a stroke."),
    c("extras", TOP_ONLY),
    c("notes", "Fret each note before its stroke arrives."),
    c("late", "Land the first fast note right on the click."),
    c("early", "Keep the eighths slow: wait for each click."),
    c("openString", "Keep every open E as firm as the fretted ones."),
    c("lastBars", "Count '1 e and a' through the fast half."),
  ],
  "even-sixteenths.four-fingers-16": [
    g("Make the fingers lazier: land with the pick.", 0),
    c("heard", "Keep each finger pressed for its whole note."),
    c("extras", "Let the fingers land with the pick, not before.", 0),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
  ],
  "even-sixteenths.repeated-notes": [
    g("Move the left hand exactly on the beat.", 0),
    c("heard", "Keep the pick going through all four."),
    c("extras", "Lift the old finger as the new one lands."),
    c("notes", "Look at the next fret before the beat."),
    c("late", "Change note right on the click."),
    c("early", "Change note on the beat, not a hair before.", 0),
    c("shift", "Move the hand on the last of the four."),
    c("lastBars", "Count '1 e and a' right to the end."),
  ],
  "even-sixteenths.b-string-melody": [
    g("Lean on the first note of each beat a little.", 1),
    c("heard", "Keep each finger down for its whole note."),
    c("extras", B_ONLY),
    c("notes", "Have the first finger ready on fret 5.", 0),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("shift", "Shift the whole hand up two frets at once.", 0),
  ],

  // Step 4: mixed rhythms
  "mixed-rhythms.long-short-short": [
    g("Count '1, and a' and keep the hand swinging.", 0),
    c("heard", "Pick the two short notes as firmly as the long."),
    c("extras", "Let the silent upstroke clear the string.", 1),
    c("late", "Put the long note right on the click."),
    c("early", "Hold the long note until the 'and'."),
    c("openString", OPEN_G),
    c("lastBars", SWING_ON),
  ],
  "mixed-rhythms.short-short-long": [
    g("Count '1 e and' and wait on the 'and'.", 0),
    c("heard", "Pick both short notes right through."),
    c("extras", "Let the last upstroke clear the string.", 1),
    c("late", "Put the first short note on the click."),
    c("early", "Give the eighth its full length."),
    c("openString", OPEN_G),
    c("lastBars", SWING_ON),
  ],
  "mixed-rhythms.both-cells": [
    g("Count '1, and a, 2 e and' out loud.", 0),
    c("heard", "Keep the hand moving on the silent strokes."),
    c("extras", "Pass over the string between the two eighths.", 1),
    c("late", BEAT_LATE),
    c("early", "Let the two eighths take their full time."),
    c("openString", OPEN_G),
    c("lastBars", SWING_ON),
  ],
  "mixed-rhythms.mixed-melody": [
    g("Keep the hand swinging in sixteenths.", 4),
    c("heard", SHORT_FIRM),
    c("extras", TOP_ONLY),
    c("notes", "Say A, B, C as you fret them.", 1),
    c("late", BEAT_LATE),
    c("early", LONG_LENGTH),
    c("afterHeld", "Count the quarter note's beat, then come in."),
    c("openString", "Keep the open E on time with the rest."),
    c("lastBars", "Hold the last A for its full beat."),
  ],

  // Step 5: accents
  "accents.on-the-beat": [
    g("Keep the quiet notes quiet; only one is loud.", 0),
    c("heard", QUIET_HEARD),
    c("extras", "Keep the pick on the A string only."),
    c("late", "Put the accent right on the click."),
    c("early", "Wait for the click before each accent."),
  ],
  "accents.walking-accent": [
    g("Say which note is loud before each bar.", 0),
    c("heard", QUIET_HEARD),
    c("extras", "Keep the pick on the G string only."),
    c("late", "Keep the time still as the accent moves."),
    c("early", "Let the accent move, never the time."),
    c("lastBars", "Keep the last accent as steady as the first."),
  ],
  "accents.three-over-four": [
    g("Tap your foot on the beat, not the accents.", 0),
    c("heard", QUIET_HEARD),
    c("extras", "Keep the pick on the D string only."),
    c("late", "Keep your foot on the click, not the accent."),
    c("early", "Let the click lead; the accents follow it."),
    c("shift", "Have the little finger ready for fret 10."),
  ],
  "accents.melody-on-accents": [
    g("Move the fretting hand during the open notes.", 0),
    c("heard", "Keep the open Es quiet but still sounding."),
    c("extras", TOP_ONLY),
    c("late", "Have each fretted note ready before its beat."),
    c("early", "Wait for the click on every accent."),
    c("openString", LIGHT_E),
    c("lastBars", "Keep the last accents as strong as the first."),
  ],

  // Step 6: one-string tunes
  "one-string-tunes.e-minor-tune": [
    g("Count each bar's number as it starts.", 3),
    c("heard", SHORT_FIRM),
    c("extras", B_ONLY),
    c("notes", BAR_FIRST_NOTE, 4),
    c("late", BAR_FIRST_LATE),
    c("early", LONG_LENGTH),
    c("afterHeld", LONG_BEAT),
    c("openString", "Keep the open B on time with the rest."),
    c("lastBars", "Hold the last E for both beats."),
  ],
  "one-string-tunes.accent-tune": [
    g("Play the open Es lightly; lean on the tune.", 4),
    c("heard", "Keep the open Es quiet but still sounding."),
    c("extras", TOP_ONLY),
    c("late", "Put each accent right on its beat or 'and'."),
    c("early", "When the tune turns round, wait for the 'and'.", 3),
    c("afterHeld", "Count the held B's two beats, then go on."),
    c("openString", LIGHT_E),
    c("lastBars", "Hold the last B for both beats."),
  ],
  "one-string-tunes.tune-with-band": [
    g("Listen to the snare drum, not your fingers.", 2),
    c("heard", SHORT_FIRM),
    c("extras", B_ONLY),
    c("notes", BAR_FIRST_NOTE),
    c("late", WITH_BAND),
    c("early", LONG_LENGTH),
    c("afterHeld", LONG_BEAT),
    c("openString", "Keep the open B on time with the band."),
    c("lastBars", "If you get lost, come in at the next bar.", 2),
  ],

  // Step 7: crossing
  "crossing.outside-shuttle": [
    g("Go around the outside of the two strings.", 0),
    c("heard", B_AS_G),
    c("extras", TWO_STRINGS),
    c("late", "Put the G string note right on the click."),
    c("early", "Wait for the click on the G string."),
    c("stringChange", CROSS_CLOSE),
  ],
  "crossing.inside-shuttle": [
    g("Make the hop between strings small.", 0),
    c("heard", G_AS_B),
    c("extras", TWO_STRINGS),
    c("late", "Put the B string note right on the click."),
    c("early", "Wait for the click on the B string."),
    c("stringChange", HOP),
  ],
  "crossing.outside-moving": [
    g("Keep the strokes the same; only frets change.", 1),
    c("heard", B_AS_G),
    c("extras", TWO_STRINGS),
    c("notes", NEXT_FINGER, 0),
    c("late", NEW_PAIR_LATE),
    c("early", NEW_PAIR_EARLY),
    c("stringChange", CROSS_CLOSE),
  ],
  "crossing.inside-moving": [
    g(HOP, 1),
    c("heard", G_AS_B),
    c("extras", TWO_STRINGS),
    c("notes", NEXT_FINGER),
    c("late", NEW_PAIR_LATE),
    c("early", NEW_PAIR_EARLY),
    c("stringChange", CROSS_CLOSE),
  ],
  "crossing.outside-lick": [
    g("Start down, and never add a stroke.", 0),
    c("heard", RIGHT_THROUGH),
    c("extras", IN_USE),
    c("notes", LICK_FIRST),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("stringChange", CROSS_CLOSE),
  ],

  // Step 8: pentatonic patterns
  "pentatonic-patterns.box-up-down": [
    g("Count '1-trip-let' and keep the triplets even."),
    c("heard", RIGHT_THROUGH),
    c("extras", CROSS_SMALL),
    c("notes", "Read the tab before you start.", 1),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", HELD_OUT),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", UP_DOWN),
  ],
  "pentatonic-patterns.inside-shuttle-box": [
    g("Start down on the G string; keep it even.", 0),
    c("heard", RIGHT_THROUGH),
    c("extras", TWO_STRINGS),
    c("notes", "Have the little finger ready for fret 8."),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("stringChange", HOP),
  ],
  "pentatonic-patterns.threes-down": [
    g("Lean a little on the first of each three.", 0),
    c("heard", RIGHT_THROUGH),
    c("extras", CROSS_SMALL),
    c("notes", "Start each group one note lower."),
    c("late", GROUP_LATE),
    c("early", GROUP_EARLY),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Keep the low strings as even as the top."),
  ],
  "pentatonic-patterns.fours-up": [
    g("Say each group's first note on the beat.", 0),
    c("heard", RIGHT_THROUGH),
    c("extras", CROSS_SMALL),
    c("notes", "Start each group one note higher."),
    c("late", GROUP_LATE),
    c("early", GROUP_EARLY),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Keep the top strings as even as the low."),
  ],
  "pentatonic-patterns.lick-in-three-keys": [
    g("Keep the strokes the same in every key.", 0),
    c("heard", RIGHT_THROUGH),
    c("extras", IN_USE),
    c("notes", "Look at the new fret before you shift."),
    c("late", "Arrive at the new fret before the click."),
    c("early", "Wait for the click after each shift."),
    c("shift", "Shift during each bar's last note.", 0),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Hold the shape as you move up to fret 12."),
  ],

  // Step 9: three notes per string
  "three-per-string.six-note-down": [
    g(TRIPLETS, 0),
    c("heard", RIGHT_THROUGH),
    c("extras", TWO_STRINGS),
    c("notes", SIX_NOTES),
    c("late", GROUP_LATE),
    c("early", GROUP_EARLY),
    c("stringChange", HOP),
  ],
  "three-per-string.six-note-up": [
    g("Go around the outside at each change.", 1),
    c("heard", RIGHT_THROUGH),
    c("extras", TWO_STRINGS),
    c("notes", SIX_NOTES),
    c("late", GROUP_LATE),
    c("early", GROUP_EARLY),
    c("stringChange", CROSS_CLOSE),
  ],
  "three-per-string.three-strings": [
    g("Count '1 e and a' and keep it even."),
    c("heard", RIGHT_THROUGH),
    c("extras", CROSS_SMALL),
    c("notes", "Stretch the little finger to fret 9 early.", 0),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("stringChange", CROSS_CLOSE),
  ],
  "three-per-string.six-strings": [
    g(TRIPLETS),
    c("heard", RIGHT_THROUGH),
    c("extras", CROSS_SMALL),
    c("notes", "Move up a fret at the B string.", 0),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", HELD_OUT),
    c("shift", "Move the hand during the string change.", 0),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", UP_DOWN),
  ],

  // Step 10: speed bursts
  "speed-bursts.one-beat": [
    g("Land the long note right with the click.", 0),
    c("heard", BURST_HEARD),
    c("extras", BURST_STOP),
    c("late", BURST_LATE),
    c("early", BURST_EARLY),
    c("afterHeld", "Count the long note's beat, then go."),
  ],
  "speed-bursts.two-beats": [
    g("Aim at the half note; let the run carry you.", 1),
    c("heard", BURST_HEARD),
    c("extras", BURST_STOP),
    c("late", BURST_LATE),
    c("early", BURST_EARLY),
    c("afterHeld", "Count the half note's two beats, then go."),
  ],
  "speed-bursts.expanding": [
    g("Let each bar tell you how long to keep going.", 0),
    c("heard", BURST_HEARD),
    c("extras", BURST_STOP),
    c("late", BURST_LATE),
    c("early", BURST_EARLY),
    c("afterHeld", "Count the rest out, then start the burst."),
    c("lastBars", "Keep going through the last bar: no rest.", 0),
  ],
  "speed-bursts.six-note-burst": [
    g("Land the first quarter note on the click.", 1),
    c("heard", BURST_HEARD),
    c("extras", IN_USE),
    c("notes", "Say D, C, A as you walk down.", 1),
    c("late", BURST_LATE),
    c("early", BURST_EARLY),
    c("afterHeld", "Count the walk down, then start the burst."),
    c("stringChange", CROSS_CLOSE),
  ],

  // Step 11: cross-string runs
  "cross-string-runs.octaves": [
    g("Aim the pick at the far string before you go.", 0),
    c("heard", "Pick the G string note as firmly as the A."),
    c("extras", "Let the first finger rest on the skipped string."),
    c("notes", "Keep the same two fingers on every pair.", 0),
    c("late", "Put each A string note right on the click."),
    c("early", NEW_PAIR_EARLY),
    c("shift", "Shift in the gap after each pair."),
    c("stringChange", "Aim the pick past the string you skip."),
  ],
  "cross-string-runs.spider": [
    g("Play it slowly enough to hear each change."),
    c("heard", "Keep each finger down until the next string.", 0),
    c("extras", CROSS_SMALL),
    c("notes", "Say '1-2-3-4' with the fingers on each string.", 0),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", UP_DOWN),
  ],
  "cross-string-runs.scale-in-fours": [
    g("Put the first note of each group on the beat.", 0),
    c("heard", RIGHT_THROUGH),
    c("extras", CROSS_SMALL),
    c("notes", "Start each group one scale note on."),
    c("late", GROUP_LATE),
    c("early", GROUP_EARLY),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Turn round at the top without a pause."),
  ],
  "cross-string-runs.picked-arpeggios": [
    g("Alternate every stroke, even across strings.", 1),
    c("heard", RIGHT_THROUGH),
    c("extras", IN_USE),
    c("notes", "Know each bar's chord before it comes."),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Keep the last chord as even as the first."),
  ],

  // Step 12: up to tempo
  "up-to-tempo.licks-at-tempo": [
    g("Count '1 e and a' and keep it even."),
    c("heard", RIGHT_THROUGH),
    c("extras", IN_USE),
    c("notes", LICK_FIRST),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Keep the inside bar as even as the outside.", 1),
  ],
  "up-to-tempo.three-strings-at-tempo": [
    g("Keep the fingers close to the strings.", 1),
    c("heard", RIGHT_THROUGH),
    c("extras", CROSS_SMALL),
    c("notes", "Have every finger ready before it plays."),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("stringChange", CROSS_CLOSE),
  ],
  "up-to-tempo.sextuplet-loop": [
    g("Lean a little on the first of each six.", 1),
    c("heard", RIGHT_THROUGH),
    c("extras", TWO_STRINGS),
    c("notes", SIX_NOTES),
    c("late", "Put the first of each six on the click."),
    c("early", "Wait for the click before each six."),
    c("stringChange", HOP),
  ],
  "up-to-tempo.two-octave-run": [
    g("Read it in strings, three notes to each.", 1),
    c("heard", RIGHT_THROUGH),
    c("extras", CROSS_SMALL),
    c("notes", "Move up a fret at the B string.", 0),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("shift", "Move the hand during the string change.", 0),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Land the last note and hold it."),
  ],

  // Step 13: stamina
  "stamina-minute.chromatic-minute": [
    g(WHOLE_MINUTE, 0),
    c("heard", TO_THE_END),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("lastBars", LAST_SECONDS),
  ],
  "stamina-minute.box-minute": [
    g("Keep the crossings small for the whole minute.", 1),
    c("heard", TO_THE_END),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", HELD_OUT),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Keep the crossings as small at the end."),
  ],
  "stamina-minute.scale-minute": [
    g(WHOLE_MINUTE),
    c("heard", TO_THE_END),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", LAST_SECONDS),
  ],

  // Step 14: over the band
  "over-the-band.etude-eighths": [
    g("Stay with the band; count each bar.", 1),
    c("heard", RIGHT_THROUGH),
    c("extras", CROSS_SMALL),
    c("notes", BAR_FIRST_NOTE, 1),
    c("late", WITH_BAND),
    c("early", "Let the band lead; sit back on the eighths."),
    c("shift", "Drop the first finger to fret 4 for the B.", 0),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Climb the B string, then back to the A.", 1),
  ],
  "over-the-band.etude-mixed": [
    g("Let the eighths sit back with the band.", 0),
    c("heard", RIGHT_THROUGH),
    c("extras", CROSS_SMALL),
    c("notes", BAR_FIRST_NOTE),
    c("late", WITH_BAND),
    c("early", "Hold the fill back: don't speed up.", 0),
    c("shift", FINGER_FOUR),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Let the last fill lead back to the top."),
  ],
  "over-the-band.etude-sixteenths": [
    g("Sit on twice the band's rate, no faster.", 0),
    c("heard", RIGHT_THROUGH),
    c("extras", CROSS_SMALL),
    c("notes", "Know which idea each bar is before it comes.", 0),
    c("late", WITH_BAND),
    c("early", "Let the band lead; don't push ahead."),
    c("shift", FINGER_FOUR),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Run home in the last bar without rushing."),
  ],
  "over-the-band.full-run": [g("Stay with the band from first bar to last.", 0)],

  // Warm-ups
  "warmup-beginner.one-string-climb": [
    g(WELL_UNDER, 0),
    c("heard", RIGHT_THROUGH),
    c("late", "Put the first note of each bar on the click."),
    c("early", "Wait for the click as each bar starts."),
    c("shift", "Look one note ahead as you climb.", 0),
    c("lastBars", "Keep the top of the climb as even as the start."),
  ],
  "warmup-intermediate.lick-round": [
    g(WELL_UNDER, 0),
    c("heard", RIGHT_THROUGH),
    c("late", "Be ready before each new bar starts."),
    c("early", MOVE_EARLY),
    c("shift", "Look ahead as each new bar starts.", 0),
    c("stringChange", "Keep the pick close to the strings."),
    c("lastBars", "Keep the last bar as even as the first."),
  ],
  "warmup-advanced.scale-round": [
    g(WELL_UNDER, 0),
    c("heard", RIGHT_THROUGH),
    c("late", MOVE_LATE),
    c("early", MOVE_EARLY),
    c("shift", "Keep the shift as small as you can.", 0),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Keep the upper shape as even as the lower."),
  ],
};
