/**
 * BeatStepper — the `− 6 +` on the meter row.
 *
 * The owner's bug report, 2026-09-15: in a grouped meter the stepper had
 * started resizing the LAST GROUP, so `+` on a 6/8 gave 3+4 — "a really bad
 * experience", and not what v1.1.0 did. What it does, and what every other
 * next-meter control in the app does, is WALK THE METER LIST.
 *
 * Locks in:
 * - Grouped: `+` is the next `METER_PRESETS` entry and `−` the previous one,
 *   wrapping at both ends, so neither button is ever disabled.
 * - A grouping variant steps to the next preset's canonical grouping, which
 *   is `cycleMeterPreset`'s rule and not a second one.
 * - FREE mode is untouched: `+` adds a beat, `−` removes one, wrapping.
 * - The stepper and the `sig-next` / `sig-prev` hotkeys produce the same
 *   groups from the same state — they are one function, `stepMeter`.
 *
 * The dots, and the stepper's FREE-mode wrapping and its labels, are in
 * `GroupEditor.test.tsx`.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BeatStepper } from "./BeatStepper";
import { mockInvoke } from "../../test/mocks";
import { METER_PRESETS, MAX_FREE_BEATS, MIN_FREE_BEATS } from "../../constants/metronome";
import { stepMeter } from "../../utils/meter";

/**
 * Click one end of the stepper and return the grouping it reported.
 *
 * The buttons are named for what they do, which depends on the branch: in a
 * grouped meter they are the next and previous meter, in FREE mode they add
 * and remove a beat.
 */
function step(groups: number[], dir: 1 | -1, freeMode = false): number[] {
  const onBeatGroupsChange = vi.fn();
  const view = render(
    <BeatStepper
      beatGroups={groups}
      subdivision={1}
      freeMode={freeMode}
      onBeatGroupsChange={onBeatGroupsChange}
    />,
  );
  const label = freeMode
    ? dir === 1
      ? "Add beat"
      : "Remove beat"
    : dir === 1
      ? "Next meter"
      : "Previous meter";
  fireEvent.click(screen.getByLabelText(label));
  view.unmount();
  expect(onBeatGroupsChange).toHaveBeenCalledTimes(1);
  return onBeatGroupsChange.mock.calls[0][0] as number[];
}

describe("BeatStepper — a grouped meter walks the list", () => {
  it("steps 6/8 up to 7/8 rather than growing its last group", () => {
    // THE BUG REPORT. This used to be [3, 4].
    expect(step([3, 3], 1)).toEqual([3, 2, 2]);
  });

  it("steps 6/8 down to 5/4", () => {
    expect(step([3, 3], -1)).toEqual([3, 2]);
  });

  it("wraps at both ends, so neither button is ever disabled", () => {
    // 2/4 is the first entry and 12/8 the last. A grouped meter has nothing
    // to clamp: the list is a ring, exactly as `sig-next` has always
    // treated it.
    expect(step([2], -1)).toEqual([3, 3, 3, 3]);
    expect(step([3, 3, 3, 3], 1)).toEqual([2]);

    const view = render(<BeatStepper beatGroups={[3, 3, 3, 3]} subdivision={1} freeMode={false} />);
    expect((screen.getByLabelText("Next meter") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByLabelText("Previous meter") as HTMLButtonElement).disabled).toBe(false);
    view.unmount();

    const one = render(<BeatStepper beatGroups={[2]} subdivision={1} freeMode={false} />);
    expect((screen.getByLabelText("Previous meter") as HTMLButtonElement).disabled).toBe(false);
    one.unmount();
  });

  it("leaves a variant on the next preset's canonical grouping", () => {
    // 7/8 as 2+3+2 is a grouping of 7/8, so stepping forward goes to 8/8 and
    // not round the other 7/8 groupings — `cycleMeterPreset` already says
    // so, and the stepper inherits it rather than deciding again.
    expect(step([2, 3, 2], 1)).toEqual([3, 2, 3]);
    expect(step([2, 2, 2], 1)).toEqual([3, 2, 2]);
  });

  it("walks the whole list and comes back to where it started", () => {
    let groups = METER_PRESETS[0].groups;
    const seen: string[] = [];
    for (let i = 0; i < METER_PRESETS.length; i++) {
      seen.push(groups.join(","));
      groups = step(groups, 1);
    }
    expect(seen).toEqual(METER_PRESETS.map((p) => p.groups.join(",")));
    expect(groups).toEqual(METER_PRESETS[0].groups);
  });

  it("does no IPC of its own — the meter change is the owner's to make", () => {
    render(<BeatStepper beatGroups={[3, 3]} subdivision={1} freeMode={false} />);
    fireEvent.click(screen.getByLabelText("Next meter"));
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("does not throw when no onBeatGroupsChange is wired", () => {
    render(<BeatStepper beatGroups={[3, 3]} subdivision={1} freeMode={false} />);
    expect(() => fireEvent.click(screen.getByLabelText("Next meter"))).not.toThrow();
  });
});

describe("BeatStepper — FREE mode still counts beats", () => {
  it("adds and removes one beat", () => {
    expect(step([4], 1, true)).toEqual([5]);
    expect(step([4], -1, true)).toEqual([3]);
  });

  it(`wraps ${MAX_FREE_BEATS} → ${MIN_FREE_BEATS} and back`, () => {
    expect(step([MAX_FREE_BEATS], 1, true)).toEqual([MIN_FREE_BEATS]);
    expect(step([MIN_FREE_BEATS], -1, true)).toEqual([MAX_FREE_BEATS]);
  });

  it("stays one group — FREE mode is N equal beats, and Rust enforces it", () => {
    expect(step([4], 1, true)).toHaveLength(1);
  });
});

describe("BeatStepper — the same step as the hotkeys", () => {
  it("agrees with sig-next and sig-prev from the same state", () => {
    // `useActionDispatcher` answers `sig-next` with `stepMeter(groups,
    // freeMode, 1)` and the widget and Zen meter buttons do the same. The
    // stepper drifting away from them is the bug being fixed here, so the
    // agreement is asserted rather than assumed — over every meter the app
    // ships, both directions, and both modes.
    const everyMeter = [
      ...METER_PRESETS.map((p) => p.groups),
      [2, 3],
      [2, 2, 2],
      [2, 2, 3],
      [2, 3, 2],
      [3, 3, 2],
      [2, 3, 3],
    ];
    for (const groups of everyMeter) {
      for (const dir of [1, -1] as const) {
        expect(step(groups, dir)).toEqual(stepMeter(groups, false, dir));
      }
    }
    for (const n of [1, 4, 7, MAX_FREE_BEATS]) {
      for (const dir of [1, -1] as const) {
        expect(step([n], dir, true)).toEqual(stepMeter([n], true, dir));
      }
    }
  });
});
