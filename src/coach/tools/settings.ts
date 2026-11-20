/**
 * `set_setting` and `set_goal` (TOOLS 2.2).
 *
 * `set_setting` reaches the short safe list of TOOLS section 1 and nothing
 * else (`SAFE_SETTING_KEYS`): theme, language, the practice view (neck /
 * runway / tab), band volume, count-in, coach voice on or off, coach
 * suggestions. The model selector, the microphone and input, audio devices,
 * grading, recording, downloads and anything that deletes are not keys, so no
 * call can name them. The value is the player's words, matched against the
 * values the app's own control offers now (`host.safeSettingOptions`): Voice
 * "on" with no voice installed is not one of them.
 *
 * Every change says "{key}: {from} → {to}" before the press and returns the
 * call that puts the old value back.
 */

import { SAFE_SETTING_KEYS, type CoachToolHost, type SafeSettingKey, type SafeSettingOption, type SafeSettingValue } from "./host";
import { MAX_CHOICES, normalizeWords, titleMatch } from "./resolve";
import {
  argString,
  defineConfirmTool,
  line,
  notWiredYet,
  refuse,
  takeRunning,
  type ConfirmTool,
  type ProposeResult,
  type Refusal,
} from "./types";

const gone = (detail: string): Refusal => refuse("refused", "coachTools.why.refused.proposal", {}, { detail });

/** The screens whose transport has a count-in switch (`countIn.ts`): elsewhere it has nothing to count into. */
const COUNT_IN_SCREENS = new Set(["beat", "drill", "jam", "setlist", "songs"]);

/** Band volume, as the player says it: a percentage, 0 to 150 (`readBandVolume` clamps 0 to 1.5). */
const BAND_PERCENT_MAX = 150;
const BAND_PERCENT_STEP = 5;

/** A value as the proposal and the undo say it: on / off, a percentage, or the value's id. */
export function settingWords(key: SafeSettingKey, value: SafeSettingValue): string | number {
  if (typeof value === "boolean") return value ? "on" : "off";
  if (key === "bandVolume" && typeof value === "number") return Math.round(value * 100);
  return value;
}

type Resolved = { key: SafeSettingKey; from: SafeSettingValue; to: SafeSettingValue };

/** The value the player's words name, among what the setting may be now. */
function resolveValue(key: SafeSettingKey, words: string, host: CoachToolHost): { value: SafeSettingValue } | Refusal {
  if (key === "bandVolume") {
    const match = /^(\d{1,3})\s*%?$/.exec(words.trim());
    if (!match) return refuse("notFound", "coachTools.why.notFound.settingValue", { key, query: words });
    const percent = Math.min(BAND_PERCENT_MAX, Math.round(Number(match[1]) / BAND_PERCENT_STEP) * BAND_PERCENT_STEP);
    return { value: percent / 100 };
  }
  const options = host.safeSettingOptions(key);
  if (options === "notWiredYet") return notWiredYet("set_setting");
  const exact = options.filter((o) => o.names.some((name) => normalizeWords(name) === normalizeWords(words)));
  const partial = exact.length > 0 ? exact : options.filter((o) => o.names.some((name) => titleMatch(words, name) > 0));
  if (partial.length === 1) return { value: partial[0].value };
  const offer = (list: readonly SafeSettingOption[]) =>
    list.slice(0, MAX_CHOICES).map((o) => ({
      label: line("coachTools.choice.setting", { key, value: settingWords(key, o.value) }),
      call: { tool: "set_setting", args: { key, value: String(settingWords(key, o.value)) } },
    }));
  if (partial.length > 1) return refuse("notFound", "coachTools.why.which", { query: words }, { choices: offer(partial) });
  // Not something the control offers now: what it does offer, as choices.
  return refuse("notFound", "coachTools.why.notFound.settingValue", { key, query: words }, { choices: offer(options) });
}

const setSetting = defineConfirmTool<Resolved>({
  name: "set_setting",
  kind: "confirm",
  audience: "player",
  note: "Change one setting from a short safe list: theme, language, practice view, band volume, count-in, coach voice, coach suggestions.",
  args: [
    { name: "key", type: { kind: "enum", values: SAFE_SETTING_KEYS }, note: "Which setting." },
    { name: "value", type: { kind: "query", maxLength: 40 }, note: "The new value, in the player's words (a theme's or a language's name, on / off, a percentage)." },
  ],
  when: (ctx) => !takeRunning(ctx),
  propose(args, host, ctx): ProposeResult<Resolved> {
    const key = argString(args, "key") as SafeSettingKey;
    if (key === "countIn" && !(COUNT_IN_SCREENS.has(ctx.screen) && COUNT_IN_SCREENS.has(host.view()))) {
      return refuse("notNow", "coachTools.why.notNow.here", { tool: "set_setting", key });
    }
    const from = host.safeSetting(key);
    if (from === "notWiredYet") return notWiredYet("set_setting");
    const found = resolveValue(key, argString(args, "value") ?? "", host);
    if ("ok" in found) return found;
    const to = found.value;
    if (to === from) return refuse("notNow", "coachTools.why.notNow.alreadySetting", { key, value: settingWords(key, from) });
    return {
      ok: true,
      line: line("coachTools.propose.setSetting", { key, from: settingWords(key, from), to: settingWords(key, to) }),
      resolved: { key, from, to },
    };
  },
  commit({ key, from, to }, host) {
    if (host.safeSetting(key) !== from) return gone("the setting changed");
    if (host.setSafeSetting(key, to) === "notWiredYet") return notWiredYet("set_setting");
    return {
      ok: true,
      receipt: line("coachTools.receipt.setSetting", { key, from: settingWords(key, from), to: settingWords(key, to) }),
      undo: { tool: "set_setting", args: { key, value: String(settingWords(key, from)) } },
    };
  },
});

/** The longest goal: a sentence, not an essay (the Notebook's goal, DESIGN 9.5). */
export const MAX_GOAL = 200;

type Goal = { from: string | null; to: string };

const setGoal = defineConfirmTool<Goal>({
  name: "set_goal",
  kind: "confirm",
  audience: "player",
  note: "Set the player's goal in the Notebook, in their own words.",
  args: [{ name: "text", type: { kind: "query", maxLength: MAX_GOAL }, note: "The goal, as the player says it." }],
  when: (ctx) => !takeRunning(ctx),
  propose(args, host) {
    const from = host.goal();
    if (from === "notWiredYet") return notWiredYet("set_goal");
    const to = argString(args, "text") ?? "";
    if (to === from) return refuse("notNow", "coachTools.why.notNow.alreadyGoal", { text: to });
    return { ok: true, line: line("coachTools.propose.setGoal", from ? { from, to } : { to }), resolved: { from, to } };
  },
  commit({ from, to }, host) {
    const now = host.goal();
    if (now === "notWiredYet") return notWiredYet("set_goal");
    if (now !== from) return gone("the goal changed");
    if (host.setGoal(to) === "notWiredYet") return notWiredYet("set_goal");
    const receipt = line("coachTools.receipt.setGoal", { to });
    // No goal before: putting "none" back would be clearing it, which is the player's.
    return from ? { ok: true, receipt, undo: { tool: "set_goal", args: { text: from } } } : { ok: true, receipt };
  },
});

export const SETTINGS_TOOLS: readonly ConfirmTool[] = [setSetting, setGoal];
