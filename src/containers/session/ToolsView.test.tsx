/** Tools: each card opens its tool, wears the key it is bound to, and says only what is true. */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { platformKey } from "../../hotkeys";
import { ToolsView } from "./ToolsView";

afterEach(cleanup);

const IDS = ["beat", "setlist", "drill", "jam", "songs"] as const;

describe("ToolsView", () => {
  it("opens each tool by its own id", () => {
    const onOpen = vi.fn();
    render(<ToolsView onOpen={onOpen} />);
    for (const id of IDS) fireEvent.click(screen.getByTestId(`tool-card-${id}`));
    expect(onOpen.mock.calls.map((c) => c[0])).toEqual([...IDS]);
  });

  it("reads its keycaps from the bindings, so a remapped key shows", () => {
    const keyBindings = {
      "tab-1": "⌘5",
      "tab-2": "⌘6",
      "tab-3": "⌘7",
      "tab-4": "⌘8",
      "tab-5": "⌘9",
    };
    render(<ToolsView onOpen={vi.fn()} keyBindings={keyBindings} />);
    IDS.forEach((id, i) => {
      expect(screen.getByTestId(`tool-key-${id}`).textContent).toBe(platformKey(`⌘${i + 5}`));
    });
  });

  it("shows no keycap for an unbound tool, and none without bindings", () => {
    const { rerender } = render(<ToolsView onOpen={vi.fn()} keyBindings={{ "tab-1": "⌘1" }} />);
    expect(screen.queryByTestId("tool-key-beat")).not.toBeNull();
    expect(screen.queryByTestId("tool-key-setlist")).toBeNull();
    rerender(<ToolsView onOpen={vi.fn()} />);
    expect(screen.queryByTestId("tool-key-beat")).toBeNull();
  });

  it("with no state, says nothing under any card", () => {
    render(<ToolsView onOpen={vi.fn()} />);
    for (const id of IDS) expect(screen.queryByTestId(`tool-last-${id}`)).toBeNull();
  });

  it("labels each line by what it is: TEMPO, RAMP, and LAST only for what was loaded last", () => {
    render(
      <ToolsView
        onOpen={vi.fn()}
        info={{
          bpm: 96,
          groups: [3, 3],
          ramp: { startBpm: 60, targetBpm: 120 },
          setlist: { name: "Morning warm-up", steps: 6 },
          jam: "Blues in A",
          song: "Wish You Were Here",
        }}
      />,
    );
    expect(screen.getByTestId("tool-last-beat").textContent).toBe("Tempo96 BPM · 6/8");
    expect(screen.getByTestId("tool-last-drill").textContent).toBe("Ramp60 → 120 BPM");
    expect(screen.getByTestId("tool-last-setlist").textContent).toBe("LastMorning warm-up · 6 steps");
    expect(screen.getByTestId("tool-last-jam").textContent).toBe("LastBlues in A");
    expect(screen.getByTestId("tool-last-songs").textContent).toBe("LastWish You Were Here");
  });

  it("names no meter in free mode", () => {
    render(<ToolsView onOpen={vi.fn()} info={{ bpm: 120, groups: [4], freeMode: true }} />);
    expect(screen.getByTestId("tool-last-beat").textContent).toBe("Tempo120 BPM");
  });
});
