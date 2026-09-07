/**
 * MeterPresets — FREE chip / meter-preset interaction tests (PR #11, F8).
 *
 * The meter became a chip that opens a picker (U2.3), so these open it first.
 * What each one asserts is unchanged: the IPC contract with Rust is the point,
 * not where the button sits.
 *
 * Locks in:
 * - The FREE chip turns free mode on. Collapsing `beatGroups` to `[total]` is
 *   the Rust `set_free_mode` invariant (see `commands.rs::collapse_to_free`),
 *   so the chip does not make a second `set_beat_groups` round-trip.
 * - Picking a grouped meter preset clears free mode BEFORE applying the
 *   groups, so the two never disagree.
 * - The active-chip highlight is exclusive: FREE is active in free mode and
 *   no meter preset is, even when `beatGroups` still matches one.
 * - The row does NOT call `notifySettingsChange()` itself: useSession
 *   watches the meter and fires ONE debounced coach boundary for a burst
 *   of clicks. Calling it per click closed the practice segment early and
 *   in addition to the debounce.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MeterPresets } from "./MeterPresets";
import { mockInvoke } from "../../test/mocks";

function invokedCommands(): string[] {
  return mockInvoke.mock.calls.map((c) => c[0] as string);
}

/**
 * Render and open the picker.
 *
 * The meter is a chip that opens a list (UI_DECISIONS U2.3), so the presets
 * are behind one click now. Every assertion below is about what happens when
 * one is chosen, which is unchanged — only the reaching for it moved.
 */
function openPicker(props: { beatGroups: number[]; freeMode: boolean }) {
  const view = render(<MeterPresets {...props} />);
  fireEvent.click(view.container.querySelector(".meter-chip") as HTMLButtonElement);
  return view;
}

