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

describe("W3 — keyboard card", () => {
  it("renders the real binding for every key it teaches", async () => {
    await mount();
    const card = screen.getByTestId("hands-free-keyboard");

    for (const id of ["play", "bpm-up", "bpm-down", "toggle-coach", "tab-1", "tab-2"]) {
      const label = i18n.t(`settings.hotkeys.actions.${id}`);
      const row = within(card).getByText(label).closest(".onboarding-hf-key-row");
      expect(row, id).not.toBeNull();
      // Whatever the binding table says, split and localised for this
      // platform — nothing in the step hardcodes a key.
      const expected = splitCombo(HOTKEYS.find((h) => h.id === id)!.key).map(platformKey);
      expect(
        Array.from(row!.querySelectorAll("kbd")).map((k) => k.textContent),
        id,
      ).toEqual(expected);
    }
  });

  it("prefers the user's remapped key over the default", async () => {
    store.get.mockImplementation(async (key: string) =>
      key === "keyBindings" ? { play: "P" } : undefined,
    );
    await mount();
    const card = () => screen.getByTestId("hands-free-keyboard");
    await waitFor(() => expect(within(card()).getByText("P")).toBeInTheDocument());
    expect(within(card()).queryByText("Space")).toBeNull();
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
      within(midiCard()).queryByRole("button", { name: "Map Play/Stop" }),
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

  it("maps the pressed pedal to Play/Stop and confirms what it captured", async () => {
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
    const map = await within(midiCard()).findByRole("button", { name: "Map Play/Stop" });
    act(() => {
      map.click();
    });
    await waitFor(() =>
      expect(
        within(midiCard()).getByText("Press the pedal you want for Play/Stop."),
      ).toBeInTheDocument(),
    );

    pressPedal({ channel: 0, type: "cc", number: 64, value: 127 });

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("set_midi_binding", {
        action: "play",
        channel: 0,
        msgType: "cc",
        number: 64,
      }),
    );
    // The confirmation names the captured signal, 1-based channel like the
    // input tester.
    expect(
      await within(midiCard()).findByText("Play/Stop → CC #64 · channel 1"),
    ).toBeInTheDocument();
  });

  it("connects a device that is present but not open before listening", async () => {
    setInvokeResponse("list_midi_devices", [{ ...PEDAL, isConnected: false }]);
    await mount();
    const map = await within(midiCard()).findByRole("button", { name: "Map Play/Stop" });
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
