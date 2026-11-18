/**
 * W3 — Hands-free control (ONBOARDING_PLAN §3, principle 5), led by the
 * Session (owner, 2026-11-17).
 *
 * The learning side is the main experience now, so the step teaches its keys
 * first and the tools' keys last:
 *   In a Session — the big button (Play or `session-go`), faster and slower
 *               between Takes, and the next step. Every combo is read from the
 *               live binding table (`HOTKEYS` merged with the user's stored
 *               overrides), so a remapped key is never mis-taught here.
 *   Footswitch  — one pedal, mapped to `session-pedal` through the app's
 *               existing learn path (`useMidi`, the same one Settings → Hotkeys
 *               uses; MainWindow's `useGamepad` routes a button into
 *               `footBindings` while `midi.learnMode` is on). On the Session it
 *               is tap / double / hold; everywhere else the dispatcher treats a
 *               press as Play/Stop, so the tools keep their pedal.
 *   Getting around — the learning screens' and the tools' keys, on one
 *               quiet line under the rest.
 *
 * The step deliberately owns no MIDI state of its own: it drives the app's
 * single `useMidi` instance (through the wizard env) so a binding made here is
 * immediately visible to the rest of the app — including W7's "Control" row.
 * Not in the phone build (no keyboard, MIDI or gamepad there; see the step
 * registry).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { HOTKEYS, platformKey, splitCombo, type HotkeyAction } from "../../../hotkeys";
import { formatGamepadButton } from "../../../hooks/useGamepad";
import { storeLoad } from "../../../ipc";
import type { MidiBinding } from "../../../types";
import { useWizardEnv } from "../WizardContext";
import type { WizardStepProps } from "./types";
import "../../../styles/onboarding-learning.css";

/** The action a single footswitch maps to: the Session's one-pedal action. */
export const PEDAL = "session-pedal";

/**
 * The Session's keys, in the order a player meets them. Each row lists the
 * actions whose keys it shows; a row with two shows "A or B".
 */
const SESSION_ROWS: Array<{ key: string; actions: HotkeyAction[]; label: string }> = [
  { key: "go", actions: ["play", "session-go"], label: "onboarding.handsFree.session.go" },
  { key: "pause", actions: ["session-pause"], label: "settings.hotkeys.actions.session-pause" },
  { key: "restart", actions: ["session-restart"], label: "settings.hotkeys.actions.session-restart" },
  { key: "next", actions: ["session-next"], label: "onboarding.handsFree.session.next" },
  { key: "tempo", actions: ["session-faster", "session-slower"], label: "onboarding.handsFree.session.tempo" },
  { key: "view", actions: ["session-view"], label: "onboarding.handsFree.session.view" },
  { key: "exit", actions: ["session-exit"], label: "settings.hotkeys.actions.session-exit" },
];

/**
 * Getting around, on one quiet line (2026-11-18): the learning screens on
 * ⌘1–⌘4 and the tools on ⌘5–⌘9, read from the same bindings as the rows above.
 */
const NAV_GROUPS: Array<{ key: string; actions: HotkeyAction[] }> = [
  { key: "learning", actions: ["tab-today", "tab-paths", "tab-progress", "tab-tools"] },
  { key: "tools", actions: ["tab-1", "tab-2", "tab-3", "tab-4", "tab-5"] },
];

/**
 * A run of keys as one keycap when it is one (`Ctrl 1–4`): the same modifiers
 * on every key and consecutive digits. Anything remapped out of that shape is
 * listed key by key, so the line never claims a range the player does not have.
 */
export function keyRange(combos: string[][]): string[][] {
  const bound = combos.filter((c) => c.length > 0);
  if (bound.length < 2 || bound.length !== combos.length) return bound;
  const mods = bound[0].slice(0, -1).join("+");
  const digits = bound.map((c) => Number(c[c.length - 1]));
  const sameMods = bound.every((c) => c.slice(0, -1).join("+") === mods);
  const consecutive = digits.every((d, i) => Number.isInteger(d) && d === digits[0] + i);
  if (!sameMods || !consecutive) return bound;
  return [[...bound[0].slice(0, -1), `${digits[0]}–${digits[digits.length - 1]}`]];
}