describe("MeterPresets — FREE chip", () => {
  it("turns free mode on", async () => {
    openPicker({ beatGroups: [3, 2, 2], freeMode: false });
    fireEvent.click(screen.getByText("FREE"));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("set_free_mode", {
        enabled: true,
      }),
    );
  });

  it("leaves the coach boundary to useSession's debounce", async () => {
    openPicker({ beatGroups: [3, 2, 2], freeMode: false });
    fireEvent.click(screen.getByText("FREE"));
    await waitFor(() =>
      expect(invokedCommands()).toContain("set_free_mode"),
    );
    expect(invokedCommands()).not.toContain("notify_settings_change");
  });

  it("leaves the collapse to Rust — no second set_beat_groups call", async () => {
    openPicker({ beatGroups: [3, 2, 2], freeMode: false });
    fireEvent.click(screen.getByText("FREE"));
    await waitFor(() =>
      expect(invokedCommands()).toContain("set_free_mode"),
    );
    expect(invokedCommands()).not.toContain("set_beat_groups");
  });

  // The chip repeats the active label, so these look inside the picker: with
  // 4/4 selected, "4/4" is both the chip's text and a button in the list.
  const pickerBtn = (container: HTMLElement, label: string) =>
    [...container.querySelectorAll(".time-sig-btn")].find(
      (b) => b.textContent?.trim() === label,
    ) as HTMLElement;

  it("marks the FREE chip active and no meter preset in free mode", () => {
    // [4] still matches the 4/4 preset — free mode must win anyway.
    const { container } = openPicker({ beatGroups: [4], freeMode: true });
    expect(pickerBtn(container, "FREE").className).toContain("active");
    expect(pickerBtn(container, "4/4").className).not.toContain("active");
  });

  it("marks the matching meter preset active when free mode is off", () => {
    const { container } = openPicker({ beatGroups: [4], freeMode: false });
    expect(pickerBtn(container, "4/4").className).toContain("active");
    expect(pickerBtn(container, "FREE").className).not.toContain("active");
  });

  it("switches grouping in one click, without opening the picker", () => {
    // 2+2+3 and 3+2+2 are the same meter and a different bar. Reaching one
    // from the other used to cost three clicks through the picker.
    const { container } = render(<MeterPresets beatGroups={[3, 2, 2]} freeMode={false} />);
    const chips = [...container.querySelectorAll(".meter-grouping-chip")] as HTMLButtonElement[];
    fireEvent.click(chips[1]);
    expect(mockInvoke).toHaveBeenCalledWith("set_beat_groups", { groups: [2, 2, 3] });
    expect(container.querySelector(".meter-picker")).toBeNull();
  });

  it("shows a lone grouping as the active badge, not as a button", () => {
    // 9/8 is only ever 3+3+3. It reads as the same kind of thing as a meter
    // that has alternatives — one active badge — but there is nothing to
    // press, so it is not a button.
    const { container } = render(<MeterPresets beatGroups={[3, 3, 3]} freeMode={false} />);
    const chips = [...container.querySelectorAll(".meter-grouping-chip")];
    expect(chips).toHaveLength(1);
    expect(chips[0].tagName).toBe("SPAN");
    expect(chips[0].className).toContain("active");
    expect(chips[0].textContent).toBe("3 + 3 + 3");
  });

  it("shows every alternative as a button, with one active", () => {
    const { container } = render(<MeterPresets beatGroups={[3, 2, 2]} freeMode={false} />);
    const chips = [...container.querySelectorAll(".meter-grouping-chip")];
    expect(chips).toHaveLength(3);
    expect(chips.every((c) => c.tagName === "BUTTON")).toBe(true);
    expect(chips.filter((c) => c.className.includes("active"))).toHaveLength(1);
  });

  it("says on the chip what the meter is, without opening anything", () => {
    const { container, unmount } = render(<MeterPresets beatGroups={[3, 2, 2]} freeMode={false} />);
    expect(container.querySelector(".meter-chip")?.textContent).toContain("7/8");
    // The grouping is the part that changes without the meter changing, so
    // where a meter has alternatives they sit on the row as buttons — one
    // click, not three through the picker. 7/8 has three.
    const chips = [...container.querySelectorAll(".meter-grouping-chip")];
    expect(chips.map((c) => c.textContent)).toEqual(["3 + 2 + 2", "2 + 2 + 3", "2 + 3 + 2"]);
    expect(chips.filter((c) => c.className.includes("active")).map((c) => c.textContent)).toEqual([
      "3 + 2 + 2",
    ]);
    expect(container.querySelector(".meter-picker")).toBeNull();
    unmount();

    const free = render(<MeterPresets beatGroups={[9]} freeMode />);
    expect(free.container.querySelector(".meter-chip")?.textContent).toContain("FREE");
  });
});

describe("MeterPresets — meter presets", () => {
  it("clears free mode when a grouped preset is selected", async () => {
    openPicker({ beatGroups: [9], freeMode: true });
    fireEvent.click(screen.getByText("7/8"));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("set_free_mode", {
        enabled: false,
      }),
    );
    expect(mockInvoke).toHaveBeenCalledWith("set_beat_groups", {
      groups: [3, 2, 2],
    });
  });

  it("clears free mode before applying the groups", async () => {
    openPicker({ beatGroups: [9], freeMode: true });
    fireEvent.click(screen.getByText("7/8"));
    await waitFor(() =>
      expect(invokedCommands()).toContain("set_beat_groups"),
    );
    const cmds = invokedCommands();
    expect(cmds.indexOf("set_free_mode")).toBeLessThan(
      cmds.indexOf("set_beat_groups"),
    );
  });

  it("does not call set_free_mode when it was already off", async () => {
    openPicker({ beatGroups: [4], freeMode: false });
    fireEvent.click(screen.getByText("3/4"));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("set_beat_groups", {
        groups: [3],
      }),
    );
    expect(invokedCommands()).not.toContain("set_free_mode");
  });

  it("hides the grouping-variant row in free mode", () => {
    // [3, 2] is a 5/4 variant, so the row would render if free mode did not
    // suppress it.
    const { container } = openPicker({ beatGroups: [3, 2], freeMode: true });
    expect(container.querySelector(".meter-variant-row")).toBeNull();
  });

  it("shows the grouping-variant row for a grouped meter", () => {
    const { container } = openPicker({ beatGroups: [3, 2], freeMode: false });
    expect(container.querySelector(".meter-variant-row")).not.toBeNull();
  });
});
