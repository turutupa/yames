/**
 * The band an Exercise asks for, written into its Take's song.
 *
 * An Exercise with `backing.kind === "jam"` (the shuffle licks, the rock riffs,
 * the etudes "with the band") used to play against a bare click, because a
 * Take is a song (`take.ts`) and a jam is the other scheduler: while a song is
 * loaded the engine's jam lookup never runs (AGENTS.md, "two schedulers in the
 * frame loop"). Running both would be two clocks.
 *
 * So the band is not a jam here. It is the song's own backing: drums, bass and
 * keys tracks of the same `SongBacking` a Guitar Pro file's band arrives in,
 * played by the same recorded kit and voices, off the same tempo map, by the
 * song's own cursor. One transport, one clock, and the scorer's expected onsets
 * come off the map the band is placed on, to the sample (a song's band has no
 * drift: `song.rs`). The band's notes are NOT in `score.notes`, so nothing the
 * band plays is ever expected of the player or graded.
 *
 * The notes come from the jam vocabulary, not a second one: a `Jam` record is
 * made from the backing (groove, feel, key, chart, tempo) and `compileJam` is
 * asked, bar by bar, what the drummer, the bassist and the keys play. This file
 * only turns that per-bar table into note events; the musical calls stay in
 * `src/jam/`.
 */
import { compileJam } from "../jam/compile";
import type { JamBand } from "../jam/compile";
import { jamFromChart } from "../jam/chart";
import { keyName, parseKey } from "../jam/harmony";
import { JAM_ALL_OPTIONAL_LANES, JAM_LANES } from "../jam/types";
import type { Jam, JamEngineConfig, JamLevel, JamPattern } from "../jam/types";
import { barLengthTicks } from "../paths/format";
import type { Exercise } from "../paths/format";
import type { SongBacking, SongBackingNote, SongBackingTrack, SongMixGains } from "../songs/types";

/** The score's resolution: a quarter note. */
const TPQ = 960;

/** Who plays behind a guitarist when nobody says otherwise: drums and bass. */
export const GUITAR_BAND: JamBand = { drums: true, bass: true, keys: false, perc: false };

/**
 * A drum row to its General MIDI percussion number, which is what a song's
 * drum track carries (`song.rs` `gm_drum` maps it back onto the kit).
 */
const GM_DRUM: Record<string, number> = {
  kick: 36,
  snare: 38,
  hat: 42,
  ride: 51,
  crash: 49,
  hatOpen: 46,
  tomHi: 48,
  tomLo: 45,
  shaker: 70,
  tambourine: 54,
  cowbell: 56,
  cabasa: 69,
  claves: 75,
  guiro: 73,
  congaHi: 63,
  congaLo: 64,
  bongoHi: 60,
  bongoLo: 61,
};
/** The cross-stick, for a groove whose quiet snare is the rim. */
const GM_RIM = 37;

/**
 * A jam level to a song velocity.
 *
 * A song's drum velocity does two jobs (`song.rs` `drum_slot`): it picks the
 * recorded layer (`ceil(velocity × layers)`) and it is the stroke's gain. A
 * jam's level does the same through `LEVEL_GAIN` and `LEVEL_LAYER` (hit 0.8 on
 * the second layer, accent 1.0 on the third, ghost 0.45 on the softest, peak
 * 1.0 on the hardest). One number cannot match both exactly; these keep the
 * order (ghost < hit < accent < peak) on four-layer kits and the gains within a
 * few dB of the jam's.
 */
const LEVEL_VELOCITY: Record<JamLevel, number> = { 0: 0, 1: 0.7, 2: 0.9, 3: 0.4, 4: 1 };

/** The record the band is compiled from, or null for a click Exercise. */
export function bandJam(exercise: Exercise, bpm: number): Jam | null {
  const backing = exercise.backing;
  if (backing.kind !== "jam") return null;
  const key = parseKey(backing.key);
  const base = jamFromChart(exercise.title, backing.chart, {
    ...({} as Jam),
    bpm,
    grooveId: backing.grooveId,
    feel: backing.feel,
    intensity: "normal",
    kit: "studio",
    fills: true,
    ...(key ? { key: keyName(key) } : {}),
  } as Jam);
  return {
    ...base,
    // The chart's own groove guess is for a pasted chart; the Exercise names its groove.
    grooveId: backing.grooveId,
    feel: backing.feel,
    ...(key ? { key: keyName(key) } : {}),
    // Steady: no held-back first chorus, no breakdown. A Take is graded bar by bar.
    arrangement: { mode: "loop" },
  };
}

/** Does the drummer fill this bar? The end of every phrase, never the Take's last bar. */
export function isFillBar(bar: number, formBars: number, bars: number): boolean {
  const phrase = formBars >= 4 ? formBars : 4;
  return (bar + 1) % phrase === 0 && bar < bars - 1;
}

function drumNotes(
  out: SongBackingNote[],
  pattern: JamPattern,
  cfg: JamEngineConfig,
  barStart: number,
  step: number,
  crash: boolean,
) {
  const rows = [...JAM_LANES, ...JAM_ALL_OPTIONAL_LANES] as const;
  for (const lane of rows) {
    const row = pattern[lane as keyof JamPattern] as JamLevel[] | undefined;
    if (!row) continue;
    row.forEach((level, i) => {
      if (!level) return;
      const midi = lane === "snare" && level === 3 && cfg.snareGhostIsRim ? GM_RIM : GM_DRUM[lane];
      if (midi === undefined) return;
      out.push({
        tick: barStart + i * step,
        durTicks: step,
        midi,
        velocity: Math.min(1, LEVEL_VELOCITY[level] * (cfg.intensity || 1)),
      });
    });
  }
  // The crash that answers a fill (and opens the Take), on the one, with the kick.
  if (crash && !pattern.crash?.[0]) {
    out.push({ tick: barStart, durTicks: step, midi: GM_DRUM.crash, velocity: LEVEL_VELOCITY[2] });
  }
}

