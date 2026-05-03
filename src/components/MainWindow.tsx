import { useMetronome } from "../hooks/useMetronome";
import { useDrag } from "../hooks/useDrag";
import { useState, useRef, useEffect, useCallback } from "react";
import { setBpm, setSubdivision, togglePlayback, setPlaying, setWidgetMode, setAlwaysOnTop, setWidgetAlwaysOnTop, setVolume, setSoundType, setTimeSignature, showFloating, onFullscreenChanged, setActiveTab, getActiveTab, setTheme, stopSpeedRamp, startSpeedRamp, configureSpeedRamp, storeSave, storeLoad, openUrl } from "../ipc";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Subdivision, WidgetMode } from "../types";
import { THEMES } from "../themes";
import { DrillView } from "./DrillView";
import { TrackView } from "./TrackView";
import { FullscreenView } from "./FullscreenView";
import { ThemeEffects } from "./ThemeEffects";
import { useGamepad, formatGamepadButton, isGamepadBinding } from "../hooks/useGamepad";
import "../styles/main-window.css";

// Force the webview to reclaim keyboard focus after macOS fullscreen exit.
// The hidden-input trick is the only reliable way — body.focus()/click() don't work.
async function forceWebviewFocus(retries = 4, delayMs = 200) {
  for (let i = 0; i < retries; i++) {
    if (document.hasFocus()) break;
    await new Promise(r => setTimeout(r, delayMs));
  }
  const tmp = document.createElement("input");
  tmp.style.position = "fixed";
  tmp.style.opacity = "0";
  tmp.style.pointerEvents = "none";
  document.body.appendChild(tmp);
  tmp.focus();
  tmp.remove();
}

const SHARE_URL = "https://turutupa.github.io/yames/";
const SHARE_TEXT = "Check out Yames — a free open-source metronome for serious practice 🎵";
const SHARE_OPTIONS = [
  { id: "whatsapp", label: "WhatsApp", url: `https://wa.me/?text=${encodeURIComponent(SHARE_TEXT + "\n" + SHARE_URL)}` },
  { id: "x", label: "X / Twitter", url: `https://x.com/intent/tweet?text=${encodeURIComponent(SHARE_TEXT)}&url=${encodeURIComponent(SHARE_URL)}` },
  { id: "facebook", label: "Facebook", url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SHARE_URL)}` },
  { id: "reddit", label: "Reddit", url: `https://www.reddit.com/submit?url=${encodeURIComponent(SHARE_URL)}&title=${encodeURIComponent(SHARE_TEXT)}` },
  { id: "copy", label: "Copy link", url: "" },
] as const;

const SOUND_TYPES = [
  { id: "click", name: "Click", icon: "○" },
  { id: "wood", name: "Wood", icon: "◆" },
  { id: "beep", name: "Beep", icon: "◉" },
  { id: "drum", name: "Drum", icon: "◎" },
];

const TIME_SIGNATURES = [
  { beats: 0, label: "Never" },
  { beats: 1, label: "Always" },
  { beats: 2, label: "2/4" },
  { beats: 3, label: "3/4" },
  { beats: 4, label: "4/4" },
  { beats: 5, label: "5/4" },
  { beats: 6, label: "6/8" },
  { beats: 7, label: "7/8" },
];

const TEMPO_MARKINGS: [number, string][] = [
  [20,  "Grave"],
  [40,  "Largo"],
  [45,  "Lento"],
  [55,  "Adagio"],
  [66,  "Adagietto"],
  [72,  "Andante"],
  [80,  "Andantino"],
  [84,  "Moderato"],
  [100, "Allegretto"],
  [112, "Allegro"],
  [132, "Vivace"],
  [140, "Presto"],
  [178, "Prestissimo"],
];

function getTempoMarking(bpm: number): string {
  for (let i = TEMPO_MARKINGS.length - 1; i >= 0; i--) {
    if (bpm >= TEMPO_MARKINGS[i][0]) return TEMPO_MARKINGS[i][1];
  }
  return TEMPO_MARKINGS[0][1];
}

const SUBDIVISION_LABELS: Record<Subdivision, string> = {
  1: "♩",
  2: "♫",
  3: "♪³",
  4: "♬",
  5: "♪⁵",
  6: "♬⁶",
};

const SUBDIVISION_NAMES: Record<Subdivision, string> = {
  1: "Quarter",
  2: "Eighth",
  3: "Triplet",
  4: "16th",
  5: "Quintuplet",
  6: "Sextuplet",
};

type HotkeyAction = "play" | "bpm-down" | "bpm-up" | "bpm-down-1" | "bpm-up-1" | "sub-next" | "sub-prev" | "sig-next" | "sig-prev" | "fullscreen" | "os-fullscreen" | "toggle-widget" | "tab-1" | "tab-2" | "tab-3" | "settings";

interface HotkeyEntry {
  action: string;
  key: string;
  globalKey?: string;
  id: HotkeyAction;
  desc: string;
  globalAllowed?: boolean;
  group: "metronome" | "view" | "navigation";
}

const IS_MAC = navigator.platform.toUpperCase().indexOf("MAC") >= 0;

/** Convert macOS-style symbols to platform-appropriate labels */
function platformKey(key: string): string {
  if (IS_MAC) return key;
  return key
    .replace(/⌘/g, "Ctrl")
    .replace(/⇧/g, "Shift")
    .replace(/⌥/g, "Alt")
    .replace(/Ctrl\+?/g, "Ctrl+")
    .replace(/Shift\+?/g, "Shift+")
    .replace(/Alt\+?/g, "Alt+")
    .replace(/\+$/g, "");
}

