/**
 * The coach's tools, hosted: the one `CoachToolHost` (`src/coach/tools/host.ts`),
 * built in `MainWindow` by one call (leg t1a1).
 *
 * Built ONCE, on the first render, and never again: every member reads the
 * latest values through a ref, so the object (and anything holding it) is the
 * same across the window's re-render on every beat. `useCoachToolHost.test.tsx`
 * renders it through a run of beats and holds the identity.
 *
 * t1a1 wired where the player is and going somewhere (the `go` tools); t1a2
 * wired the `confirm` tools' doors: the Session's actions, Today's minutes,
 * focus and swaps, the jams and presets (behind the window's unsaved-work
 * gate), the click, and the safe settings' own setters. Still stubs from
 * `notWiredHost()`, answering "notWiredYet": `goal` / `setGoal` (the
 * Notebook, leg c4a), `loopBars` (no bars door on the loop), and the
 * `coachSuggestions` setting (c4a's stored key).
 *
 * Review fixes (t1a2b): band volume is read and written as the STORED choice
 * (`bandChoice`, `"auto"` for none, put back as `null`); `sounding(target)`
 * knows Settings is an overlay and reads the mode under it; a load reports
 * `"asked"` when the unsaved-work question opened instead.
 */
import { useEffect, useRef } from "react";
import type { Jam } from "../../jam/types";
import {
  BAND_VOLUME_AUTO,
  notWiredHost,
  setCoachToolHost,
  SETTINGS_SECTIONS,
  type CoachToolHost,
  type SafeSettingKey,
  type SafeSettingOption,
  type SafeSettingValue,
} from "../../coach/tools/host";
import i18n, { getLanguages } from "../../i18n";
import { listPresets as listPresetsIpc, storeSave } from "../../ipc";
import { findExercise } from "../../session/packs";
import { tempoNudges } from "../../session/runner";
import { THEMES } from "../../themes";
import type { Preset, Subdivision, VoiceMode } from "../../types";
import type { MainView } from "../main-window/MainHeader";
import type { PathsPlace } from "../main-window/hooks/usePathsPlace";
import type { PracticeView } from "../session/highway/runwayModel";
import type { SessionRun } from "../session/hooks/useSessionRun";

/** The safe settings the window holds (the rest are the Session's, or the hook's own: the language). */
export type CoachToolSettingsInput = {
  theme: string;
  /** The `set_theme` IPC, as Settings calls it. */
  setTheme: (theme: string) => void;
  /** The count-in switch of the transport on screen (`countInIsOn`). */
  countIn: boolean;
  /** `MainWindow.toggleCountIn`: it writes where the screen keeps it (the jam, the setlist, the song, the click). */
  toggleCountIn: () => void;
  coachVoice: VoiceMode;
  setCoachVoice: (mode: VoiceMode) => void;
  /** Voice can be turned on: a model tier is on and a voice is installed (Settings' own condition). */
  voiceAvailable: boolean;
};

export type CoachToolHostInput = {
  view: MainView;
  /**
   * `useTabRouting`'s mode: the view, except under Settings, where it is the
   * mode Settings covers (what plays under it). Left out: the view.
   */
  mode?: MainView;
  /** `useTabRouting`'s, the rail's. */
  setView: (view: MainView) => void;
  pathsPlace: PathsPlace;
  session: SessionRun;
  /** The instrument id the player chose (`"bass"`, `"electric-guitar"`, …). */
  instrument: string;
  jams: readonly Jam[];
  /**
   * `useJamSession().loadJam` behind the window's unsaved-work gate
   * (`guarded`): `"asked"` when the gate's question opened instead.
   */
  loadJam: (jam: Jam) => "done" | "asked";
  /** The engine plays (the click, a jam's band, a song). */
  isPlaying: boolean;
  /** The tool screens' tempo, and `handleBpmChange` (clamped; on the jam tab it edits the jam). */
  tempo: number;
  setTempo: (bpm: number) => void;
  subdivision: Subdivision;
  /** The `set_subdivision` IPC. */
  setSubdivision: (subdivision: Subdivision) => void;
  /**
   * `handleLoadPreset` behind the unsaved-work gate, the preset re-read from
   * the store first (one deleted since is not applied): `"asked"` when the
   * gate's question opened instead.
   */
  loadPreset: (preset: Preset) => "done" | "asked";
  settings: CoachToolSettingsInput;
  /** The saved presets (the `list_presets` IPC). A test passes its own. */
  listPresets?: () => Promise<Preset[]>;
};

/**
 * When Settings opens it scrolls itself to the top on its own timer, so one
 * early scroll is overwritten: the same three nudges `MainWindow`'s
 * "Pick a voice" detour uses.
 */
