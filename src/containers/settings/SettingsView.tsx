import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Dispatch, SetStateAction } from "react";
import type {
  AudioOutputDevice,
  BrainTier,
  CoachMode,
  ModelTier,
  Verbosity,
  VoiceMode,
  WidgetMode,
} from "../../types";
import type { ModelStatus, VoiceDiagnostic } from "../../ipc";
import type { CoachStance } from "../../coach/learningMode";
import type { useEvaluation } from "../../hooks/useEvaluation";
import type { UseMidiReturn } from "../../hooks/useMidi";
import type { BindingTarget } from "./KeybindingModals";
import { SHARE_OPTIONS } from "../../constants/metronome";
import { IS_MOBILE } from "../../platform";
import { UpdateBanner } from "./UpdateBanner";
import { GeneralSettingsSection } from "./GeneralSettingsSection";
import { ToolsSettingsSection } from "./ToolsSettingsSection";
import { AppearanceSettingsSection } from "./AppearanceSettingsSection";
import { DevicesSettingsSection } from "./DevicesSettingsSection";
import { CoachSettingsSection } from "./CoachSettingsSection";
import { SongsSettingsSection } from "./SongsSettingsSection";
import { WidgetSettingsSection } from "./WidgetSettingsSection";
import { HotkeysSettingsSection } from "./HotkeysSettingsSection";
import { SupportSection } from "./SupportSection";
import { AboutSection } from "./AboutSection";
import { PracticeSettingsSection, type PracticeSettings } from "./PracticeSettingsSection";

type ShareOption = (typeof SHARE_OPTIONS)[number];

type ViewTransitionLevel = "off" | "subtle" | "smooth" | "expressive";
type AnimationStyle = "fade" | "scale" | "blur" | "slide" | "reveal";
// The union lives with the hook that owns the state.
import type { UpdateStatus } from "../main-window/hooks/useAppUpdates";
import { NEVER_NEWER, type NewerVersion } from "../main-window/hooks/useNewerVersion";
import { NO_ANDROID_BETA, type AndroidBetaUpdate } from "../../beta/useAndroidBetaUpdate";
type Evaluation = ReturnType<typeof useEvaluation>;

interface SettingsViewProps {
  // Update banner / about
  updateStatus: UpdateStatus;
  setUpdateStatus: Dispatch<SetStateAction<UpdateStatus>>;
  latestVersion: string;
  appVersion: string;
  doUpdateCheck: () => void;
  /**
   * "Version 1.3.0 is out" — only ever set on the phone build people
   * download from the website, which nothing else keeps current (M11).
   */
  newerVersion?: NewerVersion;
  /** The Android test build's own updater (`IS_BETA && IS_MOBILE` only). */
  androidBeta?: AndroidBetaUpdate;
  /** Absent on a phone: the in-app updater is desktop-only. */
  downloadAndInstallUpdate?: () => Promise<void>;

  // General
  autoCheckUpdates: boolean;
  setAutoCheckUpdates: Dispatch<SetStateAction<boolean>>;
  alwaysOnTop: boolean;
  setAlwaysOnTop: (v: boolean) => void;
  buttonFlash: boolean;
  setButtonFlash: Dispatch<SetStateAction<boolean>>;
  activeBorder: boolean;
  setActiveBorder: Dispatch<SetStateAction<boolean>>;
  drillAutoCollapse: boolean;
  setDrillAutoCollapse: Dispatch<SetStateAction<boolean>>;
  /** Re-opens the first-run wizard at W0 (O1). */
  onRunSetupAgain: () => void;
  /** "Show me around": the learning tour (card #50). Absent from a Session's Settings. */
  onTakeTour?: () => void;
  /** The six-stop tour of the tools (O6). */
  onTakeToolsTour?: () => void;

  // Appearance
  themeId: string;
  setTheme: (theme: string) => void;
  viewTransitions: ViewTransitionLevel;
  setViewTransitions: Dispatch<SetStateAction<ViewTransitionLevel>>;
  animationStyle: AnimationStyle;
  setAnimationStyle: Dispatch<SetStateAction<AnimationStyle>>;

