/**
 * P3: what players already have on disk still loads, with nothing lost.
 *
 * `fixtures/settings.v1.2.2.json` is a settings file of the shape v1.2.2 writes,
 * covering every record in TOOLS_PARITY.md section 4.2, including the old ones
 * that have to go on working: `timeSignature: 0` (the retired Never accent), a
 * drill preset, a setlist step that plays a jam, a jam with legacy `cues`. Each is
 * read back through today's own readers, not through a copy of them.
 *
 * The fixture is written by hand from the code rather than taken from a real
 * player's machine, because none is available. It freezes names and shapes; it
 * cannot prove anything about a file nobody has shown us.
 */
import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MainWindow } from "../../containers/main-window/MainWindow";
import { PresetSidebar } from "../../components/presets/PresetSidebar";
import { useKeybindings } from "../../hooks/useKeybindings";
import { renderHook } from "@testing-library/react";
import { GROOVES } from "../../jam/grooves";
import { compileJam } from "../../jam/compile";
import { HOTKEYS } from "../../hotkeys";
import { deleteSetlist, listJams, listSetlists, saveJams, saveSetlist } from "../../ipc";
import { JAM_KIT_IDS } from "../../jam/vibes";
import { STARTER_JAMS } from "../../jam/jams";
import { loadMixSetting, saveMixSetting } from "../../songs/songEngine";
import { DEFAULT_TEST_STATE, mockInvoke, setInvokeResponse } from "../mocks";
import { presetBeatGroups, presetFreeMode } from "../../utils/meter";
import type { Jam } from "../../jam/types";
import type { AppState, Preset, Setlist } from "../../types";
import settings from "./fixtures/settings.v1.2.2.json";
import legacy from "./fixtures/settings.legacy-chains.json";
import { installSettings } from "./store";
import { openTool, TOOLS, type Tool } from "./tools";

const SAVED = settings as unknown as Record<string, unknown>;
const PRESETS = settings.presets as unknown as Preset[];
const SETLISTS = settings.setlists as unknown as Setlist[];
const JAMS = settings.jams as unknown as Jam[];
const [METRONOME, SETLIST, DRILL, JAM] = TOOLS as unknown as [Tool, Tool, Tool, Tool, Tool];

const call = (command: string) => mockInvoke.mock.calls.filter(([c]) => c === command);

async function openShell(stored: Record<string, unknown> = SAVED) {
  const store = await installSettings(stored);
  setInvokeResponse("list_presets", () => stored.presets ?? []);
  setInvokeResponse("tts_voice_diagnostics", () => []);
  const view = render(<MainWindow />);
  await waitFor(() => expect(document.querySelector(".rail")).not.toBeNull());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
  return { ...view, store };
}

