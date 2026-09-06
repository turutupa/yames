import { useTranslation } from "react-i18next";
import type { Chain } from "../../types";

interface ChainSaveBarProps {
  chain: Chain;
  dirty: boolean;
  saveFeedback: boolean;
  onRename: () => void;
  onSave: () => void;
  onRevert: () => void;
}

/**
 * The context bar when a chain is loaded — the chain's half of what
 * `PresetSaveBar` does for a preset.
 *
 * A separate component rather than a mode of that one: the badge, the
 * vocabulary and the meaning of "revert" are all the chain's, and folding
 * them in would put a `if (chain)` branch through every line of a file whose
 * job is presets. What the two share is the shape, which the stylesheet
 * carries.
 *
 * The badge is what makes "chain" a precise word rather than a vague one
 * (U9.4): the name alone could be a preset, and the badge is the only thing
 * on screen that says the steps under it belong to it.
 */
export function ChainSaveBar({
  chain,
  dirty,
  saveFeedback,
  onRename,
  onSave,
  onRevert,
}: ChainSaveBarProps) {
  const { t } = useTranslation();
  return (
    <div className="preset-save-area chain-save-area">
      <button className="preset-active-name" onClick={onRename} title={t("chain.renameTooltip")}>
        {chain.name}
      </button>
      <span className="chain-badge">{t("chain.badge")}</span>

      {dirty && (
        <span className="preset-edited">
          <span className="preset-edited-dot" aria-hidden="true" />
          <span className="preset-edited-label">{t("chain.edited")}</span>
        </span>
      )}

      <button
        className={`preset-text-btn preset-text-btn--save ${
          saveFeedback ? "preset-text-btn--feedback" : ""
        }`}
        onClick={onSave}
        disabled={!dirty && !saveFeedback}
        title={dirty ? t("chain.saveTooltip") : t("chain.noChanges")}
      >
        <span className="preset-save-btn-label">
          {saveFeedback ? t("chain.saved") : dirty ? t("chain.save") : t("chain.noChanges")}
        </span>
      </button>

      {dirty && (
        <button
          className="preset-text-btn preset-text-btn--revert"
          onClick={onRevert}
          title={t("chain.revertTooltip")}
        >
          <span className="preset-save-btn-label">{t("chain.revert")}</span>
        </button>
      )}
    </div>
  );
}
