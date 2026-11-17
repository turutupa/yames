/**
 * WHEN THE BAND IS ALLOWED TO COST A PHONE ANYTHING.
 *
 * A decoded band is tens of megabytes: recorded drums, a recorded bass, a
 * recorded piano, all of them interleaved stereo `f32` at the device's rate.
 * On a laptop that is free. On a phone it is the difference between an app
 * that is still there when the musician comes back to it and one Android
 * killed while it was out of sight — M08 measured 455 MB, and the biggest
 * backgrounded process is the first one to go.
 *
 * So the band sleeps. Out of sight and not playing for `SLEEP_AFTER_MS`, or
 * the system saying it is short of memory right now, and the loaded table and
 * every decode behind it are let go (`release_jam_sounds`). Coming back to
 * the app wakes it: the jam on screen is sent again and the band is back
 * within a decode.
 *
 * **Never while the band is playing.** Every path here checks the transport,
 * and the Rust side checks it again under the engine's own lock, so a Play
 * that lands in between cannot be taken apart underneath.
 *
 * Only reachable on a phone: the one caller is behind `IS_MOBILE`, so Rollup
 * drops this module and `release_jam_sounds` never reaches a desktop bundle.
 */
import { useEffect, useState } from "react";
import { releaseJamSounds } from "../ipc";

/**
 * How long the app has to be out of sight before the band is let go.
 *
 * Thirty seconds, not zero: glancing at a message and coming straight back is
 * the common case, and a re-decode for that would be a spinner the musician
 * did nothing to earn. Thirty seconds is also well inside the window where a
 * phone that is short of memory starts looking at background processes.
 */
export const SLEEP_AFTER_MS = 30_000;

/**
 * `ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW` and `..._RUNNING_CRITICAL` —
 * the system telling a FOREGROUND app that it is running out now. Those two
 * do not wait for the timer.
 */
const TRIM_RUNNING_LOW = 10;
const TRIM_RUNNING_CRITICAL = 15;

/** `TRIM_MEMORY_UI_HIDDEN`: the app's own UI is gone from the screen. */
const TRIM_UI_HIDDEN = 20;

type Listener = () => void;

/** What the Android side last said, and who is waiting to hear it change. */
let visible = true;
let urgent = false;
const listeners = new Set<Listener>();

function announce() {
  for (const listener of [...listeners]) listener();
}

/** `onResume` / `onStop` on the Android side. Nothing else calls this. */
export function appVisibilityChanged(nowVisible: boolean): void {
  if (nowVisible === visible) return;
  visible = nowVisible;
  if (nowVisible) urgent = false;
  announce();
}

/**
 * `onTrimMemory`. The level is Android's own scale: `UI_HIDDEN` and above
 * mean the app is out of sight, and `RUNNING_LOW` / `RUNNING_CRITICAL` mean
 * the phone needs the memory back while the app is still on screen.
 */
export function memoryTrimmed(level: number): void {
  if (level === TRIM_RUNNING_LOW || level === TRIM_RUNNING_CRITICAL) {
    urgent = true;
    announce();
    return;
  }
  if (level >= TRIM_UI_HIDDEN) appVisibilityChanged(false);
}

/** Tests only: put the module back the way it starts. */
export function resetBandMemory(): void {
  visible = true;
  urgent = false;
  listeners.clear();
}

/**
 * Whether the band should be asleep right now.
 *
 * `true` means "the engine is holding nothing and every decode has been let
 * go" — `useJamSession` reads it as a reason not to send, and the moment it
 * goes back to `false` the jam on screen is sent again.
 *
 * The release is fired from here rather than from the caller so there is
 * exactly one place that decides, and it is the same place that reports it.
 */
export function useBandSleep(isPlaying: boolean): boolean {
  const [asleep, setAsleep] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cancel = () => {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
    };
    const release = () => {
      cancel();
      setAsleep(true);
      releaseJamSounds().catch(() => {
        // Nothing was let go, so nothing has to come back. Awake is the safe
        // end of this: the band plays, and the phone keeps holding it.
        setAsleep(false);
      });
    };
    const sync = () => {
      // Back on screen, or playing. Playing out of sight is the screen-off
      // practice session M04 exists for, and nothing is taken from it: the
      // transport is checked here and again in Rust under the engine's own
      // lock, so a Play that lands mid-release is refused rather than raced.
      if (visible || isPlaying) {
        cancel();
        setAsleep(false);
        return;
      }
      if (urgent) return release();
      if (timer === null) timer = setTimeout(release, SLEEP_AFTER_MS);
    };
    listeners.add(sync);
    sync();
    return () => {
      listeners.delete(sync);
      cancel();
    };
  }, [isPlaying]);

  return asleep;
}
