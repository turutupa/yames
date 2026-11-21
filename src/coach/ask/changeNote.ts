/**
 * The note that makes a change audible (leg c5a1; DESIGN 8, Jam's row; the
 * guitarist's review, objection 16): on the Jam screen, a theory answer about
 * a chord of the jam's chart adds one line naming the note that moves by a step
 * from the chord before it into this one.
 *
 * Worked out by the app from the chart the Jam screen shows (`jamHarmony`),
 * never by a model. Every note is spelled by letter from the chord as the
 * screen writes it (`spellChord`, as the theory cards since c2b2ab), so the
 * line says G# in E7 and Eb in Cm, never a key-wide sharp or flat.
 *
 * What it says, and when it says nothing:
 *
 * - **The change**: the first bar of the form whose chord is the one asked
 *   about and whose bar before it (the form loops: bar 1's is the last) holds
 *   another chord. The line names both ("When G7 comes after Dm7"), so it stays
 *   true when the chord comes after other chords elsewhere in the form.
 * - **The note**: a note of the chord before that this chord does not have,
 *   moving a half step or a whole step to a note this chord has and the one
 *   before did not. Of several, the one landing on this chord's third, then its
 *   seventh, then the smaller step, then the lower note in the chord's stack.
 * - **Nothing** when the chord is not in the chart, the chart has no other
 *   chord before it, or no note leaves by a step (A to A7 only adds a note;
 *   nothing moves). An answer that cannot be said truthfully is not said.
 */
import { jamHarmony, type JamHarmony } from "../../jam/display";
import type { CoachContext } from "../context";
import type { FactCard, NoCard } from "./cards";
import { chordIntervals, chordName, chordNotes, parseChordName, pitchClass, sameChord, type Chord } from "../../jam/harmony";
import { spellChord } from "../../paths/theory";
import type { Line } from "../tools/types";

type Tone = { pc: number; name: string; interval: number; order: number };

function tonesOf(symbol: string, chord: Chord): Tone[] | null {
  let names: string[];
  try {
    names = spellChord(symbol);
  } catch {
    return null;
  }
  const intervals = chordIntervals(chord.quality);
  if (names.length !== intervals.length) return null;
  return intervals.map((interval, order) => ({ pc: pitchClass(chord.root + interval), name: names[order], interval: interval % 12, order }));
}

/** What the arriving note is in the chord it arrives in: its third, its seventh, or another tone. */
function roleOf(tone: Tone, chord: Chord): "third" | "seventh" | null {
  if (tone.interval === 3 || tone.interval === 4) return "third";
  if (tone.interval === 10 || tone.interval === 11 || (chord.quality === "dim7" && tone.interval === 9)) return "seventh";
  return null;
}

/** Signed semitones from one pitch class to another, the short way round. */
function stepBetween(from: number, to: number): number {
  const up = pitchClass(to - from);
  return up > 6 ? up - 12 : up;
}

/** The note that moves into `asked` in the jam's chart, as up to two lines; null when there is none to name. */
export function changeNoteLines(chart: JamHarmony, asked: string): Line[] | null {
  const want = parseChordName(asked);
  if (!want) return null;
  const bars = chart.chords;
  const n = bars.length;
  if (n < 2) return null;
  const at = bars.findIndex((chord, i) => sameChord(chord, want) && !sameChord(bars[(i - 1 + n) % n], want));
  if (at < 0) return null;
  const before = bars[(at - 1 + n) % n];
  const here = bars[at];
  const from = chordName(before, chart.key);
  const to = chordName(here, chart.key);
  const leaving = tonesOf(from, before);
  const arriving = tonesOf(to, here);
  if (!leaving || !arriving) return null;
  const herePcs = new Set(chordNotes(here));
  const beforePcs = new Set(chordNotes(before));
  const leaves = leaving.filter((t) => !herePcs.has(t.pc));
  const arrives = arriving.filter((t) => !beforePcs.has(t.pc));
  const rank = (role: "third" | "seventh" | null) => (role === "third" ? 0 : role === "seventh" ? 1 : 2);
  let best: { l: Tone; a: Tone; step: number; role: "third" | "seventh" | null } | null = null;
  for (const a of arrives) {
    const role = roleOf(a, here);
    for (const l of leaves) {
      const step = stepBetween(l.pc, a.pc);
      if (step === 0 || Math.abs(step) > 2) continue;
      const better =
        !best ||
        rank(role) < rank(best.role) ||
        (rank(role) === rank(best.role) &&
          (Math.abs(step) < Math.abs(best.step) ||
            (Math.abs(step) === Math.abs(best.step) && (a.order < best.a.order || (a.order === best.a.order && l.order < best.l.order)))));
      if (better) best = { l, a, step, role };
    }
  }
  if (!best) return null;
  const size = Math.abs(best.step) === 1 ? "half" : "whole";
  const way = best.step > 0 ? "Up" : "Down";
  const lines: Line[] = [{ key: `jam.change.${size}${way}`, values: { from, to, note: best.l.name, target: best.a.name } }];
  if (best.role) lines.push({ key: `jam.change.${best.role}`, values: { to, target: best.a.name } });
  return lines;
}

/**
 * A theory card (`scale_fits`, `chord_notes`) with the change's note after its
 * own lines: only on the Jam screen (`ctx.jam` is set only there), only for a
 * chord the card could read, only when the chart gives one to name. Anything
 * else comes back as it was.
 */
export function withChangeNote(card: FactCard | NoCard, ctx: CoachContext, root: string, suffix: string): FactCard | NoCard {
  if (!("shape" in card) || card.uncertain || !ctx.jam) return card;
  let extra: Line[] | null = null;
  try {
    extra = changeNoteLines(jamHarmony(ctx.jam.jam), `${root}${suffix}`);
  } catch {
    extra = null;
  }
  return extra ? { ...card, lines: [...card.lines, ...extra] } : card;
}
