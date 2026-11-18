/**
 * W3 — hands-free control.
 *
 * The step is rendered inside the real wizard shell and driven by the real
 * `useMidi` hook: the Tauri transport is mocked (src/test/mocks.ts), so a
 * "pedal press" here is a genuine `midi-activity` event travelling through
 * `ipc.ts` → `useMidi` → `set_midi_binding`, not a stubbed component.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { load } from "@tauri-apps/plugin-store";
import { HOTKEYS, platformKey, splitCombo } from "../../../hotkeys";
import { useMidi } from "../../../hooks/useMidi";
import i18n from "../../../i18n";
import type { MidiActivity, MidiBinding, MidiDeviceInfo } from "../../../types";
import { mockInvoke, mockListen, setInvokeResponse } from "../../../test/mocks";
import { OnboardingWizard } from "../OnboardingWizard";
import type { OnboardingState } from "../onboardingMachine";
import { keyRange } from "./HandsFreeStep";

const HANDS_FREE: OnboardingState = {
  status: "step",
  stepId: "hands-free",
  context: { skipped: [], visited: ["welcome", "instrument", "hands-free"] },
};

const PEDAL: MidiDeviceInfo = { id: 0, name: "FCB1010", isConnected: true };

type HarnessProps = {
  gamepadBindings?: Record<string, string>;
  dispatch?: (event: unknown) => void;
};

/** Mounts the wizard with the app's real MIDI hook behind it. */
function Harness({ gamepadBindings = {}, dispatch = vi.fn() }: HarnessProps) {
  const midi = useMidi(() => {}, true, true);
  return (
    <OnboardingWizard
      state={HANDS_FREE}
      dispatch={dispatch as never}
      appVersion="1.0.4"
      instrument="electric-guitar"
      instrumentChosen
      onInstrumentChange={vi.fn()}
      soundType="wood"
      themeId="obsidian"
      coachTier="off"
      alwaysOnTop
      onAlwaysOnTopChange={vi.fn()}
      startSoftClick={vi.fn()}
      stopSoftClick={vi.fn()}
      softClickPlaying={false}
      onFinish={vi.fn()}
      midi={midi}
      gamepadBindings={gamepadBindings}
    />
  );
}

/** The ipc-level callback registered for a Tauri event, if any. */
function listenerFor(event: string): ((e: { payload: unknown }) => void) | undefined {
  const call = [...mockListen.mock.calls].reverse().find(([name]) => name === event);
  return call?.[1] as ((e: { payload: unknown }) => void) | undefined;
}

function pressPedal(activity: MidiActivity) {
  act(() => listenerFor("midi-activity")?.({ payload: activity }));
}

function plugIn(devices: MidiDeviceInfo[]) {
  act(() => listenerFor("midi-devices-changed")?.({ payload: devices }));
}

const midiCard = () => screen.getByTestId("hands-free-midi");

/** Render and let `useMidi`'s initial device/binding fetches settle. */
async function mount(props: HarnessProps = {}) {
  await act(async () => {
    render(<Harness {...props} />);
  });
}

// The store mock resolves the same object every time, so replacing `get` here
// gives the keyboard card a real settings file to read overrides from.
let store: { get: ReturnType<typeof vi.fn> };
beforeAll(async () => {
  store = (await (load as unknown as (n: string, o: unknown) => Promise<never>)(
    "settings.json",
    {},
  )) as unknown as typeof store;
});
beforeEach(() => {
  store.get.mockImplementation(async () => undefined);
});

/** The kbd texts on one row of a card, by the row's label. */
function keysOn(card: HTMLElement, label: string): string[] {
  const row = within(card).getByText(label).closest(".onboarding-hf-key-row");
  expect(row, label).not.toBeNull();
  return Array.from(row!.querySelectorAll("kbd")).map((k) => k.textContent ?? "");
}

const keysFor = (id: string) =>
  splitCombo(HOTKEYS.find((h) => h.id === id)!.key).map(platformKey);

