/**
 * The vibe, as the screen needs it — and the stub it runs on until W19 lands.
 *
 * A vibe is one tap that sets the drummer, the kit, the voices, the tempo and
 * the key together (plans/JAM_UX_DECISIONS.md A2, A9, B8). The DATA lives in
 * `src/jam/vibes.ts` and the pattern shaping in `src/jam/intensity.ts`, both
 * of which belong to another worker; this file is the shape the screen builds
 * against, so the two halves can be written at the same time and meet here.
 *
 * **At merge**, the three stubs at the bottom become three re-exports:
 *
 * ```ts
 * export { VIBES, applyVibe } from "./vibes";
 * export { applyIntensity } from "./intensity";
 * ```
 *
 * Nothing else in `src/` imports `vibes.ts` or `intensity.ts` directly, so
 * that is the whole wiring job.
 */
import type {
  Jam,
  JamBassVoice,
  JamFeel,
  JamFormKind,
  JamIntensity,
  JamKeysVoice,
  JamPattern,
} from "./types";
import { VIBES as VIBE_DATA, applyVibe as applyVibeToJam, vibeBundle } from "./vibes";
import { applyIntensityToGroove } from "./intensity";
import { GROOVES } from "./grooves";

/**
 * The eight tiles, in the order the board draws them.
 *
 * A list rather than a loose string so the ids are decided in one place: the
 * locale files carry `jam.vibe.<id>` for each of these, and a vibe whose id is
 * not here would render as its own id.
 */
export const VIBE_IDS = [
  "rock",
  "hardRock",
  "blues",
  "funk",
  "jazz",
  "latin",
  "pop",
  "metal",
  "country",
] as const;

export type VibeId = (typeof VIBE_IDS)[number];

/**
 * Every variation id any vibe offers, across all nine (A9).
 *
 * The same contract as `VIBE_IDS` and for the same reason — `jam.variation.<id>`
 * exists in all fifteen locales for each of these. Several vibes share one:
 * "ballad" is a rock variation and a jazz one, and it is the same word.
 *
 * Every id here is one the data actually uses, and `vibesContract.test.ts`
 * checks both directions: a variation with no id here would draw as its own
 * id, and an id here that no vibe offers is a word fifteen translators were
 * asked for and nobody will ever read.
 */
export const VARIATION_IDS = [
  "classic",
  "hard",
  "punk",
  "alt",
  "ballad",
  "halfTime",
  "stomp",
  "doubleKick",
  "shuffle",
  "slow",
  "texas",
  "boogie",
  "sixteenths",
  "newOrleans",
  "swing",
  "bossa",
  "upTempo",
  "samba",
  "thrash",
  "openHats",
  "driving16ths",
  "bossaJazz",
  "chaCha",
  "straight",
  "fourOnFloor",
  "halfTimeStomp",
  "train",
  "twoStep",
  "waltz",
] as const;

export type VariationId = (typeof VARIATION_IDS)[number];

/**
 * One way of playing a vibe: a groove, a kit, a feel and a loudness together.
 *
 * "Depth for a player who lives in one family, without a single extra
 * control" (A9) — which is why a variation carries no field a vibe does not
 * already have. It is the same bundle with different values.
 */
export type VibeVariation = {
  id: VariationId;
  grooveId: string;
  kit: string;
  feel: JamFeel;
  intensity: JamIntensity;
  /** The tempo this way of playing it sits at. */
  bpm: number;
};

/**
 * A vibe: the sound of a style, not only its rhythm (B8).
 *
 * The voices are part of the bundle because "the band sounds smooth, not raw"
 * was the complaint that started the second pass: a rock vibe that set the
 * groove and left an electric-piano pad under it would be the same lounge with
 * a different beat.
 */
