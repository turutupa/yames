/**
 * The `confirm` tools of the tool screens (TOOLS 2.2): `load_jam`,
 * `load_preset`, `click_subdivision`. The same host doors the block buttons
 * use (`runBlockAction`), named here by the player's words: a jam or a preset
 * by its name, never an id from outside.
 *
 * Loading puts away what was loaded, through the app's own gate: an edited
 * jam, setlist or preset is asked about before it goes (`MainWindow.guarded`,
 * in the real host). So a load has no undo of its own.
 */

import type { NamedRef } from "../blocks/resolve";
import type { Subdivision } from "../../types";
import { MAX_QUERY, outsideSession, sessionOpen } from "./go";
import type { CoachToolHost } from "./host";
import { matchByTitle } from "./resolve";
import {
  argNumber,
  argString,
  defineConfirmTool,
  line,
  notWiredYet,
  refuse,
  type ConfirmTool,
  type ProposeResult,
  type Refusal,
} from "./types";

const gone = (detail: string): Refusal => refuse("refused", "coachTools.why.refused.proposal", {}, { detail });

type Loaded = { id: string; name: string };

/** A jam or a preset by its name. */
function byName(tool: string, arg: string, query: string, items: readonly NamedRef[]): ProposeResult<Loaded> | NamedRef {
  const found = matchByTitle(query, items, (item) => item.name);
  if ("none" in found) return refuse("notFound", `coachTools.why.notFound.${arg}`, { query });
  if ("several" in found) {
    return refuse("notFound", "coachTools.why.which", { query }, {
      choices: found.several.map((item) => ({ label: line(`coachTools.choice.${arg}`, { [arg]: item.name }), call: { tool, args: { [arg]: item.name } } })),
    });
  }
  return found.found;
}

const loadJam = defineConfirmTool<Loaded>({
  name: "load_jam",
  kind: "confirm",
  audience: "player",
  note: "Load one of the player's jams, by its name, and show it.",
  args: [{ name: "jam", type: { kind: "query", maxLength: MAX_QUERY }, note: "The jam, as the player named it." }],
  when: outsideSession,
  propose(args, host) {
    if (host.sessionActive()) return sessionOpen();
    const found = byName("load_jam", "jam", argString(args, "jam") ?? "", host.jams());
    if ("ok" in found) return found;
    // Showing the jam leaves the screen: a click playing elsewhere stops.
    const stops = host.view() !== "jam" ? host.sounding() : null;
    return {
      ok: true,
      line: line("coachTools.propose.loadJam", stops ? { jam: found.name, stops } : { jam: found.name }),
      resolved: { id: found.id, name: found.name },
    };
  },
  commit({ id, name }, host) {
    if (host.sessionActive()) return sessionOpen();
    if (!host.jams().some((jam) => jam.id === id)) return gone("the jam is not there any more");
    if (host.loadJam(id) === "notWiredYet") return notWiredYet("load_jam");
    return { ok: true, receipt: line("coachTools.receipt.loadJam", { jam: name }) };
  },
});

const loadPreset = defineConfirmTool<Loaded>({
  name: "load_preset",
  kind: "confirm",
  audience: "player",
  note: "Load one of the player's Metronome or Drill presets, by its name.",
  args: [{ name: "preset", type: { kind: "query", maxLength: MAX_QUERY }, note: "The preset, as the player named it." }],
  when: outsideSession,
  propose(args, host) {
    if (host.sessionActive()) return sessionOpen();
    const presets = host.presets();
    if (presets === "notWiredYet") return notWiredYet("load_preset");
    const found = byName("load_preset", "preset", argString(args, "preset") ?? "", presets);
    if ("ok" in found) return found;
    return { ok: true, line: line("coachTools.propose.loadPreset", { preset: found.name }), resolved: { id: found.id, name: found.name } };
  },
  commit({ id, name }, host) {
    if (host.sessionActive()) return sessionOpen();
    const presets = host.presets();
    if (presets === "notWiredYet") return notWiredYet("load_preset");
    if (!presets.some((preset) => preset.id === id)) return gone("the preset is not there any more");
    if (host.loadPreset(id) === "notWiredYet") return notWiredYet("load_preset");
    return { ok: true, receipt: line("coachTools.receipt.loadPreset", { preset: name }) };
  },
});

type Subdivide = { from: Subdivision; to: Subdivision };

function clickNow(host: CoachToolHost): Subdivision | "notWiredYet" {
  return host.clickSubdivision();
}

const clickSubdivision = defineConfirmTool<Subdivide>({
  name: "click_subdivision",
  kind: "confirm",
  audience: "player",
  note: "Set how many clicks the Metronome plays per beat (1 to 6).",
  args: [{ name: "subdivision", type: { kind: "integer", min: 1, max: 6 }, note: "Clicks per beat." }],
  when: outsideSession,
  propose(args, host) {
    if (host.sessionActive()) return sessionOpen();
    const from = clickNow(host);
    if (from === "notWiredYet") return notWiredYet("click_subdivision");
    const to = (argNumber(args, "subdivision") ?? from) as Subdivision;
    if (to === from) return refuse("notNow", "coachTools.why.notNow.alreadySubdivision", { subdivision: from });
    return { ok: true, line: line("coachTools.propose.clickSubdivision", { from, to }), resolved: { from, to } };
  },
  commit({ from, to }, host) {
    if (host.sessionActive()) return sessionOpen();
    if (clickNow(host) !== from) return gone("the subdivision changed");
    if (host.setClickSubdivision(to) === "notWiredYet") return notWiredYet("click_subdivision");
    return {
      ok: true,
      receipt: line("coachTools.receipt.clickSubdivision", { from, to }),
      undo: { tool: "click_subdivision", args: { subdivision: from } },
    };
  },
});

export const PLAY_TOOLS: readonly ConfirmTool[] = [loadJam, loadPreset, clickSubdivision];
