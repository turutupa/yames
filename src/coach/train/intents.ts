/**
 * What a player might ask for, as data: the seed table the router's training
 * set is built from (leg c3d1, TOOLS 3.4).
 *
 * An intent is the MEANING of a message, with the slots its words carry
 * (`{path}`, `{bpm}`...). People (sonnet helpers, never shown the held-out
 * set) write the wordings per language, with the slots as placeholders, in
 * `evals/coach/train/wordings/<lng>.json`. Code fills the slots from the app's
 * own data (Path titles, the command tables' words), builds the call, and the
 * RUNNER decides what the right answer is in each situation (`judge.ts`): a
 * call it accepts, "which one?" when the name matches several, `none` when
 * the tool cannot run there or is not in the list shown. No model and no
 * person writes an expected answer.
 *
 * Adding a kind is one table: the card intents below are written already and
 * are skipped until their card id is in `EVAL_CARDS` (`evalCards.ts`); the
 * moment it is, the generator emits `{"card": id}` records for them.
 */
import type { NeverItem } from "../../containers/coach/neverList";
import type { ToolArgs } from "../tools/types";

/**
 * The slots a wording may carry, each filled by code:
 * - `path` a Path's name (its title, or words of it); `followed` one of the
 *   followed Paths; `step` a Step's number; `stepName` a Step's title;
 *   `exercise` an Exercise's title. A name slot is sometimes filled with
 *   words that match SEVERAL titles, which makes the right answer "which".
 * - `screen`, `section`, `scale`, `position`: the app's own words for them in
 *   the language (the command tables, or the wordings file's `vocab`).
 * - `bpm` a tempo, `minutes`, `part` (1-3), `subdivision` (2-4), `from` /
 *   `to` bar numbers: digits. `root` a note name (`A`, `F#`, `Bb`), `chord` a
 *   chord as the app writes it (`Am7`, `G`), `theme` a theme's name, `view`
 *   `neck` / `runway` / `tab`, `jam` / `preset` the player's saved names,
 *   `goal` a goal in the player's words (the wordings file's `goals`).
 * - `metric` one thing a player may think is graded (`ASKABLE_METRICS`), in
 *   the wordings file's `vocab.metric` words (leg c3int).
 */
export const SLOTS = [
  "path",
  "followed",
  "step",
  "stepName",
  "exercise",
  "screen",
  "section",
  "scale",
  "position",
  "root",
  "chord",
  "bpm",
  "minutes",
  "part",
  "subdivision",
  "from",
  "to",
  "jam",
  "preset",
  "theme",
  "view",
  "goal",
  "metric",
] as const;
export type Slot = (typeof SLOTS)[number];

/** A slot's value: what is typed, and what the call carries (an enum id, a number, or the typed words). */
export type Filled = Partial<Record<Slot, { said: string; value: string | number }>>;

type Base = {
  id: string;
  /** What the player means, in plain English, for the people writing wordings. */
  meaning: string;
  /** Placeholders every wording of this intent must contain (each once). */
  slots: readonly Slot[];
};

export type CallIntent = Base & { kind: "call"; tool: string; args: (f: Filled) => ToolArgs };
export type YoursIntent = Base & { kind: "yours"; item: NeverItem };
export type NoneIntent = Base & { kind: "none" };
/** A card and the arguments its words carry (leg c3int: `premise`, `what`); none when absent. */
export type CardIntent = Base & { kind: "card"; card: string; args?: (f: Filled) => ToolArgs };
export type Intent = CallIntent | YoursIntent | NoneIntent | CardIntent;

const v = (f: Filled, s: Slot) => {
  const x = f[s];
  if (!x) throw new Error(`slot ${s} not filled`);
  return x.value;
};

const call = (id: string, tool: string, meaning: string, slots: readonly Slot[], args: (f: Filled) => ToolArgs): CallIntent => ({
  id,
  kind: "call",
  tool,
  meaning,
  slots,
  args,
});

