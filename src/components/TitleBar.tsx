import { IS_MAC, IS_WINDOWS, IS_LINUX } from "../hotkeys";
import { WindowControls } from "./WindowControls";

/**
 * The window's own strip: the mark, the wordmark, and the room the platform's
 * controls take.
 *
 * Before this the app had no titlebar at all. The window controls floated at
 * the top-left over the rail and the rail reserved 42px of empty padding for
 * them, so the app's name appeared nowhere in its own window — the mockups
 * put a mark and "yames" there, and a window that never says what it is is a
 * window you cannot identify in a screenshot or a bug report.
 *
 * Two things about it are deliberately not the mockup:
 *
 *  - The controls stay on the left. The mockup draws them right, which is the
 *    Windows convention, but decorum hooks the native non-client area for the
 *    Snap Layout flyout and this revamp does not have a Windows machine in
 *    front of it to check that moving them keeps working. Left is where they
 *    are today and where macOS puts them anyway; the wordmark sits after them
 *    rather than before.
 *  - Which is why the strip carries a platform gutter. On macOS the traffic
 *    lights are drawn by the OS over the webview (`titleBarStyle: Overlay`),
 *    so nothing renders here and the padding is what stops the wordmark from
 *    sitting under them.
 *
 * The whole strip is a drag region on the platforms where the frame is ours.
 * macOS keeps its decorations, so it drags itself — and marking it there
 * would fight the native titlebar rather than help it.
 */
export function TitleBar() {
  return (
    <div className="app-titlebar" {...(!IS_MAC && { "data-tauri-drag-region": "" })}>
      {(IS_WINDOWS || IS_LINUX) && <WindowControls />}
      <span className="app-mark" aria-hidden="true" />
      <span className="app-wordmark">yames</span>
    </div>
  );
}
