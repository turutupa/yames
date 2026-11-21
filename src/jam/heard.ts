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
import { chordName, chordNotes, keyRootName, parseChordName, sameChord, transposeChord } from "./harmony";
import type { Chord, ChordQuality, Key } from "./harmony";
import type { JamHarmony } from "./display";
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

/** A sentence the page words: an i18n key and its values (the coach's `Line`). */
export type HeardSentence = { key: string; values: Record<string, string | number> };

/**
 * The line under Jam's stage when a jam stops (leg c5a1; DESIGN 8, Jam's
 * row): the chords the engine named from the player's notes, most first, beside
 * the chords the chart has. Stated as heard, never as a mistake: the two lists
 * stand side by side and nothing says which of them was "right".
 *
 * What the reading supports, and so what the line may claim:
 *
 * - **Chords only where the engine estimated them.** With the jam's chart sent
 *   (`heardChart`: the timeline's chord names on), the engine takes the chart as
 *   the truth and names no chord of its own (`harmony/mod.rs` `close_beat`), the
 *   key reads "chart", and the summary's `chords` are empty: no line. Only a jam
 *   heard without its chart has chords of the player's own to set beside it.
 * - **The recap's floor** (`heardRecap`): a key that settled, and at least
 *   `RECAP_MIN_HEARD_S` of playing. And at least one chord: a line of single
 *   notes names none (a chord is named only when a beat held several voices).
 * - **Five qualities.** The engine names major, minor, 7, maj7 and m7 from a
 *   triad and a seventh, so it cannot tell a chord from another with the same
 *   notes (Am7 and C6 are one set). When every note of a chord it named is
 *   in a chart chord of another name, a second sentence says exactly that,
 *   so "C" beside a chart of Am7 does not read as "you played something else".
 *
 * Names: the heard chords through `chordNameOf`, spelled in the jam's key and
 * transposed as the jam is read; the chart's as the Jam screen writes them.
 */
export function jamHeardLine(summary: HeardSummary | null | undefined, chart: JamHarmony): HeardSentence[] | null {
  const r = summary?.reading;
  if (!summary || !r || r.keyState !== "settled" || !r.key || r.heardS < RECAP_MIN_HEARD_S) return null;
  const semitones = pc(chart.key.root - chart.concert.root);
  const spell: HeardKey = { tonic: pc(chart.concert.root), mode: chart.concert.mode };
  const charted: { chord: Chord; name: string }[] = [];
  for (const chord of chart.chords) {
    if (!charted.some((c) => sameChord(c.chord, chord))) charted.push({ chord, name: chordName(chord, chart.key) });
  }
  if (charted.length === 0) return null;
  const heard: { chord: Chord; name: string }[] = [];
  for (const c of summary.chords) {
    if (!c.quality) continue;
    const name = chordNameOf(c, spell, semitones);
    if (!name) continue;
    const chord = transposeChord({ root: pc(c.root), quality: QUALITY[c.quality] }, semitones);
    if (!heard.some((h) => sameChord(h.chord, chord))) heard.push({ chord, name });
  }
  if (heard.length === 0) return null;
  const lines: HeardSentence[] = [
    { key: "jam.heard.stopLine", values: { heard: heard.map((h) => h.name).join(", "), chart: charted.map((c) => c.name).join(", ") } },
  ];
  for (const h of heard) {
    if (charted.some((c) => sameChord(c.chord, h.chord))) continue;
    const notes = chordNotes(h.chord);
    const holding = charted.filter((c) => {
      const has = chordNotes(c.chord);
      return notes.every((n) => has.includes(n));
    });
    if (holding.length > 0) {
      lines.push({ key: "jam.heard.sameNotes", values: { heard: h.name, chart: holding.map((c) => c.name).join(", ") } });
    }
  }
  return lines;
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
