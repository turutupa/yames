/**
 * The words a language supplies for typed commands (TOOLS 2.1, the "typed
 * command" row; DESIGN 5.3, engine 1). Leg t1b2a.
 *
 * A table is plain data, one JSON file per language in `./commands/`
 * (`en.json` first; leg t1b2b adds the other fourteen beside it). The router
 * (`router.ts`) reads nothing else, so a language is added by adding a file,
 * never by changing code. The files live here and not in `src/locales/`:
 * i18next's loader globs every JSON file there as a namespace, and both
 * locale tests (`i18n.locales.test.ts`: every language carries every
 * namespace; `i18n.coverage.test.ts`: every English key has a call site)
 * would read these words as strings the app shows, which they are not.
 *
 * Every phrase is written in lower case, the way a player types it. Longer
 * phrases win over shorter ones wherever two could match ("find my edge on"
 * over "find my edge"). `validateCommandTable` is what a test runs over each
 * file: no empty list, no phrase under two verbs, no never-list phrase that
 * is also a verb, and every id one the app knows.
 */
import { NECK_POSITIONS, SCALE_NAMES } from "../blocks/spec";
import { SAFE_SETTING_KEYS, SETTINGS_SECTIONS } from "../tools/host";
import { GO_TO_SCREENS } from "../tools/go";
import { NEVER_ITEMS, type NeverItem } from "../../containers/coach/neverList";

/**
 * The verbs. The first six are TOOLS 2.1's (open / go, start / play, slower,
 * faster, loop, show); the rest reach the tools those six do not.
 */
export const VERB_IDS = [
  "open",
  "start",
  "slower",
  "faster",
  "loop",
  "show",
  "follow",
  "load",
  "set",
  "focus",
  "swap",
  "findEdge",
  "testOut",
  "explain",
  "make",
] as const;
export type VerbId = (typeof VERB_IDS)[number];

export const UNIT_IDS = ["bpm", "minutes", "bar", "step", "part", "clicks"] as const;
export type UnitId = (typeof UNIT_IDS)[number];

export const NOUN_IDS = ["tempo", "path", "jam", "preset", "chord", "scale", "exercise", "goal", "session", "mix", "screen"] as const;
export type NounId = (typeof NOUN_IDS)[number];

export const CONNECTOR_IDS = ["to", "at", "of", "for"] as const;
export type ConnectorId = (typeof CONNECTOR_IDS)[number];

export const SWAP_CHOICE_IDS = ["harder", "different", "style"] as const;

type Words = readonly string[];
type WordsOf<K extends string> = Readonly<Record<K, Words>>;

export type CommandTable = {
  /** The locale code (`en`, `zh-CN`, …), as the file is named. */
  language: string;
  /**
   * Written without spaces between words (ja, zh-CN, zh-TW, ko): the router
   * then finds the verb anywhere in the text, and matches every phrase by
   * the characters it contains rather than by whole words.
   */
  noSpaces: boolean;
  verbs: WordsOf<VerbId>;
  /** `go_to`'s screens. */
  screens: WordsOf<(typeof GO_TO_SCREENS)[number]>;
  /**
   * Settings' sections `open_settings` may name. The four the never-list
   * covers (devices, grading, recording) are left out on purpose: asking for
   * them is answered by "that one is yours", whose "show me" opens them.
   */
  sections: Partial<WordsOf<keyof typeof SETTINGS_SECTIONS>>;
  /** The safe settings (`set_setting`'s keys). */
  settingKeys: WordsOf<(typeof SAFE_SETTING_KEYS)[number]>;
  onOff: WordsOf<"on" | "off">;
  units: WordsOf<UnitId>;
  nouns: WordsOf<NounId>;
  connectors: WordsOf<ConnectorId>;
  swapChoices: WordsOf<(typeof SWAP_CHOICE_IDS)[number]>;
  /** "the first bar". */
  ordinals: Readonly<Record<string, number>>;
  /** The words after a root letter: "c sharp", "b flat". */
  roots: WordsOf<"sharp" | "flat">;
  /** Scale ids (`SCALE_NAMES`) to the words a player types for them. */
  scales: Partial<WordsOf<string>>;
  /** Neck positions (`NECK_POSITIONS`). */
  positions: Partial<WordsOf<string>>;
  /** The never-list: these words are answered "that one is yours", never with a call. */
  never: WordsOf<NeverItem>;
  /** A text that starts with one of these (contains one, without spaces) is a question, not a command. */
  questions: Words;
  /** A text that contains one of these is about something, not a command ("I", "it", "later", "not"). */
  notCommand: Words;
  /** Taken off either end before anything else ("please", "now"). */
  polite: Words;
  /** Words a command may carry that mean nothing to it ("me", "the", "a bit"). */
  fillers: Words;
};

