/**
 * Jam — the keys player, second pass (2026-09-16).
 *
 * `./keysline` could hold a chord for the bar or stab it off the beat, and
 * that was the whole player. This module is the comping vocabulary the owner
 * asked for — a style per music family, a voicing that sounds like the style,
 * and a rhythm that does not repeat itself bar after bar.
 *
 * ## The styles
 *
 * | style        | what it is                                              |
 * |--------------|---------------------------------------------------------|
 * | pads         | the chord held through the bar (a new one mid-bar)      |
 * | stabs        | off the beat, answering the snare                       |
 * | pulse        | a chord on every beat — the pop, rock and country piano |
 * | arpeggio     | the chord broken into single notes, up and back down    |
 * | charleston   | jazz comping from a small set of rhythms, rotated       |
 * | skank        | reggae: short chords on the backbeat (ska: every "and") |
 * | montuno      | the two-bar Cuban piano figure, for son, mambo, salsa   |
 * | bossaComp    | the gentler off-beat bossa comping                      |
 * | shuffleComp  | the blues piano's triplet push                          |
 *
 * `montuno` is for the salsa family only and `bossaComp` for the bossa one:
 * a montuno over a bossa is the wrong room (the review of the plan said so,
 * and `autoKeysStyle` keeps them apart).
 *
 * ## The voicing follows the style
 *
 * - **Jazz** voicings leave the root to the bass — third, seventh, ninth,
 *   with the fifth if there is room. Only when there IS a bass: without one
 *   the harmony would float, so the root comes back.
 * - **Rock, metal and the pulse styles** put the root in the left hand under
 *   a plain triad. Never a bare power chord: a fifth on a keyboard is thin,
 *   and a keys player under a guitarist's power chord plays the triad.
 * - Everything else is the close, voice-led voicing of `./keysline`.
 *
 * Deterministic like the bass: the rotation comes from the bar's place in the
 * form and the velocity wobble from the tick's place in the bar, never from a
 * random number.
 */
import {
  centreCost,
  chooseVoicing,
  closeVoicings,
  distanceToSet,
  KEYS_MAX_LEAP,
  snareTicks,
} from "./keysline";
import { chordNotes } from "./harmony";
import type { Chord } from "./harmony";
import type { GrooveFamily } from "./grooves";
import type { JamFeel, JamKeysLine, JamKeysStyle, JamPattern } from "./types";

export const JAM_KEYS_STYLES_ALL: readonly JamKeysStyle[] = [
  "pads",
  "stabs",
  "pulse",
  "arpeggio",
  "charleston",
  "skank",
  "montuno",
  "bossaComp",
  "shuffleComp",
];

/**
 * The left hand's octave: C3 to B3, the bottom of the engine's keys range
 * (C3 to C6). Every root has exactly one place in it.
 */
const LEFT_HAND_LOW = 48;
const LEFT_HAND_HIGH = 59;
/** The top of the engine's keys range, C6. */
const KEYS_TOP = 84;

// ---------------------------------------------------------------------------
// The auto choice
// ---------------------------------------------------------------------------

const AUTO_BY_GROOVE: Record<string, JamKeysStyle> = {
  bossa: "bossaComp",
  latinBossa23: "bossaComp",
  samba: "bossaComp",
  latinBaiao: "bossaComp",
  latinPartidoAlto: "bossaComp",
  mambo: "montuno",
  latinSon: "montuno",
  latinSongo: "montuno",
  latinCascara: "montuno",
  chaCha: "montuno",
  latinGuaguanco: "montuno",
  latinMerengue: "montuno",
  latinBolero: "arpeggio",
  oneDrop: "skank",
  worldSteppers: "skank",
  worldRockers: "skank",
  worldRocksteady: "skank",
  worldSka: "skank",
  worldAfrobeat: "stabs",
  worldHighlife: "stabs",
  funkSlowJam: "pads",
  funkGospel: "pulse",
  ballad: "arpeggio",
  popBallad: "arpeggio",
  countryBallad: "arpeggio",
  waltz: "arpeggio",
  rockWaltz: "arpeggio",
  jazzBallad: "pads",
  popDisco: "stabs",
  popHouse: "stabs",
  halfTime: "pads",
  rockGrunge: "pads",
  metalDoom: "pads",
};

const AUTO_BY_FAMILY: Record<GrooveFamily, JamKeysStyle> = {
  rock: "pulse",
  blues: "shuffleComp",
  country: "pulse",
  latin: "bossaComp",
  jazz: "charleston",
  funk: "stabs",
  world: "stabs",
  pop: "pulse",
  metal: "pads",
};

/** What `auto` plays under this groove. */
export function autoKeysStyle(
  grooveId: string | null | undefined,
  family: GrooveFamily | null | undefined,
): JamKeysStyle {
  if (grooveId && AUTO_BY_GROOVE[grooveId]) return AUTO_BY_GROOVE[grooveId];
  return family ? AUTO_BY_FAMILY[family] : "pads";
}

