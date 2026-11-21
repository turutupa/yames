/**
 * The host: everything a coach tool can reach in the app, and nothing else.
 *
 * Grown from `CoachActionHost` (`blocks/actions.ts`): the block actions'
 * members are here under the same names (`loadJam`, `loadPreset`,
 * `setClickSubdivision`), so a block's button and a tool end at the same door
 * (`run.ts`, `actionHostOf`). Built once in `MainWindow.tsx` by
 * `useCoachToolHost` (`src/containers/coach/`), off the per-beat path.
 *
 * ## The never-list is structural
 *
 * The tools never touch the app's IPC or its hooks directly: everything goes
 * through this interface (`registry.test.ts` reads the tools' sources and
 * fails on an import of `ipc`, `@tauri-apps` or a hook). So what is not a
 * member here is out of the coach's reach, whatever a tool's code says. There
 * is no member, and there must never be one, for:
 *
 * - the microphone or any input, its devices, or the audio output device;
 * - grading consent (`session.grading`, `setGrading`);
 * - recording, keeping audio, a recording session;
 * - deleting anything (Takes, history, progress, a jam, a model);
 * - unfollowing a Path (`unsubscribe`);
 * - downloading a model or voices;
 * - any grade, a clean tempo, "was this fair", a pass mark or marking passed;
 * - anything that leaves the device (a link, feedback, an export, a share).
 *
 * `registry.test.ts` walks `HOST_MEMBERS` (which the type below forces to be
 * the whole interface) against that list.
 *
 * ## Complete for both halves of the tools
 *
 * t1a1 wires the members its tools use (the first block below). The rest are
 * declared now so leg t1a2 adds tools without changing this interface; until
 * it wires them, the real host's stubs return `"notWiredYet"` (`notWiredHost`).
 */

import type { NamedRef } from "../blocks/resolve";
import type { BlockInstrument } from "../blocks/types";
import type { MainView } from "../../containers/main-window/MainHeader";
import type { PathsAt } from "../../containers/main-window/hooks/usePathsPlace";
import type { PathDoc } from "../../paths/format";
import type { TodayFocus } from "../../session/focus";
import type { PlanMinutes, PlanStep, SessionPlan } from "../../session/planner";
import type { PlayerProgress } from "../../session/progress";
import type { LoopRefusal } from "../../session/runner";
import type { SwapChoice, SwapOptions } from "../../session/swap";
import type { Subdivision } from "../../types";

/** A member that is declared and not wired yet says so. */
export type NotWired = "notWiredYet";

/** Whether a host action did anything. */
export type HostOutcome = "done" | NotWired;

/**
 * A load through the window's unsaved-work gate: `"asked"` when the app's
 * own question opened instead (an edited jam, setlist or preset), and the
 * load waits on the player's answer, which may be Cancel.
 */
export type LoadOutcome = HostOutcome | "asked";

/** A saved preset as the tools see it: its name, and the screen it opens on. */
export type PresetRef = NamedRef & { view?: MainView };

/**
 * The Settings sections a tool may open, each to its element id
 * (`id="settings-…"` in `src/containers/settings/`; `registry.test.ts` checks
 * every one is there). Opening a section is how a never-action is still
 * helped: "that one is yours", with the way to it.
 */
export const SETTINGS_SECTIONS = {
  general: "settings-general",
  appearance: "settings-appearance",
  devices: "settings-devices",
  instrument: "settings-instrument",
  practice: "settings-practice",
  grading: "settings-grading",
  coach: "settings-coach",
  tools: "settings-tools",
  songs: "settings-songs",
  recording: "settings-recording-session",
  keepTakes: "settings-keep-takes",
  about: "settings-about",
} as const;

export type SettingsSection = keyof typeof SETTINGS_SECTIONS;

/**
 * The short safe list of TOOLS section 1, as keys (t1a2 maps them to the
 * existing setters). The model selector is not on it: choosing a model is
 * the player's.
 */
