import { IS_MAC, IS_WINDOWS, IS_LINUX } from "../hotkeys";
import { AppMark } from "./AppMark";
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
 * The controls go where the platform puts them, which on Windows and Linux is
 * the right end of the strip. They were briefly left instead, on the stated
 * grounds that decorum hooks the native non-client area for the Windows 11
 * Snap Layout flyout and the revamp had no Windows machine to check the move
 * against. That reason does not survive reading the crate: on Windows
 * `create_overlay_titlebar()` calls `set_decorations(false)` and injects a
 * transparent drag strip, nothing more — the hit-test hook is not in this
 * version, and its own controls are Linux-only. There is no Snap Layout
 * integration on Windows to break, and left was only ever a placeholder.
 *
 * macOS renders none of this: the traffic lights are drawn by the OS over the
 * webview (`titleBarStyle: Overlay`), so the strip carries a left gutter there
 * to keep the wordmark out from under them.
 *
 * The whole strip is a drag region on the platforms where the frame is ours.
 * macOS keeps its decorations, so it drags itself — and marking it there
 * would fight the native titlebar rather than help it.
 */
export function TitleBar() {
  return (
    <div className="app-titlebar" {...(!IS_MAC && { "data-tauri-drag-region": "" })}>
      <AppMark />
      <span className="app-wordmark">yames</span>
      {(IS_WINDOWS || IS_LINUX) && <WindowControls />}
    </div>
  );
}