export type Vibe = {
  id: VibeId;
  grooveId: string;
  kit: string;
  feel: JamFeel;
  intensity: JamIntensity;
  bassVoice: JamBassVoice;
  keysVoice: JamKeysVoice;
  /** Who the vibe puts on stage. Drums alone for most of them (B1). */
  band: { drums: boolean; bass: boolean; keys: boolean };
  fills: boolean;
  /** As `Jam.fillEvery`: 0 is the chorus end only. */
  fillEvery: number;
  bpm: number;
  /** Written the way `keyName` writes it — "E", "Dm", "A blues". */
  key: string;
  /** The form the vibe starts on; a fixed kind, never custom. */
  form?: Exclude<JamFormKind, "custom">;
  /** The second row, once the tile is picked. May be empty. */
  variations: readonly VibeVariation[];
};

/** What picking a vibe (or one of its variations) writes onto the record. */
export type VibePatch = Partial<Omit<Jam, "id" | "createdAt">>;

/**
 * A groove as the compiler holds it — one bar, its fill, and the meter.
 *
 * `snareGhostIsRim` rides along because it is part of what the groove IS: the
 * quiet snare in a bossa is a cross-stick, and a shaping pass that dropped
 * the flag would hand the engine a bossa played with the tip of the stick on
 * the head.
 */
export type ShapedGroove = {
  beatsPerBar: number;
  ticksPerBeat: 1 | 2 | 3 | 4 | 6;
  bar: JamPattern;
  fill: JamPattern | null;
  snareGhostIsRim?: boolean;
};

// ---------------------------------------------------------------------------
// The wiring. The data lives in `vibes.ts` in its own shape (a bundle and
// partial bundles for the variations); the screens read the flat shape above.
// ---------------------------------------------------------------------------

/** The vibes, in the order the board draws them, in the screen's shape. */
export const VIBES: readonly Vibe[] = VIBE_DATA.map((v) => ({
  id: v.id as VibeId,
  grooveId: v.bundle.grooveId,
  kit: v.bundle.kit,
  feel: v.bundle.feel,
  intensity: v.bundle.intensity,
  bassVoice: v.bundle.bassVoice,
  keysVoice: v.bundle.keysVoice,
  band: { ...v.bundle.band },
  fills: v.bundle.fills,
  fillEvery: v.bundle.fillEvery,
  bpm: v.bundle.bpm,
  key: v.bundle.key,
  form: v.bundle.form,
  variations: v.variations.map((x) => {
    const b = vibeBundle(v, x.id);
    return {
      id: x.id as VariationId,
      grooveId: b.grooveId,
      kit: b.kit,
      feel: b.feel,
      intensity: b.intensity,
      bpm: b.bpm,
    };
  }),
}));

/**
 * Which vibe a jam is showing, when the record does not name one.
 *
 * A jam made from nothing has no `vibe` on it — `createJam` writes the field
 * only when a tile put it there — and neither does any jam saved before the
 * field existed. So the setup drawer opened with all nine tiles dark, and the
 * variation row ("Rock, which one") hidden with them. The owner tapped Rock
 * to see what it did and then could not un-tap it: "when i hit Rock there is
 * no way of un-selecting it, but when i select it the different subgenres
 * show up." Nothing had been selected in the first place, which is what made
 * the tile look like a toggle rather than a choice among nine.
 *
 * A vibe is not un-pickable — there is no "no vibe" for a band to play — so
 * the answer is that one of them is always right, and this works out which.
 * The groove is the signal: it is the one field every vibe and every
 * variation names, and it is the loudest thing about how a jam sounds. Its
 * own groove first, then any variation's, and failing both the vibe whose
 * name matches the groove's shelf — "funk" and the funk shelf are the same
 * word on purpose.
 *
 * Read only. Nothing is written to the record: the jam has not been started
 * from this vibe, it merely sounds like it, and saying so in the drawer is
 * not the same as claiming it in the file.
 */
