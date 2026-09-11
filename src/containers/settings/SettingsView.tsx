import type { ComponentProps, Dispatch, SetStateAction } from "react";
import type { AudioOutputDevice } from "../../types";
import type { useEvaluation } from "../../hooks/useEvaluation";
import type { UseMidiReturn } from "../../hooks/useMidi";
import { SHARE_OPTIONS } from "../../constants/metronome";
import { IS_MOBILE } from "../../platform";
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
  /** Absent on a phone: the store keeps the app up to date. */
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
  /** Re-opens the six-stop spotlight tour (O6). */
  onTakeTour: () => void;

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

  // ── The three sections a phone does not have ──────────────────────────
  //
  // The coach, the floating widget and the hotkeys are cut from the mobile
  // build entirely (mobile plan §1), so their props arrive as three
  // bundles that are simply absent there. That is not only tidier than
  // thirty-odd props threaded one by one — it is what lets Rollup drop the
  // sections AND everything that would have fed them, which a list of
  // individually-passed values cannot do.
  coach?: Omit<ComponentProps<typeof CoachSettingsSection>, "instrument">;
  widget?: ComponentProps<typeof WidgetSettingsSection>;
  hotkeys?: Omit<ComponentProps<typeof HotkeysSettingsSection>, "midi">;
  /** Shared with the devices section, so it stays on its own. */
  instrument: string;

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
  onTakeTour,
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
  coach,
  widget,
  hotkeys,
  instrument,
  shareTooltip,
  onShareOption,
}: SettingsViewProps) {
  const handleInstallUpdate = () => {
    if (!downloadAndInstallUpdate) return;
    setUpdateStatus("downloading");
    downloadAndInstallUpdate().catch(() => {
      setUpdateStatus("available");
    });
  };

  return (
    <>
      {/* Stores update apps; the in-app updater is desktop-only. */}
      {!IS_MOBILE && (
        <UpdateBanner
          updateStatus={updateStatus}
          latestVersion={latestVersion}
          onInstall={handleInstallUpdate}
        />
      )}
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
        onTakeTour={onTakeTour}
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

      {/* The practice coach, the floating widget and the hotkeys are not
          part of the phone app — no section, no greyed-out card, nothing
          that says "coming soon" (mobile plan §1). */}
      {!IS_MOBILE && coach && widget && hotkeys && (
        <>
          <CoachSettingsSection {...coach} instrument={instrument} />
          <WidgetSettingsSection {...widget} />
          <HotkeysSettingsSection {...hotkeys} midi={midi} />
        </>
      )}

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
