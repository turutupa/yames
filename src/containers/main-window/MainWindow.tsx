import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { IS_BETA, IS_MOBILE, SAYS_WHEN_NEWER } from "../../platform";
import { NO_ANDROID_BETA, useAndroidBetaUpdate } from "../../beta/useAndroidBetaUpdate";
import { NO_BETA_PROMPT, useBetaPrompt } from "../../beta/useBetaPrompt";
import { BetaUpdateNotice } from "../../beta/BetaUpdateNotice";
import { getThemeById } from "../../themes";
import { DEFAULT_INSTRUMENT } from "../../constants/instruments";
import { useAndroidNative } from "./hooks/useAndroidNative";
import { useInputRoute } from "../../mobile/inputRoute";
import { useBackDismiss } from "../../mobile/backStack";
import {
  INERT_INPUT_TESTER,
  INERT_JAM_TAKES,
  INERT_KEYBINDINGS,
  INERT_MIDI,
} from "../../platform.inert";
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
  openFeedback,
} from "../../ipc";
import CoachCard from "../practice-coach/CoachCard";
import "../../styles/main-window.css";
import "../../styles/transitions.css";
import "../../styles/evaluation.css";
import type { BrainTier, InstrumentId, ModelTier, Preset, Subdivision } from "../../types";
import { OnboardingWizard } from "../onboarding/OnboardingWizard";
import type { WizardCoachEnv, WizardEvaluationEnv, WizardLearningEnv } from "../onboarding/WizardContext";
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
import { SongsView } from "../songs/SongsView";
import { useSongsDue } from "../songs/review/useSongsDue";
import { useOpenedSong } from "../songs/useOpenedSong";
import { FullscreenView } from "../zen/FullscreenView";
import { PresetSidebar } from "../../components/presets/PresetSidebar";
import type { PresetSidebarHandle } from "../../components/presets/PresetSidebar";
import { ThemeEffects } from "./ThemeEffects";
import { MetronomeView } from "../metronome/MetronomeView";
import { MetronomeFigure } from "../metronome/MetronomeFigure";
import { MainHeader } from "./MainHeader";
import type { MainView } from "./MainHeader";
import { TitleBar } from "../../components/TitleBar";
import { Rail } from "./Rail";
import { MobileTabBar } from "./MobileTabBar";
import { Sheet } from "../../components/Sheet";
import { Transport } from "./Transport";
import { ViewTransition } from "../../components/ViewTransition";
import { ZenTransition } from "../zen/ZenTransition";
import { useEvaluation } from "../../hooks/useEvaluation";
import { useSession } from "../../hooks/useSession";
import AudioInputTestModal from "../settings/AudioInputTestModal";
import SettingsTimeline from "../settings/SettingsTimeline";
import { InputTesterModal } from "../settings/InputTesterModal";
import { coachDebug } from "../../utils/debug";
import { presetBeatGroups, presetFreeMode } from "../../utils/meter";
import { formBars } from "../../jam/forms";
import { barInView, jamHarmony, nextChange } from "../../jam/display";
import { chordName } from "../../jam/harmony";
import { useShareMenu } from "./useShareMenu";
import { ShareMenuPopover } from "./ShareMenuPopover";
import { useUiPreferences } from "./hooks/useUiPreferences";
import { useAudioOutputDevices } from "./hooks/useAudioOutputDevices";
import { useFullscreenLifecycle } from "./hooks/useFullscreenLifecycle";
import { useAppUpdates } from "./hooks/useAppUpdates";
import { NEVER_NEWER, useNewerVersion } from "./hooks/useNewerVersion";
import { usePathsPlace } from "./hooks/usePathsPlace";
import { useTabRouting } from "./hooks/useTabRouting";
import { useDownbeatPulse } from "./hooks/useDownbeatPulse";
import { useInputTester } from "./hooks/useInputTester";
import { useSoftClickPreview, SOFT_CLICK_BPM } from "./hooks/useSoftClickPreview";
import { useBpmEditing } from "./hooks/useBpmEditing";
import { usePlaybackClock } from "./hooks/usePlaybackClock";
import { useLibraryFit } from "./hooks/useLibraryFit";
import { useSetlistSession } from "./hooks/useSetlistSession";
import { useJamSession } from "./hooks/useJamSession";
import { useSongsSession } from "./hooks/useSongsSession";
import { isLearnTab, isPlayTab, type PlayTab } from "./hooks/useTabRouting";
import { useSessionRun } from "../session/hooks/useSessionRun";
import { useSessionPedal } from "../session/hooks/useSessionPedal";
import { TodayView } from "../session/TodayView";
import { SessionView } from "../session/SessionView";
import { LeaveSessionDialog } from "../session/LeaveSessionDialog";
import { PathsView } from "../session/PathsView";
import { ProgressView } from "../session/ProgressView";
import { ToolsView } from "../session/ToolsView";
import { useLastUsed } from "../session/tools/useLastUsed";
import { LearningNeck } from "../session/NeckGate";
import { useJamTakes } from "./hooks/useJamTakes";
import { somethingOpen, useToolEscape } from "./hooks/useToolEscape";
/* W32 — the camera comes to Jam. The hook and the preview are eager, like the
   take's machinery is, because they run while a jam is happening; the
   compositor behind "save as a video" is the only lazy thing on this tab. */
import { useTakeCamera } from "../../takes/useTakeCamera";
import { jamClockShape, jamSampler, jamTakeStartMs } from "../../takes/jamClock";
import { CameraIntroDialog } from "../../takes/CameraIntroDialog";
import { CameraPreview } from "../../takes/CameraPreview";
import type { PreviewCorner } from "../../takes/CameraPreview";
import "../../styles/songs-camera.css";
import { TakesIntroDialog } from "../jam/TakesIntroDialog";
import type { Jam, JamBand } from "../../jam";
import { setSetlistCountIn } from "../../setlist/setlists";
import { countInIsOn, countInToggle } from "./countIn";
import { songPosition } from "../../songs/position";
import { nudgeRange, setEdge } from "../../songs/selection";
import { UnsavedChangesDialog } from "../../components/UnsavedChangesDialog";
import type { UnsavedKind } from "../../components/UnsavedChangesDialog";
import { SetlistParagraph } from "../../components/setlist/SetlistParagraph";
import { SetlistPlayer } from "../../components/setlist/SetlistPlayer";
import { useAudioError } from "./hooks/useAudioError";
import { usePageFocus } from "./hooks/usePageFocus";
import { SkipLink } from "./SkipLink";
import { AudioErrorNotice } from "./AudioErrorNotice";
import { jamEscapeTarget } from "./jamEscape";
import {
  CoachDownloadConfirmDialog,
  DownloadHairline,
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
  actionForCombo,
  focusedControlTakesKey,
  trackFocusModality,
  sessionKeyIsInert,
  eventToCombo,
  isTypingTarget,
} from "../../hotkeys";
import type { HotkeyAction } from "../../hotkeys";
import "../../styles/audio-input-test.css";
// Last: the five tools in the app's design language, over every tool's own
// stylesheet (UX audit TOOL-1). Every rule is scoped to a tool's view.
import "../../styles/tools-chrome.css";

/**
 * Action ids that only mean something on one tab.
 *
 * Read when a key belongs to more than one action — `L`, `[` and `]` all do
 * since Songs grew a portion to loop — so that the mode's own action wins on
 * the mode's own tab and the plain one wins everywhere else. By prefix rather
 * than by looking the group up, because the prefix IS the convention: every
 * action in a mode group is named after its mode, and one that is not would
 * be the bug this would hide.
 */
/**
 * The corners the jam stage offers the little mirror (W32).
 *
 * The two at the BOTTOM, and only those. The chord you are playing over and
 * the form's bar grid are the top of the jam screen, and a picture of your
 * own face over either of them would make the mode unusable with the camera
 * on — so the choice is narrowed rather than left to a default nobody is
 * obliged to keep. `tests/layout/jam-camera.spec.ts` measures it.
 */
/** The tools, by view: Escape in one goes back where it was opened from. */
const TOOL_VIEW_IDS: ReadonlySet<string> = new Set(["beat", "setlist", "drill", "jam", "songs"]);
const JAM_PREVIEW_CORNERS: readonly PreviewCorner[] = ["bottomLeft", "bottomRight"];

/** Onboarding preview click: soft, slow, and the tempo W7 hands over at. */

