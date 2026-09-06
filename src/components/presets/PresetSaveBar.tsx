import { useTranslation } from "react-i18next";
import type { Preset } from "../../types";

interface PresetSaveBarProps {
  activePreset: Preset | null;
  presetDirty: boolean;
  updateFeedback: boolean;
  onRename: (presetId: string) => void;
  onUpdate: () => void;
  onSave: () => void;
  /** Reload the preset's stored values, dropping the edits. Optional so a
   *  mount that has nothing to revert to still works. */
  onRevert?: () => void;
}

/**
 * The left half of the context bar: which preset is loaded, whether it has
 * been edited, and the two things you can do about that.
 *
 * The name is the biggest text in the bar because it is the answer to "what
 * am I looking at". The dirty state used to be a bullet glued to the name;
 * it is now a pill that says "Edited", because a bullet is a symbol you have
 * to have been taught. Update and Revert appear only when there is something
 * to update or revert.
 *
 * With no preset loaded the bar degrades to the one affordance that still
 * makes sense — Save preset — which is also how the user gets their first one.
 *
 * Pure UI: the parent owns all state and provides the action callbacks.
 */
export function PresetSaveBar({
  activePreset,
  presetDirty,
  updateFeedback,
  onRename,
  onUpdate,
  onSave,
  onRevert,
}: PresetSaveBarProps) {
  const { t } = useTranslation();
  // `data-hint` anchors the `preset-suggest` hint (O7); the card itself is
  // rendered by MainWindow.
  return (
    <div className="preset-save-area" data-hint="preset-suggest">
      {activePreset ? (
        <>
          <button
            className="preset-active-name"
            onClick={() => onRename(activePreset.id)}
            title={t("presets.renameTooltip")}
          >
            {activePreset.name}
          </button>

          {presetDirty && (
            <span className="preset-edited">
              <span className="preset-edited-dot" aria-hidden="true" />
              <span className="preset-edited-label">{t("presets.edited")}</span>
            </span>
          )}

          <button
            className={`preset-text-btn preset-text-btn--save ${
              updateFeedback ? "preset-text-btn--feedback" : ""
            }`}
            onClick={onUpdate}
            disabled={!presetDirty && !updateFeedback}
            title={presetDirty ? t("presets.updateTooltip") : t("presets.noChangesToSave")}
          >
            {updateFeedback ? (
              <>
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span className="preset-save-btn-label">{t("presets.updated")}</span>
              </>
            ) : (
              <span className="preset-save-btn-label">
                {presetDirty ? t("presets.update") : t("presets.noChanges")}
              </span>
            )}
          </button>

          {presetDirty && onRevert && (
            <button
              className="preset-text-btn preset-text-btn--revert"
              onClick={onRevert}
              title={t("presets.revertTooltip")}
            >
              <span className="preset-save-btn-label">{t("presets.revert")}</span>
            </button>
          )}
        </>
      ) : (
        <button
          className="preset-save-btn preset-save-btn--save"
          onClick={onSave}
          title={t("presets.save")}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
          <span className="preset-save-btn-label">{t("presets.save")}</span>
        </button>
      )}
    </div>
  );
}
