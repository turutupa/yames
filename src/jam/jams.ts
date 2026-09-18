/**
 * Jam records — making them, renaming them, and the fifty that ship.
 *
 * Pure, like `setlist/setlists.ts`, and for the same reason: the library edits
 * a jam across several clicks and a drag, and deciding when that reaches the
 * store is the sidebar's call, not this module's. `saveJams` is one call away
 * in `src/ipc.ts`.
 */
import { grooveById } from "./grooves";
import { clampFormBars, formBars } from "./forms";
import { progressionEdit } from "./progression";
import { JAM_FORM_BARS, JAM_MAX_COUNT_IN } from "./types";
import type {
  Jam,
  JamCountInSound,
  JamFeel,
  JamForm,
  JamFormKind,
  JamIntensity,
} from "./types";

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

/**
 * The count-in, as ONE decision (JAM_UX_DECISIONS A4).
 *
 * It used to be two controls a screen apart: how many bars, and what they
 * sounded like. Nobody sets one without the other — "one bar of sticks" is a
 * single thing a drummer says out loud — so they are one control now, and
 * these three functions are the whole of the merge, kept here beside
 * `carryCountIn` because they are the same field's rules.
 *
 * The id is what the dropdown carries: `"0"` for none, `"<beats>|<sound>"`
 * otherwise. Beats and not bars, because beats are what the engine takes and
 * the meter is what turns one into the other.
 */
export type CountInChoice = { beats: number; sound: JamCountInSound };

export function countInChoiceId(choice: CountInChoice): string {
  return choice.beats <= 0 ? "0" : `${choice.beats}|${choice.sound}`;
}

/** Read one back. Anything unreadable is "no count-in", which is always safe. */
export function parseCountInChoice(id: string): CountInChoice {
  const [rawBeats, rawSound] = id.split("|");
  const beats = clampCountIn(Number(rawBeats));
  if (beats <= 0) return { beats: 0, sound: "beep" };
  return { beats, sound: rawSound === "sticks" ? "sticks" : "beep" };
}

/**
 * Every count-in a jam in this meter can have: none, then one and two bars in
 * each sound.
 *
 * Two bars of 6/8 is twelve beats, which is past the engine's limit of eight —
 * so that option is not offered there, rather than offered and quietly clamped
 * to something that is not two bars.
 */
export function countInChoices(beatsPerBar: number): CountInChoice[] {
  const out: CountInChoice[] = [{ beats: 0, sound: "beep" }];
  for (const bars of [1, 2]) {
    const beats = bars * Math.max(1, Math.trunc(beatsPerBar));
    if (beats > JAM_MAX_COUNT_IN) continue;
    out.push({ beats, sound: "beep" });
    out.push({ beats, sound: "sticks" });
  }
  return out;
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
    // The studio kit: recorded, and the one that goes from jazz to rock. A
    // new jam used to open on a synthesised Room, which after the third pass
    // means a new jam opened on the sound the owner called underwhelming
    // while every vibe tile opened on a drummer.
    kit: fields.kit ?? "studio",
    form,
    countIn: clampCountIn(fields.countIn ?? grooveById(grooveId).beatsPerBar),
    fills: fields.fills ?? true,
    // The optional half of the record. Each is spread only when it was
    // actually handed over, so "new jam" from the defaults writes the same
    // small record it always did, and "another one like this one" carries
    // the band, the key and the practice tools across with everything else.
    ...(fields.key ? { key: fields.key } : {}),
    ...(fields.band ? { band: { ...fields.band } } : {}),
    /*
     * Chords on, unless you are copying a jam that had them off.
     *
     * A jam made from nothing used to have them off, and every jam that ships
     * has them on — so "New jam" was the one place in the app where the NOW
     * block said "Rock 8ths" instead of the chord you are on, its scales and
     * the way to the fretboard. The owner hit exactly that and read it as a
     * difference between their two machines: "on my mac on the left side it
     * says what key is playing on and other stuff, but on this laptop there's
     * a space on that top left area".
     *
     * It is the headline of the mode. Starting a jam from nothing should not
     * be the one route that hides it.
     */
    chords: fields.chords ?? true,
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
    // The second pass's half: the vibe the jam started from, the voices the
    // bass and keys play with, and a kit of your own samples. Carried like the
    // rest, so "another one like this one" is still the Hard rock vibe with
    // the same picked bass under it. The chord sheet's own state — the pinned
    // shape and whether it follows the jam — is deliberately NOT carried: it
    // is where you happened to leave a cheat sheet, not part of the music.
    ...(fields.vibe ? { vibe: fields.vibe } : {}),
    ...(fields.variation ? { variation: fields.variation } : {}),
    ...(fields.bassVoice ? { bassVoice: fields.bassVoice } : {}),
    ...(fields.keysVoice ? { keysVoice: fields.keysVoice } : {}),
    ...(fields.customKit ? { customKit: { ...fields.customKit } } : {}),
    // The fourth pass's arrangement (plans/tasks/jam-v4/BRIEF.md A1). The only
    // optional field written when nothing was handed over, and the reason is
    // the whole compatibility story: an ABSENT arrangement reads as `loop`, so
    // every jam anybody has saved plays what it always played, and a jam made
    // from today on gets a band that plays a tune. The default has to live on
    // the new record rather than in the reader, or writing it would change
    // what every old record means.
    ...(fields.arrangement ? { arrangement: { ...fields.arrangement } } : { arrangement: { mode: "build" as const } }),
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
 * The other forty-four (plans/JAM_KILLER.md §2 A3), and what builds them.
 *
 * Six starters is enough to prove the mode works and not enough to open the
 * app twice. Fifty is a library: five or six for each of the nine vibes, each
 * one a piece of music a player would recognise from its name alone — "Jump
 * blues in B flat", "Rhythm changes in B flat", "Two-step in A" — with the
 * changes that actually go under it rather than the same I–IV–V fifty times.
 *
 * The six below are written out longhand because each carries an argument in
 * its comments. The forty-four after them go through `starter`, which is the
 * same record with the four fields that never vary — the creation date, the
 * count-in, the chords and the fills — filled in once.
 */

/** The changes of a section, played round until `bars` are full. */
function round(section: readonly string[], bars: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < bars; i += 1) out.push(section[i % section.length]);
  return out;
}