export function vibeShowingFor(
  jam: Pick<Jam, "vibe" | "grooveId" | "customGroove">,
  /* The list to look in. A parameter because the picker's own import is what
     a test may have replaced, and a helper reading a different list from the
     screen calling it is a helper that answers about a different app. */
  vibes: readonly Vibe[] = VIBES,
): Vibe | null {
  if (jam.vibe) return vibes.find((v) => v.id === jam.vibe) ?? null;
  // A groove you drew yourself is nobody's vibe, and pretending otherwise
  // would light a tile that does not describe what is playing.
  if (jam.customGroove) return null;

  const exact = vibes.find((v) => v.grooveId === jam.grooveId);
  if (exact) return exact;

  const byVariation = vibes.find((v) => v.variations.some((x) => x.grooveId === jam.grooveId));
  if (byVariation) return byVariation;

  const family = GROOVES.find((g) => g.id === jam.grooveId)?.family;
  return (family && vibes.find((v) => v.id === family)) ?? null;
}

/**
 * And which of that vibe's variations, by the same rule.
 *
 * So the second row opens on the one that is playing rather than on none of
 * them, which would be the same puzzle one row down.
 */
export function variationShowingFor(
  jam: Pick<Jam, "vibe" | "variation" | "grooveId" | "customGroove">,
  vibes: readonly Vibe[] = VIBES,
): VariationId | null {
  if (jam.variation) return jam.variation as VariationId;
  const showing = vibeShowingFor(jam, vibes);
  if (!showing || jam.vibe) return null;
  return showing.variations.find((x) => x.grooveId === jam.grooveId)?.id ?? null;
}

/**
 * The patch a tile writes, for the jam it is being tapped over.
 *
 * It takes the JAM because four of the things a vibe does cannot be worked
 * out from the bundle alone, and this used to be a second, poorer answer to
 * the question `vibes.ts` already answers:
 *
 * - **The meter override goes.** Left on, a jam that had ever been given a
 *   meter of its own landed on the RULE groove for every tile after it — the
 *   waltz in four, the bossa in seven, one tap and no drummer.
 * - **The count-in is carried, not copied**, so "one bar" stays one bar when
 *   the bar changes length. Copied, it became a raw beat count that the
 *   count-in dropdown could not name and drew as its own id.
 * - **The progression is refitted** to the new form's length; a progression
 *   that is not exactly `form.bars` long is the one thing the record must
 *   never hold.
 * - **The custom groove and the custom kit go.** Both win over the bundle's
 *   own `grooveId` and `kit` wherever they are set, so leaving either on has
 *   the tile look applied while the drummer plays and sounds like something
 *   else.
 *
 * So this delegates: `vibes.ts` decides, and the patch is what it decided,
 * flattened back into the shape `editJam` merges. The screen's flat `Vibe`
 * adds nothing to the bundle — every field on it is a field of the bundle —
 * which is what makes delegation safe, and `vibesContract.test.ts` is what
 * keeps that true.
 */
export function applyVibe(jam: Jam, vibe: Vibe, variationId?: string): VibePatch {
  const next = applyVibeToJam(jam, vibe.id, variationId);
  // An id the data does not know. `applyVibeToJam` hands the jam straight
  // back, and the honest patch for that is no patch at all.
  if (next === jam) return {};
  return {
    vibe: next.vibe,
    // Present-and-undefined rather than absent, in both directions: the patch
    // is merged over the record, so a field a tile CLEARS has to arrive.
    variation: next.variation,
    grooveId: next.grooveId,
    kit: next.kit,
    feel: next.feel,
    intensity: next.intensity,
    bpm: next.bpm,
    bassVoice: next.bassVoice,
    keysVoice: next.keysVoice,
    band: next.band ? { ...next.band } : undefined,
    fills: next.fills,
    fillEvery: next.fillEvery,
    key: next.key,
    form: next.form,
    countIn: next.countIn,
    progression: next.progression,
    customGroove: next.customGroove,
    customKit: next.customKit,
    meter: next.meter,
  };
}

/**
 * Intensity as a PATTERN, not only a level (B5); see `intensity.ts`.
 *
 * `formBar` is the bar of the chorus about to be played, and it is here for
 * one rule: a loud drummer peaks the backbeat at the end of every four-bar
 * phrase. Default 0, which is a jam that has not started yet.
 */
export function applyIntensity(
  groove: ShapedGroove,
  intensity: JamIntensity,
  formBar = 0,
): ShapedGroove {
  return applyIntensityToGroove(groove, intensity, formBar);
}
