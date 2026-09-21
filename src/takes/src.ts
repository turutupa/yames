/**
 * How a file on this machine becomes something a `<video>` can play.
 *
 * Takes have never needed this: the engine plays them, through the audio
 * device the player chose, and the webview never sees the file. A picture has
 * no such path — only the webview can decode video — so the take's directory
 * is exposed to the webview through Tauri's asset protocol, scoped in
 * `tauri.conf.json` to `takes/` and to nothing else.
 *
 * ## Why the mix is played here too
 *
 * `play_take` plays a take and stops it. It cannot seek, cannot loop a passage,
 * cannot run at half speed and reports no position — and the review with a
 * picture needs all four, on ONE clock shared with the video and the tape. So
 * when there is a picture the review plays the mix through an `<audio>` element
 * beside it. The shelf's own play button is unchanged and still goes through
 * the engine.
 *
 * The one real difference, and it is worth knowing: the engine plays out of the
 * output device the player picked in settings, and a media element plays out of
 * the system default. On a machine where those differ, the review's playback
 * comes out of a different speaker from the band.
 */
import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * A path, as a source a media element will load.
 *
 * A value that is ALREADY a URL is handed back untouched. That is not a
 * convenience: the screenshot harness runs in an ordinary browser with no
 * asset protocol behind it, and it hands the review a `blob:` URL for a
 * recording it made with Chromium's fake camera. Without this line the layout
 * suite would measure a review whose video element points at nothing, which is
 * exactly the state it exists to notice.
 */
export function mediaSrc(path: string): string {
  if (/^(blob:|data:|file:|https?:|asset:)/i.test(path)) return path;
  try {
    return convertFileSrc(path);
  } catch {
    return path;
  }
}
