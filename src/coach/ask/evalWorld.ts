/**
 * The tool test set's world: what an item is, the situation it is asked in,
 * and the app it is asked of (DESIGN C3b, TOOLS 3.4 and 3.5; leg c3b1a).
 *
 * Pure: no packs are loaded here (the caller hands in the Paths in the item's
 * language: `loadAllPacks` in vitest, the files on disk in
 * `scripts/coach-eval.mjs`), nothing is stored, nothing sounds.
 *
 * ## The runner is the judge
 *
 * An item's expected call is right when `runCoachTool` accepts it in the
 * item's situation (TOOLS 3.4): the shape check, the Take check, `when(ctx)`
 * and the tool's own resolution of the player's words against real titles.
 * The host it runs against (`evalHost`) reads a fixed world (the Paths in the
 * item's language, four followed Paths, three jams, three presets, a plan of
 * three parts) and changes nothing that outlives the item.
 *
 * Scoring a model's or the rules' answer uses the same runner: two calls are
 * the same action when the app would do the same thing (`effectOf`), so "open
 * Paths" and `go_to {screen: "paths"}` written either way score alike, and a
 * call the app refuses did nothing.
 */
import type { MainView } from "../../containers/main-window/MainHeader";
import { NEVER_ITEMS, type NeverItem } from "../../containers/coach/neverList";
import type { PathsAt } from "../../containers/main-window/hooks/usePathsPlace";
import type { Exercise, PathDoc, Step } from "../../paths/format";
import type { TodayFocus } from "../../session/focus";
import type { PlanStep, SessionPlan } from "../../session/planner";
import type { PlayerProgress } from "../../session/progress";
import type { CoachContext, CoachRun, CoachScreen } from "../context";
import { notWiredHost, type CoachToolHost, type SafeSettingOption, type SafeSettingValue } from "../tools/host";
import { COACH_TOOLS } from "../tools/registry";
import { checkCall, runCoachTool } from "../tools/run";
import { FACT_CARDS } from "./intents";
import type { RunOutcome, ToolArgs, ToolCall } from "../tools/types";
import { CARD_IDS } from "./evalCards";

// ---------------------------------------------------------------------------
// The item
// ---------------------------------------------------------------------------

/** The fifteen languages the app ships (one file each under `evals/coach/tools/`). */
export const EVAL_LANGUAGES = ["en", "es", "de", "fr", "it", "pt-BR", "nl", "pl", "tr", "ru", "vi", "ja", "ko", "zh-CN", "zh-TW"] as const;
export type EvalLanguage = (typeof EVAL_LANGUAGES)[number];

/** Where the item is asked: the view on screen (as the rail names it), or a Session. */
export const EVAL_VIEWS = ["today", "paths", "progress", "beat", "drill", "jam", "setlist", "songs", "tools", "settings", "session"] as const;
export type EvalView = (typeof EVAL_VIEWS)[number];

export const EVAL_PHASES = ["ready", "playing", "listening", "result"] as const;
export type EvalPhase = (typeof EVAL_PHASES)[number];

/**
 * The plain facts the router and `when(ctx)` read. Ids here are the app's
 * own (the situation is the app's side of the question); the player's words
 * are in `text`.
 */
export type Situation = {
  view: EvalView;
  /** A Path id: the Path Paths shows, or the one the Session plays. */
  path?: string;
  /** The Step's number on that Path: the Step page, or the Session's Step. */
  step?: number;
  /** In a Session only (default `ready`). */
  phase?: EvalPhase;
  /** The grading choice (default `on`). */
  grading?: "on" | "off" | "ask";
  /** The tempo on the Metronome, the Drill or a jam (default 100). */
  tempo?: number;
};

export type Expect =
  | { kind: "call"; tool: string; args: ToolArgs }
  | { kind: "card"; card: string; args?: ToolArgs }
  | { kind: "which" }
  | { kind: "yours"; item?: NeverItem }
  | { kind: "none" };

