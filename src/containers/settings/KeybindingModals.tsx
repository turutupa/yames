import { Trans, useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { HOTKEYS } from "../../hotkeys";

export type BindingTarget = {
  id: string;
  type: "key" | "global";
};

export type PendingKeyConflict = {
  combo: string;
  conflictAction: string;
  targetAction: string;
  type: "key" | "global";
};

/** Resolve a hotkey action id to its localized display label. */
const actionLabel = (id: string, t: TFunction) => {
  const hk = HOTKEYS.find((h) => h.id === id);
  return hk ? t(`settings.hotkeys.actions.${hk.id}`) : id;
};

export type MidiConflict = {
  activity: { type: string; number: number; channel: number };
  existingBinding: { action: string };
  targetAction: string;
};

/** "Reset all keybindings?" confirmation overlay. */
export function ResetKeybindingsConfirm({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="keybinding-overlay" onClick={onCancel}>
      <div className="keybinding-capture" onClick={(e) => e.stopPropagation()}>
        <span className="keybinding-capture-title">{t("keybindings.resetTitle")}</span>
        <div className="keybinding-capture-display">
          <span className="keybinding-capture-waiting">
            {t("keybindings.resetBody")}
          </span>
        </div>
        <div className="keybinding-capture-actions">
          <button className="keybinding-btn-reset" onClick={onConfirm}>
            {t("keybindings.resetConfirm")}
          </button>
          <button className="keybinding-btn-remove" onClick={onCancel}>
            {t("keybindings.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** MIDI conflict overlay shown when a MIDI signal is already bound to another action. */
export function MidiConflictDialog({
  conflict,
  autoAccept,
  onAutoAcceptChange,
  onAccept,
  onReject,
}: {
  conflict: MidiConflict;
  autoAccept: boolean;
  onAutoAcceptChange: (next: boolean) => void;
  onAccept: () => void;
  onReject: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="keybinding-overlay" onClick={onReject}>
      <div className="keybinding-capture" onClick={(e) => e.stopPropagation()}>
        <span className="keybinding-capture-title">{t("keybindings.midiConflictTitle")}</span>
        <div className="conflict-body">
          <div className="conflict-signal">
            <span className="conflict-signal-badge">
              {conflict.activity.type.toUpperCase()} #{conflict.activity.number}
            </span>
            <span className="conflict-signal-detail">
              Ch{conflict.activity.channel}
            </span>
          </div>
          <p className="conflict-message">
            <Trans
              i18nKey="keybindings.conflictBody"
              values={{
                existing: actionLabel(conflict.existingBinding.action, t),
                target: actionLabel(conflict.targetAction, t),
              }}
              components={{ strong: <strong />, br: <br /> }}
            />
          </p>
        </div>
        <div className="keybinding-capture-actions">
          <button className="keybinding-btn-reset" onClick={onReject}>
            {t("keybindings.cancel")}
          </button>
          <button className="conflict-accept-btn" onClick={onAccept}>
            {t("keybindings.overwrite")}
          </button>
        </div>
        <label className="conflict-dont-ask">
          <input
            type="checkbox"
            checked={autoAccept}
            onChange={(e) => onAutoAcceptChange(e.target.checked)}
          />
          {t("keybindings.dontAskAgain")}
        </label>
      </div>
    </div>
  );
}

/**
 * Keybinding capture overlay — handles both the "press a key" capture state
 * and the hotkey-conflict resolution state. Renders one or the other based on
 * whether a conflict is pending.
 */
export function KeybindingCaptureModal({
  target,
  pendingKeys,
  pendingKeyConflict,
  onDismiss,
  onResetToDefault,
  onRemove,
  onAcceptConflict,
  onRejectConflict,
}: {
  target: BindingTarget;
  pendingKeys: string;
  pendingKeyConflict: PendingKeyConflict | null;
  onDismiss: () => void;
  onResetToDefault: () => void;
  onRemove: () => void;
  onAcceptConflict: () => void;
  onRejectConflict: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="keybinding-overlay" onClick={onDismiss}>
      <div className="keybinding-capture" onClick={(e) => e.stopPropagation()}>
        {pendingKeyConflict ? (
          <>
            <span className="keybinding-capture-title">{t("keybindings.hotkeyConflictTitle")}</span>
            <div className="conflict-body">
              <div className="conflict-signal">
                <span className="conflict-signal-badge">{pendingKeyConflict.combo}</span>
              </div>
              <p className="conflict-message">
                <Trans
                  i18nKey="keybindings.conflictBody"
                  values={{
                    existing: actionLabel(pendingKeyConflict.conflictAction, t),
                    target: actionLabel(pendingKeyConflict.targetAction, t),
                  }}
                  components={{ strong: <strong />, br: <br /> }}
                />
              </p>
            </div>
            <div className="keybinding-capture-actions">
              <button className="keybinding-btn-reset" onClick={onRejectConflict}>
                {t("keybindings.cancel")}
              </button>
              <button className="conflict-accept-btn" onClick={onAcceptConflict}>
                {t("keybindings.overwrite")}
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="keybinding-capture-title">
              {t("keybindings.captureTitle", {
                action: actionLabel(target.id, t),
                type: t(target.type === "key" ? "keybindings.keyboard" : "keybindings.global"),
              })}
            </span>
            <div className="keybinding-capture-display">
              {pendingKeys ? (
                <span className="keybinding-capture-keys">{pendingKeys}</span>
              ) : (
                <span className="keybinding-capture-waiting">
                  {t("keybindings.pressKeys")}
                </span>
              )}
            </div>
            <div className="keybinding-capture-actions">
              <button className="keybinding-btn-reset" onClick={onResetToDefault}>
                {t("keybindings.resetToDefault")}
              </button>
              <button className="keybinding-btn-remove" onClick={onRemove}>
                {t("keybindings.remove")}
              </button>
            </div>
            <span className="keybinding-capture-hint">
              {t("keybindings.escapeHint")}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
