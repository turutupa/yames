import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  armCountIn,
  configureSpeedRamp,
  downloadAndInstallUpdate,
  setAlwaysOnTop,
  setBpm,
  setInstrument as setInstrumentBackend,
  setSoundType,
  setSubdivision,
  setTheme,
  setBeatGroups,
  setFreeMode,
  setVolume,
  showFloating,
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
import type { BrainTier, InstrumentId, ModelTier, Preset, Subdivision } from "../../types";
import { OnboardingWizard } from "../onboarding/OnboardingWizard";
import type { WizardCoachEnv, WizardEvaluationEnv } from "../onboarding/WizardContext";
import { FinishSetupChip } from "../onboarding/FinishSetupChip";
import { useOnboarding } from "../onboarding/useOnboarding";
import { CoachVoiceToast } from "../onboarding/CoachVoiceToast";
import { useVoicePrompt } from "../onboarding/useVoicePrompt";
import { HintCard } from "../onboarding/hints/HintCard";
import { useAppHints } from "../onboarding/hints/useAppHints";
import { markWidgetOpened } from "../onboarding/hints/hintRuntime";
import { Tour } from "../onboarding/tour/Tour";
import { TourOfferToast } from "../onboarding/tour/TourOfferToast";
import { useTour } from "../onboarding/tour/useTour";
import { HelpMenu } from "../onboarding/help/HelpMenu";
import { ShortcutsSheet } from "../onboarding/help/ShortcutsSheet";
import { useHelpMenu } from "../onboarding/help/useHelpMenu";
import { WhatsNewModal } from "../onboarding/whats-new/WhatsNewModal";
import { useWhatsNew } from "../onboarding/whats-new/useWhatsNew";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { DrillView } from "../drill/DrillView";
import { JamView } from "../jam/JamView";
import { JamEmpty } from "../jam/JamEmpty";
import { FullscreenView } from "../zen/FullscreenView";
import type { PresetSidebarHandle } from "../../components/presets/PresetSidebar";
import { ThemeEffects } from "./ThemeEffects";
import { MetronomeView } from "../metronome/MetronomeView";
import { MetronomeFigure } from "../metronome/MetronomeFigure";
import { MainHeader } from "./MainHeader";
import { TitleBar } from "../../components/TitleBar";
import { Rail } from "./Rail";
import { Transport } from "./Transport";
import { ViewTransition } from "../../components/ViewTransition";
import { ZenTransition } from "../zen/ZenTransition";
import { useEvaluation } from "../../hooks/useEvaluation";
import { useSession } from "../../hooks/useSession";
import AudioInputTestModal from "../settings/AudioInputTestModal";
import SettingsTimeline from "../settings/SettingsTimeline";
import { InputTesterModal } from "../settings/InputTesterModal";
import { coachDebug } from "../../coach/debug";
import { presetBeatGroups, presetFreeMode } from "../../utils/meter";
import { formBars } from "../../jam/forms";
import { useShareMenu } from "./useShareMenu";
import { ShareMenuPopover } from "./ShareMenuPopover";
import { useUiPreferences } from "./hooks/useUiPreferences";
import { useAudioOutputDevices } from "./hooks/useAudioOutputDevices";
import { useFullscreenLifecycle } from "./hooks/useFullscreenLifecycle";
import { useAppUpdates } from "./hooks/useAppUpdates";
import { useTabRouting } from "./hooks/useTabRouting";
import { useDownbeatPulse } from "./hooks/useDownbeatPulse";
import { useInputTester } from "./hooks/useInputTester";
import { useSoftClickPreview, SOFT_CLICK_BPM } from "./hooks/useSoftClickPreview";
import { useBpmEditing } from "./hooks/useBpmEditing";
import { usePlaybackClock } from "./hooks/usePlaybackClock";
import { useLibraryFit } from "./hooks/useLibraryFit";
import { useSetlistSession } from "./hooks/useSetlistSession";
import { useJamSession } from "./hooks/useJamSession";
import { UnsavedChangesDialog } from "../../components/UnsavedChangesDialog";
import { SetlistEmpty } from "../../components/setlist/SetlistEmpty";
import { SetlistParagraph } from "../../components/setlist/SetlistParagraph";
import { SetlistPlayer } from "../../components/setlist/SetlistPlayer";
import { useAudioError } from "./hooks/useAudioError";
import { AudioErrorNotice } from "./AudioErrorNotice";
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
  IS_WINDOWS,
  IS_LINUX,
  FULLSCREEN_EXIT_DELAY,
  platformKey,
  eventToCombo,
  isTypingTarget,
} from "../../hotkeys";
import type { HotkeyAction } from "../../hotkeys";
import "../../styles/audio-input-test.css";

