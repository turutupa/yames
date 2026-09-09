import { useTranslation } from "react-i18next";
import type { Setlist } from "../../types";

interface SetlistSaveBarProps {
  setlist: Setlist;
  dirty: boolean;
  saveFeedback: boolean;
  onRename: () => void;
  onSave: () => void;
  onRevert: () => void;
}

/**
 * The context bar when a setlist is loaded — the setlist's half of what
 * `PresetSaveBar` does for a preset.
 *
 * A separate component rather than a mode of that one: the badge, the
 * vocabulary and the meaning of "revert" are all the setlist's, and folding
 * them in would put a `if (setlist)` branch through every line of a file whose
 * job is presets. What the two share is the shape, which the stylesheet
 * carries.
 *
 * The badge is what makes "setlist" a precise word rather than a vague one
 * (U9.4): the name alone could be a preset, and the badge is the only thing
 * on screen that says the steps under it belong to it.
 */
export function SetlistSaveBar({
  setlist,
  dirty,
  saveFeedback,
  onRename,
  onSave,
  onRevert,
}: SetlistSaveBarProps) {
  const { t } = useTranslation();
  return (
    <div className="preset-save-area setlist-save-area">
      <button className="preset-active-name" onClick={onRename} title={t("setlist.renameTooltip")}>
        {setlist.name}
      </button>
      <span className="setlist-badge">{t("setlist.badge")}</span>

      {dirty && (
        <span className="preset-edited">
          <span className="preset-edited-dot" aria-hidden="true" />
          <span className="preset-edited-label">{t("setlist.edited")}</span>
        </span>
      )}

      <button
        className={`preset-text-btn preset-text-btn--save ${
          saveFeedback ? "preset-text-btn--feedback" : ""
        }`}
        onClick={onSave}
        disabled={!dirty && !saveFeedback}
        title={dirty ? t("setlist.saveTooltip") : t("setlist.noChanges")}
      >
        <span className="preset-save-btn-label">
          {saveFeedback ? t("setlist.saved") : dirty ? t("setlist.save") : t("setlist.noChanges")}
        </span>
      </button>

      {dirty && (
        <button
          className="preset-text-btn preset-text-btn--revert"
          onClick={onRevert}
          title={t("setlist.revertTooltip")}
        >
          <span className="preset-save-btn-label">{t("setlist.revert")}</span>
        </button>
      )}
    </div>
  );
}
