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
import type { useEvaluation } from "../../hooks/useEvaluation";
import type { UseMidiReturn } from "../../hooks/useMidi";
import type { BindingTarget } from "./KeybindingModals";
import { SHARE_OPTIONS } from "../../constants/metronome";
import { UpdateBanner } from "./UpdateBanner";
import { GeneralSettingsSection } from "./GeneralSettingsSection";
import { AppearanceSettingsSection } from "./AppearanceSettingsSection";
import { DevicesSettingsSection } from "./DevicesSettingsSection";
import { CoachSettingsSection } from "./CoachSettingsSection";
import { WidgetSettingsSection } from "./WidgetSettingsSection";
import { HotkeysSettingsSection } from "./HotkeysSettingsSection";
import { SupportSection } from "./SupportSection";
import { AboutSection } from "./AboutSection";

type ShareOption = (typeof SHARE_OPTIONS)[number];

type ViewTransitionLevel = "off" | "subtle" | "smooth" | "expressive";
type AnimationStyle = "fade" | "scale" | "blur" | "slide" | "reveal";
type UpdateStatus = "idle" | "checking" | "available" | "up-to-date" | "downloading";
type Evaluation = ReturnType<typeof useEvaluation>;

interface SettingsViewProps {
  // Update banner / about
  updateStatus: UpdateStatus;
  setUpdateStatus: Dispatch<SetStateAction<UpdateStatus>>;
  latestVersion: string;
  appVersion: string;
  doUpdateCheck: () => void;
  downloadAndInstallUpdate: () => Promise<void>;

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
  setSelectedOutputDevice: Dispatch<SetStateAction<string>>;
  evaluation: Evaluation;
  midi: UseMidiReturn;
  onOpenInputTest: () => void;

  // Coach
  coachBrainTier: BrainTier;
  setCoachBrainTier: Dispatch<SetStateAction<BrainTier>>;
  coachVoiceMode: VoiceMode;
  setCoachVoiceMode: Dispatch<SetStateAction<VoiceMode>>;
  coachVoiceName: string;
  setCoachVoiceName: Dispatch<SetStateAction<string>>;
  coachVerbosity: Verbosity;
  setCoachVerbosity: Dispatch<SetStateAction<Verbosity>>;
  coachMode: CoachMode;
  setCoachMode: Dispatch<SetStateAction<CoachMode>>;
  modelStatus: ModelStatus | null;
  setModelStatus: Dispatch<SetStateAction<ModelStatus | null>>;
  modelDownloading: boolean;
  availableVoices: [string, string][];
  voiceDiagnostics: VoiceDiagnostic[];
  instrument: string;
  setInstrument: Dispatch<SetStateAction<string>>;
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
  setSelectedOutputDevice,
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
  modelStatus,
  setModelStatus,
  modelDownloading,
  availableVoices,
  voiceDiagnostics,
  instrument,
  setInstrument,
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
  shareTooltip,
  onShareOption,
}: SettingsViewProps) {
  const handleInstallUpdate = () => {
    setUpdateStatus("downloading");
    downloadAndInstallUpdate().catch(() => {
      setUpdateStatus("available");
    });
  };

  return (
    <>
      <UpdateBanner
        updateStatus={updateStatus}
        latestVersion={latestVersion}
        onInstall={handleInstallUpdate}
      />
      <GeneralSettingsSection
        autoCheckUpdates={autoCheckUpdates}
        setAutoCheckUpdates={setAutoCheckUpdates}
        alwaysOnTop={alwaysOnTop}
        setAlwaysOnTop={setAlwaysOnTop}
        buttonFlash={buttonFlash}
        setButtonFlash={setButtonFlash}
        activeBorder={activeBorder}
        setActiveBorder={setActiveBorder}
        drillAutoCollapse={drillAutoCollapse}
        setDrillAutoCollapse={setDrillAutoCollapse}
        onRunSetupAgain={onRunSetupAgain}
      />

      <AppearanceSettingsSection
        themeId={themeId}
        setTheme={setTheme}
        viewTransitions={viewTransitions}
        setViewTransitions={setViewTransitions}
        animationStyle={animationStyle}
        setAnimationStyle={setAnimationStyle}
      />

      <DevicesSettingsSection
        audioOutputDevices={audioOutputDevices}
        setAudioOutputDevices={setAudioOutputDevices}
        selectedOutputDevice={selectedOutputDevice}
        setSelectedOutputDevice={setSelectedOutputDevice}
        evaluation={evaluation}
        midi={midi}
        onOpenInputTest={onOpenInputTest}
        instrument={instrument}
      />

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
        modelStatus={modelStatus}
        setModelStatus={setModelStatus}
        modelDownloading={modelDownloading}
        availableVoices={availableVoices}
        voiceDiagnostics={voiceDiagnostics}
        instrument={instrument}
        setInstrument={setInstrument}
        onStartDownload={onStartDownload}
        onRequestDownload={onRequestDownload}
      />

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

      <SupportSection
        shareTooltip={shareTooltip}
        onShareOption={onShareOption}
      />

      <AboutSection
        appVersion={appVersion}
        updateStatus={updateStatus}
        latestVersion={latestVersion}
        onInstallUpdate={handleInstallUpdate}
        onCheckUpdate={doUpdateCheck}
      />
    </>
  );
}
