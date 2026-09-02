/**
 * W3 — Hands-free control (ONBOARDING_PLAN §3, principle 5).
 *
 * Three cards, in the order the user is likely to own the hardware:
 *   Keyboard  — the keys that matter, read from the live binding table
 *               (`HOTKEYS` merged with the user's stored overrides) so a
 *               remapped key is never mis-taught here. Nothing is hardcoded.
 *   MIDI      — the connected/available devices, and one tap that maps the
 *               next pedal press to Play/Stop through the app's existing
 *               learn path (`useMidi`, the same one Settings → Hotkeys uses).
 *   Gamepad   — the same learn tap: MainWindow's `useGamepad` already routes a
 *               button press into `footBindings` while `midi.learnMode` is on,
 *               so one learn state covers both kinds of footswitch.
 *
 * The step deliberately owns no MIDI state of its own: it drives the app's
 * single `useMidi` instance (through the wizard env) so a binding made here is
 * immediately visible to the rest of the app — including W7's "Control" row.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { HOTKEYS, platformKey, splitCombo, type HotkeyAction } from "../../../hotkeys";
import { formatGamepadButton } from "../../../hooks/useGamepad";
import { storeLoad } from "../../../ipc";
import type { MidiBinding } from "../../../types";
import { useWizardEnv } from "../WizardContext";
import type { WizardStepProps } from "./types";

/** The action every footswitch maps to first. */
const PLAY = "play";

/**
 * The five things worth knowing on day one (ONBOARDING_PLAN §3 W3). Ids only —
 * the combos come from the binding table, never from this file. `T` (tap
 * tempo) in the plan has no hotkey in `HOTKEYS`; tab switching earns the slot.
 */
const KEYBOARD_ACTIONS: HotkeyAction[] = [
  "play",
  "bpm-up",
  "bpm-down",
  "toggle-coach",
  "tab-1",
  "tab-2",
];

type KeyRow = { id: HotkeyAction; label: string; keys: string[] };

/** `CC #64`, `Note #36`, `PC #3` — the format Settings → Hotkeys shows. */
function signalLabel(binding: Pick<MidiBinding, "msgType" | "number">): string {
  const prefix =
    binding.msgType === "cc" ? "CC" : binding.msgType === "note" ? "Note" : "PC";
  return `${prefix} #${binding.number}`;
}

