import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDrag } from "../../hooks/useDrag";
import {
  formatGamepadButton,
  useGamepad,
} from "../../hooks/useGamepad";
import { useMidi } from "../../hooks/useMidi";
import { useMetronome } from "../../hooks/useMetronome";
import { useKeybindings } from "../../hooks/useKeybindings";
import { useCoachDownload } from "../../hooks/useCoachDownload";
import { useActionDispatcher } from "../../hooks/useActionDispatcher";
import {
  configureSpeedRamp,
  downloadAndInstallUpdate,
  setAlwaysOnTop,
  setBpm,
  setInstrument as setInstrumentBackend,
  setSoundType,
  setSubdivision,
  setTheme,
  setBeatGroups,
  setVolume,
  setWidgetAlwaysOnTop,
  setWidgetMode,
  startSpeedRamp,
  stopSpeedRamp,
  storeLoad,
  storeSave,
  togglePlayback,
} from "../../ipc";
import CoachCard from "../practice-coach/CoachCard";
import "../../styles/main-window.css";
import "../../styles/transitions.css";
import "../../styles/evaluation.css";
import type { InstrumentId, Preset, Subdivision } from "../../types";
import { InstrumentPickerModal } from "../../components/InstrumentPickerModal";
import { DrillView } from "../drill/DrillView";
import { FullscreenView } from "../zen/FullscreenView";
import { PresetSidebar } from "../../components/presets/PresetSidebar";
import type { PresetSidebarHandle } from "../../components/presets/PresetSidebar";
import { ThemeEffects } from "./ThemeEffects";
import { MetronomeView } from "../metronome/MetronomeView";
import { MainHeader } from "./MainHeader";
import { PresetSaveBar } from "../../components/presets/PresetSaveBar";
import { FloatingPlayButton } from "./FloatingPlayButton";
import { TrackView } from "../pocket-check/TrackView";
import { ViewTransition } from "../../components/ViewTransition";
import { ZenTransition } from "../zen/ZenTransition";
import { useEvaluation } from "../../hooks/useEvaluation";
import { useSession } from "../../hooks/useSession";
import AudioInputTestModal from "../settings/AudioInputTestModal";
import SettingsTimeline from "../settings/SettingsTimeline";
import { InputTesterModal } from "../settings/InputTesterModal";
import { useShareMenu } from "./useShareMenu";
import { ShareMenuPopover } from "./ShareMenuPopover";
import { useUiPreferences } from "./hooks/useUiPreferences";
import { useAudioOutputDevices } from "./hooks/useAudioOutputDevices";
import { useFullscreenLifecycle } from "./hooks/useFullscreenLifecycle";
import { useAppUpdates } from "./hooks/useAppUpdates";
import { useTabRouting } from "./hooks/useTabRouting";
import { useDownbeatPulse } from "./hooks/useDownbeatPulse";
import { useInputTester } from "./hooks/useInputTester";
import {
  CoachDownloadConfirmDialog,
  DownloadProgressBar,
  DownloadErrorBar,
  DownloadSuccessBar,
} from "../settings/CoachDownloadStatus";
import {
  ResetKeybindingsConfirm,
  MidiConflictDialog,
  KeybindingCaptureModal,
} from "../settings/KeybindingModals";
import { SettingsView } from "../settings/SettingsView";
import {
  HOTKEYS,
  IS_MAC,
  FULLSCREEN_EXIT_DELAY,
  platformKey,
  eventToCombo,
} from "../../hotkeys";
import type { HotkeyAction } from "../../hotkeys";
import "../../styles/audio-input-test.css";

