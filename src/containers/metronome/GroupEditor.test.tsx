/**
 * GroupEditor — the beat stepper and the dots (PR #11, F4/F7/F8/F9; UI
 * revamp gaps M4/M5).
 *
 * Locks in:
 * - The component is presentational: the stepper reports through the
 *   `onBeatGroupsChange` prop and never touches IPC itself.
 * - In FREE mode the stepper wraps at both ends (MAX → MIN and MIN → MAX)
 *   rather than clamping, which is why its buttons never disable.
 * - Beat counts render through i18n with real plural forms, so 1 reads
 *   "1 beat" and not "1 beats".
 *
 * The stepper's GROUPED behaviour — walking the meter list — lives in
 * `BeatStepper.test.tsx`, which is the component's own file.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GroupEditor } from "./GroupEditor";
import { BeatStepper, ClicksPerBar } from "./BeatStepper";
import { mockInvoke } from "../../test/mocks";
import { MAX_FREE_BEATS, MIN_FREE_BEATS } from "../../constants/metronome";
import type { BeatFeedback } from "../../types";

function stepper(label: "Add beat" | "Remove beat"): HTMLButtonElement {
  return screen.getByLabelText(label) as HTMLButtonElement;
}

function fb(classification: string): BeatFeedback {
  return {
    beatIndex: 0,
    deviationMs: 0,
    intervalErrorMs: 0,
    classification,
    amplitude: 0.5,
    calibrationOffsetMs: 0,
    calibrationConfidence: 1,
    gridCorrelation: 1,
  } as BeatFeedback;
}

function dots(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll(".group-dot")] as HTMLElement[];
}

describe("GroupEditor — free mode", () => {
  it("renders one dot per beat", () => {
    const { container } = render(
      <GroupEditor beatGroups={[5]} subdivision={1} freeMode />,
    );
    expect(container.querySelectorAll(".free-dots .group-dot")).toHaveLength(5);
  });

  it("reports the next bar through onBeatGroupsChange", () => {
    const onBeatGroupsChange = vi.fn();
    render(
      <BeatStepper
        beatGroups={[4]}
        freeMode
        onBeatGroupsChange={onBeatGroupsChange}
      />,
    );
    fireEvent.click(stepper("Add beat"));
    expect(onBeatGroupsChange).toHaveBeenCalledWith([5]);
    fireEvent.click(stepper("Remove beat"));
    expect(onBeatGroupsChange).toHaveBeenCalledWith([3]);
  });

  it("stays one group — FREE mode is N equal beats, and Rust enforces it", () => {
    const onBeatGroupsChange = vi.fn();
    render(
      <BeatStepper
        beatGroups={[4]}
        freeMode
        onBeatGroupsChange={onBeatGroupsChange}
      />,
    );
    fireEvent.click(stepper("Add beat"));
    expect(onBeatGroupsChange.mock.calls[0][0]).toHaveLength(1);
  });

  it(`wraps ${MAX_FREE_BEATS} → ${MIN_FREE_BEATS} on the up stepper`, () => {
    const onBeatGroupsChange = vi.fn();
    render(
      <BeatStepper
        beatGroups={[MAX_FREE_BEATS]}
        freeMode
        onBeatGroupsChange={onBeatGroupsChange}
      />,
    );
    fireEvent.click(stepper("Add beat"));
    expect(onBeatGroupsChange).toHaveBeenCalledWith([MIN_FREE_BEATS]);
  });

  it(`wraps ${MIN_FREE_BEATS} → ${MAX_FREE_BEATS} on the down stepper`, () => {
    const onBeatGroupsChange = vi.fn();
    render(
      <BeatStepper
        beatGroups={[MIN_FREE_BEATS]}
        freeMode
        onBeatGroupsChange={onBeatGroupsChange}
      />,
    );
    fireEvent.click(stepper("Remove beat"));
    expect(onBeatGroupsChange).toHaveBeenCalledWith([MAX_FREE_BEATS]);
  });

  it("never disables the chevrons — they wrap instead of clamping", () => {
    render(
      <BeatStepper beatGroups={[MAX_FREE_BEATS]} freeMode />,
    );
    expect(stepper("Add beat").disabled).toBe(false);
    expect(stepper("Remove beat").disabled).toBe(false);
  });

  it("does no IPC of its own — the stepper is a prop callback", () => {
    render(
      <BeatStepper
        beatGroups={[4]}
        freeMode
        onBeatGroupsChange={vi.fn()}
      />,
    );
    fireEvent.click(stepper("Add beat"));
    fireEvent.click(stepper("Remove beat"));
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("does not throw when no onBeatGroupsChange is wired", () => {
    render(<BeatStepper beatGroups={[4]} freeMode />);
    expect(() => fireEvent.click(stepper("Add beat"))).not.toThrow();
  });

  it("shows the bar's length on the stepper, and clicks/bar on the heading", () => {
    // Two components since the METER section became a heading over a row:
    // the stepper is pressed, clicks/bar is only read, and they no longer
    // share a box.
    const step = render(<BeatStepper beatGroups={[7]} freeMode />);
    expect(step.container.querySelector(".beat-stepper-value")?.textContent).toBe("7");
    const clicks = render(<ClicksPerBar beatGroups={[7]} subdivision={2} />);
    expect(clicks.container.querySelector(".beat-clicks")?.textContent).toBe(
      "14 clicks/bar",
    );
  });

  it("names the stepper for a screen reader, with the plural form", () => {
    // The visible label is a bare digit (the design's `− 6 +`), so the count
    // in words has to reach assistive tech some other way.
    render(<BeatStepper beatGroups={[1]} freeMode />);
    expect(screen.getByLabelText("1 beat")).not.toBeNull();
  });
  it("accents FREE mode's dots when the mode says every beat", () => {
    // The free branch used to draw no accent ring at all, whatever the
    // control said.
    const { container } = render(
      <GroupEditor beatGroups={[4]} subdivision={1} freeMode accentMode="all" />,
    );
    expect(container.querySelectorAll(".free-dots .group-dot.accent")).toHaveLength(4);
  });

  it("accents FREE mode's first dot under groups, and no others", () => {
    // The bug the owner reported: on FREE, "Every beat" and "None" behaved
    // and "Group starts" did nothing — no click, no lit dot. A FREE bar is
    // one group of N, so it opens once, at beat one.
    const { container } = render(
      <GroupEditor beatGroups={[4]} subdivision={1} freeMode accentMode="groups" />,
    );
    const dots = [...container.querySelectorAll(".free-dots .group-dot")];
    expect(dots.map((d) => d.classList.contains("accent"))).toEqual([
      true,
      false,
      false,
      false,
    ]);
  });

  it("leaves FREE mode's dots unaccented under none", () => {
    const { container } = render(
      <GroupEditor beatGroups={[4]} subdivision={1} freeMode accentMode="none" />,
    );
    expect(container.querySelectorAll(".free-dots .group-dot.accent")).toHaveLength(0);
  });

});

describe("GroupEditor — grouped mode", () => {
  it("renders one box per group, each naming its length in its title", () => {
    // M5 took the caption out from under every group — it repeated what the
    // dots already show. The count it carried survives as the tooltip.
    const { container } = render(
      <GroupEditor beatGroups={[3, 2, 2]} subdivision={1} />,
    );
    const boxes = [...container.querySelectorAll(".group-box")];
    expect(boxes).toHaveLength(3);
    expect(boxes.map((b) => b.getAttribute("title"))).toEqual([
      "3 beats",
      "2 beats",
      "2 beats",
    ]);
  });

  it("uses the singular form for a one-beat group", () => {
    const { container } = render(
      <GroupEditor beatGroups={[1, 3]} subdivision={1} />,
    );
    expect(
      [...container.querySelectorAll(".group-box")].map((b) =>
        b.getAttribute("title"),
      ),
    ).toEqual(["1 beat", "3 beats"]);
  });

  it("shows the total on the stepper and clicks/bar on the heading", () => {
    // The `3 + 2 + 2` formula is not repeated here: it is stated next to the
    // meter chip, which is where the grouping is chosen (see MeterPresets).
    const step = render(<BeatStepper beatGroups={[3, 2, 2]} />);
    expect(step.container.querySelector(".beat-stepper-value")?.textContent).toBe("7");
    const clicks = render(<ClicksPerBar beatGroups={[3, 2, 2]} subdivision={3} />);
    expect(clicks.container.querySelector(".beat-clicks")?.textContent).toBe(
      "21 clicks/bar",
    );
  });

});

/**
 * The dot tier at a glance: 2 for `.accent`, 1 for `.accent-medium`, 0 for a
 * plain ring. Read off `classList` rather than off the class string, because
 * "accent-medium" contains "accent" and a substring test cannot tell a bar's
 * opening from its middle — which is the whole distinction being drawn.
 */
