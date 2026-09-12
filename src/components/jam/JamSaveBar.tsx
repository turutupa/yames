import { useTranslation } from "react-i18next";
import type { Jam } from "../../jam/types";

interface JamSaveBarProps {
  jam: Jam;
  dirty: boolean;
  saveFeedback: boolean;
  onRename: () => void;
  onSave: () => void;
  onRevert: () => void;
}

/**
 * The context bar when a jam is loaded — the jam's half of what
 * `PresetSaveBar` does for a preset and `SetlistSaveBar` does for a setlist.
 *
 * A third component rather than a mode of either, for the reason the setlist
 * one gives: the badge and the vocabulary are this object's, and folding them
 * in would run an `if (jam)` through every line of a file whose job is
 * something else. What the three share is the shape, and the shape lives in
 * the stylesheet.
 */
export function JamSaveBar({
  jam,
  dirty,
  saveFeedback,
  onRename,
  onSave,
  onRevert,
}: JamSaveBarProps) {
  const { t } = useTranslation();
  return (
    <div className="preset-save-area setlist-save-area jam-save-area">
      <button className="preset-active-name" onClick={onRename} title={t("jam.renameTooltip")}>
        {jam.name}
      </button>
      <span className="setlist-badge jam-badge">{t("jam.badge")}</span>

      {dirty && (
        <span className="preset-edited">
          <span className="preset-edited-dot" aria-hidden="true" />
          <span className="preset-edited-label">{t("jam.edited")}</span>
        </span>
      )}

      <button
        className={`preset-text-btn preset-text-btn--save ${
          saveFeedback ? "preset-text-btn--feedback" : ""
        }`}
        onClick={onSave}
        disabled={!dirty && !saveFeedback}
        title={dirty ? t("jam.saveTooltip") : t("jam.noChanges")}
      >
        <span className="preset-save-btn-label">
          {saveFeedback ? t("jam.saved") : dirty ? t("jam.save") : t("jam.noChanges")}
        </span>
      </button>

      {dirty && (
        <button
          className="preset-text-btn preset-text-btn--revert"
          onClick={onRevert}
          title={t("jam.revertTooltip")}
        >
          <span className="preset-save-btn-label">{t("jam.revert")}</span>
        </button>
      )}
    </div>
  );
}
