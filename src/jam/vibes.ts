/**
 * Vibes — one word that sets the whole band.
 *
 * The finding that started the second pass: nothing on the first screen said
 * "rock" in one word. To get a rock drummer you had to know to set five
 * controls, and the first starter jam was a shuffle at 92, so whatever you
 * meant, your first impression was bluesy. A vibe is the fix
 * (plans/JAM_UX_DECISIONS.md A2): nine tiles, one tap each, and the tap sets
 * the groove, the feel, the intensity, the kit, the fills, the lineup, the
 * bass and keys voices, a sensible tempo, a key and a form — together,
 * because those are the things that are only right together.
 *
 * Every other control on the setup sheet is then a REFINEMENT of the vibe,
 * and the sheet says which vibe it started from. That is the thirty-second
 * rule made real: open the app, tap Rock, press play, and a rock drummer is
 * playing.
 *
 * ## Variations (A9)
 *
 * Picking a vibe shows a second row: three to six variations, each a named
 * partial bundle over the vibe's own. Rock's "punk" is the same tiles with a
 * harder groove and a faster tempo; Blues's "slow" is the same shuffle at
 * sixty-two. Depth for a player who lives in one family, without one extra
 * control on the sheet. A variation tuned to taste is saved as your own jam
 * (the library's job, not this file's).
 *
 * ## A vibe is a sound set (B8)
 *
 * The bundle names a kit, a bass voice and a keys voice as well as a pattern,
 * because the voices ARE the style and the pattern is only its rhythm — a
 * bossa played by a slap bass and a clav is not Latin, it is funk with the
 * wrong drums. What each vibe is tuned against, track by track, is written
 * down in `plans/JAM_REFERENCES.md` (B10).
 *
 * ## The lineup is drums (B1)
 *
 * Every vibe's `band` is drums alone, and that is not an oversight: a new
 * jam's lineup is drums alone for every instrument, and the bass and the keys
 * are one tap each in the band row. What the vibe contributes is WHICH bass
 * and WHICH keys are waiting behind that tap, so the tap gives you the right
 * sound instead of the same soft sine under everything.
 *
 * Pure and deterministic. Nothing here reads the store, the engine or React;
 * `applyVibe` takes a jam and gives back a jam.
 */
import { formBars } from "./forms";
import { grooveById, GROOVES } from "./grooves";
import { carryCountIn } from "./jams";
import { progressionEdit } from "./progression";
import { JAM_FORM_BARS } from "./types";
import type {
  Jam,
  JamBassVoice,
  JamFeel,
  JamForm,
  JamFormKind,
  JamIntensity,
  JamKeysVoice,
} from "./types";

/**
 * The kits a vibe may name.
 *
 * `raw` is the fifth (B2), built for rock and the reason the Rock, Hard rock
 * and Metal tiles stop sounding like a lounge. The list lives here rather
 * than on the setup screen because this is the module whose tests can check
 * that no bundle names a kit that does not exist, and a list that is only in
 * a `.tsx` file cannot be checked from a data test.
 */
export const JAM_KIT_IDS = ["raw", "room", "tight", "brushes", "electronic"] as const;
export type JamKitId = (typeof JAM_KIT_IDS)[number];

export type JamVibeId =
  | "rock"
  | "hardRock"
  | "blues"
  | "funk"
  | "jazz"
  | "latin"
  | "pop"
  | "metal"
  | "country";

/**
 * Everything one tap sets.
 *
 * A complete bundle on the vibe, a partial one on each variation. `key` is
 * written the way `keyName` in `./harmony` writes it ("A", "Em", "A blues"),
 * because that is the one encoding the record uses and a second one would
 * disagree with it by Tuesday. `form` is the KIND; the bar count comes from
 * `JAM_FORM_BARS`, so a vibe cannot name a length its form does not have.
 */
