/**
 * Jam records — making them, renaming them, and the six that ship.
 *
 * Pure, like `setlist/setlists.ts`, and for the same reason: the library edits
 * a jam across several clicks and a drag, and deciding when that reaches the
 * store is the sidebar's call, not this module's. `saveJams` is one call away
 * in `src/ipc.ts`.
 */
import { grooveById } from "./grooves";
import { clampFormBars, formBars } from "./forms";
import { progressionEdit } from "./progression";
import { JAM_MAX_COUNT_IN } from "./types";
import type { Jam, JamForm } from "./types";

/**
 * The same scheme `setlists.ts` uses: sortable-ish by time, short enough to
 * read in the store file, and random enough that duplicating a jam twice in
 * one tick cannot collide.
 */
export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

/** Beats counted in before bar 1. 0..8 — `arm_count_in`'s own limit. */
export function clampCountIn(beats: number): number {
  return Math.max(0, Math.min(JAM_MAX_COUNT_IN, Math.round(beats || 0)));
}

/**
 * The same count-in, in the new groove's meter.
 *
 * The setting the user chose is a number of BARS; beats are only how the
 * engine takes it. So moving from a rock groove to a waltz keeps "one bar" and
 * changes four beats into three, rather than counting four beats over a bar
 * that is three long. Two bars stay two where they fit inside the engine's
 * limit of eight and drop to one where they do not, because a count-in past
 * the limit is not a count-in, it is a wait.
 */
export function carryCountIn(
  beats: number,
  fromBeatsPerBar: number,
  toBeatsPerBar: number,
): number {
  if (beats <= 0) return 0;
  const bars = Math.max(1, Math.round(beats / Math.max(1, fromBeatsPerBar)));
  for (let n = bars; n >= 1; n--) {
    if (n * toBeatsPerBar <= JAM_MAX_COUNT_IN) return n * toBeatsPerBar;
  }
  return 0;
}

export type NewJamFields = Partial<Omit<Jam, "id" | "name" | "createdAt">>;

/**
 * A jam with everything filled in.
 *
 * The defaults are the plainest thing that plays: rock eighths, straight, an
 * eight-bar loop, one bar counted in. `+` in the library hands the current
 * jam's settings in on top, so "new" means "another one like this" rather than
 * "start again".
 */
export function createJam(name: string, fields: NewJamFields = {}): Jam {
  const grooveId = fields.grooveId ?? "rock8";
  const form: JamForm = fields.form
    ? { kind: fields.form.kind, bars: clampFormBars(fields.form.bars) }
    : { kind: "loop8", bars: 8 };
  return {
    id: newId(),
    name,
    createdAt: Date.now(),
    bpm: fields.bpm ?? 100,
    grooveId,
    feel: fields.feel ?? "straight",
    intensity: fields.intensity ?? "normal",
    kit: fields.kit ?? "room",
    form,
    countIn: clampCountIn(fields.countIn ?? grooveById(grooveId).beatsPerBar),
    fills: fields.fills ?? true,
    // The optional half of the record. Each is spread only when it was
    // actually handed over, so "new jam" from the defaults writes the same
    // small record it always did, and "another one like this one" carries
    // the band, the key and the practice tools across with everything else.
    ...(fields.key ? { key: fields.key } : {}),
    ...(fields.band ? { band: { ...fields.band } } : {}),
    ...(fields.chords === undefined ? {} : { chords: fields.chords }),
    // How often the fills land, when it is not just the chorus end. Carried
    // like the rest of the optional half: "another one like this one" means
    // the drummer still plays every four bars.
    ...(fields.fillEvery ? { fillEvery: fields.fillEvery } : {}),
    ...(fields.practice ? { practice: { ...fields.practice } } : {}),
    ...(fields.transposition ? { transposition: fields.transposition } : {}),
    ...(fields.customGroove ? { customGroove: fields.customGroove } : {}),
    // The fourth pass's half of the optional record. Carried the same way and
    // for the same reason: "another one like this one" has to mean the meter,
    // the changes and the mix as well, or the "+" button quietly hands back a
    // jam in 4/4 when the one on the stage is in seven.
    //
    // The progression is refitted rather than copied, because the new jam may
    // have been given a different form on the way in and a progression that
    // is not exactly `form.bars` long is the one thing this record must never
    // hold (see `progression.ts`).
    ...(fields.meter
      ? { meter: { beatGroups: [...fields.meter.beatGroups], ticksPerBeat: fields.meter.ticksPerBeat } }
      : {}),
    ...(() => {
      const progression = progressionEdit(fields.progression, formBars(form));
      return progression ? { progression } : {};
    })(),
    ...(fields.mix ? { mix: { ...fields.mix } } : {}),
    ...(fields.keysStyle ? { keysStyle: fields.keysStyle } : {}),
    ...(fields.countInSound ? { countInSound: fields.countInSound } : {}),
    ...(fields.cues === undefined ? {} : { cues: fields.cues }),
  };
}