/**
 * The twelve bars, as the shape rather than as twelve strings each time.
 *
 * This is the blues as a form — one, four, one, one, four, four, one, one,
 * five, four, one, turnaround — and the three jams that use it differ in their
 * chords, not in their shape. The ones whose shape is its own (the quick
 * change, the jazz blues, the minor blues) write their twelve out.
 */
function twelveBar(one: string, four: string, five: string): string[] {
  return [one, four, one, one, four, four, one, one, five, four, one, five];
}

/**
 * Rhythm changes, as its two sections.
 *
 * The A is the I–vi–ii–V everybody learns first; the B is four dominants a
 * fifth apart, two bars each, arriving on the five. One chord per bar — the
 * downbeat of each — because that is what a progression is here.
 */
const RHYTHM_A = ["Bbmaj7", "Cm7", "Dm7", "Cm7", "Bbmaj7", "Cm7", "Bbmaj7", "F7"];
const RHYTHM_B = ["D7", "D7", "G7", "G7", "C7", "C7", "F7", "F7"];

/** A medium-up AABA of the plainest kind: a vamp, and a bridge to the four. */
const UPTEMPO_A = ["Cmaj7", "Am7", "Dm7", "G7", "Cmaj7", "Am7", "Dm7", "G7"];
const UPTEMPO_B = ["Fmaj7", "Fmaj7", "Bb7", "Bb7", "Cmaj7", "Cmaj7", "D7", "G7"];

type StarterFields = {
  bpm: number;
  grooveId: string;
  feel: JamFeel;
  intensity: JamIntensity;
  kit: string;
  form: Exclude<JamFormKind, "custom">;
  key: string;
  vibe: string;
  variation: string;
  /** Exactly `JAM_FORM_BARS[form]` entries. Checked in `jams.test.ts`. */
  progression: string[];
};

/**
 * One curated jam.
 *
 * The count-in is one bar of the groove's own meter, which is the only answer
 * that is right for a waltz as well as for a rock tune, and the chords are on
 * because a jam whose changes you cannot read is a drum loop.
 */
function starter(id: string, name: string, fields: StarterFields): Jam {
  return {
    id,
    name,
    createdAt: 0,
    bpm: fields.bpm,
    grooveId: fields.grooveId,
    feel: fields.feel,
    intensity: fields.intensity,
    kit: fields.kit,
    form: { kind: fields.form, bars: JAM_FORM_BARS[fields.form] },
    countIn: grooveById(fields.grooveId).beatsPerBar,
    fills: true,
    key: fields.key,
    chords: true,
    vibe: fields.vibe,
    variation: fields.variation,
    progression: fields.progression,
  };
}

