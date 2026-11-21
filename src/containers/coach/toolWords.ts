/**
 * A tool's `Line` in the player's words (leg t1b1).
 *
 * The tools never write a sentence: a receipt, a proposal, a refusal and a
 * choice are a locale key and the values the app actually used. Here those
 * become words, and only in two ways: a value that is an id (a screen, a
 * Settings section, a scale, a setting's value) is replaced by its translated
 * name, and a key whose sentence depends on which values are there picks the
 * whole template written for that case (`followPathLevel`, `stepQuery`, …).
 * Nothing is glued together from pieces.
 */
import type { TFunction } from "i18next";
import { getLanguages } from "../../i18n";
import { THEMES } from "../../themes";
import type { Line } from "../../coach/tools/types";

/** The settings `set_setting` may change: their values need their own words. */
const SETTING_KEYS = new Set(["theme", "language", "practiceView", "bandVolume", "countIn", "coachVoice", "coachSuggestions"]);

/** What `stops` names, with a key per case so each language words it whole. */
const STOPS = new Set(["click", "band", "song"]);


/** A safe setting's value in words: on / off, "the app chooses", a percentage, a theme's or a language's name. */
export function settingValueText(t: TFunction, key: string, value: string | number): string {
  if (value === "on" || value === "off") return t(`coachTools.value.${value}`);
  if (value === "auto") return t("coachTools.value.auto");
  if (key === "bandVolume" && typeof value === "number") return t("coachTools.value.percent", { n: value });
  if (key === "theme") return THEMES.find((theme) => theme.id === value)?.name ?? String(value);
  if (key === "language") return getLanguages().find((lang) => lang.code === value)?.name ?? String(value);
  if (key === "practiceView") return t(`coachTools.value.view.${String(value)}`, { defaultValue: String(value) });
  return String(value);
}

/**
 * The proposals the runner makes of a navigating `go` tool while something
 * sounds (`run.ts` turns `coachTools.receipt.<x>` into `coachTools.propose.<x>`),
 * named here so the keys are known to be live.
 */
export const GO_PROPOSAL_KEYS = [
  "coachTools.propose.goTo",
  "coachTools.propose.openPath",
  "coachTools.propose.openStep",
  "coachTools.propose.openSettings",
  "coachTools.propose.returnTo",
] as const;

const NO_SWAP: Readonly<Record<string, string>> = {
  harder: "coachTools.why.notNow.noSwap.harder",
  harderWarmUp: "coachTools.why.notNow.noSwap.harderWarmUp",
  different: "coachTools.why.notNow.noSwap.different",
  style: "coachTools.why.notNow.noSwap.style",
};

const SOUNDING: Readonly<Record<string, string>> = {
  click: "coachTools.why.notNow.soundingClick",
  band: "coachTools.why.notNow.soundingBand",
  song: "coachTools.why.notNow.soundingSong",
};

/** The template for this line: the key itself, or the one written for the values it carries. */
export function lineKey(l: Line): string {
  const v = l.values;
  const faster = v.direction === "faster";
  const level = v.level !== undefined && v.level !== "";
  switch (l.key) {
    case "coachTools.receipt.followPath":
      return level ? "coachTools.receipt.followPathLevel" : l.key;
    case "coachTools.propose.followPath":
      return level ? "coachTools.propose.followPathLevel" : l.key;
    case "coachTools.why.notFound.step":
      return v.step === undefined ? "coachTools.why.notFound.stepQuery" : l.key;
    case "coachTools.why.notNow.tempoEnd":
      return faster ? "coachTools.why.notNow.tempoEndFaster" : "coachTools.why.notNow.tempoEndSlower";
    case "coachTools.propose.nudgeTempo":
      return faster ? "coachTools.propose.nudgeTempoFaster" : "coachTools.propose.nudgeTempoSlower";
    case "coachTools.why.notNow.noSwap":
      return NO_SWAP[String(v.none)] ?? NO_SWAP.different;
    case "coachTools.propose.findEdge":
      return v.bpm === "" || v.bpm === undefined ? "coachTools.propose.findEdgeNoBpm" : l.key;
    case "coachTools.why.notNow.sounding":
      return SOUNDING[String(v.stops)] ?? l.key;
    case "coachTools.propose.setGoal":
      return v.from !== undefined && v.from !== "" ? "coachTools.propose.setGoalFrom" : l.key;
    default:
      return l.key;
  }
}

/** The values with every id replaced by its name in the player's language. */
export function lineValues(t: TFunction, l: Line): Record<string, string | number> {
  const out: Record<string, string | number> = { ...l.values };
  if (typeof out.screen === "string") out.screen = t(`coachTools.screen.${out.screen}`, { defaultValue: out.screen });
  if (typeof out.section === "string") out.section = t(`coachTools.section.${out.section}`, { defaultValue: out.section });
  if (typeof out.scale === "string") out.scale = t(`scale.${out.scale}`, { defaultValue: out.scale });
  // Today's mix is a word, not a Path's title.
  for (const name of ["from", "to", "focus"] as const) {
    if (out[name] === "mix" && (l.key.endsWith("Focus") || l.key.endsWith("setFocus"))) out[name] = t("coachTools.value.mix");
  }
  // `make_exercise`'s receipt names what it added: the shape's own sentence from My exercises (leg t2c).
  if (l.key.startsWith("coachTools.receipt.makeExercise") && typeof l.values.shape === "string") {
    out.what = t(`session.myExercises.shape.${l.values.shape}`, {
      root: l.values.root ?? "",
      scale: out.scale ?? "",
      chord: l.values.chord ?? "",
      position: l.values.position ?? "",
      string: l.values.string ?? "",
    });
  }
  const key = out.key;
  if (typeof key === "string" && SETTING_KEYS.has(key)) {
    for (const name of ["from", "to", "value"] as const) {
      const value = out[name];
      if (value !== undefined) out[name] = settingValueText(t, key, value);
    }
    out.key = t(`coachTools.setting.${key}`);
  }
  return out;
}

/** The line, as the player reads it. */
export function lineText(t: TFunction, l: Line): string {
  return t(lineKey(l), lineValues(t, l));
}

/** What a proposal says stops, as its own sentence; null when it names nothing (or something unknown). */
export function stopsKey(l: Line): string | null {
  const stops = l.values.stops;
  return typeof stops === "string" && STOPS.has(stops) ? `coachTools.stops.${stops}` : null;
}
