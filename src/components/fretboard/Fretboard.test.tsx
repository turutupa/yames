import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, cleanup } from "@testing-library/react";
import Fretboard, {
  FretboardStrip,
  positionForRoot,
  GUITAR_STANDARD_TUNING,
  BASS_STANDARD_TUNING,
} from "./Fretboard";
import { nameToPitchClass, type PitchClass } from "../../jam/harmony";
import { scaleNotes } from "../../jam/scales";

const pc = (name: string): PitchClass => nameToPitchClass(name) as PitchClass;

const A_MINOR_PENTATONIC = scaleNotes(pc("A"), "minorPentatonic");
const E_MINOR_PENTATONIC = scaleNotes(pc("E"), "minorPentatonic");

function dots(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-testid="fret-dot"]'));
}

function roots(container: HTMLElement): HTMLElement[] {
  return dots(container).filter((dot) => dot.classList.contains("fretboard-dot-root"));
}

afterEach(cleanup);

describe("Fretboard", () => {
  it("lights up every A minor pentatonic note on a twelve-fret guitar neck", () => {
    // Counted by hand, and worth keeping counted: the board shows the open
    // strings plus frets 1..12, which is thirteen places per string. Twelve
    // of those are a full chromatic turn, so each string carries the five
    // notes of the scale once; the thirteenth repeats the open string, which
    // adds one more on every string whose open note is in the scale. Standard
    // tuning is E A D G B E, and all of those but B are in A minor
    // pentatonic (A C D E G). So 6 x 5 + 5 = 35.
    const { container } = render(
      <Fretboard highlight={{ pitchClasses: A_MINOR_PENTATONIC, rootPitchClass: pc("A") }} />,
    );
    expect(dots(container)).toHaveLength(35);
  });

  it("fills the root and outlines the rest", () => {
    const { container } = render(
      <Fretboard highlight={{ pitchClasses: A_MINOR_PENTATONIC, rootPitchClass: pc("A") }} />,
    );
    // One A per string within a chromatic turn, and a second on the open A
    // string, which shows up again at the twelfth fret.
    expect(roots(container)).toHaveLength(7);
    for (const dot of roots(container)) {
      expect(dot.getAttribute("data-pitch-class")).toBe(String(pc("A")));
    }
    for (const dot of dots(container)) {
      expect(dot.classList.contains("fretboard-dot")).toBe(true);
    }
  });

  it("draws no filled dot when there is no root to fill", () => {
    const { container } = render(
      <Fretboard highlight={{ pitchClasses: A_MINOR_PENTATONIC }} />,
    );
    expect(dots(container)).toHaveLength(35);
    expect(roots(container)).toHaveLength(0);
  });

  it("drops the open strings when the board starts up the neck", () => {
    // Frets 1..12 is exactly one chromatic turn per string: five notes each,
    // six strings, thirty dots, and one root per string.
    const { container } = render(
      <Fretboard
        startFret={1}
        frets={12}
        highlight={{ pitchClasses: A_MINOR_PENTATONIC, rootPitchClass: pc("A") }}
      />,
    );
    expect(dots(container)).toHaveLength(30);
    expect(roots(container)).toHaveLength(6);
    expect(dots(container).filter((dot) => dot.getAttribute("data-fret") === "0")).toHaveLength(0);
  });

  it("shows the open strings as their own column at the nut", () => {
    const { container } = render(
      <Fretboard highlight={{ pitchClasses: A_MINOR_PENTATONIC, rootPitchClass: pc("A") }} />,
    );
    const open = dots(container).filter((dot) => dot.getAttribute("data-fret") === "0");
    // E A D G and the high E are all in the scale; the B string is not.
    expect(open).toHaveLength(5);
    expect(open.map((dot) => dot.getAttribute("data-string"))).toEqual(["0", "1", "2", "3", "5"]);
    // They sit to the left of the nut.
    const nut = container.querySelector(".fretboard-nut") as SVGLineElement;
    const nutX = Number(nut.getAttribute("x1"));
    for (const dot of open) expect(Number(dot.getAttribute("cx"))).toBeLessThan(nutX);
  });

  it("plays the same scale on a four-string bass", () => {
    // E A D G, every open string in the scale: 4 x 5 + 4 = 24.
    const { container } = render(
      <Fretboard
        tuning={BASS_STANDARD_TUNING}
        highlight={{ pitchClasses: A_MINOR_PENTATONIC, rootPitchClass: pc("A") }}
      />,
    );
    expect(dots(container)).toHaveLength(24);
    expect(container.querySelectorAll(".fretboard-string")).toHaveLength(4);
  });

  it("draws the highest string at the top, the way a chart is read", () => {
    const { container } = render(
      <Fretboard highlight={{ pitchClasses: [pc("E")], rootPitchClass: pc("E") }} />,
    );
    const openE = dots(container).filter((dot) => dot.getAttribute("data-fret") === "0");
    const low = openE.find((dot) => dot.getAttribute("data-string") === "0");
    const high = openE.find((dot) => dot.getAttribute("data-string") === "5");
    expect(low && high).toBeTruthy();
    expect(Number(high?.getAttribute("cy"))).toBeLessThan(Number(low?.getAttribute("cy")));
  });

  it("marks the frets a guitarist looks for", () => {
    const { container } = render(<Fretboard highlight={{ pitchClasses: [] }} />);
    // 3, 5, 7 and 9 take one inlay; the twelfth takes two.
    expect(container.querySelectorAll(".fretboard-inlay")).toHaveLength(6);
    expect(dots(container)).toHaveLength(0);
  });

  it("numbers the frets, and says where a board that starts up the neck begins", () => {
    const numbers = (container: HTMLElement) =>
      Array.from(container.querySelectorAll(".fretboard-number")).map((node) => node.textContent);
    const { container: atNut } = render(<Fretboard highlight={{ pitchClasses: [] }} />);
    // The nut already says where this is, so fret 1 needs no label.
    expect(numbers(atNut)).toEqual(["3", "5", "7", "9", "12"]);

    cleanup();
    const upTheNeck = render(
      <Fretboard startFret={6} frets={4} highlight={{ pitchClasses: [] }} />,
    );
    expect(numbers(upTheNeck.container)).toEqual(["6", "7", "9"]);
  });

  it("comes in two sizes, and the small one is smaller", () => {
    const { container: large } = render(
      <Fretboard size="large" highlight={{ pitchClasses: A_MINOR_PENTATONIC }} />,
    );
    const { container: small } = render(
      <Fretboard size="small" highlight={{ pitchClasses: A_MINOR_PENTATONIC }} />,
    );
    const largeSvg = large.querySelector("svg") as SVGSVGElement;
    const smallSvg = small.querySelector("svg") as SVGSVGElement;
    expect(largeSvg.classList.contains("fretboard-large")).toBe(true);
    expect(smallSvg.classList.contains("fretboard-small")).toBe(true);
    expect(Number(smallSvg.getAttribute("width"))).toBeLessThan(
      Number(largeSvg.getAttribute("width")),
    );
    // Both still show the same notes.
    expect(dots(small)).toHaveLength(dots(large).length);
  });

  it("stays out of a screen reader's way unless it is given something to say", () => {
    const { container } = render(<Fretboard highlight={{ pitchClasses: [] }} />);
    const svg = container.querySelector("svg") as SVGSVGElement;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("role")).toBeNull();

    cleanup();
    const spoken = render(
      <Fretboard highlight={{ pitchClasses: [] }} ariaLabel="A minor pentatonic" />,
    );
    const spokenSvg = spoken.container.querySelector("svg") as SVGSVGElement;
    expect(spokenSvg.getAttribute("role")).toBe("img");
    expect(spokenSvg.getAttribute("aria-label")).toBe("A minor pentatonic");
    expect(spokenSvg.getAttribute("aria-hidden")).toBeNull();
  });
});