export function resolveKeysStyle(
  requested: JamKeysStyle | "auto" | null | undefined,
  grooveId: string | null | undefined,
  family: GrooveFamily | null | undefined,
): JamKeysStyle {
  return requested && requested !== "auto" && (JAM_KEYS_STYLES_ALL as readonly string[]).includes(requested)
    ? requested
    : autoKeysStyle(grooveId, family);
}

// ---------------------------------------------------------------------------
// Voicings
// ---------------------------------------------------------------------------

type VoicingKind = "close" | "rootless" | "leftHand";

function voicingKind(style: JamKeysStyle, family: GrooveFamily | null | undefined, bass: boolean): VoicingKind {
  if (bass && (family === "jazz" || style === "charleston" || style === "bossaComp")) return "rootless";
  if (family === "rock" || family === "metal" || style === "pulse") return "leftHand";
  return "close";
}

/** The chord without its root, with a ninth where there is room: jazz grip. */
function rootlessTones(chord: Chord): number[] {
  const notes = chordNotes(chord);
  const root = notes[0];
  const upper = notes.slice(1);
  // A triad without its root is two notes: add the ninth, and the sixth on a
  // major chord that has no seventh, so the grip has four notes to lead with.
  if (upper.length < 3) upper.push((root + 2) % 12);
  if (upper.length < 3) upper.push((root + 9) % 12);
  // Four at most; the fifth goes first, as in `voicingTones`.
  while (upper.length > 4) upper.splice(1, 1);
  return upper;
}

function leadVoicing(tones: number[], previous: readonly number[] | null): number[] {
  const candidates = closeVoicings(tones);
  if (candidates.length === 0) return [];
  if (!previous || previous.length === 0) {
    return [...candidates].sort((a, b) => centreCost(a) - centreCost(b))[0];
  }
  const near = candidates.filter((v) => v.every((n) => distanceToSet(previous, n) <= KEYS_MAX_LEAP));
  const pool = near.length > 0 ? near : candidates;
  let best = pool[0];
  let bestCost = Infinity;
  for (const v of pool) {
    const cost = v.reduce((sum, n) => sum + distanceToSet(previous, n), 0) + centreCost(v) * 0.01;
    if (cost < bestCost) {
      bestCost = cost;
      best = v;
    }
  }
  return best;
}

/** The voicing for this chord, in this style's grip, led from `previous`. */
export function voicingFor(
  chord: Chord,
  kind: VoicingKind,
  previous: readonly number[] | null,
): number[] {
  if (kind === "rootless") {
    // Led from the previous grip's upper notes: a left-hand root from a
    // pulse bar is not where a jazz hand is.
    const upper = previous?.filter((n) => n > LEFT_HAND_HIGH) ?? null;
    return leadVoicing(rootlessTones(chord), upper && upper.length > 0 ? upper : previous);
  }
  if (kind === "leftHand") {
    const notes = chordNotes(chord);
    // A triad over the left-hand root: no seventh on top (four notes is the
    // engine's limit). A power chord (`5`, "no third") keeps its meaning —
    // the right hand plays root, fifth and octave rather than inventing a
    // third the guitarist is not playing, and the left hand gives it the
    // weight a bare fifth lacks.
    const triad = notes.length === 2 ? [notes[0], notes[1]] : notes.slice(0, 3);
    const left = LEFT_HAND_LOW + (((notes[0] - LEFT_HAND_LOW) % 12) + 12) % 12;
    if (notes.length === 2) {
      // Root, fifth, octave, an octave over the left hand: the one grip that
      // is what everybody means by a power chord on a keyboard.
      return [left, left + 12, left + 19, left + 24];
    }
    const right = leadVoicing(triad, previous);
    // Everything the right hand plays sits above the left hand; a note that
    // landed at or under it goes up an octave rather than being dropped.
    const hand = [...new Set(right.map((n) => (n <= left ? n + 12 : n)))]
      .filter((n) => n <= KEYS_TOP)
      .sort((a, b) => a - b)
      .slice(0, 3);
    return [left, ...hand];
  }
  return chooseVoicing(chord, previous);
}

// ---------------------------------------------------------------------------
// Rhythm
// ---------------------------------------------------------------------------

export type KeysPartArgs = {
  chords: { bar: Chord; half?: Chord | null; next?: Chord | null };
  groove: JamPattern;
  grooveId?: string | null;
  family?: GrooveFamily | null;
  style: JamKeysStyle;
  feel: JamFeel;
  meter: { beatsPerBar: number; ticksPerBeat: number };
  previous?: number[] | null;
  barIndex?: number;
  formBars?: number;
  /** Is a bass player on? Decides whether a jazz grip may leave the root out. */
  bass?: boolean;
  gain?: number;
};