  // Devices
  audioOutputDevices: AudioOutputDevice[];
  setAudioOutputDevices: Dispatch<SetStateAction<AudioOutputDevice[]>>;
  selectedOutputDevice: string;
  outputPair: number;
  selectOutputPair: (pair: number) => void;
  selectOutputDevice: (deviceName: string) => void;
  outputPairFellBack: boolean;
  evaluation: Evaluation;
  midi: UseMidiReturn;
  onOpenInputTest: () => void;

  // Coach
  coachBrainTier: BrainTier;
  setCoachBrainTier: (tier: BrainTier) => void;
  coachVoiceMode: VoiceMode;
  setCoachVoiceMode: Dispatch<SetStateAction<VoiceMode>>;
  coachVoiceName: string;
  setCoachVoiceName: Dispatch<SetStateAction<string>>;
  coachVerbosity: Verbosity;
  setCoachVerbosity: Dispatch<SetStateAction<Verbosity>>;
  coachMode: CoachMode;
  setCoachMode: Dispatch<SetStateAction<CoachMode>>;
  coachStance: CoachStance;
  setCoachStance: Dispatch<SetStateAction<CoachStance>>;
  modelStatus: ModelStatus | null;
  setModelStatus: Dispatch<SetStateAction<ModelStatus | null>>;
  modelDownloading: boolean;
  /** ROADMAP §3: Studio is only offered at >= 16 GB of RAM. */
  studioAvailable: boolean;
  standardAvailable: boolean;
  /** A brain from a superseded model family is installed. */
  brainUpdateAvailable: boolean;
  availableVoices: [string, string][];
  voiceDiagnostics: VoiceDiagnostic[];
  instrument: string;
  setInstrument: Dispatch<SetStateAction<string>>;
  /** Spoken cues on the Jam tab — a preference now (JAM_UX_DECISIONS A4). */
  jamCues: boolean;
  setJamCues: Dispatch<SetStateAction<boolean>>;
  /** "Hear what I play" (detection M7), off by default. */
  jamHear?: boolean;
  setJamHear?: Dispatch<SetStateAction<boolean>>;
  onStartDownload: (tier: ModelTier) => void;
  onRequestDownload: (tier: ModelTier) => void;

  // Widget
  widgetMode: WidgetMode;
  setWidgetMode: (mode: WidgetMode) => void;
  widgetAlwaysOnTop: boolean;
  setWidgetAlwaysOnTop: (v: boolean) => void;

  // Hotkeys
  keyBindings: Record<string, string>;
  globalBindings: Record<string, string>;
  footBindings: Record<string, string>;
  bindingFor: BindingTarget | null;
  setBindingFor: Dispatch<SetStateAction<BindingTarget | null>>;
  setPendingKeys: Dispatch<SetStateAction<string>>;
  inputTestMode: boolean;
  setInputTestMode: Dispatch<SetStateAction<boolean>>;
  onResetRequest: () => void;

  /** The learning side's defaults (UX audit SET-1). Absent: no Practice panel. */
  practice?: PracticeSettings;

  // Support
  shareTooltip: boolean;
  onShareOption: (opt: ShareOption) => void;
}

/**
 * The "Settings" tab content — composed of the per-feature section
 * components from `containers/settings/*`. This is purely a presentational
 * wrapper that threads through all the state + setters owned by MainWindow.
 *
 * Extracted from MainWindow.tsx (≈100 lines of inline JSX) to keep
 * MainWindow under the 1000-line ceiling.
 */
