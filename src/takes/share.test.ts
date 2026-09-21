/**
 * Where a clip might go next — and what the app does about it, which is open
 * a tab.
 *
 * The one thing worth a test here is the one that could quietly stop being
 * true: every link points OUTWARDS, at a site's own page, over https. The
 * moment one of them is an API endpoint or something on this machine, the
 * feature has stopped being "the player drags the file in" and started being
 * an integration that needs somebody's password.
 */
import { describe, expect, it } from "vitest";
import { placesFor, SHARE_PLACES } from "./share";

describe("where a clip can go", () => {
  it("names four places, each over https, each at its own site", () => {
    expect(SHARE_PLACES).toHaveLength(4);
    for (const place of SHARE_PLACES) {
      expect(place.name, "a place with no name").not.toBe("");
      const url = new URL(place.url);
      expect(url.protocol, `${place.name} is not https`).toBe("https:");
      // Not this machine, and not an API: this opens a page in the player's
      // browser and the app's involvement ends there.
      expect(url.hostname, `${place.name} points at this machine`).not.toMatch(
        /^(localhost|127\.|0\.0\.0\.0)/,
      );
      expect(url.hostname, `${place.name} points at an API`).not.toMatch(/^api\./);
    }
  });

  it("says which places want which shape, in a few words or none", () => {
    expect(placesFor("tall")).toBe("Instagram, TikTok");
    expect(placesFor("wide")).toBe("X");
    // A place that takes either is on neither list: "and also everywhere
    // else" beside every choice tells a reader nothing.
    expect(placesFor("tall")).not.toContain("YouTube");
    expect(placesFor("wide")).not.toContain("YouTube");
    for (const shape of ["wide", "tall"] as const) {
      expect(placesFor(shape).length, `the hint for ${shape} is a paragraph`).toBeLessThan(40);
    }
  });
});
