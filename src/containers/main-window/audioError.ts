/**
 * Turns the audio thread's raw failure string into something a guitarist can
 * act on.
 *
 * The classification lives here — in TypeScript, not in `engine.rs` — for
 * three reasons:
 *
 *  1. `AudioThreadExit::fail` runs on the audio thread (and from its `Drop`).
 *     AGENTS.md keeps that path as thin as it can be; formatting user-facing
 *     copy there buys nothing.
 *  2. Every user-facing string in this app is a locale key. Classifying in
 *     Rust would mean either shipping an untranslated sentence or duplicating
 *     the catalogue across the IPC boundary.
 *  3. It is a pure function of one string, which is the cheapest thing there
 *     is to unit-test.
 *
 * The raw reason is never thrown away — the caller keeps it for the tooltip
 * and for whatever ends up in a bug report.
 *
 * ## Why the hex code is a reliable marker
 *
 * The device-in-use string reaches us as, for example:
 *
 *     could not open the audio output stream: A backend-specific error has
 *     occurred: 0x8889000A
 *
 * cpal's WASAPI host formats the failure with `windows::core::Error`'s
 * `Display`, which ends in the `HRESULT`'s own `Display` — `{:#010X}`, i.e.
 * `0x8889000A`. Any human-readable half of that message comes from
 * `FormatMessageW` and is localised by Windows, so the hex is the only part
 * we can match on. `AUDCLNT_E_DEVICE_IN_USE` is accepted too, for the day a
 * backend spells it out.
 */

/** `AUDCLNT_E_DEVICE_IN_USE` — the endpoint is held in WASAPI exclusive mode. */
const DEVICE_IN_USE_MARKERS = ["0x8889000a", "audclnt_e_device_in_use"];

export type AudioErrorKind = "device-in-use" | "generic";

export type AudioErrorNotice = {
  kind: AudioErrorKind;
  /** Locale key for the sentence the user reads first. */
  messageKey: string;
  /**
   * The backend's own words, verbatim. Shown as a detail line for the
   * generic case, and kept as a tooltip in both — a bug report is worthless
   * without it.
   */
  reason: string;
};

/**
 * `reason` is the payload of the `audio-error` event.
 *
 * A device held in exclusive mode by another app — an amp sim, a DAW, a
 * conferencing tool — is the case worth naming: it is normal Windows
 * behaviour, it is the single most likely thing to happen to someone who
 * practises with AmpliTube open, and it has a remedy the app can point at
 * (Settings → Devices → Audio Output). Everything else gets an honest
 * "audio would not start" plus the backend's own reason, because guessing
 * would be worse than saying we do not know.
 */
export function classifyAudioError(reason: string): AudioErrorNotice {
  const haystack = reason.toLowerCase();
  const deviceInUse = DEVICE_IN_USE_MARKERS.some((m) => haystack.includes(m));
  return {
    kind: deviceInUse ? "device-in-use" : "generic",
    messageKey: deviceInUse ? "audioError.deviceInUse" : "audioError.generic",
    reason,
  };
}