/** Actions. Relative requests (`faster`) never carry a number: none is said. */
export const CALL_INTENTS: readonly CallIntent[] = [
  call("go_screen", "go_to", "Show one of the app's screens ({screen}).", ["screen"], (f) => ({ screen: v(f, "screen") })),
  call("open_path", "open_path", "Open a Path's page by its name ({path}).", ["path"], (f) => ({ path: v(f, "path") })),
  call("open_step_here", "open_step", "On a Path's page: open its Step number {step}.", ["step"], (f) => ({ step: v(f, "step") })),
  call("open_step_of_path", "open_step", "Open Step number {step} of the Path {path}.", ["path", "step"], (f) => ({ path: v(f, "path"), step: v(f, "step") })),
  call("open_step_name", "open_step", "Open the Step called {stepName}.", ["stepName"], (f) => ({ query: v(f, "stepName") })),
  call("open_settings", "open_settings", "Open the Settings at the section {section}.", ["section"], (f) => ({ section: v(f, "section") })),
  call("show_scale", "show_scale", "Draw the scale {root} {scale} on the neck.", ["root", "scale"], (f) => ({ root: v(f, "root"), scale: v(f, "scale") })),
  call("show_scale_at", "show_scale", "Draw the scale {root} {scale} at the neck position {position}.", ["root", "scale", "position"], (f) => ({
    root: v(f, "root"),
    scale: v(f, "scale"),
    position: v(f, "position"),
  })),
  call("show_chord", "show_chord", "Show how to grip the chord {chord}.", ["chord"], (f) => ({ chord: v(f, "chord") })),
  call("explain_screen", "explain_screen", "Ask what this screen is for / what it does.", [], () => ({})),
  call("start_today", "start_today", "Start today's practice Session.", [], () => ({})),
  call("start_today_at", "start_today", "Start today's Session at its part number {part}.", ["part"], (f) => ({ at: v(f, "part") })),
  call("play_exercise", "play_exercise", "Play the Exercise {exercise} now.", ["exercise"], (f) => ({ exercise: v(f, "exercise") })),
  call("play_exercise_bpm", "play_exercise", "Play the Exercise {exercise} at {bpm} bpm.", ["exercise", "bpm"], (f) => ({ exercise: v(f, "exercise"), bpm: v(f, "bpm") })),
  call("tempo_bpm", "set_tempo", "Set the tempo to {bpm} bpm.", ["bpm"], (f) => ({ bpm: v(f, "bpm") })),
  call("tempo_faster", "set_tempo", "Make the tempo a bit faster (NO number said).", [], () => ({ direction: "faster" })),
  call("tempo_slower", "set_tempo", "Make the tempo a bit slower (NO number said).", [], () => ({ direction: "slower" })),
  call("find_edge", "find_edge", "Find my edge (my top clean tempo) on the Exercise {exercise}.", ["exercise"], (f) => ({ exercise: v(f, "exercise") })),
  call("test_out_here", "test_out", "On a Path's page: test out of (skip by proving it) Step {step}.", ["step"], (f) => ({ step: v(f, "step") })),
  call("test_out_of_path", "test_out", "Test out of Step {step} of the Path {path}.", ["path", "step"], (f) => ({ path: v(f, "path"), step: v(f, "step") })),
  call("loop_bars", "loop_bars", "Loop bars {from} to {to} of the Exercise, slowly.", ["from", "to"], (f) => ({ from: v(f, "from"), to: v(f, "to") })),
  call("loop_bar", "loop_bars", "Loop just bar {from}.", ["from"], (f) => ({ from: v(f, "from") })),
  call("swap_harder", "swap_part", "Swap part {part} of today's plan for something harder.", ["part"], (f) => ({ at: v(f, "part"), choice: "harder" })),
  call("swap_different", "swap_part", "Swap part {part} of today's plan for something different.", ["part"], (f) => ({ at: v(f, "part"), choice: "different" })),
  call("swap_style", "swap_part", "Swap part {part} of today's plan for another style.", ["part"], (f) => ({ at: v(f, "part"), choice: "style" })),
  call("set_minutes", "set_minutes", "Make today's Session {minutes} minutes long.", ["minutes"], (f) => ({ minutes: v(f, "minutes") })),
  call("focus_path", "set_focus", "Plan today only from the followed Path {followed}.", ["followed"], (f) => ({ path: v(f, "followed") })),
  call("focus_mix", "set_focus", "Plan today from the daily mix again (all followed Paths).", [], () => ({})),
  call("follow_path", "follow_path", "Follow (add to my daily mix) the Path {path}.", ["path"], (f) => ({ path: v(f, "path") })),
  call("load_jam", "load_jam", "Load my saved jam {jam}.", ["jam"], (f) => ({ jam: v(f, "jam") })),
  call("load_preset", "load_preset", "Load my saved metronome preset {preset}.", ["preset"], (f) => ({ preset: v(f, "preset") })),
  call("click_subdivision", "click_subdivision", "Make the metronome click {subdivision} times per beat.", ["subdivision"], (f) => ({ subdivision: v(f, "subdivision") })),
  call("set_theme", "set_setting", "Switch the app's colour theme to {theme}.", ["theme"], (f) => ({ key: "theme", value: v(f, "theme") })),
  call("set_view", "set_setting", "Use the {view} view while practising (neck, runway or tab).", ["view"], (f) => ({ key: "practiceView", value: v(f, "view") })),
  call("count_in_on", "set_setting", "Turn the count-in (clicks before the Take starts) on.", [], () => ({ key: "countIn", value: "on" })),
  call("count_in_off", "set_setting", "Turn the count-in off.", [], () => ({ key: "countIn", value: "off" })),
  call("voice_on", "set_setting", "Turn the coach's spoken voice on.", [], () => ({ key: "coachVoice", value: "on" })),
  call("voice_off", "set_setting", "Turn the coach's spoken voice off.", [], () => ({ key: "coachVoice", value: "off" })),
  call("suggestions_on", "set_setting", "Turn the coach's suggestions (tips) on.", [], () => ({ key: "coachSuggestions", value: "on" })),
  call("suggestions_off", "set_setting", "Turn the coach's suggestions (tips) off.", [], () => ({ key: "coachSuggestions", value: "off" })),
  call("set_goal", "set_goal", "Set my goal to: {goal}.", ["goal"], (f) => ({ text: v(f, "goal") })),
];