/**
 * The fifty that ship, so the first press of Jam already plays (JAM_MODE §4.6).
 *
 * The names are not translated: "Slow blues in A" is a piece of music, the way
 * a preset a user saved is, and translating it would make the library read
 * differently from the one the next person's screenshot shows. The grooves and
 * the forms they point at ARE translated — those are the app's words.
 *
 * The ids are stable rather than generated: they are seeded once per install
 * and a fixed id keeps a re-seed from doubling the library.
 *
 * Every one of them names the vibe and the variation it belongs to, which is
 * what the library's style filter reads and what lets the setup sheet say
 * where a jam came from. The six the first pass wrote are first and unchanged
 * but for that pair of fields.
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
    kit: "studio",
    form: { kind: "blues12", bars: 12 },
    countIn: 4,
    fills: true,
    // A blues, not A major. The form plays I7 IV7 V7 either way, but the KEY
    // is what the chords-in-the-key strip is drawn from, and A major does not
    // contain A7 — so stored as major the strip had nothing to light while
    // the band played the dominant it names.
    key: "A blues",
    chords: true,
    vibe: "blues",
    variation: "shuffle",
  },
  {
    id: "jam-funk-e",
    name: "Funk in E",
    createdAt: 0,
    bpm: 104,
    grooveId: "rock16",
    feel: "straight",
    intensity: "normal",
    kit: "club",
    form: { kind: "loop8", bars: 8 },
    countIn: 4,
    fills: true,
    key: "E",
    chords: true,
    vibe: "funk",
    variation: "sixteenths",
  },
  {
    id: "jam-bossa-dm",
    name: "Bossa in D minor",
    createdAt: 0,
    bpm: 120,
    grooveId: "bossa",
    feel: "straight",
    intensity: "soft",
    kit: "club",
    form: { kind: "bars16", bars: 16 },
    countIn: 4,
    fills: true,
    key: "Dm",
    chords: true,
    vibe: "latin",
    variation: "bossa",
  },
  {
    id: "jam-swing-f",
    name: "Swing in F",
    createdAt: 0,
    bpm: 160,
    grooveId: "swingRide",
    feel: "swing",
    intensity: "normal",
    kit: "club",
    form: { kind: "aaba32", bars: 32 },
    countIn: 4,
    fills: true,
    key: "F",
    chords: true,
    vibe: "jazz",
    variation: "swing",
  },
  {
    id: "jam-rock-g",
    name: "Rock in G",
    createdAt: 0,
    bpm: 120,
    grooveId: "rock8",
    feel: "straight",
    intensity: "loud",
    kit: "studio",
    form: { kind: "loop8", bars: 8 },
    countIn: 4,
    fills: true,
    key: "G",
    chords: true,
    vibe: "rock",
    variation: "classic",
  },
  {
    id: "jam-waltz-c",
    name: "Waltz in C",
    createdAt: 0,
    bpm: 140,
    grooveId: "waltz",
    feel: "straight",
    intensity: "soft",
    kit: "studio",
    form: { kind: "bars16", bars: 16 },
    countIn: 3,
    fills: true,
    key: "C",
    chords: true,
    vibe: "country",
    variation: "waltz",
  },

  // --- Rock -----------------------------------------------------------
  starter("jam-rock-hard-e", "Hard eighths in E", {
    bpm: 132,
    grooveId: "hardRock",
    feel: "straight",
    intensity: "loud",
    kit: "studio",
    form: "loop8",
    key: "E",
    vibe: "rock",
    variation: "hard",
    // I–bVII–IV, the three chords every rock riff since 1969 is made of.
    progression: round(["E5", "E5", "D5", "A5"], 8),
  }),
  starter("jam-rock-punk-c", "Punk in C", {
    bpm: 176,
    grooveId: "hardRock",
    feel: "straight",
    intensity: "loud",
    kit: "studio",
    form: "loop8",
    key: "C",
    vibe: "rock",
    variation: "punk",
    progression: round(["C", "G", "Am", "F"], 8),
  }),
  starter("jam-rock-alt-am", "Alt in A minor", {
    bpm: 112,
    grooveId: "rock16",
    feel: "straight",
    intensity: "normal",
    kit: "studio",
    form: "loop8",
    key: "Am",
    vibe: "rock",
    variation: "alt",
    progression: round(["Am", "F", "C", "G"], 8),
  }),
  starter("jam-rock-ballad-d", "Rock ballad in D", {
    bpm: 72,
    grooveId: "ballad",
    feel: "straight",
    intensity: "soft",
    kit: "studio",
    form: "bars16",
    key: "D",
    vibe: "rock",
    variation: "ballad",
    progression: round(["D", "A", "Bm", "G"], 16),
  }),
  starter("jam-rock-half-em", "Half-time in E minor", {
    bpm: 88,
    grooveId: "halfTime",
    feel: "straight",
    intensity: "normal",
    kit: "studio",
    form: "loop8",
    key: "Em",
    vibe: "rock",
    variation: "halfTime",
    progression: round(["Em", "C", "G", "D"], 8),
  }),

  // --- Hard rock ------------------------------------------------------
  starter("jam-hardrock-e", "Hard rock in E", {
    bpm: 132,
    grooveId: "hardRock",
    feel: "straight",
    intensity: "loud",
    kit: "studio",
    form: "loop8",
    key: "E",
    vibe: "hardRock",
    variation: "openHats",
    progression: ["E5", "E5", "G5", "A5", "E5", "E5", "G5", "D5"],
  }),
  starter("jam-hardrock-stomp-a", "Stomp in A", {
    bpm: 108,
    grooveId: "stomp",
    feel: "straight",
    intensity: "loud",
    kit: "studio",
    form: "loop8",
    key: "A",
    vibe: "hardRock",
    variation: "stomp",
    progression: ["A5", "A5", "C5", "D5", "A5", "A5", "G5", "D5"],
  }),
  starter("jam-hardrock-16-g", "Driving 16ths in G", {
    bpm: 144,
    grooveId: "rock16",
    feel: "straight",
    intensity: "loud",
    kit: "studio",
    form: "loop8",
    key: "G",
    vibe: "hardRock",
    variation: "driving16ths",
    progression: round(["G5", "F5", "C5", "G5"], 8),
  }),
  starter("jam-hardrock-riff-d", "Riff in D", {
    bpm: 126,
    grooveId: "rockGrunge",
    feel: "straight",
    intensity: "loud",
    kit: "studio",
    form: "loop8",
    key: "D",
    vibe: "hardRock",
    variation: "openHats",
    progression: ["D5", "D5", "F5", "G5", "D5", "D5", "C5", "G5"],
  }),
  starter("jam-hardrock-big-b", "Big riff in B", {
    bpm: 96,
    grooveId: "rockGarage",
    feel: "straight",
    intensity: "loud",
    kit: "studio",
    form: "loop8",
    key: "B",
    vibe: "hardRock",
    variation: "stomp",
    progression: ["B5", "B5", "D5", "E5", "B5", "B5", "A5", "E5"],
  }),

  // --- Blues ----------------------------------------------------------
  starter("jam-blues-shuffle-e", "Shuffle blues in E", {
    bpm: 112,
    grooveId: "shuffle",
    feel: "shuffle",
    intensity: "normal",
    kit: "studio",
    form: "blues12",
    key: "E blues",
    vibe: "blues",
    variation: "shuffle",
    progression: twelveBar("E7", "A7", "B7"),
  }),
  starter("jam-blues-slow-g", "Slow blues in G", {
    bpm: 62,
    grooveId: "slowBlues",
    feel: "straight",
    intensity: "soft",
    kit: "studio",
    form: "blues12",
    key: "G blues",
    vibe: "blues",
    variation: "slow",
    // The quick change: bar two goes to the four, which is what a slow blues
    // has the room for and a fast shuffle usually does not.
    progression: ["G7", "C7", "G7", "G7", "C7", "C7", "G7", "G7", "D7", "C7", "G7", "D7"],
  }),
  starter("jam-blues-texas-c", "Texas shuffle in C", {
    bpm: 116,
    grooveId: "bluesTexas",
    feel: "shuffle",
    intensity: "loud",
    kit: "studio",
    form: "blues12",
    key: "C blues",
    vibe: "blues",
    variation: "texas",
    progression: twelveBar("C7", "F7", "G7"),
  }),
  starter("jam-blues-jump-bb", "Jump blues in B flat", {
    bpm: 150,
    grooveId: "bluesJump",
    feel: "shuffle",
    intensity: "normal",
    kit: "club",
    form: "blues12",
    key: "Bb blues",
    vibe: "blues",
    variation: "boogie",
    // The jazz blues turnaround: a six chord in bar eight and a ii–V home.
    progression: ["Bb7", "Eb7", "Bb7", "Bb7", "Eb7", "Eb7", "Bb7", "G7", "Cm7", "F7", "Bb7", "F7"],
  }),
  starter("jam-blues-minor-dm", "Minor blues in D minor", {
    bpm: 76,
    grooveId: "slowBlues",
    feel: "straight",
    intensity: "normal",
    kit: "studio",
    form: "blues12",
    key: "Dm",
    vibe: "blues",
    variation: "slow",
    // A minor blues is not the major one with a flat third: bars nine and ten
    // are bVI and V, which is where the whole form turns.
    progression: [
      "Dm7", "Dm7", "Dm7", "Dm7", "Gm7", "Gm7", "Dm7", "Dm7", "Bb7", "A7", "Dm7", "A7",
    ],
  }),

  // --- Funk and soul --------------------------------------------------
  starter("jam-funk-one-dm", "One chord in D minor", {
    bpm: 98,
    grooveId: "funkFunkyDrummer",
    feel: "straight",
    intensity: "normal",
    kit: "club",
    form: "one",
    key: "Dm",
    vibe: "funk",
    variation: "sixteenths",
    progression: round(["Dm7"], 4),
  }),
  starter("jam-funk-nola-f", "Second line in F", {
    bpm: 96,
    grooveId: "secondLine",
    feel: "straight",
    intensity: "normal",
    kit: "club",
    form: "loop8",
    key: "F",
    vibe: "funk",
    variation: "newOrleans",
    progression: ["F7", "Bb7", "F7", "C7", "F7", "Bb7", "F7", "F7"],
  }),
  starter("jam-funk-motown-c", "Motown in C", {
    bpm: 128,
    grooveId: "motown",
    feel: "straight",
    intensity: "normal",
    kit: "club",
    form: "loop8",
    key: "C",
    vibe: "funk",
    variation: "sixteenths",
    progression: round(["C", "Am", "F", "G"], 8),
  }),
  starter("jam-funk-gogo-eb", "Go-go in E flat", {
    bpm: 102,
    grooveId: "funkGoGo",
    feel: "straight",
    intensity: "normal",
    kit: "club",
    form: "loop8",
    key: "Eb",
    vibe: "funk",
    variation: "sixteenths",
    progression: ["Eb7", "Eb7", "Eb7", "Eb7", "Ab7", "Ab7", "Eb7", "Eb7"],
  }),
  starter("jam-funk-slowjam-bb", "Slow jam in B flat", {
    bpm: 68,
    grooveId: "funkSlowJam",
    feel: "straight",
    intensity: "soft",
    kit: "club",
    form: "bars16",
    key: "Bb",
    vibe: "funk",
    variation: "halfTime",
    progression: round(["Bbmaj7", "Gm7", "Ebmaj7", "F7"], 16),
  }),

  // --- Jazz -----------------------------------------------------------
  starter("jam-jazz-rhythm-bb", "Rhythm changes in B flat", {
    bpm: 200,
    grooveId: "swingRide",
    feel: "swing",
    intensity: "normal",
    kit: "club",
    form: "aaba32",
    key: "Bb",
    vibe: "jazz",
    variation: "upTempo",
    // A A B A, written as the sections rather than as thirty-two strings: the
    // bridge is a cycle of dominants and the A is the I–vi–ii–V everybody
    // learns first. One chord per bar, which is the downbeat of each.
    progression: [
      ...RHYTHM_A, ...RHYTHM_A, ...RHYTHM_B, ...RHYTHM_A,
    ],
  }),
  starter("jam-jazz-minor-gm", "Minor ii-V in G minor", {
    bpm: 132,
    grooveId: "swingRide",
    feel: "swing",
    intensity: "soft",
    kit: "club",
    form: "bars16",
    key: "Gm",
    vibe: "jazz",
    variation: "swing",
    // The cycle every minor standard runs on: down the relative major, then
    // the half-diminished two and the altered five home.
    progression: round(
      ["Cm7", "F7", "Bbmaj7", "Ebmaj7", "Am7b5", "D7", "Gm6", "Gm6"],
      16,
    ),
  }),
  starter("jam-jazz-ballad-eb", "Jazz ballad in E flat", {
    bpm: 64,
    grooveId: "ballad",
    feel: "swing",
    intensity: "soft",
    kit: "club",
    form: "bars16",
    key: "Eb",
    vibe: "jazz",
    variation: "ballad",
    progression: round(["Ebmaj7", "Cm7", "Fm7", "Bb7"], 16),
  }),
  starter("jam-jazz-bossa-am", "Bossa jazz in A minor", {
    bpm: 132,
    grooveId: "bossa",
    feel: "straight",
    intensity: "soft",
    kit: "club",
    form: "bars16",
    key: "Am",
    vibe: "jazz",
    variation: "bossaJazz",
    progression: round(
      ["Am7", "D7", "Gmaj7", "Cmaj7", "F#m7b5", "B7", "Em7", "Em7"],
      16,
    ),
  }),
  starter("jam-jazz-up-c", "Up-tempo in C", {
    bpm: 210,
    grooveId: "jazzUpTempo",
    feel: "swing",
    intensity: "normal",
    kit: "club",
    form: "aaba32",
    key: "C",
    vibe: "jazz",
    variation: "upTempo",
    progression: [...UPTEMPO_A, ...UPTEMPO_A, ...UPTEMPO_B, ...UPTEMPO_A],
  }),

  // --- Latin ----------------------------------------------------------
  starter("jam-latin-samba-c", "Samba in C", {
    bpm: 100,
    grooveId: "samba",
    feel: "straight",
    intensity: "loud",
    kit: "club",
    form: "bars16",
    key: "C",
    vibe: "latin",
    variation: "samba",
    progression: round(["Cmaj7", "A7", "Dm7", "G7"], 16),
  }),
  starter("jam-latin-chacha-am", "Cha-cha in A minor", {
    bpm: 120,
    grooveId: "chaCha",
    feel: "straight",
    intensity: "normal",
    kit: "club",
    form: "loop8",
    key: "Am",
    vibe: "latin",
    variation: "chaCha",
    // Two chords and a lifetime: the vamp every cha-cha band plays.
    progression: round(["Am7", "Am7", "D7", "D7"], 8),
  }),
  starter("jam-latin-son-g", "Son in G", {
    bpm: 96,
    grooveId: "latinSon",
    feel: "straight",
    intensity: "normal",
    kit: "club",
    form: "bars16",
    key: "G",
    vibe: "latin",
    variation: "bossa",
    progression: round(["Gmaj7", "Gmaj7", "D7", "D7"], 16),
  }),
  starter("jam-latin-mambo-fm", "Mambo in F minor", {
    bpm: 190,
    grooveId: "mambo",
    feel: "straight",
    intensity: "loud",
    kit: "club",
    form: "loop8",
    key: "Fm",
    vibe: "latin",
    variation: "samba",
    progression: ["Fm7", "Fm7", "Bb7", "Bb7", "Fm7", "Fm7", "C7", "C7"],
  }),
  starter("jam-latin-bolero-em", "Bolero in E minor", {
    bpm: 76,
    grooveId: "latinBolero",
    feel: "straight",
    intensity: "soft",
    kit: "club",
    form: "bars16",
    key: "Em",
    vibe: "latin",
    variation: "bossa",
    progression: round(["Em7", "Am7", "B7", "Em7"], 16),
  }),

  // --- Pop and dance --------------------------------------------------
  starter("jam-pop-c", "Pop in C", {
    bpm: 112,
    grooveId: "rock8",
    feel: "straight",
    intensity: "normal",
    kit: "studio",
    form: "loop8",
    key: "C",
    vibe: "pop",
    variation: "straight",
    progression: round(["C", "G", "Am", "F"], 8),
  }),
  starter("jam-pop-dance-am", "Four on the floor in A minor", {
    bpm: 124,
    grooveId: "fourOnFloor",
    feel: "straight",
    intensity: "normal",
    kit: "electronic",
    form: "loop8",
    key: "Am",
    vibe: "pop",
    variation: "fourOnFloor",
    progression: round(["Am", "F", "C", "G"], 8),
  }),
  starter("jam-pop-disco-em", "Disco in E minor", {
    bpm: 118,
    grooveId: "popDisco",
    feel: "straight",
    intensity: "normal",
    kit: "electronic",
    form: "loop8",
    key: "Em",
    vibe: "pop",
    variation: "fourOnFloor",
    progression: ["Em7", "Am7", "Em7", "Am7", "Cmaj7", "D", "Em7", "Em7"],
  }),
  starter("jam-pop-ballad-f", "Pop ballad in F", {
    bpm: 76,
    grooveId: "popBallad",
    feel: "straight",
    intensity: "soft",
    kit: "studio",
    form: "bars16",
    key: "F",
    vibe: "pop",
    variation: "ballad",
    progression: round(["F", "Dm", "Bb", "C"], 16),
  }),
  starter("jam-pop-house-dm", "House in D minor", {
    bpm: 124,
    grooveId: "popHouse",
    feel: "straight",
    intensity: "normal",
    kit: "electronic",
    form: "loop8",
    key: "Dm",
    vibe: "pop",
    variation: "fourOnFloor",
    progression: ["Dm7", "Dm7", "Gm7", "Gm7", "Bbmaj7", "Bbmaj7", "A7", "A7"],
  }),

  // --- Metal and punk -------------------------------------------------
  starter("jam-metal-em", "Metal in E minor", {
    bpm: 160,
    grooveId: "doubleKick",
    feel: "straight",
    intensity: "loud",
    kit: "studio",
    form: "loop8",
    key: "Em",
    vibe: "metal",
    variation: "doubleKick",
    progression: ["E5", "E5", "G5", "F5", "E5", "E5", "C5", "D5"],
  }),
  starter("jam-metal-gallop-dm", "Gallop in D minor", {
    bpm: 168,
    grooveId: "metalGallop",
    feel: "straight",
    intensity: "loud",
    kit: "studio",
    form: "loop8",
    key: "Dm",
    vibe: "metal",
    variation: "doubleKick",
    progression: ["D5", "D5", "F5", "C5", "D5", "D5", "Bb5", "C5"],
  }),
  starter("jam-metal-stomp-am", "Half-time stomp in A minor", {
    bpm: 92,
    grooveId: "stomp",
    feel: "straight",
    intensity: "loud",
    kit: "studio",
    form: "loop8",
    key: "Am",
    vibe: "metal",
    variation: "halfTimeStomp",
    progression: ["A5", "A5", "F5", "G5", "A5", "A5", "C5", "G5"],
  }),
  starter("jam-metal-thrash-em", "Thrash in E minor", {
    bpm: 190,
    grooveId: "metalThrash",
    feel: "straight",
    intensity: "loud",
    kit: "studio",
    form: "loop8",
    key: "Em",
    vibe: "metal",
    variation: "thrash",
    progression: ["E5", "E5", "E5", "G5", "E5", "E5", "F5", "E5"],
  }),
  starter("jam-metal-doom-bm", "Doom in B minor", {
    bpm: 66,
    grooveId: "metalDoom",
    feel: "straight",
    intensity: "loud",
    kit: "studio",
    form: "loop8",
    key: "Bm",
    vibe: "metal",
    variation: "halfTimeStomp",
    progression: ["B5", "B5", "B5", "B5", "D5", "D5", "C5", "C5"],
  }),

  // --- Country and folk -----------------------------------------------
  starter("jam-country-train-g", "Train beat in G", {
    bpm: 120,
    grooveId: "train",
    feel: "straight",
    intensity: "normal",
    kit: "studio",
    form: "loop8",
    key: "G",
    vibe: "country",
    variation: "train",
    progression: ["G", "G", "C", "C", "G", "D", "G", "G"],
  }),
  starter("jam-country-twostep-a", "Two-step in A", {
    bpm: 168,
    grooveId: "twoStep",
    feel: "straight",
    intensity: "normal",
    kit: "studio",
    form: "loop8",
    key: "A",
    vibe: "country",
    variation: "twoStep",
    progression: ["A", "A", "D", "D", "A", "E", "A", "A"],
  }),
  starter("jam-country-shuffle-d", "Country shuffle in D", {
    bpm: 116,
    grooveId: "countryShuffle",
    feel: "shuffle",
    intensity: "normal",
    kit: "studio",
    form: "loop8",
    key: "D",
    vibe: "country",
    variation: "train",
    progression: ["D", "D", "G", "G", "D", "A", "D", "D"],
  }),
  starter("jam-country-ballad-c", "Country ballad in C", {
    bpm: 68,
    grooveId: "countryBallad",
    feel: "straight",
    intensity: "soft",
    kit: "studio",
    form: "bars16",
    key: "C",
    vibe: "country",
    variation: "train",
    progression: round(["C", "Am", "F", "G"], 16),
  }),
];