describe("W3 — the Session leads", () => {
  it("comes first, with the Session's real keys", async () => {
    await mount();
    const cards = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(cards[0]).toBe("In a Session");
    const card = screen.getByTestId("hands-free-keyboard");
    // The big button is Play or session-go: Space or Enter, as bound.
    expect(keysOn(card, "Start or end the Take, or press the big button")).toEqual([
      ...keysFor("play"),
      ...keysFor("session-go"),
    ]);
    expect(within(card).getAllByText("or").length).toBeGreaterThan(0);
    expect(keysOn(card, "Faster or slower, between Takes")).toEqual([
      ...keysFor("session-faster"),
      ...keysFor("session-slower"),
    ]);
    expect(keysOn(card, "Next step")).toEqual(keysFor("session-next"));
    // Pause, again, the view and the way out (2026-11-18).
    expect(keysOn(card, "Pause / resume")).toEqual(keysFor("session-pause"));
    expect(keysOn(card, "Restart the Take")).toEqual(keysFor("session-restart"));
    expect(keysOn(card, "Switch view: Neck, Runway or Tab")).toEqual(keysFor("session-view"));
    expect(keysOn(card, "Leave the Session")).toEqual(keysFor("session-exit"));
    expect(within(card).getByText("Every key is remappable in Settings → Hotkeys.")).toBeInTheDocument();
  });

  it("prefers the user's remapped keys over the defaults", async () => {
    store.get.mockImplementation(async (key: string) =>
      key === "keyBindings" ? { "session-next": "M", "session-go": "G" } : undefined,
    );
    await mount();
    const card = () => screen.getByTestId("hands-free-keyboard");
    await waitFor(() => expect(keysOn(card(), "Next step")).toEqual(["M"]));
    expect(keysOn(card(), "Start or end the Take, or press the big button")).toEqual([
      ...keysFor("play"),
      "G",
    ]);
  });

  it("shows the pedal's tap, double and hold, and what a tap does in the tools", async () => {
    await mount();
    const legend = screen.getByTestId("hands-free-legend");
    for (const [gesture, does] of [
      ["Tap", "The big button"],
      ["Double tap", "Slower"],
      ["Hold", "Again"],
    ]) {
      expect(within(legend).getByText(gesture)).toBeInTheDocument();
      expect(within(legend).getByText(does)).toBeInTheDocument();
    }
    expect(
      within(screen.getByTestId("hands-free-pedal")).getByText(
        "Outside a Session, a tap plays and stops the tools.",
      ),
    ).toBeInTheDocument();
  });

  it("puts the learning screens' and the tools' keys on one quiet line", async () => {
    await mount();
    const nav = screen.getByTestId("hands-free-nav");
    expect(nav.tagName).toBe("P");
    const learning = nav.querySelector('[data-group="learning"]')!;
    const tools = nav.querySelector('[data-group="tools"]')!;
    expect(learning.textContent).toContain("Learning screens");
    expect(tools.textContent).toContain("Tools");
    // One keycap per run: Ctrl 1–4 and Alt 1–5, read from the binding table.
    const today = keysFor("tab-today");
    const tool1 = keysFor("tab-1");
    expect(Array.from(learning.querySelectorAll("kbd")).map((k) => k.textContent)).toEqual([
      ...today.slice(0, -1),
      "1–4",
    ]);
    expect(Array.from(tools.querySelectorAll("kbd")).map((k) => k.textContent)).toEqual([
      ...tool1.slice(0, -1),
      "1–5",
    ]);
  });

  it("lists the keys one by one once a remap breaks the run", () => {
    expect(keyRange([["Ctrl", "1"], ["Ctrl", "2"], ["Ctrl", "3"]])).toEqual([["Ctrl", "1–3"]]);
    expect(keyRange([["Ctrl", "1"], ["Alt", "2"]])).toEqual([["Ctrl", "1"], ["Alt", "2"]]);
    expect(keyRange([["Ctrl", "1"], ["Ctrl", "5"]])).toEqual([["Ctrl", "1"], ["Ctrl", "5"]]);
    expect(keyRange([["Ctrl", "1"], []])).toEqual([["Ctrl", "1"]]);
  });
});