export function HandsFreeStep({ isActive }: WizardStepProps) {
  const { t } = useTranslation();
  const { midi, gamepadBindings } = useWizardEnv();

  // --- Keyboard card -------------------------------------------------------
  // Defaults come from the binding table; anything the user has remapped comes
  // from the same store key `useKeybindings` writes, so the card teaches the
  // keys this install actually has.
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    storeLoad<Record<string, string>>("keyBindings")
      .then((stored) => {
        if (!cancelled && stored && typeof stored === "object") setOverrides(stored);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const keyRows: KeyRow[] = useMemo(
    () =>
      KEYBOARD_ACTIONS.map((id) => {
        const combo = overrides[id] ?? HOTKEYS.find((h) => h.id === id)?.key ?? "";
        return {
          id,
          label: t(`settings.hotkeys.actions.${id}`),
          // Split first, then localise each token: `platformKey` turns ⌘ into
          // Ctrl on Windows/Linux and leaves the glyph alone on macOS.
          keys: combo ? splitCombo(combo).map(platformKey) : [],
        };
      }),
    [overrides, t],
  );

  // --- Shared learn state --------------------------------------------------
  const learning = midi.learnMode === PLAY;
  const midiBinding = midi.bindings.find((b) => b.action === PLAY) ?? null;
  const padBinding = gamepadBindings[PLAY] ?? null;

  // A pedal that is already bound to something else would raise the conflict
  // dialog, which lives *behind* the wizard overlay. In a setup step the tap is
  // the answer: take the signal for Play/Stop.
  const { pendingConflict, acceptConflict, cancelLearn } = midi;
  useEffect(() => {
    if (isActive && pendingConflict?.targetAction === PLAY) acceptConflict();
  }, [isActive, pendingConflict, acceptConflict]);

  // Leaving the step must not leave the app listening for a pedal.
  useEffect(() => cancelLearn, [cancelLearn]);

  const startMapping = useCallback(async () => {
    if (learning) {
      midi.cancelLearn();
      return;
    }
    // Activity only flows from a connected input, so connect before listening.
    // With several devices the user picks one first; with one, this is the tap.
    if (!midi.connectedDevice && midi.devices.length > 0) {
      try {
        await midi.connect(midi.devices[0].name);
      } catch {
        // A device that refuses to open still leaves the gamepad path usable.
      }
    }
    midi.startLearn(PLAY);
  }, [learning, midi]);

  // --- Gamepad card --------------------------------------------------------
  // `gamepadconnected` only fires after the first button press on most
  // engines, so poll as well — the card has to react to a pad plugged in while
  // the step is open, exactly like the MIDI list does.
  const [pads, setPads] = useState<string[]>([]);
  useEffect(() => {
    if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") {
      return;
    }
    const scan = () => {
      const found = Array.from(navigator.getGamepads())
        .filter((p): p is Gamepad => p != null)
        .map((p) => p.id);
      setPads((prev) =>
        prev.length === found.length && prev.every((id, i) => id === found[i])
          ? prev
          : found,
      );
    };
    scan();
    window.addEventListener("gamepadconnected", scan);
    window.addEventListener("gamepaddisconnected", scan);
    const poll = window.setInterval(scan, 1500);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("gamepadconnected", scan);
      window.removeEventListener("gamepaddisconnected", scan);
    };
  }, []);

  return (
    <div className="onboarding-step">
      <h2 className="onboarding-step-title" id="onboarding-title">
        {t("onboarding.handsFree.title")}
      </h2>
      <p className="onboarding-step-subtitle">{t("onboarding.handsFree.subtitle")}</p>

      <div className="onboarding-cards">
        {/* ---- Keyboard ---- */}
        <section className="onboarding-hf-card" data-testid="hands-free-keyboard">
          <h3 className="onboarding-hf-title">{t("onboarding.handsFree.keyboard.title")}</h3>
          <ul className="onboarding-hf-keys">
            {keyRows.map((row) => (
              <li key={row.id} className="onboarding-hf-key-row">
                <span className="onboarding-hf-key-label">{row.label}</span>
                <span className="onboarding-hf-key-combo">
                  {row.keys.length === 0 ? (
                    <span className="onboarding-hf-muted">—</span>
                  ) : (
                    row.keys.map((k, i) => (
                      <kbd key={i} className="onboarding-hf-kbd">
                        {k}
                      </kbd>
                    ))
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="onboarding-hf-hint">{t("onboarding.handsFree.keyboard.hint")}</p>
        </section>

        {/* ---- MIDI footswitch ---- */}
        <section className="onboarding-hf-card" data-testid="hands-free-midi">
          <h3 className="onboarding-hf-title">{t("onboarding.handsFree.midi.title")}</h3>
          {midi.devices.length === 0 ? (
            <p className="onboarding-hf-hint">{t("onboarding.handsFree.midi.none")}</p>
          ) : (
            <>
              <ul className="onboarding-hf-devices">
                {midi.devices.map((device) => {
                  const connected = midi.connectedDevice === device.name;
                  return (
                    <li key={device.id}>
                      <button
                        type="button"
                        className={`onboarding-hf-device${connected ? " connected" : ""}`}
                        aria-pressed={connected}
                        onClick={() => {
                          if (!connected) midi.connect(device.name).catch(() => {});
                        }}
                      >
                        <span className="onboarding-hf-device-dot" aria-hidden="true" />
                        <span className="onboarding-hf-device-name">{device.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {midiBinding && !learning && (
                <p className="onboarding-hf-mapped">
                  {t("onboarding.handsFree.midi.mapped", {
                    signal: signalLabel(midiBinding),
                    channel: (midiBinding.channel ?? 0) + 1,
                  })}
                </p>
              )}
              {learning && (
                <p className="onboarding-hf-listening" role="status">
                  {t("onboarding.handsFree.midi.listening")}
                </p>
              )}
              <button
                type="button"
                className="onboarding-btn onboarding-btn-ghost onboarding-hf-action"
                onClick={startMapping}
              >
                {learning
                  ? t("onboarding.handsFree.cancel")
                  : midiBinding
                    ? t("onboarding.handsFree.midi.remap")
                    : t("onboarding.handsFree.midi.map")}
              </button>
            </>
          )}
        </section>

        {/* ---- Gamepad ---- */}
        <section className="onboarding-hf-card" data-testid="hands-free-gamepad">
          <h3 className="onboarding-hf-title">{t("onboarding.handsFree.gamepad.title")}</h3>
          {pads.length === 0 ? (
            <p className="onboarding-hf-hint">{t("onboarding.handsFree.gamepad.none")}</p>
          ) : (
            <>
              <ul className="onboarding-hf-devices">
                {pads.map((id, i) => (
                  <li key={`${id}-${i}`}>
                    <div className="onboarding-hf-device connected">
                      <span className="onboarding-hf-device-dot" aria-hidden="true" />
                      <span className="onboarding-hf-device-name">{id}</span>
                    </div>
                  </li>
                ))}
              </ul>
              {padBinding && !learning && (
                <p className="onboarding-hf-mapped">
                  {t("onboarding.handsFree.gamepad.mapped", {
                    button: formatGamepadButton(padBinding),
                  })}
                </p>
              )}
              {learning && (
                <p className="onboarding-hf-listening" role="status">
                  {t("onboarding.handsFree.gamepad.listening")}
                </p>
              )}
              <button
                type="button"
                className="onboarding-btn onboarding-btn-ghost onboarding-hf-action"
                onClick={startMapping}
              >
                {learning
                  ? t("onboarding.handsFree.cancel")
                  : padBinding
                    ? t("onboarding.handsFree.gamepad.remap")
                    : t("onboarding.handsFree.gamepad.map")}
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
