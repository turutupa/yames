import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDrag } from "../../hooks/useDrag";
import { useMetronome } from "../../hooks/useMetronome";
import {
  setBeatGroups,
  setBpm,
  notifySettingsChange,
  setSubdivision,
  showMain,
  storeLoad,
  togglePlayback,
} from "../../ipc";
import { METER_PRESETS } from "../../constants/metronome";
import "../../styles/floating-widget.css";
import type { Subdivision } from "../../types";

const SUBDIVISION_LABELS: Record<Subdivision, string> = {
  1: "♩",
  2: "♫",
  3: "♪³",
  4: "♬",
  5: "♪⁵",
  6: "♬⁶",
};


const IS_MAC = navigator.platform.toUpperCase().indexOf("MAC") >= 0;

function eventToCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  const cmdMod = IS_MAC ? e.metaKey : e.ctrlKey;
  if (cmdMod) parts.push("⌘");
  if (IS_MAC && e.ctrlKey) parts.push("⌃");
  if (e.altKey) parts.push("⌥");
  if (e.shiftKey) parts.push("⇧");
  const key = e.key;
  if (["Meta", "Control", "Alt", "Shift"].includes(key)) return parts.join("");
  switch (key) {
    case " ":
      parts.push("Space");
      break;
    case "ArrowUp":
      parts.push("↑");
      break;
    case "ArrowDown":
      parts.push("↓");
      break;
    case "ArrowLeft":
      parts.push("←");
      break;
    case "ArrowRight":
      parts.push("→");
      break;
    default:
      parts.push(key.length === 1 ? key.toUpperCase() : key);
      break;
  }
  return parts.join("");
}