/** How long note `i` of a per-tick line rings: its own length, or to the next note. */
function ringTicks(sounding: (j: number) => boolean, lengths: number[] | undefined, i: number, n: number): number {
  let next = i + 1;
  while (next < n && !sounding(next)) next += 1;
  const gap = next - i;
  const own = lengths?.[i];
  return own !== undefined && Number.isFinite(own) && own > 0 ? Math.min(own, gap) : gap;
}

/** A line's velocity: per tick, times the line's gain, held inside a song's 0..1. */
function lineVelocity(velocities: number[] | undefined, gain: number, i: number): number {
  const v = velocities?.[i];
  const per = v !== undefined && Number.isFinite(v) ? v : 1;
  return Math.max(0.05, Math.min(1, per * (Number.isFinite(gain) ? gain : 1) * 0.85));
}

/**
 * The band for a Take of `bars` bars of this Exercise at `bpm`, or null when
 * the Exercise is click-backed or its groove's bar is not the Exercise's bar.
 *
 * Bar `b` of the Take is bar `b mod formBars` of the chart, so a two-bar riff
 * written out to eight bars hears its two chords four times round, the way the
 * notes repeat.
 */
export function buildTakeBand(
  exercise: Exercise,
  bars: number,
  bpm: number,
  lineup: JamBand = GUITAR_BAND,
): SongBacking | null {
  const jam = bandJam(exercise, bpm);
  if (!jam) return null;
  const barTicks = barLengthTicks(exercise.meter);
  const drums: SongBackingNote[] = [];
  const bass: SongBackingNote[] = [];
  const keys: SongBackingNote[] = [];
  let previousVoicing: number[] | null = null;
  let fillBefore = false;
  const formBars = Math.max(1, compileJam(jam, { formBar: 0, chorus: 1, lineup }).formBars);
  for (let b = 0; b < bars; b += 1) {
    const cfg = compileJam(jam, {
      formBar: b % formBars,
      chorus: 1 + Math.floor(b / formBars),
      lineup,
      previousVoicing,
    });
    // The groove's bar has to be the Exercise's bar, or the band would drift off it.
    if (cfg.beatsPerBar * TPQ !== barTicks) return null;
    const ticks = cfg.beatsPerBar * cfg.ticksPerBeat;
    const step = TPQ / cfg.ticksPerBeat;
    const barStart = b * barTicks;

    const fill = jam.fills && cfg.fill !== null && isFillBar(b, formBars, bars);
    drumNotes(drums, fill && cfg.fill ? cfg.fill : cfg.bar, cfg, barStart, step, cfg.crashOnOne && (b === 0 || fillBefore));
    fillBefore = fill;

    const line = cfg.bass;
    if (line) {
      const on = (j: number) => (line.pitches[j] ?? 0) !== 0;
      for (let i = 0; i < ticks; i += 1) {
        if (!on(i)) continue;
        bass.push({
          tick: barStart + i * step,
          durTicks: ringTicks(on, line.lengths, i, ticks) * step,
          midi: line.pitches[i],
          velocity: lineVelocity(line.velocities, line.gain, i),
        });
      }
    }
    const comp = cfg.keys;
    if (comp) {
      const on = (j: number) => (comp.voicings[j]?.length ?? 0) > 0;
      for (let i = 0; i < ticks; i += 1) {
        if (!on(i)) continue;
        const dur = ringTicks(on, comp.lengths, i, ticks) * step;
        for (const midi of comp.voicings[i]) {
          keys.push({ tick: barStart + i * step, durTicks: dur, midi, velocity: lineVelocity(comp.velocities, comp.gain, i) });
        }
        previousVoicing = comp.voicings[i];
      }
    }
  }
  const track = (role: SongBackingTrack["role"], name: string, notes: SongBackingNote[]): SongBackingTrack => ({
    role,
    name,
    program: 0,
    guide: false,
    notes,
    bends: [],
  });
  const tracks = [
    track("drums", "Drums", drums),
    track("bass", "Bass", bass),
    track("keys", "Keys", keys),
  ].filter((t) => t.notes.length > 0);
  return tracks.length > 0 ? { tracks } : null;
}

/** How loud the band is in a Session before the player touches anything. */
export const DEFAULT_BAND_VOLUME = 0.8;

/** The band volume as stored, or the default. 0..1.5, as a song fader. */
export function readBandVolume(stored: unknown): number {
  return typeof stored === "number" && Number.isFinite(stored)
    ? Math.min(1.5, Math.max(0, stored))
    : DEFAULT_BAND_VOLUME;
}

/**
 * The engine's mix for a Take: the click and every band track.
 *
 * With a band playing, the drummer keeps the time and the click is off, as in
 * Songs (`clickOn`); the count-in still counts at the click's level, because a
 * count-in nobody hears is not one. A band turned all the way down is a click
 * Take again, click and all.
 */
export function takeMix(backing: SongBacking | null, bandVolume: number, click: number): SongMixGains {
  const tracks = (backing?.tracks ?? []).map((t) => (t.role === "bass" ? 0.9 : t.role === "keys" ? 0.6 : 1) * bandVolume);
  const band = tracks.some((g) => g > 0);
  return { click: band ? 0 : click, countIn: click, tracks };
}
