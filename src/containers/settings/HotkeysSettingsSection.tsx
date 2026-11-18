import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import {
  HOTKEYS,
  HOTKEY_GROUPS,
  platformKey,
} from "../../hotkeys";
import { formatGamepadButton, isGamepadBinding } from "../../hooks/useGamepad";
import type { UseMidiReturn } from "../../hooks/useMidi";
import type { BindingTarget } from "./KeybindingModals";

type Bindings = Record<string, string>;

const KeyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M6 16h12" />
  </svg>
);

const MidiIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

/**
 * Hotkeys section — renders all hotkey groups, each with a binding table
 * (Key / MIDI or footswitch). The "Global" column (system-wide shortcuts) is
 * not drawn: nothing registers those yet, so it was a column of disabled
 * dashes under a "SOON" badge nobody could act on (UX audit SET-4). The
 * bindings are still loaded and saved by `useKeybindings`; only the column
 * is gone, and it comes back when the feature does. Includes the "Test inputs" toggle and the
 * "Reset to defaults" button. Pure UI; capture/binding state lives in the
 * parent.
 *
 * `readOnly` (O8) turns the same table into the Help → Keyboard shortcuts
 * sheet: identical rows, nothing clickable, no test/reset affordances. Reusing
 * the component rather than a second table is the point — a shortcut added to
 * `HOTKEYS` shows up in both places or neither. The edit-only props are
 * optional so a read-only host does not have to fabricate capture state.
 */
export function HotkeysSettingsSection({
  keyBindings,
  footBindings,
  bindingFor,
  setBindingFor,
  setPendingKeys,
  inputTestMode,
  setInputTestMode,
  midi,
  onResetRequest,
  readOnly = false,
}: {
  keyBindings: Bindings;
  globalBindings: Bindings;
  footBindings: Bindings;
  bindingFor?: BindingTarget | null;
  setBindingFor?: Dispatch<SetStateAction<BindingTarget | null>>;
  setPendingKeys?: Dispatch<SetStateAction<string>>;
  inputTestMode?: boolean;
  setInputTestMode?: Dispatch<SetStateAction<boolean>>;
  midi: UseMidiReturn;
  onResetRequest?: () => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  return (
    // `id` only on the Settings copy: Help mounts a read-only one too, and an
    // id is one element's. The "hotkeys" hint deep-links to it by id.
    <section
      className={`hotkeys-section${readOnly ? " hotkeys-section-readonly" : ""}`}
      id={readOnly ? undefined : "settings-hotkeys"}
    >
      <div className="hotkeys-section-header">
        <h2>{t("settings.hotkeys.title")}</h2>
        {!readOnly && setInputTestMode && (
          <button
            className={`input-test-btn ${inputTestMode ? "active" : ""}`}
            onClick={() => setInputTestMode((v) => !v)}
            title={t("settings.hotkeys.testTitle")}
          >
            {inputTestMode ? t("settings.hotkeys.stopTest") : t("settings.hotkeys.testInputs")}
          </button>
        )}
      </div>
      {HOTKEY_GROUPS.map((group) => {
        const items = HOTKEYS.filter((hk) => hk.group === group.key);
        if (items.length === 0) return null;
        return (
          <div key={group.key} className="hotkey-group">
            <div className="hotkey-group-label">{t(`settings.hotkeys.groups.${group.key}`)}</div>
            <div className="hotkey-table">
              <div className="hotkey-table-header">
                <span>{t("settings.hotkeys.actionHeader")}</span>
                <span data-tooltip={t("settings.hotkeys.keyTooltip")}>
                  <KeyIcon />
                  {t("settings.hotkeys.keyHeader")}
                </span>
                <span data-tooltip={t("settings.hotkeys.midiTooltip")}>
                  <MidiIcon />
                  {t("settings.hotkeys.midiHeader")}
                </span>
              </div>
              {items.map((hk) => {
                const midiBinding = midi.bindings.find((b) => b.action === hk.id);
                const gamepadBound = footBindings[hk.id];
                return (
                  <div key={hk.id} className="hotkey-row">
                    <span
                      className="hotkey-action"
                      data-tooltip={t(`settings.hotkeys.descs.${hk.id}`)}
                    >
                      {t(`settings.hotkeys.actions.${hk.id}`)}
                    </span>
                    <button
                      className={`hotkey-bind-btn ${bindingFor?.id === hk.id && bindingFor.type === "key" ? "listening" : ""}`}
                      disabled={readOnly}
                      onClick={() => {
                        if (readOnly) return;
                        setBindingFor?.({ id: hk.id, type: "key" });
                        setPendingKeys?.("");
                      }}
                    >
                      {platformKey(keyBindings[hk.id] || "—")}
                    </button>
                    <button
                      className={`hotkey-bind-btn ${midi.learnMode === hk.id ? "listening" : ""}`}
                      disabled={readOnly}
                      onClick={() => {
                        if (readOnly) return;
                        if (midi.learnMode === hk.id) {
                          midi.cancelLearn();
                        } else {
                          midi.startLearn(hk.id);
                        }
                      }}
                      title={
                        midi.learnMode === hk.id
                          ? t("settings.hotkeys.listening")
                          : midiBinding
                          ? t("settings.hotkeys.boundTo", {
                              type: midiBinding.msgType === "cc" ? "CC" : midiBinding.msgType === "note" ? "Note" : "PC",
                              number: midiBinding.number,
                            })
                          : t("settings.hotkeys.learnHint")
                      }
                    >
                      {(() => {
                        if (midi.learnMode === hk.id) return "…";
                        if (midiBinding) {
                          const prefix = midiBinding.msgType === "cc" ? "CC" : midiBinding.msgType === "note" ? "N" : "PC";
                          return `${prefix}#${midiBinding.number}`;
                        }
                        if (gamepadBound) {
                          return isGamepadBinding(gamepadBound)
                            ? formatGamepadButton(gamepadBound)
                            : platformKey(gamepadBound);
                        }
                        return "—";
                      })()}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {!readOnly && onResetRequest && (
        <div className="hotkey-defaults-row">
          <button
            className="hotkey-defaults-btn"
            onClick={onResetRequest}
          >
            {t("settings.hotkeys.resetDefaults")}
          </button>
        </div>
      )}
    </section>
  );
}