/** Convert a KeyboardEvent to a normalized binding string */
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
    case " ": parts.push("Space"); break;
    case "ArrowUp": parts.push("↑"); break;
    case "ArrowDown": parts.push("↓"); break;
    case "ArrowLeft": parts.push("←"); break;
    case "ArrowRight": parts.push("→"); break;
    default: parts.push(key.length === 1 ? key.toUpperCase() : key); break;
  }
  return parts.join("");
}

const HOTKEYS: HotkeyEntry[] = [
  { id: "play", action: "Play / Stop", key: "Space", globalKey: "⌘⇧Space", desc: "Start or stop the metronome", globalAllowed: true, group: "metronome" },
  { id: "bpm-up", action: "BPM +5", key: "↑", globalKey: "⌘⇧↑", desc: "Increase tempo by 5 BPM", globalAllowed: true, group: "metronome" },
  { id: "bpm-down", action: "BPM −5", key: "↓", globalKey: "⌘⇧↓", desc: "Decrease tempo by 5 BPM", globalAllowed: true, group: "metronome" },
  { id: "bpm-up-1", action: "BPM +1", key: "⇧↑", globalKey: "⌘⇧⌥↑", desc: "Fine increase by 1 BPM", globalAllowed: true, group: "metronome" },
  { id: "bpm-down-1", action: "BPM −1", key: "⇧↓", globalKey: "⌘⇧⌥↓", desc: "Fine decrease by 1 BPM", globalAllowed: true, group: "metronome" },
  { id: "sub-next", action: "Subdivision +", key: "]", desc: "Cycle to next subdivision", group: "metronome" },
  { id: "sub-prev", action: "Subdivision −", key: "[", desc: "Cycle to previous subdivision", group: "metronome" },
  { id: "sig-next", action: "Time signature +", key: "T", desc: "Cycle to next time signature", group: "metronome" },
  { id: "sig-prev", action: "Time signature −", key: "⇧T", desc: "Cycle to previous time signature", group: "metronome" },
  { id: "fullscreen", action: "Zen toggle", key: "Z", desc: "Enter or exit zen mode", group: "view" },
  { id: "os-fullscreen", action: "OS Fullscreen", key: "F", desc: "Toggle native fullscreen", group: "view" },
  { id: "toggle-widget", action: "Toggle Widget", key: "W", globalKey: "⌘⇧O", desc: "Switch to floating widget", globalAllowed: true, group: "navigation" },
  { id: "tab-1", action: "Metronome tab", key: "⌘1", desc: "Switch to Metronome tab", group: "navigation" },
  { id: "tab-2", action: "Drill tab", key: "⌘2", desc: "Switch to Drill tab", group: "navigation" },
  { id: "tab-3", action: "Tap It tab", key: "⌘3", desc: "Switch to Tap It tab", group: "navigation" },
  { id: "settings", action: "Settings", key: "⌘,", desc: "Open or close settings", group: "navigation" },
];

const HOTKEY_GROUPS: { key: string; label: string }[] = [
  { key: "metronome", label: "Metronome" },
  { key: "view", label: "View" },
  { key: "navigation", label: "Navigation" },
];