export function FloatingWidget() {
  const { t } = useTranslation();
  useDrag();
  const { state, currentBeat } = useMetronome();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const [keyBindings, setKeyBindings] = useState<Record<string, string>>({});

  // Load key bindings from store on mount
  useEffect(() => {
    storeLoad<Record<string, string>>("keyBindings").then((kb) => {
      if (kb && typeof kb === "object") setKeyBindings(kb);
    });
  }, []);

  // Hotkey dispatcher for widget
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const combo = eventToCombo(e);
      if (!combo) return;
      const actionId = Object.entries(keyBindings).find(
        ([_, key]) => key === combo,
      )?.[0];
      if (!actionId) return;
      e.preventDefault();
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
      switch (actionId) {
        case "play":
          togglePlayback();
          break;
        case "bpm-up":
          setBpm(Math.min(300, state.bpm + 5));
          break;
        case "bpm-down":
          setBpm(Math.max(20, state.bpm - 5));
          break;
        case "bpm-up-1":
          setBpm(Math.min(300, state.bpm + 1));
          break;
        case "bpm-down-1":
          setBpm(Math.max(20, state.bpm - 1));
          break;
        case "sub-next": {
          const subs: Subdivision[] = [1, 2, 3, 4, 5, 6];
          const idx = subs.indexOf(state.subdivision as Subdivision);
          setSubdivision(subs[(idx + 1) % subs.length]);
          break;
        }
        case "sub-prev": {
          const subs: Subdivision[] = [1, 2, 3, 4, 5, 6];
          const idx = subs.indexOf(state.subdivision as Subdivision);
          setSubdivision(subs[(idx - 1 + subs.length) % subs.length]);
          break;
        }
        case "sig-next": {
          if (state.freeMode) {
            const total = (state.beatGroups ?? [state.timeSignature]).reduce((a: number, b: number) => a + b, 0);
            setBeatGroups([total >= 16 ? 1 : total + 1]); notifySettingsChange();
          } else {
            const currentIdx = METER_PRESETS.findIndex(p => JSON.stringify(p.groups) === JSON.stringify(state.beatGroups));
            const nextIdx = (currentIdx === -1 ? 0 : (currentIdx + 1) % METER_PRESETS.length);
            setBeatGroups(METER_PRESETS[nextIdx].groups);
            notifySettingsChange();
          }
          break;
        }
        case "sig-prev": {
          if (state.freeMode) {
            const total = (state.beatGroups ?? [state.timeSignature]).reduce((a: number, b: number) => a + b, 0);
            setBeatGroups([total <= 1 ? 16 : total - 1]); notifySettingsChange();
          } else {
            const currentIdx = METER_PRESETS.findIndex(p => JSON.stringify(p.groups) === JSON.stringify(state.beatGroups));
            const nextIdx = (currentIdx === -1 ? 0 : (currentIdx - 1 + METER_PRESETS.length) % METER_PRESETS.length);
            setBeatGroups(METER_PRESETS[nextIdx].groups);
            notifySettingsChange();
          }
          break;
        }
        case "toggle-widget":
        case "os-fullscreen":
          showMain();
          break;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [keyBindings, state.bpm, state.subdivision, state.beatGroups, state.freeMode]);

  const MIN_WIDTH = 300;
  const FIXED_HEIGHT = 120;

  // Calculate needed width based on beat dots and subdivision
  // Left side (buttons ~170px) + gap + beat dots + padding
  const beatsPerMeasure = Math.max(2, (state.beatGroups ?? [state.timeSignature]).reduce((a: number, b: number) => a + b, 0));
  const subCount = state.subdivision > 1 ? state.subdivision - 1 : 0;
  const beatGroupWidth = Math.max(10, subCount * 4 + (subCount - 1) * 2); // sub dots or main dot
  const beatsWidth =
    beatsPerMeasure * beatGroupWidth + (beatsPerMeasure - 1) * 10; // groups + gaps
  const neededWidth = 185 + beatsWidth + 36; // left side + beats + padding

  useEffect(() => {
    const width = Math.max(MIN_WIDTH, Math.ceil(neededWidth));
    getCurrentWindow().setSize(new LogicalSize(width, FIXED_HEIGHT));
  }, [neededWidth]);
  const activeBeat = currentBeat ? currentBeat.beat % beatsPerMeasure : -1;
  const activeSub = currentBeat ? currentBeat.subdivision : -1;
  const isDownbeat = currentBeat?.isDownbeat ?? false;
  const widgetBeats = beatsPerMeasure;
  const widgetActiveBeat = activeBeat;
  const isAccentBeat = (beatIdx: number) => {
    if (state.freeMode) return false;
    const s = new Set<number>();
    let c = 0;
    for (const g of (state.beatGroups ?? [state.timeSignature])) { s.add(c); c += g; }
    return s.has(beatIdx);
  };

  const startEdit = () => {
    setEditValue(String(state.bpm));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commitEdit = () => {
    const val = parseInt(editValue);
    if (!isNaN(val)) setBpm(Math.max(20, Math.min(300, val)));
    setEditing(false);
  };

  const bpmDisplay = editing ? (
    <input
      ref={inputRef}
      className="fw-bpm fw-bpm-edit"
      type="text"
      inputMode="numeric"
      value={editValue}
      onChange={(e) => setEditValue(e.target.value.replace(/\D/g, ""))}
      onBlur={commitEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commitEdit();
        if (e.key === "Escape") setEditing(false);
      }}
      autoFocus
    />
  ) : (
    <span className="fw-bpm fw-bpm-clickable" onClick={startEdit}>
      {state.bpm}
    </span>
  );

  if (state.mode === "compact") {
    return (
      <div
        ref={widgetRef}
        className={`floating-widget compact ${IS_MAC ? "os-mac" : "os-other"}`}
        data-playing={state.isPlaying}
      >
        {bpmDisplay}
        <button className="fw-play" onClick={() => togglePlayback()}>
          {state.isPlaying ? "■" : "▶"}
        </button>
        <button
          className="fw-settings"
          onClick={() => showMain()}
          title={t("widget.openMain")}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="2" width="20" height="20" rx="2" />
            <rect x="10" y="10" width="10" height="10" rx="1" />
          </svg>
        </button>
      </div>
    );
  }

  const cycleSubdivision = () => {
    const next =
      state.subdivision === 6 ? 1 : ((state.subdivision + 1) as Subdivision);
    setSubdivision(next);
  };

  const cycleTimeSig = () => {
    if (state.freeMode) {
      const total = (state.beatGroups ?? [state.timeSignature]).reduce((a: number, b: number) => a + b, 0);
      setBeatGroups([total >= 16 ? 1 : total + 1]); notifySettingsChange();
    } else {
      const currentIdx = METER_PRESETS.findIndex(p => JSON.stringify(p.groups) === JSON.stringify(state.beatGroups));
      const nextIdx = (currentIdx === -1 ? 0 : (currentIdx + 1) % METER_PRESETS.length);
      setBeatGroups(METER_PRESETS[nextIdx].groups);
      notifySettingsChange();
    }
  };

  const timeSigLabel = state.freeMode
    ? t("metronome.freeBeatCount", { count: (state.beatGroups ?? [state.timeSignature]).reduce((a: number, b: number) => a + b, 0) })
    : METER_PRESETS.find(p => JSON.stringify(p.groups) === JSON.stringify(state.beatGroups))?.label ?? `${state.timeSignature}/4`;
  const rampActive = state.speedRamp.active;

  return (
    <div
      ref={widgetRef}
      className={`floating-widget comfortable ${IS_MAC ? "os-mac" : "os-other"}`}
      data-playing={state.isPlaying}
    >
      <div className="fw-top-row">
        <div className="fw-bpm-control">
          <button className="fw-bpm-adj" onClick={() => setBpm(state.bpm - 5)}>
            <svg width="10" height="2" viewBox="0 0 10 2">
              <rect width="10" height="2" rx="1" fill="currentColor" />
            </svg>
          </button>
          <div className="fw-bpm-group">
            {bpmDisplay}
            <span className="fw-bpm-unit">BPM</span>
          </div>
          <button className="fw-bpm-adj" onClick={() => setBpm(state.bpm + 5)}>
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect
                x="4"
                y="0"
                width="2"
                height="10"
                rx="1"
                fill="currentColor"
              />
              <rect
                x="0"
                y="4"
                width="10"
                height="2"
                rx="1"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>
        <button className="fw-play" onClick={() => togglePlayback()}>
          {state.isPlaying ? "■" : "▶"}
        </button>
        <button
          className="fw-settings"
          onClick={() => showMain()}
          title={t("widget.openMain")}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="2" width="20" height="20" rx="2" />
            <rect x="10" y="10" width="10" height="10" rx="1" />
          </svg>
        </button>
      </div>

      <div className="fw-bottom-row">
        <div className="fw-btn-group">
          {rampActive && (
            <span
              className="fw-ramp-badge"
              title={t("widget.ramp", {
                current: state.speedRamp.currentBpm,
                target: state.speedRamp.targetBpm,
              })}
            >
              ⚡
            </span>
          )}
          <button
            className="fw-sub-btn"
            onClick={cycleSubdivision}
            title={t(`subdiv.${state.subdivision}`)}
          >
            <span className="fw-sub-icon">
              {SUBDIVISION_LABELS[state.subdivision]}
            </span>
            <span className="fw-sub-name">
              {t(`subdiv.${state.subdivision}`)}
            </span>
          </button>

          <button
            className="fw-sub-btn"
            onClick={cycleTimeSig}
            title={t("widget.timeSignature")}
          >
            <span className="fw-sub-name">{timeSigLabel}</span>
          </button>
        </div>

        <div className="fw-beat-row">
          {Array.from({ length: widgetBeats }, (_, beatIdx) => {
            const isBeatActive = widgetActiveBeat === beatIdx && isDownbeat;
            const isBeatDownbeat = isBeatActive && isAccentBeat(beatIdx);
            return (
              <div key={beatIdx} className="fw-beat-group">
                <span
                  className={`fw-beat-dot ${isBeatActive ? "active" : ""} ${isBeatDownbeat ? "downbeat" : ""}`}
                />
                {state.subdivision > 1 && (
                  <div className="fw-sub-dots">
                    {Array.from(
                      { length: state.subdivision - 1 },
                      (_, subIdx) => (
                        <span
                          key={subIdx}
                          className={`fw-sub-dot ${
                            widgetActiveBeat === beatIdx &&
                            activeSub === subIdx + 1
                              ? "active"
                              : ""
                          }`}
                        />
                      ),
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
