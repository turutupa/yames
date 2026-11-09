/**
 * Where a jam clip's chord goes, and what it must not touch (W33 item 2).
 *
 * `jamStrip.test.ts` beside this one is about the GRID — the bar it lights,
 * the chord on it, the speed it scrolls at. This is about the biggest thing
 * on the frame, which until now nothing could ask a question of.
 *
 * Two of W32's own eight frames had two things in the same place, and neither
 * was visible to anything in this repo: the suite measured the strip and the
 * caption, and the chord — the biggest thing on the frame — was drawn by
 * arithmetic nobody could ask a question of. So the arithmetic is a function
 * now, and these are the questions.
 *
 * The ruler is a stand-in and deliberately a WIDE one: 0.62 of the type size
 * per character is about what Ivory's serif costs at this weight, which is
 * the face these two bugs were found in. A layout that survives it survives
 * the sans as well.
 */
import { describe, expect, it } from "vitest";
import { jamFullFrameBlock, jamOverPictureBlock } from "./jamStrip";
import type { Measure } from "./jamStrip";
import { clipOverlayLayout } from "./clip";
import type { ClipShape } from "./clip";

const serif: Measure = (text, _weight, size) => text.length * size * 0.62;

/** The frame, and the picture's box, which for a jam is the whole of it. */
function frame(shape: ClipShape) {
  const layout = clipOverlayLayout(shape);
  return { layout, box: { x: 0, y: 0, width: layout.width, height: layout.height } };
}

/** The names the brief names, and the ordinary one. */
const NAMES = ["F7", "F#m7b5", "Bbmaj7#11"];

describe("the chord over a picture", () => {
  for (const shape of ["wide", "tall"] as const) {
    for (const now of NAMES) {
      for (const next of NAMES) {
        it(`keeps "${now}" and "next ${next}" off the bar grid in ${shape}`, () => {
          const { layout, box } = frame(shape);
          const at = jamOverPictureBlock({
            layout,
            box,
            now,
            word: `next ${next}`,
            measure: serif,
          });

          // NOTHING reaches the panel the bar grid sits on. Both pieces are
          // drawn on an alphabetic baseline, so a quarter of the type size
          // is a generous allowance for the descender of a "y" or a "p".
          for (const [what, y, size] of [
            ["the chord", at.chordY, at.size],
            ["the next line", at.nextY, at.small],
          ] as const) {
            expect(
              y + size * 0.25,
              `${what} reaches ${String(Math.round(y + size * 0.25 - layout.strip.y))}px into the grid`,
            ).toBeLessThanOrEqual(layout.strip.y);
          }

          // ...and the two do not cross each other in 9:16, where one stands
          // on the other: the chord's descenders clear the next line's caps.
          if (shape === "tall") {
            expect(at.chordY + at.size * 0.25).toBeLessThanOrEqual(at.nextY - at.small * 0.7);
          }

          // Neither runs off the side of the frame.
          const pad = Math.round(layout.width * 0.045);
          expect(at.chordX + serif(now, 700, at.size)).toBeLessThanOrEqual(layout.width - pad + 1);
          expect(at.nextX + serif(`next ${next}`, 600, at.small)).toBeLessThanOrEqual(
            layout.width - pad + 1,
          );
          expect(at.nextX).toBeGreaterThanOrEqual(pad - 1);

          // And in 16:9 they sit side by side without touching.
          if (shape === "wide") {
            expect(at.nextX).toBeGreaterThanOrEqual(at.chordX + serif(now, 700, at.size));
          }

          // Still worth reading: a chord shrunk to nothing is a frame with no
          // chord on it, which is worse than a frame with a small one.
          expect(at.size).toBeGreaterThan(28);
          expect(at.small).toBeGreaterThan(14);
        });
      }
    }
  }

  it("gives the chord the whole width when there is no next chord", () => {
    const { layout, box } = frame("wide");
    const alone = jamOverPictureBlock({ layout, box, now: "Bbmaj7#11", word: "", measure: serif });
    const beside = jamOverPictureBlock({
      layout,
      box,
      now: "Bbmaj7#11",
      word: "next F#m7b5",
      measure: serif,
    });
    expect(alone.small).toBe(0);
    expect(alone.size).toBeGreaterThanOrEqual(beside.size);
  });
});

describe("the chord with no picture, where it IS the clip", () => {
  for (const shape of ["wide", "tall"] as const) {
    for (const now of NAMES) {
      it(`keeps the beat ring off "next" in ${shape} with "${now}"`, () => {
        const { layout, box } = frame(shape);
        const at = jamFullFrameBlock({
          layout,
          box,
          now,
          word: "next Bbmaj7#11",
          lineup: "drums · bass · keys",
          measure: serif,
        });

        /*
         * THE BUG THIS FILE EXISTS FOR. The ring swells on every beat to 0.88
         * of the type size, and the line under the chord used to be placed at
         * 0.74 of it — so four times a bar a ring was drawn through a word.
         */
        expect(
          at.nextY - at.small / 2,
          `the ring reaches ${String(Math.round(at.chordY + at.ringR - (at.nextY - at.small / 2)))}px into the next line`,
        ).toBeGreaterThanOrEqual(at.chordY + at.ringR);

        // The line-up under it is clear of the next line, and the grid is
        // clear of the line-up.
        expect(at.lineupY).not.toBeNull();
        expect(at.nextY + at.small / 2).toBeLessThanOrEqual(at.lineupY! - at.lineupSize / 2);
        expect(at.lineupY! + at.lineupSize / 2).toBeLessThanOrEqual(layout.strip.y);

        // The ring does not reach the top of the frame either.
        expect(at.chordY - at.ringR).toBeGreaterThanOrEqual(0);

        // Nothing off the sides.
        expect(serif(now, 700, at.size) / 2).toBeLessThanOrEqual(layout.width / 2);
        expect(at.size).toBeGreaterThan(28);
      });
    }
  }

  it("draws a ring that goes ROUND the chord, or none at all", () => {
    for (const shape of ["wide", "tall"] as const) {
      const { layout, box } = frame(shape);
      for (const now of NAMES) {
        const at = jamFullFrameBlock({
          layout,
          box,
          now,
          word: "next Ebm9",
          lineup: "drums · bass · keys",
          measure: serif,
        });
        if (!at.ring) continue;
        // Round it, with air: a circle whose radius is less than half the
        // width of the name is a circle drawn THROUGH the name, which is
        // what nine characters of a serif face produced.
        expect(
          at.ringR,
          `the ring cuts "${now}" in ${shape}`,
        ).toBeGreaterThanOrEqual(serif(now, 700, at.size) / 2);
        // ...and inside the frame.
        expect(at.ringR * 2).toBeLessThanOrEqual(layout.width);
      }
    }
  });

  it("still fills the frame when the chord is two characters", () => {
    const { layout, box } = frame("wide");
    const at = jamFullFrameBlock({
      layout,
      box,
      now: "F7",
      word: "next Bb7",
      lineup: "drums · bass · keys",
      measure: serif,
    });
    // W30's first render left four fifths of the frame empty and W32's brief
    // called it out by name. The block is a third of the frame's height at
    // least, or the picture is a chord floating in a void again.
    expect(at.ringR * 2).toBeGreaterThan(layout.height * 0.33);
  });

  it("has no line-up line when nobody is playing", () => {
    const { layout, box } = frame("tall");
    const at = jamFullFrameBlock({ layout, box, now: "F7", word: "", lineup: null, measure: serif });
    expect(at.lineupY).toBeNull();
    expect(at.small).toBe(0);
  });
});
