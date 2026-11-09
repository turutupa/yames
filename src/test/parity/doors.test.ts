/**
 * Doors that must not get a second way in.
 *
 * TOOLS_PARITY.md section 3: "a coach-built Session drives the tool's existing code
 * path instead of a parallel one". A new surface that reimplemented one of these
 * would look fine and quietly lose history, consent or the stop on a mode change.
 * So each entry says who may call the thing. To add a caller, go through the door
 * instead; if that is truly impossible, add it here with a reviewer watching.
 */
import { describe, expect, it } from "vitest";
import path from "node:path";
import { productionTs, read } from "./extract";

const n = (...p: string[]) => path.join("src", ...p);
const IPC = n("ipc.ts");

/** Files that use `name` as a word, other than where it is defined. */
function callers(name: string): string[] {
  const word = new RegExp(`\\b${name}\\b`);
  return productionTs()
    .filter((f) => f !== IPC && word.test(read(f)))
    .sort();
}

const DOORS: Array<[string, string, string[]]> = [
  // COA-07, COA-61, section 3.1 item 4: the order of calls is what makes a session.
  ["saveSession", "a session is only saved by useSession", [n("hooks", "useSession.ts")]],
  ["getFinalSessionReport", "the final report is only read by useSession", [n("hooks", "useSession.ts")]],
  // JTK-33, SNR-85: the promise dialogs live in front of these.
  ["startTake", "a take is only started by the two take hooks", [
    n("containers", "main-window", "hooks", "useJamTakes.ts"),
    n("containers", "songs", "useSongTakes.ts"),
  ]],
  ["stopTake", "a take is only stopped by the two take hooks", [
    n("containers", "main-window", "hooks", "useJamTakes.ts"),
    n("containers", "songs", "useSongTakes.ts"),
  ]],
  // SHL-07: the saved tab. OS file open forces Songs (SYS-07), the one other writer.
  ["setActiveTab", "the saved tab is only written by routing", [
    n("containers", "main-window", "hooks", "useTabRouting.ts"),
    n("containers", "songs", "useOpenedSong.ts"),
  ]],
  ["saveAttempt", "a song attempt is only saved through its one hook", [
    n("containers", "songs", "review", "useSongAttempt.ts"),
    n("songs", "attempt.ts"),
  ]],
];

describe("the doors", () => {
  it.each(DOORS)("%s: %s", (name, _why, allowed) => {
    expect(callers(name)).toEqual([...allowed].sort());
  });

  // Wherever the shell ends up living. Two sessions would each save, two routers
  // would disagree about which mode is on, two dispatchers would act twice.
  it.each(["useSession", "useTabRouting", "useActionDispatcher"])(
    "%s is mounted exactly once",
    (hook) => {
      const mounted = productionTs().flatMap((f) =>
        read(f).match(new RegExp(`(?<!function )\\b${hook}\\(`, "g")) ?? [],
      );
      expect(mounted).toHaveLength(1);
    },
  );

  it("app_ready has exactly one caller", () => {
    const files = productionTs().filter((f) => read(f).includes('"app_ready"'));
    expect(files).toEqual([n("App.tsx")]);
  });
});
