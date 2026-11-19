import { describe, expect, it } from "vitest";
import type { PathDoc } from "../paths/format";
import { RUNNABLE_PATH_IDS } from "./packs";
import { pathTracks, trackOf } from "./tracks";

const PACKS = import.meta.glob("../paths/packs/*.json", { eager: true });
const PATHS = Object.values(PACKS)
  .map((m) => (m as { default: PathDoc }).default)
  .filter((p) => RUNNABLE_PATH_IDS.includes(p.id));

describe("the Paths screen's tracks (the curriculum map)", () => {
  it("by category: the one start, How harmony works, Technique, Styles; every Path in exactly one", () => {
    const tracks = pathTracks(PATHS);
    expect(tracks.map((t) => [t.id, t.paths.map((p) => p.id)])).toEqual([
      ["foundations", ["rhythm-foundations", "first-chords"]],
      ["harmony", ["know-the-neck", "scales-and-modes", "triads", "chords-in-a-key", "arpeggios-over-changes"]],
      ["technique", ["alternate-picking", "legato", "tapping", "sweep-picking", "shred", "metal-rhythm", "funk-lines"]],
      ["style", ["blues-pentatonics", "classic-rock"]],
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

  it("a pack without a category goes with its kind; Triads is harmony, never a style; empty groups are left out", () => {
    expect(trackOf({ kind: "mechanics" })).toBe("technique");
    expect(trackOf({ kind: "theory" })).toBe("style");
    expect(trackOf(PATHS.find((p) => p.id === "triads")!)).toBe("harmony");
    expect(trackOf(PATHS.find((p) => p.id === "chords-in-a-key")!)).toBe("harmony");
    const only = PATHS.filter((p) => p.id === "legato");
    expect(pathTracks(only).map((t) => t.id)).toEqual(["technique"]);
  });
});
