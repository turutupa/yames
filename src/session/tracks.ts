/**
 * The Paths screen's groups: the curriculum map's three tracks and the one
 * start (plans/paths/NEW_PATHS.md, "Three tracks, one start").
 *
 * Rhythm Foundations is the start: time, the click and clean notes, which the
 * Technique and Styles tracks both build on. "How harmony works" is the
 * owner's route and has its own first Path, Know the Neck. A Path the map does
 * not name yet goes with its kind: mechanics to Technique, theory to Styles.
 *
 * Inside a track the Paths keep the map's order, and `curriculumOrder` makes
 * sure none sits above a Path it builds on. Nothing here locks or hides one.
 */
import { curriculumOrder } from "../paths/curriculum";
import type { PathDoc } from "../paths/format";

export type TrackId = "start" | "technique" | "styles" | "harmony";

/** Top to bottom on the Paths screen. */
export const TRACK_IDS: readonly TrackId[] = ["start", "technique", "styles", "harmony"];

/** The first Path for a beginner: the one the screen marks "Start here". */
export const START_HERE_PATH_ID = "rhythm-foundations";

/** Each track's Paths in the map's order. */
const TRACK_ORDER: Readonly<Record<TrackId, readonly string[]>> = {
  start: [START_HERE_PATH_ID],
  technique: [
    "alternate-picking",
    "legato",
    "tapping",
    "sweep-picking",
    "shred",
    "metal-rhythm",
    "funk-lines",
  ],
  styles: ["blues-pentatonics", "classic-rock"],
  harmony: ["know-the-neck", "scales-and-modes", "triads", "chords-in-a-key", "arpeggios-over-changes"],
};

/** Which track a Path is in. */
export function trackOf(path: Pick<PathDoc, "id" | "kind">): TrackId {
  for (const id of TRACK_IDS) if (TRACK_ORDER[id].includes(path.id)) return id;
  return path.kind === "mechanics" ? "technique" : "styles";
}

export type Track<T> = { id: TrackId; paths: T[] };

/** The Paths by track, in screen order, empty tracks left out. */
export function pathTracks<T extends Pick<PathDoc, "id" | "kind" | "prerequisites">>(paths: readonly T[]): Track<T>[] {
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
