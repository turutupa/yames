import { describe, expect, it } from "vitest";
import type { PathDoc } from "../paths/format";
import { RUNNABLE_PATH_IDS } from "./packs";
import { pathTracks, trackOf } from "./tracks";

const PACKS = import.meta.glob("../paths/packs/*.json", { eager: true });
const PATHS = Object.values(PACKS)
  .map((m) => (m as { default: PathDoc }).default)
  .filter((p) => RUNNABLE_PATH_IDS.includes(p.id));

describe("the Paths screen's tracks (the curriculum map)", () => {
  it("one start, then Technique, Styles and How harmony works, every Path in exactly one", () => {
    const tracks = pathTracks(PATHS);
    expect(tracks.map((t) => [t.id, t.paths.map((p) => p.id)])).toEqual([
      ["start", ["rhythm-foundations"]],
      ["technique", ["alternate-picking", "legato", "tapping", "sweep-picking", "shred", "metal-rhythm", "funk-lines"]],
      ["styles", ["blues-pentatonics", "classic-rock"]],
      ["harmony", ["know-the-neck", "scales-and-modes", "triads", "chords-in-a-key"]],
    ]);
    expect(tracks.flatMap((t) => t.paths).length).toBe(PATHS.length);
  });

  it("no Path sits above one it builds on inside its track, whatever order they arrive in", () => {
    for (const track of pathTracks([...PATHS].reverse())) {
      const ids = track.paths.map((p) => p.id);
      for (const [i, p] of track.paths.entries()) {
        for (const need of p.prerequisites.paths) {
          const at = ids.indexOf(need.path);
          if (at >= 0) expect(at, `${p.id} after ${need.path}`).toBeLessThan(i);
        }
      }
    }
  });

  it("a Path the map does not name goes with its kind; empty tracks are left out", () => {
    expect(trackOf({ id: "new-one", kind: "mechanics" })).toBe("technique");
    expect(trackOf({ id: "new-two", kind: "theory" })).toBe("styles");
    const only = PATHS.filter((p) => p.id === "legato");
    expect(pathTracks(only).map((t) => t.id)).toEqual(["technique"]);
  });
});