describe("W3 — MIDI card", () => {
  it("shows the calm no-device line and offers nothing to press", async () => {
    setInvokeResponse("list_midi_devices", []);
    await mount();
    await waitFor(() =>
      expect(
        within(midiCard()).getByText(
          "Plug one in any time — Yames will offer to map it.",
        ),
      ).toBeInTheDocument(),
    );
    expect(
      within(midiCard()).queryByRole("button", { name: "Map the pedal" }),
    ).toBeNull();
  });

  it("picks up a device plugged in while the step is open", async () => {
    setInvokeResponse("list_midi_devices", []);
    await mount();
    await waitFor(() =>
      expect(within(midiCard()).getByText(/Plug one in any time/)).toBeInTheDocument(),
    );
    plugIn([PEDAL]);
    expect(await within(midiCard()).findByText("FCB1010")).toBeInTheDocument();
    expect(within(midiCard()).queryByText(/Plug one in any time/)).toBeNull();
  });

  it("maps the pressed pedal to the Session's one-pedal action and confirms it", async () => {
    let bindings: MidiBinding[] = [];
    setInvokeResponse("list_midi_devices", [PEDAL]);
    setInvokeResponse("get_midi_bindings", () => bindings);
    setInvokeResponse("set_midi_binding", (args) => {
      bindings = [
        {
          action: args!.action as string,
          channel: args!.channel as number,
          msgType: args!.msgType as MidiBinding["msgType"],
          number: args!.number as number,
        },
      ];
    });

    await mount();
    const map = await within(midiCard()).findByRole("button", { name: "Map the pedal" });
    act(() => {
      map.click();
    });
    await waitFor(() =>
      expect(
        within(midiCard()).getByText("Press the pedal you want to use."),
      ).toBeInTheDocument(),
    );

    pressPedal({ channel: 0, type: "cc", number: 64, value: 127 });

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("set_midi_binding", {
        action: "session-pedal",
        channel: 0,
        msgType: "cc",
        number: 64,
      }),
    );
    // The confirmation names the captured signal, 1-based channel like the
    // input tester.
    expect(
      await within(midiCard()).findByText("Pedal → CC #64 · channel 1"),
    ).toBeInTheDocument();
  });

  it("connects a device that is present but not open before listening", async () => {
    setInvokeResponse("list_midi_devices", [{ ...PEDAL, isConnected: false }]);
    await mount();
    const map = await within(midiCard()).findByRole("button", { name: "Map the pedal" });
    act(() => {
      map.click();
    });
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("connect_midi_device", {
        deviceName: "FCB1010",
      }),
    );
  });
});

describe("W3 — the cards never navigate", () => {
  it("selecting a device or starting a mapping does not advance the step", async () => {
    const dispatch = vi.fn();
    setInvokeResponse("list_midi_devices", [{ ...PEDAL, isConnected: false }]);
    await mount({ dispatch });

    // Every interactive thing on the step except the shell's own footer.
    const controls = [
      ...within(midiCard()).getAllByRole("button"),
      ...within(screen.getByTestId("hands-free-keyboard")).queryAllByRole("button"),
      ...within(screen.getByTestId("hands-free-gamepad")).queryAllByRole("button"),
    ];
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      await act(async () => {
        control.click();
      });
    }
    // Clicking a card selects/maps; only Next advances.
    expect(dispatch).not.toHaveBeenCalled();

    // …and the footer still does advance, so the step is not a dead end.
    // A control is optional, so unlike W1 this step never gates Next — it
    // registers no `setNextEnabled`, and the shell's default is enabled.
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    act(() => {
      screen.getByRole("button", { name: "Next" }).click();
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "NEXT" });
  });
});

describe("W3 — gamepad card", () => {
  it("stays calm when no pad is connected", async () => {
    await mount();
    const card = screen.getByTestId("hands-free-gamepad");
    expect(
      within(card).getByText(
        "Connect a controller any time — press a button and Yames will see it.",
      ),
    ).toBeInTheDocument();
  });
});
