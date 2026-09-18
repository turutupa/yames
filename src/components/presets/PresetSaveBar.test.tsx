/**
 * The context bar with nothing loaded (2026-09-17).
 *
 * The owner opened the Drill tab, found a whole drill set up on the stage and
 * a bar that said only "Save preset", and could not tell what the screen was
 * showing — nothing was marked in the library either. The settings in front of
 * you ARE the drill; the preset is a snapshot you chose to keep. So the bar
 * names what is on the stage, in the place and at the size a preset's name
 * would have had, and Save is what files it.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { PresetSaveBar } from "./PresetSaveBar";
import type { Preset } from "../../types";

const PRESET: Preset = {
  id: "p1",
  name: "Tuesday warm-up",
  createdAt: 0,
  bpm: 96,
  subdivision: 1,
  timeSignature: "4/4",
  beatGroups: [4],
  freeMode: false,
  soundType: "click",
  volume: 0.7,
  view: "beat",
};

function draw(overrides: Partial<React.ComponentProps<typeof PresetSaveBar>> = {}) {
  const props = {
    activePreset: null,
    view: "beat" as const,
    presetDirty: false,
    updateFeedback: false,
    onRename: vi.fn(),
    onUpdate: vi.fn(),
    onSave: vi.fn(),
    onRevert: vi.fn(),
    ...overrides,
  };
  return { ...render(<PresetSaveBar {...props} />), props };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the context bar with no preset loaded", () => {
  it("names the metronome on the stage", () => {
    draw();
    expect(screen.getByText("Unsaved metronome")).toBeInTheDocument();
  });

  it("names the drill on the stage instead, on the drill tab", () => {
    // Two different things to have in front of you, and the bar is the one
    // place on screen that says which of them you are looking at.
    draw({ view: "drill" });
    expect(screen.getByText("Unsaved drill")).toBeInTheDocument();
    expect(screen.queryByText("Unsaved metronome")).not.toBeInTheDocument();
  });

  it("keeps Save beside the name, and still saves", () => {
    const { props } = draw();
    fireEvent.click(screen.getByRole("button", { name: "Save preset" }));
    expect(props.onSave).toHaveBeenCalled();
  });

  it("is not a rename door — there is no stored name to rename", () => {
    const { props } = draw();
    fireEvent.click(screen.getByText("Unsaved metronome"));
    expect(props.onRename).not.toHaveBeenCalled();
  });

  it("gives the line back to the preset once one is loaded", () => {
    draw({ activePreset: PRESET });
    expect(screen.getByText("Tuesday warm-up")).toBeInTheDocument();
    expect(screen.queryByText("Unsaved metronome")).not.toBeInTheDocument();
  });
});
