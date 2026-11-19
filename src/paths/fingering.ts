/**
 * Which finger plays each note, as a teacher would write it over the tab
 * (1 index to 4 little finger, 0 an open string). Pure; the neck draws it
 * (`practiceModel.fingering`) and `fingering.test.ts` pins it for every
 * Exercise in every Path.
 *
 * The rules, in the order they decide (the fingering audit, 2026-11-18):
 *
 * 1. An open string is 0. A tapped note is the picking hand's: no number. (A
 *    hammer-on from nowhere is a hammer, `h`, and gets its finger like one.)
 * 2. A note the content fingers itself (`finger`, the tab's `f1`..`f4`) keeps
 *    that finger, and the hand is placed to match it.
 * 3. The hand sits with the index at a fret (its "base") and plays one finger
 *    per fret from there: base 1, base+1 2, base+2 3, base+3 4. The little
 *    finger may stretch one fret further (two from the 8th fret up, where the
 *    frets are narrow), as in a 5-7-9 string of a three-notes-per-string scale
 *    or the 12-to-17 top of an A minor sweep; the index may reach one fret
 *    back (the B at the G string's 4th fret in the A minor box at 5).
 * 4. On a string whose notes take that stretch, the fingers spread: the note
 *    two frets above the index is the middle finger (5-7-9 is 1-2-4, not
 *    1-3-4), as every 3nps fingering chart writes it.
 * 5. A hand that does not shift (`shifts: "none"`) keeps its base all through;
 *    a note it cannot reach from there gets no number rather than a guess.
 * 6. A hand that may shift moves as little as it can: a dynamic programme over
 *    the notes finds the bases with the fewest, shortest shifts, starting at the
 *    Exercise's declared fret. A hammer-on or a pull-off never moves the hand
 *    (the finger that sounds the note is already down); a slide IS the shift,
 *    and keeps its finger.
 * 7. A bend is the ring finger's job, with the fingers behind it pushing: one
 *    that would fall on the little finger at the top of the box is played by
 *    the ring finger reaching up a fret (the box-one bend on the B string at
 *    8), and the programme prefers a hand that puts a bend under the ring or
 *    middle finger.
 *
 * A place ("string:fret") shows one finger. When the same place is played by
 * different fingers in one Exercise, the content's own finger wins, then a
 * bend's, then the finger used most often.
 */

export type Finger = 0 | 1 | 2 | 3 | 4;

export type FingerNote = {
  string: number;
  fret: number;
  tick?: number;
  tech?: readonly string[];
  bend?: number;
  /** The content's own finger for this note, used in preference to the rules. */
  finger?: number;
};

export type HandAt = { fret: number; shifts: "none" | "allowed" };

/** One note's finger and the hand's base under it; null where no number is given. */
export type FingerStep = { finger: Finger | null; base: number | null };

const MAX_BASE = 24;
/** From this base up, the little finger may stretch two frets past its own. */
const WIDE_STRETCH_FROM = 8;
/** A bar of 4/4, the meter every Path is written in: a shift at the bar line is the natural one. */
const BAR_TICKS = 3840;

const isTap = (n: FingerNote) => !!n.tech?.includes("tap");
const isBend = (n: FingerNote) => !!n.tech?.includes("bend");
const fretted = (n: FingerNote) => n.fret > 0 && !isTap(n);

/** The plain finger for a fret under a hand at `base`, or null when out of reach. */
export function fingerAt(base: number, fret: number): Finger | null {
  const d = fret - base;
  if (d >= 0 && d <= 3) return (d + 1) as Finger;
  if (d === 4) return 4;
  if (d === 5 && base >= WIDE_STRETCH_FROM) return 4;
  // The index reaching back a fret, as for the B on the G string's 4th fret in the A minor box.
  if (d === -1 && base > 1) return 1;
  return null;
}

