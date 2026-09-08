import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import "../styles/window-controls.css";

/**
 * Our own minimise / maximise / close, for the platforms where the frame is
 * ours — decorum turns the native one off on Windows and Linux.
 *
 * The order is the platform's rather than a preference: minimise, maximise,
 * close, with close last so it lands in the window's top-right corner. It used
 * to be close-first at the left end of the strip, which is neither the Windows
 * order nor the macOS one, and it put quit-the-app where other windows put
 * minimise.
 */
export function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);
  const win = getCurrentWindow();

  useEffect(() => {
    win.isMaximized().then(setIsMaximized);
    const unlistenPromise = win.onResized(async () => {
      setIsMaximized(await win.isMaximized());
    });
    return () => {
      unlistenPromise.then((f) => f());
    };
  }, []);

  return (
    <div className="window-controls">
      <button
        className="wc-btn wc-minimize"
        onClick={() => win.minimize()}
        aria-label="Minimize"
      />
      <button
        className="wc-btn wc-maximize"
        onClick={() => win.toggleMaximize()}
        aria-label={isMaximized ? "Restore" : "Maximize"}
        data-maximized={isMaximized}
      />
      <button
        className="wc-btn wc-close"
        onClick={() => win.close()}
        aria-label="Close"
      />
    </div>
  );
}
