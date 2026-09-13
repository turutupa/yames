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
  JamIntensity,
  JamKeysVoice,
  JamPattern,
} from "./types";

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
] as const;

export type VibeId = (typeof VIBE_IDS)[number];

/**
 * Every variation id any vibe may offer, across all eight (A9).
 *
 * The same contract as `VIBE_IDS` and for the same reason — `jam.variation.<id>`
 * exists in all fifteen locales for each of these. Several vibes share one:
 * "ballad" is a rock variation and a jazz one, and it is the same word.
 */
export const VARIATION_IDS = [
  "classic",
  "hard",
  "punk",
  "alt",
  "ballad",
  "halfTime",
  "driving",
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
  "rumba",
  "songo",
  "eighths",
  "thrash",
  "midTempo",
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
  /** The second row, once the tile is picked. May be empty. */
  variations: readonly VibeVariation[];
};

/** What picking a vibe (or one of its variations) writes onto the record. */
export type VibePatch = Partial<Omit<Jam, "id" | "createdAt">>;

/** A groove as the compiler holds it — one bar, its fill, and the meter. */
export type ShapedGroove = {
  beatsPerBar: number;
  ticksPerBeat: 1 | 2 | 3 | 4 | 6;
  bar: JamPattern;
  fill: JamPattern | null;
};

// ---------------------------------------------------------------------------
// The stubs. Three lines at merge; see the header.
// ---------------------------------------------------------------------------

/**
 * The eight vibes. Empty until `vibes.ts` lands, and the sheet says so rather
 * than drawing eight tiles that do nothing.
 */
export const VIBES: readonly Vibe[] = [];

/** The bundle a vibe writes, with a variation's values over the top. */
export function applyVibe(vibe: Vibe, variationId?: string): VibePatch {
  const variation = vibe.variations.find((v) => v.id === variationId) ?? null;
  return {
    vibe: vibe.id,
    ...(variation ? { variation: variation.id } : { variation: undefined }),
    grooveId: variation?.grooveId ?? vibe.grooveId,
    kit: variation?.kit ?? vibe.kit,
    feel: variation?.feel ?? vibe.feel,
    intensity: variation?.intensity ?? vibe.intensity,
    bpm: variation?.bpm ?? vibe.bpm,
    bassVoice: vibe.bassVoice,
    keysVoice: vibe.keysVoice,
    band: { ...vibe.band },
    fills: vibe.fills,
    fillEvery: vibe.fillEvery,
    key: vibe.key,
    // A vibe is a fresh start, not a layer: a groove you drew by hand is not
    // "the Rock vibe", and leaving it on would have the tile look applied
    // while the drummer played something else entirely.
    customGroove: undefined,
  };
}

/**
 * Intensity as a PATTERN, not only a level (B5).
 *
 * Identity here; `intensity.ts` is where Loud drops the ghosts, opens the
 * hats on the off-beats and puts a crash on the section starts.
 */
export function applyIntensity(groove: ShapedGroove, _intensity: JamIntensity): ShapedGroove {
  return groove;
}
