/**
 * "That one is yours" (DESIGN 13, TOOLS section 1, the owner's never-list).
 *
 * The coach never touches the microphone or the input, audio devices,
 * grading, recording, deleting, unfollowing, downloads or the model selector,
 * or a grade. Those are not tools at all (`host.ts` has no member that could
 * reach them). When the player asks for one, Ask says so in one line and
 * offers to SHOW where the control is: the "show me" is an ordinary `go`
 * tool call (`open_settings`, `go_to`) through the runner, so it can only
 * navigate, never perform the action. `point` is the element the app then
 * marks for a moment, when it has one.
 */
import type { ToolCall } from "../../coach/tools/types";
import { SETTINGS_SECTIONS, type SettingsSection } from "../../coach/tools/host";

export const NEVER_ITEMS = [
  "input",
  "devices",
  "grading",
  "recording",
  "deleting",
  "unfollowing",
  "model",
  "grades",
] as const;

export type NeverItem = (typeof NEVER_ITEMS)[number];

export type NeverEntry = {
  /** The one line ("That one is yours. …"). */
  line: string;
  /** The chip's words. */
  showLabel: string;
  /** Where "show me" goes: a navigating tool, nothing else. */
  show: ToolCall;
  /** The element marked once it is there (an `id`), or null. */
  point: string | null;
};

const settings = (section: SettingsSection): Pick<NeverEntry, "show" | "point"> => ({
  show: { tool: "open_settings", args: { section } },
  point: SETTINGS_SECTIONS[section],
});

export const NEVER_LIST: Readonly<Record<NeverItem, NeverEntry>> = {
  input: { line: "coachTools.yours.input", showLabel: "coachTools.yours.showSettings", ...settings("devices") },
  devices: { line: "coachTools.yours.devices", showLabel: "coachTools.yours.showSettings", ...settings("devices") },
  grading: { line: "coachTools.yours.grading", showLabel: "coachTools.yours.showSettings", ...settings("grading") },
  recording: { line: "coachTools.yours.recording", showLabel: "coachTools.yours.showSettings", ...settings("recording") },
  deleting: { line: "coachTools.yours.deleting", showLabel: "coachTools.yours.showSettings", ...settings("keepTakes") },
  unfollowing: { line: "coachTools.yours.unfollowing", showLabel: "coachTools.yours.showPaths", show: { tool: "go_to", args: { screen: "paths" } }, point: null },
  model: { line: "coachTools.yours.model", showLabel: "coachTools.yours.showSettings", ...settings("coach") },
  grades: { line: "coachTools.yours.grades", showLabel: "coachTools.yours.showProgress", show: { tool: "go_to", args: { screen: "progress" } }, point: null },
};

/** The tools a "show me" may name: they only move the view. */
export const SHOW_ME_TOOLS: ReadonlySet<string> = new Set(["open_settings", "go_to"]);
