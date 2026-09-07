import { useTranslation } from "react-i18next";
import { setAccentMode } from "../../ipc";
import type { AppState } from "../../types";

type Mode = AppState["accentMode"];

const MODES: { id: Mode; labelKey: string }[] = [
  { id: "groups", labelKey: "metronome.accent.groups" },
  { id: "all", labelKey: "metronome.accent.all" },
  { id: "none", labelKey: "metronome.accent.none" },
];

/**
 * Which beats the click accents (UI_DECISIONS U2.3).
 *
 * The artboard drew this from the start and it went unbuilt for a long time,
 * because two of its three states had nothing behind them: the engine accented
 * where beat groups opened and nowhere else, and the only way to hear a bar
 * without accents was to give up the grouping entirely by switching to FREE.
 * Both are the engine's now — `AccentMode` in `engine.rs` — so the control
 * says what it does.
 *
 * "Groups" is the default and is what a meter means: 7/8 as 3+2+2 is three
 * accents, and that is the whole reason the grouping is worth choosing. The
 * other two are for practising against a bar you can already feel — flat
 * pulses, or nothing but time.
 */
export function AccentControl({ mode }: { mode: Mode }) {
  const { t } = useTranslation();
  // A state persisted before this existed carries no `accentMode`, and Rust's
  // serde default only fills it on the way out — a store written by an older
  // build reaches the first render without it. Falling back here means the
  // control never renders with nothing selected, which would read as broken.
  const current: Mode = mode ?? "groups";

  return (
    <div className="accent-control" role="group" aria-label={t("metronome.accent.label")}>
      <span className="stage-label accent-label">{t("metronome.accent.label")}</span>
      <div className="accent-options">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`accent-option${current === m.id ? " active" : ""}`}
            aria-pressed={current === m.id}
            // No `notifySettingsChange()`: useSession watches the metronome's
            // settings and fires ONE debounced coach boundary for a burst of
            // changes, which is what a player flicking between these makes.
            onClick={() => void setAccentMode(m.id)}
          >
            {t(m.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