type Hit = { tick: number; beats: number; velocity: number; top?: number };

/** Per tick, not per bar — see `wobble` in `./bassFigures`. */
function wobble(tick: number): number {
  let h = (tick * 40503 + 2654435761) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  return ((h & 0xffff) / 0xffff) * 2 - 1;
}

export function keysPartFor(args: KeysPartArgs): JamKeysLine {
  const beats = Math.max(0, Math.trunc(args.meter.beatsPerBar));
  const tpb = Math.max(1, Math.trunc(args.meter.ticksPerBeat));
  const length = beats * tpb;
  const barIndex = Math.max(0, Math.trunc(args.barIndex ?? 0));
  const formBars = Math.max(1, Math.trunc(args.formBars ?? 1));
  const voicings: number[][] = Array.from({ length }, () => []);
  const velocities = new Array<number>(length).fill(1);
  const lengths = new Array<number>(length).fill(0);
  if (length === 0) return { voicings, gain: clampGain(args.gain), velocities, lengths };

  const kind = voicingKind(args.style, args.family, args.bass ?? true);
  const halfTick = Math.floor(beats / 2) * tpb;
  const first = voicingFor(args.chords.bar, kind, args.previous ?? null);
  const second = args.chords.half ? voicingFor(args.chords.half, kind, first) : first;
  const voicingAt = (tick: number) => (args.chords.half && tick >= halfTick ? second : first);

  const hits = rhythm(args.style, { beats, tpb, barIndex, groove: args.groove, grooveId: args.grooveId ?? null, halfTick, hasHalf: !!args.chords.half });
  const phraseEnd = (barIndex + 1) % 4 === 0 || barIndex === formBars - 1;

  for (const hit of hits) {
    if (hit.tick < 0 || hit.tick >= length) continue;
    const v = voicingAt(hit.tick);
    const notes = hit.top !== undefined ? [v[Math.min(hit.top, v.length - 1)]] : v;
    voicings[hit.tick] = notes.filter((n) => Number.isFinite(n));
    velocities[hit.tick] = round(clampVel(hit.velocity * (1 + 0.05 * wobble(hit.tick))));
    lengths[hit.tick] = hit.beats > 0 ? round(Math.max(0.3, hit.beats * tpb)) : 0;
  }

  // The push: a held style anticipates the next chord on the last "and" of a
  // phrase, the way a pianist leans into the turn.
  if (phraseEnd && args.style === "pads" && args.chords.next && tpb >= 2 && beats >= 2) {
    const t = (beats - 1) * tpb + (tpb === 3 ? 2 : tpb / 2);
    const nextVoicing = voicingFor(args.chords.next, kind, voicingAt(t));
    voicings[t] = nextVoicing;
    velocities[t] = 0.95;
    lengths[t] = 0;
  }

  return { voicings, gain: clampGain(args.gain), velocities, lengths };
}

const round = (x: number) => Math.round(x * 1000) / 1000;
const clampVel = (v: number) => Math.max(0.3, Math.min(1.4, v));
const clampGain = (g: number | undefined) => Math.max(0.5, Math.min(1.5, g ?? 1));

type RhythmCtx = {
  beats: number;
  tpb: number;
  barIndex: number;
  groove: JamPattern;
  grooveId: string | null;
  halfTick: number;
  hasHalf: boolean;
};

/** The tick `frac` of a beat into `beat`, or null off the grid. */
function tickAt(c: RhythmCtx, beat: number, frac: number): number | null {
  if (beat < 0 || beat >= c.beats) return null;
  const off = frac === 0.5 ? (c.tpb === 3 ? 2 : c.tpb % 2 === 0 ? c.tpb / 2 : null) : frac * c.tpb;
  if (off === null || Math.abs(off - Math.round(off)) > 1e-9) return null;
  return beat * c.tpb + Math.round(off);
}

/** Eighth-note grid positions, as ticks, when the grid has eighths. */
function eighths(c: RhythmCtx, positions: number[]): number[] {
  const out: number[] = [];
  for (const p of positions) {
    const t = tickAt(c, Math.floor(p / 2), p % 2 === 0 ? 0 : 0.5);
    if (t !== null) out.push(t);
  }
  return out;
}

