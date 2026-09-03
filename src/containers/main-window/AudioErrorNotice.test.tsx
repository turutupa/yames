/**
 * The audio-failure notice, driven by the real `audio-error` event through
 * the mocked Tauri transport (same approach as `useVoicePrompt.test.ts`).
 *
 * What is locked in here: PR #47 made the metronome survive a busy audio
 * device, but Play still snapped back in silence because nothing consumed
 * the event it emits. So: the event has to produce a message, the message
 * has to be the actionable one for the case we can name, the raw reason has
 * to stay reachable for a bug report, and the whole thing has to go away
 * when the user says so.
 */
import { describe, expect, it } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { mockListen } from "../../test/mocks";
import { useAudioError } from "./hooks/useAudioError";
import { AudioErrorNotice } from "./AudioErrorNotice";

const DEVICE_IN_USE =
  "could not open the audio output stream: A backend-specific error has occurred: 0x8889000A";
const NO_DEVICE = "no audio output device found";

/** Fire the backend's event at whatever listeners are registered. */
function emit(reason: string) {
  const calls = mockListen.mock.calls.filter(([name]) => name === "audio-error");
  act(() => {
    for (const [, cb] of calls) {
      (cb as (e: { payload: unknown }) => void)({ payload: reason });
    }
  });
}

let opened = 0;

/** The MainWindow wiring in miniature: the hook, the pill, the deep link. */
function Harness({ isPlaying = false }: { isPlaying?: boolean }) {
  const audioError = useAudioError(isPlaying);
  if (!audioError.notice) return null;
  return (
    <AudioErrorNotice
      notice={audioError.notice}
      onOpenSettings={() => {
        opened += 1;
        audioError.dismiss();
      }}
      onDismiss={audioError.dismiss}
    />
  );
}

async function mounted(isPlaying = false) {
  const view = render(<Harness isPlaying={isPlaying} />);
  // Let the `listen()` promise register before anything is emitted.
  await act(async () => {});
  return view;
}

const notice = () => screen.queryByTestId("audio-error-notice");

describe("AudioErrorNotice", () => {
  it("shows nothing until the audio thread reports a failure", async () => {
    await mounted();
    expect(notice()).toBeNull();
  });

  it("names the other app and points at the device picker", async () => {
    await mounted();
    emit(DEVICE_IN_USE);
    await waitFor(() => expect(notice()).not.toBeNull());
    expect(notice()).toHaveAttribute("data-kind", "device-in-use");
    expect(notice()?.textContent).toContain("Another app is using your audio output");
    expect(notice()?.textContent).toContain("Settings → Devices");
    // The hex is never the headline.
    expect(
      screen.queryByText(/0x8889000A/, { selector: ".audio-error-notice-text" }),
    ).toBeNull();
  });

  it("keeps the raw reason on the element for a bug report", async () => {
    await mounted();
    emit(DEVICE_IN_USE);
    await waitFor(() => expect(notice()).not.toBeNull());
    expect(notice()).toHaveAttribute("title", DEVICE_IN_USE);
    expect(notice()).toHaveAttribute("data-reason", DEVICE_IN_USE);
  });

  it("admits it does not know, and shows the reason, for anything else", async () => {
    await mounted();
    emit(NO_DEVICE);
    await waitFor(() => expect(notice()).not.toBeNull());
    expect(notice()).toHaveAttribute("data-kind", "generic");
    expect(notice()?.textContent).toContain(
      "Yames couldn't start the audio output",
    );
    expect(notice()?.textContent).toContain(NO_DEVICE);
  });

  it("goes away when dismissed", async () => {
    await mounted();
    emit(DEVICE_IN_USE);
    await waitFor(() => expect(notice()).not.toBeNull());
    act(() => {
      screen.getByRole("button", { name: "Dismiss" }).click();
    });
    expect(notice()).toBeNull();
  });

  it("opens Settings and steps aside when the action is taken", async () => {
    opened = 0;
    await mounted();
    emit(DEVICE_IN_USE);
    await waitFor(() => expect(notice()).not.toBeNull());
    act(() => {
      screen.getByRole("button", { name: "Audio settings" }).click();
    });
    expect(opened).toBe(1);
    expect(notice()).toBeNull();
  });

  // A red pill sitting over a metronome that is audibly working would be its
  // own small lie, so a later successful Play retires the message.
  it("retires itself once the transport actually starts", async () => {
    const view = await mounted(false);
    emit(DEVICE_IN_USE);
    await waitFor(() => expect(notice()).not.toBeNull());
    view.rerender(<Harness isPlaying={true} />);
    await waitFor(() => expect(notice()).toBeNull());
  });

  it("replaces an older failure with the newest one", async () => {
    await mounted();
    emit(DEVICE_IN_USE);
    await waitFor(() => expect(notice()).not.toBeNull());
    emit(NO_DEVICE);
    await waitFor(() =>
      expect(notice()).toHaveAttribute("data-kind", "generic"),
    );
  });
});
