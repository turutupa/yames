/**
 * The compact tab notation specs are written in.
 *
 * Example: `/16 5:5 5:6 5:7 5:8 | /4 3:7b2v> r /2 hold`
 *
 * - `/8` sets the note value until the next one: `/1 /2 /4 /8 /16 /32`, then an
 *   optional `.` (dotted), `t` (triplet) or `q` (quintuplet: five in the time
 *   of four). `/16t` is a sextuplet note, `/16q` a sixteenth quintuplet, five
 *   to the beat.
 * - `s:f` is string and fret, string 1 the highest. Suffixes, in any order:
 *   `h` hammer-on, `p` pull-off (on the note arrived at), `s` slides out to the
 *   next note, `b2` bends two semitones, `v` vibrato, `>` accent, `m` palm
 *   mute, `l` let ring, `t` tapped with the picking hand (a loud attack with
 *   no stroke), `d` or `u` a printed stroke, `f1`..`f4` the fretting finger
 *   (index to little finger) where the rules in `fingering.ts` would not choose it.
 * - `a+b` sounds two notes together, a double stop: `3:7b2+2:5` is a unison
 *   bend. Both take the current value; the score hears one attack.
 * - `r` is a rest of the current value.
 * - `hold` lengthens the last note to the bar line, as far as one notated value
 *   can, and rests the remainder. `rest` rests to the bar line.
 * - `|` is a bar check: it throws unless a bar has just ended.
 */
import { TICKS } from "./format";
import type { PathNote, PathRest, PathTechnique, PickMark } from "./format";

/** Note values `toScore.ts` can write back out, longest first. */
export const NOTATED_TICKS: readonly number[] = [
  3840, 2880, 1920, 1440, 1280, 960, 720, 640, 480, 360, 320, 240, 192, 180, 160, 120,
];

export type ParsedTab = { notes: PathNote[]; rests: PathRest[]; totalTicks: number };

function durationOf(token: string): number {
  const match = /^\/(1|2|4|8|16|32)([.tq]?)$/.exec(token);
  if (!match) throw new Error(`bad note value: ${token}`);
  const base = (TICKS * 4) / Number(match[1]);
  if (match[2] === ".") return (base * 3) / 2;
  if (match[2] === "t") return (base * 2) / 3;
  if (match[2] === "q") {
    if (match[1] !== "16") throw new Error(`only sixteenth quintuplets are notatable: ${token}`);
    return (base * 4) / 5;
  }
  return base;
}

/** Split a span into values that can be notated, beat-aligned first. */
function splitRest(startTick: number, ticks: number): PathRest[] {
  const out: PathRest[] = [];
  let at = startTick;
  let left = ticks;
  const take = (limit: number) => {
    while (limit > 0) {
      const value = NOTATED_TICKS.find((v) => v <= limit);
      if (!value) throw new Error(`cannot notate a rest of ${limit} ticks`);
      out.push({ tick: at, dur: value });
      at += value;
      left -= value;
      limit -= value;
    }
  };
  const toBeat = (TICKS - (at % TICKS)) % TICKS;
  take(Math.min(toBeat, left));
  while (left > 0) take(Math.min(TICKS, left));
  return out;
}

/** One note of a token: `s:f` and its suffixes. */
function parseNote(part: string, token: string, tuning: readonly number[], tick: number, dur: number): PathNote {
  const match = /^(\d):(\d+)(.*)$/.exec(part);
  if (!match) throw new Error(`bad token: ${token}`);
  const string = Number(match[1]);
  const fret = Number(match[2]);
  if (string < 1 || string > tuning.length) throw new Error(`no string ${string}: ${token}`);
  const tech: PathTechnique[] = [];
  let pick: PickMark | undefined;
  let accent = false;
  let bend: number | undefined;
  let finger: PathNote["finger"];
  const suffix = match[3];
  for (let i = 0; i < suffix.length; i += 1) {
    const c = suffix[i];
    if (c === "h") tech.push("hammer");
    else if (c === "p") tech.push("pull");
    else if (c === "s") tech.push("slide");
    else if (c === "v") tech.push("vibrato");
    else if (c === "m") tech.push("palmMute");
    else if (c === "l") tech.push("letRing");
    else if (c === "t") tech.push("tap");
    else if (c === ">") accent = true;
    else if (c === "d" || c === "u") pick = c;
    else if (c === "f") {
      const f = Number(suffix[i + 1]);
      if (f !== 1 && f !== 2 && f !== 3 && f !== 4) throw new Error(`bad finger: ${token}`);
      if (fret === 0) throw new Error(`an open string takes no finger: ${token}`);
      finger = f;
      i += 1;
    }
    else if (c === "b") {
      tech.push("bend");
      bend = Number(suffix[i + 1]);
      i += 1;
      if (!Number.isFinite(bend)) throw new Error(`bad bend: ${token}`);
    } else throw new Error(`bad suffix ${c} in ${token}`);
  }
  const note: PathNote = {
    string,
    fret,
    midi: tuning[string - 1] + fret,
    tick,
    dur,
    tech,
  };
  if (pick) note.pick = pick;
  if (accent) note.accent = true;
  if (bend !== undefined) note.bend = bend;
  if (finger !== undefined) note.finger = finger;
  return note;
}

