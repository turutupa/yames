import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MainHeader } from "./MainHeader";
import { DEFAULT_TEST_STATE, mockInvoke } from "../../test/mocks";
import { readStylesheet, ruleBlock } from "../../test/readStyles";
import type { Preset } from "../../types";

const PRESET: Preset = {
  id: "p1",
  name: "Sweep picking",
  createdAt: 0,
  bpm: 120,
  subdivision: 1,
  timeSignature: 4,
  soundType: "click",
  volume: 0.7,
  view: "beat",
};

function setup(overrides: Partial<React.ComponentProps<typeof MainHeader>> = {}) {
  const props = {
    state: DEFAULT_TEST_STATE,
    view: "beat" as const,
    activePreset: null,
    presetDirty: false,
    updateFeedback: false,
    onRenamePreset: vi.fn(),
    onUpdatePreset: vi.fn(),
    onSavePreset: vi.fn(),
    onRevertPreset: vi.fn(),
    soundOpen: false,
    setSoundOpen: vi.fn(),
    soundDropdownRef: { current: null },
    shareBtnRef: { current: null },
    shareOpen: false,
    setShareOpen: vi.fn(),
    shareTooltip: false,
    volumePercent: 70,
    ttsVolume: 0.5,
    setTtsVolume: vi.fn(),
    voiceEnabled: true,
    listening: false,
    onOpenHelp: vi.fn(),
    ...overrides,
  };
  const utils = render(<MainHeader {...props} />);
  return { ...utils, props };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MainHeader — the output chips", () => {
  it("names the sound set on the chip instead of hiding it behind a glyph", () => {
    // UI_DECISIONS U1.4: labelled chips, not seven identical circles.
    setup({ state: { ...DEFAULT_TEST_STATE, soundType: "wood" } });
    expect(screen.getByRole("button", { name: "Wood" }).textContent).toContain("Wood");
  });

  it("opens the sound menu and switches the sound set from it", () => {
    const { props, rerender } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Click" }));
    expect(props.setSoundOpen).toHaveBeenCalledWith(true);

    rerender(<MainHeader {...props} soundOpen />);
    fireEvent.click(screen.getByRole("menuitem", { name: /Drum/ }));
    expect(mockInvoke).toHaveBeenCalledWith("set_sound_type", { soundType: "drum" });
    expect(props.setSoundOpen).toHaveBeenLastCalledWith(false);
  });

  it("draws the metronome level on the volume chip", () => {
    const { container, props, rerender } = setup({ volumePercent: 40 });
    const fill = () => container.querySelector(".context-chip-level-fill") as HTMLElement;
    expect(fill().style.width).toBe("40%");
    rerender(<MainHeader {...props} volumePercent={90} />);
    expect(fill().style.width).toBe("90%");
  });

  it("keeps both faders behind the volume chip, and says why the voice one is off", () => {
    // Parity: the metronome and the TTS voice are balanced in one place, and
    // the voice fader stays visible-but-disabled so the feature is findable.
    const { container } = setup({ voiceEnabled: false });
    const faders = container.querySelectorAll(".header-volume-popover .volume-fader");
    expect(faders.length).toBe(2);
    expect(container.querySelector(".volume-fader-disabled")).not.toBeNull();
    expect(
      container.querySelector('[data-tooltip="Enable Practice Coach voice in Settings"]'),
    ).not.toBeNull();
  });

  it("reports the audio input in words", () => {
    const { props, rerender } = setup();
    expect(screen.getByRole("status").textContent).toContain("Input off");
    rerender(<MainHeader {...props} listening />);
    expect(screen.getByRole("status").textContent).toContain("Listening");
  });
});