export type JamVibeBundle = {
  grooveId: string;
  feel: JamFeel;
  intensity: JamIntensity;
  kit: JamKitId;
  fills: boolean;
  /** A fill every N bars as well as at the chorus end. 0: the end only. */
  fillEvery: number;
  band: { drums: boolean; bass: boolean; keys: boolean };
  bassVoice: JamBassVoice;
  keysVoice: JamKeysVoice;
  bpm: number;
  key: string;
  form: Exclude<JamFormKind, "custom">;
};

export type JamVariation = {
  id: string;
  /** i18n key under `jam.variation.*`. Variation names are translated. */
  nameKey: string;
  /** What this variation changes about its vibe. Everything else is the vibe's. */
  bundle: Partial<JamVibeBundle>;
};

export type JamVibe = {
  id: JamVibeId;
  /** i18n key under `jam.vibe.*`. Vibe names are translated. */
  nameKey: string;
  bundle: JamVibeBundle;
  variations: readonly JamVariation[];
};

/** Drums alone, for every vibe. See B1, and the header. */
const DRUMS_ONLY = { drums: true, bass: false, keys: false } as const;

function variation(id: string, bundle: Partial<JamVibeBundle>): JamVariation {
  return { id, nameKey: `jam.variation.${id}`, bundle };
}

function vibe(
  id: JamVibeId,
  bundle: Omit<JamVibeBundle, "band" | "fills" | "fillEvery"> &
    Partial<Pick<JamVibeBundle, "fills" | "fillEvery">>,
  variations: readonly JamVariation[],
): JamVibe {
  return {
    id,
    nameKey: `jam.vibe.${id}`,
    bundle: {
      fills: true,
      fillEvery: 0,
      ...bundle,
      band: { ...DRUMS_ONLY },
    },
    variations,
  };
}

/**
 * The nine, in the order the tiles are drawn: the four a guitarist reaches
 * for, then the four that are somebody else's home, then country.
 *
 * The first variation of each vibe is always the vibe's own bundle under a
 * name, so the row reads as a row rather than as "the vibe, and then some
 * alternatives to it".
 */
