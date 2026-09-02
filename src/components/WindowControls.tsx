import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import "../styles/window-controls.css";

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
        className="wc-btn wc-close"
        onClick={() => win.close()}
        aria-label="Close"
      />
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
    </div>
  );
}
