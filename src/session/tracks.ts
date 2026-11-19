/**
 * The Paths screen's groups: the curriculum map's start and its tracks
 * (plans/paths/NEW_PATHS.md, "Three tracks, one start"), read from each Path's
 * `category` ("Categories in the format"; `categoryOf` answers for a pack
 * written before it existed).
 *
 * Top to bottom: Foundations (Rhythm Foundations, the one start), then How
 * harmony works (its own first Path, Know the Neck: a beginner's two Paths are
 * the first two groups), then Technique and Styles.
 *
 * Inside a group the Paths keep the map's order, and `curriculumOrder` makes
 * sure none sits above a Path it builds on. Nothing here locks or hides one.
 */
import { categoryOf, curriculumOrder } from "../paths/curriculum";
import type { PathCategory, PathDoc } from "../paths/format";

export type TrackId = PathCategory;

/** Top to bottom on the Paths screen. */
export const TRACK_IDS: readonly TrackId[] = ["foundations", "harmony", "technique", "style"];

/** The first Path for a beginner: the one the screen marks "Start here". */
export const START_HERE_PATH_ID = "rhythm-foundations";

/** Each group's Paths in the map's order; a Path not named here comes after them. */
const TRACK_ORDER: Readonly<Record<TrackId, readonly string[]>> = {
  foundations: [START_HERE_PATH_ID],
  technique: [
    "alternate-picking",
    "legato",
    "tapping",
    "sweep-picking",
    "shred",
    "metal-rhythm",
    "funk-lines",
  ],
  style: ["blues-pentatonics", "classic-rock"],
  harmony: ["know-the-neck", "scales-and-modes", "triads", "chords-in-a-key", "arpeggios-over-changes"],
};

type Grouped = Pick<PathDoc, "id" | "kind" | "category" | "prerequisites">;

/** Which group a Path is in: its category. */
export function trackOf(path: Pick<PathDoc, "kind" | "category">): TrackId {
  return categoryOf(path);
}

export type Track<T> = { id: TrackId; paths: T[] };

/** The Paths by group, in screen order, empty groups left out. */
export function pathTracks<T extends Grouped>(paths: readonly T[]): Track<T>[] {
  return TRACK_IDS.map((id) => {
    const order = TRACK_ORDER[id];
    const rank = (p: T) => {
      const i = order.indexOf(p.id);
      return i < 0 ? order.length : i;
    };
    const mine = paths.filter((p) => trackOf(p) === id).sort((a, b) => rank(a) - rank(b));
    return { id, paths: curriculumOrder(mine) };
  }).filter((t) => t.paths.length > 0);
}