const SCROLL_NUDGES_MS = [80, 260, 520];

const PRACTICE_VIEWS: readonly PracticeView[] = ["neck", "runway", "tab"];

/** The screens `handleLoadPreset` opens (an older store may hold neither). */
const isPresetView = (view: unknown): view is "beat" | "drill" => view === "beat" || view === "drill";
const ON_OFF: readonly SafeSettingOption[] = [
  { value: false, names: ["off"] },
  { value: true, names: ["on"] },
];

export function buildCoachToolHost(latest: { readonly current: CoachToolHostInput }): CoachToolHost {
  const session = () => latest.current.session;
  const pathOf = (pathId: string) => {
    const path = session().paths.find((p) => p.id === pathId);
    // The tools resolve against these same Paths first: a miss here is a Path that just went.
    if (!path) throw new Error(`no Path ${pathId}`);
    return path;
  };
  const exerciseOf = (pathId: string, exerciseId: string) => {
    const path = pathOf(pathId);
    const hit = findExercise(path, exerciseId);
    if (!hit) throw new Error(`no Exercise ${exerciseId} on ${pathId}`);
    return { path, ...hit };
  };

  // The presets live in the store, behind an IPC call; the host reads a copy,
  // fetched on mount and again at every read, so a preset saved a moment ago
  // is there by the press.
  let presets: Preset[] | null = null;
  const refreshPresets = () => {
    void (latest.current.listPresets ?? listPresetsIpc)()
      .then((list) => {
        presets = list;
      })
      .catch(() => {});
  };

  const safeSetting = (key: SafeSettingKey): SafeSettingValue | "notWiredYet" => {
    const { settings } = latest.current;
    switch (key) {
      case "theme":
        return settings.theme;
      case "language":
        return i18n.resolvedLanguage ?? i18n.language;
      case "practiceView":
        return session().practiceView;
      case "bandVolume":
        // The stored choice, not `bandVolume` (derived for the screen on show).
        return session().bandChoice ?? BAND_VOLUME_AUTO;
      case "countIn":
        return settings.countIn;
      case "coachVoice":
        return settings.coachVoice === "voice";
      case "coachSuggestions":
        // The stored key is the Notebook leg's (c4a: `coach.suggestions`).
        return "notWiredYet";
    }
  };

  return {
    ...notWiredHost(),
    sounding: (target) => {
      const { isPlaying, view } = latest.current;
      // The mode playing: under Settings, the one it covers (`useTabRouting`).
      const mode = latest.current.mode ?? view;
      // A Session's own sound is not this: the Session refuses the tools that leave it.
      if (!isPlaying || mode === "session") return null;
      // Settings is an overlay, and the mode playing is where the sound already is: neither stops it.
      if (target !== undefined && (target === "settings" || target === mode)) return null;
      return mode === "jam" ? "band" : mode === "songs" ? "song" : "click";
    },
    previewPlan: (change) => session().previewPlan(change),
    startToday: (at) => {
      if (at === null) session().actions.startToday();
      else session().actions.startTodayAt(at);
      return "done";
    },
    // The Step page's Play has no tempo: `play_exercise` says where it starts, and passes null.
    playExercise: (pathId, exerciseId) => {
      const { path, step, exercise } = exerciseOf(pathId, exerciseId);
      session().actions.playExercise(path, step, exercise);
      return "done";
    },
    tempo: () => (session().run.phase !== "idle" ? session().run.bpm : latest.current.tempo),
    setTempo: (bpm) => {
      // In a Session the tempo is a rung, moved by `nudgeTempo`; this is the tool screens'.
      if (session().run.phase !== "idle") throw new Error("setTempo in a Session");
      latest.current.setTempo(bpm);
      return "done";
    },
    nudgeTempo: (direction) => {
      if (direction === "slower") session().actions.slower();
      else session().actions.faster();
      return "done";
    },
    nudges: () => {
      const can = tempoNudges(session().run, session().exercise);
      return { slower: can.slower, faster: can.faster };
    },
    findEdge: (pathId, exerciseId) => {
      const { path, step, exercise } = exerciseOf(pathId, exerciseId);
      session().actions.findEdge(path, step, exercise);
      return "done";
    },
    testOut: (pathId, stepId) => {
      const path = pathOf(pathId);
      const step = path.steps.find((s) => s.id === stepId);
      if (!step) throw new Error(`no Step ${stepId} on ${pathId}`);
      session().actions.testOut(path, step);
      return "done";
    },
    swapOptions: (index, choice) => session().actions.swapOptionsAt(index, choice),
    confirmSwap: (index, replacement) => {
      session().actions.confirmSwap(index, replacement);
      return "done";
    },
    undoSwap: (index) => {
      session().actions.undoSwap(index);
      return "done";
    },
    setMinutes: (minutes) => {
      session().setMinutes(minutes);
      return "done";
    },
    setTodayFocus: (focus) => {
      session().setTodayFocus(focus);
      return "done";
    },
    followPath: (pathId, level) => (session().actions.startPath(pathOf(pathId), level) === "cap" ? "cap" : "done"),
    loadJam: (jamId) => {
      const jam = latest.current.jams.find((j) => j.id === jamId);
      if (!jam) throw new Error(`no jam ${jamId}`);
      return latest.current.loadJam(jam) === "asked" ? "asked" : "done";
    },
    presets: () => {
      refreshPresets();
      return presets ? presets.map((p) => ({ id: p.id, name: p.name, ...(isPresetView(p.view) ? { view: p.view } : {}) })) : "notWiredYet";
    },
    loadPreset: (presetId) => {
      const preset = presets?.find((p) => p.id === presetId);
      if (!preset) throw new Error(`no preset ${presetId}`);
      return latest.current.loadPreset(preset) === "asked" ? "asked" : "done";
    },
    clickSubdivision: () => latest.current.subdivision,
    setClickSubdivision: (subdivision) => {
      latest.current.setSubdivision(subdivision);
      return "done";
    },
    safeSetting,
    safeSettingOptions: (key) => {
      switch (key) {
        case "theme":
          return THEMES.map((theme) => ({ value: theme.id, names: [theme.id, theme.name] }));
        case "language":
          return getLanguages().map((lang) => ({ value: lang.code, names: [lang.code, lang.name] }));
        case "practiceView":
          return PRACTICE_VIEWS.map((view) => ({ value: view, names: [view] }));
        case "bandVolume":
          // A level is a percentage (`settings.ts` reads it); the one word is "the app chooses".
          return [{ value: BAND_VOLUME_AUTO, names: [BAND_VOLUME_AUTO] }];
        case "countIn":
          return ON_OFF;
        case "coachVoice":
          return latest.current.settings.voiceAvailable ? ON_OFF : ON_OFF.slice(0, 1);
        case "coachSuggestions":
          return "notWiredYet";
      }
    },
    setSafeSetting: (key, value) => {
      const { settings } = latest.current;
      switch (key) {
        case "theme":
          settings.setTheme(String(value));
          return "done";
        case "language":
          // As Settings → General does it: the strings now, the choice kept for the next start.
          void i18n.changeLanguage(String(value));
          void storeSave("language", String(value)).catch(() => {});
          return "done";
        case "practiceView":
          session().setPracticeView(value as PracticeView);
          return "done";
        case "bandVolume":
          session().setBandVolume(value === BAND_VOLUME_AUTO ? null : Number(value));
          return "done";
        case "countIn":
          if (Boolean(value) !== settings.countIn) settings.toggleCountIn();
          return "done";
        case "coachVoice": {
          const mode: VoiceMode = value ? "voice" : "silent";
          settings.setCoachVoice(mode);
          void storeSave("coachVoiceMode", mode).catch(() => {});
          return "done";
        }
        case "coachSuggestions":
          return "notWiredYet";
      }
    },
    view: () => latest.current.view,
    pathsAt: () => latest.current.pathsPlace.at,
    paths: () => latest.current.session.paths,
    instrument: () => (latest.current.instrument === "bass" ? "bass" : "guitar"),
    sessionActive: () => latest.current.session.run.phase !== "idle",
    setView: (view) => latest.current.setView(view),
    movePaths: (at) => latest.current.pathsPlace.move(at),
    openSettingsSection: (section) => {
      latest.current.setView("settings");
      const id = SETTINGS_SECTIONS[section];
      for (const delay of SCROLL_NUDGES_MS) {
        setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "auto" }), delay);
      }
    },
    plan: () => latest.current.session.plan ?? null,
    minutes: () => latest.current.session.minutes,
    todayFocus: () => latest.current.session.todayFocus,
    progress: () => latest.current.session.progress,
    jams: () => latest.current.jams.map((jam) => ({ id: jam.id, name: jam.name })),
  };
}

export function useCoachToolHost(input: CoachToolHostInput): CoachToolHost {
  const latest = useRef(input);
  latest.current = input;
  const host = useRef<CoachToolHost | null>(null);
  if (host.current === null) host.current = buildCoachToolHost(latest);
  const built = host.current;
  useEffect(() => {
    // The presets' first copy, so the first `load_preset` finds them.
    built.presets();
    setCoachToolHost(built);
    return () => setCoachToolHost(null);
  }, [built]);
  return built;
}
