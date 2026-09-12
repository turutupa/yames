/**
 * Everything the phone's native half needs from the app's state, and
 * everything the app needs back from it.
 *
 * Three jobs, all of them one-way plumbing:
 *
 * 1. **The foreground service follows the transport.** Press play and Android
 *    is told a `mediaPlayback` service is running with this notification on
 *    it; press stop and it is torn down. Without that the process is a
 *    candidate for freezing or killing within minutes of the screen going off
 *    — the plan's §6 risk, and the reason M04 exists.
 * 2. **The screen stays awake when you are reading it hands-free.** Playing, a
 *    running drill, or zen mode. Not on the settings screen, which should go
 *    dark like any other screen.
 * 3. **The system's interruptions reach the transport.** A call takes audio
 *    focus; the click pauses and comes back when the call ends. Another app
 *    taking playback for good stops it and does not bring it back. The Stop
 *    button in the notification stops it too. And the Back gesture closes
 *    whatever is open rather than killing the app.
 *
 * Mounted only on a phone (`IS_MOBILE`), so none of `src/mobile/` reaches a
 * desktop bundle.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { setPlaying } from "../../../ipc";
import { dismissTop } from "../../../mobile/backStack";
import { keepAwake, listenToNative, setBackgroundAudio } from "../../../mobile/native";

interface Options {
  /** The engine's transport, as the backend reports it. */
  isPlaying: boolean;
  /** Shown in the notification, so it has to be the tempo actually sounding. */
  bpm: number;
  /** Playing, in zen, or running a drill — the hands-free screens. */
  keepScreenOn: boolean;
}

export function useAndroidNative({ isPlaying, bpm, keepScreenOn }: Options) {
  const { t } = useTranslation();

  // The event channel is opened once and lives for the app's lifetime, so its
  // handler must not close over a render's values. Refs, not dependencies.
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  /**
   * Whether the pause currently in effect is ours — we stood aside for
   * something the system let through, and mean to come back.
   *
   * Two things hang off it. First, only a pause we caused may be undone by
   * `focus_gained`: if the user pressed stop while a call was ringing, coming
   * back to a metronome that started itself would be worse than doing nothing.
   * Second, and this is what the emulator caught, the foreground service and
   * the focus request must *stay* while it is true. Tearing them down on the
   * way into a pause abandons audio focus, and an app that has abandoned focus
   * is never told it has it again — the click paused for the call and then sat
   * there after the caller hung up. Held in state as well as a ref because the
   * notification effect has to see it change; the ref is for the event channel,
   * whose handler is built once and must not read a stale render.
   */
  const [standingAside, setStandingAside] = useState(false);
  const standingAsideRef = useRef(false);
  const standAside = useCallback((value: boolean) => {
    standingAsideRef.current = value;
    setStandingAside(value);
  }, []);

  const stop = useCallback(() => {
    setPlaying(false).catch(() => {});
  }, []);

  useEffect(() => {
    listenToNative((event) => {
      switch (event.event) {
        case "back_pressed":
          // The Android side only sends this while something is open; if the
          // stack has emptied in between, there is nothing to do — it will not
          // ask again.
          dismissTop();
          break;
        case "stop_requested":
          standAside(false);
          stop();
          break;
        case "audio_interrupted":
          if (event.kind === "focus_lost") {
            if (isPlayingRef.current) {
              standAside(true);
              stop();
            }
          } else if (event.kind === "focus_gained") {
            if (standingAsideRef.current) {
              // Cleared by the effect below, when the backend confirms it is
              // playing again — not here. Clearing it on the way in leaves one
              // render where nothing is playing and nothing is standing aside,
              // and the service and the focus request are torn down and rebuilt
              // across it. Seventeen milliseconds is long enough for another app
              // to take the focus we just got back.
              setPlaying(true).catch(() => standAside(false));
            }
          } else {
            // Permanent: another app owns playback now. Let the service and
            // the focus request go with it.
            standAside(false);
            stop();
          }
          break;
      }
    }).catch(() => {});
    // Opened once. The plugin keeps one channel and replaces it if this ever
    // ran twice, so a double mount in React's strict mode is harmless.
  }, [stop, standAside]);

  // The notification. Re-sent when the words would change — which is when the
  // tempo changes or the user switches language mid-practice — and not
  // otherwise, so a tempo dialled while stopped does not talk to Android 40
  // times.
  const lastNotification = useRef<string | null>(null);
  useEffect(() => {
    // `standingAside` and not just `isPlaying`: see the comment on it. The
    // service outlives the pause so the focus request does too, which is the
    // only way the system will ever hand playback back.
    const live = isPlaying || standingAside;
    const text = {
      title: t("playback.notificationTitle"),
      body: isPlaying ? t("playback.notificationBody", { bpm }) : t("playback.notificationPaused"),
      stopLabel: t("playback.notificationStop"),
      channelName: t("playback.notificationChannel"),
    };
    const signature = live ? `on:${text.title}:${text.body}:${text.stopLabel}` : "off";
    if (signature === lastNotification.current) return;
    lastNotification.current = signature;
    setBackgroundAudio(live, text).catch(() => {});
  }, [isPlaying, standingAside, bpm, t]);

  // Playing again — by the resume above, or because the user pressed play
  // themselves while the click was standing aside.
  useEffect(() => {
    if (isPlaying) standAside(false);
  }, [isPlaying, standAside]);

  useEffect(() => {
    keepAwake(keepScreenOn).catch(() => {});
  }, [keepScreenOn]);
}
