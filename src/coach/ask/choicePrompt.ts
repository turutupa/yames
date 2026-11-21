/**
 * The prompt for a choice (DESIGN 5.3 engine 4a, 5.5 budgets; leg c3b1a).
 *
 * Two parts, as `coach::ask` takes them:
 *
 * - `choicePrefix(catalogue, cards)`: the static head, the tools and cards
 *   with a line each and the answer's format. **Byte-identical turn to turn**
 *   (nothing in it changes with the time, the screen or a counter), because
 *   the worker keeps it decoded (c3a's prefix cache). At most
 *   `CHOICE_PREFIX_TOKENS` by `estimateTokens`.
 * - `choiceContext(facts)`: where the player is, as plain lines. At most
 *   `CHOICE_CONTEXT_TOKENS` (Rust refuses a context over 450).
 *
 * Rust puts its own `ASK_SYSTEM_PROMPT` before the prefix; the question goes
 * as the player typed it.
 */
import { estimateTokens } from "../context";
import { SAFE_SETTING_KEYS, type SafeSettingKey } from "../tools/host";
import { MAX_CHOICES, normalizeWords, titleMatch, UNSPACED } from "../tools/resolve";
import type { ArgField, ToolCatalogue, ToolSpec } from "../tools/types";
import type { CommandTable } from "./commandTable";
import type { EvalCard } from "./evalCards";
import { ONE_OF } from "./grammar";

/**
 * DESIGN 5.5's 900 for the system text and the intent list, raised to 1100 by
 * leg c3bp: every enum value listed and the values per setting cost about 210
 * estimated tokens, and an example in their place is what the models answered
 * with. The prefix is decoded once and kept (c3a's prefix cache), so a turn
 * pays none of it; the budget still sums under half of the 4,096 window
 * (1100 + 450 + 150 + 48).
 */
export const CHOICE_PREFIX_TOKENS = 1100;
/** DESIGN 5.5, and `coach::ASK_CONTEXT_MAX_TOKENS`. */
export const CHOICE_CONTEXT_TOKENS = 450;

/**
 * An enum this short is listed where its argument is; a longer one is listed
 * once, under its own NAME after the tools, and the argument says `=NAME`
 * (leg c3bp: an enum shown by two examples and "…" was answered with the
 * examples, `naturalMinor` for a minor pentatonic). Every value, never some.
 */
const LIST_ENUM_UP_TO = 13;

/**
 * What `set_setting` takes for each key, as the player may say it (leg c3bp:
 * the models answered `language: japanese`). The runner matches the words
 * against what the control offers now (`safeSettingOptions`): these are the
 * values every build offers, by the id the runner reads. The grammar keeps
 * `value` free text, because the runner also takes a theme's or a
 * language's name ("Deutsch") and a partial one.
 */
export const SETTING_VALUES: Readonly<Record<SafeSettingKey, readonly string[]>> = {
  theme: ["mono", "obsidian", "velvet", "neon", "aurora", "ash", "ember", "ivory", "arctic", "sand", "lavender", "prism", "manuscript"],
  language: ["en", "es", "de", "fr", "it", "pt-BR", "nl", "pl", "tr", "ru", "vi", "ja", "ko", "zh-CN", "zh-TW"],
  practiceView: ["neck", "runway", "tab"],
  bandVolume: ["0..150", "auto"],
  countIn: ["on", "off"],
  coachVoice: ["on", "off"],
  coachSuggestions: ["on", "off"],
};

/** A long enum's NAME: its argument's, in capitals. */
const listName = (f: ArgField) => f.name.toUpperCase();

/**
 * One argument, as short as it can be read: `name` (the player's words),
 * `name#` (a number), `name=a|b` (a closed set, every value), `name=NAME` (a
 * long one, listed once below the tools). `?` marks an optional one.
 */
function argText(f: ArgField): string {
  const name = `${f.name}${f.optional ? "?" : ""}`;
  switch (f.type.kind) {
    case "enum":
      return f.type.values.length <= LIST_ENUM_UP_TO ? `${name}=${f.type.values.join("|")}` : `${name}=${listName(f)}`;
    case "integer":
      return `${name}#`;
    case "query":
    case "appId":
      return name;
    case "chordName":
      // Too many to list (every root by every suffix), and an example is what gets answered: the form only.
      return `${name}=ROOT+suffix`;
  }
}

