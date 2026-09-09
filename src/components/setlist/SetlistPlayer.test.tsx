import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SetlistPlayer } from "./SetlistPlayer";
import type { Setlist, SetlistStep } from "../../types";

/**
 * The playing half of setlist mode.
 *
 * These assert what it says rather than how it looks, and the two decisions
 * that made it a separate screen at all: the step's NAME is the thing above
 * the number — Zen carries "step 3 → 120" there for a drill, and a setlist step
 * has a name you recognise with your hands — and there is nothing to press
 * except the way out.
 */

function step(over: Partial<SetlistStep> & { id: string; name: string }): SetlistStep {
  return {
    bpm: 96,
    subdivision: 4,
    beatGroups: [4],
    freeMode: false,
    soundType: "wood",
    volume: 0.7,
    trigger: { kind: "bars", bars: 8 },
    transition: { kind: "cut" },
    ...over,
  };
}

const CHAIN: Setlist = {
  id: "c1",
  name: "Warm-up routine",
  createdAt: 0,
  repeat: 1,
  steps: [
    step({ id: "s1", name: "Loosen up", bpm: 70, trigger: { kind: "bars", bars: 8 } }),
    step({ id: "s2", name: "Alt picking", trigger: { kind: "seconds", seconds: 120 }, transition: { kind: "countIn", bars: 2 } }),
    step({ id: "s3", name: "Odd meter", beatGroups: [3, 2, 2], trigger: { kind: "manual" } }),
  ],
};

function draw(over: Partial<Parameters<typeof SetlistPlayer>[0]> = {}) {
  return render(
    <SetlistPlayer
      setlist={CHAIN}
      step={CHAIN.steps[0]}
      stepNumber={1}
      stepCount={3}
      remaining={{ kind: "bars", bars: 6 }}
      activeBeat={0}
      activeSub={0}
      isDownbeat
      isPlaying
      countIn={{ beats: 0, done: 0 }}
      onEdit={() => {}}
      {...over}
    />,
  );
}

describe("the setlist, playing", () => {
  it("leads with the step's name and its tempo, nothing else", () => {
    const { container } = draw();
    expect(container.querySelector(".setlist-player-name")!.textContent).toBe("Loosen up");
    expect(container.querySelector(".setlist-player-bpm")!.textContent).toBe("70");
    expect(container.querySelector(".setlist-player-where")!.textContent).toContain("Step 1 of 3");
    // One button on the whole screen: the way back to the paragraph. The
    // transport is the window's and lives outside this component.
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button").textContent).toBe("Edit the setlist");
  });

  it("counts bars for a step set in bars", () => {
    const { container } = draw({ remaining: { kind: "bars", bars: 6 } });
    expect(container.querySelector(".setlist-player-left")!.textContent).toBe("bar 3 of 8");
  });

  it("counts a step set in minutes in BOTH — the time left and the bar", () => {
    // 120s at 96 BPM in 4/4 is 48 bars, and a player counting a phrase wants
    // the bar even when the step was written as a length of time.
    const { container } = draw({
      step: CHAIN.steps[1],
      stepNumber: 2,
      remaining: { kind: "seconds", seconds: 60 },
    });
    const left = container.querySelector(".setlist-player-left")!.textContent!;
    expect(left).toContain("1 min left");
    expect(left).toContain("of 48");
  });

  it("says a step nobody can time is waiting for you", () => {
    const { container } = draw({
      step: CHAIN.steps[2],
      stepNumber: 3,
      remaining: { kind: "manual" },
    });
    expect(container.querySelector(".setlist-player-left")!.textContent).toBe("waiting for you");
  });

  it("draws the routine as a bar, each step as wide as it is long", () => {
    // 8 bars at 70 in 4/4 is ~27s; step 2 is 120s. The point of the ribbon is
    // that you can SEE which step is most of your routine.
    const { container } = draw();
    const segs = [...container.querySelectorAll<HTMLElement>(".setlist-player-seg")];
    expect(segs).toHaveLength(3);
    const width = (el: HTMLElement) => parseFloat(el.style.flex.match(/([\d.]+)%/)![1]);
    expect(width(segs[1])).toBeGreaterThan(width(segs[0]) * 3);
    // The one playing is marked, and the ones behind it are done.
    expect(segs[0].dataset.state).toBe("now");
    expect(segs[1].dataset.state).toBeUndefined();
    expect([...container.querySelectorAll(".setlist-player-seg-fill")]).toHaveLength(1);
  });

  it("names what is coming, and says how only when there is something to say", () => {
    // A "cut" is the ABSENCE of a transition. Naming it is noise on a screen
    // whose argument is that nothing on it is spare.
    const plain = draw().container.querySelector(".setlist-player-next")!.textContent!;
    expect(plain).toContain("Alt picking");
    expect(plain).not.toContain("cut");

    const counted = draw({ step: CHAIN.steps[1], stepNumber: 2 }).container
      .querySelector(".setlist-player-next")!.textContent!;
    expect(counted).toContain("Odd meter");
    expect(counted).toContain("count in 2 bars");
  });

  it("draws a dot per beat, grouped the way the step is grouped", () => {
    const { container } = draw({ step: CHAIN.steps[2], stepNumber: 3 });
    expect(container.querySelectorAll(".setlist-player-group")).toHaveLength(3);
    expect(container.querySelectorAll(".setlist-player-dot")).toHaveLength(7);
    // Only the beat the engine says is live is lit, and never while stopped.
    expect(container.querySelectorAll(".setlist-player-dot[data-live]")).toHaveLength(1);
    const stopped = draw({ isPlaying: false }).container;
    expect(stopped.querySelectorAll(".setlist-player-dot[data-live]")).toHaveLength(0);
  });

  it("the big slot carries the count-in while one is running", () => {
    // During a count-in the only number that matters is how many are left;
    // the tempo is what the beats themselves are telling you.
    const { container } = draw({ countIn: { beats: 4, done: 1 } });
    expect(container.querySelector(".setlist-player-bpm")!.textContent).toBe("3");
    expect(container.querySelector(".setlist-player-bpm-label")!.textContent).toBe("starting in");
    expect(container.querySelector(".setlist-player-bpm")!.className).toContain("counting");
  });

  it("gives the slot back the moment the count-in is spent", () => {
    const { container } = draw({ countIn: { beats: 4, done: 4 } });
    expect(container.querySelector(".setlist-player-bpm")!.textContent).toBe("70");
    expect(container.querySelector(".setlist-player-bpm-label")!.textContent).toBe("BPM");
  });

  it("says the setlist is about to end rather than naming a step that is not there", () => {
    const { container } = draw({ step: CHAIN.steps[2], stepNumber: 3, remaining: { kind: "manual" } });
    expect(container.querySelector(".setlist-player-next")!.textContent).toBe("Last step");
  });
});
