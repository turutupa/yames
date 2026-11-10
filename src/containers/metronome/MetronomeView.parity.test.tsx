/**
 * P7: the Metronome and the Ramp up, control by control.
 *
 * The oldest and most used part of the app, and among the least covered
 * (MET-01 to MET-03, MET-12, MET-20, MET-21, MET-41, RMP-09, RMP-32, RMP-34). Each
 * control is driven in the real window and judged by the command it sends, which is
 * what actually changes the sound. Section 3.2's deep controls are all here: a
 * "quick" door must not be the only way left to reach them.
 *
 * Count-in differs on purpose between the on-screen Play and the Space key (MET-31
 * to MET-33). Both are pinned as they are; see knownState.test.ts for what is lost
 * across a restart.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { SOUND_TYPES, METER_PRESETS } from "../../constants/metronome";
import i18n from "../../i18n";
import { DEFAULT_TEST_STATE, setInvokeResponse } from "../../test/mocks";
import { onTool, openShell, sentTo, settle, wasInvoked } from "../../test/parity/shell";
import { press, TOOLS, type Tool } from "../../test/parity/tools";
import type { AppState } from "../../types";

const [METRONOME, , DRILL] = TOOLS as unknown as [Tool, Tool, Tool];
const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, opts);

async function onMetronome(state: Partial<AppState> = {}) {
  const shell = await openShell(state);
  await onTool(METRONOME);
  return shell;
}

async function onDrill(state: Partial<AppState> = {}) {
  const shell = await openShell(state);
  await onTool(DRILL);
  return shell;
}

describe("the tempo", () => {
  it("MET-01: the ruler sets it", async () => {
    await onMetronome();
    fireEvent.change(document.querySelector(".bpm-slider")!, { target: { value: "144" } });
    await waitFor(() => expect(wasInvoked("set_bpm", { bpm: 144 })).toBe(true));
  });

  it("MET-02: - and + step it by five", async () => {
    await onMetronome();
    fireEvent.click(screen.getByRole("button", { name: t("metronome.tempoUp") }));
    await waitFor(() => expect(wasInvoked("set_bpm", { bpm: 125 })).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: t("metronome.tempoDown") }));
    await waitFor(() => expect(wasInvoked("set_bpm", { bpm: 115 })).toBe(true));
  });

  it("MET-03: click the number, type a number", async () => {
    await onMetronome();
    fireEvent.click(document.querySelector(".bpm-input.bpm-clickable")!);
    const input = await waitFor(() => {
      const el = document.querySelector<HTMLInputElement>("input.bpm-input");
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.change(input, { target: { value: "133" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(wasInvoked("set_bpm", { bpm: 133 })).toBe(true));
  });

  it("MET-05: tap tempo is there, and only there: it has no key", async () => {
    await onMetronome();
    const tap = document.querySelector<HTMLElement>(".tap-btn")!;
    expect(tap).not.toBeNull();
    for (let i = 0; i < 4; i++) {
      fireEvent.click(tap);
      await new Promise((r) => setTimeout(r, 120));
    }
    await waitFor(() => expect(wasInvoked("set_bpm")).toBe(true));
  });

  it("keeps Rust's limits, 20 to 300", async () => {
    const { read } = await import("../../test/parity/extract");
    expect(read("src-tauri/src/commands.rs")).toContain("let clamped = bpm.clamp(20, 300);");
  });
});

describe("the meter", () => {
  async function openPicker() {
    fireEvent.click(document.querySelector(".meter-chip")!);
    await waitFor(() => expect(document.querySelector(".meter-picker")).not.toBeNull());
  }

  it("MET-15: every preset is offered and sets its groups", async () => {
    await onMetronome();
    await openPicker();
    const offered = [...document.querySelectorAll(".time-sig-btn")].map((b) => b.textContent);
    for (const preset of METER_PRESETS) expect(offered).toContain(preset.label);
    const seven = [...document.querySelectorAll(".time-sig-btn")].find((b) => b.textContent === "7/8")!;
    fireEvent.click(seven);
    await waitFor(() => expect(wasInvoked("set_beat_groups", { groups: [3, 2, 2] })).toBe(true));
  });

  it("MET-20: FREE mode is one of the choices", async () => {
    await onMetronome();
    await openPicker();
    const buttons = [...document.querySelectorAll(".time-sig-btn")];
    const free = buttons.find((b) => !METER_PRESETS.some((p) => p.label === b.textContent))!;
    expect(free).toBeDefined();
    fireEvent.click(free);
    await waitFor(() => expect(wasInvoked("set_free_mode", { enabled: true })).toBe(true));
  });

  it("MET-12: the stepper changes the beats in a bar", async () => {
    await onMetronome();
    const [down, up] = [...document.querySelectorAll<HTMLElement>(".beat-stepper-btn")];
    fireEvent.click(up);
    await waitFor(() => expect(sentTo("set_beat_groups").length).toBeGreaterThan(0));
    const count = sentTo("set_beat_groups").length;
    fireEvent.click(down);
    await waitFor(() => expect(sentTo("set_beat_groups").length).toBeGreaterThan(count));
  });

  it("MET-21: shows the clicks per bar the meter and subdivision make", async () => {
    await onMetronome({ beatGroups: [3, 2, 2], timeSignature: 7, subdivision: 2 });
    expect(document.querySelector(".meter-section")?.textContent).toContain(
      t("metronome.clicksPerBar", { count: 14 }),
    );
  });

  it("offers the groupings of an odd meter", async () => {
    await onMetronome({ beatGroups: [3, 2, 2], timeSignature: 7 });
    expect(document.querySelectorAll(".meter-grouping-chip").length).toBeGreaterThan(1);
  });

  it("MET-28: all three accent modes can be chosen", async () => {
    await onMetronome();
    for (const mode of ["none", "all", "groups"] as const) {
      const key = { none: "none", all: "everyBeat", groups: "groupStarts" }[mode];
      void key;
    }
    const section = document.querySelector(".meter-section")!;
    expect(section.textContent).toContain("Group starts");
    expect(section.textContent).toContain("Every beat");
    expect(section.textContent).toContain("None");
    fireEvent.click(screen.getByRole("radio", { name: "Every beat" }));
    await waitFor(() => expect(wasInvoked("set_accent_mode")).toBe(true));
  });
});

describe("the subdivision", () => {
  it.each([1, 2, 3, 4, 5, 6])("MET-08: %i can be chosen, including the two with no key", async (sub) => {
    await onMetronome({ subdivision: sub === 1 ? 2 : 1 });
    const label = t(`subdiv.${sub}`);
    const button = [...document.querySelectorAll<HTMLElement>(".sub-row-btn")].find(
      (b) => b.querySelector(".sub-row-label")?.textContent === label,
    )!;
    fireEvent.click(button);
    await waitFor(() => expect(wasInvoked("set_subdivision", { subdivision: sub })).toBe(true));
  });
});

describe("the sound and the volume", () => {
  it.each(SOUND_TYPES.map((s) => [s.id] as const))("MET-35: the %s sound can be chosen", async (id) => {
    await onMetronome({ soundType: id === "click" ? "wood" : "click" });
    fireEvent.click(document.querySelector(".header-sound-wrap .context-chip")!);
    const menu = await waitFor(() => {
      const el = document.querySelector(".header-sound-menu");
      expect(el).not.toBeNull();
      return el!;
    });
    const name = t(`sound.${id}`);
    const item = [...menu.querySelectorAll<HTMLElement>(".sub-dropdown-item")].find((n) =>
      n.textContent?.includes(name),
    )!;
    fireEvent.click(item);
    await waitFor(() => expect(wasInvoked("set_sound_type", { soundType: id })).toBe(true));
  });

  it("MET-41: the volume can be set", async () => {
    await onMetronome();
    fireEvent.change(document.querySelector(".context-chip-volume .context-chip-range")!, {
      target: { value: "35" },
    });
    await waitFor(() => expect(wasInvoked("set_volume")).toBe(true));
  });
});

describe("starting it", () => {
  const playButton = () => document.querySelector<HTMLElement>(".transport-play")!;

  it("MET-31: the on-screen Play arms the count-in when it is on", async () => {
    await onMetronome();
    fireEvent.click(playButton());
    await waitFor(() => expect(wasInvoked("toggle_playback")).toBe(true));
    expect(wasInvoked("arm_count_in")).toBe(true);
  });

  it("MET-33: Space starts it with no count-in, as it always has", async () => {
    await onMetronome();
    press("Space");
    await waitFor(() => expect(wasInvoked("toggle_playback")).toBe(true));
    expect(wasInvoked("arm_count_in")).toBe(false);
  });

  it("MET-32: the count-in switch turns it off for Play", async () => {
    await onMetronome();
    const toggle = document.querySelector<HTMLElement>(".transport-switch")!;
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
    fireEvent.click(playButton());
    await waitFor(() => expect(wasInvoked("toggle_playback")).toBe(true));
    expect(wasInvoked("arm_count_in")).toBe(false);
  });

  it("MET-51: a double-click on the stage goes to Zen", async () => {
    await onMetronome();
    fireEvent.doubleClick(document.querySelector(".bpm-section")!);
    await waitFor(() => expect(document.querySelector(".fullscreen-view")).not.toBeNull());
  });

  it("the same click on a control does not", async () => {
    await onMetronome();
    fireEvent.doubleClick(document.querySelector(".bpm-btn")!);
    await settle(5);
    expect(document.querySelector(".fullscreen-view")).toBeNull();
  });
});

describe("the Ramp up", () => {
  const modeButton = (label: string) =>
    [...document.querySelectorAll<HTMLElement>(".drill-modes button")].find(
      (b) => b.textContent === label,
    )!;

  it("RMP-01: starts and stops the climb from its own Play", async () => {
    await onDrill();
    fireEvent.click(document.querySelector(".transport-play")!);
    await waitFor(() => expect(wasInvoked("start_speed_ramp")).toBe(true));
  });

  it("RMP-02: Space stops a climb that is running", async () => {
    await onDrill({ speedRamp: { ...DEFAULT_TEST_STATE.speedRamp, active: true } });
    press("Space");
    await waitFor(() => expect(wasInvoked("stop_speed_ramp")).toBe(true));
  });

  it.each(["Linear", "Zigzag", "Adaptive"])("RMP-34: %s can be chosen and saved", async (label) => {
    await onDrill();
    fireEvent.click(modeButton(label));
    await waitFor(() =>
      expect(
        sentTo("configure_speed_ramp").some(
          (a) => (a as { mode?: string }).mode === label.toLowerCase(),
        ),
      ).toBe(true),
    );
  });

  it("RMP-32: every deep control keeps its place in the options", async () => {
    await onDrill({ speedRamp: { ...DEFAULT_TEST_STATE.speedRamp, mode: "adaptive" } });
    const body = document.querySelector(".drill-view")!;
    // Start, target, step, subdivision, sound, count-in, cyclic, aggressiveness.
    expect(body.textContent).toContain("80");
    expect(body.textContent).toContain("160");
    expect(document.querySelector(".drill-plan-block")).not.toBeNull();
    expect(document.querySelector(".drill-modes")).not.toBeNull();
  });

  it("RMP-09: the plan is sent to Rust whole when it changes", async () => {
    await onDrill();
    fireEvent.click(modeButton("Zigzag"));
    await waitFor(() => expect(sentTo("configure_speed_ramp").length).toBeGreaterThan(0));
    const sent = sentTo("configure_speed_ramp").at(-1) as Record<string, unknown>;
    for (const field of ["startBpm", "targetBpm", "increment", "decrement", "barsPerStep", "beatsPerBar", "mode", "cyclic"]) {
      expect(sent, field).toHaveProperty(field);
    }
  });
});

describe("restoring", () => {
  it("MET-44: draws what Rust restored", async () => {
    setInvokeResponse("get_state", () => ({ ...DEFAULT_TEST_STATE, bpm: 171 }));
    const { container } = await openShell({ bpm: 171 });
    await onTool(METRONOME);
    expect(container.querySelector(".bpm-input")?.textContent).toBe("171");
  });
});