function rhythm(style: JamKeysStyle, c: RhythmCtx): Hit[] {
  const { beats, tpb } = c;
  const all = (ticks: number[], b: number, v: number): Hit[] => ticks.map((tick) => ({ tick, beats: b, velocity: v }));
  switch (style) {
    case "pads": {
      const hits: Hit[] = [{ tick: 0, beats: 0, velocity: 0.9 }];
      if (c.hasHalf) hits.push({ tick: c.halfTick, beats: 0, velocity: 0.85 });
      return hits;
    }
    case "stabs": {
      let ticks: number[];
      if (beats === 4 && tpb >= 2) {
        ticks = [tickAt(c, 1, 0.5), tickAt(c, 3, 0.5)].filter((t): t is number => t !== null);
        // Every other bar the second stab anticipates, the Basie habit.
        if (c.barIndex % 2 === 1) ticks = [ticks[0], tickAt(c, 2, 0.5) ?? ticks[1]];
      } else {
        const snare = snareTicks(c.groove, beats * tpb);
        ticks = snare.length > 0 ? snare : [0];
      }
      return all(ticks, 0.3, 1);
    }
    case "pulse": {
      const hits: Hit[] = [];
      for (let beat = 0; beat < beats; beat++) {
        hits.push({ tick: beat * tpb, beats: 0.8, velocity: beat % 2 === 0 ? 0.95 : 0.85 });
      }
      // The push on the last "and" of every other bar.
      const push = tickAt(c, beats - 1, 0.5);
      if (push !== null && c.barIndex % 2 === 1) hits.push({ tick: push, beats: 0.4, velocity: 0.9 });
      return hits;
    }
    case "arpeggio": {
      // Up and back down the voicing, one note per eighth (per triplet in a
      // triplet grid, per beat on a quarter grid).
      const step = tpb === 3 || tpb === 6 ? tpb / 3 : tpb >= 2 ? tpb / 2 : tpb;
      const order = [0, 1, 2, 3, 2, 1];
      const hits: Hit[] = [];
      let i = c.barIndex % 2;
      for (let t = 0; t < beats * tpb; t += step) {
        hits.push({ tick: t, beats: 0, velocity: t % tpb === 0 ? 0.88 : 0.72, top: order[i % order.length] });
        i++;
      }
      return hits;
    }
    case "charleston": {
      if (beats !== 4) return all([0, c.halfTick].filter((t, k, a) => a.indexOf(t) === k), 0.6, 0.9);
      // Four rhythms a comping hand moves between, chosen by the bar.
      const patterns: [number, number][][] = [
        [[0, 0], [1, 0.5]], // the Charleston: one, and the "and" of two
        [[1, 0], [3, 0]], // two and four, short
        [[0, 0.5], [2, 0]], // the "and" of one, then three
        [[1, 0.5], [3, 0.5]], // both anticipations
      ];
      const pick = patterns[(c.barIndex * 7 + (c.barIndex >> 2)) % patterns.length];
      const hits: Hit[] = [];
      for (const [beat, frac] of pick) {
        const t = tickAt(c, beat, frac);
        if (t !== null) hits.push({ tick: t, beats: 0.6, velocity: frac ? 0.95 : 0.85 });
      }
      return hits.length > 0 ? hits : [{ tick: 0, beats: 0.6, velocity: 0.9 }];
    }
    case "skank": {
      const ska = c.grooveId === "worldSka";
      const hits: Hit[] = [];
      for (let beat = 0; beat < beats; beat++) {
        if (ska) {
          const t = tickAt(c, beat, 0.5);
          if (t !== null) hits.push({ tick: t, beats: 0.25, velocity: 0.95 });
        } else if (beat % 2 === 1) {
          hits.push({ tick: beat * tpb, beats: 0.25, velocity: 1 });
        }
      }
      return hits;
    }
    case "montuno": {
      if (tpb % 2 !== 0 && tpb !== 3) return rhythm("pulse", c);
      // The two-bar figure on eighths: a full chord on the accents, the top
      // note alone between them.
      const a = [0, 1, 3, 5, 6];
      const b = [1, 2, 4, 5, 7];
      const positions = (c.barIndex % 2 === 0 ? a : b).filter((p) => p < beats * 2);
      const accents = new Set(c.barIndex % 2 === 0 ? [0, 3, 6] : [2, 5]);
      return eighths(c, positions).map((tick, k) => ({
        tick,
        beats: 0.45,
        velocity: accents.has(positions[k]) ? 1 : 0.8,
        top: accents.has(positions[k]) ? undefined : 3,
      }));
    }
    case "bossaComp": {
      const positions = (c.barIndex % 2 === 0 ? [0, 3, 6] : [2, 5]).filter((p) => p < beats * 2);
      return eighths(c, positions).map((tick) => ({ tick, beats: 0.9, velocity: 0.85 }));
    }
    case "shuffleComp": {
      if (tpb !== 3) return rhythm("pulse", c);
      const hits: Hit[] = [];
      for (let beat = 0; beat < beats; beat++) {
        hits.push({ tick: beat * 3, beats: 0.55, velocity: beat % 2 === 0 ? 0.92 : 0.82 });
        hits.push({ tick: beat * 3 + 2, beats: 0.3, velocity: 0.7 });
      }
      return hits;
    }
  }
}