/** Onboarding preview click: soft, slow, and the tempo W7 hands over at. */

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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Note: WKWebView occasionally leaves the OS cursor "stale" for a
  // few frames after the sidebar's width transition or a play/pause
  // toggle (the cursor reappears on the next mousemove). It's a
  // purely cosmetic platform quirk — no memory leak, no functional
  // bug — so we let it ride rather than maintaining a setTimeout-
  // setlist JS workaround. If users complain we can re-introduce a
  // dedicated hook for it.
  const sidebarRef = useRef<PresetSidebarHandle>(null);
  const [activePreset, setActivePreset] = useState<Preset | null>(null);
  const [presetDirty, setPresetDirty] = useState(false);
  const [updateFeedback, setUpdateFeedback] = useState(false);
  const updateFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [instrument, setInstrument] = useState("electric-guitar");
  // Whether `instrument` reflects a real choice (stored or picked in the
  // wizard) rather than the electric-guitar fallback. W1 uses it to decide
  // whether to render a card as selected.
  const [instrumentChosen, setInstrumentChosen] = useState(false);
  const instrumentChosenRef = useRef(false);
  // First-launch onboarding (ONBOARDING_PLAN §3). The hook owns first-run
  // detection and the store keys; the wizard replaces the old
  // `InstrumentPickerModal` mount (the picker's grid is now W1's body).
  const onboarding = useOnboarding();
  // Spotlight tour (O6). It owns the tab while it runs — stop 4 is the drill
  // tab — and puts the user back where they were when it ends. Existing users
  // (O1's migration case) are offered it once through a toast.
  const tour = useTour({
    view,
    setView,
    offerWhen: onboarding.migratedExistingUser,
  });

  /** W7's "Show me around": finish the wizard, then start the tour. */
  const handleRequestTour = useCallback(() => {
    // CLOSE on W7 counts as completion, so the wizard tidies up as usual.
    onboarding.dispatch({ type: "CLOSE" });
    tour.open("beat");
  }, [onboarding.dispatch, tour.open]);

  /** Persist an instrument choice + push the DSP profile to the backend. */
  const applyInstrument = useCallback((id: string) => {
    setInstrument(id);
    setInstrumentChosen(true);
    instrumentChosenRef.current = true;
    storeSave("instrument", id);
    setInstrumentBackend(id as InstrumentId).catch(() => {});
  }, []);

  /**
   * Whether a band is playing rather than a click.
   *
   * State set from an effect rather than read straight off `jamSession`,
   * because the coach session is built before the jam session is — and the
   * coach only needs to know by the time a segment ends, which is many beats
   * later. See `UseSessionOptions.jamMode`.
   */
  const [jamModeActive, setJamModeActive] = useState(false);

  const session = useSession({
    evaluation,
    isPlaying: state.isPlaying,
    bpm: state.bpm,
    timeSignature: state.timeSignature,
    beatGroups: state.beatGroups,
    presetId: activePreset?.id,
    presetName: activePreset?.name,
    voiceMode: coach.coachVoiceMode,
    coachVerbosity: coach.coachVerbosity,
    coachMode: coach.coachMode,
    // "off" means no model: `startSession` skips the load entirely.
    brainTier: coach.coachBrainTier,
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
    jamMode: jamModeActive,
  });

  /**
   * Re-send the whole ramp with one or two fields changed.
   *
   * The transport promotes count-in and loop out of the drill's settings form
   * (S7): they are decided in the seconds before you press Start, and having
   * to open a form to reach them is the reason people run a drill without the
   * count-in they wanted. They are not a second copy of the setting —
   * `configure_speed_ramp` replaces the whole config, so every field has to
   * come back with the change, and `speedRamp` stays the one place either
   * control reads from. The form re-syncs from it when it changes.
   */
  const reconfigureRamp = useCallback(
    (overrides: Partial<{ cyclic: boolean; warmupBeats: number }>) => {
      const ramp = state.speedRamp;
      void configureSpeedRamp({
        startBpm: ramp.startBpm,
        targetBpm: ramp.targetBpm,
        increment: ramp.increment,
        decrement: ramp.decrement,
        barsPerStep: ramp.barsPerStep,
        beatsPerBar: ramp.beatsPerBar,
        mode: ramp.mode,
        cyclic: ramp.cyclic,
        warmupBeats: ramp.warmupBeats,
        aggressiveness: ramp.aggressiveness,
        ...overrides,
      }).catch((err) => coachDebug("transport.reconfigureRamp-failed", { err }));
    },
    [state.speedRamp],
  );

  const handleActivePresetChange = useCallback((preset: Preset | null, dirty: boolean) => {
    setActivePreset(preset);
    setPresetDirty(dirty);
  }, []);

  /**
   * `jamSession.closeJam`, reachable from callbacks defined before it exists.
   *
   * Loading a setlist has to put the jam away — one thing is loaded at a time,
   * and a jam left open behind a setlist would go on writing its table to the
   * engine. The setlist hook is built first, so it cannot name the jam hook
   * directly; the ref is filled in below, once there is something to fill it
   * with, and is a no-op until then.
   */
  const closeJamRef = useRef<() => void>(() => {});

  // The setlist the window has open (U9). With none loaded every one of these
  // is inert and the metronome behaves exactly as it did.
  const setlistSession = useSetlistSession({
    state,
    isPlaying: state.isPlaying,
    currentBeat,
    setView,
    onSetlistLoaded: () => {
      // The library marks what is loaded, and only one thing can be.
      sidebarRef.current?.clearActive();
      setActivePreset(null);
      setPresetDirty(false);
      closeJamRef.current();
    },
  });

  // The jam the window has open (JAM_MODE). With none loaded every one of
  // these is inert and the metronome behaves exactly as it did.
  const jamSession = useJamSession({
    view,
    isPlaying: state.isPlaying,
    instrument,
    currentBeat,
    onJamLoaded: () => {
      // The library marks what is loaded, and only one thing can be.
      sidebarRef.current?.clearActive();
      setActivePreset(null);
      setPresetDirty(false);
      setlistSession.closeSetlist();
    },
  });

  useEffect(() => {
    closeJamRef.current = jamSession.closeJam;
  }, [jamSession.closeJam]);

  useEffect(() => {
    setJamModeActive(view === "jam" && !!jamSession.jam);
  }, [view, jamSession.jam]);

  const handleNewJam = useCallback(() => {
    setSidebarOpen(true);
    const created = jamSession.newJam();
    // Same delay the preset "+" uses: let the library settle before the name
    // field appears under the caret.
    setTimeout(() => sidebarRef.current?.triggerRenameJam(created.id), 150);
  }, [jamSession.newJam]);

  /**
   * Play, on the jam tab.
   *
   * A jam with a count-in arms it before the transport starts, exactly the way
   * `useSetlistRunner` does — the engine counts the beats out and then begins,
   * so the band and the player start together rather than the band starting
   * and the player catching up.
   */
  const toggleJamPlayback = useCallback(() => {
    const jam = jamSession.jam;
    if (!jam) return;
    if (!state.isPlaying && jam.countIn > 0) {
      void armCountIn(jam.countIn).catch(() => {});
    }
    void togglePlayback();
  }, [jamSession.jam, state.isPlaying]);

  const handleNewSetlist = useCallback(async () => {
    setSidebarOpen(true);
    const created = await setlistSession.newSetlist();
    // Same delay the preset "+" uses: let the library settle before the
    // name field appears under the caret.
    setTimeout(() => sidebarRef.current?.triggerRenameSetlist(created.id), 150);
  }, [setlistSession.newSetlist]);

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

  // Help menu (O8) — the header `?` and Cmd/Ctrl-/. Silenced while the wizard
  // or the tour owns the screen, and while a key-capture modal is listening,
  // so "/" lands where the user is looking.
  const help = useHelpMenu(IS_MAC, {
    disabled: onboarding.isOpen || tour.isOpen || !!bindingFor || inputTestOpen,
  });

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

  // Motion gate (O8): the OS `prefers-reduced-motion` setting OR the app's own
  // `viewTransitions === "off"`. One value, passed to every animated overlay,
  // so "no motion" means the same thing everywhere.
  const reducedMotion = useReducedMotion(viewTransitions);

  // What's new (O8) — the release notes for this build, once. Gated on the
  // onboarding hydration so a genuine first launch (which gets the wizard)
  // is never also handed a changelog.
  const whatsNew = useWhatsNew({
    appVersion,
    firstRun: onboarding.firstRun,
    ready: onboarding.hydrated,
  });

  // Restore instrument from store on mount (other prefs are hydrated by
  // their dedicated hooks: useUiPreferences, useAudioOutputDevices,
  // useAppUpdates).
  useEffect(() => {
    (async () => {
      const inst = await storeLoad<string>("instrument");
      if (inst) {
        setInstrument(inst);
        setInstrumentChosen(true);
        instrumentChosenRef.current = true;
      }
      // No saved instrument → first launch. `useOnboarding` detects that and
      // opens the wizard at W0 (D0's "make an explicit choice" rule now lives
      // in W1); the electric-guitar fallback is applied when the wizard ends
      // without a pick.
    })();
  }, []);

  // The wizard's demo click, and the `state` ref the rest of this component
  // reads when it needs "whatever is true right now" rather than a dependency.
  const { softClickPlaying, startSoftClick, stopSoftClick } =
    useSoftClickPreview(state);

  // --- Audio output failure ------------------------------------------------
  // The audio thread emits `audio-error` when it cannot open or start the
  // output stream — the WASAPI exclusive-mode case being the one a guitarist
  // meets weekly, with an amp sim already holding the endpoint. Nothing else
  // consumed that event, so Play used to snap back in silence.
  const audioError = useAudioError(state.isPlaying);
  const openAudioSettings = useCallback(() => {
    setView("settings");
    // Same triple nudge as the theme and voice detours: `setView` scrolls the
    // pane to the top on its own timer, so one early scroll is overwritten.
    for (const delay of [80, 260, 520]) {
      setTimeout(
        () =>
          document
            .getElementById("settings-devices")
            ?.scrollIntoView({ block: "start", behavior: "auto" }),
        delay,
      );
    }
  }, [setView]);

  // --- W2 → Settings → Appearance detour (O2) ------------------------------
  // "More themes in Settings" cannot open Settings *under* a full-window
  // overlay, so the wizard steps aside instead of ending: the machine keeps
  // its step and the overlay comes back as soon as the user leaves the
  // Settings tab. Nothing is persisted or skipped in between.
  const [themeDetour, setThemeDetour] = useState(false);
  const openThemeSettings = useCallback(() => {
    setThemeDetour(true);
    setView("settings");
    // The pane mounts behind a view transition and `setView` scrolls it to the
    // top on its own timer, so one early scroll gets overwritten — try again
    // across the transition (landing on a section already in place is a
    // no-op). Instant, not smooth: a smooth scroll started while the
    // transition is still animating gets dropped.
    for (const delay of [80, 260, 520]) {
      setTimeout(
        () =>
          document
            .getElementById("settings-appearance")
            ?.scrollIntoView({ block: "start", behavior: "auto" }),
        delay,
      );
    }
  }, [setView]);
  useEffect(() => {
    if (themeDetour && view !== "settings") setThemeDetour(false);
  }, [themeDetour, view]);

  // --- W4 coach opt-in (O4) ------------------------------------------------
  // The wizard drives the app's single `useCoachDownload` instance, exactly
  // as W3 drives the single `useMidi`: a download started in the wizard is
  // the one the coach card, Settings and the wizard's own footer bar watch,
  // and it keeps running after the overlay closes.
  const wizardCoach: WizardCoachEnv = useMemo(
    () => ({
      systemMemoryMb: coach.systemMemoryMb,
      modelStatus: coach.modelStatus,
      downloading: coach.modelDownloading,
      downloadFraction: coach.downloadProgress?.fraction ?? null,
      startDownload: (tier: ModelTier) => {
        void coach.handleStartDownload(tier);
      },
      setBrainTier: (tier: BrainTier) => {
        coach.setCoachBrainTier(tier);
        storeSave("coachBrainTier", tier);
      },
    }),
    [
      coach.systemMemoryMb,
      coach.modelStatus,
      coach.modelDownloading,
      coach.downloadProgress?.fraction,
      coach.handleStartDownload,
      coach.setCoachBrainTier,
    ],
  );

  // W5/W6 (O5) drive the app's single `useEvaluation` for the same reason W3
  // drives the single `useMidi`: the device picked in the wizard is the device
  // the rest of the app uses, and W6's eight beats go through the normal
  // analyzer — the only path that leaves a real calibration seed behind.
  const wizardEvaluation: WizardEvaluationEnv = useMemo(
    () => ({
      devices: evaluation.devices,
      selectedDevice: evaluation.selectedDevice,
      selectDevice: (name: string) => {
        void evaluation.selectDevice(name);
      },
      selectedChannel: evaluation.selectedChannel,
      selectChannel: (channel: number) => {
        void evaluation.selectChannel(channel);
      },
      listening: evaluation.enabled,
      setListening: (on: boolean) => {
        void evaluation.setListening(on);
      },
      spectrum: evaluation.spectrum,
      lastFeedback: evaluation.lastFeedback,
      avgDeviation: evaluation.avgDeviation,
    }),
    [
      evaluation.devices,
      evaluation.selectedDevice,
      evaluation.selectDevice,
      evaluation.selectedChannel,
      evaluation.selectChannel,
      evaluation.enabled,
      evaluation.setListening,
      evaluation.spectrum,
      evaluation.lastFeedback,
      evaluation.avgDeviation,
    ],
  );

  // The voice question W4 leaves open, asked when the voices actually land.
  const voicePrompt = useVoicePrompt();
  const openVoiceSettings = useCallback(() => {
    voicePrompt.accept();
    setView("settings");
    // Same triple nudge as the theme detour: `setView` scrolls the pane to
    // the top on its own timer, so one early scroll gets overwritten.
    for (const delay of [80, 260, 520]) {
      setTimeout(
        () =>
          document
            .getElementById("settings-coach")
            ?.scrollIntoView({ block: "start", behavior: "auto" }),
        delay,
      );
    }
  }, [voicePrompt, setView]);

  /**
   * The wizard closed. Restore the preview click, make sure an instrument is
   * set either way, and land a completed run on the metronome at 80 BPM
   * (ONBOARDING_PLAN §3, W7).
   */
  const handleWizardFinish = useCallback(
    (outcome: "completed" | "skipped" | "closed") => {
      void stopSoftClick().then(() => {
        if (!instrumentChosenRef.current) applyInstrument("electric-guitar");
        if (outcome === "completed") {
          setBpm(SOFT_CLICK_BPM);
          setView("beat");
        }
      });
    },
    [stopSoftClick, applyInstrument, setView],
  );

  // Tab switching and settings are handled by the unified dispatcher via keyBindings
  const soundDropdownRef = useRef<HTMLDivElement>(null);

  // Use measureBeat from the engine — it resets correctly when groups change mid-play,
  // unlike beat % beatsPerMeasure which produces misaligned values after a meter switch.
  /**
   * Leaving the setlist, from either door: Escape, or clicking the one you
   * are already in.
   *
   * A clean setlist closes without a word. A dirty one asks — losing an
   * afternoon of edits to a single keypress is the failure worth a dialog,
   * and a dialog that appears every time is one nobody reads.
   */
  /**
   * Close the setlist, and let go of the row in the library.
   *
   * You open a setlist by clicking its row, which focuses it. Escape then
   * closes the setlist and the row keeps the focus — and because Escape is a
   * keyboard action the browser draws `:focus-visible` on it, so a ring sits
   * in the sidebar around a setlist that is no longer open. The row has done
   * its job; releasing it is what a mouse click would have implied anyway.
   */
  const closeAndRelease = useCallback(() => {
    setlistSession.closeSetlist();
    const active = document.activeElement as HTMLElement | null;
    if (active && active.closest(".preset-sidebar")) active.blur();
  }, [setlistSession]);

  /**
   * The action waiting on an answer about unsaved work, or null.
   *
   * The first version of this guarded the two doors that CLOSED a setlist,
   * which missed the way people actually lose edits: they do not close a
   * thing, they open the next one. Clicking a different setlist, or a preset,
   * threw the working copy away without a word — "it's so easy to forget to
   * save the changes right now".
   *
   * So the gate is in front of the ACTION, not the screen, and it covers
   * presets too: `activePreset` plus `presetDirty` is the same situation one
   * object over, and `handlePresetUpdate` is its save.
   */
  const [pending, setPending] = useState<{
    name: string;
    save: () => void | Promise<unknown>;
    run: () => void;
  } | null>(null);

  /**
   * Run `action`, unless there is unsaved work in the way — then ask, and run
   * it once the question is answered.
   *
   * A dirty SETLIST or JAM wins over a dirty preset when somehow both are
   * true: that one is the thing on screen, and it is the one whose edits are
   * not also visible as knob positions.
   */
  const guarded = useCallback(
    (action: () => void) => {
      if (setlistSession.setlist && setlistSession.dirty) {
        setPending({
          name: setlistSession.setlist.name,
          save: setlistSession.saveActiveSetlist,
          run: action,
        });
        return;
      }
      if (jamSession.jam && jamSession.dirty) {
        setPending({
          name: jamSession.jam.name,
          save: jamSession.saveActiveJam,
          run: action,
        });
        return;
      }
      if (activePreset && presetDirty) {
        setPending({ name: activePreset.name, save: handlePresetUpdate, run: action });
        return;
      }
      action();
    },
    [setlistSession, jamSession, activePreset, presetDirty, handlePresetUpdate],
  );
  const askToLeave = useCallback(() => {
    if (!setlistSession.setlist) return;
    guarded(closeAndRelease);
  }, [setlistSession.setlist, guarded, closeAndRelease]);

  // Escape is the other door. Not while something is typed into, and not
  // while a popover owns the key — those close themselves first, and a
  // window-level handler that fired anyway would close the setlist out from
  // under a field you were editing.
  useEffect(() => {
    if (!setlistSession.setlist) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      askToLeave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setlistSession.setlist, askToLeave]);

  const activeBeat = currentBeat ? currentBeat.measureBeat : -1;
  const activeSub = currentBeat ? currentBeat.subdivision : -1;
  const isDownbeat = currentBeat?.isDownbeat ?? false;

  /**
   * The tempo, from every control that sets one.
   *
   * On the jam tab the tempo belongs to the JAM, not to the engine: it is
   * saved with the groove and the form, and the engine is downstream of the
   * record. Writing only the engine would have made the tempo the one setting
   * on that screen that Save did not save.
   */
  const handleBpmChange = (value: number) => {
    const clamped = Math.max(20, Math.min(300, value));
    setBpm(clamped);
    if (view === "jam") jamSession.editJam({ bpm: clamped });
  };

  // A narrow window cannot hold the library and a usable stage at once.
  useLibraryFit(sidebarOpen, setSidebarOpen);

  const { bar, elapsedSeconds } = usePlaybackClock(
    state.isPlaying || (state.speedRamp?.active ?? false),
    currentBeat,
  );

  const {
    editingBpm,
    setEditingBpm,
    bpmEditValue,
    setBpmEditValue,
    bpmInputRef,
    startBpmEdit,
    commitBpmEdit,
  } = useBpmEditing(state.bpm, handleBpmChange);

  const { isPulsing, tapPulse, handleTap, tapCount, tapActive } =
    useDownbeatPulse({
      buttonFlash,
      isPlaying: state.isPlaying,
      currentBeat,
      onBpmDetected: handleBpmChange,
    });

  // Each IPC call is awaited but the whole load is guarded: one setter
  // rejecting must not abort the rest. A legacy preset saved under the
  // retired "Never accent" option carries `timeSignature: 0` and no
  // `beatGroups`, which used to reach Rust as `[0]`, get rejected, and
  // take FREE mode / sound / volume / ramp / view down with it — the
  // preset applied its BPM and nothing else. `presetBeatGroups` maps 0 to
  // [4] and `presetFreeMode` turns that preset into FREE mode (same rule
  // as the Rust store migration); the try/catch contains the rest.
  const handleLoadPreset = useCallback(async (preset: Preset) => {
    const steps: Array<[string, () => Promise<unknown>]> = [
      ["bpm", () => setBpm(preset.bpm)],
      ["subdivision", () => setSubdivision(preset.subdivision as Subdivision)],
      ["beatGroups", () => setBeatGroups(presetBeatGroups(preset))],
      ["freeMode", () => setFreeMode(presetFreeMode(preset))],
      ["soundType", () => setSoundType(preset.soundType)],
      ["volume", () => setVolume(preset.volume)],
    ];
    if (preset.view === "drill" && preset.speedRamp) {
      const ramp = preset.speedRamp;
      steps.push(["speedRamp", () => configureSpeedRamp({
        startBpm: ramp.startBpm,
        targetBpm: ramp.targetBpm,
        increment: ramp.increment,
        decrement: ramp.decrement,
        barsPerStep: ramp.barsPerStep,
        beatsPerBar: ramp.beatsPerBar,
        mode: ramp.mode,
        cyclic: ramp.cyclic,
        warmupBeats: ramp.warmupBeats,
      })]);
    }
    for (const [name, run] of steps) {
      try {
        await run();
      } catch (err) {
        coachDebug("loadPreset.step-failed", { preset: preset.id, step: name, err });
      }
    }
    if (preset.view === "drill" || preset.view === "beat") setView(preset.view);
    // Loading a preset is loading a preset. Leaving the setlist or the jam open
    // would put the stage over something it no longer describes — and a jam
    // left loaded goes on writing its table to the engine.
    setlistSession.closeSetlist();
    closeJamRef.current();
  }, [setView, setlistSession.closeSetlist]);


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
    setlistLoaded: !!setlistSession.setlist,
    jamLoaded: !!jamSession.jam,
    onToggleJam: toggleJamPlayback,
    jamActions: jamSession.actions,
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
    // The onboarding overlay owns the keyboard while it is up — Space must
    // not start the metronome behind it.
    // The onboarding overlay and the tour each own the keyboard while they are
    // up — Space must not start the metronome behind them.
    if (bindingFor || onboarding.isOpen || tour.isOpen) return;
    const handler = (e: KeyboardEvent) => {
      // A range, a checkbox or a button holds no text, so a keypress with one
      // focused is a hotkey. See `isTypingTarget` — the tempo ruler is a range,
      // and treating it as a text field swallowed every hotkey in the app the
      // moment anyone set a tempo with it.
      if (isTypingTarget(e.target)) return;
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
  }, [view, keyBindings, isFullscreen, bindingFor, setView, dispatchAction, inputTestMode, onboarding.isOpen, tour.isOpen]);

  // MIDI controller support. The dispatcher is silenced while the input
  // tester is open by reading `inputTestModeRef` (the ref pattern keeps
  // the useMidi callback's closure stable so it doesn't re-subscribe on
  // every toggle).
  const [midiAutoAccept, setMidiAutoAccept] = useState(false);

  const midi = useMidi((action) => {
    if (inputTestModeRef.current) return;
    // The wizard swallows keyboard hotkeys behind its overlay; a pedal press
    // while W3 is mapping must not drive the app either.
    if (onboarding.isOpen) return;
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
    bindings: !midi.learnMode && !inputTestMode && !onboarding.isOpen ? footBindings : undefined,
    onAction: !midi.learnMode && !inputTestMode && !onboarding.isOpen
      ? (id) => dispatchAction(id as HotkeyAction)
      : undefined,
  });

  // Progressive first-time hints (ONBOARDING_PLAN §5). The hook owns the
  // triggers and the one-per-session rate limit; MainWindow only supplies the
  // inputs and the three actions. `coach-ask` and `zen-first` are wired at
  // their own sites (the coach feed and the Zen overlay).
  const appHint = useAppHints({
    view,
    bpm: state.bpm,
    subdivision: state.subdivision,
    beatGroups: state.beatGroups ?? [state.timeSignature],
    isPlaying: state.isPlaying,
    midiDevices: midi.devices,
    midiBindings: midi.bindings,
    onSavePreset: handlePresetSave,
    onOpenWidget: () => {
      void markWidgetOpened();
      showFloating();
    },
    onOpenHotkeys: () => {
      // O3's MIDI capture flow is not merged yet — until it is, the hint
      // lands the user on the section that owns the mapping UI.
      prevTab.current = view === "settings" ? prevTab.current : view;
      setView("settings");
      setTimeout(() => {
        document
          .querySelector("section.hotkeys-section")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 400);
    },
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
      className={`main-window ${isOsFullscreen ? "os-fullscreen" : ""} ${IS_MAC ? "os-mac" : IS_WINDOWS ? "os-windows" : IS_LINUX ? "os-linux" : "os-other"}`}
      data-playing={state.isPlaying}
      data-border={activeBorder}
    >
      <ThemeEffects themeId={state.theme} currentBeat={currentBeat} isPlaying={state.isPlaying} />
      <TitleBar />

      {onboarding.chipVisible && view !== "settings" && (
        <FinishSetupChip
          onOpen={() => onboarding.openAt("instrument")}
          onDismiss={onboarding.dismissChip}
        />
      )}

      {/* Shown on every tab, Settings included: the user pressed Play and got
          silence, and the remedy the message points at lives in Settings, so
          hiding it there would strand them mid-fix. It shares the top-centre
          slot with the setup chip and the tour offer, none of which can be on
          screen during a failed Play — those are one-time onboarding nudges,
          this is a live fault. */}
      {audioError.notice && (
        <AudioErrorNotice
          notice={audioError.notice}
          onOpenSettings={() => {
            audioError.dismiss();
            openAudioSettings();
          }}
          onDismiss={audioError.dismiss}
        />
      )}

      {/* Hints stay out of the way of the wizard, of the tour (another
          anchored overlay — two cards pointing at the same UI is noise) and
          of Zen (which renders its own `zen-first` card inside the overlay). */}
      {appHint && !onboarding.isOpen && !tour.isOpen && !isFullscreen && (
        <HintCard
          id={appHint.id}
          onAction={appHint.onAction}
          onDismiss={appHint.markShown}
          animate={!reducedMotion}
        />
      )}

      {tour.offerVisible && view !== "settings" && (
        <TourOfferToast
          onAccept={tour.acceptOffer}
          onDismiss={tour.dismissOffer}
          animate={!reducedMotion}
        />
      )}

      {/* W4 left the voice unchosen on purpose; the download that finished is
          what makes the question answerable (O4). Never over the wizard or
          over the Settings page it points at. */}
      {voicePrompt.visible && view !== "settings" && !onboarding.isOpen && (
        <CoachVoiceToast
          onAccept={openVoiceSettings}
          onDismiss={voicePrompt.dismiss}
        />
      )}

      {shareOpen && (
        <ShareMenuPopover
          anchorRef={shareBtnRef}
          popoverRef={shareRef}
          onSelect={handleShareOption}
        />
      )}

      <div className="main-body">
        <Rail
          ref={sidebarRef}
          state={state}
          view={view}
          setView={setView}
          prevTab={prevTab}
          libraryOpen={sidebarOpen}
          onToggleLibrary={() => setSidebarOpen((o) => !o)}
          // Loading a preset closes any open setlist, so it can discard a
          // setlist's edits as easily as a preset's own.
          onLoadPreset={(preset) => guarded(() => void handleLoadPreset(preset))}
          onActivePresetChange={handleActivePresetChange}
          presetShortcut={platformKey(keyBindings["toggle-sidebar"] || "")}
          setlists={setlistSession.setlists}
          activeSetlistId={setlistSession.setlist?.id ?? null}
          onLoadSetlist={(next) =>
            // Clicking the setlist you are already in is the way out of it,
            // the same way clicking the open tab closes it in most things
            // with tabs. Any other setlist replaces this one — which is the
            // commonest way to lose edits, so it goes through the gate.
            next.id === setlistSession.setlist?.id
              ? askToLeave()
              : guarded(() => setlistSession.loadSetlist(next))
          }
          onNewSetlist={handleNewSetlist}
          onDeleteSetlist={setlistSession.deleteSetlist}
          onRenameSetlist={setlistSession.renameSetlist}
          jams={jamSession.jams}
          activeJamId={jamSession.jam?.id ?? null}
          // Clicking the jam you are already in is the way out of it, the same
          // gesture that closes an open setlist.
          onLoadJam={(next) =>
            guarded(() =>
              next.id === jamSession.jam?.id
                ? jamSession.closeJam()
                : jamSession.loadJam(next),
            )
          }
          onNewJam={handleNewJam}
          onDeleteJam={jamSession.deleteJam}
          onRenameJam={jamSession.renameJam}
          onDuplicateJam={jamSession.duplicateJam}
          onReorderJams={jamSession.reorderJams}
          coachOpen={session.cardOpen}
          coachActive={session.active}
          coachListening={evaluation.enabled}
          onToggleCoach={session.toggleCard}
          onZen={() => setIsFullscreen(true)}
        />
      <div
        ref={contentRef}
        className="main-content"
        data-view={view}
        onDoubleClick={(e) => {
          if (view !== "beat" && view !== "drill") return;
          if (
            // The context bar and the transport live inside this region now,
            // so a double-click on either must not fall through to Zen — the
            // header is also the window's drag area. `.tab-bar` is gone with
            // the top strip it named.
            (e.target as HTMLElement).closest(
              "button, input, select, a, .main-header, .transport, .drill-grid-cell",
            )
          )
            return;
          setIsFullscreen(true);
        }}
      >
        <MainHeader
          state={state}
          view={view}
          activePreset={activePreset}
          presetDirty={presetDirty}
          updateFeedback={updateFeedback}
          onRenamePreset={(presetId) => {
            setSidebarOpen(true);
            setTimeout(() => sidebarRef.current?.triggerRename(presetId), 150);
          }}
          onUpdatePreset={handlePresetUpdate}
          onSavePreset={handlePresetSave}
          // Revert is "load the preset again": the same path the sidebar
          // takes, so there is one definition of what a preset restores.
          onRevertPreset={
            activePreset ? () => void handleLoadPreset(activePreset) : undefined
          }
          activeSetlist={setlistSession.setlist}
          setlistDirty={setlistSession.dirty}
          setlistSaveFeedback={setlistSession.saveFeedback}
          onSaveSetlist={() => void setlistSession.saveActiveSetlist()}
          onRevertSetlist={setlistSession.revertSetlist}
          onRenameSetlist={() => {
            const id = setlistSession.setlist?.id;
            if (!id) return;
            setSidebarOpen(true);
            setTimeout(() => sidebarRef.current?.triggerRenameSetlist(id), 150);
          }}
          activeJam={jamSession.jam}
          jamDirty={jamSession.dirty}
          jamSaveFeedback={jamSession.saveFeedback}
          onSaveJam={jamSession.saveActiveJam}
          onRevertJam={jamSession.revertJam}
          onRenameJam={() => {
            const id = jamSession.jam?.id;
            if (!id) return;
            setSidebarOpen(true);
            setTimeout(() => sidebarRef.current?.triggerRenameJam(id), 150);
          }}
          listening={evaluation.enabled}
          soundOpen={soundOpen}
          setSoundOpen={setSoundOpen}
          soundDropdownRef={soundDropdownRef}
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
          onOpenHelp={help.openMenu}
        />

        {/* Behind the stage, not inside it: the stage caps its own width, and
            the room this figure needs is the part of the content region that
            the cap leaves over. */}
        {/* Not while a setlist is open, playing or not.

            The player is one centred column with a tempo meant to be read
            from across the room, and a sketch off to one side of it is the
            only other thing on screen — so it stops being scenery and starts
            being the other object your eye goes to. The editor is the same
            problem from the other end: it is a column of text down the left,
            so the drawing sits in open space beside it rather than behind
            anything, and it lands on top of the tools of whichever step you
            have open.

            Scenery needs something to be scenery FOR. The plain metronome
            has controls filling the width; neither setlist room does. */}
        {view === "beat" && (
          <MetronomeFigure
            bpm={state.bpm}
            isPlaying={state.isPlaying}
            currentBeat={currentBeat}
          />
        )}

        {pending && (
          <UnsavedChangesDialog
            name={pending.name}
            onSave={() => {
              const { save, run } = pending;
              setPending(null);
              void Promise.resolve(save()).then(run);
            }}
            onDiscard={() => {
              const { run } = pending;
              setPending(null);
              run();
            }}
            onCancel={() => setPending(null)}
          />
        )}

        <ViewTransition viewKey={view} themeId={state.theme} disabled={viewTransitions === "off"} level={viewTransitions} animStyle={animationStyle}>
        {/* Setlist mode is two rooms, and Start is the door between them.
            Building a setlist is desk work; playing one is done a metre back
            with a guitar in your hands. One stage was trying to hold both,
            and the cost was 309px spent above a metronome that then had 364px
            of the 523px it needs — overflowing with the scrollbar hidden.

            Neither room stacks anything above the stage, so each gets the
            same 672px the metronome gets with no setlist loaded. */}
        {view === "setlist" ? (
          setlistSession.setlist && setlistSession.setlistPlaying ? (
            <SetlistPlayer
              setlist={setlistSession.setlist}
              step={setlistSession.runner.step!}
              stepNumber={setlistSession.runner.stepNumber}
              stepCount={setlistSession.runner.stepCount}
              remaining={setlistSession.runner.remaining}
              activeBeat={activeBeat}
              activeSub={activeSub}
              isDownbeat={isDownbeat}
              isPlaying={state.isPlaying}
              countIn={state.countIn ?? { beats: 0, done: 0 }}
              onEdit={setlistSession.editWhileRunning}
            />
          ) : setlistSession.setlist ? (
            <SetlistParagraph
              setlist={setlistSession.setlist}
              selectedStepId={setlistSession.selectedStepId}
              onSelectStep={setlistSession.selectStep}
              runningIndex={setlistSession.runningIndex}
              onChange={setlistSession.setSetlist}
              onPatchStep={setlistSession.patchStep}
              onAddStep={setlistSession.addStepFromNow}
              onBackToPlaying={setlistSession.backToPlaying}
            />
          ) : (
            /* The tab standing up cold. A mode can be clicked with nothing
               loaded — the one state this screen never had while it was a
               corner of the metronome. */
            <SetlistEmpty onNew={() => void handleNewSetlist()} />
          )
        ) : view === "beat" ? (
          <MetronomeView
            state={state}
            currentBeat={currentBeat}
            evaluation={evaluation}
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
        ) : view === "jam" ? (
          jamSession.jam ? (
            <JamView
              jam={jamSession.jam}
              onEdit={jamSession.editJam}
              currentBeat={currentBeat}
              isPlaying={state.isPlaying}
              instrument={instrument}
              lineup={jamSession.lineup}
              trainedBpm={jamSession.trainedBpm}
              listening={evaluation.enabled}
              screen={jamSession.screen}
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
          ) : (
            /* A mode can be clicked cold. */
            <JamEmpty onNew={handleNewJam} />
          )
        ) : view === "drill" ? (
          <DrillView
            state={state}
            currentBeat={currentBeat}
            autoCollapse={drillAutoCollapse}
            animations={!reducedMotion}
          />
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
            onRunSetupAgain={() => {
              setView(prevTab.current);
              onboarding.open();
            }}
            onTakeTour={() => {
              // Leave settings first: no stop lives there, and the tour must
              // restore a real tab rather than the settings overlay.
              setView(prevTab.current);
              tour.open(prevTab.current);
            }}
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
            studioAvailable={coach.studioAvailable}
            standardAvailable={coach.standardAvailable}
            brainUpdateAvailable={coach.brainUpdateAvailable}
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
        {/* Nothing to transport on an empty setlist tab. */}
        {(view === "beat" ||
          view === "drill" ||
          (view === "setlist" && !!setlistSession.setlist) ||
          (view === "jam" && !!jamSession.jam)) && (
          <Transport
            view={view}
            isPlaying={state.isPlaying}
            speedRampActive={state.speedRamp?.active ?? false}
            isPulsing={isPulsing}
            bar={bar}
            elapsedSeconds={elapsedSeconds}
            listening={evaluation.enabled}
            hasSignal={evaluation.hasSignal}
            playShortcut={platformKey(keyBindings["play"] || "")}
            startBpm={state.speedRamp.startBpm}
            countIn={state.speedRamp.warmupBeats > 0}
            loop={state.speedRamp.cyclic}
            onToggleCountIn={() =>
              reconfigureRamp({ warmupBeats: state.speedRamp.warmupBeats > 0 ? 0 : 4 })
            }
            onToggleLoop={() => reconfigureRamp({ cyclic: !state.speedRamp.cyclic })}
            onTogglePlayback={() =>
              view === "jam" ? toggleJamPlayback() : togglePlayback()
            }
            onStartSpeedRamp={() => startSpeedRamp()}
            onStopSpeedRamp={() => stopSpeedRamp()}
            setlistStepNumber={setlistSession.runner.stepNumber}
            setlistStepCount={setlistSession.setlist?.steps.length ?? 0}
            setlistRemaining={setlistSession.runner.remaining}
            setlistStartAt={setlistSession.startAt}
            onSetlistSkip={setlistSession.runner.skip}
            jamFormBars={jamSession.jam ? formBars(jamSession.jam.form) : 0}
            jamFormBar={currentBeat?.formBar ?? 0}
            jamChorus={currentBeat?.chorus ?? 1}
          />
        )}
      </div>
      {(view === "beat" || view === "drill" || view === "setlist" || view === "jam") && (
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
          modelStatus={coach.modelStatus}
          studioAvailable={coach.studioAvailable}
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
    <OnboardingWizard
      state={onboarding.state}
      dispatch={onboarding.dispatch}
      appVersion={appVersion}
      instrument={instrument}
      instrumentChosen={instrumentChosen}
      onInstrumentChange={applyInstrument}
      soundType={state.soundType}
      themeId={state.theme}
      coachTier={coach.coachBrainTier}
      inputDeviceName={evaluation.selectedDevice}
      hasFootswitch={midi.bindings.length > 0 || Object.keys(footBindings).length > 0}
      midi={midi}
      gamepadBindings={footBindings}
      coach={wizardCoach}
      evaluation={wizardEvaluation}
      alwaysOnTop={state.alwaysOnTop}
      onAlwaysOnTopChange={setAlwaysOnTop}
      startSoftClick={startSoftClick}
      stopSoftClick={stopSoftClick}
      softClickPlaying={softClickPlaying}
      currentBeat={currentBeat}
      onFinish={handleWizardFinish}
      onOpenThemeSettings={openThemeSettings}
      hidden={themeDetour}
      onRequestTour={handleRequestTour}
      animate={!reducedMotion}
    />
    <Tour
      open={tour.isOpen}
      index={tour.index}
      stop={tour.stop}
      total={tour.total}
      onNext={tour.next}
      onPrev={tour.prev}
      onClose={tour.close}
      keyBindings={keyBindings}
      animate={!reducedMotion}
    />
    <HelpMenu
      open={help.panel === "menu"}
      onClose={help.close}
      appVersion={appVersion}
      onTakeTour={() => {
        // The tour has no stop in Settings, so leave first and hand it the
        // tab it must restore — same contract the Settings entry uses.
        const back = view === "settings" ? prevTab.current : view;
        if (view === "settings") setView(back);
        tour.open(back);
      }}
      onRunSetupAgain={() => {
        if (view === "settings") setView(prevTab.current);
        onboarding.open();
      }}
      onShowShortcuts={help.openShortcuts}
      onReportProblem={help.reportProblem}
      animate={!reducedMotion}
    />
    <ShortcutsSheet
      open={help.panel === "shortcuts"}
      onClose={help.close}
      onBack={help.openMenu}
      keyBindings={keyBindings}
      globalBindings={globalBindings}
      footBindings={footBindings}
      midi={midi}
      animate={!reducedMotion}
    />
    <WhatsNewModal
      open={whatsNew.isOpen && !onboarding.isOpen}
      version={appVersion}
      notes={whatsNew.notes}
      onClose={whatsNew.dismiss}
      animate={!reducedMotion}
    />
    </>
  );
}