function tiers(container: HTMLElement): number[] {
  return dots(container).map((d) =>
    d.classList.contains("accent") ? 2 : d.classList.contains("accent-medium") ? 1 : 0,
  );
}

describe("GroupEditor — accents", () => {
  it("draws three kinds of dot: the bar's opening, its middles, and the rest", () => {
    const { container } = render(
      <GroupEditor beatGroups={[3, 2, 2]} subdivision={1} />,
    );
    expect(tiers(container)).toEqual([2, 0, 0, 1, 0, 1, 0]);
  });

  it("gives a bar of 6/8 a middle, in either grouping", () => {
    // Issue 52 on the screen: beat four of 3+3 is not a second beat one.
    const compound = render(<GroupEditor beatGroups={[3, 3]} subdivision={1} />);
    expect(tiers(compound.container)).toEqual([2, 0, 0, 1, 0, 0]);
    compound.unmount();

    const duple = render(<GroupEditor beatGroups={[2, 2, 2]} subdivision={1} />);
    expect(tiers(duple.container)).toEqual([2, 0, 1, 0, 1, 0]);
  });

  it("keeps every beat strong under `all` — a flat pulse has no middle", () => {
    const { container } = render(
      <GroupEditor beatGroups={[3, 2, 2]} subdivision={1} accentMode="all" />,
    );
    expect(tiers(container)).toEqual([2, 2, 2, 2, 2, 2, 2]);
  });

  it("draws exactly one accent marker in FREE mode — the first beat, strong", () => {
    const { container } = render(
      <GroupEditor beatGroups={[7]} subdivision={1} freeMode />,
    );
    expect(tiers(container)).toEqual([2, 0, 0, 0, 0, 0, 0]);
  });

  it("takes the LIVE accent from the engine, not the local markers", () => {
    // Beat 1 does not open a group, but the engine says this tick is
    // accented — the dot must follow the engine.
    const { container } = render(
      <GroupEditor
        beatGroups={[3, 2, 2]}
        subdivision={1}
        isPlaying
        isDownbeat
        activeBeat={1}
        accentBeat={2}
      />,
    );
    expect(dots(container)[1].classList.contains("accent")).toBe(true);

    // ...and the converse: a group start the engine did NOT accent (a
    // speed ramp running with a different bar length, or FREE mode)
    // stays plain.
    const { container: c2 } = render(
      <GroupEditor
        beatGroups={[3, 2, 2]}
        subdivision={1}
        isPlaying
        isDownbeat
        activeBeat={3}
        accentBeat={0}
      />,
    );
    expect(tiers(c2)[3]).toBe(0);
  });

  it("draws the LIVE middle accent as a middle, not as a downbeat", () => {
    // A ramp can accent a beat the grouping does not, and the grouping can
    // mark a beat the engine is playing at another tier. The lit dot is the
    // engine's to describe, at whichever tier it reports.
    const { container } = render(
      <GroupEditor
        beatGroups={[3, 3]}
        subdivision={1}
        isPlaying
        isDownbeat
        activeBeat={3}
        accentBeat={1}
      />,
    );
    const lit = dots(container)[3];
    expect(lit.classList.contains("accent-medium")).toBe(true);
    expect(lit.classList.contains("accent")).toBe(false);
    expect(lit.classList.contains("playing")).toBe(true);
  });

  it("draws FREE mode's lit dot at the tier the engine reports", () => {
    const { container } = render(
      <GroupEditor
        beatGroups={[4]}
        subdivision={1}
        freeMode
        isPlaying
        isDownbeat
        activeBeat={0}
        accentBeat={2}
      />,
    );
    const lit = dots(container)[0];
    expect(lit.classList.contains("accent")).toBe(true);
    expect(lit.classList.contains("playing")).toBe(true);
  });
});

