/**
 * The Outputs picker in Settings › Devices.
 *
 * It appears only for a device that HAS more than two outputs. On a laptop
 * there is nothing to choose and a picker with one option in it is a
 * question nobody asked; on a four-output interface it is the whole point
 * of issue 52 — the click on outputs 3-4 while the v-drums keep 1-2.
 *
 * The labels count outputs from one, because that is what is printed on
 * the box; the value the engine is sent is 0-based.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DevicesSettingsSection } from "./DevicesSettingsSection";
import type { AudioOutputDevice } from "../../types";

vi.mock("../../ipc", () => ({
  listAudioOutputDevices: async () => [],
  getCalibrationCacheEntry: async () => null,
  clearCalibrationCacheEntry: async () => undefined,
}));

const device = (name: string, channels: number): AudioOutputDevice => ({
  name,
  isDefault: false,
  isBluetooth: false,
  channels,
});

const INTERFACE = device("UMC204HD 192k", 4);
const LAPTOP = device("Speakers (Realtek)", 2);

const evaluation = {
  devices: [],
  selectedDevice: null,
  selectedChannel: 0,
  selectDevice: vi.fn(),
  selectChannel: vi.fn(),
} as unknown as Parameters<typeof DevicesSettingsSection>[0]["evaluation"];

const midi = {
  devices: [],
  connectedDevice: null,
  connect: vi.fn(),
  disconnect: vi.fn(),
  refreshDevices: vi.fn(),
} as unknown as Parameters<typeof DevicesSettingsSection>[0]["midi"];

function renderSection(
  over: Partial<Parameters<typeof DevicesSettingsSection>[0]> = {},
) {
  const props = {
    audioOutputDevices: [INTERFACE, LAPTOP],
    setAudioOutputDevices: vi.fn(),
    selectedOutputDevice: "UMC204HD 192k",
    outputPair: 0,
    selectOutputPair: vi.fn(),
    selectOutputDevice: vi.fn(),
    outputPairFellBack: false,
    evaluation,
    midi,
    onOpenInputTest: vi.fn(),
    instrument: "other",
    ...over,
  };
  render(<DevicesSettingsSection {...props} />);
  return props;
}

/** The Outputs picker, told apart from the input Channel picker by the
 *  label above it rather than by DOM order. */
const outputPicker = () =>
  screen.queryByText(/Outputs 1-2|Outputs 3-4/) ? true : false;

afterEach(cleanup);

describe("the Outputs picker", () => {
  it("appears for a device with four outputs", () => {
    renderSection();
    expect(screen.getByText("Outputs 1-2")).toBeTruthy();
  });

  it("stays away for a device with two", () => {
    renderSection({ selectedOutputDevice: "Speakers (Realtek)" });
    expect(outputPicker()).toBe(false);
  });

  it("appears for the system default when the default IS the interface", () => {
    // The reporter's own setup: the interface is the OS default, so the
    // picker is at "System default" and never at a name. Looking the
    // device up by name alone hid the picker from exactly the person who
    // asked for it.
    renderSection({
      audioOutputDevices: [{ ...INTERFACE, isDefault: true }, LAPTOP],
      selectedOutputDevice: "",
    });
    expect(screen.getByText("Outputs 1-2")).toBeTruthy();
  });

  it("stays away when the system default is a two-output device", () => {
    renderSection({
      audioOutputDevices: [INTERFACE, { ...LAPTOP, isDefault: true }],
      selectedOutputDevice: "",
    });
    expect(outputPicker()).toBe(false);
  });

  it("stays away when nothing is flagged as the default", () => {
    renderSection({ selectedOutputDevice: "" });
    expect(outputPicker()).toBe(false);
  });

  it("offers one option per PAIR, counting outputs from one", () => {
    renderSection({
      audioOutputDevices: [device("Scarlett 18i20", 6)],
      selectedOutputDevice: "Scarlett 18i20",
    });
    fireEvent.click(screen.getByText("Outputs 1-2"));
    expect(screen.getByText("Outputs 3-4")).toBeTruthy();
    expect(screen.getByText("Outputs 5-6")).toBeTruthy();
    expect(screen.queryByText("Outputs 7-8")).toBeNull();
  });

  it("sends the 0-based pair when one is chosen", () => {
    const props = renderSection();
    fireEvent.click(screen.getByText("Outputs 1-2"));
    fireEvent.click(screen.getByText("Outputs 3-4"));
    expect(props.selectOutputPair).toHaveBeenCalledWith(1);
  });

  it("shows the pair that is actually playing", () => {
    renderSection({ outputPair: 1 });
    // The trigger shows 3-4; the menu is closed, so that is the only one.
    expect(screen.getByText("Outputs 3-4")).toBeTruthy();
    expect(screen.queryByText("Outputs 1-2")).toBeNull();
  });

  it("says why when a device could not deliver the outputs it advertised", () => {
    renderSection({ outputPairFellBack: true });
    expect(
      screen.getByText(/only delivered two outputs/i),
    ).toBeTruthy();
  });

  it("says nothing about a fallback that did not happen", () => {
    renderSection();
    expect(screen.queryByText(/only delivered two outputs/i)).toBeNull();
  });
});
