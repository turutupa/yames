import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./i18n";
import { applyStoredKeepTakes } from "./settings/takeDiagnostics";
import "./styles/fonts.css";
import "./styles/global.css";
import "./styles/session-narrative.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// "Keep my last Takes for troubleshooting", when the player turned it on.
void applyStoredKeepTakes();
