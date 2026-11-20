/**
 * The coach's tools, hosted: the one `CoachToolHost` (`src/coach/tools/host.ts`),
 * built in `MainWindow` by one call (leg t1a1).
 *
 * Built ONCE, on the first render, and never again: every member reads the
 * latest values through a ref, so the object (and anything holding it) is the
 * same across the window's re-render on every beat. `useCoachToolHost.test.tsx`
 * renders it through a run of beats and holds the identity.
 *
 * t1a1 wires where the player is and going somewhere (the `go` tools), plus
 * the reads the app already has to hand. Every other member is a stub from
 * `notWiredHost()` that answers "notWiredYet", for leg t1a2 to wire here; the
 * input below already carries the Session and the jams for it.
 */
import { useEffect, useRef } from "react";
import type { Jam } from "../../jam/types";
import { notWiredHost, setCoachToolHost, SETTINGS_SECTIONS, type CoachToolHost } from "../../coach/tools/host";
import type { MainView } from "../main-window/MainHeader";
import type { PathsPlace } from "../main-window/hooks/usePathsPlace";
import type { SessionRun } from "../session/hooks/useSessionRun";

export type CoachToolHostInput = {
  view: MainView;
  /** `useTabRouting`'s, the rail's. */
  setView: (view: MainView) => void;
  pathsPlace: PathsPlace;
  session: SessionRun;
  /** The instrument id the player chose (`"bass"`, `"electric-guitar"`, …). */
  instrument: string;
  jams: readonly Jam[];
  /** `useJamSession().loadJam`, for t1a2's `load_jam`. */
  loadJam: (jam: Jam) => void;
};

/**
 * When Settings opens it scrolls itself to the top on its own timer, so one
 * early scroll is overwritten: the same three nudges `MainWindow`'s
 * "Pick a voice" detour uses.
 */
const SCROLL_NUDGES_MS = [80, 260, 520];

export function buildCoachToolHost(latest: { readonly current: CoachToolHostInput }): CoachToolHost {
  return {
    ...notWiredHost(),
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
    setCoachToolHost(built);
    return () => setCoachToolHost(null);
  }, [built]);
  return built;
}