export const VIBES: readonly JamVibe[] = [
  /* Rock. Eighths with their ghosts, the raw kit, a picked bass and an organ
     waiting behind the band row. 120 in A, over an eight-bar loop — the
     plainest thing that unmistakably rocks. */
  vibe(
    "rock",
    {
      grooveId: "rock8",
      feel: "straight",
      intensity: "normal",
      kit: "raw",
      bassVoice: "picked",
      keysVoice: "organ",
      bpm: 120,
      key: "A",
      form: "loop8",
    },
    [
      variation("classic", {}),
      variation("hard", { grooveId: "hardRock", intensity: "loud", bpm: 132 }),
      // Punk is the hard-rock bar taken to a tempo where nothing else fits,
      // and a fill every eight bars because a punk drummer marks the phrase.
      variation("punk", { grooveId: "hardRock", intensity: "loud", bpm: 176, fillEvery: 8 }),
      // Alt: the sixteenths, in the room kit, a little under tempo — the
      // ghosts are the point here, so the intensity stays normal.
      variation("alt", { grooveId: "rock16", kit: "room", bpm: 112 }),
      variation("ballad", {
        grooveId: "halfTime",
        intensity: "soft",
        kit: "room",
        bpm: 72,
        form: "bars16",
      }),
      variation("halfTime", { grooveId: "halfTime", bpm: 88 }),
    ],
  ),
  /* Hard rock. The open hats and the crash in the bar, loud, in E, at 132. */
  vibe(
    "hardRock",
    {
      grooveId: "hardRock",
      feel: "straight",
      intensity: "loud",
      kit: "raw",
      bassVoice: "picked",
      keysVoice: "organ",
      bpm: 132,
      key: "E",
      form: "loop8",
    },
    [
      variation("openHats", {}),
      variation("stomp", { grooveId: "stomp", bpm: 108 }),
      // Driving 16ths: the rock sixteenths played loud, which is where Loud
      // earns its keep — it takes the ghosts out and opens the off-beats, so
      // the same table stops sounding like a drum machine.
      variation("driving16ths", { grooveId: "rock16", bpm: 144 }),
    ],
  ),
  /* Blues. The shuffle, the room kit, a fingered bass and an organ, 92 in A
     over the twelve bars. The first pass's starter jam, now behind a tile
     that says what it is instead of being what you got by default. */
  vibe(
    "blues",
    {
      grooveId: "shuffle",
      feel: "shuffle",
      intensity: "normal",
      kit: "room",
      bassVoice: "fingered",
      keysVoice: "organ",
      bpm: 92,
      key: "A blues",
      form: "blues12",
    },
    [
      variation("shuffle", {}),
      variation("slow", { bpm: 62, intensity: "soft" }),
      // Texas: the straight rock bar put through the shuffle feel, loud and
      // up at 116 — a different animal from the triplet shuffle, and the one
      // a Texas player means.
      variation("texas", { grooveId: "rock8", intensity: "loud", bpm: 116 }),
      variation("boogie", { bpm: 150 }),
    ],
  ),
  /* Funk. The sixteenths with their ghosts, the tight kit, slap and clav.
     100 in E minor — funk lives in one chord, so the eight-bar loop. */
  vibe(
    "funk",
    {
      grooveId: "funk",
      feel: "straight",
      intensity: "normal",
      kit: "tight",
      bassVoice: "slap",
      keysVoice: "clav",
      bpm: 100,
      key: "Em",
      form: "loop8",
    },
    [
      variation("sixteenths", {}),
      variation("halfTime", { grooveId: "halfTime", bpm: 88 }),
      // New Orleans: the second line, in the room kit, with a fingered bass
      // — the street beat is not a slap style.
      variation("newOrleans", {
        grooveId: "secondLine",
        kit: "room",
        bassVoice: "fingered",
        bpm: 96,
      }),
    ],
  ),
  /* Jazz. The ride, brushes, an upright and an electric piano, soft, over the
     thirty-two bars. 140 in F, which is a medium swing and where a standard
     is usually called. */
  vibe(
    "jazz",
    {
      grooveId: "swingRide",
      feel: "swing",
      intensity: "soft",
      kit: "brushes",
      bassVoice: "upright",
      keysVoice: "epiano",
      bpm: 140,
      key: "F",
      form: "aaba32",
    },
    [
      variation("swing", {}),
      variation("ballad", { bpm: 64, form: "bars16" }),
      // Bossa-jazz: the bossa pattern straight, in the room kit, over sixteen
      // bars — the standard a jazz player reaches for when the swing stops.
      variation("bossaJazz", {
        grooveId: "bossa",
        feel: "straight",
        kit: "room",
        bpm: 132,
        form: "bars16",
      }),
      variation("upTempo", { intensity: "normal", bpm: 210 }),
    ],
  ),
  /* Latin. The bossa, the room kit for its rim, a fingered bass and a pad.
     132 in A minor over sixteen bars. */
  vibe(
    "latin",
    {
      grooveId: "bossa",
      feel: "straight",
      intensity: "normal",
      kit: "room",
      bassVoice: "fingered",
      keysVoice: "pad",
      bpm: 132,
      key: "Am",
      form: "bars16",
    },
    [
      variation("bossa", {}),
      // Samba: the surdo on two and four, loud, at the tempo a samba is
      // counted in sixteenths.
      variation("samba", { grooveId: "samba", intensity: "loud", bpm: 100 }),
      variation("chaCha", { grooveId: "chaCha", bpm: 120, keysVoice: "epiano" }),
    ],
  ),
  /* Pop. The rock eighths with their ghosts — B4 keeps those for exactly this
     — the electronic kit, a synth bass and a pad. 112 in C over eight bars. */
  vibe(
    "pop",
    {
      grooveId: "rock8",
      feel: "straight",
      intensity: "normal",
      kit: "electronic",
      bassVoice: "synth",
      keysVoice: "pad",
      bpm: 112,
      key: "C",
      form: "loop8",
    },
    [
      variation("straight", {}),
      variation("fourOnFloor", { grooveId: "fourOnFloor", bpm: 124 }),
      variation("ballad", {
        grooveId: "halfTime",
        intensity: "soft",
        bpm: 76,
        form: "bars16",
      }),
    ],
  ),
  /* Metal. The double kick, raw, loud, a picked bass driving it and no keys
     in earshot — the pad is only what would play if you asked. 160 in E
     minor. */
  vibe(
    "metal",
    {
      grooveId: "doubleKick",
      feel: "straight",
      intensity: "loud",
      kit: "raw",
      bassVoice: "picked",
      keysVoice: "pad",
      bpm: 160,
      key: "Em",
      form: "loop8",
    },
    [
      variation("doubleKick", {}),
      variation("halfTimeStomp", { grooveId: "stomp", bpm: 92 }),
      // Thrash: the hard-rock bar at a tempo where the off-beat hats become
      // the whole texture.
      variation("thrash", { grooveId: "hardRock", bpm: 190 }),
    ],
  ),
  /* Country. The train beat, brushes, an upright and an electric piano. 120
     in G over eight bars. */
  vibe(
    "country",
    {
      grooveId: "train",
      feel: "straight",
      intensity: "normal",
      kit: "brushes",
      bassVoice: "upright",
      keysVoice: "epiano",
      bpm: 120,
      key: "G",
      form: "loop8",
    },
    [
      variation("train", {}),
      variation("twoStep", { grooveId: "twoStep", bpm: 168 }),
      // The waltz is in three, which is why `applyVibe` clears the meter
      // override: a jam left in four would get the rule groove instead.
      variation("waltz", { grooveId: "waltz", bpm: 108, form: "bars16" }),
    ],
  ),
];

