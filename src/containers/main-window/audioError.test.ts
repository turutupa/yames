/**
 * Classification of the `audio-error` payload.
 *
 * The distinction that matters: "another app has the device" has a remedy
 * the app can point at, and everything else does not. Getting that wrong in
 * either direction is a lie — telling someone to close an app when their
 * sound card is missing, or burying the one case a guitarist meets weekly
 * under a generic apology.
 */
import { describe, expect, it } from "vitest";
import { classifyAudioError } from "./audioError";

/**
 * What WASAPI actually produces. cpal formats the failure with
 * `windows::core::Error`'s Display, which ends in the HRESULT's own
 * `{:#010X}` — so the hex is present even when Windows has no message text
 * for the code, and the prose half is localised and unmatchable.
 */
const DEVICE_IN_USE =
  "could not open the audio output stream: A backend-specific error has occurred: 0x8889000A";

describe("classifyAudioError", () => {
  it("names the busy-device case from the HRESULT", () => {
    const notice = classifyAudioError(DEVICE_IN_USE);
    expect(notice.kind).toBe("device-in-use");
    expect(notice.messageKey).toBe("audioError.deviceInUse");
  });

  it("matches the hex whatever case the backend writes it in", () => {
    expect(classifyAudioError("stream failed: 0x8889000a").kind).toBe(
      "device-in-use",
    );
    expect(
      classifyAudioError("AUDCLNT_E_DEVICE_IN_USE while opening the endpoint")
        .kind,
    ).toBe("device-in-use");
  });

  // Windows localises the prose half of the message, so a classifier that
  // keyed on "device is already in use" would work only in English.
  it("still recognises the case when Windows supplies localised prose", () => {
    const notice = classifyAudioError(
      "could not open the audio output stream: A backend-specific error has occurred: Das Gerät wird bereits verwendet. (0x8889000A)",
    );
    expect(notice.kind).toBe("device-in-use");
  });

  it("does not guess at anything else", () => {
    for (const reason of [
      "no audio output device found",
      "output device has no usable config: the requested stream configuration is not supported by the device",
      "could not start the audio output stream: 0x88890004",
      "audio thread stopped unexpectedly",
    ]) {
      const notice = classifyAudioError(reason);
      expect(notice.kind, reason).toBe("generic");
      expect(notice.messageKey, reason).toBe("audioError.generic");
    }
  });

  // A bug report is worthless without the backend's own words, so the raw
  // string survives classification untouched in both directions.
  it("keeps the raw reason verbatim", () => {
    expect(classifyAudioError(DEVICE_IN_USE).reason).toBe(DEVICE_IN_USE);
    expect(classifyAudioError("no audio output device found").reason).toBe(
      "no audio output device found",
    );
  });

  it("treats an empty reason as generic rather than throwing", () => {
    expect(classifyAudioError("").kind).toBe("generic");
  });
});