export function MainWindow() {
  const { t, i18n } = useTranslation();
  // A phone has one fullscreen webview, so there is nothing to keep on top
  // of anything else.
  const alwaysOnTopSetter = IS_MOBILE ? async () => {} : setAlwaysOnTop;
  // Every hook below that reads `IS_MOBILE` is gated on a build-time
  // constant, so the hook order never varies at runtime — see platform.ts.
  // The window has no drag regions on a phone; it is the whole screen.
  if (!IS_MOBILE) useDrag();
  const { state, currentBeat } = useMetronome();
  // Practice Coach model + voice state (must come before useEvaluation so
  // coachMode is available when wiring the startEvaluation IPC call).
  // Real on a phone too (M7): the learning side's Session goes through
  // `useSession`, which reads the coach's mode and template text. A phone
  // build has no model to download, and the Settings section and wizard step
  // that would offer one are behind `IS_MOBILE`.
  const coach = useCoachDownload();
  const [inputTestOpen, setInputTestOpen] = useState(false);
  // The mic, on every platform: Takes are graded from the guitar.
  const evaluation = useEvaluation({ coachMode: coach.coachMode });
  // Active tab + transition rules (stop playback on tab change, persist,
  // restore on mount, scroll-to-top for track/settings) — owned by a
  // dedicated hook. `contentRef` is also returned so the scrollable
  // content container can be wired directly to it.
  const { view, mode, setView, prevTab, contentRef } = useTabRouting({
    isPlaying: state.isPlaying,
    speedRampActive: !!state.speedRamp?.active,
    // Today is the front door, unless the player asked for their last tool.
    frontDoor: true,
  });
  // Where the player is inside Paths, kept above the screen so a Session
  // started from a Step comes back to that Step, scrolled where it was
  // (`usePathsPlace`).
  const pathsPlace = usePathsPlace(view, contentRef);
  // A new page's heading, or a Session's big button, takes focus (NAV-10).
  usePageFocus(contentRef, view);
  // A running Session, or Settings opened from one ("Check my sound"). Either
  // way the rail and the tab bar are away: a click on them would walk out of
  // the Session and end it without a word (UX audit NAV-2). Settings' own Back
  // and Escape return to the Session.
  const inSession = view === "session" || (view === "settings" && mode === "session");
  const pathsUpOne = pathsPlace.back;
  // Paths reopens where the player was (UX audit NAV-3); the door pressed again
  // while on Paths goes one page up, Step to Path to the list (QA 2026-11-17 #8
  // asked for "not nothing"). The rail, the tab bar and the hotkey alike.
  const navigate = useCallback(
    (next: MainView) => {
      if (next === view && next === "paths") pathsUpOne();
      setView(next);
    },
    [view, setView, pathsUpOne],
  );
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
  // Open by default on a desktop, where it is a section of the rail with its
  // own column. On a phone it is a sheet over the whole screen, and an app
  // that starts with a sheet over it has hidden itself behind a preset list
  // nobody asked for.
  const [sidebarOpen, setSidebarOpen] = useState(!IS_MOBILE);
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
  const [instrument, setInstrument] = useState<string>(DEFAULT_INSTRUMENT);
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
  const tour = IS_MOBILE ? null : useTour({
    view,
    setView,
    offerWhen: onboarding.migratedExistingUser,
  });

  /** W7's "Show me around": finish the wizard, then start the tour. */
  const handleRequestTour = useCallback(() => {
    // CLOSE on W7 counts as completion, so the wizard tidies up as usual.
    onboarding.dispatch({ type: "CLOSE" });
    tour?.open("beat");
  }, [onboarding.dispatch, tour?.open]);

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
    coachStance: coach.coachStance,
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
    hushed: view === "session",
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

  /**
   * The jam library and the lineup, reachable from the setlist hook.
   *
   * Same shape as `closeJamRef` and for the same reason: a setlist step can
   * BE a jam (JAM_MODE §8.5), so the runner has to be able to look one up by
   * id, and the library lives in the jam hook, which is built second. Filled
   * in during the render below rather than from an effect — the runner reads
   * it only at the moment a step starts, and a value one commit stale there
   * would be a jam loaded from yesterday's library.
   */
  const jamsRef = useRef<Jam[]>([]);
  const jamLineupRef = useRef<JamBand | undefined>(undefined);

  // The setlist the window has open (U9). With none loaded every one of these
  // is inert and the metronome behaves exactly as it did.
  const setlistSession = useSetlistSession({
    state,
    isPlaying: state.isPlaying,
    currentBeat,
    // The MODE, not the screen, for the reason the jam hook is given the same
    // one: Settings is a layer over the setlist, and a setlist tab that
    // counted as "not showing" while Settings was open would try to open a
    // second setlist the moment Settings closed.
    view: mode,
    setView,
    onSetlistLoaded: () => {
      // The library marks what is loaded, and only one thing can be.
      sidebarRef.current?.clearActive();
      setActivePreset(null);
      setPresetDirty(false);
      closeJamRef.current();
    },
    /*
     * What a jam STEP needs. Every field is read through a ref by the runner,
     * so this object being new on every render costs nothing — and it has to
     * be new, because `meter` is the engine's live meter and the whole point
     * of it is that the run hands back whatever was there when it started.
     */
    jamContext: {
      getJam: (id: string) => jamsRef.current.find((j) => j.id === id) ?? null,
      get lineup() {
        return jamLineupRef.current;
      },
      meter: {
        subdivision: state.subdivision,
        beatGroups: state.beatGroups,
        freeMode: state.freeMode,
      },
      countingIn: (state.countIn?.beats ?? 0) > 0,
    },
  });

  // UI preferences (buttonFlash, activeBorder, drillAutoCollapse,
  // viewTransitions, animationStyle, jamCues) — owned by a dedicated hook
  // that hydrates them from the store on mount. Destructured here so the rest
  // of MainWindow keeps referencing them as bare variables.
  //
  // Read before the jam session rather than after it: spoken cues are a
  // preference now (JAM_UX_DECISIONS A4), and `useJamSession` is handed the
  // answer rather than reading the store a second time.
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
    jamCues,
    setJamCues,
  } = useUiPreferences();

  // The jam the window has open (JAM_MODE). With none loaded every one of
  // these is inert and the metronome behaves exactly as it did.
  const jamSession = useJamSession({
    // The MODE, not the screen: Settings is a layer over the jam, and a jam
    // that took its band off the engine whenever Settings opened fell back to
    // the bare click under it (2026-09-16).
    view: mode,
    isPlaying: state.isPlaying,
    instrument,
    currentBeat,
    // The engine counts the band in on the same tick grid it plays on, so the
    // jam has to be told when a bar line is the count rather than the form.
    countingIn: (state.countIn?.beats ?? 0) > 0,
    // The count-in as numbers, for the spoken count, and whether there is a
    // voice to speak it with. Cues on with no voice installed is silent —
    // see `shouldSpeak` in src/jam/cues.ts.
    countIn: state.countIn ?? { beats: 0, done: 0 },
    // `!IS_MOBILE &&` first, and not an optional chain on `coach`: there is
    // no coach object at all on a phone, and a build-time branch is what
    // keeps this from reaching for one — the same rule the rest of this file
    // follows. No voice on a phone means the cues are silent and every cue
    // is still on the screen.
    voiceReady: !IS_MOBILE && !!coach.modelStatus?.voiceReady,
    cues: jamCues,
    // The metronome's own meter, so the jam can hand it back on the way out.
    // A jam sets the engine's subdivision and beat groups to the groove's, and
    // without this a trip through Jam quietly re-signatures the metronome tab.
    meter: {
      subdivision: state.subdivision,
      beatGroups: state.beatGroups,
      freeMode: state.freeMode,
    },
    onJamLoaded: () => {
      // The library marks what is loaded, and only one thing can be.
      sidebarRef.current?.clearActive();
      setActivePreset(null);
      setPresetDirty(false);
      setlistSession.closeSetlist();
    },
  });

  // The Tools page's LAST line (acceptance P2-13): what is on the stage now,
  // else what each tool wrote down as the last one opened.
  const lastUsed = useLastUsed(view === "tools");
  const lastSetlist =
    setlistSession.setlist ??
    setlistSession.setlists.find((s) => s.id === lastUsed.setlistId) ??
    null;
  const lastJam = jamSession.jam ?? jamSession.jams.find((j) => j.id === lastUsed.jamId) ?? null;

  /**
   * The Songs library, the loaded song, and the song the engine is playing.
   *
   * It is given the tab for one reason: Songs is its own engine mode beside
   * the jam, so walking away from it has to take the song off the engine —
   * otherwise the Metronome tab would go on clicking through a score nobody
   * is looking at. Inert with no song open, like the jam above it.
   */
  const songsSession = useSongsSession(undefined, {
    view,
    isPlaying: state.isPlaying,
    // The session owns the one playhead (W37 item 1), so the engine's reports
    // have to reach it and not only the screen. Not during a Session: those
    // reports are an Exercise's position, and a song left open in the library
    // would come back with its playhead moved.
    beat: view === "session" ? null : currentBeat,
  });

  /**
   * Today's Session, and everything that runs it (`src/session/`).
   *
   * After the hooks above because it reuses them: it runs through the coach
   * session's call order so a Session is kept in the history, and a jam step
   * plays from the jam library.
   */
  const sessionRun = useSessionRun({
    view,
    setView,
    isPlaying: state.isPlaying,
    beat: currentBeat,
    state,
    coach: session,
    listening: evaluation.enabled,
    directInput: evaluation.devices.find((d) => d.name === evaluation.selectedDevice)?.isInterface === true,
    jams: jamSession.jams,
    lineup: jamSession.lineup,
    // "Where do you start?" lists the Paths, over whichever screen the wizard opened on.
    preload: onboarding.isOpen,
  });

  /**
   * The one-time nudges (the tour offer, the voice question, the Finish-setup
   * chip, the beta update, What's New, the hints) wait while a Session runs and
   * until its recap is closed (UX audit NAV-6): a card over the neck mid-Take
   * is the last thing a player with a guitar in their hands can deal with.
   * Nothing is dropped; each shows as before once the Session is over.
   */
  const holdNudges = inSession || sessionRun.run.phase !== "idle";

  /**
   * "Open with Yames" on a Guitar Pro or MusicXML file (`SONGS.md` S0.9).
   *
   * Here and not in `SongsView`, because the whole point is that the player
   * may be anywhere — or nowhere, on a cold start — when the file arrives.
   * It walks them to Songs and hands the bytes to the same `offerFile` the
   * picker uses, so the track picker opens exactly as it always does.
   */
  useOpenedSong({ setView, onFile: songsSession.offerFile });

  /**
   * The songs the coach promised to come back to, and the day has come round
   * (`COACH_UX.md` C2). Read from the store rather than handed down from the
   * Songs screen: the promise outlives the session that made it, and the rail
   * shows it whether or not that screen is open.
   */
  const songsDue = useSongsDue();

  /*
   * Wrapped, because it is the root of a chain of fresh objects.
   *
   * An inline arrow here made `requestTakes` new every render, which made
   * `jamActions` new, which made the global hotkey dispatcher new — so the
   * window's keydown listener was torn down and re-registered on every beat
   * event. `editJam` is itself stable, so this has no dependencies.
   */
  const setJamTakes = useCallback(
    (takes: boolean) => jamSession.editJam({ takes }),
    [jamSession.editJam],
  );

  /**
   * W32 — and the camera's, on the same terms.
   *
   * Turning the picture off when recording goes off is done HERE rather than
   * inside either hook, because it is the one rule that spans both: a picture
   * with no sound is not a take, so the two switches move together and there
   * is one promise rather than two states to reason about.
   */
  const setJamCamera = useCallback(
    (camera: boolean) => jamSession.editJam(camera ? { camera, takes: true } : { camera }),
    [jamSession.editJam],
  );

  /**
   * The loaded jam's takes (JAM_MODE §4.4).
   *
   * At the window level rather than inside `JamView` because both ends of
   * recording are the window's: the mark it puts on the transport, and the
   * TAB, which is how the hook knows the jam has left the engine. A take
   * belongs to the jam on the engine and ends when that jam does, so leaving
   * the Jam tab ends it — see `useJamTakes`.
   */
  /**
   * W32 — the camera on the Jam tab, declared before the take's hook because
   * the take's hook calls into it.
   *
   * The engine only NAMES a take when it stops, and the picture has to be
   * filed under that name; everything the camera can fail at fails as "no
   * picture this jam". It lives at the window level for the same reason the
   * takes do: the tab is how it knows the jam has left the engine.
   */
  const countingInRef = useRef(false);
  countingInRef.current = (state.countIn?.beats ?? 0) > 0;
  const jamCamera = useTakeCamera({
    ownerId: jamSession.jam?.id ?? null,
    active: mode === "jam",
    isPlaying: state.isPlaying,
    enabled: jamSession.jam?.camera === true,
    onSetCamera: setJamCamera,
    // A jam's clock is its own tempo and meter against the bar of the form
    // the engine is on — there is no score to count ticks in. Opened once per
    // jam, so the take's opening bar and the beat events are measured from
    // the same origin (`jamClock.ts`).
    openClock: () => {
      const jam = jamSession.jam;
      if (!jam) return null;
      const shape = jamClockShape(jam);
      return {
        sample: jamSampler(jam, () => countingInRef.current),
        startMs: (take) => jamTakeStartMs(shape, take),
      };
    },
  });

  // No jam takes on a phone (M08, kept for the MVP): see JamSetupSheet.
  const jamTakes = IS_MOBILE ? INERT_JAM_TAKES : useJamTakes({
    jam: jamSession.jam,
    view: mode,
    isPlaying: state.isPlaying,
    countingIn: (state.countIn?.beats ?? 0) > 0,
    onSetTakes: setJamTakes,
    onTakeStarted: jamCamera.onTakeStarted,
    onTakeFinished: jamCamera.onTakeFinished,
  });

  /**
   * Recording off takes the picture with it.
   *
   * The other half of `setJamCamera`'s rule, and it has to be an effect
   * rather than a line in `setJamTakes`: the switch is not the only way
   * recording ends — loading another jam, leaving the tab, or a build whose
   * engine cannot record all turn it off underneath, and a camera left open
   * over a take nobody is making is the one lie this feature may not tell.
   */
  useEffect(() => {
    if (jamSession.jam?.camera && !jamSession.jam.takes) setJamCamera(false);
  }, [jamSession.jam?.camera, jamSession.jam?.takes, setJamCamera]);

  /**
   * The count over the picture, and when this take started — the preview's
   * two numbers, exactly as Songs works them out.
   *
   * `jamRecordingSince` is read off the take's own elapsed count and only
   * recomputed when recording starts or stops, because the preview is
   * unmounted and remounted as the camera opens and closes and a clock that
   * restarted at zero then would lie about how long you had been playing.
   */
  const jamCountIn =
    state.isPlaying && (state.countIn?.beats ?? 0) > 0
      ? Math.max(1, (state.countIn?.beats ?? 0) - (state.countIn?.done ?? 0))
      : null;
  const jamRecordingSince = useMemo(
    () => (jamTakes.recording ? Date.now() - jamTakes.recordedSeconds * 1000 : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jamTakes.recording],
  );

  useEffect(() => {
    closeJamRef.current = jamSession.closeJam;
  }, [jamSession.closeJam]);

  // During the render, not from an effect: a jam step that starts on this
  // commit must find the library this commit is drawing.
  jamsRef.current = jamSession.jams;
  jamLineupRef.current = jamSession.lineup;

  useEffect(() => {
    setJamModeActive(mode === "jam" && !!jamSession.jam);
  }, [mode, jamSession.jam]);

  /**
   * What Zen shows over a jam: the chord, the next one, the place in the form.
   *
   * Worked out here rather than inside `FullscreenView` because it is the jam
   * screen's own harmony — the same `jamHarmony` the stage draws from, so the
   * big chord in Zen and the big chord on the stage cannot be two different
   * chords. Null with no jam loaded, and Zen is Zen as it always was.
   */
  const zenJam = useMemo(() => {
    const jam = jamSession.jam;
    if (!jam) return null;
    const harmony = jamHarmony(jam);
    const bars = formBars(jam.form);
    const at = barInView(jam, currentBeat?.formBar ?? 0, state.isPlaying);
    const chord = harmony.chords[at] ?? null;
    return {
      chord: chord ? chordName(chord, harmony.key) : null,
      next: nextChange(harmony.chords, at, harmony.key),
      bar: at,
      bars,
      chorus: currentBeat?.chorus ?? 1,
    };
  }, [jamSession.jam, currentBeat?.formBar, currentBeat?.chorus, state.isPlaying]);

  /**
   * The hands-free jam actions, with recording added.
   *
   * Combined here rather than inside `useJamSession` because turning takes on
   * is the one action that can stop and ask a question, and the question is
   * the window's — `useJamTakes` owns both halves of it. Memoised because the
   * dispatcher lists this object as a dependency and a fresh one every render
   * would rebuild it on every beat event.
   */
  const jamActions = useMemo(
    () => ({
      ...jamSession.actions,
      toggleTakes: () => jamTakes.requestTakes(!jamSession.jam?.takes),
      // W32 — `C`, and through the SWITCH rather than the record behind it,
      // so a first press still shows the promise. A camera that came on from
      // a footswitch without anybody having read what it records would be the
      // one thing this feature may not do.
      toggleCamera: () => jamCamera.request(!jamSession.jam?.camera),
    }),
    [
      jamSession.actions,
      jamSession.jam?.takes,
      jamSession.jam?.camera,
      jamTakes.requestTakes,
      jamCamera.request,
    ],
  );

  /**
   * The portion, hands-free (W18).
   *
   * The owner: choosing a portion of a song so it repeats is *"super critical
   * for song learning"*, and a player choosing one is holding a guitar. `[`
   * and `]` mark where it starts and stops AT THE BAR BEING PLAYED, which is
   * what every looper pedal already means by those two symbols — so the bars
   * can be marked out from a footswitch while the music runs, with the whole
   * hand staying on the neck.
   *
   * The bar being played comes from the engine's own beat event, through the
   * one function that answers "where are we" (`songPosition`). Never
   * `BeatEvent.beat`: that counts the CLICK's beats, so in 7/8 a loop marked
   * with the footswitch would start twice as far into the piece as the player
   * is. Stopped, it is the start of the current portion — a player who has
   * not pressed play yet is at the top of what they chose.
   */
  const songsActions = useMemo(
    () => {
      const score = songsSession.score;
      const barNow = () => {
        if (!score) return null;
        return songPosition(score, songsSession.range, currentBeat, {
          playing: state.isPlaying,
        }).bar;
      };
      return {
        loopStartsHere: () => {
          const bar = barNow();
          if (bar === null || !score) return;
          songsSession.setSelection(
            setEdge(score, songsSession.selection ?? songsSession.portion, "start", bar),
          );
        },
        loopEndsHere: () => {
          const bar = barNow();
          if (bar === null || !score) return;
          songsSession.setSelection(
            setEdge(score, songsSession.selection ?? songsSession.portion, "end", bar),
          );
        },
        toggleLoop: () => songsSession.setLoop(!songsSession.loop),
        clearSelection: songsSession.clearSelection,
        nudge: (bars: number) => {
          if (!score) return;
          songsSession.setSelection(
            nudgeRange(score, songsSession.selection ?? songsSession.portion, bars),
          );
        },
        /*
         * W25 — recording and the camera, hands-free.
         *
         * Through an EVENT and not through `songsSession.setTakes`, which is
         * right there. The switches are not settings: pressing one for the
         * first time shows a promise about what is recorded and where it is
         * kept, and the hooks that own those promises
         * (`useSongTakes.requestTakes`, `useSongCamera.request`) live inside
         * the Songs screen. A footswitch that wrote the setting directly
         * would turn a camera on without anybody having read what it does,
         * which is the one thing this feature may not do.
         *
         * The same door the library's "+" already uses to reach this screen's
         * file input, for the same reason: the window has no handle on a
         * control that is not its own.
         */
        toggleTakes: () => window.dispatchEvent(new Event("yames:songs-take")),
        toggleCamera: () => window.dispatchEvent(new Event("yames:songs-camera")),
      };
    },
    // Picked apart rather than `songsSession`, which is a fresh object every
    // render: with the whole session in here the dispatcher — and the key
    // listener that depends on it — would be rebuilt on every beat event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      songsSession.score,
      songsSession.range,
      songsSession.portion,
      songsSession.selection,
      songsSession.loop,
      songsSession.setSelection,
      songsSession.setLoop,
      songsSession.clearSelection,
      currentBeat,
      state.isPlaying,
    ],
  );

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

  /* ── One count-in, four modes (2026-09-19) ───────────────────────────────
   * The rules live in `./countIn`, which is a module because they are real
   * logic — a meter to read, a ceiling to respect, four stores to tell apart
   * — and this file is the one no test can render. Here is only the wiring.
   */
  const countInSubject = useMemo(
    () => ({
      view,
      jam: jamSession.jam ?? null,
      setlist: setlistSession.setlist ?? null,
      song: { bars: songsSession.mixSetting.countInBars },
      state,
    }),
    [view, jamSession.jam, setlistSession.setlist, songsSession.mixSetting.countInBars, state],
  );

  const countInOn = countInIsOn(countInSubject);

  const toggleCountIn = useCallback(() => {
    const { store, beats } = countInToggle(countInSubject);
    if (store === "jam") {
      jamSession.editJam({ countIn: beats });
      return;
    }
    if (store === "setlist") {
      const setlist = setlistSession.setlist;
      if (setlist) setlistSession.setSetlist(setSetlistCountIn(setlist, beats));
      return;
    }
    // Songs counts in bars, and the number is this song's own — the click's
    // warm-up beats are cleared by `load_song`, so writing them here is the
    // switch that did nothing that W18 was sent to fix.
    if (store === "songs") {
      songsSession.setCountInBars(beats);
      return;
    }
    void reconfigureRamp({ warmupBeats: beats });
  }, [countInSubject, setlistSession.setlist, songsSession.setCountInBars]);

  /**
   * Play, on the metronome.
   *
   * The engine has always been able to count a plain click in — the audio
   * thread gates on `count_in`, not on the drill — and nothing had ever
   * armed it, so the metronome was the one mode with no count-in at all.
   * The drill's Start seeds it in Rust and the setlist's runner arms its
   * own, so this is only ever the metronome's Play.
   */
  const togglePlaybackCountedIn = useCallback(() => {
    if (view === "beat" && !state.isPlaying && state.speedRamp.warmupBeats > 0) {
      void armCountIn(state.speedRamp.warmupBeats).catch(() => {});
    }
    void togglePlayback();
  }, [view, state.isPlaying, state.speedRamp.warmupBeats]);

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
  } = IS_MOBILE ? INERT_KEYBINDINGS : useKeybindings();

  // Help menu (O8) — the header `?` and Cmd/Ctrl-/. Silenced while the wizard
  // or the tour owns the screen, and while a key-capture modal is listening,
  // so "/" lands where the user is looking.
  const help = IS_MOBILE ? null : useHelpMenu(IS_MAC, {
    disabled: onboarding.isOpen || tour?.isOpen || !!bindingFor || inputTestOpen,
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
  } = IS_MOBILE ? INERT_INPUT_TESTER : useInputTester();

  // Audio output device list + selection — owned by a dedicated hook that
  // hydrates from the OS + persisted store and listens for hot-plug events.
  const {
    audioOutputDevices,
    setAudioOutputDevices,
    selectedOutputDevice,
    outputPair,
    selectOutputPair,
    selectOutputDevice,
    outputPairFellBack,
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

  // "Version 1.3.0 is out" — the website's phone build only (M11). A store
  // keeps its own apps current and refuses an app that points at its own
  // download page; a desktop has the real updater above. The `? … :` form is
  // the one Rollup folds, so in every other build this hook, its module and
  // the two web addresses in it are not in `dist/` at all.
  const newerVersion = SAYS_WHEN_NEWER
    ? useNewerVersion({ appVersion, isPlaying: state.isPlaying })
    : NEVER_NEWER;

  // Test builds (`IS_BETA`, .github/workflows/beta.yml) offer the next beta.
  // The desktop's updater is the one above, already pointed at the beta feed
  // at build time; Android's is its own (it installs an APK). Both say so at
  // most once a day in a pill under the header. The `? … :` form folds away
  // in a stable build, as the newer-version hook does.
  const androidBeta =
    IS_BETA && IS_MOBILE
      ? useAndroidBetaUpdate({ appVersion, isPlaying: state.isPlaying })
      : NO_ANDROID_BETA;
  const betaBusy = IS_MOBILE
    ? androidBeta.status === "downloading" || androidBeta.status === "installing"
    : updateStatus === "downloading";
  const betaPrompt = IS_BETA
    ? useBetaPrompt({
        available:
          betaBusy ||
          (IS_MOBILE
            ? androidBeta.status === "available" || androidBeta.status === "needs-permission"
            : updateStatus === "available"),
        isPlaying: state.isPlaying,
      })
    : NO_BETA_PROMPT;
  const installBetaFromPrompt = useCallback(() => {
    if (IS_MOBILE) {
      androidBeta.update();
      return;
    }
    setUpdateStatus("downloading");
    // The updater exits the app and NSIS (passive) relaunches it; a failure
    // lands in the Settings banner, which says why.
    downloadAndInstallUpdate().catch(() => setUpdateStatus("failed"));
  }, [androidBeta, setUpdateStatus]);

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

  /** Settings, scrolled to the instrument: the guitar-first note's link. */
  const openInstrumentSettings = useCallback(() => {
    setView("settings");
    for (const delay of [80, 260, 520]) {
      setTimeout(
        () =>
          document
            .getElementById("settings-instrument")
            ?.scrollIntoView({ block: "center", behavior: "auto" }),
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
  // Undefined on a phone: the wizard has its own stand-ins for both of
  // these, and its coach and audio-input steps are not in the mobile step
  // registry at all.
  const wizardCoach: WizardCoachEnv | undefined = IS_MOBILE ? undefined : useMemo(
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
  const [wizardInputError, setWizardInputError] = useState<string | null>(null);
  // "Where do you start?" and W7 use the app's single `useSessionRun`, as W5
  // uses the single `useEvaluation`: a Path started in the wizard is the one
  // Today plans and the Path page shows.
  const wizardLearning: WizardLearningEnv = useMemo(
    () => ({
      paths: sessionRun.paths,
      progress: sessionRun.progress,
      plan: sessionRun.plan,
      startPath: sessionRun.actions.startPath,
    }),
    [sessionRun.paths, sessionRun.progress, sessionRun.plan, sessionRun.actions.startPath],
  );
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
      // The wizard's W5 says what went wrong when the stream will not open
      // (busy, unplugged, or the OS refused the microphone), so the rejection
      // is kept rather than dropped.
      setListening: (on: boolean) =>
        evaluation.setListening(on).then(
          () => setWizardInputError(null),
          (err: unknown) => setWizardInputError(on ? String(err) : null),
        ),
      spectrum: evaluation.spectrum,
      lastFeedback: evaluation.lastFeedback,
      avgDeviation: evaluation.avgDeviation,
      startError: wizardInputError,
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
      wizardInputError,
    ],
  );

  // The voice question W4 leaves open, asked when the voices actually land.
  const voicePrompt = IS_MOBILE ? null : useVoicePrompt();
  const openVoiceSettings = useCallback(() => {
    voicePrompt?.accept();
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
  // "Send feedback" (Help menu, Settings): a prefilled GitHub issue in the
  // browser. Nothing is sent from the app.
  const sendFeedback = useCallback(() => {
    void openFeedback(appVersion, i18n.language).catch(() => {});
  }, [appVersion, i18n.language]);

  // "Run setup again" from Settings: a run closed early (Esc on its welcome
  // screen) goes back to Settings rather than to the tab behind it (P1-6).
  const wizardFromSettingsRef = useRef(false);
  const handleWizardFinish = useCallback(
    (outcome: "completed" | "skipped" | "closed") => {
      const fromSettings = wizardFromSettingsRef.current;
      wizardFromSettingsRef.current = false;
      void stopSoftClick().then(() => {
        if (!instrumentChosenRef.current) applyInstrument(DEFAULT_INSTRUMENT);
        // ONB-08, changed for the MVP (owner, 2026-11-16): a finished setup
        // lands on Today, the learning side's front door, rather than on the
        // Metronome. The click keeps the 80 BPM it was set up at, so the
        // Metronome opens where the wizard left it. "Just give me the click"
        // still means the click: it lands on the Metronome. A run closed
        // early stays where it was.
        if (outcome === "completed") {
          setBpm(SOFT_CLICK_BPM);
          setView("today");
        } else if (outcome === "skipped") {
          setView("beat");
        } else if (fromSettings) {
          setView("settings");
        }
      });
    },
    [stopSoftClick, applyInstrument, setView],
  );

  // Tab switching and settings are handled by the unified dispatcher via keyBindings
  const soundDropdownRef = useRef<HTMLDivElement>(null);

  // Use measureBeat from the engine — it resets correctly when groups change mid-play,
  // unlike beat % beatsPerMeasure which produces misaligned values after a meter switch.
  /*
   * There is no door out of a setlist any more (2026-09-17).
   *
   * Escape closed it, and so did clicking the row of the one you were already
   * in — both of which left the tab showing a screen with a button on it.
   * Every mode has a live working object now: the Setlist tab always has a
   * setlist on it, the way the Metronome tab always has a tempo on it, and
   * the library holds the ones you chose to save. So closing without opening
   * something else is not a thing you can ask for, and both gestures were
   * taken out rather than left to close a setlist that reopened a frame later
   * — which on a dirty one meant a dialog about losing edits, answered, and
   * then the same setlist back on the stage.
   *
   * `useSetlistSession` still has `closeSetlist`, and it still matters: it is
   * what makes room when a JAM or a preset is loaded, and the tab changes
   * with it.
   */

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
    kind: UnsavedKind;
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
          kind: "setlist",
          name: setlistSession.setlist.name,
          save: setlistSession.saveActiveSetlist,
          run: action,
        });
        return;
      }
      if (jamSession.jam && jamSession.dirty) {
        setPending({
          kind: "jam",
          name: jamSession.jam.name,
          save: jamSession.saveActiveJam,
          run: action,
        });
        return;
      }
      if (activePreset && presetDirty) {
        setPending({ kind: "preset", name: activePreset.name, save: handlePresetUpdate, run: action });
        return;
      }
      action();
    },
    [setlistSession, jamSession, activePreset, presetDirty, handlePresetUpdate],
  );
  /*
   * Everything that OPENS something closes whatever was open — one thing is
   * loaded at a time — so every one of them goes through the gate. "New
   * setlist", "New jam" and "Jam now" did not, and threw an edited jam or
   * setlist away without a word (2026-09-16).
   */
  const newSetlistGuarded = useCallback(
    () => guarded(() => void handleNewSetlist()),
    [guarded, handleNewSetlist],
  );
  const newJamGuarded = useCallback(() => guarded(handleNewJam), [guarded, handleNewJam]);

  /**
   * The row in the library keeps the focus a click gave it. Space would then
   * press the row again — and pressing the open jam's row is the gesture
   * that closes it — so the first Space after loading a jam un-selected it
   * instead of playing. Releasing the row hands Space back to the transport.
   */
  const releaseSidebarFocus = useCallback(() => {
    const active = document.activeElement as HTMLElement | null;
    if (active && active.closest(".preset-sidebar")) active.blur();
  }, []);

  /*
   * Escape puts away whatever is open OVER the jam — and stops there.
   *
   * It used to close the jam itself as its last resort, which left the tab
   * showing a screen with a button on it. Every mode has a live working
   * object now (2026-09-17), so there is nothing behind the jam to close to,
   * and a press that closed it would only be undone by the tab opening
   * another one a frame later.
   *
   * The dependency list is picked apart rather than `jamSession`, which is a
   * fresh object literal on every render: with the whole session in it this
   * listener was torn down and re-registered on every beat event, sixteen
   * times a bar.
   */
  const jamScreen = jamSession.screen;
  const jamLoaded = !!jamSession.jam;
  useEffect(() => {
    if (view !== "jam" || !jamLoaded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const el = document.activeElement as HTMLElement | null;
      // The innermost thing open is what gets put away; `jamEscapeTarget` is
      // that order, on its own, with a test on it.
      const target = jamEscapeTarget({
        typing: !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable),
        dialogOpen: !!document.querySelector('[role="dialog"], [role="alertdialog"]'),
        editorOpen: !!jamScreen?.editorOpen,
        editingBar: jamScreen?.editingBar ?? null,
        setupOpen: !!jamScreen?.setupOpen,
        chordsOpen: !!jamScreen?.chordsOpen,
      });
      if (target === "nothing") return;
      if (target === "chordPicker") {
        jamScreen?.setEditingBar(null);
        return;
      }
      if (target === "setupSheet") {
        jamScreen?.setSetupOpen(false);
        return;
      }
      if (target === "chordSheet") {
        jamScreen?.setChordsOpen(false);
        return;
      }
      // `jamEscapeTarget` still answers "jam" once the sheets are away, and
      // that answer is now nothing to do. The function is left as it is
      // because it is the written-down ORDER of what closes first, and the
      // order has not changed — only what happens when the list runs out.
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, jamLoaded, jamScreen]);

  // Escape in a tool, with nothing in it left to put away, goes back to Tools
  // (UX audit TOOL-3). What counts as "left to put away" is the hook's.
  // Back where the tool was opened from: Ctrl+5-9 from Today opens a tool
  // straight from Today, and Escape there landed on Tools, a page the player
  // never saw (acceptance pass 2, P2-8). From Tools itself, or from another
  // tool, it is Tools as before.
  const toolOrigin = useRef<"today" | "paths" | "progress" | "tools">("tools");
  const lastView = useRef(view);
  useEffect(() => {
    const from = lastView.current;
    lastView.current = view;
    if (from === view || !TOOL_VIEW_IDS.has(view)) return;
    if (from === "today" || from === "paths" || from === "progress") toolOrigin.current = from;
    else if (!TOOL_VIEW_IDS.has(from)) toolOrigin.current = "tools";
  }, [view]);
  const leaveToTools = useCallback(() => setView(toolOrigin.current), [setView]);
  useToolEscape({
    view,
    onLeave: leaveToTools,
    blocked: isFullscreen || inputTestMode || inputTestOpen || !!bindingFor || onboarding.isOpen || !!tour?.isOpen,
    jamBusy:
      !!jamScreen?.editorOpen || jamScreen?.editingBar != null || !!jamScreen?.setupOpen || !!jamScreen?.chordsOpen,
  });

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
    if (mode === "jam") jamSession.editJam({ bpm: clamped });
  };

  // A narrow window cannot hold the library and a usable stage at once. A
  // phone never has that problem — the sheet is over the stage, not beside
  // it — and the hook would slam it shut at every width the phone has.
  if (!IS_MOBILE) useLibraryFit(sidebarOpen, setSidebarOpen);

  // Which list the library shows. Settings is an overlay over a mode rather
  // than a mode of its own, so it keeps whichever list was behind it — the
  // same fallback the rail makes for its own copy of this panel.
  // The learning screens have no library of their own; their sheet (never
  // opened from them — the tab bar offers it only on a tool) falls back to
  // the metronome's.
  const libraryCovered = view === "settings" ? prevTab.current : view;
  const libraryView: PlayTab = isPlayTab(libraryCovered) ? libraryCovered : "beat";

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

  // A press of the single footswitch. Through a ref because the pedal needs the
  // MIDI bindings, which are built from the dispatcher this hands to.
  const pedalPress = useRef<() => void>(() => {});
  const sessionActions = useMemo(
    () => ({
      startToday: sessionRun.actions.startToday,
      // A key: pauses a running warm-up rather than skipping it (`goKey`).
      go: sessionRun.actions.goKey,
      slower: sessionRun.actions.slower,
      faster: sessionRun.actions.faster,
      next: sessionRun.actions.next,
      pedalPress: () => pedalPress.current(),
      // Escape: a running Take stops first; leaving asks once there are Takes.
      exit: sessionRun.actions.escape,
      cycleView: sessionRun.actions.cycleView,
      togglePause: sessionRun.actions.togglePause,
      restart: sessionRun.actions.restart,
    }),
    [
      sessionRun.actions.togglePause,
      sessionRun.actions.restart,
      sessionRun.actions.cycleView,
      sessionRun.actions.escape,
      sessionRun.actions.startToday,
      sessionRun.actions.goKey,
      sessionRun.actions.slower,
      sessionRun.actions.faster,
      sessionRun.actions.next,
    ],
  );

  // Shared action dispatcher — called by keyboard handler and gamepad hook
  // Nothing on a phone dispatches an action: no keyboard, no pedal, no
  // gamepad. The dispatcher also drives the window APIs, which is the other
  // reason it does not travel.
  const dispatchAction = IS_MOBILE ? () => {} : useActionDispatcher({
    view,
    setView: navigate,
    prevTab,
    setlistLoaded: !!setlistSession.setlist,
    jamLoaded: !!jamSession.jam,
    jamEditorOpen: jamSession.screen.editorOpen,
    onToggleJam: toggleJamPlayback,
    // The record switch goes through the same gate the on-screen one does —
    // including the first-time dialog — so a footswitch cannot start a
    // recording nobody has been told about.
    jamActions,
    songsLoaded: !!songsSession.score,
    songsActions,
    sessionActions,
    state,
    isFullscreen,
    setIsFullscreen,
    setIsOsFullscreen,
    setSidebarOpen,
    toggleCard: session.toggleCard,
    forceWebviewFocus,
  });

  // How each control got its focus, which `focusedControlTakesKey` reads.
  useEffect(() => {
    if (!IS_MOBILE) trackFocusModality();
  }, []);

  // Unified local hotkey dispatcher — reads from keyBindings
  useEffect(() => {
    // The onboarding overlay owns the keyboard while it is up — Space must
    // not start the metronome behind it.
    // The onboarding overlay and the tour each own the keyboard while they are
    // up — Space must not start the metronome behind them.
    // No OS keyboard on a phone, and nothing to bind: this is what keeps
    // the hotkey table and the combo parser out of the mobile bundle.
    if (IS_MOBILE) return;
    if (bindingFor || onboarding.isOpen || tour?.isOpen) return;
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
          // A menu, a dropdown or a dialog standing open is what Escape puts
          // away first; its own listener does that. This one ran before them
          // (registered at mount) and left Settings with the language list,
          // or the header's sound picker, still open over it.
          if (e.defaultPrevented || somethingOpen()) return;
          e.preventDefault();
          setView(prevTab.current);
          return;
        }
      }
      const combo = eventToCombo(e);
      if (!combo) return;
      // Which action this key means — and on which tab (2026-09-20). The rule
      // and the reason for it are `hotkeys.ts`'s `actionForCombo`, which is
      // where they can be tested (W34 item 3).
      const actionId = actionForCombo(keyBindings, combo, view) as HotkeyAction | undefined;
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
      // Enter or Space on a focused button is that button's (N-P1-1).
      if (focusedControlTakesKey(e, view, { zen: isFullscreen })) return;
      // A Session key off the Session means nothing (the dispatcher drops it),
      // so it must not eat the key either: Enter stays the page's own.
      if (sessionKeyIsInert(actionId, view)) return;
      e.preventDefault();
      dispatchAction(actionId);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [view, keyBindings, isFullscreen, bindingFor, setView, dispatchAction, inputTestMode, onboarding.isOpen, tour?.isOpen]);

  // MIDI controller support. The dispatcher is silenced while the input
  // tester is open by reading `inputTestModeRef` (the ref pattern keeps
  // the useMidi callback's closure stable so it doesn't re-subscribe on
  // every toggle).
  const [midiAutoAccept, setMidiAutoAccept] = useState(false);

  // midir has no Android backend and iOS Bluetooth MIDI is a v1.1 item
  // (plan §1, M07), so v1 has one rule on a phone: there is no MIDI.
  const midi = IS_MOBILE ? INERT_MIDI : useMidi((action) => {
    if (inputTestModeRef.current) return;
    // The wizard swallows keyboard hotkeys behind its overlay; a pedal press
    // while W3 is mapping must not drive the app either.
    if (onboarding.isOpen) return;
    dispatchAction(action as HotkeyAction);
  }, midiAutoAccept, inputTestMode);

  // Accumulate MIDI activity into the tester log when test mode is on.
  useEffect(() => {
    if (IS_MOBILE) return;
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
  // One footswitch, three gestures. Live only on the running Session; every
  // other action is one signal to one action, as it always was.
  const sessionPedal = useSessionPedal({
    active: view === "session",
    midiBindings: midi.bindings,
    keyBinding: keyBindings["session-pedal"],
    onGesture: (gesture) => {
      // Tap: the next thing (a running warm-up: pause). Hold: again (UX audit SES-1).
      if (gesture === "tap") sessionRun.actions.goKey();
      else if (gesture === "double") sessionRun.actions.slower();
      else sessionRun.actions.restart();
    },
  });
  pedalPress.current = sessionPedal.press;

  // No gamepad API worth supporting on a phone (plan §1).
  if (!IS_MOBILE) useGamepad({
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
    onActionRelease: (id) => {
      if (id === "session-pedal") sessionPedal.release();
    },
  });

  // Progressive first-time hints (ONBOARDING_PLAN §5). The hook owns the
  // triggers and the one-per-session rate limit; MainWindow only supplies the
  // inputs and the three actions. `coach-ask` and `zen-first` are wired at
  // their own sites (the coach feed and the Zen overlay).
  // Two of the three hints point at the floating widget and the hotkeys
  // screen, neither of which a phone has; the third is written for a
  // desktop layout (plan §6 Q2).
  // The jam's hints go in the jam page's own slot, in the flow, so they never
  // cover a control or a readout (the elapsed time, for one). Found after the
  // page mounts; until then, and anywhere else, a hint is anchored as before.
  const [jamHintSlot, setJamHintSlot] = useState<HTMLElement | null>(null);
  const appHint = IS_MOBILE ? null : useAppHints({
    view,
    bpm: state.bpm,
    subdivision: state.subdivision,
    beatGroups: state.beatGroups ?? [state.timeSignature],
    isPlaying: state.isPlaying,
    midiDevices: midi.devices,
    midiBindings: midi.bindings,
    // The three Jam hints (JAM_KILLER A4): the two doors, the sheet that is
    // live while the band plays, and the band arranging itself.
    jamLoaded: !!jamSession.jam,
    jamSetupOpen: jamSession.screen.setupOpen,
    jamChordsOpen: jamSession.screen.chordsOpen,
    jamChorus: currentBeat?.chorus ?? null,
    onSavePreset: handlePresetSave,
    onOpenWidget: () => {
      void markWidgetOpened();
      showFloating();
    },
    onOpenHotkeys: () => {
      // O3's MIDI capture flow is not merged yet — until it is, the hint
      // lands the user on the section that owns the mapping UI.
      setView("settings");
      setTimeout(() => {
        // By id: Devices shares the `hotkeys-section` class and comes first,
        // so the class landed the hint on the wrong panel.
        document
          .getElementById("settings-hotkeys")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 400);
    },
  });
  const appHintId = appHint?.id ?? null;
  useLayoutEffect(() => {
    // Looked for when the hint arrives, not only on the view: the jam page
    // mounts its slot once a jam has loaded, which is also what the hints wait for.
    if (view !== "jam" || !appHintId) {
      setJamHintSlot(null);
      return;
    }
    const find = () => document.querySelector<HTMLElement>(".jam-hint-slot");
    const found = find();
    setJamHintSlot(found);
    if (found) return;
    const watch = new MutationObserver(() => {
      const el = find();
      if (!el) return;
      watch.disconnect();
      setJamHintSlot(el);
    });
    watch.observe(document.body, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, [view, appHintId]);

  // Resize window based on current view
  const sliderPercent = ((state.bpm - 20) / (300 - 20)) * 100;
  // Round to an integer for display — the slider operates on integers and
  // the popover shouldn't ever show fractional percent values.
  const volumePercent = Math.round(state.volume * 100);

  // Fullscreen zen mode — rendered as overlay via ZenTransition below
  const zenExitHandler = useCallback(async () => {
    // One fullscreen webview on a phone: leaving zen is a React state
    // change and nothing else. There is no window to un-fullscreen.
    if (!IS_MOBILE) {
      const win = getCurrentWindow();
      if (await win.isFullscreen()) {
        await win.setFullscreen(false);
        await new Promise((r) => setTimeout(r, FULLSCREEN_EXIT_DELAY));
      }
    }
    setIsFullscreen(false);
    // alwaysOnTop + focus handled by the effect above
  }, []);

  // ---- The phone's native half (M04) ----
  //
  // Gated on a build-time constant, so the hook order never varies at runtime
  // and a desktop build drops `src/mobile/` from the graph entirely — see
  // platform.ts. The screen is kept awake for the three things you read with
  // both hands on an instrument: the metronome running, a drill climbing, and
  // zen. Not for settings.
  if (IS_MOBILE)
    useAndroidNative({
      // `&& !softClickPlaying`: the wizard demonstrates the app by running a
      // soft 80 BPM click while it is open, which is the transport as far as
      // the engine is concerned. Passed through as "playing" it started the
      // foreground service — and so raised Android's notification prompt — on
      // the welcome screen of a first launch, before the user had pressed
      // anything at all. A demo click needs no service: it stops when the
      // wizard closes and nothing about it has to survive the screen going
      // off.
      isPlaying: state.isPlaying && !softClickPlaying,
      bpm: state.speedRamp?.active ? state.speedRamp.currentBpm : state.bpm,
      keepScreenOn:
        state.isPlaying || isFullscreen || (state.speedRamp?.active ?? false),
      lightTheme: getThemeById(state.theme).group === "light",
    });
  // What the system Back gesture closes, outermost last. Sheets register
  // themselves (see components/Sheet.tsx); these two are the app's own
  // full-screen layers, and with the stack empty Back backgrounds the app
  // with the click still going rather than killing it.
  if (IS_MOBILE) useBackDismiss(isFullscreen, zenExitHandler);
  // A route change closed the input (a USB interface or jack adapter pulled
  // or plugged): restart it on what is there and say so (M7, review).
  const inputRoute = IS_MOBILE ? useInputRoute(evaluation) : null;
  const settingsBack = useCallback(() => setView(prevTab.current), [setView, prevTab]);
  if (IS_MOBILE) useBackDismiss(view === "settings", settingsBack);

  return (
    <>
    <ZenTransition isActive={isFullscreen} themeId={state.theme} disabled={viewTransitions === "off"} level={viewTransitions} animStyle={animationStyle}>
      <FullscreenView
        state={state}
        currentBeat={currentBeat}
        activeTab={mode === "drill" ? "drill" : mode === "jam" && jamSession.jam ? "jam" : "beat"}
        jam={zenJam}
        // Whichever tab put it there: the jam tab's own, or a setlist step
        // that is a jam, which reads as "beat" above and is still a band.
        jamOnEngine={(mode === "jam" && !!jamSession.jam) || !!setlistSession.runner.jam}
        onExit={zenExitHandler}
      />
    </ZenTransition>
    <div
      // `is-mobile` is the hook every phone layout rule in shell.css and
      // metronome.css hangs off. It is written from a build-time constant, so
      // a desktop build never carries it and cannot reach those rules —
      // which is why the phone layout is not a width breakpoint.
      className={`main-window ${IS_MOBILE ? "is-mobile" : ""} ${isOsFullscreen ? "os-fullscreen" : ""} ${IS_MAC ? "os-mac" : IS_WINDOWS ? "os-windows" : IS_LINUX ? "os-linux" : "os-other"}`}
      data-playing={state.isPlaying}
      data-border={activeBorder}
      /* A newer version is out and you have not been to About yet. One
         attribute on the window rather than a prop into the tab bar: the dot
         is a mark on the Settings tab and the tab bar belongs to another
         task, so this says the fact and `shell.css` draws it. Absent while
         you are actually in Settings — the row is right there. */
      data-newer-version={newerVersion.newest && view !== "settings" ? "" : undefined}
    >
      <SkipLink root={contentRef} view={view} />
      <ThemeEffects themeId={state.theme} currentBeat={currentBeat} isPlaying={state.isPlaying} />
      {!IS_MOBILE && <TitleBar />}

      {onboarding.chipVisible && view !== "settings" && !holdNudges && (
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
      {IS_MOBILE && inputRoute?.changedTo !== null && inputRoute?.changedTo !== undefined && (
        <button
          type="button"
          className="input-route-notice"
          role="status"
          data-testid="input-route-notice"
          onClick={inputRoute.dismiss}
        >
          {t("session.inputChanged", { device: inputRoute.changedTo || t("settings.inputTest.systemDefault") })}
        </button>
      )}

      {IS_BETA && betaPrompt.show && !audioError.notice && !holdNudges && (
        <BetaUpdateNotice
          version={IS_MOBILE ? androidBeta.version : latestVersion}
          busy={betaBusy}
          progress={IS_MOBILE ? androidBeta.progress : null}
          onUpdate={installBetaFromPrompt}
          onDismiss={betaPrompt.dismiss}
        />
      )}

      {audioError.notice && (
        <AudioErrorNotice
          notice={audioError.notice}
          onOpenSettings={
            // No Devices section exists on a phone to deep-link into.
            IS_MOBILE
              ? undefined
              : () => {
                  audioError.dismiss();
                  openAudioSettings();
                }
          }
          onDismiss={audioError.dismiss}
        />
      )}

      {/* Hints stay out of the way of the wizard, of the tour (another
          anchored overlay — two cards pointing at the same UI is noise) and
          of Zen (which renders its own `zen-first` card inside the overlay). */}
      {!IS_MOBILE && appHint && !onboarding.isOpen && !tour?.isOpen && !isFullscreen && !holdNudges && (
        // "jam-live" is about the open sheet, which lies over the page:
        // it stays anchored, where it can be seen.
        jamHintSlot && appHint.id.startsWith("jam-") && appHint.id !== "jam-live" ? (
          createPortal(
            <HintCard
              id={appHint.id}
              inline
              onAction={appHint.onAction}
              onDismiss={appHint.markShown}
              animate={!reducedMotion}
            />,
            jamHintSlot,
          )
        ) : (
          <HintCard
            id={appHint.id}
            onAction={appHint.onAction}
            onDismiss={appHint.markShown}
            animate={!reducedMotion}
          />
        )
      )}

      {!IS_MOBILE && tour?.offerVisible && view !== "settings" && !holdNudges && (
        <TourOfferToast
          onAccept={tour.acceptOffer}
          onDismiss={tour.dismissOffer}
          animate={!reducedMotion}
        />
      )}

      {/* W4 left the voice unchosen on purpose; the download that finished is
          what makes the question answerable (O4). Never over the wizard or
          over the Settings page it points at. */}
      {!IS_MOBILE && voicePrompt?.visible && view !== "settings" && !onboarding.isOpen && !holdNudges && (
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

      <LearningNeck view={view}>
      <div className="main-body" data-session={inSession ? "" : undefined}>
        {/* A phone gets a bottom tab bar instead (below): 252px of rail on a
            360px screen is two thirds of the app. See MobileTabBar.tsx. */}
        {!IS_MOBILE && (
        <Rail
          ref={sidebarRef}
          state={state}
          view={view}
          mode={mode}
          setView={navigate}
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
          onLoadSetlist={(next) => {
            // Clicking the setlist you are already in used to be the way out
            // of it; there is no out any more, so it is the row saying what
            // is already true. Any OTHER setlist replaces this one — which is
            // the commonest way to lose edits, so it goes through the gate.
            if (next.id === setlistSession.setlist?.id) return;
            guarded(() => setlistSession.loadSetlist(next));
          }}
          onNewSetlist={newSetlistGuarded}
          onDeleteSetlist={setlistSession.deleteSetlist}
          onRenameSetlist={setlistSession.renameSetlist}
          onDuplicateSetlist={setlistSession.duplicateSetlist}
          onReorderSetlists={setlistSession.reorderSetlists}
          jams={jamSession.jams}
          activeJamId={jamSession.jam?.id ?? null}
          // And the same for a jam: the row you are on is where you are.
          onLoadJam={(next) => {
            if (next.id === jamSession.jam?.id) return;
            guarded(() => {
              jamSession.loadJam(next);
              releaseSidebarFocus();
            });
          }}
          onNewJam={newJamGuarded}
          onDeleteJam={jamSession.deleteJam}
          onRenameJam={jamSession.renameJam}
          onDuplicateJam={jamSession.duplicateJam}
          onReorderJams={jamSession.reorderJams}
          onAddJamToSetlist={(jamId, setlistId) => {
            const jam = jamSession.jams.find((j) => j.id === jamId);
            if (jam) void setlistSession.addJamToSetlist(setlistId, jam);
          }}
          /* One row per FILE (W35). `activeSongId` is still the PART on the
             stage; the row it lights is the file that part belongs to. */
          songFiles={songsSession.songFiles}
          activeSongId={songsSession.song?.id ?? null}
          dueSongs={songsDue}
          onLoadSong={songsSession.loadSong}
          /* The library's "+" reaches the same file input the stage owns.
             There is only one, on the view, so the picker and the drop
             target cannot drift apart. */
          onImportSong={() => {
            setView("songs");
            window.dispatchEvent(new CustomEvent("yames:songs-import"));
          }}
          onDeleteSong={songsSession.deleteSong}
          onRenameSong={songsSession.renameSong}
          coachOpen={session.cardOpen}
          coachActive={session.active}
          coachListening={evaluation.enabled}
          onToggleCoach={session.toggleCard}
          onZen={() => setIsFullscreen(true)}
          keyBindings={keyBindings}
        />
        )}
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
        {view !== "session" && (
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
          setlistUnsaved={setlistSession.unsaved}
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
          jamUnsaved={jamSession.unsaved}
          jamSaveFeedback={jamSession.saveFeedback}
          onSaveJam={jamSession.saveActiveJam}
          onRevertJam={jamSession.revertJam}
          onRenameJam={() => {
            const id = jamSession.jam?.id;
            if (!id) return;
            setSidebarOpen(true);
            setTimeout(() => sidebarRef.current?.triggerRenameJam(id), 150);
          }}
          // The two sheets. One open at a time: they occupy the same 640px on
          // the right, and two of them stacked would be a screen with no jam
          // left on it.
          //
          // Not in a phone's context bar, though: forty pixels already hold a
          // name, two volumes and an overflow, and both buttons were drawn
          // off the end of it (M08-JAM-GAPS). Without a handler `JamSaveBar`
          // draws neither, and the jam's own screen carries them instead —
          // see the two `.jam-phone-doors` buttons at the top of `JamView`.
          jamSetupOpen={jamSession.screen.setupOpen}
          onToggleJamSetup={
            IS_MOBILE
              ? undefined
              : () => {
                  const next = !jamSession.screen.setupOpen;
                  jamSession.screen.setSetupOpen(next);
                  if (next) jamSession.screen.setChordsOpen(false);
                }
          }
          jamChordsOpen={jamSession.screen.chordsOpen}
          onToggleJamChords={
            IS_MOBILE
              ? undefined
              : () => {
                  const next = !jamSession.screen.chordsOpen;
                  jamSession.screen.setChordsOpen(next);
                  if (next) jamSession.screen.setSetupOpen(false);
                }
          }
          setlistsForJam={setlistSession.setlists}
          onAddJamToSetlist={(setlistId) => {
            const jam = jamSession.jam;
            if (jam) void setlistSession.addJamToSetlist(setlistId, jam);
          }}
          listening={evaluation.enabled}
          /* On the pages that plan graded work, the input chip is also the way
             to set it up while it is off (UX audit TODAY-10). */
          onSetUpInput={
            view === "today" || view === "paths" || view === "progress" ? openAudioSettings : undefined
          }
          /* W36 item 2 — on Songs the bar carries the song, and the click's
             sound picker is not part of it: over a file that brings its own
             band the click starts off, and what it sounds like when it is on
             is a metronome setting. Which modes want the picker is the
             shell's question, so it is answered here. */
          soundPicker={view !== "songs" && !isLearnTab(view)}
          modeBar={view === "songs"}
          soundOpen={soundOpen}
          setSoundOpen={setSoundOpen}
          soundDropdownRef={soundDropdownRef}
          shareBtnRef={shareBtnRef}
          shareOpen={shareOpen}
          setShareOpen={setShareOpen}
          shareTooltip={shareTooltip}
          volumePercent={volumePercent}
          ttsVolume={IS_MOBILE ? undefined : coach.ttsVolume}
          setTtsVolume={IS_MOBILE ? undefined : coach.setTtsVolume}
          voiceEnabled={
            IS_MOBILE
              ? undefined
              : coach.coachBrainTier !== "off" &&
                coach.coachVoiceMode === "voice" &&
                !!coach.modelStatus?.voiceReady
          }
          onOpenHelp={help?.openMenu}
        />
        )}

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

        {/* Asked once, before the first take is ever recorded. Beside the
            unsaved-changes dialog because they are the app's two modals and
            they wear the same card. */}
        {jamTakes.introOpen && (
          <TakesIntroDialog
            onConfirm={jamTakes.confirmIntro}
            onCancel={jamTakes.cancelIntro}
          />
        )}

        {/* W32 — and the camera's own, a different promise from the take's:
            one is about a file of your playing, the other is about a picture
            of you. Once per MACHINE and not once per mode, so a player who
            read it on the Songs tab is not asked again here — the key is
            `CAMERA_INTRO_KEY` and it is the same one. */}
        {jamCamera.introOpen && (
          <CameraIntroDialog
            onConfirm={jamCamera.confirmIntro}
            onCancel={jamCamera.cancelIntro}
          />
        )}

        {/* W32 — the little mirror, over the jam stage.

            Drawn by the WINDOW and fixed to it, not by `JamView`. The jam
            stage is a column that scrolls — at 480×780 it is a hundred and
            sixty pixels taller than the room it has — so a picture anchored
            to the bottom of that column is a picture below the fold, which
            is the same bug as covering something and harder to notice. It
            also cannot be fixed to the window from inside the stage:
            `.jam-view` is a container query container, and layout
            containment makes it the containing block for anything fixed
            inside it.

            So it lives here, above the transport, in one of the two bottom
            corners. It draws nothing at all unless the camera is open. */}
        {mode === "jam" && (
          <CameraPreview
            camera={jamCamera}
            countIn={jamCountIn}
            recordingSince={jamCamera.recording ? jamRecordingSince : null}
            corners={JAM_PREVIEW_CORNERS}
            className="jam-camera-preview"
          />
        )}

        {pending && (
          <UnsavedChangesDialog
            kind={pending.kind}
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
              jam={setlistSession.runner.jam}
              currentBeat={currentBeat}
              onEdit={setlistSession.editWhileRunning}
            />
          ) : setlistSession.setlist ? (
            <SetlistParagraph
              setlist={setlistSession.setlist}
              selectedStepId={setlistSession.selectedStepId}
              onSelectStep={setlistSession.selectStep}
              selectedStepIds={setlistSession.selectedStepIds}
              onExtendSelection={setlistSession.extendSelection}
              onToggleSelection={setlistSession.toggleStepSelection}
              onCollapseSelection={setlistSession.collapseSelection}
              runningIndex={setlistSession.runningIndex}
              onChange={setlistSession.setSetlist}
              onPatchStep={setlistSession.patchStep}
              onAddStep={setlistSession.addStepFromNow}
              jams={jamSession.jams}
              onAddJamStep={setlistSession.addJamStep}
              onBackToPlaying={setlistSession.backToPlaying}
            />
          ) : (
            /* Nothing, and only for as long as it takes the tab to pick one.
               The Setlist tab opens on the setlist you last had, on the first
               in the library, or on a new one — so "no setlist" is a moment
               between two renders now, not a screen anybody sits on. A full
               empty state drawn for that moment would be a flash of an
               invitation nobody needed. */
            null
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
              jams={jamSession.jams}
              onEdit={jamSession.editJam}
              onLoadJam={(next) => guarded(() => jamSession.loadJam(next))}
              currentBeat={currentBeat}
              isPlaying={state.isPlaying}
              instrument={instrument}
              lineup={jamSession.lineup}
              trainedBpm={jamSession.trainedBpm}
              listening={evaluation.enabled}
              takes={jamTakes}
              onToggleTakes={jamTakes.requestTakes}
              camera={jamCamera}
              onPreviewKit={jamSession.startKitPreview}
              previewingKit={jamSession.previewKit}
              onPreviewVibe={jamSession.previewVibe}
              onStopPreview={jamSession.stopPreview}
              previewingVibe={jamSession.previewingVibe}
              customKitRefused={jamSession.customKitRefused}
              screen={jamSession.screen}
              position={jamSession.position}
              themeId={state.theme}
              viewTransitions={viewTransitions}
              animationStyle={animationStyle}
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
            /* Nothing, and only for as long as it takes the tab to pick one.
               The Jam tab opens on the jam you last had, on the first in the
               library, or on a new one — so "no jam" is a moment between two
               renders now, not a screen anybody sits on. */
            null
          )
        ) : view === "today" ? (
          <TodayView
            session={sessionRun}
            onOpenTools={() => setView("tools")}
            onOpenPaths={() => setView("paths")}
            instrument={instrument}
            onOpenToolsList={() => setView("tools")}
            onChangeInstrument={openInstrumentSettings}
          />
        ) : view === "paths" ? (
          <PathsView
            session={sessionRun}
            place={pathsPlace}
            instrumentNote={{
              instrument,
              onOpenTools: () => setView("tools"),
              onChangeInstrument: openInstrumentSettings,
            }}
          />
        ) : view === "progress" ? (
          <ProgressView session={sessionRun} onStart={() => setView("today")} />
        ) : view === "tools" ? (
          <ToolsView
            onOpen={setView}
            keyBindings={keyBindings}
            info={{
              bpm: state.bpm,
              groups: state.beatGroups ?? [state.timeSignature],
              freeMode: state.freeMode,
              ramp: state.speedRamp,
              setlist: lastSetlist
                ? { name: lastSetlist.name, steps: lastSetlist.steps.length }
                : null,
              jam: lastJam?.name ?? null,
              song: songsSession.song?.name ?? null,
            }}
          />
        ) : view === "session" ? (
          <>
          {sessionRun.placed && (
            <div className="session-placed" role="status" data-testid="session-placed">
              {t("session.placement.result", sessionRun.placed)}
            </div>
          )}
          {sessionRun.leaveAsked && (
            <LeaveSessionDialog
              onLeave={sessionRun.actions.exit}
              onStay={sessionRun.actions.stayInSession}
              saved={sessionRun.run.outcomes.length > 0}
            />
          )}
          <SessionView
            session={sessionRun}
            themeId={state.theme}
            beat={currentBeat}
            isPlaying={state.isPlaying}
            listening={evaluation.enabled}
            hasSignal={evaluation.hasSignal}
            bpmNow={state.bpm}
            viewKey={platformKey(keyBindings["session-view"] || "")}
            pauseKey={platformKey(keyBindings["session-pause"] || "")}
            restartKey={platformKey(keyBindings["session-restart"] || "")}
            skipKey={platformKey(keyBindings["session-next"] || "")}
            pedalMapped={
              !!keyBindings["session-pedal"] ||
              !!footBindings["session-pedal"] ||
              midi.bindings.some((b) => b.action === "session-pedal")
            }
            onCheckSound={openAudioSettings}
          />
          </>
        ) : view === "songs" ? (
          <SongsView
            session={songsSession}
            currentBeat={currentBeat}
            isPlaying={state.isPlaying}
            themeId={state.theme}
            listening={evaluation.enabled}
          />
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
            newerVersion={newerVersion}
            androidBeta={androidBeta}
            doUpdateCheck={doUpdateCheck}
            downloadAndInstallUpdate={
              IS_MOBILE ? undefined : downloadAndInstallUpdate
            }
            autoCheckUpdates={autoCheckUpdates}
            setAutoCheckUpdates={setAutoCheckUpdates}
            alwaysOnTop={state.alwaysOnTop}
            setAlwaysOnTop={alwaysOnTopSetter}
            buttonFlash={buttonFlash}
            setButtonFlash={setButtonFlash}
            activeBorder={activeBorder}
            setActiveBorder={setActiveBorder}
            drillAutoCollapse={drillAutoCollapse}
            setDrillAutoCollapse={setDrillAutoCollapse}
            onRunSetupAgain={() => {
              setView(prevTab.current);
              wizardFromSettingsRef.current = true;
              onboarding.open();
            }}
            onTakeTour={() => {
              // Leave settings first: no stop lives there, and the tour must
              // restore a real tab rather than the settings overlay.
              setView(prevTab.current);
              tour?.open(prevTab.current);
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
            outputPair={outputPair}
            selectOutputPair={selectOutputPair}
            selectOutputDevice={selectOutputDevice}
            outputPairFellBack={outputPairFellBack}
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
            coachStance={coach.coachStance}
            setCoachStance={coach.setCoachStance}
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
            jamCues={jamCues}
            setJamCues={setJamCues}
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
            practice={{
              minutes: sessionRun.minutes,
              setMinutes: sessionRun.setMinutes,
              practiceView: sessionRun.practiceView,
              setPracticeView: sessionRun.setPracticeView,
            }}
            shareTooltip={shareTooltip}
            onShareOption={handleShareOption}
          />
        )}
        </ViewTransition>
        {view === "settings" && (
          <SettingsTimeline
            // One tick per section, in the order SettingsView draws them: the
            // timeline finds a section by its position, so a section missing
            // here moves every tick after it onto its neighbour (Songs was
            // missing, until the settings revamp).
            sections={[
              { id: "general", label: t("settings.tabs.general") },
              { id: "practice", label: t("settings.tabs.practice") },
              { id: "devices", label: t("settings.tabs.devices") },
              // The coach, Songs, the widget and the hotkeys are not on this
              // screen on a phone, so the rail does not point at them.
              ...(IS_MOBILE
                ? []
                : [{ id: "smart-coach", label: t("settings.tabs.smartCoach") }]),
              { id: "appearance", label: t("settings.tabs.appearance") },
              { id: "tools", label: t("settings.tabs.tools") },
              ...(IS_MOBILE
                ? []
                : [
                    { id: "songs", label: t("settings.tabs.songs") },
                    { id: "widget", label: t("settings.tabs.widget") },
                    { id: "hotkeys", label: t("settings.tabs.hotkeys") },
                  ]),
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
          (view === "jam" && !!jamSession.jam) ||
          (view === "songs" && !!songsSession.score)) && (
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
            countIn={countInOn}
            loop={state.speedRamp.cyclic}
            /* Back to the start, beside Play — and only where there is a piece
               to go back to the start OF (W37 item 1). A stop in Songs is a
               pause now, so something visible has to rewind. */
            onBackToStart={
              view === "songs" && songsSession.score ? songsSession.backToStart : undefined
            }
            onToggleCountIn={toggleCountIn}
            onToggleLoop={() => reconfigureRamp({ cyclic: !state.speedRamp.cyclic })}
            onTogglePlayback={() =>
              view === "jam" ? toggleJamPlayback() : togglePlaybackCountedIn()
            }
            onStartSpeedRamp={() => startSpeedRamp()}
            onStopSpeedRamp={() => stopSpeedRamp()}
            setlistStepNumber={setlistSession.runner.stepNumber}
            /* The transport says what the SCREEN is doing, or what is actually
               running. This and `jamFormBars` used to be handed over whenever
               a setlist or a jam was loaded at all — harmless while that meant
               "you opened one", and not harmless once every mode began
               restoring what you last had open: the metronome's transport grew
               a "step 1 of 4" and a Skip for a set nobody had started. A run
               that IS going keeps its readout wherever you wander, which is
               the point of pressing play on a set and going to look at
               something else. */
            setlistStepCount={
              mode === "setlist" || setlistSession.runner.step
                ? (setlistSession.setlist?.steps.length ?? 0)
                : 0
            }
            setlistRemaining={setlistSession.runner.remaining}
            setlistStartAt={setlistSession.startAt}
            onSetlistSkip={setlistSession.runner.skip}
            jamFormBars={
              (mode === "jam" || setlistSession.runner.jam) && jamSession.jam
                ? formBars(jamSession.jam.form)
                : 0
            }
            jamFormBar={currentBeat?.formBar ?? 0}
            jamChorus={currentBeat?.chorus ?? 1}
            recording={jamTakes.recording}
            recordedSeconds={jamTakes.recordedSeconds}
            recordingSound={jamTakes.recordingSound}
          />
        )}
      </div>
      {!IS_MOBILE &&
        (view === "beat" ||
        view === "drill" ||
        view === "setlist" ||
        view === "jam" ||
        view === "today" ||
        view === "paths" ||
        view === "progress" ||
        view === "tools") && (
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
      </LearningNeck>

      {/* The phone's navigation, and the library it opens. Both live outside
          `.main-body` — the bar is the window's last row, under the transport,
          and the sheet portals itself over everything (Sheet.tsx).
          Not while a Session runs: one picture at a time, and the Session's
          own Exit is the way out (QA 2026-11-17 #3, the bar covered "Start
          take" at 360x800). */}
      {IS_MOBILE && !inSession && (
        <MobileTabBar
          view={view}
          setView={navigate}
          prevTab={prevTab}
          libraryOpen={sidebarOpen}
          onToggleLibrary={() => setSidebarOpen((o) => !o)}
          onZen={() => setIsFullscreen(true)}
        />
      )}

      {IS_MOBILE && (
        <Sheet
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          // Settings is an overlay over a mode, not a mode — the library it
          // would show is the one belonging to the screen underneath.
          title={t(
            libraryView === "drill"
              ? "presets.titleDrill"
              : libraryView === "setlist"
                ? "presets.titleSetlist"
                : "presets.title",
          )}
          ownHeader
          className="sheet--library"
        >
          <PresetSidebar
            ref={sidebarRef}
            state={state}
            view={libraryView}
            isOpen
            onLoadPreset={(preset) => guarded(() => void handleLoadPreset(preset))}
            onActiveChange={handleActivePresetChange}
            setlists={setlistSession.setlists}
            activeSetlistId={setlistSession.setlist?.id ?? null}
            onLoadSetlist={(next) => {
              // The same rule as the sidebar above: the setlist you are
              // already in is the row saying so, and any other one replaces
              // it through the unsaved-changes gate.
              if (next.id === setlistSession.setlist?.id) return;
              guarded(() => setlistSession.loadSetlist(next));
            }}
            onNewSetlist={handleNewSetlist}
            onDeleteSetlist={setlistSession.deleteSetlist}
            onRenameSetlist={setlistSession.renameSetlist}
            // The jams, same as the rail hands them over on a desktop.
            // Without these the sheet drew no jam rows at all, so on a phone
            // there was no way to open a jam: the tab came up empty and
            // stayed that way (M08).
            jams={jamSession.jams}
            activeJamId={jamSession.jam?.id ?? null}
            onLoadJam={(next) => {
              // The jam you are already on is the row saying so.
              if (next.id === jamSession.jam?.id) return;
              guarded(() => {
                jamSession.loadJam(next);
                releaseSidebarFocus();
              });
            }}
            onNewJam={newJamGuarded}
            onDeleteJam={jamSession.deleteJam}
            onRenameJam={jamSession.renameJam}
            onDuplicateJam={jamSession.duplicateJam}
            onReorderJams={jamSession.reorderJams}
            onAddJamToSetlist={(jamId, setlistId) => {
              const jam = jamSession.jams.find((j) => j.id === jamId);
              if (jam) void setlistSession.addJamToSetlist(setlistId, jam);
            }}
          />
        </Sheet>
      )}

      {!IS_MOBILE && showResetConfirm && (
        <ResetKeybindingsConfirm
          onConfirm={resetAllBindings}
          onCancel={() => setShowResetConfirm(false)}
        />
      )}

      {!IS_MOBILE && midi.pendingConflict && (
        <MidiConflictDialog
          conflict={midi.pendingConflict}
          autoAccept={midiAutoAccept}
          onAutoAcceptChange={setMidiAutoAccept}
          onAccept={() => midi.acceptConflict()}
          onReject={() => midi.rejectConflict()}
        />
      )}

      {!IS_MOBILE && bindingFor && (
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
      {!IS_MOBILE && inputTestMode && (
        <InputTesterModal
          log={inputTestLog}
          logRef={inputTestLogRef}
          onClose={() => setInputTestMode(false)}
          onClear={clearInputTestLog}
        />
      )}

      {!IS_MOBILE && coach.pendingDownloadTier && (
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

      {/* A Session keeps its bottom edge: the download goes on as a hairline,
          and its label, Cancel and the bars after it wait for the Session to end. */}
      {!IS_MOBILE && coach.modelDownloading && view === "session" && (
        <DownloadHairline
          downloadProgress={coach.downloadProgress}
          downloadingTier={coach.downloadingTier}
        />
      )}
      {!IS_MOBILE && coach.modelDownloading && view !== "session" && (
        <DownloadProgressBar
          downloadProgress={coach.downloadProgress}
          downloadingTier={coach.downloadingTier}
          onCancel={() => coach.cancelDownload()}
        />
      )}

      {!IS_MOBILE && coach.downloadError && view !== "session" && (
        <DownloadErrorBar
          error={coach.downloadError}
          onDismiss={() => coach.setDownloadError(null)}
        />
      )}

      {!IS_MOBILE && coach.downloadSuccess && !coach.modelDownloading && view !== "session" && (
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
      coachTier={IS_MOBILE ? "off" : coach.coachBrainTier}
      inputDeviceName={evaluation.selectedDevice}
      hasFootswitch={midi.bindings.length > 0 || Object.keys(footBindings).length > 0}
      midi={midi}
      gamepadBindings={footBindings}
      coach={wizardCoach}
      evaluation={wizardEvaluation}
      learning={wizardLearning}
      alwaysOnTop={state.alwaysOnTop}
      onAlwaysOnTopChange={alwaysOnTopSetter}
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
    {/* The tour, the help menu and the shortcuts sheet are written for a
        desktop layout with hotkeys, so a phone gets none of them (plan §6). */}
    {!IS_MOBILE && tour && (
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
    )}
    {!IS_MOBILE && help && (
      <HelpMenu
        open={help.panel === "menu"}
        onClose={help.close}
        appVersion={appVersion}
        onTakeTour={() => {
          // The tour has no stop in Settings, so leave first and hand it the
          // tab it must restore — same contract the Settings entry uses.
          const back = view === "settings" ? prevTab.current : view;
          if (view === "settings") setView(back);
          tour?.open(back);
        }}
        onRunSetupAgain={() => {
          wizardFromSettingsRef.current = view === "settings";
          if (view === "settings") setView(prevTab.current);
          onboarding.open();
        }}
        onShowShortcuts={help.openShortcuts}
        onReportProblem={help.reportProblem}
        onSendFeedback={sendFeedback}
        animate={!reducedMotion}
      />
    )}
    {!IS_MOBILE && help && (
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
    )}
    <WhatsNewModal
      open={whatsNew.isOpen && !onboarding.isOpen && !holdNudges}
      version={appVersion}
      notes={whatsNew.notes}
      onClose={whatsNew.dismiss}
      animate={!reducedMotion}
    />
    </>
  );
}