/** The tile a new jam opens on. Rock, because rock is what nothing said. */
export const DEFAULT_VIBE_ID: JamVibeId = "rock";

/** The vibe with this id, or null — a saved jam may name one that went. */
export function vibeById(id: string | undefined | null): JamVibe | null {
  return VIBES.find((v) => v.id === id) ?? null;
}

/** One of a vibe's variations by id, or null. */
export function variationOf(vibe: JamVibe, id: string | undefined | null): JamVariation | null {
  return vibe.variations.find((v) => v.id === id) ?? null;
}

/**
 * The bundle a vibe and one of its variations add up to.
 *
 * The variation's fields win, field by field, and everything it does not
 * mention is the vibe's. An unknown variation id is no variation at all
 * rather than an error: a jam saved against a variation that has since been
 * renamed should still open on its vibe.
 */
export function vibeBundle(vibe: JamVibe, variationId?: string | null): JamVibeBundle {
  const chosen = variationOf(vibe, variationId);
  return { ...vibe.bundle, ...(chosen?.bundle ?? {}) };
}

/**
 * The jam, with the vibe applied.
 *
 * Everything the bundle names is replaced, and four things follow from that
 * rather than being copied across:
 *
 * - **The custom groove goes.** It wins over `grooveId` wherever it is set
 *   (`jamWrittenGroove` in `./compile`), so leaving it would mean tapping
 *   Metal and hearing the bar you drew last week.
 * - **The meter override goes.** A vibe's groove carries its own meter, and a
 *   waltz under a leftover 4/4 override does not fit it — the drummer would
 *   fall back to the rule groove, which is nobody's idea of a country waltz.
 * - **The count-in is carried, not copied**, so "one bar" stays one bar when
 *   the bar changes length (`carryCountIn`).
 * - **The progression is refitted** to the new form's length, because a
 *   progression that is not exactly `form.bars` long is the one thing the
 *   record must never hold. A progression that does not fit is dropped, and
 *   the form's own changes take over.
 *
 * An unknown vibe id gives the jam back untouched. The jam is never mutated.
 */