describe("FretboardStrip", () => {
  it("opens at the position where the root falls on the lowest string", () => {
    // A on the low E string is the fifth fret — the first box every player
    // learns for A minor pentatonic.
    expect(positionForRoot(GUITAR_STANDARD_TUNING, pc("A"))).toBe(5);
    const { container } = render(
      <FretboardStrip highlight={{ pitchClasses: A_MINOR_PENTATONIC, rootPitchClass: pc("A") }} />,
    );
    const frets = dots(container).map((dot) => Number(dot.getAttribute("data-fret")));
    expect(Math.min(...frets)).toBeGreaterThanOrEqual(5);
    expect(Math.max(...frets)).toBeLessThanOrEqual(8);
    // Two notes of the scale on each of the six strings in that box, except
    // the B string, which carries the root at the eighth and one more.
    expect(dots(container).length).toBeGreaterThan(0);
    expect(container.querySelector("svg")?.classList.contains("fretboard-strip")).toBe(true);
  });

  it("uses the open position when that is where the root is", () => {
    expect(positionForRoot(GUITAR_STANDARD_TUNING, pc("E"))).toBe(0);
    const { container } = render(
      <FretboardStrip highlight={{ pitchClasses: E_MINOR_PENTATONIC, rootPitchClass: pc("E") }} />,
    );
    expect(dots(container).some((dot) => dot.getAttribute("data-fret") === "0")).toBe(true);
  });

  it("takes an explicit position when the caller has one", () => {
    const { container } = render(
      <FretboardStrip
        startFret={12}
        span={5}
        highlight={{ pitchClasses: A_MINOR_PENTATONIC, rootPitchClass: pc("A") }}
      />,
    );
    const frets = dots(container).map((dot) => Number(dot.getAttribute("data-fret")));
    expect(Math.min(...frets)).toBeGreaterThanOrEqual(12);
    expect(Math.max(...frets)).toBeLessThanOrEqual(16);
  });

  it("finds the root on a bass too", () => {
    expect(positionForRoot(BASS_STANDARD_TUNING, pc("A"))).toBe(5);
    expect(positionForRoot(BASS_STANDARD_TUNING, pc("G"))).toBe(3);
  });
});

describe("fretboard.css", () => {
  it("takes every colour from the theme, so the board follows it", () => {
    // vitest runs from the project root, and `import.meta.url` is not a file
    // URL under the happy-dom environment.
    const css = readFileSync(resolve(process.cwd(), "src/styles/fretboard.css"), "utf8");
    // No hex, no rgb(), no named colours hiding in a fill or a stroke.
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\brgba?\(/);
    const colourDeclarations = css.match(/(?:fill|stroke)\s*:\s*([^;]+);/g) ?? [];
    expect(colourDeclarations.length).toBeGreaterThan(0);
    for (const declaration of colourDeclarations) {
      expect(declaration, `${declaration} should use a theme variable`).toMatch(/var\(--/);
    }
  });
});
