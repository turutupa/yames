/**
 * Listen first (card #28): one pass of an Exercise, heard before it is played.
 *
 * The ready screen's Watch lit the notes in order at the tempo, silently. With
 * Sound on, Watch plays them too: a clean guitar voice through the engine's
 * song machinery, the same path a Take and a Songs file take (`song.rs`, its
 * General MIDI synthesiser for the `synth` role), over the click or the band the
 * Take will have, after the Take's own bar of count-in. One clock: the notes,
 * the click and the band are one song table, and the neck is lit from the
 * engine's song position (`BeatPosition.songTick`), not from a timer of its own.
 *
 * Nothing here is graded or listened to: no schedule is loaded for the scorer
 * and no input is asked for. It is a song, built here, and nothing else.
 *
 * Pure, so the song it makes is tested without an engine.
 */
import { exerciseScore } from "../paths/toScore";
import type { Exercise } from "../paths/format";
import type { InstrumentId } from "../types";
import type { JamBand } from "../jam";
import { wholeSong } from "../songs/schedule";
import type { BarRange } from "../songs/schedule";
import type { SongBacking, SongBackingBend, SongBackingNote, SongBackingTrack, SongMixGains, SongScore } from "../songs/types";
import { TAKE_COUNT_IN_BARS, writtenOut } from "./take";
import type { TakePlan } from "./take";
import { GUITAR_BAND, buildTakeBand, takeMix } from "./takeBand";

/** Settings: Watch plays the notes as well as lighting them. On unless the player turned it off. */
export const LISTEN_SOUND_KEY = "session.listenSound";

/** The same bar of counting a Take has, so the demo starts the way the Take will. */
export const LISTEN_COUNT_IN_BARS = TAKE_COUNT_IN_BARS;

/** How loud the guitar plays: the part being learned, clearly over the click. */
export const LISTEN_GUITAR_GAIN = 1;

/** The click under the demo, the level a Take's click plays at (`DEFAULT_SONG_MIX`). */
export const LISTEN_CLICK = 0.45;

/**
 * How many bars the demo plays: one pass of the pattern, and a pattern of one
 * bar twice, so its shape is heard as the thing that repeats.
 */
export function listenBars(exercise: Pick<Exercise, "bars">): number {
  const own = Math.max(1, exercise.bars);
  return own >= 2 ? own : own * 2;
}

/**
 * The General MIDI voice the demo plays in: a clean electric guitar, a steel
 * acoustic for an acoustic player, a fingered bass for a bassist. Program
 * numbers from 0, as `SongBackingTrack.program` takes them.
 */
export function listenProgram(instrument: InstrumentId | string | undefined): number {
  if (instrument === "acoustic-guitar") return 25;
  if (instrument === "bass") return 33;
  return 27;
}

/** A note's velocity: accents up, legato and muted notes down, the way a hand plays them. */
function velocityOf(note: Exercise["notes"][number]): number {
  if (note.accent) return 0.95;
  if (note.tech.includes("hammer") || note.tech.includes("pull")) return 0.62;
  if (note.tech.includes("palmMute")) return 0.6;
  return 0.8;
}

/** A palm-muted note is short; anything else rings for what it is written. */
function lengthOf(note: Exercise["notes"][number]): number {
  const dur = Math.max(1, Math.round(note.dur));
  return note.tech.includes("palmMute") ? Math.max(1, Math.round(dur * 0.45)) : dur;
}

/**
 * The bends, as MIDI writes them: up to the target over the first quarter of
 * the note, held, and back to rest at its end. The synth's wheel spans two
 * semitones each way, so a bend past a whole step is played as a whole step.
 */
function bendsOf(notes: Exercise["notes"]): SongBackingBend[] {
  const out: SongBackingBend[] = [];
  for (const n of notes) {
    if (!n.tech.includes("bend") || !n.bend) continue;
    const semis = Math.max(-2, Math.min(2, n.bend));
    const target = Math.max(0, Math.min(16383, Math.round(8192 + (semis / 2) * 8191)));
    const dur = Math.max(4, Math.round(n.dur));
    out.push({ tick: n.tick, value: 8192 });
    out.push({ tick: n.tick + Math.round(dur / 4), value: target });
    out.push({ tick: n.tick + dur - 1, value: 8192 });
  }
  return out.sort((a, b) => a.tick - b.tick);
}

export type ListenDemo = {
  /** The pass, written out: what the transport is built from. */
  score: SongScore;
  range: BarRange;
  /** The band the Take has (when it has one), then the guitar, last. */
  backing: SongBacking;
  /** What the engine is sent: the Take's own mix, and the guitar's fader. */
  mix: SongMixGains;
  /** The guitar's index in `backing.tracks`. */
  guitarTrack: number;
  bars: number;
  /** The tick the last bar ends on. */
  endTick: number;
  countInBars: number;
  /** How long it plays, count-in included, in milliseconds at its tempo. */
  lengthMs: number;
};

/**
 * The demo for this Take: the Exercise's notes (the variant the Take plays) at
 * its tempo, `listenBars` of them, the guitar on a `synth` track, and the
 * Take's band and click under it at the level the Take will have them.
 */
export function buildListenDemo(
  take: Pick<TakePlan, "pathId" | "exercise" | "bpm">,
  options: { instrument?: InstrumentId | string; lineup?: JamBand; bandVolume?: number; click?: number } = {},
): ListenDemo {
  const bars = listenBars(take.exercise);
  const pass = writtenOut(take.exercise, bars);
  const score = exerciseScore(take.pathId, pass, take.bpm);
  const band = buildTakeBand(take.exercise, bars, take.bpm, options.lineup ?? GUITAR_BAND);
  const notes: SongBackingNote[] = [...pass.notes]
    .sort((a, b) => a.tick - b.tick || a.string - b.string)
    .map((n) => ({ tick: n.tick, durTicks: lengthOf(n), midi: n.midi, velocity: velocityOf(n) }));
  const guitar: SongBackingTrack = {
    role: "synth",
    name: "Guitar",
    program: listenProgram(options.instrument),
    guide: true,
    notes,
    bends: bendsOf(pass.notes),
  };
  const tracks = [...(band?.tracks ?? []), guitar];
  const under = takeMix(band, options.bandVolume ?? 0.8, options.click ?? LISTEN_CLICK);
  const last = score.bars[score.bars.length - 1];
  const endTick = last ? last.startTick + last.lengthTicks : 0;
  const countInTicks = (score.bars[0]?.lengthTicks ?? 0) * LISTEN_COUNT_IN_BARS;
  const lengthMs = Math.round(((countInTicks + endTick) / score.ticksPerQuarter) * (60_000 / Math.max(1, take.bpm)));
  return {
    score,
    range: wholeSong(score),
    backing: { tracks },
    mix: { ...under, tracks: [...under.tracks, LISTEN_GUITAR_GAIN] },
    guitarTrack: tracks.length - 1,
    bars,
    endTick,
    countInBars: LISTEN_COUNT_IN_BARS,
    lengthMs,
  };
}
