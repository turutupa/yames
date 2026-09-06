import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Every beat-feedback classification must be painted on every dot family.
 *
 * The bug this guards: `GroupEditor` emitted `feedback-<classification>` on
 * `.group-dot` from the day the grouped editor replaced the flat dot row, but
 * only `.main-dot` was ever styled. The classes were there, the CSS was not,
 * so the metronome screen — the one the grouped dots are on — showed no
 * per-beat timing at all. Nothing failed; it just silently did nothing, which
 * is why it survived so long.
 *
 * Reading the classifications out of `types.ts` rather than listing them here
 * is the point: a sixth one added to the union fails this test until it is
 * drawn, instead of being invisible on one of the two screens.
 */

const root = process.cwd();
const css = fs.readFileSync(path.join(root, "src/styles/evaluation.css"), "utf8");
const types = fs.readFileSync(path.join(root, "src/types.ts"), "utf8");

/** The `classification` union, as declared. */
function classifications(): string[] {
  const m = types.match(/classification:\s*((?:"[a-z]+"\s*\|\s*)*"[a-z]+")\s*;/);
  if (!m) throw new Error("could not find the classification union in types.ts");
  return [...m[1].matchAll(/"([a-z]+)"/g)].map((x) => x[1]);
}

describe("beat feedback styling", () => {
  const classes = classifications();

  it("reads a union of five classifications", () => {
    expect(classes).toEqual(["perfect", "good", "ok", "miss", "skipped"]);
  });

  for (const family of ["main-dot", "group-dot"]) {
    it(`paints every classification on .${family}`, () => {
      const missing = classes.filter((c) => !css.includes(`.${family}.feedback-${c} {`));
      expect(missing).toEqual([]);
    });
  }

  it("keeps the grouped dot visible on a miss", () => {
    // A filled dot showed a miss by emptying itself. The grouped dot is a ring
    // and is already empty, so emptying it would erase the beat entirely — it
    // has to keep an outline and change colour instead.
    const rule = css.slice(
      css.indexOf(".group-dot.feedback-miss {"),
      css.indexOf("}", css.indexOf(".group-dot.feedback-miss {")),
    );
    expect(rule).toContain("border-color: var(--feedback-miss)");
    expect(rule).not.toContain("border-color: transparent");
  });

  it("wins over the beat's own fill", () => {
    // `metronome.css` loads after this file and `.group-dot.playing` has the
    // same specificity, so an un-flagged declaration loses to it.
    for (const c of ["perfect", "good", "ok", "miss"]) {
      const start = css.indexOf(`.group-dot.feedback-${c} {`);
      const rule = css.slice(start, css.indexOf("}", start));
      expect(rule, c).toContain("!important");
    }
  });
});
