/**
 * MeterPresets — FREE chip / meter-preset interaction tests (PR #11, F8).
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

describe("MeterPresets — FREE chip", () => {
  it("turns free mode on", async () => {
    render(<MeterPresets beatGroups={[3, 2, 2]} freeMode={false} />);
    fireEvent.click(screen.getByText("FREE"));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("set_free_mode", {
        enabled: true,
      }),
    );
  });

  it("leaves the coach boundary to useSession's debounce", async () => {
    render(<MeterPresets beatGroups={[3, 2, 2]} freeMode={false} />);
    fireEvent.click(screen.getByText("FREE"));
    await waitFor(() =>
      expect(invokedCommands()).toContain("set_free_mode"),
    );
    expect(invokedCommands()).not.toContain("notify_settings_change");
  });

  it("leaves the collapse to Rust — no second set_beat_groups call", async () => {
    render(<MeterPresets beatGroups={[3, 2, 2]} freeMode={false} />);
    fireEvent.click(screen.getByText("FREE"));
    await waitFor(() =>
      expect(invokedCommands()).toContain("set_free_mode"),
    );
    expect(invokedCommands()).not.toContain("set_beat_groups");
  });

  it("marks the FREE chip active and no meter preset in free mode", () => {
    // [4] still matches the 4/4 preset — free mode must win anyway.
    render(<MeterPresets beatGroups={[4]} freeMode />);
    expect(screen.getByText("FREE").className).toContain("active");
    expect(screen.getByText("4/4").className).not.toContain("active");
  });

  it("marks the matching meter preset active when free mode is off", () => {
    render(<MeterPresets beatGroups={[4]} freeMode={false} />);
    expect(screen.getByText("4/4").className).toContain("active");
    expect(screen.getByText("FREE").className).not.toContain("active");
  });
});

describe("MeterPresets — meter presets", () => {
  it("clears free mode when a grouped preset is selected", async () => {
    render(<MeterPresets beatGroups={[9]} freeMode />);
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
    render(<MeterPresets beatGroups={[9]} freeMode />);
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
    render(<MeterPresets beatGroups={[4]} freeMode={false} />);
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
    const { container } = render(<MeterPresets beatGroups={[3, 2]} freeMode />);
    expect(container.querySelector(".meter-variant-row")).toBeNull();
  });

  it("shows the grouping-variant row for a grouped meter", () => {
    const { container } = render(
      <MeterPresets beatGroups={[3, 2]} freeMode={false} />,
    );
    expect(container.querySelector(".meter-variant-row")).not.toBeNull();
  });
});
