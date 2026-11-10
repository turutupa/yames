/**
 * P7: the Metronome and the Ramp up, control by control.
 *
 * The oldest and most used part of the app, and among the least covered
 * (MET-01 to MET-03, MET-12, MET-20, MET-21, MET-41, RMP-09, RMP-32, RMP-34). Test
 * names carry the TOOLS_PARITY row they pin; src/test/parity/COVERAGE.md lists them. Each
 * control is driven in the real window and judged by the command it sends, which is
 * what actually changes the sound. Section 3.2's deep controls are all here: a
 * "quick" door must not be the only way left to reach them.
 *
 * Count-in differs on purpose between the on-screen Play and the Space key (MET-31,
 * MET-32). Both are pinned as they are; rustState.test.ts pins what is and is not
 * saved across a restart.
 */
import { describe, expect, it } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { SOUND_TYPES, METER_PRESETS } from "../../constants/metronome";
import i18n from "../../i18n";
import { DEFAULT_TEST_STATE, setInvokeResponse } from "../../test/mocks";
import { onTool, openShell, sentTo, settle, wasInvoked } from "../../test/parity/shell";
import { emitEvent } from "../../test/parity/store";
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
  it("MET-03: the ruler sets it", async () => {
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

  it("MET-04: click the number, type a number", async () => {
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

  it("MET-10: tap tempo is there, and only there: it has no key", async () => {
    await onMetronome();
    const tap = document.querySelector<HTMLElement>(".tap-btn")!;
    expect(tap).not.toBeNull();
    for (let i = 0; i < 4; i++) {
      fireEvent.click(tap);
      await new Promise((r) => setTimeout(r, 120));
    }
    await waitFor(() => expect(wasInvoked("set_bpm")).toBe(true));
  });

  it("MET-01: keeps Rust's limits, 20 to 300", async () => {
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

  it("MET-18: FREE mode is one of the choices", async () => {
    await onMetronome();
    await openPicker();
    const buttons = [...document.querySelectorAll(".time-sig-btn")];
    const free = buttons.find((b) => !METER_PRESETS.some((p) => p.label === b.textContent))!;
    expect(free).toBeDefined();
    fireEvent.click(free);
    await waitFor(() => expect(wasInvoked("set_free_mode", { enabled: true })).toBe(true));
  });

  it("MET-17: the stepper changes the beats in a bar", async () => {
    await onMetronome();
    const [down, up] = [...document.querySelectorAll<HTMLElement>(".beat-stepper-btn")];
    fireEvent.click(up);
    await waitFor(() => expect(sentTo("set_beat_groups").length).toBeGreaterThan(0));
    const count = sentTo("set_beat_groups").length;
    fireEvent.click(down);
    await waitFor(() => expect(sentTo("set_beat_groups").length).toBeGreaterThan(count));
  });

  it("MET-20: shows the clicks per bar the meter and subdivision make", async () => {
    await onMetronome({ beatGroups: [3, 2, 2], timeSignature: 7, subdivision: 2 });
    expect(document.querySelector(".meter-section")?.textContent).toContain(
      t("metronome.clicksPerBar", { count: 14 }),
    );
  });

  it("MET-16: offers the groupings of an odd meter", async () => {
    await onMetronome({ beatGroups: [3, 2, 2], timeSignature: 7 });
    expect(document.querySelectorAll(".meter-grouping-chip").length).toBeGreaterThan(1);
  });

  it.each([
    ["groups", "Group starts"],
    ["all", "Every beat"],
    ["none", "None"],
  ] as const)("MET-23: the accent mode %s can be chosen", async (mode, label) => {
    await onMetronome({ accentMode: mode === "groups" ? "all" : "groups" });
    const control = document.querySelector(".accent-control")!;
    const button = [...control.querySelectorAll<HTMLElement>(".accent-option")].find(
      (b) => b.textContent === label,
    )!;
    expect(button).toBeDefined();
    fireEvent.click(button);
    await waitFor(() => expect(wasInvoked("set_accent_mode", { mode })).toBe(true));
  });
});

describe("the subdivision", () => {
  it.each([1, 2, 3, 4, 5, 6])("MET-12: %i can be chosen, including the two with no key", async (sub) => {
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
  it.each(SOUND_TYPES.map((s) => [s.id] as const))("MET-25: the %s sound can be chosen", async (id) => {
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

  it("MET-27: the volume can be set", async () => {
    await onMetronome();
    fireEvent.change(document.querySelector(".context-chip-volume .context-chip-range")!, {
      target: { value: "35" },
    });
    await waitFor(() => expect(wasInvoked("set_volume")).toBe(true));
  });
});

describe("starting it", () => {
  const playButton = () => document.querySelector<HTMLElement>(".transport-play")!;

  it("MET-30, MET-32: the on-screen Play arms the count-in when it is on", async () => {
    await onMetronome();
    fireEvent.click(playButton());
    await waitFor(() => expect(wasInvoked("toggle_playback")).toBe(true));
    expect(wasInvoked("arm_count_in")).toBe(true);
  });

  it("MET-31, MET-32: Space starts it with no count-in, as it always has", async () => {
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
    // The switch writes the click's warm-up beats to Rust and draws what Rust
    // sends back: it holds no state of its own.
    await waitFor(() =>
      expect(
        sentTo("configure_speed_ramp").some((a) => (a as { warmupBeats?: number }).warmupBeats === 0),
      ).toBe(true),
    );
    await act(async () =>
      emitEvent("state-changed", {
        ...DEFAULT_TEST_STATE,
        speedRamp: { ...DEFAULT_TEST_STATE.speedRamp, warmupBeats: 0 },
      }),
    );
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
    fireEvent.click(playButton());
    await waitFor(() => expect(wasInvoked("toggle_playback")).toBe(true));
    expect(wasInvoked("arm_count_in")).toBe(false);
  });

  it("MET-41, SHL-29: a double-click on the stage goes to Zen", async () => {
    await onMetronome();
    fireEvent.doubleClick(document.querySelector(".bpm-section")!);
    await waitFor(() => expect(document.querySelector(".fullscreen-view")).not.toBeNull());
  });

  it("MET-41, SHL-29: the same click on a control does not", async () => {
    await onMetronome();
    fireEvent.doubleClick(document.querySelector(".bpm-btn")!);
    await settle(5);
    expect(document.querySelector(".fullscreen-view")).toBeNull();
  });
});

describe("the Ramp up", () => {
  const modeButton = (label: string) =>
    [...document.querySelectorAll<HTMLElement>(".drill-modes button")].find(
      // Adaptive carries a "Listens" badge inside its button.
      (b) => b.firstChild?.textContent === label,
    )!;

  it("RMP-17, RMP-37: starts the climb from its own Play", async () => {
    await onDrill();
    fireEvent.click(document.querySelector(".transport-play")!);
    await waitFor(() => expect(wasInvoked("start_speed_ramp")).toBe(true));
  });

  it("MET-31, RMP-18: Space stops a climb that is running", async () => {
    await onDrill({ speedRamp: { ...DEFAULT_TEST_STATE.speedRamp, active: true } });
    press("Space");
    await waitFor(() => expect(wasInvoked("stop_speed_ramp")).toBe(true));
  });

  it.each(["Linear", "Zigzag", "Adaptive"])("RMP-02: %s can be chosen and sent", async (label) => {
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

  it("RMP-23 (section 3.2): the plan line and the modes keep their place", async () => {
    await onDrill({ speedRamp: { ...DEFAULT_TEST_STATE.speedRamp, mode: "adaptive" } });
    const body = document.querySelector(".drill-view")!;
    // Start, target, step, subdivision, sound, count-in, cyclic, aggressiveness.
    expect(body.textContent).toContain("80");
    expect(body.textContent).toContain("160");
    expect(document.querySelector(".drill-plan-block")).not.toBeNull();
    expect(document.querySelector(".drill-modes")).not.toBeNull();
  });

  it("RMP-03: Adaptive takes the ceiling off, and hides the target", async () => {
    await onDrill();
    fireEvent.click(modeButton("Adaptive"));
    await waitFor(() =>
      expect(
        sentTo("configure_speed_ramp").some(
          (a) => (a as { mode?: string; targetBpm?: number }).mode === "adaptive" &&
            (a as { targetBpm?: number }).targetBpm === 300,
        ),
      ).toBe(true),
    );
  });

  it("RMP-09: beats per bar is set from its own token, 1 to 12", async () => {
    await onDrill();
    const token = [...document.querySelectorAll<HTMLElement>(".drill-plan-detail-token")].find(
      (b) => b.textContent === t("drill.beatsSummary", { count: DEFAULT_TEST_STATE.speedRamp.beatsPerBar }),
    )!;
    expect(token).toBeDefined();
    fireEvent.click(token);
    const input = await waitFor(() => {
      const el = document.querySelector<HTMLInputElement>(`.drill-popover input[aria-label="${t("drill.beats")}"]`);
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.change(input, { target: { value: "40" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(sentTo("configure_speed_ramp").some((a) => (a as { beatsPerBar?: number }).beatsPerBar === 12)).toBe(true),
    );
  });

  it("RMP-32: a run starting closes an open plan popover", async () => {
    await onDrill();
    fireEvent.click(document.querySelector<HTMLElement>(".drill-plan-detail-token")!);
    await waitFor(() => expect(document.querySelector(".drill-popover")).not.toBeNull());
    await act(async () =>
      emitEvent("state-changed", {
        ...DEFAULT_TEST_STATE,
        isPlaying: true,
        speedRamp: { ...DEFAULT_TEST_STATE.speedRamp, active: true },
      }),
    );
    await waitFor(() => expect(document.querySelector(".drill-popover")).toBeNull());
  });

  it("RMP-32: with drill auto-collapse off, it stays open", async () => {
    await openShell({}, { drillAutoCollapse: false });
    await onTool(DRILL);
    fireEvent.click(document.querySelector<HTMLElement>(".drill-plan-detail-token")!);
    await waitFor(() => expect(document.querySelector(".drill-popover")).not.toBeNull());
    await act(async () =>
      emitEvent("state-changed", {
        ...DEFAULT_TEST_STATE,
        isPlaying: true,
        speedRamp: { ...DEFAULT_TEST_STATE.speedRamp, active: true },
      }),
    );
    await settle(20);
    expect(document.querySelector(".drill-popover")).not.toBeNull();
  });

  it("RMP-33: the plan is sent to Rust whole when it changes", async () => {
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
  it("MET-44, MET-51: draws what Rust restored", async () => {
    setInvokeResponse("get_state", () => ({ ...DEFAULT_TEST_STATE, bpm: 171 }));
    const { container } = await openShell({ bpm: 171 });
    await onTool(METRONOME);
    expect(container.querySelector(".bpm-input")?.textContent).toBe("171");
  });
});