export function renameJam(jam: Jam, name: string): Jam {
  const next = name.trim();
  if (!next || next === jam.name) return jam;
  return { ...jam, name: next };
}

/**
 * `list` with `next` in it — replacing an entry of the same id, or appended.
 *
 * Blind appending is the bug `upsertSetlist` was written for: the jam is in
 * the store by the time `saveJams` resolves, so a `listJams()` still in flight
 * can come back with it already present, and two rows sharing an id render as
 * one row that does nothing. Returns `list` itself when nothing changes, so
 * React can skip the render.
 */
export function upsertJam(list: Jam[], next: Jam): Jam[] {
  const at = list.findIndex((j) => j.id === next.id);
  if (at === -1) return [...list, next];
  if (list[at] === next) return list;
  const out = [...list];
  out[at] = next;
  return out;
}

/** A copy, with a new id and a name that says it is one. */
export function duplicateJam(jam: Jam, name: string): Jam {
  return { ...jam, id: newId(), name, createdAt: Date.now() };
}

/**
 * Move a jam within the list. Out-of-range indices leave the list alone, so a
 * drag that ends outside the panel is a no-op rather than a reshuffle.
 */
export function reorderJams(list: Jam[], from: number, to: number): Jam[] {
  if (from === to) return list;
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return list;
  const out = [...list];
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved);
  return out;
}

/**
 * The six that ship, so the first press of Jam already plays (JAM_MODE §4.6).
 *
 * The names are not translated: "Slow blues in A" is a piece of music, the way
 * a preset a user saved is, and translating it would make the library read
 * differently from the one the next person's screenshot shows. The grooves and
 * the forms they point at ARE translated — those are the app's words.
 *
 * The ids are stable rather than generated: they are seeded once per install
 * and a fixed id keeps a re-seed from doubling the library.
 */
export const STARTER_JAMS: readonly Jam[] = [
  {
    id: "jam-slow-blues-a",
    name: "Slow blues in A",
    createdAt: 0,
    bpm: 92,
    grooveId: "shuffle",
    feel: "shuffle",
    intensity: "normal",
    kit: "room",
    form: { kind: "blues12", bars: 12 },
    countIn: 4,
    fills: true,
    // A blues, not A major. The form plays I7 IV7 V7 either way, but the KEY
    // is what the chords-in-the-key strip is drawn from, and A major does not
    // contain A7 — so stored as major the strip had nothing to light while
    // the band played the dominant it names.
    key: "A blues",
    chords: true,
  },
  {
    id: "jam-funk-e",
    name: "Funk in E",
    createdAt: 0,
    bpm: 104,
    grooveId: "rock16",
    feel: "straight",
    intensity: "normal",
    kit: "room",
    form: { kind: "loop8", bars: 8 },
    countIn: 4,
    fills: true,
    key: "E",
    chords: true,
  },
  {
    id: "jam-bossa-dm",
    name: "Bossa in D minor",
    createdAt: 0,
    bpm: 120,
    grooveId: "bossa",
    feel: "straight",
    intensity: "soft",
    kit: "room",
    form: { kind: "bars16", bars: 16 },
    countIn: 4,
    fills: true,
    key: "Dm",
    chords: true,
  },
  {
    id: "jam-swing-f",
    name: "Swing in F",
    createdAt: 0,
    bpm: 160,
    grooveId: "swingRide",
    feel: "swing",
    intensity: "normal",
    kit: "room",
    form: { kind: "aaba32", bars: 32 },
    countIn: 4,
    fills: true,
    key: "F",
    chords: true,
  },
  {
    id: "jam-rock-g",
    name: "Rock in G",
    createdAt: 0,
    bpm: 120,
    grooveId: "rock8",
    feel: "straight",
    intensity: "loud",
    kit: "room",
    form: { kind: "loop8", bars: 8 },
    countIn: 4,
    fills: true,
    key: "G",
    chords: true,
  },
  {
    id: "jam-waltz-c",
    name: "Waltz in C",
    createdAt: 0,
    bpm: 140,
    grooveId: "waltz",
    feel: "straight",
    intensity: "soft",
    kit: "room",
    form: { kind: "bars16", bars: 16 },
    countIn: 3,
    fills: true,
    key: "C",
    chords: true,
  },
];
