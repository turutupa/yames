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
import type { MainView } from "../../containers/main-window/MainHeader";
import type { Subdivision } from "../../types";
import { MAX_QUERY, outsideSession, sessionOpen } from "./go";
import type { CoachToolHost, LoadOutcome, Sounding } from "./host";
import { matchByTitle } from "./resolve";
import {
  argNumber,
  argString,
  defineConfirmTool,
  line,
  notWiredYet,
  refuse,
  type ConfirmTool,
  type Line,
  type ProposeResult,
  type Refusal,
  type ToolResult,
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
    // Whatever plays stops: elsewhere the view switch stops the click, on the jam tab the band
    // playing is put away (review finding 9).
    const stops = host.sounding();
    return {
      ok: true,
      line: line("coachTools.propose.loadJam", stops ? { jam: found.name, stops } : { jam: found.name }),
      resolved: { id: found.id, name: found.name },
    };
  },
  commit({ id, name }, host) {
    if (host.sessionActive()) return sessionOpen();
    if (!host.jams().some((jam) => jam.id === id)) return gone("the jam is not there any more");
    return loaded("load_jam", host.loadJam(id), line("coachTools.receipt.loadJam", { jam: name }), { jam: name });
  },
});

/**
 * The receipt from what happened (review finding 9): loaded, or the app's
 * unsaved-work question opened instead and the load waits on the answer,
 * which may be Cancel. Then nothing says "Loaded": `coachTools.receipt.loadAsked`
 * (the UI leg words it), and no undo either way.
 */
function loaded(tool: string, outcome: LoadOutcome, receipt: Line, values: Record<string, string>): ToolResult {
  if (outcome === "notWiredYet") return notWiredYet(tool);
  if (outcome === "asked") return { ok: true, receipt: line("coachTools.receipt.loadAsked", values) };
  return { ok: true, receipt };
}

/**
 * What loading a preset stops: a band or a setlist playing is put away
 * (`handleLoadPreset` closes the jam and the setlist), and the click when the
 * preset opens another screen than the one playing.
 */
function presetStops(host: CoachToolHost, view: MainView | undefined): Sounding | null {
  const playing = host.sounding();
  if (playing === null) return null;
  // The band: `handleLoadPreset` closes the jam, so it stops for certain.
  if (playing === "band") return playing;
  // The click or a song stops only if the preset opens another screen, and only
  // the preset's own screen says so: a preset that names none says nothing (leg t1b1).
  return view ? host.sounding(view) : null;
}

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
    const preset = presets.find((p) => p.id === found.id);
    const stops = presetStops(host, preset?.view);
    return {
      ok: true,
      line: line("coachTools.propose.loadPreset", stops ? { preset: found.name, stops } : { preset: found.name }),
      resolved: { id: found.id, name: found.name },
    };
  },
  commit({ id, name }, host) {
    if (host.sessionActive()) return sessionOpen();
    // Re-read at the press: a preset deleted since the proposal is not loaded.
    const presets = host.presets();
    if (presets === "notWiredYet") return notWiredYet("load_preset");
    if (!presets.some((preset) => preset.id === id)) return gone("the preset is not there any more");
    // The app re-reads the store before it applies the preset: the receipt waits for that
    // (review t1a2b, B). Until then it says the app is loading it; then "Loaded", or gone.
    let settle: (ok: boolean | "failed") => void = () => {};
    const later = new Promise<Line>((resolve) => {
      settle = (ok) =>
        resolve(
          line(ok === "failed" ? "coachTools.receipt.presetFailed" : ok ? "coachTools.receipt.loadPreset" : "coachTools.receipt.presetGone", {
            preset: name,
          }),
        );
    });
    const outcome = host.loadPreset(id, (ok) => settle(ok));
    if (outcome !== "done") return loaded("load_preset", outcome, line("coachTools.receipt.loadPreset", { preset: name }), { preset: name });
    return { ok: true, receipt: line("coachTools.receipt.loadingPreset", { preset: name }), later };
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
  args: [
    { name: "subdivision", type: { kind: "integer", min: 1, max: 6 }, note: "Clicks per beat." },
    {
      name: "at",
      type: { kind: "integer", min: 1, max: 6 },
      optional: true,
      note: "Only if the subdivision is this now (an undo's guard: it puts back what the tool changed, nothing since).",
    },
  ],
  when: outsideSession,
  propose(args, host) {
    if (host.sessionActive()) return sessionOpen();
    const from = clickNow(host);
    if (from === "notWiredYet") return notWiredYet("click_subdivision");
    // The undo's guard (leg chip1): changed again since, by anyone, it is not this undo's to put back.
    const guard = argNumber(args, "at");
    if (guard !== undefined && from !== guard) return gone("the subdivision moved since");
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
      undo: { tool: "click_subdivision", args: { subdivision: from, at: to } },
    };
  },
});

export const PLAY_TOOLS: readonly ConfirmTool[] = [loadJam, loadPreset, clickSubdivision];
