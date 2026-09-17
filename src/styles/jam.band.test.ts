import { describe, it, expect } from "vitest";
import { readStylesheet } from "../test/readStyles";

/**
 * The band rows on the playing screen, and the one thing only CSS can get
 * wrong about them (2026-09-17).
 *
 * The rows used to be a flex line: name, detail, live notes, volume, switch,
 * laid end to end. Then the keys row grew a comping picker and the bass row a
 * style picker, and on a narrow window those two pushed the volume slider and
 * the on/off switch past the right-hand edge of the row — the owner's report
 * was "the piano has more drop downs making the on off switch show up out of
 * the table". Flex was the cause: nothing in that line said which parts get
 * the space and which parts keep their size, so the widest content won.
 *
 * It is a grid now, and the last two columns are sized by their content while
 * the middle ones are `minmax(0, …)` — the track that can shrink is the one
 * holding the dropdown, and the volume and the switch are always inside the
 * row. That is what these assert: a render test cannot see it, because
 * happy-dom does no layout.
 */

const css = readStylesheet("jam.css");

/** The body of the first rule whose selector list contains `selector`. */
function rule(selector: string, from = 0): string {
  const at = css.indexOf(`${selector} {`, from);
  expect(at, `${selector} is not in jam.css`).toBeGreaterThan(-1);
  const open = css.indexOf("{", at);
  return css.slice(open + 1, css.indexOf("}", open));
}

describe("a band row on the playing screen", () => {
  it("lays its parts out on a grid, not end to end", () => {
    const lane = rule(".jam-band-lane");
    expect(lane).toMatch(/display:\s*grid/);
    expect(lane).toMatch(/grid-template-columns:/);
  });

  it("gives the space to the columns that can shrink, and not to the controls", () => {
    const columns = /grid-template-columns:([^;]+);/.exec(rule(".jam-band-lane"))?.[1].trim();
    expect(columns).toBeTruthy();
    const tracks = (columns as string).split(/\s+(?![^(]*\))/);
    // The last two tracks are the volume and the switch: sized by content, so
    // a wider dropdown cannot push them out of the row.
    expect(tracks.slice(-2)).toEqual(["auto", "auto"]);
    // And every flexible track is allowed to shrink below its content.
    for (const track of tracks.filter((t) => t.startsWith("minmax"))) {
      expect(track, track).toMatch(/^minmax\(0,/);
    }
  });

  it("caps the dropdown at the width of its column", () => {
    expect(rule(".jam-band-extra")).toMatch(/max-width:\s*100%/);
    expect(rule(".jam-band-extra .jam-dropdown")).toMatch(/max-width:\s*100%/);
  });

  it("drops the live notes before it squeezes the pickers, on a narrow window", () => {
    // The readout is the part a player can do without; the picker is a
    // control. Below the breakpoint the notes go and the picker keeps its
    // room, rather than both being shaved.
    const narrow = css.indexOf("@media (max-width: 1023px)");
    expect(narrow).toBeGreaterThan(-1);
    expect(rule(".jam-band-live", narrow)).toMatch(/display:\s*none/);
    const columns = rule(".jam-band-lane", narrow);
    expect(columns).toMatch(/grid-template-columns:/);
  });
});
