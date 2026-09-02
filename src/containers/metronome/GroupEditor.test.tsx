/**
 * GroupEditor — FREE-mode stepper and formula-bar tests (PR #11, F4/F7/F8/F9).
 *
 * Locks in:
 * - The component is presentational: the stepper reports through the
 *   `onBeatCountChange` prop and never touches IPC itself.
 * - The stepper wraps at both ends (MAX → MIN and MIN → MAX) rather than
 *   clamping, which is why the chevrons never disable.
 * - Beat counts render through i18n with real plural forms, so 1 reads
 *   "1 beat" and not "1 beats".
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GroupEditor } from "./GroupEditor";
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

  it("reports the next count through onBeatCountChange", () => {
    const onBeatCountChange = vi.fn();
    render(
      <GroupEditor
        beatGroups={[4]}
        subdivision={1}
        freeMode
        onBeatCountChange={onBeatCountChange}
      />,
    );
    fireEvent.click(stepper("Add beat"));
    expect(onBeatCountChange).toHaveBeenCalledWith(5);
    fireEvent.click(stepper("Remove beat"));
    expect(onBeatCountChange).toHaveBeenCalledWith(3);
  });

  it(`wraps ${MAX_FREE_BEATS} → ${MIN_FREE_BEATS} on the up stepper`, () => {
    const onBeatCountChange = vi.fn();
    render(
      <GroupEditor
        beatGroups={[MAX_FREE_BEATS]}
        subdivision={1}
        freeMode
        onBeatCountChange={onBeatCountChange}
      />,
    );
    fireEvent.click(stepper("Add beat"));
    expect(onBeatCountChange).toHaveBeenCalledWith(MIN_FREE_BEATS);
  });

  it(`wraps ${MIN_FREE_BEATS} → ${MAX_FREE_BEATS} on the down stepper`, () => {
    const onBeatCountChange = vi.fn();
    render(
      <GroupEditor
        beatGroups={[MIN_FREE_BEATS]}
        subdivision={1}
        freeMode
        onBeatCountChange={onBeatCountChange}
      />,
    );
    fireEvent.click(stepper("Remove beat"));
    expect(onBeatCountChange).toHaveBeenCalledWith(MAX_FREE_BEATS);
  });

  it("never disables the chevrons — they wrap instead of clamping", () => {
    render(
      <GroupEditor beatGroups={[MAX_FREE_BEATS]} subdivision={1} freeMode />,
    );
    expect(stepper("Add beat").disabled).toBe(false);
    expect(stepper("Remove beat").disabled).toBe(false);
  });

  it("does no IPC of its own — the stepper is a prop callback", () => {
    render(
      <GroupEditor
        beatGroups={[4]}
        subdivision={1}
        freeMode
        onBeatCountChange={vi.fn()}
      />,
    );
    fireEvent.click(stepper("Add beat"));
    fireEvent.click(stepper("Remove beat"));
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("does not throw when no onBeatCountChange is wired", () => {
    render(<GroupEditor beatGroups={[4]} subdivision={1} freeMode />);
    expect(() => fireEvent.click(stepper("Add beat"))).not.toThrow();
  });

  it("renders the beat count and clicks/bar through i18n", () => {
    const { container } = render(
      <GroupEditor beatGroups={[7]} subdivision={2} freeMode />,
    );
    expect(container.querySelector(".group-formula-total")?.textContent).toBe(
      "7 beats",
    );
    expect(container.querySelector(".group-formula-clicks")?.textContent).toBe(
      "14 clicks/bar",
    );
  });

  it("uses the singular plural form for a one-beat bar", () => {
    const { container } = render(
      <GroupEditor beatGroups={[1]} subdivision={1} freeMode />,
    );
    expect(container.querySelector(".group-formula-total")?.textContent).toBe(
      "1 beat",
    );
  });
});

describe("GroupEditor — grouped mode", () => {
  it("renders one box per group with an i18n beat count label", () => {
    const { container } = render(
      <GroupEditor beatGroups={[3, 2, 2]} subdivision={1} />,
    );
    expect(container.querySelectorAll(".group-box")).toHaveLength(3);
    const labels = [...container.querySelectorAll(".group-label")].map(
      (el) => el.textContent,
    );
    expect(labels).toEqual(["3 beats", "2 beats", "2 beats"]);
  });

  it("uses the singular form for a one-beat group", () => {
    const { container } = render(
      <GroupEditor beatGroups={[1, 3]} subdivision={1} />,
    );
    const labels = [...container.querySelectorAll(".group-label")].map(
      (el) => el.textContent,
    );
    expect(labels).toEqual(["1 beat", "3 beats"]);
  });

  it("renders the formula bar totals through i18n", () => {
    const { container } = render(
      <GroupEditor beatGroups={[3, 2, 2]} subdivision={3} />,
    );
    expect(container.querySelector(".group-formula-total")?.textContent).toBe(
      "7 beats",
    );
    expect(container.querySelector(".group-formula-expr")?.textContent).toBe(
      "3 + 2 + 2",
    );
    expect(container.querySelector(".group-formula-clicks")?.textContent).toBe(
      "21 clicks/bar",
    );
  });

  it("shows no free-mode stepper in grouped mode", () => {
    render(<GroupEditor beatGroups={[4]} subdivision={1} />);
    expect(screen.queryByLabelText("Add beat")).toBeNull();
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

  it("draws no accent markers in FREE mode", () => {
    const { container } = render(
      <GroupEditor beatGroups={[7]} subdivision={1} freeMode />,
    );
    for (const d of dots(container)) expect(d.className).not.toContain("accent");
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