export type ExpectKind = Expect["kind"];

export const EVAL_TAGS = ["terse", "chatty", "typo", "slang", "near-miss", "never", "ambiguous", "wrong-screen"] as const;
export type EvalTag = (typeof EVAL_TAGS)[number];

export type EvalItem = {
  id: string;
  lang: EvalLanguage;
  situation: Situation;
  /** What the player types. */
  text: string;
  expect: Expect;
  tags: EvalTag[];
  /** Who wrote it and who re-read it (helper names, never a person's). */
  writer: string;
  reader: string;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** One line of a set file, checked for shape (not for sense: `judgeExpected` does that). */
export function parseItem(raw: string): { ok: true; item: EvalItem } | { ok: false; why: string } {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    return { ok: false, why: `not JSON: ${String(error)}` };
  }
  if (!isObject(value)) return { ok: false, why: "not an object" };
  const { id, lang, situation, text, expect, tags, writer, reader } = value;
  if (typeof id !== "string" || id === "") return { ok: false, why: "id" };
  if (typeof lang !== "string" || !(EVAL_LANGUAGES as readonly string[]).includes(lang)) return { ok: false, why: `${id}: lang` };
  if (typeof text !== "string" || text.trim() === "") return { ok: false, why: `${id}: text` };
  if (typeof writer !== "string" || writer === "" || typeof reader !== "string" || reader === "") return { ok: false, why: `${id}: writer / reader` };
  if (!Array.isArray(tags) || !tags.every((t) => (EVAL_TAGS as readonly unknown[]).includes(t))) return { ok: false, why: `${id}: tags` };
  if (!isObject(situation) || !(EVAL_VIEWS as readonly unknown[]).includes(situation.view)) return { ok: false, why: `${id}: situation.view` };
  for (const key of Object.keys(situation)) {
    if (!["view", "path", "step", "phase", "grading", "tempo"].includes(key)) return { ok: false, why: `${id}: situation.${key}` };
  }
  if (situation.phase !== undefined && !(EVAL_PHASES as readonly unknown[]).includes(situation.phase)) return { ok: false, why: `${id}: situation.phase` };
  if (situation.phase !== undefined && situation.view !== "session") return { ok: false, why: `${id}: a phase outside a Session` };
  if (situation.view === "session" && (typeof situation.path !== "string" || typeof situation.step !== "number")) {
    return { ok: false, why: `${id}: a Session needs its path and step` };
  }
  if (!isObject(expect)) return { ok: false, why: `${id}: expect` };
  switch (expect.kind) {
    case "call":
      if (typeof expect.tool !== "string" || !isObject(expect.args)) return { ok: false, why: `${id}: expect call` };
      break;
    case "card":
      if (typeof expect.card !== "string" || (expect.args !== undefined && !isObject(expect.args))) return { ok: false, why: `${id}: expect card` };
      break;
    case "yours":
      if (expect.item !== undefined && !(NEVER_ITEMS as readonly unknown[]).includes(expect.item)) return { ok: false, why: `${id}: expect yours item` };
      break;
    case "which":
    case "none":
      break;
    default:
      return { ok: false, why: `${id}: expect.kind` };
  }
  return { ok: true, item: value as EvalItem };
}

/** Every line of a set file (blank lines skipped). Throws on the first bad one: a set is fixed by hand. */
export function parseSetFile(contents: string): EvalItem[] {
  const items: EvalItem[] = [];
  contents.split("\n").forEach((raw, index) => {
    if (raw.trim() === "") return;
    const parsed = parseItem(raw);
    if (!parsed.ok) throw new Error(`line ${index + 1}: ${parsed.why}`);
    items.push(parsed.item);
  });
  return items;
}

// ---------------------------------------------------------------------------
// The world every item is asked in
// ---------------------------------------------------------------------------

