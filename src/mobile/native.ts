/**
 * The phone's own half of Yames, from the frontend's side.
 *
 * Everything here talks to the `yames-mobile` Tauri plugin
 * (`src-tauri/plugins/yames-mobile`), which exists because a webview on
 * Android cannot: keep a process alive with the screen off, take audio focus,
 * keep the screen awake, answer the system Back gesture, or hand a link to the
 * browser.
 *
 * Nothing in this file is reachable from a desktop build — every call site is
 * behind `IS_MOBILE`, so Rollup drops the module and the plugin's command
 * names never reach `dist/`.
 */
import { Channel, invoke } from "@tauri-apps/api/core";

const PLUGIN = "yames-mobile";

/** The notification's words, already translated by the caller. */
export interface PlaybackNotification {
  /** Title row, e.g. "Yames". */
  title: string;
  /** Body row, e.g. "Playing — 120 BPM". */
  body: string;
  /** The stop action's label. */
  stopLabel: string;
  /** The channel's name as Android's own settings shows it. */
  channelName: string;
}

/**
 * Start or stop the foreground service that keeps the click alive, and with it
 * the audio-focus request.
 *
 * Calling it again while active replaces the notification's text rather than
 * adding a second one — which is how the tempo in the shade stays honest.
 */
export function setBackgroundAudio(
  active: boolean,
  text: PlaybackNotification,
): Promise<void> {
  return invoke(`plugin:${PLUGIN}|set_background_audio`, {
    payload: { active, ...text },
  });
}

/** `FLAG_KEEP_SCREEN_ON`, for the screens you read with both hands busy. */
export function keepAwake(active: boolean): Promise<void> {
  return invoke(`plugin:${PLUGIN}|keep_awake`, { payload: { active } });
}

/** `Intent.ACTION_VIEW`. http and https only. */
export function openUrlNative(url: string): Promise<void> {
  return invoke(`plugin:${PLUGIN}|open_url`, { payload: { url } });
}

/**
 * Tell the Android side whether the app currently has something open that Back
 * should close.
 *
 * When it does not, Back sends the app to the background immediately — no
 * round trip, no wait, and the click keeps going. When it does, the Android
 * side raises `back_pressed` and leaves the decision here. `backStack.ts`
 * keeps this in sync; nothing else should call it.
 */
export function setBackIntercept(active: boolean): Promise<void> {
  return invoke(`plugin:${PLUGIN}|set_back_intercept`, { payload: { active } });
}

/**
 * What the system did to us.
 *
 * `focus_lost` is the transient one — a call, a navigation prompt, a timer
 * going off. Pause, and expect `focus_gained`. `focus_lost_permanently` is
 * another app taking over playback for good: stop, and do not come back on
 * your own.
 */
export type AudioInterruption =
  | "focus_lost"
  | "focus_gained"
  | "focus_lost_permanently";

/**
 * Where the system bars are, in CSS pixels.
 *
 * The web platform's own answer — `env(safe-area-inset-*)` — describes the
 * display cutout and not the system bars, so on Android it reports the camera
 * cut-out at the top and **nothing at all** at the bottom, where the gesture
 * pill is. The Android side measures the bars properly and sends them here;
 * `useAndroidNative` writes them into the `--safe-*` tokens the stylesheets
 * already pad with. Desktop and the screenshot harness keep the `env()`
 * fallback and never see one of these.
 */
export interface WindowInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type NativeEvent =
  | { event: "audio_interrupted"; kind: AudioInterruption }
  | { event: "back_pressed" }
  | { event: "stop_requested" }
  /**
   * The activity came back to the screen, or left it (`onResume` / `onStop`).
   * What listens is `bandMemory.ts`: out of sight and stopped is when the
   * decoded band is allowed to go.
   */
  | { event: "app_visible"; visible: boolean }
  /**
   * `ComponentCallbacks2.onTrimMemory`, with Android's own level. 20 and
   * above mean the app's UI is gone; 10 and 15 mean the phone is short of
   * memory while the app is still on screen.
   */
  | { event: "memory_trim"; level: number }
  | ({ event: "window_insets" } & WindowInsets);

/**
 * Open the one channel every Android-side event arrives on.
 *
 * One channel rather than three subscriptions: the events are rare, the
 * handler is a switch, and the plugin's surface stays at one command instead
 * of a register/unregister pair per event.
 */
export function listenToNative(handler: (event: NativeEvent) => void): Promise<void> {
  const channel = new Channel<NativeEvent>();
  channel.onmessage = handler;
  return invoke(`plugin:${PLUGIN}|set_event_channel`, { channel });
}