describe("MainHeader — the overflow", () => {
  it("keeps share and help behind the … until it is opened", () => {
    setup();
    expect(screen.queryByRole("menuitem", { name: "Share" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("menuitem", { name: "Share" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Help" })).toBeTruthy();
  });

  it("opens the share popover from the menu and closes the menu behind it", () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Share" }));
    expect(props.setShareOpen).toHaveBeenLastCalledWith(true);
    expect(screen.queryByRole("menuitem", { name: "Share" })).toBeNull();
  });

  it("runs help from the menu", () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Help" }));
    expect(props.onOpenHelp).toHaveBeenCalledTimes(1);
  });

  it("offers no help on the settings sheet, where the tour cannot run", () => {
    setup({ view: "settings" });
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("menuitem", { name: "Share" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Help" })).toBeNull();
  });

  it("closes on a click outside it", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menuitem", { name: "Share" })).toBeNull();
  });
});

describe("MainHeader — the preset context", () => {
  it("offers a way to make a first preset when none is loaded", () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Save preset/ }));
    expect(props.onSavePreset).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Edited")).toBeNull();
  });

  it("says the preset is edited, in a word, and offers both ways out", () => {
    const { props } = setup({ activePreset: PRESET, presetDirty: true });
    expect(screen.getByText("Sweep picking")).toBeTruthy();
    expect(screen.getByText("Edited")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    expect(props.onUpdatePreset).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Revert" }));
    expect(props.onRevertPreset).toHaveBeenCalledTimes(1);
  });

  it("has nothing to revert and nothing to save when the preset is clean", () => {
    setup({ activePreset: PRESET, presetDirty: false });
    expect(screen.queryByText("Edited")).toBeNull();
    expect(screen.queryByRole("button", { name: "Revert" })).toBeNull();
    expect((screen.getByRole("button", { name: "No changes" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("renames from the name itself", () => {
    const { props } = setup({ activePreset: PRESET });
    fireEvent.click(screen.getByText("Sweep picking"));
    expect(props.onRenamePreset).toHaveBeenCalledWith("p1");
  });

  it("shows no preset context on the settings sheet", () => {
    setup({ activePreset: PRESET, view: "settings" });
    expect(screen.queryByText("Sweep picking")).toBeNull();
  });
});

describe("MainHeader — the bar is one row", () => {
  // The regression this guards: `.preset-save-area` kept `position: absolute;
  // top: 76px` from the days when the header floated over the whole window.
  // Once the header became the first row of `.main-content` — which is the
  // positioned ancestor — those coordinates still resolved, and the preset
  // context painted 76px down the stage while the chips stayed on the bar.
  const css = readStylesheet();

  it("keeps the preset context in the flow of the row that owns it", () => {
    expect(ruleBlock(css, ".preset-save-area")).not.toContain("position: absolute");
  });

  it("closes the bar with a hairline instead of floating over the stage", () => {
    const bar = ruleBlock(css, ".main-header");
    expect(bar).toContain("position: static");
    expect(bar).toContain("border-bottom: 1px solid var(--border)");
  });

  it("sheds the duplicated readout before it sheds a label, and never a control", () => {
    // The window opens at 800px wide, which is below the ~920 that three
    // labelled chips and a named preset both need. The input chip goes first
    // because the transport reports the same state on the same screen —
    // shedding labels first would leave anonymous circles at the size the app
    // actually opens at, which is the arrangement this bar replaced. The
    // volume chip survives to 480px: the faders behind it are the only place
    // either volume is set.
    // More than one block can share a breakpoint, so this reads every block
    // at a width.
    const at = (px: number) => {
      const head = `@media (max-width: ${px}px) {`;
      const out: string[] = [];
      for (let i = css.indexOf(head); i !== -1; i = css.indexOf(head, i + 1)) {
        const next = css.indexOf("@media", i + head.length);
        out.push(css.slice(i, next === -1 ? css.length : next));
      }
      return out.join("\n");
    };
    expect(at(919)).toContain(".context-chip-input {\n    display: none;");
    expect(at(919)).not.toContain(".context-chip-label");
    expect(at(789)).toContain(".context-chip-label");
    expect(css).not.toContain(".context-chip-volume {\n    display: none;");
  });

  it("clips a shed label rather than deleting it, so it is still read aloud", () => {
    const narrow = css.slice(css.indexOf("@media (max-width: 789px) {"));
    const rule = narrow.slice(
      narrow.indexOf(".context-chip-label"),
      narrow.indexOf("}", narrow.indexOf(".context-chip-label")),
    );
    expect(rule).toContain("clip-path: inset(50%)");
    expect(rule).not.toContain("display: none");
  });
});