/** The Paths the player follows (the planner's daily mix). */
export const WORLD_FOLLOWED = ["rhythm-foundations", "alternate-picking", "blues-pentatonics"] as const;
/** The player's jams and presets, by the names they gave them. */
export const WORLD_JAMS = ["Blues in A", "Funk 90", "Slow rock"] as const;
export const WORLD_PRESETS = ["Warm-up 80", "Triplets 120", "Gallop"] as const;
/** Today: 15 minutes, the daily mix, one part per followed Path. */
export const WORLD_MINUTES = 15;
export const WORLD_TEMPO = 100;
/** The app's themes, by id (`themes.ts`), and the safe settings as they stand. */
export const WORLD_THEMES = ["mono", "obsidian", "velvet", "neon", "aurora", "ash", "ember", "ivory", "arctic", "sand", "lavender", "prism", "manuscript"] as const;
const WORLD_SETTINGS: Readonly<Record<string, SafeSettingValue>> = {
  theme: "obsidian",
  practiceView: "neck",
  bandVolume: "auto",
  countIn: false,
  coachVoice: false,
  coachSuggestions: true,
};
const ON_OFF: readonly SafeSettingOption[] = [
  { value: true, names: ["on"] },
  { value: false, names: ["off"] },
];

function worldProgress(): PlayerProgress {
  return {
    states: WORLD_FOLLOWED.map((pathId) => ({ pathId, startedAt: 0, updatedAt: 0 })),
    takes: [],
    ceilings: [],
  };
}

/** The first Exercise of a Step (what a Session on that Step plays first). */
function firstExercise(step: Step | undefined): Exercise | undefined {
  return step?.exercises[0];
}

function stepOf(paths: readonly PathDoc[], pathId: string | undefined, order: number | undefined): { path?: PathDoc; step?: Step } {
  const path = pathId === undefined ? undefined : paths.find((p) => p.id === pathId);
  const step = path && order !== undefined ? path.steps.find((s) => s.order === order) : undefined;
  return { path, step };
}

/** Today's plan: the first Exercise of each followed Path, in order. Plain enough for the tools' reads. */
function worldPlan(paths: readonly PathDoc[], minutes = WORLD_MINUTES): SessionPlan {
  const steps: PlanStep[] = [];
  for (const pathId of WORLD_FOLLOWED) {
    const path = paths.find((p) => p.id === pathId);
    const step = path?.steps[0];
    const exercise = firstExercise(step);
    if (!path || !step || !exercise) continue;
    steps.push({
      kind: "exercise",
      id: `${path.id}/${exercise.id}`,
      role: "focus",
      pathId: path.id,
      stepId: step.id,
      exerciseId: exercise.id,
      title: exercise.title,
      bpm: exercise.tempo.rungs[0]?.bpm ?? 60,
      minutes: minutes / WORLD_FOLLOWED.length,
      variantSeed: null,
    } as unknown as PlanStep);
  }
  return { minutes: minutes as SessionPlan["minutes"], mood: "steady" as SessionPlan["mood"], daysAway: 1, steps };
}

/** A swap's replacement: the second Exercise of the same Step, else the first of the next. */
function swapCandidate(paths: readonly PathDoc[], part: PlanStep | undefined): PlanStep[] {
  if (!part || part.kind !== "exercise") return [];
  const path = paths.find((p) => p.id === part.pathId);
  const exercises = path?.steps.flatMap((s) => s.exercises) ?? [];
  const next = exercises.find((e) => e.id !== part.exerciseId);
  return next ? [{ ...part, id: `${part.pathId}/${next.id}`, exerciseId: next.id, title: next.title } as PlanStep] : [];
}

/** The coach's screen for a situation (Settings reads as Today, as `useAskHost` maps it). */
function screenOf(s: Situation): CoachScreen {
  switch (s.view) {
    case "settings":
      return "today";
    case "paths":
      return s.step !== undefined ? "step" : s.path !== undefined ? "path" : "paths";
    default:
      return s.view;
  }
}