/**
 * An undo's guard (`at` on set_tempo, set_setting, click_subdivision): the
 * app's own undo writes it, never the player. Not shown to the model (leg
 * c3bp, revision 2: shown, it was filled with the number the player asked
 * for, `{"direction":"faster","at":110}` for "up to 110"). The grammar keeps
 * it, as the runner takes it.
 */
export const isUndoGuard = (f: ArgField) => f.optional === true && f.note.includes("undo's guard");

/** A tool's arguments; a ONE_OF group as `a or b` (the grammar takes exactly one of them). */
function argsText(tool: ToolSpec): string {
  const groups = ONE_OF[tool.name] ?? [];
  const out: string[] = [];
  const done = new Set<string>();
  for (const f of tool.args) {
    if (done.has(f.name) || isUndoGuard(f)) continue;
    const group = groups.find((g) => g.includes(f.name));
    if (!group) {
      out.push(argText(f));
      continue;
    }
    const members = tool.args.filter((x) => group.includes(x.name));
    for (const m of members) done.add(m.name);
    out.push(members.map((m) => argText({ name: m.name, type: m.type, note: m.note })).join(" or "));
  }
  return out.join(", ");
}

/** A tool's note, to its first full stop or colon: the line the model reads. */
function shortNote(note: string): string {
  const cut = note.search(/[.:;(]/);
  return (cut > 0 ? note.slice(0, cut) : note).trim();
}

/**
 * The static head. A pure function of the catalogue and the cards.
 *
 * `notes: false` is the eval's "plain prompt" arm (leg c3b2m, TOOLS 3.5 way
 * (b)): each tool and card by its name and arguments only, without its line.
 * The app always sends the default.
 */
export function choicePrefix(
  catalogue: ToolCatalogue,
  cards: readonly EvalCard[],
  opts: { notes?: boolean; settingValues?: Readonly<Record<SafeSettingKey, readonly string[]>> } = {},
): string {
  const notes = opts.notes !== false;
  const settingValues = opts.settingValues ?? SETTING_VALUES;
  const lines: string[] = [
    "Reply with one JSON object for the player's message:",
    '{"tool":NAME,"args":{...}} to do one tool below (names in the player\'s words, numbers as digits; an optional arg? only if the player said it)',
    ...(cards.length > 0 ? ['{"card":ID} when a card below answers it'] : []),
    '{"answer":"which"} if it could mean two different things, as when "Paths these words name" lists two or more',
    '{"answer":"yours"} for recording, deleting, grading, grades, microphone, devices, the model, unfollowing: the player\'s own',
    '{"answer":"none"} for anything else, and for a tool that is not in "Tools here"',
    "",
    "Tools:",
  ];
  const lists = new Map<string, readonly string[]>();
  for (const tool of catalogue.tools) {
    if (tool.audience !== "player") continue;
    for (const f of tool.args) {
      if (f.type.kind !== "enum" || f.type.values.length <= LIST_ENUM_UP_TO) continue;
      const known = lists.get(listName(f));
      if (known && known.join("|") !== f.type.values.join("|")) throw new Error(`choicePrefix: two lists named ${listName(f)}`);
      lists.set(listName(f), f.type.values);
    }
    // set_setting: the keys with the values each takes, rather than the keys alone.
    const keyed = tool.name === "set_setting" && tool.args.some((f) => f.name === "key" && f.type.kind === "enum");
    const args = keyed
      ? tool.args
          .filter((f) => !isUndoGuard(f))
          .map((f) => `${f.name}${f.optional ? "?" : ""}`)
          .join(", ")
      : argsText(tool);
    const signature = `${tool.name}(${args})`;
    lines.push(notes ? `${signature}: ${shortNote(tool.note)}` : signature);
    if (keyed) lines.push(`  key=value: ${SAFE_SETTING_KEYS.map((k) => `${k}=${settingValues[k].join("|")}`).join("; ")}`);
  }
  for (const [name, values] of lists) lines.push(`${name}=${values.join("|")}`);
  if (cards.length > 0) {
    lines.push("", "Cards:");
    for (const card of cards) lines.push(notes ? `${card.id}: ${card.note}` : card.id);
  }
  return lines.join("\n");
}

/** What the context says: plain facts, already in the player's language where they are titles. */
export type ChoiceFacts = {
  screen: string;
  /** "none", or the Session's phase. */
  session: string;
  path?: string;
  step?: { order: number; title: string };
  exercise?: string;
  grading: string;
  tempo?: number;
  minutes?: number;
  /** Today's parts, in order. */
  parts?: readonly string[];
  followed?: readonly string[];
  jams?: readonly string[];
  presets?: readonly string[];
  /** The tools that can run here. */
  possible: readonly string[];
  /** The Paths the player's words could name (`namedTitles`): what lets the model ask "which one?". */
  named?: readonly string[];
};

/** A word shorter than this (in a script with spaces) names no title: "the", "and", "key" sit in too many sentences. */
const NAMING_WORD_MIN = 4;

/**
 * The words the typed-command router reads as the command rather than as a
 * name: verbs, connectors, units, ordinals, swap choices, on / off, and the
 * polite, filler, question and not-a-command words. "swap the first one"
 * names no Path called "First …". Nouns, screens and scales stay: "chords"
 * may well be a title's word.
 */
export function commandWords(table: CommandTable): string[] {
  const groups: Array<Readonly<Record<string, readonly string[] | undefined>>> = [table.verbs, table.connectors, table.units, table.swapChoices, table.onOff];
  const phrases: string[] = [...table.polite, ...table.fillers, ...table.questions, ...table.notCommand, ...Object.keys(table.ordinals)];
  for (const group of groups) for (const words of Object.values(group)) if (words) phrases.push(...words);
  const out = new Set<string>();
  for (const phrase of phrases) for (const word of normalizeWords(phrase).split(" ")) if (word) out.add(word);
  return [...out];
}

/**
 * The titles the player's words could name, by the typed-command router's own
 * matcher (`titleMatch`, leg c3bp): each word of four letters or more, or
 * each two-character run in a script without spaces, against every title;
 * the language's `commandWords` (its command table, when given) never name.
 * The titles fitting the most of those words, at most `MAX_CHOICES`, in the
 * order given; none when nothing fits. "open picking" names Alternate Picking
 * and Sweep Picking; "open alternate picking" only the first.
 */
export function namedTitles(question: string, titles: readonly string[], table: CommandTable | null = null): string[] {
  const command = table ? commandWords(table) : [];
  const spacedCommand = new Set(command);
  const probes = new Set<string>();
  for (const word of normalizeWords(question).split(" ")) {
    if (word.length === 0 || /^\p{N}+$/u.test(word)) continue;
    if (UNSPACED.test(word)) {
      const chars = Array.from(word);
      for (let i = 0; i + 2 <= chars.length; i++) {
        const pair = chars.slice(i, i + 2).join("");
        if (!command.some((w) => w.includes(pair))) probes.add(pair);
      }
    } else if (Array.from(word).length >= NAMING_WORD_MIN && !spacedCommand.has(word)) probes.add(word);
  }
  if (probes.size === 0) return [];
  const hits = titles.map((title) => [...probes].filter((p) => titleMatch(p, title) > 0).length);
  const best = Math.max(0, ...hits);
  if (best === 0) return [];
  return titles.filter((_, i) => hits[i] === best).slice(0, MAX_CHOICES);
}

/** The context lines, longest last so a cut loses the least: a line that does not fit is left out. */
export function choiceContext(facts: ChoiceFacts): string {
  const lines: string[] = [`Screen: ${facts.screen}`, `Session: ${facts.session}`];
  if (facts.path) lines.push(`Path: ${facts.path}`);
  if (facts.step) lines.push(`Step ${facts.step.order}: ${facts.step.title}`);
  if (facts.exercise) lines.push(`Exercise: ${facts.exercise}`);
  lines.push(`Grading: ${facts.grading}`);
  if (facts.tempo !== undefined) lines.push(`Tempo: ${facts.tempo} bpm`);
  if (facts.minutes !== undefined) lines.push(`Today: ${facts.minutes} minutes`);
  lines.push(`Tools here: ${facts.possible.join(", ") || "none"}`);
  if (facts.named && facts.named.length > 0) lines.push(`Paths these words name: ${facts.named.join("; ")}`);
  const lists: Array<[string, readonly string[] | undefined]> = [
    ["Today's parts", facts.parts],
    ["Followed Paths", facts.followed],
    ["Jams", facts.jams],
    ["Presets", facts.presets],
  ];
  for (const [name, list] of lists) {
    if (list && list.length > 0) lines.push(`${name}: ${list.map((x, i) => (name === "Today's parts" ? `${i + 1}. ${x}` : x)).join("; ")}`);
  }
  const kept: string[] = [];
  for (const l of lines) {
    const next = [...kept, l].join("\n");
    if (estimateTokens(next) > CHOICE_CONTEXT_TOKENS) break;
    kept.push(l);
  }
  return kept.join("\n");
}