/** What a note costs the hand at `base`: stretches and awkward bends cost. */
function noteCost(n: FingerNote, base: number, usual?: Finger): number {
  const explicit = explicitFinger(n);
  const plain = fingerAt(base, n.fret);
  if (explicit !== null) {
    // The content's finger places the hand: its base is the one where the finger fits.
    if (plain === explicit) return 0;
    // A chord shape's finger may sit a fret off one-per-fret (the open E's ring finger on fret 2).
    const home = Math.max(1, n.fret - explicit + 1);
    return base === home ? 0 : Math.abs(base - home) === 1 ? 0.3 : Infinity;
  }
  if (plain === null) return Infinity;
  const d = n.fret - base;
  // The last term only breaks ties: with the same shifts, the index takes the lowest fret.
  let cost = (d === 4 ? 0.5 : d === 5 ? 1.2 : d === -1 ? 0.6 : 0) + 0.002 * Math.abs(d);
  if (isBend(n)) cost += plain === 4 ? 1.5 : plain === 1 ? 1 : plain === 2 ? 0.3 : 0;
  // A place keeps the finger it usually has, so the dot's number holds all through.
  if (usual !== undefined && plain !== usual) cost += 0.1;
  return cost;
}

function explicitFinger(n: FingerNote): Finger | null {
  const f = n.finger;
  return f === 1 || f === 2 || f === 3 || f === 4 ? f : null;
}

type Group = { notes: number[]; tick: number };

function groupsOf(notes: readonly FingerNote[], order: number[]): Group[] {
  const out: Group[] = [];
  for (const i of order) {
    if (!fretted(notes[i])) continue;
    const tick = notes[i].tick ?? i;
    const last = out[out.length - 1];
    if (last && last.tick === tick) last.notes.push(i);
    else out.push({ notes: [i], tick });
  }
  return out;
}

/**
 * The finger for every note, in the order given, with the hand's base under it.
 * Notes are read in time order (`tick`, then the order given).
 */
export function fingerPlan(notes: readonly FingerNote[], position: HandAt | undefined): FingerStep[] {
  const out: FingerStep[] = notes.map((n) => ({
    finger: n.fret === 0 ? 0 : !isTap(n) && explicitFinger(n) !== null ? explicitFinger(n) : null,
    base: null,
  }));
  if (!position) return out;
  const order = notes.map((_, i) => i).sort((a, b) => (notes[a].tick ?? a) - (notes[b].tick ?? b) || a - b);
  const groups = groupsOf(notes, order);
  if (groups.length === 0) return out;
  const start = Math.max(1, position.fret);
  let bases = groups.map(() => start);
  if (position.shifts !== "none") {
    // Twice: the second pass leans each place towards the finger the first gave it most.
    bases = walk(notes, groups, start);
    bases = walk(notes, groups, start, usualFingers(notes, groups, bases));
  }
  groups.forEach((g, gi) => {
    for (const i of g.notes) {
      out[i] = { finger: explicitFinger(notes[i]) ?? fingerAt(bases[gi], notes[i].fret), base: bases[gi] };
    }
  });
  spread(notes, groups, bases, out);
  bends(notes, groups, bases, out);
  return out;
}


