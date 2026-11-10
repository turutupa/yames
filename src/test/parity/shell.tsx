/**
 * The whole app, for a returning player, for tests that drive it like one.
 *
 * Nothing but the Tauri transport is fake, so what these tests see is the shell as
 * shipped, and a Today-first shell runs through them unchanged.
 */
import { act, render, waitFor } from "@testing-library/react";
import { MainWindow } from "../../containers/main-window/MainWindow";
import { DEFAULT_TEST_STATE, mockInvoke, setInvokeResponse } from "../mocks";
import type { AppState } from "../../types";
import { installSettings } from "./store";
import { expectOnTool, openTool, press, RETURNING_PLAYER, type Tool } from "./tools";

/** What was sent to one command, most recent last. */
export const sentTo = (command: string): unknown[] =>
  mockInvoke.mock.calls.filter(([c]) => c === command).map(([, args]) => args);

export const wasInvoked = (command: string, args?: unknown): boolean =>
  args === undefined
    ? sentTo(command).length > 0
    : sentTo(command).some((a) => JSON.stringify(a) === JSON.stringify(args));

/** Let effects and the store's promises finish. */
export const settle = (ms = 0) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

export async function openShell(
  state: Partial<AppState> = {},
  settings: Record<string, unknown> = {},
) {
  const store = await installSettings({ ...RETURNING_PLAYER, ...settings });
  setInvokeResponse("get_state", () => ({ ...DEFAULT_TEST_STATE, ...state }));
  // The shared mock has no answer for this, and Settings cannot draw without one.
  setInvokeResponse("tts_voice_diagnostics", () => []);
  const view = render(<MainWindow />);
  await waitFor(() => {
    if (!document.querySelector(".rail")) throw new Error("the shell did not draw");
  });
  await settle();
  return { ...view, store };
}

/** Open a tool, wait for its screen, and start counting calls from there. */
export async function onTool(tool: Tool) {
  await openTool(tool);
  await expectOnTool(tool);
  await settle();
  mockInvoke.mockClear();
}

/** Open Settings by its key, and wait for it. */
export async function openSettings() {
  press("⌘,");
  await waitFor(() => {
    if (!document.querySelector("#settings-coach")) throw new Error("Settings did not open");
  });
  await settle();
}