export function SettingsView({
  updateStatus,
  setUpdateStatus,
  latestVersion,
  appVersion,
  doUpdateCheck,
  downloadAndInstallUpdate,
  newerVersion = NEVER_NEWER,
  androidBeta = NO_ANDROID_BETA,
  autoCheckUpdates,
  setAutoCheckUpdates,
  alwaysOnTop,
  setAlwaysOnTop,
  buttonFlash,
  setButtonFlash,
  activeBorder,
  setActiveBorder,
  drillAutoCollapse,
  onRunSetupAgain,
  onTakeTour,
  onTakeToolsTour,
  setDrillAutoCollapse,
  themeId,
  setTheme,
  viewTransitions,
  setViewTransitions,
  animationStyle,
  setAnimationStyle,
  audioOutputDevices,
  setAudioOutputDevices,
  selectedOutputDevice,
  outputPair,
  selectOutputPair,
  selectOutputDevice,
  outputPairFellBack,
  evaluation,
  midi,
  onOpenInputTest,
  coachBrainTier,
  setCoachBrainTier,
  coachVoiceMode,
  setCoachVoiceMode,
  coachVoiceName,
  setCoachVoiceName,
  coachVerbosity,
  setCoachVerbosity,
  coachMode,
  setCoachMode,
  coachStance,
  setCoachStance,
  modelStatus,
  setModelStatus,
  modelDownloading,
  studioAvailable,
  standardAvailable,
  brainUpdateAvailable,
  availableVoices,
  voiceDiagnostics,
  instrument,
  setInstrument,
  jamCues,
  setJamCues,
  jamHear = false,
  setJamHear,
  onStartDownload,
  onRequestDownload,
  widgetMode,
  setWidgetMode,
  widgetAlwaysOnTop,
  setWidgetAlwaysOnTop,
  keyBindings,
  globalBindings,
  footBindings,
  bindingFor,
  setBindingFor,
  setPendingKeys,
  inputTestMode,
  setInputTestMode,
  onResetRequest,
  practice,
  shareTooltip,
  onShareOption,
}: SettingsViewProps) {
  const { t } = useTranslation();
  /** Why the last install attempt failed, for the banner to show. */
  const [updateError, setUpdateError] = useState<string | null>(null);

  const handleInstallUpdate = () => {
    if (!downloadAndInstallUpdate) return;
    setUpdateStatus("downloading");
    setUpdateError(null);
    downloadAndInstallUpdate().catch((err: unknown) => {
      // This used to reset to "available" and drop the reason, so a failed
      // install was indistinguishable from a button that did nothing. The
      // first real failure was a VPN blocking the download, and the app had
      // no way to say so.
      setUpdateError(err instanceof Error ? err.message : String(err));
      setUpdateStatus("failed");
    });
  };

  return (
    <>
      {/* The page's own title, the way Today has one: a kicker and a serif
          name. Not a section: the timeline and the deep links count
          sections, and this is not one of them. */}
      <header className="settings-head">
        <span className="settings-head-kick">
          {t("settings.page.kicker", { version: appVersion })}
        </span>
        <h1 className="settings-head-title">{t("tooltip.settings")}</h1>
      </header>
      {/* The in-app updater is desktop-only. */}
      {!IS_MOBILE && (
        <UpdateBanner
          updateStatus={updateStatus}
          latestVersion={latestVersion}
          updateError={updateError}
          onInstall={handleInstallUpdate}
        />
      )}
      <GeneralSettingsSection
        autoCheckUpdates={autoCheckUpdates}
        setAutoCheckUpdates={setAutoCheckUpdates}
        alwaysOnTop={alwaysOnTop}
        setAlwaysOnTop={setAlwaysOnTop}
        onRunSetupAgain={onRunSetupAgain}
        onTakeTour={onTakeTour}
        onTakeToolsTour={onTakeToolsTour}
      />

      {/* What a Session does by default, right under General: the learning
          side is the front door now (UX audit SET-1). */}
      {practice && <PracticeSettingsSection practice={practice} />}

      <DevicesSettingsSection
        audioOutputDevices={audioOutputDevices}
        setAudioOutputDevices={setAudioOutputDevices}
        selectedOutputDevice={selectedOutputDevice}
        outputPair={outputPair}
        selectOutputPair={selectOutputPair}
        selectOutputDevice={selectOutputDevice}
        outputPairFellBack={outputPairFellBack}
        evaluation={evaluation}
        midi={midi}
        onOpenInputTest={onOpenInputTest}
        instrument={instrument}
        setInstrument={setInstrument}
      />

      {/* Order (settings revamp, 2026-11-17): what a player practising needs
          first — the guitar and its input, then the coach — then how the app
          looks, then the tools' own settings, then support and about.

          The coach's model, Songs' download watch, the floating widget and
          the hotkeys are not part of the phone app (mobile plan §1, kept for
          the MVP): no section, no greyed-out card. */}
      {!IS_MOBILE && (
        <>
        <CoachSettingsSection
          coachBrainTier={coachBrainTier}
          setCoachBrainTier={setCoachBrainTier}
          coachVoiceMode={coachVoiceMode}
          setCoachVoiceMode={setCoachVoiceMode}
          coachVoiceName={coachVoiceName}
          setCoachVoiceName={setCoachVoiceName}
          coachVerbosity={coachVerbosity}
          setCoachVerbosity={setCoachVerbosity}
          coachMode={coachMode}
          setCoachMode={setCoachMode}
          coachStance={coachStance}
          setCoachStance={setCoachStance}
          modelStatus={modelStatus}
          setModelStatus={setModelStatus}
          modelDownloading={modelDownloading}
          studioAvailable={studioAvailable}
          standardAvailable={standardAvailable}
          brainUpdateAvailable={brainUpdateAvailable}
          availableVoices={availableVoices}
          voiceDiagnostics={voiceDiagnostics}
          jamCues={jamCues}
          setJamCues={setJamCues}
          jamHear={jamHear}
          setJamHear={setJamHear}
          onStartDownload={onStartDownload}
          onRequestDownload={onRequestDownload}
        />
        </>
      )}

      <AppearanceSettingsSection
        themeId={themeId}
        setTheme={setTheme}
        viewTransitions={viewTransitions}
        setViewTransitions={setViewTransitions}
        animationStyle={animationStyle}
        setAnimationStyle={setAnimationStyle}
      />

      {/* The tools' own switches, then the tools' own sections: Songs, the
          widget and the hotkeys follow on a desktop. */}
      <ToolsSettingsSection
        buttonFlash={buttonFlash}
        setButtonFlash={setButtonFlash}
        activeBorder={activeBorder}
        setActiveBorder={setActiveBorder}
        drillAutoCollapse={drillAutoCollapse}
        setDrillAutoCollapse={setDrillAutoCollapse}
      />

      {!IS_MOBILE && (
        <>
        {/* W19 — catching a download is the only part of Songs that happens
            without being asked for, so it is the only part with a switch.
            Takes no props: it reads and writes `settings.json` itself. */}
        <SongsSettingsSection />

        <WidgetSettingsSection
          widgetMode={widgetMode}
          setWidgetMode={setWidgetMode}
          widgetAlwaysOnTop={widgetAlwaysOnTop}
          setWidgetAlwaysOnTop={setWidgetAlwaysOnTop}
        />

        <HotkeysSettingsSection
          keyBindings={keyBindings}
          globalBindings={globalBindings}
          footBindings={footBindings}
          bindingFor={bindingFor}
          setBindingFor={setBindingFor}
          setPendingKeys={setPendingKeys}
          inputTestMode={inputTestMode}
          setInputTestMode={setInputTestMode}
          midi={midi}
          onResetRequest={onResetRequest}
        />
        </>
      )}

      <SupportSection
        shareTooltip={shareTooltip}
        onShareOption={onShareOption}
        appVersion={appVersion}
      />

      <AboutSection
        appVersion={appVersion}
        newerVersion={newerVersion}
        androidBeta={androidBeta}
        updateStatus={updateStatus}
        latestVersion={latestVersion}
        onInstallUpdate={handleInstallUpdate}
        onCheckUpdate={doUpdateCheck}
      />
    </>
  );
}