export function applyVibe(jam: Jam, vibeId: string, variationId?: string): Jam {
  const found = vibeById(vibeId);
  if (!found) return jam;
  const chosen = variationOf(found, variationId);
  const bundle = vibeBundle(found, chosen?.id);

  const form: JamForm = { kind: bundle.form, bars: JAM_FORM_BARS[bundle.form] };
  const fromBeats = grooveById(jam.grooveId).beatsPerBar;
  const toBeats = grooveById(bundle.grooveId).beatsPerBar;
  const progression = progressionEdit(jam.progression, formBars(form));

  const next: Jam = {
    ...jam,
    bpm: bundle.bpm,
    grooveId: bundle.grooveId,
    feel: bundle.feel,
    intensity: bundle.intensity,
    kit: bundle.kit,
    form,
    countIn: carryCountIn(jam.countIn, fromBeats, toBeats),
    fills: bundle.fills,
    fillEvery: bundle.fillEvery,
    key: bundle.key,
    band: { ...bundle.band },
    bassVoice: bundle.bassVoice,
    keysVoice: bundle.keysVoice,
    vibe: found.id,
  };
  // Deleted rather than set to undefined: the record goes to the store as
  // JSON, and a key that is only ever absent reads better than one that is
  // sometimes there and empty.
  if (chosen) next.variation = chosen.id;
  else delete next.variation;
  delete next.customGroove;
  delete next.meter;
  if (progression) next.progression = progression;
  else delete next.progression;
  return next;
}

/**
 * Which vibe and variation a jam is on, if any.
 *
 * The setup sheet uses it to say "started from Rock · punk" above the
 * controls, which is A2's other half: the tiles are only useful if the sheet
 * remembers which one you tapped.
 */
export function vibeOf(jam: Jam): { vibe: JamVibe; variation: JamVariation | null } | null {
  const found = vibeById(jam.vibe);
  if (!found) return null;
  return { vibe: found, variation: variationOf(found, jam.variation) };
}

/**
 * Has the jam been edited away from the bundle it started from?
 *
 * True when a field the bundle sets no longer matches it. The sheet reads it
 * to say "Rock · punk, edited" rather than claiming a jam is still the tile
 * it started as. Only the bundle's own fields count: typing your own changes
 * over a rock jam does not stop it being a rock jam.
 */
export function vibeIsEdited(jam: Jam): boolean {
  const on = vibeOf(jam);
  if (!on) return false;
  const bundle = vibeBundle(on.vibe, on.variation?.id);
  return (
    jam.grooveId !== bundle.grooveId ||
    jam.feel !== bundle.feel ||
    jam.intensity !== bundle.intensity ||
    jam.kit !== bundle.kit ||
    jam.fills !== bundle.fills ||
    (jam.fillEvery ?? 0) !== bundle.fillEvery ||
    jam.bpm !== bundle.bpm ||
    jam.form.kind !== bundle.form ||
    (jam.bassVoice ?? "fingered") !== bundle.bassVoice ||
    (jam.keysVoice ?? "epiano") !== bundle.keysVoice ||
    Boolean(jam.customGroove)
  );
}

/**
 * Every groove id any bundle names, whether or not the groove exists.
 *
 * Unfiltered on purpose: the test that matters is "does every id here name a
 * real groove", and a helper that quietly dropped the ones that do not would
 * be the helper that lets a typo through.
 */
export function vibeGrooveIds(): string[] {
  const ids = new Set<string>();
  for (const v of VIBES) {
    ids.add(v.bundle.grooveId);
    for (const variant of v.variations) {
      if (variant.bundle.grooveId) ids.add(variant.bundle.grooveId);
    }
  }
  return [...ids];
}

/** Is this the id of a groove that exists? */
export function isKnownGrooveId(id: string): boolean {
  return GROOVES.some((g) => g.id === id);
}
