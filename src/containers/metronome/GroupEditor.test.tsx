/**
 * GroupEditor — the beat stepper and the dots (PR #11, F4/F7/F8/F9; UI
 * revamp gaps M4/M5).
 *
 * Locks in:
 * - The component is presentational: the stepper reports through the
 *   `onBeatGroupsChange` prop and never touches IPC itself.
 * - In FREE mode the stepper wraps at both ends (MAX → MIN and MIN → MAX)
 *   rather than clamping, which is why its buttons never disable.
 * - In a grouped meter it resizes the LAST group and clamps, so a grouping
 *   the player built is never silently thrown away.
 * - Beat counts render through i18n with real plural forms, so 1 reads
 *   "1 beat" and not "1 beats".
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GroupEditor } from "./GroupEditor";
import { BeatStepper } from "./BeatStepper";
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
        subdivision={1}
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
        subdivision={1}
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
        subdivision={1}
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
        subdivision={1}
        freeMode
        onBeatGroupsChange={onBeatGroupsChange}
      />,
    );
    fireEvent.click(stepper("Remove beat"));
    expect(onBeatGroupsChange).toHaveBeenCalledWith([MAX_FREE_BEATS]);
  });

  it("never disables the chevrons — they wrap instead of clamping", () => {
    render(
      <BeatStepper beatGroups={[MAX_FREE_BEATS]} subdivision={1} freeMode />,
    );
    expect(stepper("Add beat").disabled).toBe(false);
    expect(stepper("Remove beat").disabled).toBe(false);
  });

  it("does no IPC of its own — the stepper is a prop callback", () => {
    render(
      <BeatStepper
        beatGroups={[4]}
        subdivision={1}
        freeMode
        onBeatGroupsChange={vi.fn()}
      />,
    );
    fireEvent.click(stepper("Add beat"));
    fireEvent.click(stepper("Remove beat"));
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("does not throw when no onBeatGroupsChange is wired", () => {
    render(<BeatStepper beatGroups={[4]} subdivision={1} freeMode />);
    expect(() => fireEvent.click(stepper("Add beat"))).not.toThrow();
  });

  it("shows the bar's length on the stepper, and clicks/bar beside it", () => {
    const { container } = render(
      <BeatStepper beatGroups={[7]} subdivision={2} freeMode />,
    );
    expect(container.querySelector(".beat-stepper-value")?.textContent).toBe("7");
    expect(container.querySelector(".beat-clicks")?.textContent).toBe(
      "14 clicks/bar",
    );
  });

  it("names the stepper for a screen reader, with the plural form", () => {
    // The visible label is a bare digit (the design's `− 6 +`), so the count
    // in words has to reach assistive tech some other way.
    render(<BeatStepper beatGroups={[1]} subdivision={1} freeMode />);
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

  it("shows the total on the stepper and clicks/bar beside it", () => {
    // The `3 + 2 + 2` formula is not repeated here: it is stated next to the
    // meter chip, which is where the grouping is chosen (see MeterPresets).
    const { container } = render(
      <BeatStepper beatGroups={[3, 2, 2]} subdivision={3} />,
    );
    expect(container.querySelector(".beat-stepper-value")?.textContent).toBe("7");
    expect(container.querySelector(".beat-clicks")?.textContent).toBe(
      "21 clicks/bar",
    );
  });

  it("resizes the last group rather than flattening the bar", () => {
    const onBeatGroupsChange = vi.fn();
    render(
      <BeatStepper
        beatGroups={[3, 3]}
        subdivision={1}
        onBeatGroupsChange={onBeatGroupsChange}
      />,
    );
    fireEvent.click(stepper("Add beat"));
    expect(onBeatGroupsChange).toHaveBeenCalledWith([3, 4]);
    fireEvent.click(stepper("Remove beat"));
    expect(onBeatGroupsChange).toHaveBeenCalledWith([3, 2]);
  });

  it("drops a group of one rather than leaving a bar with a zero in it", () => {
    const onBeatGroupsChange = vi.fn();
    render(
      <BeatStepper
        beatGroups={[3, 1]}
        subdivision={1}
        onBeatGroupsChange={onBeatGroupsChange}
      />,
    );
    fireEvent.click(stepper("Remove beat"));
    expect(onBeatGroupsChange).toHaveBeenCalledWith([3]);
  });

  it("clamps instead of wrapping, and says so by disabling the button", () => {
    // Wrapping a full bar round to one beat would discard the grouping
    // without telling anyone. FREE mode has nothing to discard, so it wraps.
    const full = render(<BeatStepper beatGroups={[4, 4, 4, 4]} subdivision={1} />);
    expect((full.getByLabelText("Add beat") as HTMLButtonElement).disabled).toBe(true);
    expect((full.getByLabelText("Remove beat") as HTMLButtonElement).disabled).toBe(false);
    full.unmount();

    const single = render(<BeatStepper beatGroups={[1]} subdivision={1} />);
    expect((single.getByLabelText("Remove beat") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("GroupEditor — accents", () => {
  it("marks group starts as accents while stopped", () => {
    const { container } = render(
      <GroupEditor beatGroups={[3, 2, 2]} subdivision={1} />,
    );
    const accented = dots(container)
      .map((d, i) => (d.className.includes("accent") ? i : -1))
      .filter((i) => i >= 0);
    expect(accented).toEqual([0, 3, 5]);
  });

  it("draws exactly one accent marker in FREE mode — the first beat", () => {
    const { container } = render(
      <GroupEditor beatGroups={[7]} subdivision={1} freeMode />,
    );
    const marked = dots(container)
      .map((d, i) => (d.className.includes("accent") ? i : -1))
      .filter((i) => i >= 0);
    expect(marked).toEqual([0]);
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
        isAccentBeat
      />,
    );
    expect(dots(container)[1].className).toContain("accent");

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
        isAccentBeat={false}
      />,
    );
    expect(dots(c2)[3].className).not.toContain("accent");
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