export function MainWindow() {
  const { t } = useTranslation();
  useDrag();
  const { state, currentBeat } = useMetronome();
  // Practice Coach model + voice state (must come before useEvaluation so
  // coachMode is available when wiring the startEvaluation IPC call).
  const coach = useCoachDownload();
  const [inputTestOpen, setInputTestOpen] = useState(false);
  const evaluation = useEvaluation({ coachMode: coach.coachMode });
  // Active tab + transition rules (stop playback on tab change, persist,
  // restore on mount, scroll-to-top for track/settings) — owned by a
  // dedicated hook. `contentRef` is also returned so the scrollable
  // content container can be wired directly to it.
  const { view, setView, prevTab, contentRef } = useTabRouting({
    isPlaying: state.isPlaying,
    speedRampActive: !!state.speedRamp?.active,
  });
  // Fullscreen / zen-mode lifecycle (intended state, OS-level state, and
  // the webview-focus restoration helper) — owned by a dedicated hook.
  const {
    isFullscreen,
    setIsFullscreen,
    isOsFullscreen,
    setIsOsFullscreen,
    forceWebviewFocus,
  } = useFullscreenLifecycle({ view, alwaysOnTop: state.alwaysOnTop });
  const {
    shareOpen,
    setShareOpen,
    shareTooltip,
    shareRef,
    shareBtnRef,
    handleShareOption,
  } = useShareMenu();
  const [soundOpen, setSoundOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Note: WKWebView occasionally leaves the OS cursor "stale" for a
  // few frames after the sidebar's width transition or a play/pause
  // toggle (the cursor reappears on the next mousemove). It's a
  // purely cosmetic platform quirk — no memory leak, no functional
  // bug — so we let it ride rather than maintaining a setTimeout-
  // chain JS workaround. If users complain we can re-introduce a
  // dedicated hook for it.
  const sidebarRef = useRef<PresetSidebarHandle>(null);
  const [activePreset, setActivePreset] = useState<Preset | null>(null);
  const [presetDirty, setPresetDirty] = useState(false);
  const [updateFeedback, setUpdateFeedback] = useState(false);
  const updateFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [instrument, setInstrument] = useState("electric-guitar");
  // First-launch instrument picker (D0). Shown when the store has no
  // `instrument` value yet. On pick: persist + push to backend so the
  // DSP profile is live for the first practice segment. On dismiss:
  // fall back to electric guitar (the statistically most likely user)
  // and let the user change it later in Settings.
  const [showInstrumentPicker, setShowInstrumentPicker] = useState(false);

  const session = useSession({
    evaluation,
    isPlaying: state.isPlaying,
    bpm: state.bpm,
    timeSignature: state.timeSignature,
    presetId: activePreset?.id,
    presetName: activePreset?.name,
    voiceMode: coach.coachVoiceMode,
    coachVerbosity: coach.coachVerbosity,
    coachMode: coach.coachMode,
    instrument,
    // Phase 5 — chip "set-bpm" affordances delegate to the canonical
    // BPM IPC. The hook is `setBpm`-agnostic; we pass the IPC fn so
    // chip taps reach the metronome cleanly without going through the
    // adapter dance.
    setBpm,
    // Drill ramp silence: active && !completed means the ramp is still
    // climbing. completed is set by the backend when the ramp finishes
    // (stays true even as active stays true until the user stops).
    inDrillRamp: !!(state.speedRamp?.active && !state.speedRamp?.completed),
    drillStartBpm: state.speedRamp?.startBpm,
    drillTargetBpm: state.speedRamp?.targetBpm,
    drillCompleted: state.speedRamp?.completed ?? false,
  });

  const handleActivePresetChange = useCallback((preset: Preset | null, dirty: boolean) => {
    setActivePreset(preset);
    setPresetDirty(dirty);
  }, []);

  const handlePresetSave = useCallback(() => {
    setSidebarOpen(true);
    // Small delay so the sidebar slide-in finishes before the input appears
    setTimeout(() => sidebarRef.current?.triggerAdd(), 150);
  }, []);

  const handlePresetUpdate = useCallback(() => {
    sidebarRef.current?.triggerUpdate();
    if (updateFeedbackTimer.current) clearTimeout(updateFeedbackTimer.current);
    setUpdateFeedback(true);
    updateFeedbackTimer.current = setTimeout(() => setUpdateFeedback(false), 1800);
  }, []);



  const {
    keyBindings,
    footBindings,
    setFootBindings,
    globalBindings,
    bindingFor,
    setBindingFor,
    pendingKeys,
    setPendingKeys,
    pendingKeyConflict,
    setPendingKeyConflict,
    showResetConfirm,
    setShowResetConfirm,
    resetAllBindings,
    handleResetBinding,
    handleRemoveBinding,
    acceptKeyConflict,
    rejectKeyConflict,
  } = useKeybindings();

  // Unified input tester — modal that captures keyboard/MIDI/gamepad and
  // shows the mapped action. State, log buffer and the auto-scrolling
  // `appendLog` helper all live in the dedicated hook.
  const {
    inputTestMode,
    setInputTestMode,
    inputTestLog,
    inputTestLogRef,
    inputTestModeRef,
    appendLog: appendInputTestLog,
    clearLog: clearInputTestLog,
  } = useInputTester();

  // UI preferences (buttonFlash, activeBorder, drillAutoCollapse,
  // viewTransitions, animationStyle) — owned by a dedicated hook that
  // hydrates them from the store on mount. Destructured here so the rest
  // of MainWindow keeps referencing them as bare variables.
  const {
    buttonFlash,
    setButtonFlash,
    activeBorder,
    setActiveBorder,
    drillAutoCollapse,
    setDrillAutoCollapse,
    viewTransitions,
    setViewTransitions,
    animationStyle,
    setAnimationStyle,
  } = useUiPreferences();
  // Audio output device list + selection — owned by a dedicated hook that
  // hydrates from the OS + persisted store and listens for hot-plug events.
  const {
    audioOutputDevices,
    setAudioOutputDevices,
    selectedOutputDevice,
    setSelectedOutputDevice,
  } = useAudioOutputDevices();
  // Auto-update preference, app version, banner status, and the
  // "Check now" callback — owned by a dedicated hook that hydrates the
  // preference, fetches the version, and (when allowed) auto-checks on
  // mount.
  const {
    autoCheckUpdates,
    setAutoCheckUpdates,
    appVersion,
    latestVersion,
    updateStatus,
    setUpdateStatus,
    doUpdateCheck,
  } = useAppUpdates();

  // Restore instrument from store on mount (other prefs are hydrated by
  // their dedicated hooks: useUiPreferences, useAudioOutputDevices,
  // useAppUpdates).
  useEffect(() => {
    (async () => {
      const inst = await storeLoad<string>("instrument");
      if (inst) {
        setInstrument(inst);
      } else {
        // No saved instrument → first launch. Show the picker so the
        // user makes an explicit choice rather than silently inheriting
        // a default (D0 first-launch UX rule).
        setShowInstrumentPicker(true);
      }
    })();
  }, []);

  const [editingBpm, setEditingBpm] = useState(false);
  const [bpmEditValue, setBpmEditValue] = useState("");
  const bpmInputRef = useRef<HTMLInputElement>(null);
  // Tab switching and settings are handled by the unified dispatcher via keyBindings
  const soundDropdownRef = useRef<HTMLDivElement>(null);

  const beatsPerMeasure = Math.max(2, (state.beatGroups ?? [state.timeSignature]).reduce((a: number, b: number) => a + b, 0));
  const activeBeat = currentBeat ? currentBeat.beat % beatsPerMeasure : -1;
  const activeSub = currentBeat ? currentBeat.subdivision : -1;
  const isDownbeat = currentBeat?.isDownbeat ?? false;

  const handleBpmChange = (value: number) => {
    const clamped = Math.max(20, Math.min(300, value));
    setBpm(clamped);
  };

  const { isPulsing, tapPulse, handleTap, tapCount, tapActive } =
    useDownbeatPulse({
      buttonFlash,
      isPlaying: state.isPlaying,
      currentBeat,
      onBpmDetected: handleBpmChange,
    });

  const handleLoadPreset = useCallback(async (preset: Preset) => {
    await setBpm(preset.bpm);
    await setSubdivision(preset.subdivision as Subdivision);
    await setBeatGroups(preset.beatGroups ?? [preset.timeSignature]);
    await setSoundType(preset.soundType);
    await setVolume(preset.volume);
    if (preset.view === "drill" && preset.speedRamp) {
      await configureSpeedRamp({
        startBpm: preset.speedRamp.startBpm,
        targetBpm: preset.speedRamp.targetBpm,
        increment: preset.speedRamp.increment,
        decrement: preset.speedRamp.decrement,
        barsPerStep: preset.speedRamp.barsPerStep,
        beatsPerBar: preset.speedRamp.beatsPerBar,
        mode: preset.speedRamp.mode,
        cyclic: preset.speedRamp.cyclic,
        warmupBeats: preset.speedRamp.warmupBeats,
      });
    }
    if (preset.view === "drill" || preset.view === "beat") setView(preset.view);
  }, [setView]);

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
    if (!soundOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        soundDropdownRef.current &&
        !soundDropdownRef.current.contains(e.target as Node)
      ) {
        setSoundOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [soundOpen]);

  // Shared action dispatcher — called by keyboard handler and gamepad hook
  const dispatchAction = useActionDispatcher({
    view,
    setView,
    prevTab,
    state,
    isFullscreen,
    setIsFullscreen,
    setIsOsFullscreen,
    setSidebarOpen,
    toggleCard: session.toggleCard,
    forceWebviewFocus,
  });

  // Unified local hotkey dispatcher — reads from keyBindings
  useEffect(() => {
    if (bindingFor) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      // Escape: close tester > exit zen > exit settings
      if (e.key === "Escape") {
        if (inputTestMode) {
          setInputTestMode(false);
          return;
        }
        if (isFullscreen) {
          e.preventDefault();
          setIsFullscreen(false);
          return;
        }
        if (view === "settings") {
          e.preventDefault();
          setView(prevTab.current);
          return;
        }
      }
      const combo = eventToCombo(e);
      if (!combo) return;
      const actionId = Object.entries(keyBindings).find(
        ([_, key]) => key === combo,
      )?.[0] as HotkeyAction | undefined;
      // Feed tester if open
      if (inputTestMode) {
        if (["Meta", "Control", "Alt", "Shift"].includes(e.key)) return;
        e.preventDefault();
        const hk = actionId ? HOTKEYS.find((h) => h.id === actionId) : null;
        appendInputTestLog({
          source: "keyboard",
          label: combo,
          action: hk ? t(`settings.hotkeys.actions.${hk.id}`) : undefined,
        });
        return;
      }
      if (!actionId) return;
      e.preventDefault();
      dispatchAction(actionId);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [view, keyBindings, isFullscreen, bindingFor, setView, dispatchAction, inputTestMode]);

  // MIDI controller support. The dispatcher is silenced while the input
  // tester is open by reading `inputTestModeRef` (the ref pattern keeps
  // the useMidi callback's closure stable so it doesn't re-subscribe on
  // every toggle).
  const [midiAutoAccept, setMidiAutoAccept] = useState(false);

  const midi = useMidi((action) => {
    if (inputTestModeRef.current) return;
    dispatchAction(action as HotkeyAction);
  }, midiAutoAccept, inputTestMode);

  // Accumulate MIDI activity into the tester log when test mode is on.
  useEffect(() => {
    if (!midi.lastActivity) return;
    if (inputTestMode) {
      const activity = midi.lastActivity;
      const bound = midi.bindings.find(
        (b) => b.msgType === activity.type && b.number === activity.number && b.channel === activity.channel,
      );
      const hk = bound ? HOTKEYS.find((h) => h.id === bound.action) : null;
      appendInputTestLog({
        source: "midi",
        label: `${activity.type.toUpperCase()} #${activity.number}`,
        detail: `Ch${activity.channel + 1} Val${activity.value}`,
        action: hk ? t(`settings.hotkeys.actions.${hk.id}`) : undefined,
      });
    }
  }, [inputTestMode, midi.lastActivity]);

  // Gamepad / footswitch support (merged into MIDI column)
  useGamepad({
    enabled: true,
    onButtonPress:
      midi.learnMode
        ? (id) => {
            setFootBindings((prev) => ({ ...prev, [midi.learnMode!]: id }));
            midi.cancelLearn();
          }
        : inputTestMode
        ? (id) => {
            const actionId = Object.entries(footBindings).find(([_, b]) => b === id)?.[0];
            const hk = actionId ? HOTKEYS.find((h) => h.id === actionId) : null;
            appendInputTestLog({
              source: "gamepad",
              label: formatGamepadButton(id),
              action: hk ? t(`settings.hotkeys.actions.${hk.id}`) : undefined,
            });
          }
        : undefined,
    bindings: !midi.learnMode && !inputTestMode ? footBindings : undefined,
    onAction: !midi.learnMode && !inputTestMode
      ? (id) => dispatchAction(id as HotkeyAction)
      : undefined,
  });

  // Resize window based on current view
  const sliderPercent = ((state.bpm - 20) / (300 - 20)) * 100;
  // Round to an integer for display — the slider operates on integers and
  // the popover shouldn't ever show fractional percent values.
  const volumePercent = Math.round(state.volume * 100);

  // Fullscreen zen mode — rendered as overlay via ZenTransition below
  const zenExitHandler = useCallback(async () => {
    const win = getCurrentWindow();
    if (await win.isFullscreen()) {
      await win.setFullscreen(false);
      await new Promise((r) => setTimeout(r, FULLSCREEN_EXIT_DELAY));
    }
    setIsFullscreen(false);
    // alwaysOnTop + focus handled by the effect above
  }, []);

  return (
    <>
    <ZenTransition isActive={isFullscreen} themeId={state.theme} disabled={viewTransitions === "off"} level={viewTransitions} animStyle={animationStyle}>
      <FullscreenView
        state={state}
        currentBeat={currentBeat}
        activeTab={view === "drill" ? "drill" : "beat"}
        onExit={zenExitHandler}
      />
    </ZenTransition>
    <div
      className={`main-window ${isOsFullscreen ? "os-fullscreen" : ""} ${IS_MAC ? "os-mac" : "os-other"}`}
      data-playing={state.isPlaying}
      data-border={activeBorder}
    >
      <ThemeEffects themeId={state.theme} currentBeat={currentBeat} isPlaying={state.isPlaying} />
      <MainHeader
        state={state}
        view={view}
        setView={setView}
        prevTab={prevTab}
        setIsFullscreen={setIsFullscreen}
        soundOpen={soundOpen}
        setSoundOpen={setSoundOpen}
        soundDropdownRef={soundDropdownRef}
        shareRef={shareRef}
        shareBtnRef={shareBtnRef}
        shareOpen={shareOpen}
        setShareOpen={setShareOpen}
        shareTooltip={shareTooltip}
        volumePercent={volumePercent}
        ttsVolume={coach.ttsVolume}
        setTtsVolume={coach.setTtsVolume}
        voiceEnabled={
          coach.coachBrainTier !== "off" &&
          coach.coachVoiceMode === "voice" &&
          !!coach.modelStatus?.voiceReady
        }
      />

      {shareOpen && (
        <ShareMenuPopover
          anchorRef={shareBtnRef}
          popoverRef={shareRef}
          onSelect={handleShareOption}
        />
      )}

      <div className="main-body">
        {view !== "settings" && view !== "track" && (
          <PresetSidebar
            ref={sidebarRef}
            state={state}
            view={view === "beat" || view === "drill" ? view : "beat"}
            isOpen={sidebarOpen}
            onToggle={() => setSidebarOpen((o) => !o)}
            onLoadPreset={handleLoadPreset}
            onActiveChange={handleActivePresetChange}
            shortcut={platformKey(keyBindings["toggle-sidebar"] || "")}
          />
        )}
      <div
        ref={contentRef}
        className="main-content"
        data-view={view}
        onDoubleClick={(e) => {
          if (view !== "beat" && view !== "drill") return;
          if (
            (e.target as HTMLElement).closest(
              "button, input, select, a, .tab-bar, .drill-grid-cell",
            )
          )
            return;
          setIsFullscreen(true);
        }}
      >
        {(view === "beat" || view === "drill") && (
          <PresetSaveBar
            activePreset={activePreset}
            presetDirty={presetDirty}
            updateFeedback={updateFeedback}
            onRename={(presetId) => {
              setSidebarOpen(true);
              setTimeout(() => sidebarRef.current?.triggerRename(presetId), 150);
            }}
            onUpdate={handlePresetUpdate}
            onSave={handlePresetSave}
          />
        )}
        <ViewTransition viewKey={view} themeId={state.theme} disabled={viewTransitions === "off"} level={viewTransitions} animStyle={animationStyle}>
        {view === "beat" ? (
          <MetronomeView
            state={state}
            currentBeat={currentBeat}
            evaluation={evaluation}
            beatsPerMeasure={beatsPerMeasure}
            activeBeat={activeBeat}
            activeSub={activeSub}
            isDownbeat={isDownbeat}
            sliderPercent={sliderPercent}
            tapActive={tapActive}
            tapCount={tapCount}
            tapPulse={tapPulse}
            editingBpm={editingBpm}
            bpmEditValue={bpmEditValue}
            setBpmEditValue={setBpmEditValue}
            setEditingBpm={setEditingBpm}
            bpmInputRef={bpmInputRef}
            onTap={handleTap}
            onBpmChange={handleBpmChange}
            onStartBpmEdit={startBpmEdit}
            onCommitBpmEdit={commitBpmEdit}
          />
        ) : view === "drill" ? (
          <DrillView
            state={state}
            currentBeat={currentBeat}
            autoCollapse={drillAutoCollapse}
            animations={viewTransitions !== "off"}
          />
        ) : view === "track" ? (
          <TrackView state={state} currentBeat={currentBeat} evaluationEnabled={evaluation.enabled} />
        ) : (
          <SettingsView
            updateStatus={updateStatus}
            setUpdateStatus={setUpdateStatus}
            latestVersion={latestVersion}
            appVersion={appVersion}
            doUpdateCheck={doUpdateCheck}
            downloadAndInstallUpdate={downloadAndInstallUpdate}
            autoCheckUpdates={autoCheckUpdates}
            setAutoCheckUpdates={setAutoCheckUpdates}
            alwaysOnTop={state.alwaysOnTop}
            setAlwaysOnTop={setAlwaysOnTop}
            buttonFlash={buttonFlash}
            setButtonFlash={setButtonFlash}
            activeBorder={activeBorder}
            setActiveBorder={setActiveBorder}
            drillAutoCollapse={drillAutoCollapse}
            setDrillAutoCollapse={setDrillAutoCollapse}
            themeId={state.theme}
            setTheme={setTheme}
            viewTransitions={viewTransitions}
            setViewTransitions={setViewTransitions}
            animationStyle={animationStyle}
            setAnimationStyle={setAnimationStyle}
            audioOutputDevices={audioOutputDevices}
            setAudioOutputDevices={setAudioOutputDevices}
            selectedOutputDevice={selectedOutputDevice}
            setSelectedOutputDevice={setSelectedOutputDevice}
            evaluation={evaluation}
            midi={midi}
            onOpenInputTest={() => setInputTestOpen(true)}
            coachBrainTier={coach.coachBrainTier}
            setCoachBrainTier={coach.setCoachBrainTier}
            coachVoiceMode={coach.coachVoiceMode}
            setCoachVoiceMode={coach.setCoachVoiceMode}
            coachVoiceName={coach.coachVoiceName}
            setCoachVoiceName={coach.setCoachVoiceName}
            coachVerbosity={coach.coachVerbosity}
            setCoachVerbosity={coach.setCoachVerbosity}
            coachMode={coach.coachMode}
            setCoachMode={coach.setCoachMode}
            modelStatus={coach.modelStatus}
            setModelStatus={coach.setModelStatus}
            modelDownloading={coach.modelDownloading}
            availableVoices={coach.availableVoices}
            voiceDiagnostics={coach.voiceDiagnostics}
            instrument={instrument}
            setInstrument={setInstrument}
            onStartDownload={coach.handleStartDownload}
            onRequestDownload={coach.setPendingDownloadTier}
            widgetMode={state.mode}
            setWidgetMode={setWidgetMode}
            widgetAlwaysOnTop={state.widgetAlwaysOnTop}
            setWidgetAlwaysOnTop={setWidgetAlwaysOnTop}
            keyBindings={keyBindings}
            globalBindings={globalBindings}
            footBindings={footBindings}
            bindingFor={bindingFor}
            setBindingFor={setBindingFor}
            setPendingKeys={setPendingKeys}
            inputTestMode={inputTestMode}
            setInputTestMode={setInputTestMode}
            onResetRequest={() => setShowResetConfirm(true)}
            shareTooltip={shareTooltip}
            onShareOption={handleShareOption}
          />
        )}
        </ViewTransition>
        {view === "settings" && (
          <SettingsTimeline
            sections={[
              { id: "general", label: t("settings.tabs.general") },
              { id: "appearance", label: t("settings.tabs.appearance") },
              { id: "devices", label: t("settings.tabs.devices") },
              { id: "smart-coach", label: t("settings.tabs.smartCoach") },
              { id: "widget", label: t("settings.tabs.widget") },
              { id: "hotkeys", label: t("settings.tabs.hotkeys") },
              { id: "support", label: t("settings.tabs.support") },
              { id: "about", label: t("settings.tabs.about") },
            ]}
            containerRef={contentRef}
          />
        )}
        {/* Floating play button for Metronome and Drill */}
        {(view === "beat" || view === "drill") && (
          <FloatingPlayButton
            view={view}
            isPlaying={state.isPlaying}
            speedRampActive={state.speedRamp?.active ?? false}
            isPulsing={isPulsing}
            onTogglePlayback={() => togglePlayback()}
            onStartSpeedRamp={() => startSpeedRamp()}
            onStopSpeedRamp={() => stopSpeedRamp()}
          />
        )}
      </div>
      {(view === "beat" || view === "drill") && (
      <CoachCard
        open={session.cardOpen}
        active={session.active}
        messages={session.messages}
        onToggle={session.toggleCard}
        onStartSession={session.startSession}
        onEndSession={session.endSession}
        onSendChat={session.sendChat}
        onChipAction={session.handleChipAction}
        onRegisterChatFocus={session.registerChatFocus}
        listening={evaluation.enabled}
        hasSignal={evaluation.hasSignal}
        spectrum={evaluation.spectrum}
        isPlaying={state.isPlaying}
        onPause={() => state.isPlaying && togglePlayback()}
        inferredGrid={evaluation.inferredGrid}
        playMode={session.playMode}
      />
      )}
      </div>{/* main-body */}
      {showResetConfirm && (
        <ResetKeybindingsConfirm
          onConfirm={resetAllBindings}
          onCancel={() => setShowResetConfirm(false)}
        />
      )}

      {midi.pendingConflict && (
        <MidiConflictDialog
          conflict={midi.pendingConflict}
          autoAccept={midiAutoAccept}
          onAutoAcceptChange={setMidiAutoAccept}
          onAccept={() => midi.acceptConflict()}
          onReject={() => midi.rejectConflict()}
        />
      )}

      {bindingFor && (
        <KeybindingCaptureModal
          target={bindingFor}
          pendingKeys={pendingKeys}
          pendingKeyConflict={pendingKeyConflict}
          onDismiss={() => {
            setBindingFor(null);
            setPendingKeys("");
            setPendingKeyConflict(null);
          }}
          onResetToDefault={handleResetBinding}
          onRemove={handleRemoveBinding}
          onAcceptConflict={acceptKeyConflict}
          onRejectConflict={rejectKeyConflict}
        />
      )}

      {/* Unified input tester modal */}
      {inputTestMode && (
        <InputTesterModal
          log={inputTestLog}
          logRef={inputTestLogRef}
          onClose={() => setInputTestMode(false)}
          onClear={clearInputTestLog}
        />
      )}

      {coach.pendingDownloadTier && (
        <CoachDownloadConfirmDialog
          pendingTier={coach.pendingDownloadTier}
          modelStatus={coach.modelStatus}
          onCancel={() => coach.setPendingDownloadTier(null)}
          onUseInstalled={(tier) => {
            coach.setCoachBrainTier(tier);
            storeSave("coachBrainTier", tier);
            coach.setPendingDownloadTier(null);
          }}
          onStartDownload={coach.handleStartDownload}
        />
      )}

      {coach.modelDownloading && (
        <DownloadProgressBar
          downloadProgress={coach.downloadProgress}
          downloadingTier={coach.downloadingTier}
          onCancel={() => coach.cancelDownload()}
        />
      )}

      {coach.downloadError && (
        <DownloadErrorBar
          error={coach.downloadError}
          onDismiss={() => coach.setDownloadError(null)}
        />
      )}

      {coach.downloadSuccess && !coach.modelDownloading && (
        <DownloadSuccessBar onDismiss={() => coach.setDownloadSuccess(false)} />
      )}
    </div>
    <AudioInputTestModal
      open={inputTestOpen}
      onClose={() => setInputTestOpen(false)}
      selectedDevice={evaluation.selectedDevice}
      onDeviceChange={(d) => evaluation.selectDevice(d)}
      initialDevices={evaluation.devices}
      evaluationActive={evaluation.enabled}
      inputChannel={evaluation.selectedChannel}
      onChannelChange={(ch) => evaluation.selectChannel(ch)}
    />
    {showInstrumentPicker && (
      <InstrumentPickerModal
        onPick={(id) => {
          setInstrument(id);
          storeSave("instrument", id);
          setInstrumentBackend(id as InstrumentId).catch(() => {});
          setShowInstrumentPicker(false);
        }}
        onDismiss={() => {
          // Plan D0 default on dismiss: electric-guitar (the
          // statistically most likely user). The Settings dropdown
          // stays available for change later.
          const fallback: InstrumentId = "electric-guitar";
          setInstrument(fallback);
          storeSave("instrument", fallback);
          setInstrumentBackend(fallback).catch(() => {});
          setShowInstrumentPicker(false);
        }}
      />
    )}
    </>
  );
}