/** The pedal's three gestures, worded by the Session's own pedal legend. */
const GESTURES = [
  ["tap", "tapDoes"],
  ["double", "doubleDoes"],
  ["hold", "holdDoes"],
] as const;

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

  const keysOf = useCallback(
    (id: HotkeyAction): string[] => {
      const combo = overrides[id] ?? HOTKEYS.find((h) => h.id === id)?.key ?? "";
      // Split first, then localise each token: `platformKey` turns ⌘ into
      // Ctrl on Windows/Linux and leaves the glyph alone on macOS.
      return combo ? splitCombo(combo).map(platformKey) : [];
    },
    [overrides],
  );

  const sessionRows = useMemo(
    () =>
      SESSION_ROWS.map((row) => ({
        key: row.key,
        label: t(row.label, {
          neck: t("session.view.neck"),
          runway: t("session.view.runway"),
          tab: t("session.view.tab"),
        }),
        combos: row.actions.map(keysOf).filter((k) => k.length > 0),
      })),
    [keysOf, t],
  );

  const navGroups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        key: group.key,
        label: t(`onboarding.handsFree.nav.${group.key}`),
        keys: keyRange(group.actions.map(keysOf)),
      })),
    [keysOf, t],
  );

  // --- Shared learn state --------------------------------------------------
  const learning = midi.learnMode === PEDAL;
  const midiBinding = midi.bindings.find((b) => b.action === PEDAL) ?? null;
  const padBinding = gamepadBindings[PEDAL] ?? null;

  // A pedal that is already bound to something else would raise the conflict
  // dialog, which lives *behind* the wizard overlay. In a setup step the tap is
  // the answer: take the signal for the pedal.
  const { pendingConflict, acceptConflict, cancelLearn } = midi;
  useEffect(() => {
    if (isActive && pendingConflict?.targetAction === PEDAL) acceptConflict();
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
    midi.startLearn(PEDAL);
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

  const renderRows = (rows: Array<{ key: string; label: string; combos: string[][] }>) => (
    <ul className="onboarding-hf-keys">
      {rows.map((row) => (
        <li key={row.key} className="onboarding-hf-key-row" data-row={row.key}>
          <span className="onboarding-hf-key-label">{row.label}</span>
          <span className="onboarding-hf-key-combo">
            {row.combos.length === 0 ? (
              <span className="onboarding-hf-muted">—</span>
            ) : (
              row.combos.map((keys, c) => (
                <span key={c} className="onboarding-hf-key-alt">
                  {c > 0 && (
                    <span className="onboarding-hf-or">{t("onboarding.handsFree.session.or")}</span>
                  )}
                  {keys.map((k, i) => (
                    <kbd key={i} className="onboarding-hf-kbd">
                      {k}
                    </kbd>
                  ))}
                </span>
              ))
            )}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="onboarding-step">
      <h2 className="onboarding-step-title" id="onboarding-title">
        {t("onboarding.handsFree.title")}
      </h2>
      <p className="onboarding-step-subtitle">{t("onboarding.handsFree.subtitle")}</p>

      <div className="onboarding-cards">
        {/* ---- In a Session ---- */}
        <section className="onboarding-hf-card" data-testid="hands-free-keyboard">
          <h3 className="onboarding-hf-title">{t("onboarding.handsFree.session.title")}</h3>
          {renderRows(sessionRows)}
          <p className="onboarding-hf-hint">{t("onboarding.handsFree.keyboard.hint")}</p>
        </section>

        {/* ---- One footswitch ---- */}
        <section className="onboarding-hf-card" data-testid="hands-free-pedal">
          <h3 className="onboarding-hf-title">{t("onboarding.handsFree.pedal.title")}</h3>
          <dl className="onboarding-hf-legend" data-testid="hands-free-legend">
            {GESTURES.map(([gesture, does]) => (
              <div key={gesture} className="onboarding-hf-legend-row">
                <dt>{t(`session.pedal.${gesture}`)}</dt>
                <dd>{t(`session.pedal.${does}`)}</dd>
              </div>
            ))}
          </dl>
          <p className="onboarding-hf-hint">{t("onboarding.handsFree.pedal.tools")}</p>

          <div className="onboarding-hf-sub" data-testid="hands-free-midi">
            <h4 className="onboarding-hf-subtitle">{t("onboarding.handsFree.midi.title")}</h4>
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
          </div>

          <div className="onboarding-hf-sub" data-testid="hands-free-gamepad">
            <h4 className="onboarding-hf-subtitle">{t("onboarding.handsFree.gamepad.title")}</h4>
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
          </div>
        </section>

        {/* ---- Getting around: one quiet line, the rail's keys ---- */}
        <p className="onboarding-hf-nav" data-testid="hands-free-nav">
          {navGroups.map((group, g) => (
            <span key={group.key} className="onboarding-hf-nav-group" data-group={group.key}>
              {g > 0 && <span className="onboarding-hf-nav-sep" aria-hidden="true">·</span>}
              <span className="onboarding-hf-nav-label">{group.label}</span>
              {group.keys.map((keys, c) => (
                <span key={c} className="onboarding-hf-key-alt">
                  {keys.map((k, i) => (
                    <kbd key={i} className="onboarding-hf-kbd">
                      {k}
                    </kbd>
                  ))}
                </span>
              ))}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}