/** The coach's context for an item, built the way `buildCoachContext` would see that screen. */
export function contextFor(situation: Situation, lang: string, paths: readonly PathDoc[]): CoachContext {
  const { path, step } = stepOf(paths, situation.path, situation.step);
  const exercise = situation.view === "session" ? firstExercise(step) : undefined;
  const rungs = exercise?.tempo.rungs ?? [];
  const run: CoachRun | undefined =
    situation.view === "session"
      ? ({
          phase: situation.phase ?? "ready",
          stepIndex: 0,
          bpm: rungs[Math.floor(rungs.length / 2)]?.bpm ?? 80,
          takes: [],
          outcomes: [],
          ungraded: false,
          untimed: false,
        } as unknown as CoachRun)
      : undefined;
  return {
    screen: screenOf(situation),
    locale: lang,
    now: 0,
    grading: situation.grading ?? "on",
    input: { listening: false, direct: false },
    brain: { llmCompiled: true, choice: "off", resident: false, fastEnough: false },
    progress: worldProgress(),
    ...(situation.view === "today" || situation.view === "settings" ? { plan: worldPlan(paths) } : {}),
    ...(run ? { run } : {}),
    ...(path ? { path: { id: path.id, title: path.title, kind: path.kind, goal: path.goal, gradingLimits: path.gradingLimits } } : {}),
    ...(step
      ? { step: { id: step.id, order: step.order, title: step.title, goal: step.goal, why: step.why, howTo: step.howTo, payoff: step.payoff } }
      : {}),
    ...(exercise ? { exercise } : {}),
  } as CoachContext;
}

/** The view a situation shows (`host.view()`): a Session sits on Today. */
function viewOf(s: Situation): MainView {
  return (s.view === "session" ? "today" : s.view) as MainView;
}

/**
 * The app as the tools see it, for one item. Every read answers from the
 * world; every change is accepted ("done") and forgotten, so one item cannot
 * change the next one's world.
 */
export function evalHost(situation: Situation, paths: readonly PathDoc[], lang = "en"): CoachToolHost {
  const { path, step } = stepOf(paths, situation.path, situation.step);
  const at: PathsAt = situation.view === "paths" ? { pathId: path?.id ?? null, stepId: step?.id ?? null } : { pathId: null, stepId: null };
  const plan = worldPlan(paths);
  const tempoScreen = situation.view === "beat" || situation.view === "drill" || situation.view === "jam";
  const sounding = null;
  const done = () => "done" as const;
  return {
    ...notWiredHost(),
    view: () => viewOf(situation),
    pathsAt: () => at,
    paths: () => paths,
    sessionActive: () => situation.view === "session",
    setView: () => {},
    movePaths: () => {},
    openSettingsSection: () => {},
    sounding: () => sounding,
    plan: () => plan,
    minutes: () => WORLD_MINUTES as SessionPlan["minutes"],
    todayFocus: () => "mix" as TodayFocus,
    progress: worldProgress,
    previewPlan: (change) => worldPlan(paths, change.minutes ?? WORLD_MINUTES),
    startToday: done,
    playExercise: done,
    tempo: () => (tempoScreen ? (situation.tempo ?? WORLD_TEMPO) : "notWiredYet"),
    setTempo: done,
    nudgeTempo: done,
    nudges: () => ({ slower: true, faster: true }),
    findEdge: done,
    testOut: done,
    swapOptions: (index) => ({ candidates: swapCandidate(paths, plan.steps[index]) }) as ReturnType<CoachToolHost["swapOptions"]>,
    confirmSwap: done,
    undoSwap: done,
    setMinutes: done,
    setTodayFocus: done,
    followPath: () => "done",
    jams: () => WORLD_JAMS.map((name, i) => ({ id: `jam-${i}`, name })),
    loadJam: done,
    presets: () => WORLD_PRESETS.map((name, i) => ({ id: `preset-${i}`, name, view: i === 1 ? ("drill" as MainView) : ("beat" as MainView) })),
    loadPreset: done,
    clickSubdivision: () => 1,
    setClickSubdivision: done,
    // The app speaks the item's language.
    safeSetting: (key) => (key === "language" ? lang : (WORLD_SETTINGS[key] ?? "notWiredYet")),
    safeSettingOptions: (key) => {
      switch (key) {
        case "theme":
          return WORLD_THEMES.map((id) => ({ value: id, names: [id] }));
        case "language":
          return EVAL_LANGUAGES.map((code) => ({ value: code, names: [code] }));
        case "practiceView":
          return ["neck", "runway", "tab"].map((v) => ({ value: v, names: [v] }));
        case "bandVolume":
          return [{ value: "auto", names: ["auto"] }];
        case "countIn":
        case "coachVoice":
          return ON_OFF;
        case "coachSuggestions":
          return [ON_OFF[0], { value: false, names: ["off", "only when I ask", "when I ask", "asked"] }];
      }
    },
    setSafeSetting: done,
    goal: () => null,
    setGoal: done,
    loopBars: done,
  } as CoachToolHost;
}

