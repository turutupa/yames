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

import type { TakeSound } from "../jam/types";

/**
 * The promise has been read. One reading, for the life of the install.
 *
 * ONE key for the whole app and not one per mode (W32): what it promises is
 * about the machine — what is recorded, where it stays, that nothing is
 * uploaded — and a person who has read it on the Songs tab has read it. The
 * key keeps its `songs.` spelling because it is the one that is already on
 * disk, and moving it would ask everybody the question a second time.
 */
export const CAMERA_INTRO_KEY = "songs.cameraIntroSeen";

/** Which camera, by its `deviceId`. */
export const CAMERA_DEVICE_KEY = "songs.cameraDeviceId";

/** Which corner of the stage the preview sits in. */
export const CAMERA_CORNER_KEY = "songs.cameraCorner";

/** The framing guide has been seen once and does not come back. */
export const CAMERA_GUIDE_KEY = "songs.cameraGuideSeen";

/**
 * Whether a saved clip carries the Yames mark (W25, the owner's ask).
 *
 * ON by default and remembered, and its OWN switch rather than a part of the
 * verdict marks: they answer different questions. "Show the marks" is about
 * whether a player wants their mistakes painted on something they are about
 * to post; this is about whether the clip says where it was made, which is
 * the growth loop every shared clip is worth (`plans/ECHORA.md` D4) and not
 * something to bury inside another control's meaning.
 */
export const CLIP_BRAND_KEY = "songs.clipBrand";

/**
 * What a saved clip carries under the picture (W31): the tab, the marks
 * alone, or nothing.
 *
 * Remembered like the mark is, and for the same reason: a player who has
 * decided they do not want their mistakes painted on things they post should
 * not have to decide it again on the next take.
 */
export const CLIP_BAND_KEY = "songs.clipBand";

/**
 * The output device the player chose in settings, by cpal's name for it.
 *
 * NOT a camera key and not one this wave invented: it is the key
 * `useAudioOutputDevices` already saves the engine's output under. It is
 * spelled here so the review can point a media element at the SAME device
 * (`sink.ts`), and spelled out loud rather than inline for the reason every
 * other key in this file is — a store key written at two call sites is a
 * store key that ends up spelled two ways.
 */
export const AUDIO_OUTPUT_KEY = "audioOutputDevice";

/**
 * The nudge, per camera and per kind of recording.
 *
 * Per camera and not per take: the thing being corrected is the camera's own
 * capture latency, which is a property of that device and its driver and is
 * the same on Tuesday as it was on Monday. A player who lines up their webcam
 * once should never have to do it again — and a player who plugs in a capture
 * card gets a fresh zero for it rather than the webcam's number.
 *
 * **And per sound source (W32), because the two are not the same number.**
 * `plans/SONGS.md` A12 spells out why: a take of Yames and your input is
 * EARLY by the input buffer, and a take of everything this computer plays is
 * LATE by the output buffer. So the nudge that lines a clap up in one mode
 * lines it up wrong in the other, by the whole round trip, and a single
 * remembered number would silently carry one mode's answer into the other.
 * The owner will measure both — the clap procedure and its second form are
 * both written out in A12 — and this is where the two answers live.
 *
 * `yamesAndInput` keeps the key it has always had rather than gaining a
 * suffix, so a nudge measured before there was a choice is still the nudge
 * after it.
 */
export function cameraNudgeKey(deviceId: string | null, sound?: TakeSound): string {
  const base = `songs.cameraNudgeMs.${deviceId || "default"}`;
  return sound === "everything" ? `${base}.everything` : base;
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
