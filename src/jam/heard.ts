/**
 * What Yames heard in free play (detection M7), made ready for a page.
 *
 * The engine is in Rust (`src-tauri/src/harmony/`). It answers in concert
 * pitch with a state: a key is shown only once it `settled` (or is the
 * chart's), a chord only once the worker says it may be (`shownChord`), and
 * anything less is "couldn't tell". Whether single notes were inside or
 * outside the key is NOT shown anywhere: from a microphone about half of the
 * "outside" calls are wrong (`plans/detection/PROGRESS.md`, M7).
 */
import type { HeardChart, HeardChord, HeardKey, HeardLive, HeardQuality, HeardSummary } from "../ipc";
import { chordName, chordNotes, keyRootName, parseChordName, transposeChord } from "./harmony";
import type { Chord, ChordQuality, Key } from "./harmony";
import { chordsForJam, jamChangesBars } from "./progression";
import { jamKey } from "./compile";
import type { Jam } from "./types";

const QUALITY: Record<HeardQuality, ChordQuality> = {
  maj: "maj",
  min: "min",
  dom7: "7",
  maj7: "maj7",
  min7: "m7",
};

const pc = (n: number) => (((Math.round(n) % 12) + 12) % 12);

/** The jam's key and changes for the engine, or null for a jam without chords. */
export function heardChart(jam: Jam, beatsPerBar = 4): HeardChart | null {
  if (!jam.chords) return null;
  const concert = jamKey(jam);
  const chords = chordsForJam(jam.form, concert, jam.progression, jamChangesBars(jam, concert));
  return {
    key: { tonic: pc(concert.root), mode: concert.mode },
    bars: chords.map((c) => [{ root: pc(c.root), tones: chordNotes(c).map(pc), label: chordName(c, concert) }]),
    beatsPerBar,
  };
}

/** A key as the i18n keys `jam.key.*Named` want it. */
export type HeardKeyName = { root: string; mode: Key["mode"] };

function keyNameOf(key: HeardKey, semitones: number): HeardKeyName {
  const read: Key = { root: pc(key.tonic + semitones), mode: key.mode };
  return { root: keyRootName(read), mode: read.mode };
}

function chordNameOf(chord: HeardChord | { root: number; quality: HeardQuality | null; label?: string | null }, key: HeardKey | null, semitones: number): string | null {
  const minor = chord.quality === "min" || chord.quality === "min7";
  const spell: Key = key
    ? { root: pc(key.tonic + semitones), mode: key.mode }
    : { root: pc(chord.root + semitones), mode: minor ? "minor" : "major" };
  let read: Chord | null = null;
  if (chord.quality) read = { root: pc(chord.root), quality: QUALITY[chord.quality] };
  else if (chord.label) read = parseChordName(chord.label);
  if (!read) return chord.label ?? null;
  return chordName(transposeChord(read, semitones), spell);
}

/** What the Jam's one line says. */
export type HeardLine =
  /** Nothing to say yet: not enough was played. */
  | { state: "listening" }
  /** Something was played and neither a key nor a chord earned being shown. */
  | { state: "unsure" }
  | {
      state: "heard" | "chart";
      key: HeardKeyName | null;
      /** The relative key, when the notes do not tell the two apart. */
      relative: HeardKeyName | null;
      chord: string | null;
    };

/**
 * The line for a reading. `semitones` is the jam's display transposition:
 * the engine hears concert pitch, a B flat player reads a tone up.
 */
export function heardLine(live: HeardLive | null, semitones = 0): HeardLine | null {
  if (!live) return null;
  const shown = live.keyState === "settled" || live.keyState === "chart" ? live.key : null;
  const chord = live.shownChord ? chordNameOf(live.shownChord, shown?.key ?? null, semitones) : null;
  if (!shown && !chord) return { state: live.keyState === "listening" ? "listening" : "unsure" };
  let relative: HeardKeyName | null = null;
  if (shown?.relativeToo && shown.key.mode !== "blues") {
    const k = shown.key;
    relative = keyNameOf(k.mode === "major" ? { tonic: pc(k.tonic + 9), mode: "minor" } : { tonic: pc(k.tonic + 3), mode: "major" }, semitones);
  }
  return {
    state: live.keyState === "chart" ? "chart" : "heard",
    key: shown ? keyNameOf(shown.key, semitones) : null,
    relative,
    chord,
  };
}

/** Seconds of playing before a recap says anything about it. */
export const RECAP_MIN_HEARD_S = 20;

/**
 * What the recap may say: a key the engine estimated and that held, and the
 * chords heard most. Null for anything weaker, and for a chart's key (the
 * player picked it; hearing it back is no news).
 */
export function heardRecap(summary: HeardSummary | null): { key: HeardKeyName; relative: HeardKeyName | null; chords: string[] } | null {
  const r = summary?.reading;
  if (!summary || !r || r.keyState !== "settled" || !r.key || r.heardS < RECAP_MIN_HEARD_S) return null;
  const line = heardLine({ ...r, shownChord: null }, 0);
  if (!line || line.state !== "heard" || !line.key) return null;
  const chords = summary.chords
    .map((c) => chordNameOf(c, r.key!.key, 0))
    .filter((c): c is string => !!c);
  return { key: line.key, relative: line.relative, chords };
}

// The last stretch of free play, for the Session's recap. In memory only: it
// describes this sitting, and a recap never reads an older one.
let last: { summary: HeardSummary; at: number } | null = null;

export function rememberHeard(summary: HeardSummary | null, at = Date.now()): void {
  if (summary) last = { summary, at };
}

/** The free play heard since `since` (ms), if any. */
export function heardSince(since: number): HeardSummary | null {
  return last && last.at >= since ? last.summary : null;
}

export function forgetHeard(): void {
  last = null;
}
