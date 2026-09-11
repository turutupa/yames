/**
 * The two screens `shots.html` cannot reach.
 *
 * M03-GAPS: "The mock backend's setters are no-ops, so nothing can be made
 * dirty" — the unsaved-changes dialog has no door in the screenshot harness —
 * and the instrument picker "only opens on first launch, and the harness's
 * store has an instrument set". Both were surveyed by reading the CSS rather
 * than photographed, which is how a `min-width: 480px` survived to M03c.
 *
 * So this page mounts the two components themselves, against the app's own
 * stylesheets and i18n. It is not part of the app: `vite build` is given
 * `index.html` as its only input, and nothing under `plans/` is imported by
 * anything in `src/`.
 *
 *   /plans/tasks/mobile/m03c/dialogs.html?which=unsaved
 *   /plans/tasks/mobile/m03c/dialogs.html?which=instrument
 */
import ReactDOM from "react-dom/client";
import "../../../../src/i18n";
import "../../../../src/styles/global.css";
import "../../../../src/styles/main-window.css";
import { applyTheme, getThemeById } from "../../../../src/themes";
import { UnsavedChangesDialog } from "../../../../src/components/UnsavedChangesDialog";
import { InstrumentPickerModal } from "../../../../src/components/InstrumentPickerModal";

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