export const SAFE_SETTING_KEYS = [
  "theme",
  "language",
  "practiceView",
  "bandVolume",
  "countIn",
  "coachVoice",
  "coachSuggestions",
] as const;

export type SafeSettingKey = (typeof SAFE_SETTING_KEYS)[number];

export type SafeSettingValue = string | number | boolean;

/**
 * Band volume's stored value when the player never chose one: the app
 * decides (`bandVolumeFor`: off under a graded Take on a microphone). The host
 * reads and writes the STORED choice, never the level derived for the screen
 * on show, so an undo can give the choice back (finding 1 of the t1a2 review).
 */
export const BAND_VOLUME_AUTO = "auto";

/**
 * One value a safe setting may take now, and the words that name it (its id,
 * and for a language its own name). Only what the app's own control would
 * offer: Voice "on" is not an option with no voice installed.
 */
export type SafeSettingOption = { value: SafeSettingValue; names: readonly string[] };

/** What is sounding: the click (Metronome, Drill), a jam's band, or a song. */
export type Sounding = "click" | "band" | "song";

export type CoachToolHost = {
  // -- Wired in t1a1: where the player is, and going somewhere -------------

  /** The view on screen. */
  view: () => MainView;
  /** Where Paths is (list, a Path, a Step), kept while away from it. */
  pathsAt: () => PathsAt;
  /** Every Path, its words in the player's language (`loadAllPacks`). */
  paths: () => readonly PathDoc[];
  /** Whose neck a drawing is for. */
  instrument: () => BlockInstrument;
  /** A Session is open (any phase but idle). */
  sessionActive: () => boolean;
  /** Show a view. The same `setView` the rail uses. */
  setView: (view: MainView) => void;
  /** Open a Path or a Step, or the list (`usePathsPlace().move`). */
  movePaths: (at: PathsAt) => void;
  /** Open Settings at a section. */
  openSettingsSection: (section: SettingsSection) => void;
  /**
   * What is playing outside a Session, or null (named by the MODE playing:
   * under Settings, the mode Settings covers). With a `target`: what showing
   * that view would stop, as `useTabRouting.setView` does it. Settings is an
   * overlay and stops nothing, nor does going back to the mode that plays.
   * While it is not null a navigating `go` tool waits for a press (t1a2).
   */
  sounding: (target?: MainView) => Sounding | null;

  // -- Declared for t1a2 (the `confirm` tools) -----------------------------

  /** Today's plan as drawn, or null before it is built. */
  plan: () => SessionPlan | null;
  minutes: () => PlanMinutes;
  todayFocus: () => TodayFocus;
  progress: () => PlayerProgress;
  /** The plan as it would be with these changes, without making them (`set_minutes`'s proposal). */
  previewPlan: (change: { minutes?: PlanMinutes; focus?: TodayFocus }) => SessionPlan | NotWired;
  /** `sessionRun.actions.startToday` / `startTodayAt(index)` (index from 0). */
  startToday: (at: number | null) => HostOutcome;
  /** `sessionRun.actions.playExercise`, ids the app resolved; `bpm` a rung. */
  playExercise: (pathId: string, exerciseId: string, bpm: number | null) => HostOutcome;
  /** The tempo now: the Session's, or the Metronome's. */
  tempo: () => number | NotWired;
  /** In a Session: a rung of this Exercise. In the Metronome: any tempo. */
  setTempo: (bpm: number) => HostOutcome;
  /** `actions.slower` / `faster`. */
  nudgeTempo: (direction: "slower" | "faster") => HostOutcome;
  /** Which of those mean anything now (`tempoNudges`: a Test out is locked, the ladder has ends). */
  nudges: () => { slower: boolean; faster: boolean } | NotWired;
  /** `actions.findEdge`. */
  findEdge: (pathId: string, exerciseId: string) => HostOutcome;
  /** `actions.testOut`. */
  testOut: (pathId: string, stepId: string) => HostOutcome;
  /** `actions.swapOptionsAt` (index from 0). */
  swapOptions: (index: number, choice: SwapChoice) => SwapOptions | NotWired;
  /** `actions.confirmSwap`. */
  confirmSwap: (index: number, replacement: PlanStep) => HostOutcome;
  /** `actions.undoSwap`: the swap's own undo. */
  undoSwap: (index: number) => HostOutcome;
  /** `setMinutes`. */
  setMinutes: (minutes: PlanMinutes) => HostOutcome;
  /** `setTodayFocus` (a Path id or "mix"). */
  setTodayFocus: (focus: TodayFocus) => HostOutcome;
  /** `actions.startPath`: "cap" is the app's refusal (four Paths at most). No undo: unfollowing is never a tool. */
  followPath: (pathId: string, level: string | null) => "done" | "cap" | NotWired;
  /** The jams, by the names the player gave them. */
  jams: () => readonly NamedRef[];
  /** `CoachActionHost.loadJam`, behind the unsaved-work gate. */
  loadJam: (jamId: string) => LoadOutcome;
  /** The saved presets, by name, with the screen each opens on (re-read at every call). */
  presets: () => readonly PresetRef[] | NotWired;
  /**
   * `CoachActionHost.loadPreset`, behind the unsaved-work gate. The app re-reads
   * the presets at the press before it applies one, which takes a moment:
   * `applied` hears how that went (true: applied; false: the preset was gone,
   * or the store could not be read, and nothing was applied; "failed": applying
   * it failed in a way the app saw). Heard once the preset has been applied, not
   * when the re-read found it. Leg t1b1, so a receipt never says "Loaded" for a
   * preset deleted while its proposal sat in the panel (review t1a2b, B), nor
   * one that did not take (review t1b1, N2).
   */
  loadPreset: (presetId: string, applied?: (ok: boolean | "failed") => void) => LoadOutcome;
  /** The click's subdivision now. */
  clickSubdivision: () => Subdivision | NotWired;
  /** `CoachActionHost.setClickSubdivision`. */
  setClickSubdivision: (subdivision: Subdivision) => HostOutcome;
  /** A safe setting's value now (for the undo). */
  safeSetting: (key: SafeSettingKey) => SafeSettingValue | NotWired;
  /** The values a safe setting may take now (band volume, a number, has none). */
  safeSettingOptions: (key: SafeSettingKey) => readonly SafeSettingOption[] | NotWired;
  /** Change a safe setting through its existing setter. */
  setSafeSetting: (key: SafeSettingKey, value: SafeSettingValue) => HostOutcome;
  /** The Notebook's goal (DESIGN 9.5), when there is a Notebook. */
  goal: () => string | null | NotWired;
  setGoal: (text: string) => HostOutcome;
  /**
   * The Session's loop of bars as printed (leg lb1), without starting it:
   * the pattern bars and tempo a press would loop, or why it cannot
   * (`runner.loopAsked`).
   */
  loopAsk: (fromBar: number, toBar: number) => LoopAsk | NotWired;
  /** `sessionRun.actions.startLoop({ fromBar, toBar })`, bars as printed: "done", or why it did not start. */
  loopBars: (fromBar: number, toBar: number) => HostOutcome | LoopRefusal;
};

