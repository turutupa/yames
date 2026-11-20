/**
 * A host for tests: it records every call and keeps the little state the
 * `go` tools move (the view, the Paths place), so a test can run a tool, run
 * its undo, and check the app is back where it was.
 *
 * Built from `notWiredHost()`, so a member a test does not care about answers
 * the way the real host's stubs do. Not imported by the app.
 */

import type { MainView } from "../../containers/main-window/MainHeader";
import type { PathsAt } from "../../containers/main-window/hooks/usePathsPlace";
import type { PathDoc } from "../../paths/format";
import type { CoachContext } from "../context";
import { HOST_MEMBERS, notWiredHost, type CoachToolHost, type Sounding } from "./host";

export type HostCall = { member: keyof CoachToolHost; args: unknown[] };

export type FakeHost = CoachToolHost & {
  /** Every member called, in order, reads included. */
  calls: HostCall[];
  /** The calls that change something (everything but the reads). */
  changes: () => HostCall[];
  /** The view and the Paths place now. */
  where: () => { view: MainView; at: PathsAt };
};

/** The members that only read. */
const READS = new Set<keyof CoachToolHost>([
  "view",
  "pathsAt",
  "paths",
  "instrument",
  "sessionActive",
  "plan",
  "minutes",
  "todayFocus",
  "progress",
  "previewPlan",
  "tempo",
  "swapOptions",
  "jams",
  "presets",
  "clickSubdivision",
  "safeSetting",
  "safeSettingOptions",
  "goal",
  "sounding",
  "nudges",
]);

export function fakeHost(
  start: { view?: MainView; at?: PathsAt; paths?: readonly PathDoc[]; session?: boolean; sounding?: Sounding | null } = {},
  overrides: Partial<CoachToolHost> = {},
): FakeHost {
  let view: MainView = start.view ?? "today";
  let at: PathsAt = start.at ?? { pathId: null, stepId: null };
  let sounding: Sounding | null = start.sounding ?? null;
  const calls: HostCall[] = [];
  const base: CoachToolHost = {
    ...notWiredHost(),
    view: () => view,
    pathsAt: () => at,
    paths: () => start.paths ?? [],
    sessionActive: () => start.session ?? false,
    // Leaving a tool stops what plays, as the app's own view switch does.
    sounding: () => sounding,
    setView: (next) => {
      view = next;
      sounding = null;
    },
    movePaths: (next) => {
      at = next;
    },
    openSettingsSection: () => {
      view = "settings";
      sounding = null;
    },
    ...overrides,
  };
  const recorded = {} as Record<keyof CoachToolHost, unknown>;
  for (const member of HOST_MEMBERS) {
    const fn = base[member] as (...args: unknown[]) => unknown;
    recorded[member] = (...args: unknown[]) => {
      calls.push({ member, args });
      return fn(...args);
    };
  }
  return Object.assign(recorded as CoachToolHost, {
    calls,
    changes: () => calls.filter((call) => !READS.has(call.member)),
    where: () => ({ view, at }),
  });
}

/** A context for a tool test: Today, nothing running, unless told otherwise. */
export function toolCtx(over: Partial<CoachContext> = {}): CoachContext {
  return {
    screen: "today",
    locale: "en",
    now: 0,
    grading: "on",
    input: { listening: false, direct: false },
    brain: { llmCompiled: false, choice: "off", resident: false, fastEnough: false },
    progress: { states: [], takes: [], ceilings: [] },
    ...over,
  };
}
