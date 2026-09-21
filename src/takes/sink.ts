/**
 * Which speaker the review plays out of.
 *
 * `W21-CAMERA.md` left this as a known, stated cost and `src.ts`'s header
 * still says it: the engine plays a take through the output device the player
 * picked in settings, and a media element plays through the SYSTEM default. On
 * a machine where those differ — which is every machine with an interface, and
 * that is most of the people this app is for — the review's playback came out
 * of a different speaker from the band they had just been playing with. W25
 * item 6 is fixing it.
 *
 * ## Two namespaces, one device, and a name is all they share
 *
 * The engine's device is cpal's: a NAME, stored as `audioOutputDevice`, and
 * that is the whole of what Rust knows about it. A media element's device is
 * `setSinkId`'s: an opaque `deviceId` from `enumerateDevices()`, scoped to the
 * page's origin and meaningless anywhere else. Nothing joins them but the
 * label the operating system puts on both, so this file is that join and is
 * honest about being a match rather than a lookup.
 *
 * And the match can simply fail, in two ways that are worth telling apart:
 *
 * * **The webview has no `setSinkId`.** WKWebView does not, and some
 *   WebKitGTK builds do not. Nothing to be done and nothing to promise.
 * * **The labels are empty.** `enumerateDevices()` hides them until the page
 *   has been given a camera or a microphone, so a player who has never turned
 *   the camera on has a list of blank names to match against.
 *
 * Either way the review says which speaker it is using instead of quietly
 * playing out of the wrong one, which is the whole point.
 */

/** What became of the attempt to follow the player's chosen output. */
export type SinkState =
  /** Playing out of the device chosen in settings. */
  | { kind: "following"; label: string }
  /** The player has chosen nothing, so the default IS their choice. */
  | { kind: "systemDefault" }
  /** Chosen, but not reachable from here — and this says which of the two. */
  | { kind: "unmatched"; wanted: string }
  | { kind: "unsupported"; wanted: string };

/** Just enough of a device for the match. `MediaDeviceInfo`'s two fields. */
export type SinkDevice = { deviceId: string; kind: string; label: string };

/**
 * Tidy a device name for comparison.
 *
 * cpal and the webview describe the same box in the same words and not
 * always in the same punctuation: "Speakers (UMC204HD 192k)" against
 * "UMC204HD 192k", "Headphones (2- Realtek(R) Audio)" against "Realtek(R)
 * Audio". Case, brackets, runs of space and a leading enumeration prefix like
 * "2- " all go, which leaves the part a person would read out.
 */
function tidy(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(|\)/g, " ")
    .replace(/\b\d+-\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The `deviceId` for the output the player chose, or null.
 *
 * Exact first, then either name containing the other — because the webview's
 * label is usually the OS's long form of cpal's short one, and occasionally
 * the other way round. Never a fuzzy score: a wrong match here means the
 * review plays out of a speaker the player did not choose and believes it
 * followed them, which is worse than saying it could not.
 */
export function matchSink(devices: readonly SinkDevice[], wanted: string): SinkDevice | null {
  const outputs = devices.filter((device) => device.kind === "audiooutput" && device.label);
  if (outputs.length === 0 || !wanted.trim()) return null;
  const want = tidy(wanted);

  const exact = outputs.find((device) => tidy(device.label) === want);
  if (exact) return exact;

  // Longest first, so "Realtek(R) Audio" wins over a "Realtek" that is a
  // prefix of three different boxes.
  const contained = outputs
    .filter((device) => {
      const label = tidy(device.label);
      return label.includes(want) || want.includes(label);
    })
    .sort((a, b) => tidy(b.label).length - tidy(a.label).length);
  return contained[0] ?? null;
}

/** Does this element take a `setSinkId` at all? */
export function canSetSink(element: unknown): boolean {
  return typeof (element as { setSinkId?: unknown } | null)?.setSinkId === "function";
}

/**
 * Point one media element at the player's chosen output.
 *
 * Never throws: every way this can fail is a state the review says out loud,
 * and none of them is a reason to stop playing a take.
 */
export async function followChosenOutput(args: {
  element: HTMLMediaElement;
  /** The name the engine was given, or null when the player chose nothing. */
  wanted: string | null;
  /** `navigator.mediaDevices.enumerateDevices`, injected so it can be tested. */
  enumerate: () => Promise<SinkDevice[]>;
}): Promise<SinkState> {
  const { element, wanted, enumerate } = args;
  if (!wanted || !wanted.trim()) return { kind: "systemDefault" };
  if (!canSetSink(element)) return { kind: "unsupported", wanted };

  let devices: SinkDevice[] = [];
  try {
    devices = await enumerate();
  } catch {
    return { kind: "unmatched", wanted };
  }
  const found = matchSink(devices, wanted);
  if (!found) return { kind: "unmatched", wanted };

  try {
    await (element as HTMLMediaElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(
      found.deviceId,
    );
  } catch {
    // The device went away between the enumeration and the call, or the
    // webview refused it. The element is still playing, out of the default.
    return { kind: "unmatched", wanted };
  }
  return { kind: "following", label: found.label };
}