/**
 * What `loopAsk` answers: the loop a press would start, in pattern bars, or
 * the runner's reason. `loopId` (`<step id>#loop`) and `variantSeed` bind a
 * proposal to the Exercise and the variant it was made on (lb1b L5).
 */
export type LoopAsk =
  | { fromBar: number; toBar: number; bpm: number; loopId: string; variantSeed: number | null }
  | { refused: LoopRefusal };

/**
 * Every member, at runtime. The check below fails to compile when the
 * interface gains a member this list does not name, so a test walking the
 * list walks the whole interface.
 */
export const HOST_MEMBERS = [
  "view",
  "pathsAt",
  "paths",
  "instrument",
  "sessionActive",
  "setView",
  "movePaths",
  "openSettingsSection",
  "sounding",
  "plan",
  "minutes",
  "todayFocus",
  "progress",
  "previewPlan",
  "startToday",
  "playExercise",
  "tempo",
  "setTempo",
  "nudgeTempo",
  "nudges",
  "findEdge",
  "testOut",
  "swapOptions",
  "confirmSwap",
  "undoSwap",
  "setMinutes",
  "setTodayFocus",
  "followPath",
  "jams",
  "loadJam",
  "presets",
  "loadPreset",
  "clickSubdivision",
  "setClickSubdivision",
  "safeSetting",
  "safeSettingOptions",
  "setSafeSetting",
  "goal",
  "setGoal",
  "loopAsk",
  "loopBars",
] as const satisfies readonly (keyof CoachToolHost)[];