describe("a preset (PRS-23 to PRS-26, SYS-29)", () => {
  const preset = (id: string) => PRESETS.find((p) => p.id === id)!;

  it("from the Never accent days still loads, as FREE mode: no accents, as it was", () => {
    expect(presetBeatGroups(preset("preset-never"))).toEqual([4]);
    expect(presetFreeMode(preset("preset-never"))).toBe(true);
  });

  it("keeps its groups", () => {
    expect(presetBeatGroups(preset("preset-beat"))).toEqual([3, 2, 2]);
  });

  it("keeps free mode", () => {
    expect(presetFreeMode(preset("preset-free"))).toBe(true);
    expect(presetBeatGroups(preset("preset-free"))).toEqual([9]);
  });

  it("sets everything it holds when it is clicked", async () => {
    await openShell();
    await openTool(METRONOME);
    fireEvent.click(await screen.findByText("Warm up"));
    await waitFor(() => expect(call("set_volume").length).toBeGreaterThan(0));
    const sent = (c: string) => call(c).at(-1)?.[1];
    expect(sent("set_bpm")).toEqual({ bpm: 88 });
    expect(sent("set_subdivision")).toEqual({ subdivision: 2 });
    expect(sent("set_beat_groups")).toEqual({ groups: [3, 2, 2] });
    expect(sent("set_free_mode")).toEqual({ enabled: false });
    expect(sent("set_sound_type")).toEqual({ soundType: "sticks" });
    expect(sent("set_volume")).toEqual({ volume: 0.5 });
  });

  it("for the drill sets the whole plan and goes to the drill", async () => {
    await openShell();
    await openTool(DRILL);
    fireEvent.click(await screen.findByText("Climb"));
    await waitFor(() => expect(call("configure_speed_ramp").length).toBeGreaterThan(0));
    expect(call("configure_speed_ramp").at(-1)?.[1]).toMatchObject({
      startBpm: 70,
      targetBpm: 140,
      increment: 4,
      decrement: 2,
      barsPerStep: 3,
      beatsPerBar: 4,
      mode: "adaptive",
      cyclic: true,
    });
    await waitFor(() => expect(document.querySelector(".drill-view")).not.toBeNull());
  });

  it("is saved with exactly the fields it has always had", async () => {
    const state: AppState = { ...DEFAULT_TEST_STATE };
    render(
      <PresetSidebar
        view="beat"
        isOpen
        onToggle={() => {}}
        onLoadPreset={() => {}}
        onActiveChange={() => {}}
        state={state}
      />,
    );
    const add = await waitFor(() => {
      const b = document.querySelector<HTMLElement>(".preset-sidebar-add");
      expect(b).not.toBeNull();
      return b!;
    });
    fireEvent.click(add);
    const input = await waitFor(() => {
      const el = document.querySelector<HTMLInputElement>(".preset-sidebar-name-input");
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.change(input, { target: { value: "New one" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(call("save_preset").length).toBeGreaterThan(0));
    const saved = (call("save_preset")[0][1] as { preset: Preset }).preset;
    for (const field of [
      "id",
      "name",
      "createdAt",
      "bpm",
      "subdivision",
      "timeSignature",
      "beatGroups",
      "freeMode",
      "soundType",
      "volume",
      "view",
    ]) {
      expect(saved, field).toHaveProperty(field);
    }
  });
});

describe("a setlist (SET-01, SET-59, SYS-26)", () => {
  it("comes back from the store with every field", async () => {
    await installSettings(SAVED);
    expect(await listSetlists()).toEqual(SETLISTS);
  });

  it("carries all four kinds of gap and a step that plays a jam", async () => {
    await installSettings(SAVED);
    const [gig] = await listSetlists();
    expect(gig.steps.map((s) => s.trigger.kind)).toEqual(["bars", "seconds", "manual"]);
    expect(gig.steps.map((s) => s.transition.kind)).toEqual(["countIn", "rest", "cut"]);
    expect(gig.steps[2].jamId).toBe("jam-saved");
    expect(gig.repeat).toBe(2);
    expect(gig.countIn).toBe(4);
  });

  it("under the old name `chains` is brought across, once", async () => {
    const store = await installSettings(legacy as unknown as Record<string, unknown>);
    expect(await listSetlists()).toEqual(SETLISTS);
    expect(store.values.get("setlists")).toEqual(SETLISTS);
    // Left where it was: a downgrade still finds it.
    expect(store.values.get("chains")).toEqual(SETLISTS);
  });

  it("saves in place and deletes by id, under the same key", async () => {
    const store = await installSettings(SAVED);
    await saveSetlist({ ...SETLISTS[0], name: "Renamed" });
    expect((store.values.get("setlists") as Setlist[])[0].name).toBe("Renamed");
    await saveSetlist({ ...SETLISTS[0], id: "another" });
    expect((store.values.get("setlists") as Setlist[]).map((s) => s.id)).toEqual([
      "setlist-gig",
      "another",
    ]);
    await deleteSetlist("setlist-gig");
    expect((store.values.get("setlists") as Setlist[]).map((s) => s.id)).toEqual(["another"]);
  });

  it("opens in the Setlist tool", async () => {
    await openShell();
    await openTool(SETLIST);
    await waitFor(() => {
      expect(document.querySelector(".setlist-paragraph")?.textContent).toContain("Slow");
    });
    expect(document.querySelector(".setlist-paragraph")?.textContent).toContain("Over the band");
  });
});

describe("a jam (JAM-*, JTK-69 onward)", () => {
  it("comes back from the store with every field", async () => {
    await installSettings(SAVED);
    expect(await listJams()).toEqual(JAMS);
  });

  it("saves the whole list in order, under the same key", async () => {
    const store = await installSettings(SAVED);
    await saveJams([...JAMS].reverse());
    expect((store.values.get("jams") as Jam[]).map((j) => j.id)).toEqual([
      "jam-charted",
      "jam-saved",
    ]);
  });

  it("distinguishes never saved from deleted them all", async () => {
    await installSettings({});
    expect(await listJams()).toBeUndefined();
    await installSettings({ jams: [] });
    expect(await listJams()).toEqual([]);
  });

  it("still compiles, old record and all", () => {
    for (const jam of [...JAMS, ...STARTER_JAMS]) {
      expect(compileJam(jam), jam.id).toBeTruthy();
    }
  });

  it("points only at grooves and kits that still exist", () => {
    const grooves = new Set(GROOVES.map((g) => g.id));
    const kits = new Set<string>(JAM_KIT_IDS);
    for (const jam of [...JAMS, ...STARTER_JAMS]) {
      expect(grooves.has(jam.grooveId), `${jam.id}: ${jam.grooveId}`).toBe(true);
      expect(kits.has(jam.kit), `${jam.id}: ${jam.kit}`).toBe(true);
    }
  });

  it("opens the one you left on, by `lastJamId`", async () => {
    await openShell();
    await openTool(JAM);
    await waitFor(() => expect(document.querySelector(".jam-view")).not.toBeNull());
    expect(document.querySelector(".jam-item.active")?.textContent).toContain("Tuesday blues");
  });

  it("seeds spoken cues once from a legacy jam that had them on", async () => {
    const { jamCues: _set, ...stored } = SAVED;
    const { store } = await openShell(stored);
    await waitFor(() => expect(store.values.get("jamCues")).toBe(true));
  });
});

describe("a song's memory (SNG-27, SNR-96)", () => {
  it("comes back whole: mix, solo, count-in, selection, loop, speed, portions", async () => {
    await installSettings(SAVED);
    expect(await loadMixSetting("song-1")).toMatchObject(
      (settings.songMixes as Record<string, object>)["song-1"],
    );
  });

  it("saves one song without touching another", async () => {
    const store = await installSettings(SAVED);
    const mix = await loadMixSetting("song-1");
    await saveMixSetting("song-1", { ...mix, tempoPercent: 60 });
    const all = store.values.get("songMixes") as Record<string, { tempoPercent: number }>;
    expect(all["song-1"].tempoPercent).toBe(60);
    expect(all["song-2"]).toEqual((settings.songMixes as Record<string, object>)["song-2"]);
  });
});

describe("a player's bindings (section 4.4)", () => {
  it("keep their own keys and their stored tab-N, and gain any new default", async () => {
    await installSettings(SAVED);
    const { result } = renderHook(() => useKeybindings());
    await waitFor(() => expect(result.current.keyBindings.play).toBe("P"));
    expect(result.current.keyBindings["songs-loop"]).toBe("⇧L");
    expect(result.current.keyBindings["tab-3"]).toBe("⌘3");
    // Every action has a key, stored or default, so nothing goes dead.
    for (const h of HOTKEYS) expect(result.current.keyBindings).toHaveProperty(h.id);
    expect(result.current.footBindings).toEqual(settings.footBindings);
    expect(result.current.globalBindings.play).toBe("⌘⇧Space");
  });
});

describe("the whole file, through the whole app", () => {
  // Saved by the UI only after a user does something. Settling down on launch is
  // not something, and a launch that rewrites a player's records could lose them.
  const USER_DATA = [
    "presets",
    "setlists",
    "chains",
    "jams",
    "songMixes",
    "midiBindings",
    "lastSetlistId",
    "lastJamId",
    "language",
    "theme",
    "instrument",
    "zenStyle",
    "coachBrainTier",
    "coachMode",
    "coachStance",
    "coachVoiceName",
    "evaluationDevice",
  ];

  it("leaves what a player saved exactly as it was, just from launching", async () => {
    const { store } = await openShell();
    for (const tool of TOOLS) {
      await openTool(tool);
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
    }
    for (const key of USER_DATA) {
      expect(store.values.get(key), key).toEqual(SAVED[key]);
    }
    // New defaults get merged in and written, but what a player chose stays.
    expect(store.values.get("keyBindings")).toMatchObject(settings.keyBindings);
    expect(store.values.get("globalBindings")).toMatchObject(settings.globalBindings);
    expect(store.values.get("footBindings")).toEqual(settings.footBindings);
  });
});
