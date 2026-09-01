import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { storeLoad } from "./ipc";
import i18n from "./i18n";
import { MainWindow } from "./containers/main-window/MainWindow";
import { FloatingWidget } from "./containers/floating-widget/FloatingWidget";

function getWindowLabel(): string {
  // Tauri v2: window label is passed via URL search param or we detect by URL
  const params = new URLSearchParams(window.location.search);
  return params.get("window") || "main";
}

export default function App() {
  const [windowLabel] = useState(getWindowLabel);

  useEffect(() => {
    // Signal Rust that the frontend is ready. app_ready() sets the
    // final window position and calls show().
    invoke("app_ready").catch(console.error);
  }, []);

  useEffect(() => {
    // Apply the stored language preference once the settings store is ready.
    storeLoad<string>("language").then((l) => {
      if (l && i18n.hasResourceBundle(l, "translation")) i18n.changeLanguage(l);
    });
  }, []);

  useEffect(() => {
    // Prevent context menu in production
    if (!import.meta.env.DEV) {
      document.addEventListener("contextmenu", (e) => e.preventDefault());
    }
  }, []);

  if (windowLabel === "floating") {
    return <FloatingWidget />;
  }

  return <MainWindow />;
}
