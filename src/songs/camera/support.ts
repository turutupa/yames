/**
 * What this machine's webview can actually do with a camera.
 *
 * Three webviews, three answers, and none of them can be assumed from the
 * others (`plans/tasks/songs/W21-CAMERA.md` item 5):
 *
 * * **WebView2** (Windows) is Chromium. `getUserMedia` and `MediaRecorder`
 *   are both there and WebM/VP9 is the container it encodes.
 * * **WKWebView** (macOS) has both, and wants MP4 — `video/webm` is not
 *   something Safari's stack writes.
 * * **WebKitGTK** (Linux) VARIES BY BUILD. Some have `MediaRecorder` with
 *   audio only; some have none at all; some need the media-stream setting
 *   turned on before `navigator.mediaDevices` even exists.
 *
 * So nothing here asks which OS it is on. It asks the browser what it has, in
 * the order the answer is needed, and a webview that cannot record video says
 * so in a sentence the player can read instead of throwing at the moment they
 * press the switch.
 *
 * Pure and injectable: the whole of the environment arrives as an argument, so
 * every branch is a test rather than a platform.
 */

/** The container a recording ends up in — what `take_video.rs` accepts. */
export type CameraContainer = "mp4" | "webm";

/** Why the camera is not offered, when it is not. */
export type CameraBlocked = "noDevices" | "noRecorder" | "noContainer";

export type CameraSupport =
  | { ok: true; mimeType: string; container: CameraContainer }
  | { ok: false; reason: CameraBlocked };

/**
 * The containers this app will write, best first.
 *
 * MP4 ahead of WebM deliberately. Both play in every webview we ship on, but
 * an MP4 is a file a musician can drag into anything — a phone, a messaging
 * app, a video editor — and a WebM is a file half of those refuse. The picture
 * is the player's, and D4 will one day join it to the sound for sharing; the
 * one that is already shareable wins where both are available.
 *
 * VP9 before VP8 because VP9 at 720p is roughly half the bytes for the same
 * picture, and this file is an order of magnitude bigger than the take beside
 * it. The bare `video/webm` at the end is for a build that answers
 * `isTypeSupported` only for the container.
 */
const CANDIDATES: { mimeType: string; container: CameraContainer }[] = [
  { mimeType: "video/mp4;codecs=avc1", container: "mp4" },
  { mimeType: "video/mp4", container: "mp4" },
  { mimeType: "video/webm;codecs=vp9", container: "webm" },
  { mimeType: "video/webm;codecs=vp8", container: "webm" },
  { mimeType: "video/webm", container: "webm" },
];

/** Just enough of the browser to answer the question. */
export type CameraEnvironment = {
  mediaDevices?: { getUserMedia?: unknown; enumerateDevices?: unknown } | undefined;
  mediaRecorder?: { isTypeSupported?: (type: string) => boolean } | undefined;
};

/** The environment this build is running in. */
export function browserEnvironment(): CameraEnvironment {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  const recorder =
    typeof window === "undefined"
      ? undefined
      : (window as unknown as { MediaRecorder?: { isTypeSupported?: (t: string) => boolean } })
          .MediaRecorder;
  return {
    mediaDevices: nav?.mediaDevices as CameraEnvironment["mediaDevices"],
    mediaRecorder: recorder,
  };
}

/**
 * Can this webview record a picture, and as what?
 *
 * The order matters: a machine with no `mediaDevices` is told it has no
 * camera, not that it has no encoder, because "no camera" is the sentence
 * that is true for the overwhelming majority of the people who see it.
 */
export function cameraSupport(env: CameraEnvironment = browserEnvironment()): CameraSupport {
  if (!env.mediaDevices || typeof env.mediaDevices.getUserMedia !== "function") {
    return { ok: false, reason: "noDevices" };
  }
  const isSupported = env.mediaRecorder?.isTypeSupported;
  if (!env.mediaRecorder || typeof isSupported !== "function") {
    return { ok: false, reason: "noRecorder" };
  }
  for (const candidate of CANDIDATES) {
    let supported = false;
    try {
      supported = isSupported.call(env.mediaRecorder, candidate.mimeType) === true;
    } catch {
      // A build whose `isTypeSupported` throws on a type it has never heard
      // of. That is a "no" for this candidate and nothing more.
      supported = false;
    }
    if (supported) return { ok: true, mimeType: candidate.mimeType, container: candidate.container };
  }
  return { ok: false, reason: "noContainer" };
}

/**
 * What the camera is asked for (`W21-CAMERA.md` item 1): 720p at 30, and no
 * microphone, ever.
 *
 * Ideals rather than exact values, so a camera that cannot do 1280×720
 * negotiates down instead of refusing — a laptop webcam that only offers 4:3
 * is still a picture of somebody playing. The cap exists because the engine is
 * rendering a band while this encodes, and 1080p60 on a thin laptop is a fan
 * at full speed and a click that has to fight for its thread.
 *
 * **`audio` is absent and must stay absent.** The sound is the engine's take,
 * which is sample-exact against the click; the webview opening a second
 * microphone would be a second recording of the room, out of step with the
 * first, under a promise that only mentions one.
 */
export function cameraConstraints(deviceId: string | null): MediaStreamConstraints {
  return {
    audio: false,
    video: {
      width: { ideal: 1280, max: 1280 },
      height: { ideal: 720, max: 720 },
      frameRate: { ideal: 30, max: 30 },
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    },
  };
}

/** How often `MediaRecorder` is asked to hand a chunk over. */
export const CHUNK_MS = 1000;