/** The cheapest bases, group by group: few, short shifts, none inside legato, a slide keeps its finger. */
function walk(notes: readonly FingerNote[], groups: Group[], start: number, usual?: Map<string, Finger>): number[] {
  const n = groups.length;
  const cost: number[][] = [];
  const from: number[][] = [];
  // The lowest fret each bar plays: a hand whose index sits below it is a hand out of shape.
  const low = new Map<number, number>();
  for (const g of groups) {
    const bar = Math.floor(g.tick / BAR_TICKS);
    for (const i of g.notes) low.set(bar, Math.min(low.get(bar) ?? Infinity, notes[i].fret));
  }
  const groupCost = (g: Group, b: number) => {
    const idle = Math.max(0, (low.get(Math.floor(g.tick / BAR_TICKS)) ?? b) - b);
    return g.notes.reduce((s, i) => s + noteCost(notes[i], b, usual?.get(placeKey(notes[i]))) + 0.1 * idle, 0);
  };
  for (let gi = 0; gi < n; gi++) {
    cost.push(new Array(MAX_BASE + 1).fill(Infinity));
    from.push(new Array(MAX_BASE + 1).fill(-1));
    const g = groups[gi];
    for (let b = 1; b <= MAX_BASE; b++) {
      const here = groupCost(g, b);
      if (!Number.isFinite(here)) continue;
      if (gi === 0) {
        cost[0][b] = here + (b === start ? 0 : 5 + 3 * Math.abs(b - start));
        continue;
      }
      const link = linkOf(notes, groups[gi - 1], g);
      const barLine = Math.floor(g.tick / BAR_TICKS) !== Math.floor(groups[gi - 1].tick / BAR_TICKS);
      for (let p = 1; p <= MAX_BASE; p++) {
        const before = cost[gi - 1][p];
        if (!Number.isFinite(before)) continue;
        const c = before + here + moveCost(notes, link, p, b, barLine);
        if (c < cost[gi][b]) {
          cost[gi][b] = c;
          from[gi][b] = p;
        }
      }
    }
  }
  let best = 1;
  for (let b = 1; b <= MAX_BASE; b++) if (cost[n - 1][b] < cost[n - 1][best]) best = b;
  if (!Number.isFinite(cost[n - 1][best])) return groups.map(() => start);
  const bases = new Array<number>(n);
  bases[n - 1] = best;
  for (let gi = n - 1; gi > 0; gi--) bases[gi - 1] = from[gi][bases[gi]];
  return bases;
}

