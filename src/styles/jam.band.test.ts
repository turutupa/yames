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

  it("tells every part which column it is in", () => {
    // Sizing the columns is not enough: the rows carry different parts — the
    // drums row a kit name AND a groove picker, the bass row a picker and no
    // name, "you" neither — so a part placed by document order lands in the
    // wrong track on some row, or falls off the end onto a second line, which
    // is exactly how the on/off switch ended up under the row.
    const columns = /grid-template-columns:([^;]+);/.exec(rule(".jam-band-lane"))?.[1].trim();
    const count = (columns as string).split(/\s+(?![^(]*\))/).length;
    for (const part of [
      ".jam-band-name",
      ".jam-band-detail",
      ".jam-band-extra",
      ".jam-band-live",
      ".jam-band-volume",
      ".jam-band-lane > .jam-switch",
    ]) {
      const placed = /grid-column:\s*([^;]+);/.exec(rule(part))?.[1].trim();
      expect(placed, `${part} does not say which column it is in`).toBeTruthy();
      const track = Number(placed);
      expect(track, `${part} is in column ${placed}, outside the ${count}`).toBeLessThanOrEqual(
        count,
      );
    }
  });

  it("caps the dropdown at the width of its column", () => {
    expect(rule(".jam-band-extra")).toMatch(/max-width:\s*100%/);
    expect(rule(".jam-band-extra .jam-dropdown")).toMatch(/max-width:\s*100%/);
  });

  it("measures its own width, not the window's", () => {
    // The rows used to reflow on a media query, and a media query asks the
    // WINDOW. Open the setup drawer on a 1900px screen and the stage behind
    // it is about 900px — a narrow row inside a wide window — so the narrow
    // rules never fired: the switch was pushed off the end of its row and the
    // volume slider was drawn on top of the groove dropdown. The section is a
    // container now and the rows answer to it.
    expect(rule(".jam-band")).toMatch(/container-type:\s*inline-size/);
    expect(rule(".jam-band")).toMatch(/container-name:\s*band/);
    expect(css, "the rows still reflow on the window's width").not.toContain(
      "@media (max-width: 1023px)",
    );
  });

  it("drops the live notes before it squeezes the pickers, on a narrow stage", () => {
    // The readout is the part a player can do without; the picker is a
    // control. Below the threshold the notes go and the picker keeps its
    // room, rather than both being shaved.
    const narrow = css.indexOf("@container band (max-width: 880px)");
    expect(narrow, "no container query for a narrow stage").toBeGreaterThan(-1);
    expect(rule(".jam-band-live", narrow)).toMatch(/display:\s*none/);
    expect(rule(".jam-band-lane", narrow)).toMatch(/grid-template-columns:/);
  });
});