function lists(table: CommandTable): Array<[string, Words]> {
  const out: Array<[string, Words]> = [];
  const groups = ["verbs", "screens", "sections", "settingKeys", "onOff", "units", "nouns", "connectors", "swapChoices", "roots", "scales", "positions", "never"] as const;
  for (const group of groups) {
    for (const [id, words] of Object.entries(table[group] as Record<string, Words | undefined>)) {
      if (words) out.push([`${group}.${id}`, words]);
    }
  }
  out.push(["questions", table.questions], ["notCommand", table.notCommand], ["polite", table.polite], ["fillers", table.fillers]);
  return out;
}

/** The words of a phrase, as the router compares them (lower case, single spaces). */
export function phraseKey(phrase: string): string {
  return phrase.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * What is wrong with a table, as sentences for a test's failure message.
 * Empty: the table is good.
 */
export function validateCommandTable(table: CommandTable): string[] {
  const problems: string[] = [];
  if (!table.language) problems.push("no language");
  if (typeof table.noSpaces !== "boolean") problems.push("noSpaces is not a boolean");

  const known: Record<string, readonly string[]> = {
    verbs: VERB_IDS,
    screens: GO_TO_SCREENS,
    sections: Object.keys(SETTINGS_SECTIONS),
    settingKeys: SAFE_SETTING_KEYS,
    onOff: ["on", "off"],
    units: UNIT_IDS,
    nouns: NOUN_IDS,
    connectors: CONNECTOR_IDS,
    swapChoices: SWAP_CHOICE_IDS,
    roots: ["sharp", "flat"],
    scales: SCALE_NAMES,
    positions: NECK_POSITIONS,
    never: NEVER_ITEMS,
  };
  const required = new Set(["verbs", "screens", "settingKeys", "onOff", "units", "nouns", "connectors", "swapChoices", "roots", "never"]);
  for (const [group, ids] of Object.entries(known)) {
    const have = (table as unknown as Record<string, Record<string, unknown> | undefined>)[group];
    if (!have || typeof have !== "object") {
      problems.push(`${group} is missing`);
      continue;
    }
    for (const id of Object.keys(have)) if (!ids.includes(id)) problems.push(`${group}.${id} is not an id the app knows`);
    if (required.has(group)) for (const id of ids) if (!(id in have)) problems.push(`${group}.${id} is missing`);
  }

  for (const [where, words] of lists(table)) {
    if (!Array.isArray(words) || words.length === 0) {
      problems.push(`${where} is an empty list`);
      continue;
    }
    for (const word of words) {
      if (typeof word !== "string" || phraseKey(word) === "") problems.push(`${where} has an empty word`);
      else if (word !== phraseKey(word)) problems.push(`${where}: "${word}" is not written in lower case with single spaces`);
    }
  }

  // No phrase under two verbs.
  const verbOf = new Map<string, string>();
  for (const id of VERB_IDS) {
    for (const word of table.verbs[id] ?? []) {
      const key = phraseKey(word);
      const other = verbOf.get(key);
      if (other && other !== id) problems.push(`"${word}" is a word of two verbs: ${other} and ${id}`);
      verbOf.set(key, id);
    }
  }
  // No never-list phrase that is also a verb (it would be both refused and run).
  for (const [item, words] of Object.entries(table.never)) {
    for (const word of words) {
      if (verbOf.has(phraseKey(word))) problems.push(`never.${item}: "${word}" is also a verb (${verbOf.get(phraseKey(word))})`);
    }
  }
  // No phrase named by two ids inside one group: the router could not tell them apart.
  for (const group of ["screens", "sections", "settingKeys", "onOff", "units", "scales", "positions", "never", "swapChoices"] as const) {
    const seen = new Map<string, string>();
    for (const [id, words] of Object.entries(table[group] as Record<string, Words | undefined>)) {
      for (const word of words ?? []) {
        const other = seen.get(phraseKey(word));
        if (other && other !== id) problems.push(`${group}: "${word}" names both ${other} and ${id}`);
        seen.set(phraseKey(word), id);
      }
    }
  }
  for (const [word, n] of Object.entries(table.ordinals ?? {})) {
    if (!Number.isInteger(n) || n < 1) problems.push(`ordinals.${word} is not a whole number from 1`);
  }
  return problems;
}

// ---------------------------------------------------------------------------
// The tables
// ---------------------------------------------------------------------------

const FILES = import.meta.glob<CommandTable>("./commands/*.json", { eager: true, import: "default" });

/** Every table there is, by language code (the file's name). */
export const COMMAND_TABLES: Readonly<Record<string, CommandTable>> = Object.fromEntries(
  Object.entries(FILES).map(([file, table]) => [file.replace(/^.*\/([^/]+)\.json$/, "$1"), table]),
);

/**
 * The table for a language: an exact code, then its base (`pt-BR` → `pt`),
 * else null. There is no English fallback on purpose: an English command
 * table under a Spanish player would turn English words in their sentences
 * into actions they did not ask for.
 */
export function commandTableFor(language: string): CommandTable | null {
  return COMMAND_TABLES[language] ?? COMMAND_TABLES[language.split("-")[0]] ?? null;
}