/** The finger each place gets most often under these bases. */
function usualFingers(notes: readonly FingerNote[], groups: Group[], bases: number[]): Map<string, Finger> {
  const counts = new Map<string, Map<Finger, number>>();
  groups.forEach((g, gi) => {
    for (const i of g.notes) {
      const f = fingerAt(bases[gi], notes[i].fret);
      if (f === null) continue;
      const k = placeKey(notes[i]);
      const c = counts.get(k) ?? new Map<Finger, number>();
      c.set(f, (c.get(f) ?? 0) + 1);
      counts.set(k, c);
    }
  });
  const out = new Map<string, Finger>();
  for (const [k, c] of counts) out.set(k, [...c.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  return out;
}

/** `pinkyRoll`: the fret of a roll across two strings, which the little finger should not take. */
type Link = {
  legato: boolean;
  slide: { from: number; to: number } | null;
  pinkyRoll: number | null;
  /** Hammer and pull pairs, [from, to]: they need two different fingers. */
  legatoPairs: [number, number][];
  /** One note to the next on another string and fret: the same finger for both is a jump. */
  step: [number, number] | null;
};

/** How one group follows the last: a hammer or pull on the same string, or a slide into it. */
function linkOf(notes: readonly FingerNote[], prev: Group, cur: Group): Link {
  let legato = false;
  let slide: Link["slide"] = null;
  const legatoPairs: [number, number][] = [];
  for (const i of cur.notes) {
    const n = notes[i];
    const before = prev.notes.find((j) => notes[j].string === n.string);
    if (before === undefined) continue;
    // Right after a tap the fretting hand was free: the pull lands on a finger already placed.
    if (i > 0 && isTap(notes[i - 1]) && notes[i - 1].string === n.string) continue;
    if (n.tech?.includes("hammer") || n.tech?.includes("pull")) {
      legato = true;
      legatoPairs.push([before, i]);
    }
    if (notes[before].tech?.includes("slide")) slide = { from: before, to: i };
  }
  const a = prev.notes.length === 1 ? notes[prev.notes[0]] : null;
  const z = cur.notes.length === 1 ? notes[cur.notes[0]] : null;
  const pinkyRoll = a && z && a.fret === z.fret && Math.abs(a.string - z.string) === 1 ? z.fret : null;
  const step = a && z && a.fret !== z.fret && a.string !== z.string ? ([prev.notes[0], cur.notes[0]] as [number, number]) : null;
  return { legato, slide, pinkyRoll, legatoPairs, step };
}

function moveCost(notes: readonly FingerNote[], link: Link, p: number, b: number, barLine: boolean): number {
  if (link.slide) {
    // The finger that slides is the finger that arrives.
    const a = explicitFinger(notes[link.slide.from]) ?? fingerAt(p, notes[link.slide.from].fret);
    const z = explicitFinger(notes[link.slide.to]) ?? fingerAt(b, notes[link.slide.to].fret);
    return a !== null && a === z ? 0.3 : 50;
  }
  const finger = (i: number, base: number) => explicitFinger(notes[i]) ?? fingerAt(base, notes[i].fret);
  // A hammer or pull from a finger to itself is no hammer or pull.
  // (Two stretched notes past the ring finger are spread apart afterwards: rule 4.)
  const spreadable = (x: number, y: number) => p === b && notes[x].fret - p >= 3 && notes[y].fret - b >= 3;
  if (link.legatoPairs.some(([x, y]) => notes[x].fret !== notes[y].fret && finger(x, p) === finger(y, b) && !spreadable(x, y))) return 50;
  if (p === b) {
    let c = link.pinkyRoll && fingerAt(b, link.pinkyRoll) === 4 ? 0.6 : 0;
    // One finger jumping to another fret while the hand stays (two stretches on one finger).
    if (link.step && finger(link.step[0], p) === finger(link.step[1], b)) c += 0.8;
    return c;
  }
  if (link.legato) return 50;
  // A shape changes at the bar line, and so does the hand.
  return (barLine ? 0.3 : 1.2) + 0.001 * Math.abs(p - b);
}

/** Runs of groups under one base: one hand position each. */
function segments(groups: Group[], bases: number[]): { base: number; notes: number[] }[] {
  const out: { base: number; notes: number[] }[] = [];
  groups.forEach((g, gi) => {
    const last = out[out.length - 1];
    if (last && last.base === bases[gi]) last.notes.push(...g.notes);
    else out.push({ base: bases[gi], notes: [...g.notes] });
  });
  return out;
}

/**
 * Rule 4: on a string that takes the little finger's stretch, the fingers
 * spread between the index and the little finger: one note between them is the
 * middle finger (the ring when it is at or past the little finger's own fret),
 * two are the middle and the ring. Read a bar at a time, so two shapes in one
 * hand position do not spread each other.
 */
function spread(notes: readonly FingerNote[], groups: Group[], bases: number[], out: FingerStep[]) {
  for (const seg of segments(groups, bases)) {
    const byString = new Map<string, number[]>();
    // A hammer or pull stays with the note it comes from, across a bar line too.
    const keyOf = new Map<number, string>();
    let last: number | null = null;
    for (const i of seg.notes) {
      const n = notes[i];
      const tied = last !== null && notes[last].string === n.string && (n.tech?.includes("hammer") || n.tech?.includes("pull"));
      const k = tied ? keyOf.get(last!)! : `${n.string}@${Math.floor((n.tick ?? 0) / BAR_TICKS)}`;
      keyOf.set(i, k);
      // Only notes the hand reaches spread; one out of reach stays unnumbered.
      if (out[i].finger !== null) byString.set(k, [...(byString.get(k) ?? []), i]);
      last = i;
    }
    for (const list of byString.values()) {
      const ds = [...new Set(list.map((i) => notes[i].fret - seg.base))].sort((a, b) => a - b);
      if (ds[ds.length - 1] < 4 || ds.length > 4) continue;
      // The top fret is the little finger's; the others close up beneath it, the index's own at 1.
      const finger = new Map<number, Finger>();
      const ranks: Finger[] =
        ds[0] > 0
          ? ([...ds.slice(0, -1).map((d) => Math.min(3, d + 1)), 4] as Finger[])
          : ds.length === 2
            ? [1, 4]
            : ds.length === 3
              ? [1, ds[1] >= 3 ? 3 : 2, 4]
              : [1, 2, 3, 4];
      ds.slice(-ranks.length).forEach((d, k) => finger.set(d, ranks[k]));
      for (const i of list) {
        const f = finger.get(notes[i].fret - seg.base);
        if (f !== undefined && explicitFinger(notes[i]) === null) out[i].finger = f;
      }
    }
  }
}

/** Rule 7: a bend at the top of the box goes to the ring finger, the others behind it. */
function bends(notes: readonly FingerNote[], groups: Group[], bases: number[], out: FingerStep[]) {
  for (const seg of segments(groups, bases)) {
    for (const i of seg.notes) {
      const n = notes[i];
      if (!isBend(n) || explicitFinger(n) !== null || out[i].finger !== 4 || n.fret - seg.base !== 3) continue;
      const below = seg.notes.some((j) => notes[j].string === n.string && notes[j].fret === n.fret - 1);
      if (!below) out[i].finger = 3;
    }
  }
}

const placeKey = (n: { string: number; fret: number }) => `${n.string}:${n.fret}`;

/**
 * The finger for each place ("string:fret" to "0".."4"), as a chord or scale
 * diagram writes it. A place with no finger is absent.
 */
export function fingersByPlace(notes: readonly FingerNote[], position: HandAt | undefined): Map<string, string> {
  const plan = fingerPlan(notes, position);
  const votes = new Map<string, { explicit: Finger | null; bend: Finger | null; counts: Map<Finger, number>; first: Finger }>();
  notes.forEach((n, i) => {
    const f = plan[i].finger;
    if (f === null) return;
    const k = placeKey(n);
    let v = votes.get(k);
    if (!v) {
      v = { explicit: null, bend: null, counts: new Map(), first: f };
      votes.set(k, v);
    }
    if (v.explicit === null && explicitFinger(n) !== null) v.explicit = f;
    if (v.bend === null && isBend(n)) v.bend = f;
    v.counts.set(f, (v.counts.get(f) ?? 0) + 1);
  });
  const out = new Map<string, string>();
  for (const [k, v] of votes) {
    let pick: Finger = v.explicit ?? v.bend ?? v.first;
    if (v.explicit === null && v.bend === null) {
      let most = v.counts.get(v.first) ?? 0;
      for (const [f, c] of v.counts) if (c > most) [pick, most] = [f, c];
    }
    out.set(k, String(pick));
  }
  return out;
}

/** The hand's first base, where the fingering starts: what the Hand line must say. */
export function firstBase(notes: readonly FingerNote[], position: HandAt | undefined): number | null {
  const plan = fingerPlan(notes, position);
  const order = notes.map((_, i) => i).sort((a, b) => (notes[a].tick ?? a) - (notes[b].tick ?? b) || a - b);
  for (const i of order) if (plan[i].base !== null) return plan[i].base;
  return null;
}

/**
 * Whether a hand that is allowed to shift ever has to: it moves under the
 * fingering, or a finger reaches outside the four frets from the declared one. When it does not,
 * "it moves along the neck" would be a lie, and `generate.ts` writes the
 * position as one that stays (the fingering audit, 2026-11-18).
 */
export function handMoves(notes: readonly FingerNote[], fret: number): boolean {
  const start = Math.max(1, fret);
  const plan = fingerPlan(notes, { fret, shifts: "allowed" });
  // A stretch past the four counts as moving: `reach.ts` reads it as a shift for a smaller hand.
  return notes.some((n, i) => (plan[i].base !== null && plan[i].base !== start) || (fretted(n) && (n.fret < start || n.fret > start + 3)));
}