const yours = (id: string, item: NeverItem, meaning: string, slots: readonly Slot[] = []): YoursIntent => ({ id, kind: "yours", item, meaning, slots });

/** The never-list: the coach may only say "that one is yours" (and show where). */
export const YOURS_INTENTS: readonly YoursIntent[] = [
  yours("yours_input", "input", "Do something to the microphone / input: mute it, turn it on, change it, make it listen."),
  yours("yours_devices", "devices", "Change the audio device, interface, speakers or headphones."),
  yours("yours_grading", "grading", "Turn grading on or off, or ask not to be graded / to be graded this time."),
  yours("yours_recording", "recording", "Record, start or stop recording, keep a recording."),
  yours("yours_deleting", "deleting", "Delete, erase or clear something: a Take, a recording, history, a jam."),
  yours("yours_unfollowing", "unfollowing", "Unfollow / leave / drop the Path {path}.", ["path"]),
  yours("yours_model", "model", "Download, change or switch the coach's AI model / brain."),
  yours("yours_grades", "grades", "Change or give a grade or score: 'mark that as passed', 'give me an A', 'reset my score'."),
];

const none = (id: string, meaning: string, slots: readonly Slot[] = []): NoneIntent => ({ id, kind: "none", meaning, slots });

/** Nothing to do: not a request the coach acts on. NOT questions about the player's own Takes (those are cards). */
export const NONE_INTENTS: readonly NoneIntent[] = [
  none("none_technique", "A general technique question ('how do I keep my wrist relaxed?'). Not about the player's own Takes or scores."),
  none("none_theory", "A music-theory question ('what's the difference between dorian and minor?')."),
  none("none_past", "A statement about the past, not a request ('I did {screen} yesterday', 'I practised an hour this morning').", ["screen"]),
  none("none_future", "Something for later, not now ('open the {screen} tomorrow', 'remind me tonight').", ["screen"]),
  none("none_negated", "A negated request ('don't open the {screen}', 'no, leave it').", ["screen"]),
  none("none_chat", "Chit-chat: thanks, greetings, jokes, 'you're cool', 'lol', 'ok'."),
  none("none_offtopic", "Off-topic: weather, football, food, homework, other apps."),
  none("none_tuning", "Anything about tuning the guitar ('tune my guitar', 'is my G string flat?'): the app does not talk about tuning."),
  none("none_unsupported", "A request the app has no tool for: buy strings, transpose a song, export data, call a teacher, write a song for me."),
  none("none_wish", "A wish or feeling, not a request ('I want to play faster one day', 'I'm tired of scales')."),
  // Leg c3int: the cards' near-miss. Nothing measures these and no card names them.
  none("none_unmeasured", "Was something good that the app does not measure: vibrato, a bend reaching its note, loudness / dynamics, slides."),
];

const card = (id: string, cardId: string, meaning: string, slots: readonly Slot[] = [], args?: (f: Filled) => ToolArgs): CardIntent => ({
  id,
  kind: "card",
  card: cardId,
  meaning,
  slots,
  ...(args ? { args } : {}),
});

/**
 * Questions a fact card answers (the seven card shapes on `coach-int1`).
 * Skipped by the generator until `EVAL_CARDS` lists the id: their wordings are
 * written now so that turning cards on adds no work but the card list.
 */
export const CARD_INTENTS: readonly CardIntent[] = [
  card("card_where_slipped", "where_slipped", "Where in my last Take did I slip / lose it?"),
  card("card_early_or_late", "early_or_late", "Was I early or late in that Take? (No direction assumed.)"),
  // Leg c3int: the premise is part of the answer (the held-out set scores it).
  card("card_rushing", "early_or_late", "Was I rushing / ahead / speeding up in that Take? (Assumes early.)", [], () => ({ premise: "early" })),
  card("card_dragging", "early_or_late", "Was I dragging / behind / slowing down in that Take? (Assumes late.)", [], () => ({ premise: "late" })),
  card("card_why_not_counted", "why_not_counted", "Why didn't that Take count / pass? (No single thing named.)"),
  card("card_metric_graded", "why_not_counted", "Is my {metric} graded / why wasn't my {metric} counted? (One thing named.)", ["metric"], (f) => ({ what: v(f, "metric") })),
  card("card_what_changed", "what_changed", "What changed between this Take and the one before?"),
  card("card_improving", "improving", "Am I getting better at this Exercise?"),
  card("card_score_made_of", "score_made_of", "What is my score / result made of?"),
  card("card_pass_mark_distance", "pass_mark_distance", "How far am I from the pass mark?"),
];

export const INTENTS: readonly Intent[] = [...CALL_INTENTS, ...YOURS_INTENTS, ...NONE_INTENTS, ...CARD_INTENTS];

export function intentById(id: string): Intent | undefined {
  return INTENTS.find((i) => i.id === id);
}

/** The placeholders in a wording, in order (`{bpm}` → `bpm`). */
export function slotsIn(template: string): string[] {
  return [...template.matchAll(/\{([a-zA-Z]+)\}/g)].map((m) => m[1]);
}
