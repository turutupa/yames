/**
 * An Exercise as the app's own score.
 *
 * `plans/SONGS.md` A2 and `score.rs` both say one format serves a song, an
 * exercise and a path step. This is the adapter that makes that true: an
 * Exercise's notes become a `SongScore`, which goes through `buildSchedule` and
 * on to `match_attempt` like any song, and an alphaTex text that goes through
 * the real importer and draws on the real tab view. `toScore.test.ts` holds the
 * two to each other, note for note.
 *
 * What the format cannot hold, and the Exercise wrapper holds instead: pick
 * marks, the pass bars, the why, the rest windows and the landings.
 */
import { TICKS_PER_QUARTER } from "../songs/types";
import type { SongNote, SongScore, SongTechnique } from "../songs/types";
import type { Exercise, PathNote } from "./format";
import { STANDARD_TUNING, barLengthTicks } from "./format";

export function exerciseScore(pathId: string, ex: Exercise, bpm: number): SongScore {
  const barTicks = barLengthTicks(ex.meter);
  const sorted = [...ex.notes].sort((a, b) => a.tick - b.tick || a.string - b.string);
  const notes: SongNote[] = sorted.map((n, id) => ({
    id,
    tick: n.tick,
    durTicks: n.dur,
    string: n.string,
    fret: n.fret,
    midi: n.midi,
    tieFromPrevious: false,
    ghost: false,
    dead: false,
    accent: n.accent === true,
    techniques: [...n.tech] as SongTechnique[],
  }));
  return {
    schema: 1,
    id: `path:${pathId}/${ex.id}`,
    title: ex.title,
    artist: "",
    source: {
      fileName: `${pathId}-${ex.id}.alphatex`,
      format: "alphatex",
      trackIndex: 0,
      trackName: "Guitar",
    },
    tuning: [...STANDARD_TUNING],
    capo: 0,
    ticksPerQuarter: TICKS_PER_QUARTER,
    tempoMap: [{ tick: 0, bpm }],
    meterMap: [{ bar: 0, numerator: ex.meter.numerator, denominator: ex.meter.denominator }],
    bars: Array.from({ length: ex.bars }, (_unused, index) => ({
      index,
      startTick: index * barTicks,
      lengthTicks: barTicks,
      printedBar: index,
    })),
    notes,
    sections: [],
  };
}

/** alphaTex's duration token for a value in ticks. */
function durationToken(ticks: number): string {
  const table: Record<number, string> = {
    3840: "1",
    2880: "2{d}",
    1920: "2",
    1440: "4{d}",
    1280: "2{tu 3}",
    960: "4",
    720: "8{d}",
    640: "4{tu 3}",
    480: "8",
    360: "16{d}",
    320: "8{tu 3}",
    240: "16",
    192: "16{tu 5}",
    180: "32{d}",
    160: "16{tu 3}",
    120: "32",
  };
  const token = table[ticks];
  if (!token) throw new Error(`no alphaTex value for ${ticks} ticks`);
  return token;
}

function noteEffects(note: PathNote, next: PathNote | undefined): string {
  const effects: string[] = [];
  if (next && next.string === note.string) {
    if (next.tech.includes("hammer") || next.tech.includes("pull")) effects.push("h");
  }
  if (note.tech.includes("slide")) effects.push("ss");
  if (note.tech.includes("bend") && note.bend) effects.push(`b (0 ${note.bend * 2})`);
  if (note.tech.includes("vibrato")) effects.push("v");
  if (note.tech.includes("palmMute")) effects.push("pm");
  if (note.tech.includes("letRing")) effects.push("lr");
  if (note.accent) effects.push("ac");
  return effects.length ? `{${effects.join(" ")}}` : "";
}

/** The Exercise as alphaTex: what the importer and the tab view read. */
export function exerciseAlphaTex(ex: Exercise, bpm: number): string {
  const barTicks = barLengthTicks(ex.meter);
  type Item = { tick: number; text: string };
  const items: Item[] = [];
  ex.rests.forEach((r) => items.push({ tick: r.tick, text: `r.${durationToken(r.dur)}` }));
  // Notes sharing a tick are one beat: a double stop is `(5.3 5.2).8`. The
  // note a hammer or pull arrives at is on the same string at the next onset.
  const nextOnString = (index: number) => {
    const note = ex.notes[index];
    const later = ex.notes.slice(index + 1).filter((n) => n.tick > note.tick);
    return later.find((n) => n.tick === later[0].tick && n.string === note.string) ?? later[0];
  };
  const byTick = new Map<number, number[]>();
  ex.notes.forEach((note, index) => byTick.set(note.tick, [...(byTick.get(note.tick) ?? []), index]));
  for (const [tick, indexes] of byTick) {
    const parts = indexes.map((i) => `${ex.notes[i].fret}.${ex.notes[i].string}${noteEffects(ex.notes[i], nextOnString(i))}`);
    // A tap is a beat effect in alphaTex: it joins the duration's braces.
    const tapped = indexes.some((i) => ex.notes[i].tech.includes("tap"));
    const plain = durationToken(ex.notes[indexes[0]].dur);
    const value = !tapped ? plain : plain.includes("{") ? plain.replace("}", " tt}") : `${plain}{tt}`;
    items.push({ tick, text: parts.length === 1 ? `${parts[0]}.${value}` : `(${parts.join(" ")}).${value}` });
  }
  items.sort((a, b) => a.tick - b.tick);
  const bars: string[][] = Array.from({ length: ex.bars }, () => []);
  for (const item of items) bars[Math.floor(item.tick / barTicks)]?.push(item.text);
  const body = bars.map((bar) => `${bar.join(" ")} |`).join("\n");
  return [
    `\\title "${ex.title.replace(/"/g, "'")}"`,
    `\\tempo ${bpm}`,
    ".",
    `\\track "Guitar"`,
    `\\tuning e4 b3 g3 d3 a2 e2`,
    `\\ts ${ex.meter.numerator} ${ex.meter.denominator}`,
    body,
  ].join("\n");
}