/** Parse a tab. `tuning` is MIDI per string, string 1 first. */
export function parseTab(tab: string, tuning: readonly number[], barTicks: number): ParsedTab {
  const notes: PathNote[] = [];
  const rests: PathRest[] = [];
  let tick = 0;
  let dur = TICKS;

  const toBarLine = () => {
    const into = tick % barTicks;
    return into === 0 ? 0 : barTicks - into;
  };

  for (const token of tab.trim().split(/\s+/).filter(Boolean)) {
    if (token === "|") {
      if (tick % barTicks !== 0) {
        throw new Error(
          `bar check failed at tick ${tick}: ${tick % barTicks} ticks into a ${barTicks}-tick bar`,
        );
      }
      continue;
    }
    if (token.startsWith("/")) {
      dur = durationOf(token);
      continue;
    }
    if (token === "r") {
      rests.push({ tick, dur });
      tick += dur;
      continue;
    }
    if (token === "rest") {
      const left = toBarLine();
      rests.push(...splitRest(tick, left));
      tick += left;
      continue;
    }
    if (token === "hold") {
      const last = notes[notes.length - 1];
      if (!last) throw new Error("hold with no note before it");
      const left = toBarLine();
      const span = last.dur + left;
      const value = NOTATED_TICKS.find((v) => v <= span)!;
      // Every note of a double stop is held, not only its last part.
      for (const note of notes) if (note.tick === last.tick) note.dur = value;
      if (span > value) rests.push(...splitRest(last.tick + value, span - value));
      tick += left;
      continue;
    }
    // `3:7b2+2:5` is a double stop: every part sounds at this tick, for this value.
    for (const part of token.split("+")) {
      notes.push(parseNote(part, token, tuning, tick, dur));
    }
    tick += dur;
  }
  return { notes, rests, totalTicks: tick };
}

const isLegatoArrival = (n: PathNote) => n.tech.includes("hammer") || n.tech.includes("pull");

/** Is this note picked? A hammer, a pull, a tap or a slid-to note is not. */
export function isPicked(note: PathNote, previous: PathNote | undefined): boolean {
  if (isLegatoArrival(note)) return false;
  if (note.tech.includes("tap")) return false;
  if (previous && previous.tech.includes("slide") && previous.string === note.string) return false;
  return true;
}

/**
 * Alternate strokes on picked notes. A beat or more between two onsets lets the
 * hand reset, so the next burst starts on the plan's first stroke again. Marks
 * the spec already wrote are kept.
 */
export function markAlternate(notes: PathNote[], start: PickMark = "d"): void {
  let next: PickMark = start;
  notes.forEach((note, index) => {
    const previous = notes[index - 1];
    if (previous && note.tick - previous.tick >= TICKS) next = start;
    if (!isPicked(note, previous)) return;
    note.pick = note.pick ?? next;
    next = note.pick === "d" ? "u" : "d";
  });
}

/**
 * Economy strokes: alternate on a string, and a string change takes the stroke
 * the pick is travelling in (down toward the higher strings, up toward the
 * lower), so a stroke that ends one string carries on through the next. A beat
 * or more between onsets resets to `start`, as `markAlternate` does. Marks the
 * spec already wrote are kept.
 */
export function markEconomy(notes: PathNote[], start: PickMark = "d"): void {
  let last: PathNote | undefined;
  notes.forEach((note, index) => {
    if (!isPicked(note, notes[index - 1])) return;
    const near = last && note.tick - last.tick < TICKS ? last : undefined;
    if (!note.pick) {
      if (!near?.pick) note.pick = start;
      else if (near.string !== note.string) note.pick = note.string < near.string ? "d" : "u";
      else note.pick = near.pick === "d" ? "u" : "d";
    }
    last = note;
  });
}

/**
 * Sweep strokes. Crossing toward the higher strings is one downward push;
 * crossing back is one upward push. Picked notes on one string alternate.
 *
 * Two picked notes belong to one motion when the line between them never
 * stops for a beat or more. The notes between count: a hammer and a pull at
 * the top of a loop keep the hand moving, so the picked note after them is
 * judged against the one before them even when that is a full beat back.
 */
export function markSweep(notes: PathNote[]): void {
  const picked = notes.map((n, i) => (isPicked(n, notes[i - 1]) ? i : -1)).filter((i) => i >= 0);
  /** No gap of a beat or more between any two onsets from `from` to `to`. */
  const joined = (from: number, to: number): boolean => {
    for (let i = from + 1; i <= to; i++) if (notes[i].tick - notes[i - 1].tick >= TICKS) return false;
    return true;
  };
  picked.forEach((noteIndex, order) => {
    const note = notes[noteIndex];
    if (note.pick) return;
    const nextIndex = picked[order + 1];
    const previousIndex = picked[order - 1];
    const previous =
      previousIndex !== undefined && joined(previousIndex, noteIndex) ? notes[previousIndex] : undefined;
    const next = nextIndex !== undefined && joined(noteIndex, nextIndex) ? notes[nextIndex] : undefined;
    if (previous && previous.string !== note.string) {
      note.pick = note.string < previous.string ? "d" : "u";
    } else if (next && next.string !== note.string) {
      note.pick = next.string < note.string ? "d" : "u";
    } else if (previous?.pick) {
      note.pick = previous.pick === "d" ? "u" : "d";
    } else {
      note.pick = "d";
    }
  });
}
