/**
 * The output-pair IPC, end to end through the real `ipc.ts` and the mocked
 * Tauri transport.
 *
 * `setAudioOutputPair` is the one call in this area that RETURNS something
 * — the pair actually in effect, which is not always the pair asked for —
 * so the wrapper has to pass the answer back rather than swallow it the
 * way every other fire-and-forget setter does. A mock that returned
 * `undefined` would make the hook's "believe the answer" step silently a
 * no-op, which is exactly the failure `ipc.commands.test.ts` was written
 * for in a different guise.
 */
import { describe, it, expect } from "vitest";
import { listAudioOutputDevices, setAudioOutputPair } from "./ipc";
import { setInvokeResponse } from "./test/mocks";

describe("the output-pair IPC", () => {
  it("hands back the pair the engine says is in effect", async () => {
    await expect(setAudioOutputPair(1)).resolves.toBe(1);
    await expect(setAudioOutputPair(0)).resolves.toBe(0);
  });

  it("believes a backend that lowered the pair", async () => {
    // A device that advertised four outputs and delivered two.
    setInvokeResponse("set_audio_output_pair", 0);
    await expect(setAudioOutputPair(2)).resolves.toBe(0);
  });

  it("carries the output count, which is what gates the picker", async () => {
    setInvokeResponse("list_audio_output_devices", [
      { name: "UMC204HD 192k", isDefault: false, isBluetooth: false, channels: 4 },
    ]);
    const devices = await listAudioOutputDevices();
    expect(devices[0].channels).toBe(4);
  });
});