export function MainWindow() {
  useDrag();
  const { state, currentBeat } = useMetronome();
  const [view, setViewRaw] = useState<"beat" | "drill" | "track" | "settings">("beat");
  const prevTab = useRef<"beat" | "drill" | "track">("beat");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTooltip, setShareTooltip] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);
  const shareBtnRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Persist tab changes and wrap setView
  const setView = useCallback((v: "beat" | "drill" | "track" | "settings") => {
    setViewRaw((prev) => {
      // Stop playback when leaving the current tab
      if (prev !== v && prev !== "settings" && v !== "settings") {
        if (state.isPlaying) setPlaying(false);
        if (state.speedRamp?.active) stopSpeedRamp();
      }
      // Stop the drill if leaving the drill tab to settings
      if (prev === "drill" && v === "settings" && state.speedRamp?.active) {
        stopSpeedRamp();
      }
      return v;
    });
    if (v !== "settings") {
      setActiveTab(v);
    }
    if (v === "track" || v === "settings") {
      setTimeout(() => contentRef.current?.scrollTo(0, 0), 0);
    }
  }, [state.speedRamp?.active, state.isPlaying]);

  // Close share popover on outside click
  useEffect(() => {
    if (!shareOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (shareRef.current?.contains(target)) return;
      if (shareBtnRef.current?.contains(target)) return;
      setShareOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [shareOpen]);

  const handleShareOption = (opt: typeof SHARE_OPTIONS[number]) => {
    if (opt.id === "copy") {
      navigator.clipboard.writeText(SHARE_URL).then(() => {
        setShareTooltip(true);
        setTimeout(() => setShareTooltip(false), 1800);
      });
    } else {
      openUrl(opt.url);
    }
    setShareOpen(false);
  };

  // Restore last active tab on mount
  useEffect(() => {
    getActiveTab().then((tab) => {
      if (tab === "beat" || tab === "drill" || tab === "track") {
        setViewRaw(tab);
        prevTab.current = tab;
      }
    });
  }, []);
  const [subOpen, setSubOpen] = useState(false);
  const [soundOpen, setSoundOpen] = useState(false);
  const [keyBindings, setKeyBindings] = useState<Record<string, string>>(() =>
    Object.fromEntries(HOTKEYS.map((hk) => [hk.id, hk.key]))
  );
  const [footBindings, setFootBindings] = useState<Record<string, string>>({});
  const [globalBindings, setGlobalBindings] = useState<Record<string, string>>(() =>
    Object.fromEntries(HOTKEYS.filter((hk) => hk.globalAllowed).map((hk) => [hk.id, hk.globalKey || hk.key]))
  );
  const [bindingFor, setBindingFor] = useState<{ id: string; type: "key" | "global" | "foot" } | null>(null);
  const bindingsLoaded = useRef(false);

  // Persist bindings whenever they change — but only after initial restore
  useEffect(() => { if (bindingsLoaded.current) storeSave("keyBindings", keyBindings); }, [keyBindings]);
  useEffect(() => { if (bindingsLoaded.current) storeSave("globalBindings", globalBindings); }, [globalBindings]);
  useEffect(() => { if (bindingsLoaded.current) storeSave("footBindings", footBindings); }, [footBindings]);

  // Restore bindings from store on mount, merging with defaults for any new hotkeys
  useEffect(() => {
    const defaults = Object.fromEntries(HOTKEYS.map((hk) => [hk.id, hk.key]));
    const globalDefaults = Object.fromEntries(HOTKEYS.filter((hk) => hk.globalAllowed).map((hk) => [hk.id, hk.globalKey || hk.key]));
    (async () => {
      const kb = await storeLoad<Record<string, string>>("keyBindings");
      if (kb && typeof kb === "object") setKeyBindings({ ...defaults, ...kb });
      const gb = await storeLoad<Record<string, string>>("globalBindings");
      if (gb && typeof gb === "object") setGlobalBindings({ ...globalDefaults, ...gb });
      const fb = await storeLoad<Record<string, string>>("footBindings");
      if (fb && typeof fb === "object") setFootBindings(fb);
      bindingsLoaded.current = true;
    })();
  }, []);

  const [buttonFlash, setButtonFlash] = useState(true);
  const [activeBorder, setActiveBorder] = useState(true);
  const [drillAutoCollapse, setDrillAutoCollapse] = useState(true);

  // Restore UI prefs from store on mount
  useEffect(() => {
    (async () => {
      const bf = await storeLoad<boolean>("buttonFlash");
      if (bf !== undefined) setButtonFlash(bf);
      const ab = await storeLoad<boolean>("activeBorder");
      if (ab !== undefined) setActiveBorder(ab);
      const dac = await storeLoad<boolean>("drillAutoCollapse");
      if (dac !== undefined) setDrillAutoCollapse(dac);
    })();
  }, []);
  const [editingBpm, setEditingBpm] = useState(false);
  const [bpmEditValue, setBpmEditValue] = useState("");
  const bpmInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Tab switching and settings are handled by the unified dispatcher via keyBindings
  const soundDropdownRef = useRef<HTMLDivElement>(null);

  const beatsPerMeasure = state.timeSignature >= 2 ? state.timeSignature : 2;
  const activeBeat = currentBeat ? currentBeat.beat % beatsPerMeasure : -1;
  const activeSub = currentBeat ? currentBeat.subdivision : -1;
  const isDownbeat = currentBeat?.isDownbeat ?? false;

  // Pulse state for floating play button — triggers briefly on each downbeat
  const [isPulsing, setIsPulsing] = useState(false);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (buttonFlash && isDownbeat && state.isPlaying) {
      setIsPulsing(true);
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
      pulseTimer.current = setTimeout(() => setIsPulsing(false), 180);
    }
  }, [currentBeat, buttonFlash]);

  const handleBpmChange = (value: number) => {
    const clamped = Math.max(20, Math.min(300, value));
    setBpm(clamped);
  };

  const startBpmEdit = () => {
    setBpmEditValue(String(state.bpm));
    setEditingBpm(true);
    setTimeout(() => bpmInputRef.current?.select(), 0);
  };

  const commitBpmEdit = () => {
    const val = parseInt(bpmEditValue);
    if (!isNaN(val)) handleBpmChange(val);
    setEditingBpm(false);
  };

  // Close dropdown on outside click
  useEffect(() => {
    if (!subOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSubOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [subOpen]);

  useEffect(() => {
    if (!soundOpen) return;
    const handler = (e: MouseEvent) => {
      if (soundDropdownRef.current && !soundDropdownRef.current.contains(e.target as Node)) {
        setSoundOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [soundOpen]);

  // Listen for fullscreen changes from Rust (global shortcut)
  useEffect(() => {
    const unlisten = onFullscreenChanged(() => {
      if (view !== "track") setIsFullscreen((prev) => !prev);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [view]);

  const [pendingKeys, setPendingKeys] = useState<string>("");
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const resetAllBindings = useCallback(() => {
    setKeyBindings(Object.fromEntries(HOTKEYS.map((hk) => [hk.id, hk.key])));
    setGlobalBindings(Object.fromEntries(HOTKEYS.filter((hk) => hk.globalAllowed).map((hk) => [hk.id, hk.globalKey || hk.key])));
    setFootBindings({});
    setShowResetConfirm(false);
  }, []);

  // Key/footswitch binding listener
  const handleBinding = useCallback((e: KeyboardEvent) => {
    if (!bindingFor) return;
    e.preventDefault();
    if (e.key === "Escape") {
      setBindingFor(null);
      setPendingKeys("");
      return;
    }
    const combo = eventToCombo(e);
    if (combo) {
      setPendingKeys(combo);
    }
    if (combo && !["Meta", "Control", "Alt", "Shift"].includes(e.key)) {
      if (bindingFor.type === "key") {
        setKeyBindings((prev) => ({ ...prev, [bindingFor.id]: combo }));
      } else if (bindingFor.type === "global") {
        setGlobalBindings((prev) => ({ ...prev, [bindingFor.id]: combo }));
      } else {
        setFootBindings((prev) => ({ ...prev, [bindingFor.id]: combo }));
      }
      setBindingFor(null);
      setPendingKeys("");
    }
  }, [bindingFor]);

  const handleResetBinding = useCallback(() => {
    if (!bindingFor) return;
    const hk = HOTKEYS.find((h) => h.id === bindingFor.id);
    if (bindingFor.type === "key") {
      setKeyBindings((prev) => ({ ...prev, [bindingFor.id]: hk?.key || "" }));
    } else if (bindingFor.type === "global") {
      setGlobalBindings((prev) => ({ ...prev, [bindingFor.id]: hk?.globalKey || hk?.key || "" }));
    } else {
      setFootBindings((prev) => ({ ...prev, [bindingFor.id]: "" }));
    }
    setBindingFor(null);
    setPendingKeys("");
  }, [bindingFor]);

  const handleRemoveBinding = useCallback(() => {
    if (!bindingFor) return;
    if (bindingFor.type === "key") {
      setKeyBindings((prev) => ({ ...prev, [bindingFor.id]: "" }));
    } else if (bindingFor.type === "global") {
      setGlobalBindings((prev) => ({ ...prev, [bindingFor.id]: "" }));
    } else {
      setFootBindings((prev) => ({ ...prev, [bindingFor.id]: "" }));
    }
    setBindingFor(null);
    setPendingKeys("");
  }, [bindingFor]);

  useEffect(() => {
    if (!bindingFor) return;
    document.addEventListener("keydown", handleBinding);
    return () => document.removeEventListener("keydown", handleBinding);
  }, [bindingFor, handleBinding]);

  // Shared action dispatcher — called by keyboard handler and gamepad hook
  const dispatchAction = useCallback((actionId: HotkeyAction) => {
    // Tab/settings/widget actions work from any view
    if (actionId === "tab-1" || actionId === "tab-2" || actionId === "tab-3" || actionId === "settings" || actionId === "toggle-widget") {
      switch (actionId) {
        case "tab-1": setView("beat"); break;
        case "tab-2": setView("drill"); break;
        case "tab-3": setView("track"); break;
        case "settings":
          if (view === "settings") setView(prevTab.current);
          else { prevTab.current = view as "beat" | "drill" | "track"; setView("settings"); }
          break;
        case "toggle-widget":
          showFloating();
          break;
      }
      return;
    }
    if (view === "settings") return;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    switch (actionId) {
      case "play":
        if (view === "drill") {
          if (state.speedRamp?.active) {
            stopSpeedRamp();
          } else {
            configureSpeedRamp({
              startBpm: state.speedRamp.startBpm,
              targetBpm: state.speedRamp.targetBpm,
              increment: state.speedRamp.increment,
              decrement: state.speedRamp.decrement,
              barsPerStep: state.speedRamp.barsPerStep,
              beatsPerBar: state.speedRamp.beatsPerBar,
              mode: state.speedRamp.mode,
              cyclic: state.speedRamp.cyclic,
            });
            setTimeout(() => startSpeedRamp(), 50);
          }
        } else if (view === "beat") {
          togglePlayback();
        }
        break;
      case "bpm-up": handleBpmChange(state.bpm + 5); break;
      case "bpm-down": handleBpmChange(state.bpm - 5); break;
      case "bpm-up-1": handleBpmChange(state.bpm + 1); break;
      case "bpm-down-1": handleBpmChange(state.bpm - 1); break;
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
        const vals = TIME_SIGNATURES.map(t => t.beats);
        const idx = vals.indexOf(state.timeSignature);
        setTimeSignature(vals[(idx + 1) % vals.length]);
        break;
      }
      case "sig-prev": {
        const vals = TIME_SIGNATURES.map(t => t.beats);
        const idx = vals.indexOf(state.timeSignature);
        setTimeSignature(vals[(idx - 1 + vals.length) % vals.length]);
        break;
      }
      case "fullscreen":
        if (view !== "track") {
          if (isFullscreen) {
            (async () => {
              const win = getCurrentWindow();
              if (await win.isFullscreen()) {
                await win.setFullscreen(false);
                await new Promise(r => setTimeout(r, 600));
              }
              setIsFullscreen(false);
              await win.setAlwaysOnTop(state.alwaysOnTop);
              await win.setFocus();
              await forceWebviewFocus();
            })();
          } else {
            setIsFullscreen(true);
          }
        }
        break;
      case "os-fullscreen": {
        (async () => {
          const win = getCurrentWindow();
          const isFull = await win.isFullscreen();
          await win.setFullscreen(!isFull);
          if (isFull) {
            await new Promise(r => setTimeout(r, 800));
            await win.setAlwaysOnTop(state.alwaysOnTop);
            await win.setFocus();
            await forceWebviewFocus();
          }
        })();
        break;
      }
    }
  }, [view, state.bpm, state.subdivision, state.timeSignature, state.speedRamp?.active, isFullscreen, setView]);

  // Unified local hotkey dispatcher — reads from keyBindings
  useEffect(() => {
    if (bindingFor) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      // Escape: exit zen > exit settings (hardcoded — only Escape is hardcoded)
      if (e.key === "Escape") {
        if (isFullscreen) { e.preventDefault(); setIsFullscreen(false); return; }
        if (view === "settings") { e.preventDefault(); setView(prevTab.current); return; }
      }
      const combo = eventToCombo(e);
      if (!combo) return;
      const actionId = Object.entries(keyBindings).find(([_, key]) => key === combo)?.[0] as HotkeyAction | undefined;
      if (!actionId) return;
      e.preventDefault();
      dispatchAction(actionId);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [view, keyBindings, isFullscreen, bindingFor, setView, dispatchAction]);

  // Gamepad / footswitch support
  useGamepad({
    enabled: true,
    onButtonPress: bindingFor?.type === "foot" ? (id) => {
      setFootBindings((prev) => ({ ...prev, [bindingFor.id]: id }));
      setBindingFor(null);
      setPendingKeys("");
    } : undefined,
    bindings: !bindingFor ? footBindings : undefined,
    onAction: !bindingFor ? (id) => dispatchAction(id as HotkeyAction) : undefined,
  });

  // Resize window based on current view
  const sliderPercent = ((state.bpm - 20) / (300 - 20)) * 100;
  const volumePercent = state.volume * 100;

  // Safety net: re-apply always-on-top and focus after any zen exit
  const prevFullscreen = useRef(false);
  useEffect(() => {
    if (prevFullscreen.current && !isFullscreen) {
      const win = getCurrentWindow();
      const timer = setTimeout(async () => {
        if (await win.isFullscreen()) {
          await win.setFullscreen(false);
          await new Promise(r => setTimeout(r, 800));
        }
        await win.setAlwaysOnTop(state.alwaysOnTop);
        await win.setFocus();
        await forceWebviewFocus();
      }, 100);
      return () => clearTimeout(timer);
    }
    prevFullscreen.current = isFullscreen;
  }, [isFullscreen, state.alwaysOnTop]);

  // Fullscreen zen mode
  if (isFullscreen) {
    return <FullscreenView state={state} currentBeat={currentBeat} activeTab={view === "drill" ? "drill" : "beat"} onExit={async () => {
      const win = getCurrentWindow();
      if (await win.isFullscreen()) {
        await win.setFullscreen(false);
        await new Promise(r => setTimeout(r, 600));
      }
      setIsFullscreen(false);
      // alwaysOnTop + focus handled by the effect above
    }} />;
  }

  return (
    <div className="main-window" data-playing={state.isPlaying} data-border={activeBorder}>
      <ThemeEffects themeId={state.theme} />
      <header className="main-header">
        {view !== "settings" && (
          <nav className="tab-bar">
            <button className={`tab-btn ${view === "beat" ? "active" : ""}`} onClick={() => setView("beat")}>Metronome</button>
            <button className={`tab-btn ${view === "drill" ? "active" : ""}`} onClick={() => setView("drill")}>Drill</button>
            <button className={`tab-btn ${view === "track" ? "active" : ""}`} onClick={() => setView("track")}>Tap It!</button>
          </nav>
        )}
        <div className="header-actions">
          {view !== "settings" && view !== "track" && (
            <button className="header-btn" onClick={() => setIsFullscreen(true)} data-tooltip="Zen">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c4-4 8-7.5 8-12a8 8 0 1 0-16 0c0 4.5 4 8 8 12z"/><path d="M12 2v20"/><path d="M4.5 10c2.5 1 5 1 7.5 0s5-1 7.5 0"/></svg>
            </button>
          )}
          <div className="header-volume-wrap">
            <button className="header-btn header-volume-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                {state.volume > 0 && <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>}
                {state.volume > 0.5 && <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>}
              </svg>
            </button>
            <div className="header-volume-popover">
              <input
                type="range"
                className="volume-slider"
                min={0}
                max={100}
                value={volumePercent}
                onChange={(e) => setVolume(parseInt(e.target.value) / 100)}
                style={{ "--volume-pct": `${volumePercent}%` } as React.CSSProperties}
              />
            </div>
          </div>
          <button className="header-btn" onClick={() => showFloating()} data-tooltip="Open widget">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="2"/><rect x="10" y="10" width="10" height="10" rx="1"/></svg>
          </button>
          <div className="header-share-wrap" ref={shareRef}>
            <button ref={shareBtnRef} className="header-btn" onClick={() => setShareOpen(!shareOpen)} data-tooltip={shareTooltip ? "Copied!" : (!shareOpen ? "Share" : undefined)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            </button>
          </div>
          <button
            className={`header-btn ${view === "settings" ? "active" : ""}`}
            onClick={() => {
              if (view === "settings") {
                setView(prevTab.current);
              } else {
                prevTab.current = view as "beat" | "drill" | "track";
                setView("settings");
              }
            }}
            data-tooltip={view === "settings" ? "Back" : "Settings"}
          >
            {view === "settings" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            )}
          </button>
        </div>
      </header>

      {shareOpen && shareBtnRef.current && (() => {
        const rect = shareBtnRef.current!.getBoundingClientRect();
        return (
          <div
            ref={shareRef}
            className="header-share-popover"
            style={{ top: rect.bottom + 8, right: window.innerWidth - rect.right }}
          >
            {SHARE_OPTIONS.map((opt) => (
              <button key={opt.id} className="header-share-option" onClick={() => handleShareOption(opt)}>
                {opt.id === "whatsapp" && <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>}
                {opt.id === "x" && <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>}
                {opt.id === "facebook" && <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>}
                {opt.id === "reddit" && <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>}
                {opt.id === "copy" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>}
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        );
      })()}

      <div ref={contentRef} className="main-content" data-view={view} onDoubleClick={(e) => {
        if (view !== "beat" && view !== "drill") return;
        if ((e.target as HTMLElement).closest("button, input, select, a, .tab-bar, .drill-grid-cell")) return;
        setIsFullscreen(true);
      }}>
        {view === "beat" ? (
          <>
            <section className="bpm-section">
              <div className="bpm-display">
                <button className="bpm-btn" onClick={() => handleBpmChange(state.bpm - 5)}>−</button>
                {editingBpm ? (
                  <input
                    ref={bpmInputRef}
                    type="text"
                    inputMode="numeric"
                    className="bpm-input"
                    value={bpmEditValue}
                    onChange={(e) => setBpmEditValue(e.target.value.replace(/\D/g, ""))}
                    onBlur={commitBpmEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitBpmEdit();
                      if (e.key === "Escape") setEditingBpm(false);
                    }}
                    autoFocus
                  />
                ) : (
                  <span className="bpm-input bpm-clickable" onClick={startBpmEdit}>{state.bpm}</span>
                )}
                <button className="bpm-btn" onClick={() => handleBpmChange(state.bpm + 5)}>+</button>
              </div>
              <div className="bpm-slider-wrap">
                <input
                  type="range"
                  className="bpm-slider"
                  min={20}
                  max={300}
                  value={state.bpm}
                  onChange={(e) => handleBpmChange(parseInt(e.target.value))}
                  style={{ "--slider-pct": `${sliderPercent}%` } as React.CSSProperties}
                />
                <span className="tempo-marking">{getTempoMarking(state.bpm)}</span>
              </div>
            </section>

            <section className="beat-section">
              <div className="main-beat-dots">
                {Array.from({ length: beatsPerMeasure }, (_, beatIdx) => {
                  const isBeatActive = activeBeat === beatIdx && isDownbeat;
                  const isBeatDownbeat = isBeatActive && beatIdx === 0;
                  const isAccentBeat = state.timeSignature === 1 || (beatIdx === 0 && state.timeSignature >= 2);
                  return (
                    <div key={beatIdx} className="main-dot-group">
                      <div className={`main-dot ${isBeatActive ? "active" : ""} ${isBeatDownbeat ? "downbeat" : ""} ${isAccentBeat && isBeatActive ? "accent" : ""}`} />
                      {state.subdivision > 1 && (
                        <div className="main-sub-dots">
                          {Array.from({ length: state.subdivision - 1 }, (_, subIdx) => (
                            <div
                              key={subIdx}
                              className={`main-sub-dot ${
                                activeBeat === beatIdx && activeSub === subIdx + 1 ? "active" : ""
                              }`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="control-section">
              <div className="sub-dropdown-wrapper" ref={dropdownRef}>
                <button className="main-sub-btn" onClick={() => setSubOpen(!subOpen)}>
                  <span className="main-sub-icon">{SUBDIVISION_LABELS[state.subdivision]}</span>
                  <span className="main-sub-name">{SUBDIVISION_NAMES[state.subdivision]}</span>
                  <span className="main-sub-arrow">{subOpen ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3 10l5-6 5 6z"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3 6l5 6 5-6z"/></svg>
                  )}</span>
                </button>
                {subOpen && (
                  <div className="sub-dropdown-menu">
                    {([1, 2, 3, 4, 5, 6] as Subdivision[]).map((sub) => (
                      <button
                        key={sub}
                        className={`sub-dropdown-item ${state.subdivision === sub ? "active" : ""}`}
                        onClick={() => { setSubdivision(sub); setSubOpen(false); }}
                      >
                        <span className="sub-dropdown-icon">{SUBDIVISION_LABELS[sub]}</span>
                        <span>{SUBDIVISION_NAMES[sub]}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="sub-dropdown-wrapper" ref={soundDropdownRef}>
                <button className="main-sub-btn" onClick={() => setSoundOpen(!soundOpen)}>
                  <span className="main-sub-icon">{SOUND_TYPES.find(s => s.id === state.soundType)?.icon ?? "🔔"}</span>
                  <span className="main-sub-name">{SOUND_TYPES.find(s => s.id === state.soundType)?.name ?? "Click"}</span>
                  <span className="main-sub-arrow">{soundOpen ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3 10l5-6 5 6z"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3 6l5 6 5-6z"/></svg>
                  )}</span>
                </button>
                {soundOpen && (
                  <div className="sub-dropdown-menu">
                    {SOUND_TYPES.map((st) => (
                      <button
                        key={st.id}
                        className={`sub-dropdown-item ${state.soundType === st.id ? "active" : ""}`}
                        onClick={() => { setSoundType(st.id); setSoundOpen(false); }}
                      >
                        <span className="sub-dropdown-icon">{st.icon}</span>
                        <span>{st.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <div className="time-sig-row">
              {TIME_SIGNATURES.map((ts) => (
                <button
                  key={ts.beats}
                  className={`time-sig-btn ${state.timeSignature === ts.beats ? "active" : ""}`}
                  onClick={() => setTimeSignature(ts.beats)}
                >
                  {ts.label}
                </button>
              ))}
            </div>
          </>
        ) : view === "drill" ? (
          <DrillView state={state} currentBeat={currentBeat} autoCollapse={drillAutoCollapse} />
        ) : view === "track" ? (
          <TrackView state={state} currentBeat={currentBeat} />
        ) : (
          <>
            <section className="settings-section">
              <h2>General</h2>
              <div className="setting-row">
                <div className="setting-label">
                  <label>Button flash</label>
                  <span className="setting-hint">Flash play button on accents</span>
                </div>
                <button
                  className={`toggle-btn ${buttonFlash ? "active" : ""}`}
                  onClick={() => {
                    const next = !buttonFlash;
                    setButtonFlash(next);
                    storeSave("buttonFlash", next);
                  }}
                >
                  {buttonFlash ? "On" : "Off"}
                </button>
              </div>
              <div className="setting-row">
                <div className="setting-label">
                  <label>Drill auto-collapse</label>
                  <span className="setting-hint">Collapse drill config while playing</span>
                </div>
                <button
                  className={`toggle-btn ${drillAutoCollapse ? "active" : ""}`}
                  onClick={() => {
                    const next = !drillAutoCollapse;
                    setDrillAutoCollapse(next);
                    storeSave("drillAutoCollapse", next);
                  }}
                >
                  {drillAutoCollapse ? "On" : "Off"}
                </button>
              </div>
              <div className="setting-row">
                <div className="setting-label">
                  <label>Active border</label>
                  <span className="setting-hint">Show border when playing</span>
                </div>
                <button
                  className={`toggle-btn ${activeBorder ? "active" : ""}`}
                  onClick={() => {
                    const next = !activeBorder;
                    setActiveBorder(next);
                    storeSave("activeBorder", next);
                  }}
                >
                  {activeBorder ? "On" : "Off"}
                </button>
              </div>
              <div className="setting-row">
                <div className="setting-label">
                  <label>Always on top</label>
                  <span className="setting-hint">Keep main window above other apps</span>
                </div>
                <button
                  className={`toggle-btn ${state.alwaysOnTop ? "active" : ""}`}
                  onClick={() => setAlwaysOnTop(!state.alwaysOnTop)}
                >
                  {state.alwaysOnTop ? "On" : "Off"}
                </button>
              </div>
            </section>

            <section className="settings-section">
              <h2>Widget</h2>
              <div className="setting-row">
                <div className="setting-label">
                  <label>Mode</label>
                  <span className="setting-hint">Widget layout on screen</span>
                </div>
                <div className="toggle-group">
                  {(["compact", "comfortable"] as WidgetMode[]).map((mode) => (
                    <button
                      key={mode}
                      className={`toggle-btn ${state.mode === mode ? "active" : ""}`}
                      onClick={() => setWidgetMode(mode)}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
              <div className="setting-row">
                <div className="setting-label">
                  <label>Always on top</label>
                  <span className="setting-hint">Keep widget visible over other apps</span>
                </div>
                <button
                  className={`toggle-btn ${state.widgetAlwaysOnTop ? "active" : ""}`}
                  onClick={() => setWidgetAlwaysOnTop(!state.widgetAlwaysOnTop)}
                >
                  {state.widgetAlwaysOnTop ? "On" : "Off"}
                </button>
              </div>
            </section>

            <section className="settings-section">
              <h2>Theme</h2>
              <div className="theme-grid">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    className={`theme-card ${state.theme === t.id ? "active" : ""}`}
                    onClick={() => setTheme(t.id)}
                    title={t.name}
                  >
                    <div className="theme-card-preview">
                      {t.preview.map((color, i) => (
                        <div key={i} className="theme-card-swatch" style={{ background: color }} />
                      ))}
                    </div>
                    <span className="theme-card-name">{t.name}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="hotkeys-section">
              <h2>Hotkeys</h2>
              {HOTKEY_GROUPS.map((group) => {
                const items = HOTKEYS.filter((hk) => hk.group === group.key);
                if (items.length === 0) return null;
                return (
                  <div key={group.key} className="hotkey-group">
                    <div className="hotkey-group-label">{group.label}</div>
                    <div className="hotkey-table">
                      <div className="hotkey-table-header">
                        <span>Action</span>
                        <span data-tooltip="Works only when the app is focused">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M6 16h12"/></svg>
                          Key
                        </span>
                        <span data-tooltip="Works even when the app is in the background">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                          Global
                          <span className="hotkey-soon-badge">soon</span>
                        </span>
                        <span data-tooltip="Bind a USB foot pedal or gamepad controller">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="14" width="16" height="6" rx="2"/><path d="M8 14V10a4 4 0 0 1 8 0v4"/></svg>
                          Foot
                        </span>
                      </div>
                      {items.map((hk) => (
                        <div key={hk.id} className="hotkey-row">
                          <span className="hotkey-action" data-tooltip={hk.desc}>{hk.action}</span>
                          <button
                            className={`hotkey-bind-btn ${bindingFor?.id === hk.id && bindingFor.type === "key" ? "listening" : ""}`}
                            onClick={() => {
                              setBindingFor({ id: hk.id, type: "key" });
                              setPendingKeys("");
                            }}
                          >
                            {platformKey(keyBindings[hk.id] || "—")}
                          </button>
                          <button
                            className="hotkey-bind-btn"
                            disabled
                          >
                            {hk.globalAllowed ? platformKey(globalBindings[hk.id] || "—") : "—"}
                          </button>
                          <button
                            className={`hotkey-bind-btn ${bindingFor?.id === hk.id && bindingFor.type === "foot" ? "listening" : ""}`}
                            onClick={() => {
                              setBindingFor({ id: hk.id, type: "foot" });
                              setPendingKeys("");
                            }}
                          >
                            {footBindings[hk.id] ? (isGamepadBinding(footBindings[hk.id]) ? formatGamepadButton(footBindings[hk.id]) : platformKey(footBindings[hk.id])) : "—"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div className="hotkey-defaults-row">
                <button className="hotkey-defaults-btn" onClick={() => setShowResetConfirm(true)}>
                  Reset to defaults
                </button>
              </div>
            </section>

            <section className="settings-section about-section">
              <h2>Support</h2>
              <p className="about-text">
                Yames is free and open source. If it helps your practice, consider supporting development!
              </p>
              <div className="about-links">
                <button className="about-link-btn support-btn" onClick={() => openUrl("https://buymeacoffee.com/turutupa")}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                  Buy me a coffee
                </button>
                <button className="about-link-btn" onClick={() => openUrl("https://github.com/turutupa/yames")}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                  GitHub
                </button>
                <button className="about-link-btn" onClick={() => openUrl("https://turutupa.github.io/yames/")}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                  Website
                </button>
              </div>
              <p className="about-text" style={{ marginTop: 16 }}>
                Know a musician who'd love this? Share it!
              </p>
              <div className="about-links share-row">
                {SHARE_OPTIONS.map((opt) => (
                  <button key={opt.id} className={`about-link-btn share-btn${opt.id === "copy" && shareTooltip ? " copied" : ""}`} onClick={() => handleShareOption(opt)}>
                    {opt.id === "whatsapp" && <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>}
                    {opt.id === "x" && <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>}
                    {opt.id === "facebook" && <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>}
                    {opt.id === "reddit" && <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>}
                    {opt.id === "copy" && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>}
                    {opt.id === "copy" && shareTooltip ? "Copied!" : opt.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="settings-section about-section">
              <h2>About</h2>
              <div className="about-info">
                <div className="about-row"><span className="about-label">Version</span><span className="about-value">0.4.6</span></div>
                <div className="about-row"><span className="about-label">Platform</span><span className="about-value">{navigator.platform}</span></div>
                <div className="about-row"><span className="about-label">User Agent</span><span className="about-value about-value-small">{navigator.userAgent}</span></div>
              </div>
              <div className="about-footer-divider"></div>
              <p className="about-footer">Made with ♥ for musicians everywhere</p>
            </section>
          </>
        )}
      </div>

      {/* Reset keybindings confirmation */}
      {showResetConfirm && (
        <div className="keybinding-overlay" onClick={() => setShowResetConfirm(false)}>
          <div className="keybinding-capture" onClick={(e) => e.stopPropagation()}>
            <span className="keybinding-capture-title">Reset all keybindings?</span>
            <div className="keybinding-capture-display">
              <span className="keybinding-capture-waiting">This will restore all keyboard bindings to their defaults.</span>
            </div>
            <div className="keybinding-capture-actions">
              <button className="keybinding-btn-reset" onClick={resetAllBindings}>Reset</button>
              <button className="keybinding-btn-remove" onClick={() => setShowResetConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Floating play button for Metronome and Drill */}
      {(view === "beat" || view === "drill") && (
        <button
          className={`floating-play-btn ${(state.isPlaying || state.speedRamp?.active) ? "playing" : ""} ${isPulsing ? "pulse" : ""}`}
          onClick={() => {
            if (view === "drill") {
              if (state.speedRamp?.active) stopSpeedRamp();
              else startSpeedRamp();
            } else {
              togglePlayback();
            }
          }}
        >
          {(view === "drill" ? state.speedRamp?.active : state.isPlaying) ? (
            <><svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="2" width="12" height="12" rx="1.5"/></svg> Stop</>
          ) : (
            <><svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5a.5.5 0 0 1 .77-.42l9 5.5a.5.5 0 0 1 0 .84l-9 5.5A.5.5 0 0 1 4 13.5z"/></svg> Play</>
          )}
        </button>
      )}

      {bindingFor && (
        <div className="keybinding-overlay" onClick={() => { setBindingFor(null); setPendingKeys(""); }}>
          <div className="keybinding-capture" onClick={(e) => e.stopPropagation()}>
            <span className="keybinding-capture-title">
              {HOTKEYS.find((hk) => hk.id === bindingFor.id)?.action} — {bindingFor.type === "key" ? "Keyboard" : bindingFor.type === "global" ? "Global" : "Footswitch"}
            </span>
            <div className="keybinding-capture-display">
              {pendingKeys ? (
                <span className="keybinding-capture-keys">{pendingKeys}</span>
              ) : (
                <span className="keybinding-capture-waiting">
                  {bindingFor.type === "foot"
                    ? "Press a button on your foot pedal or gamepad…"
                    : "Press desired key combination…"}
                </span>
              )}
            </div>
            <div className="keybinding-capture-actions">
              <button className="keybinding-btn-reset" onClick={handleResetBinding}>Reset to default</button>
              <button className="keybinding-btn-remove" onClick={handleRemoveBinding}>Remove</button>
            </div>
            <span className="keybinding-capture-hint">Press Escape to cancel</span>
          </div>
        </div>
      )}
    </div>
  );
}