// ---------------------------------------------------------------------------
// The judge
// ---------------------------------------------------------------------------

/**
 * What a call would do here, as plain data: the receipt or proposal line
 * (its key and the values the app resolved), or why nothing happens. Two calls
 * with the same effect are the same action. `null` effect: the app refused
 * it, so nothing happened.
 */
export type Effect = { did: string | null; refused: string | null; which: boolean };

function describe(outcome: RunOutcome): Effect {
  if (!outcome.ok) {
    return { did: null, refused: `${outcome.why}:${outcome.line.key}${outcome.detail ? ` (${outcome.detail})` : ""}`, which: (outcome.choices?.length ?? 0) > 1 };
  }
  const shown = "proposal" in outcome ? outcome.proposal.line : outcome.receipt;
  const tool = "proposal" in outcome ? outcome.proposal.tool : "";
  return { did: JSON.stringify([tool, shown.key, shown.values]), refused: null, which: false };
}

/** Run a call against the item's world. Never throws. */
export function effectOf(call: ToolCall | unknown, situation: Situation, lang: string, paths: readonly PathDoc[]): Effect {
  const ctx = contextFor(situation, lang, paths);
  return describe(runCoachTool(call, evalHost(situation, paths, lang), ctx, COACH_TOOLS));
}

/**
 * Whether an item's expectation is one the app can meet: a call the runner
 * accepts here ("not yet wired" counts as accepted: the call is right, the
 * door is a later leg's), a card that exists. Null when it is; why not when not.
 */
export function judgeExpected(item: EvalItem, paths: readonly PathDoc[]): string | null {
  const { expect } = item;
  // A Session plays a Step that exists (its Exercise is what the cards read; leg c3b1b).
  if (item.situation.view === "session" && !stepOf(paths, item.situation.path, item.situation.step).step) {
    return `no Step ${item.situation.step} on ${item.situation.path}`;
  }
  if (expect.kind === "card") {
    if (!(CARD_IDS as readonly string[]).includes(expect.card)) return `no card "${expect.card}"`;
    // Its arguments, by the cards' own shape check (leg c3b1b).
    const checked = checkCall({ tool: expect.card, args: expect.args ?? {} }, FACT_CARDS, "player");
    return checked.ok ? null : `card ${expect.card}: ${checked.line.key}${checked.detail ? ` (${checked.detail})` : ""}`;
  }
  if (expect.kind !== "call") return null;
  const effect = effectOf({ tool: expect.tool, args: expect.args }, item.situation, item.lang, paths);
  if (effect.did !== null) return null;
  if (effect.refused?.startsWith("notWiredYet:")) return null;
  return effect.refused;
}
