import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StepSentence } from "./StepSentence";
import { jamToSetlistStep } from "../../setlist";
import { STARTER_JAMS } from "../../jam/jams";
import type { Jam } from "../../jam/types";
import type { SetlistStep } from "../../types";

/**
 * A step, said as a sentence you can reach into.
 *
 * These cover the two things the owner found by using it: the timing phrases
 * opened ONE window holding both decisions, and the meter window had no FREE
 * even though FREE is a meter like any other on the metronome's own row.
 */

const STEP: SetlistStep = {
  id: "s1",
  name: "Alt picking",
  bpm: 96,
  subdivision: 4,
  beatGroups: [4],
  freeMode: false,
  soundType: "wood",
  volume: 0.7,
  trigger: { kind: "bars", bars: 8 },
  transition: { kind: "countIn", bars: 2 },
};

function draw(
  over: Partial<SetlistStep> = {},
  onChange = vi.fn(),
  jam: Jam | null = null,
  folded = false,
) {
  const result = render(
    <StepSentence
      step={{ ...STEP, ...over }}
      number={2}
      total={4}
      isLast={false}
      jam={jam}
      folded={folded}
      onChange={onChange}
    />,
  );
  return { ...result, onChange };
}

/** The phrase carrying `text`, as the button you would click. */
const phrase = (text: string | RegExp) =>
  screen.getByText(text).closest("button") as HTMLElement;

describe("the timing phrases open a window each", () => {
  it("gives the trigger its own window, holding only the trigger", async () => {
    // One window for both decisions meant clicking "8 bars" produced two
    // headings, up to two steppers and two notes before you had read either.
    draw();
    await userEvent.click(phrase("8 bars"));

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-label")).toBe("Move on");
    expect(within(dialog).getByText("When I say")).toBeTruthy();
    expect(within(dialog).getByText("After bars")).toBeTruthy();
    // ...and nothing about how the NEXT step arrives.
    expect(within(dialog).queryByText("Get there by")).toBeNull();
    expect(within(dialog).queryByText("Clean cut")).toBeNull();
    expect(within(dialog).queryByText("Count me in")).toBeNull();
  });

  it("gives the transition its own window, holding only the transition", async () => {
    draw();
    await userEvent.click(phrase(/count in/i));

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-label")).toBe("Get there by");
    expect(within(dialog).getByText("Clean cut")).toBeTruthy();
    expect(within(dialog).getByText("Rest a bar")).toBeTruthy();
    expect(within(dialog).queryByText("Move on")).toBeNull();
    expect(within(dialog).queryByText("After time")).toBeNull();
  });

  it("opens one at a time", async () => {
    draw();
    await userEvent.click(phrase("8 bars"));
    await userEvent.click(phrase(/count in/i));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe("Get there by");
  });
});

describe("the meter window", () => {
  it("offers FREE, because FREE is a meter", async () => {
    // It was missing, and it is the leftmost slot on the metronome's own
    // meter row — a meter like the others rather than a modifier on one.
    const { onChange } = draw();
    await userEvent.click(phrase("4/4"));
    await userEvent.click(screen.getByText("FREE"));
    expect(onChange).toHaveBeenCalledWith({ freeMode: true });
  });

  it("marks FREE as the one you are in, and the presets as not", async () => {
    draw({ freeMode: true });
    await userEvent.click(phrase("FREE"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("FREE").closest("button")!.getAttribute("aria-pressed")).toBe("true");
    expect(within(dialog).getByText("4/4").closest("button")!.getAttribute("aria-pressed")).toBe("false");
  });

  it("lets you set the beat count without dropping out of FREE", async () => {
    // The beats field forced `freeMode: false`, so choosing how many beats
    // silently took FREE away — the two belong together.
    const { onChange } = draw({ freeMode: true });
    await userEvent.click(phrase("FREE"));
    const dialog = screen.getByRole("dialog");
    const plus = within(dialog)
      .getAllByRole("button")
      .find((b) => /\+\s*1$/.test(b.getAttribute("aria-label") ?? ""))!;
    await userEvent.click(plus);
    expect(onChange).toHaveBeenCalled();
    for (const call of onChange.mock.calls) {
      expect(call[0]).not.toHaveProperty("freeMode", false);
    }
  });
});

// ---------------------------------------------------------------------------
// A jam as a step (JAM_MODE §8.5)
// ---------------------------------------------------------------------------

const BLUES: Jam = { ...STARTER_JAMS[0], name: "Slow blues in A", bpm: 92 };

/**
 * The step the library's "add a jam" would produce, drawn as the paragraph
 * draws it — folded, which is every row of a setlist you are reading.
 */
function drawJamStep(jam: Jam | null = BLUES, over: Partial<SetlistStep> = {}) {
  const step = { ...jamToSetlistStep(BLUES), ...over };
  return draw(step, vi.fn(), jam, true);
}

describe("a step that is a jam", () => {
  it("reads as the jam: its name, its tempo, and one chorus", () => {
    // "Slow blues in A · 92 · 12 bars" — the three facts you need to know
    // which step of the routine this is without opening anything.
    const { container } = drawJamStep();
    expect(screen.getByText("Slow blues in A")).toBeTruthy();
    expect(screen.getByText("92")).toBeTruthy();
    expect(screen.getByText("12 bars")).toBeTruthy();
    expect(container.querySelector(".setlist-jam-mark")).toBeTruthy();
  });

  it("does not offer the meter, because the meter belongs to the groove", () => {
    // A meter picked here would move the engine's grid out from under the
    // table the groove was written on, and the engine's way of refusing a
    // table it cannot check is to play the plain click, silently.
    drawJamStep();
    expect(screen.queryByLabelText("Meter")).toBeNull();
    expect(screen.queryByLabelText("Subdivision")).toBeNull();
  });

  it("still offers the tempo, which is the routine's to change", () => {
    // The step carries a copy, and the runner sends the copy: playing a jam
    // slower in one routine than in another is the point of a copy.
    drawJamStep();
    expect(screen.getByText("92").closest("button")).toBeTruthy();
  });

  it("keeps the trigger and the transition exactly as any step has them", () => {
    drawJamStep(BLUES, { trigger: { kind: "bars", bars: 48 }, transition: { kind: "countIn", bars: 2 } });
    expect(screen.getByText("48 bars")).toBeTruthy();
    expect(screen.getByText(/count in/i)).toBeTruthy();
  });

  it("says the band rather than offering a click to choose", () => {
    drawJamStep();
    expect(screen.getByText("the band")).toBeTruthy();
    expect(screen.queryByText("beep")).toBeNull();
  });

  it("says so when the jam is gone, and gives the controls back", () => {
    // The step still has a tempo, a meter and a sound, so it plays — as a
    // click. That is the honest outcome, and it is not what the row looks
    // like it will do unless the row says so.
    const { container } = drawJamStep(null);
    expect(screen.getByText(/no longer in the library/i)).toBeTruthy();
    expect(container.querySelector(".setlist-jam-mark[data-gone]")).toBeTruthy();
    expect(screen.getByLabelText("Meter")).toBeTruthy();
    expect(screen.getByLabelText("Subdivision")).toBeTruthy();
  });

  it("leaves an ordinary step completely alone", () => {
    const { container } = draw();
    expect(container.querySelector(".setlist-jam-mark")).toBeNull();
    expect(screen.queryByText(/no longer in the library/i)).toBeNull();
    expect(screen.getByLabelText("Meter")).toBeTruthy();
  });
});
