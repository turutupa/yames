/**
 * What the camera remembers between sessions, and where.
 *
 * All of it in one file, like `jam/takes.ts` keeps `TAKES_INTRO_KEY`, because
 * a store key spelled out at its call site is a store key that gets spelled
 * differently at the second call site and silently forgets everything the
 * first one saved.
 *
 * Every one of these is an APP-wide setting rather than a per-song one. Which
 * camera you use, where you like the preview, whether you are left-handed and
 * whether you have read the promise are facts about the player and the room,
 * not about the piece. The switch itself is the exception and is not here: the
 * camera is on per song, beside Record the take, because whether you want to
 * be filmed is a decision about the thing you are about to play.
 */

/** The promise has been read. One reading, for the life of the install. */
export const CAMERA_INTRO_KEY = "songs.cameraIntroSeen";

/** Which camera, by its `deviceId`. */
export const CAMERA_DEVICE_KEY = "songs.cameraDeviceId";

/** Which corner of the stage the preview sits in. */
export const CAMERA_CORNER_KEY = "songs.cameraCorner";

/** The framing guide has been seen once and does not come back. */
export const CAMERA_GUIDE_KEY = "songs.cameraGuideSeen";

/**
 * The nudge, per camera.
 *
 * Per camera and not per take: the thing being corrected is the camera's own
 * capture latency, which is a property of that device and its driver and is
 * the same on Tuesday as it was on Monday. A player who lines up their webcam
 * once should never have to do it again — and a player who plugs in a capture
 * card gets a fresh zero for it rather than the webcam's number.
 */
export function cameraNudgeKey(deviceId: string | null): string {
  return `songs.cameraNudgeMs.${deviceId || "default"}`;
}

/** The nudge's step, in milliseconds. */
export const NUDGE_STEP_MS = 10;

/** As far as the nudge goes either way. A second is past any camera's latency. */
export const NUDGE_LIMIT_MS = 1000;

/**
 * How many beat events the clock fit keeps.
 *
 * A pass at 200 BPM with sixteenths under it is thirteen events a second, so
 * 512 is about forty seconds of the most event-dense music anybody practises.
 * Past that the oldest go: a fit over the whole of a twenty-minute take would
 * be a fit over a clock relationship that has had twenty minutes to drift.
 */
export const MAX_CLOCK_SAMPLES = 512;
