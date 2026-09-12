/**
 * The two screens `shots.html` cannot reach.
 *
 * M03-GAPS: "The mock backend's setters are no-ops, so nothing can be made
 * dirty" — the unsaved-changes dialog has no door in the screenshot harness —
 * and the instrument picker "only opens on first launch, and the harness's
 * store has an instrument set". Both were surveyed by reading the CSS rather
 * than photographed originally, which is how a `min-width: 480px` survived
 * to M03c. This page (M03c, moved here by M03e so `mobile-shots.mjs` is the
 * one tool for both) mounts the two components themselves, against the app's
 * own stylesheets and i18n. It is not part of the app: `vite build` is given
 * `index.html` as its only input, so nothing here reaches a release, same as
 * `shots.html` and `main.tsx` next to it.
 *
 *   /src/shots/dialogs.html?which=unsaved
 *   /src/shots/dialogs.html?which=instrument
 */
import ReactDOM from "react-dom/client";
import "../i18n";
import "../styles/global.css";
import "../styles/main-window.css";
import { applyTheme, getThemeById } from "../themes";
import { UnsavedChangesDialog } from "../components/UnsavedChangesDialog";
import { InstrumentPickerModal } from "../components/InstrumentPickerModal";

const params = new URLSearchParams(window.location.search);
applyTheme(getThemeById(params.get("theme") ?? "mono"));
document.body.style.background = "var(--bg-primary)";

const which = params.get("which") ?? "unsaved";
const noop = () => {};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  which === "instrument" ? (
    <InstrumentPickerModal onPick={noop} onDismiss={noop} />
  ) : (
    // A name long enough to be realistic — the dialog quotes it in the body.
    <UnsavedChangesDialog
      name="Daily routine"
      onSave={noop}
      onDiscard={noop}
      onCancel={noop}
    />
  ),
);