describe("GroupEditor — per-beat evaluation feedback", () => {
  it("renders different classes for a miss and a perfect hit", () => {
    const missed = render(
      <GroupEditor
        beatGroups={[4]}
        subdivision={1}
        isPlaying
        isDownbeat
        activeBeat={2}
        feedback={new Map([[2, fb("miss")]])}
      />,
    );
    const perfect = render(
      <GroupEditor
        beatGroups={[4]}
        subdivision={1}
        isPlaying
        isDownbeat
        activeBeat={2}
        feedback={new Map([[2, fb("perfect")]])}
      />,
    );
    const missClass = dots(missed.container)[2].className;
    const perfectClass = dots(perfect.container)[2].className;
    expect(missClass).toContain("feedback-miss");
    expect(perfectClass).toContain("feedback-perfect");
    expect(missClass).not.toBe(perfectClass);
  });

  it("only tints the beat that is currently lit", () => {
    const { container } = render(
      <GroupEditor
        beatGroups={[4]}
        subdivision={1}
        isPlaying
        isDownbeat
        activeBeat={2}
        feedback={new Map([[1, fb("miss")], [2, fb("good")]])}
      />,
    );
    expect(dots(container)[1].className).not.toContain("feedback-");
    expect(dots(container)[2].className).toContain("feedback-good");
  });

  it("tints the FREE-mode dots too", () => {
    const { container } = render(
      <GroupEditor
        beatGroups={[5]}
        subdivision={1}
        freeMode
        isPlaying
        isDownbeat
        activeBeat={3}
        feedback={new Map([[3, fb("ok")]])}
      />,
    );
    expect(dots(container)[3].className).toContain("feedback-ok");
  });

  it("renders no feedback class when no feedback is supplied", () => {
    const { container } = render(
      <GroupEditor beatGroups={[4]} subdivision={1} isPlaying isDownbeat activeBeat={0} />,
    );
    for (const d of dots(container)) expect(d.className).not.toContain("feedback-");
  });
});