type Unlisted = Exclude<keyof CoachToolHost, (typeof HOST_MEMBERS)[number]>;
/** Compile-time: every member of `CoachToolHost` is in `HOST_MEMBERS`. */
export const HOST_MEMBERS_COMPLETE: [Unlisted] extends [never] ? true : Unlisted = true;

/** The members t1a1 wires in the real host. The rest are t1a2's. */
export const WIRED_IN_T1A1: readonly (keyof CoachToolHost)[] = [
  "view",
  "pathsAt",
  "paths",
  "instrument",
  "sessionActive",
  "setView",
  "movePaths",
  "openSettingsSection",
  // Reads the real host has to hand already; wired so t1a2 only adds actions.
  "plan",
  "minutes",
  "todayFocus",
  "progress",
  "jams",
];

/**
 * The members the real host still leaves as stubs: none. The Notebook's goal
 * was wired by c4a1 (`coach.goal`); the loop of bars named from outside has
 * its door since leg lb1 (`startLoop(bars)`).
 */
export const STILL_NOT_WIRED: readonly (keyof CoachToolHost)[] = [];

const NOT_WIRED = "notWiredYet" as const;

/**
 * A host whose every member is a stub: actions and the reads with a
 * `NotWired` answer say `"notWiredYet"`; the plain reads give an empty,
 * harmless answer. The real host starts from this and overrides what is wired.
 */
export function notWiredHost(): CoachToolHost {
  const nothing = () => NOT_WIRED;
  return {
    view: () => "today",
    pathsAt: () => ({ pathId: null, stepId: null }),
    paths: () => [],
    instrument: () => "guitar",
    sessionActive: () => false,
    setView: () => {},
    movePaths: () => {},
    openSettingsSection: () => {},
    sounding: () => null,
    plan: () => null,
    minutes: () => 15,
    todayFocus: () => "mix",
    progress: () => ({ states: [], takes: [], ceilings: [] }),
    previewPlan: nothing,
    startToday: nothing,
    playExercise: nothing,
    tempo: nothing,
    setTempo: nothing,
    nudgeTempo: nothing,
    nudges: nothing,
    findEdge: nothing,
    testOut: nothing,
    swapOptions: nothing,
    confirmSwap: nothing,
    undoSwap: nothing,
    setMinutes: nothing,
    setTodayFocus: nothing,
    followPath: nothing,
    jams: () => [],
    loadJam: nothing,
    presets: nothing,
    loadPreset: nothing,
    clickSubdivision: nothing,
    setClickSubdivision: nothing,
    safeSetting: nothing,
    safeSettingOptions: nothing,
    setSafeSetting: nothing,
    goal: nothing,
    setGoal: nothing,
    loopAsk: nothing,
    loopBars: nothing,
  };
}

// ---------------------------------------------------------------------------
// The one host, for whoever runs a tool (the Ask panel, t1b)
// ---------------------------------------------------------------------------

let current: CoachToolHost | null = null;

/** Set by `useCoachToolHost` on mount, cleared on unmount. */
export function setCoachToolHost(host: CoachToolHost | null): void {
  current = host;
}

/** The host `MainWindow` built, or null before it mounts (and in a test that did not set one). */
export function getCoachToolHost(): CoachToolHost | null {
  return current;
}
