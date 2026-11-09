/**
 * P1: the product's surface, frozen.
 *
 * `manifest.json` is every command, event, action, default key, settings key,
 * tool, theme, sound, language and so on the app had when the revamp began. This
 * fails in both directions, for different reasons:
 *
 *   - Something in the manifest is gone: a capability was lost, or a saved name
 *     changed. The owner's condition is that the tools lose nothing. If a removal
 *     really is a decision, delete the entry from `manifest.json` by hand, so the
 *     diff shows it and a person has to say so.
 *   - Something is not in the manifest yet: an addition. Fine, but deliberate.
 *     Record it with
 *
 *       UPDATE_PARITY_MANIFEST=1 npx vitest run src/test/parity/surface.test.ts
 *
 *     That only ever ADDS. It will not take anything out, on purpose.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { HOTKEYS } from "../../hotkeys";
import { THEMES } from "../../themes";
import { METER_PRESETS, SOUND_TYPES } from "../../constants/metronome";
import { HINT_IDS } from "../../containers/onboarding/hints/types";
import { TOUR_STOPS } from "../../containers/onboarding/tour/stops";
import { PLAY_TABS } from "../../containers/main-window/hooks/useTabRouting";
import { TOOLS } from "./tools";
import * as src from "./extract";

const MANIFEST = path.join(src.ROOT, "src/test/parity/manifest.json");

interface HotkeyRow {
  id: string;
  key: string;
  globalKey: string | null;
  globalAllowed: boolean;
  group: string;
}

interface Manifest {
  commands: string[];
  ipcCommands: string[];
  commandsInvokedOutsideIpc: string[];
  ipcWrappers: string[];
  ipcWrappersWithoutCaller: string[];
  eventsListened: string[];
  eventsEmitted: string[];
  hotkeys: HotkeyRow[];
  settingsKeys: Record<string, src.SettingsKeyUse>;
  tools: Array<{ mode: string; labelKey: string; action: string }>;
  playTabs: string[];
  themes: string[];
  sounds: string[];
  locales: string[];
  hints: string[];
  zenStyles: string[];
  meters: string[];
  tourStops: string[];
  sqliteTables: string[];
  fileAssociations: string[];
  windowLabels: string[];
  whereEverythingLives: Record<string, string>;
}

function whereEverythingLives(): Record<string, string> {
  const conf = JSON.parse(src.read("src-tauri/tauri.conf.json")) as {
    identifier: string;
    plugins: { updater: { pubkey: string; endpoints: string[] } };
  };
  return {
    identifier: conf.identifier,
    updaterPubkey: conf.plugins.updater.pubkey,
    updaterEndpoint: conf.plugins.updater.endpoints[0],
  };
}

function current(): Manifest {
  return {
    commands: src.registeredCommands(),
    ipcCommands: src.ipcCommands(),
    commandsInvokedOutsideIpc: src.commandsInvokedOutsideIpc(),
    ipcWrappers: src.ipcWrappers(),
    ipcWrappersWithoutCaller: src.ipcWrappersWithoutCaller(),
    eventsListened: src.eventsListened(),
    eventsEmitted: src.eventsEmitted(),
    hotkeys: HOTKEYS.map((h) => ({
      id: h.id,
      key: h.key,
      globalKey: h.globalKey ?? null,
      globalAllowed: h.globalAllowed === true,
      group: h.group,
    })),
    settingsKeys: src.settingsKeys(),
    tools: TOOLS.map((t) => ({ mode: t.mode, labelKey: t.labelKey, action: t.action })),
    playTabs: [...PLAY_TABS],
    themes: THEMES.map((t) => t.id),
    sounds: SOUND_TYPES.map((s) => s.id),
    locales: src.localeDirs(),
    hints: [...HINT_IDS],
    zenStyles: src.zenStyles(),
    meters: METER_PRESETS.map((m) => m.label),
    tourStops: TOUR_STOPS.map((s) => s.id),
    sqliteTables: src.sqliteTables(),
    fileAssociations: src.fileAssociations(),
    windowLabels: src.windowLabels(),
    whereEverythingLives: whereEverythingLives(),
  };
}

function readManifest(): Manifest {
  return JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as Manifest;
}

/** Keep the frozen rows as they are and put anything new after them. */
function withAdditions(frozen: Manifest | null, now: Manifest): Manifest {
  if (!frozen) return now;
  const out = structuredClone(frozen) as unknown as Record<string, unknown>;
  for (const [field, value] of Object.entries(now)) {
    // A wrapper that just lost its last caller is a loss, not an addition. Only a
    // hand edit may bless one.
    if (field === "ipcWrappersWithoutCaller") continue;
    const held = out[field];
    if (Array.isArray(value) && Array.isArray(held)) {
      const seen = new Set(held.map((v) => JSON.stringify(v)));
      const ids = new Set(held.map((v) => identity(v)));
      for (const v of value) {
        if (!seen.has(JSON.stringify(v)) && !ids.has(identity(v))) held.push(v);
      }
    } else if (value && typeof value === "object" && held && typeof held === "object") {
      for (const [k, v] of Object.entries(value)) {
        (held as Record<string, unknown>)[k] ??= v;
      }
    }
  }
  return out as unknown as Manifest;
}

function identity(row: unknown): string {
  if (typeof row === "string") return row;
  const r = row as { id?: string; mode?: string };
  return r.id ?? r.mode ?? JSON.stringify(row);
}

const updating = process.env.UPDATE_PARITY_MANIFEST === "1";
if (updating) {
  const frozen = fs.existsSync(MANIFEST) ? readManifest() : null;
  fs.writeFileSync(MANIFEST, `${JSON.stringify(withAdditions(frozen, current()), null, 2)}\n`);
}

const frozen = readManifest();
const now = current();

const removedFrom = (was: readonly string[], is: readonly string[]) =>
  was.filter((v) => !is.includes(v));
const addedTo = (was: readonly string[], is: readonly string[]) =>
  is.filter((v) => !was.includes(v));

/** The fields that are plain lists of names, compared in both directions. */
const LISTS = [
  ["commands", "Tauri commands"],
  ["ipcCommands", "commands src/ipc.ts invokes"],
  ["commandsInvokedOutsideIpc", "commands invoked outside src/ipc.ts"],
  ["ipcWrappers", "IPC wrappers"],
  ["eventsListened", "events the frontend listens for"],
  ["eventsEmitted", "events Rust emits"],
  ["playTabs", "stored activeTab values"],
  ["themes", "themes"],
  ["sounds", "sounds"],
  ["locales", "languages"],
  ["hints", "hints"],
  ["zenStyles", "Zen styles"],
  ["meters", "meter presets"],
  ["tourStops", "tour stops"],
  ["sqliteTables", "SQLite tables"],
  ["fileAssociations", "file associations"],
  ["windowLabels", "window labels"],
] as const;

describe("the frozen surface", () => {
  it("still sees the whole app: a silent zero here would pass everything", () => {
    expect(now.commands.length).toBeGreaterThanOrEqual(144);
    expect(now.ipcCommands.length).toBeGreaterThanOrEqual(142);
    expect(now.hotkeys.length).toBeGreaterThanOrEqual(42);
    expect(Object.keys(now.settingsKeys).length).toBeGreaterThanOrEqual(92);
    expect(new Set([...now.eventsListened, ...now.eventsEmitted]).size).toBeGreaterThanOrEqual(29);
    expect(now.themes.length).toBeGreaterThanOrEqual(13);
    expect(now.sounds.length).toBeGreaterThanOrEqual(8);
    expect(now.locales.length).toBeGreaterThanOrEqual(15);
    expect(now.hints.length).toBeGreaterThanOrEqual(9);
    expect(now.zenStyles.length).toBeGreaterThanOrEqual(7);
    expect(now.sqliteTables.length).toBeGreaterThanOrEqual(12);
  });

  it.each(LISTS)("has lost none of the %s", (field) => {
    expect(removedFrom(frozen[field], now[field])).toEqual([]);
  });

  it.each(LISTS)("has added to the %s only on purpose", (field) => {
    expect(addedTo(frozen[field], now[field])).toEqual([]);
  });

  it("exposes every registered command to the frontend", () => {
    const reachable = new Set([...now.ipcCommands, ...now.commandsInvokedOutsideIpc]);
    expect(now.commands.filter((c) => !reachable.has(c))).toEqual([]);
  });

  it("leaves no wrapper newly without a caller: its feature's route is gone", () => {
    // These have no route for a player today, and are recorded as such (section 1
    // of TOOLS_PARITY.md). Any other wrapper whose last caller is deleted means a
    // screen went and its plumbing stayed.
    expect(removedFrom(now.ipcWrappersWithoutCaller, frozen.ipcWrappersWithoutCaller)).toEqual([]);
  });
});

describe("the frozen hotkeys", () => {
  const byId = new Map(now.hotkeys.map((h) => [h.id, h]));

  it("has every action id, the storage key for every player's bindings", () => {
    expect(frozen.hotkeys.filter((h) => !byId.has(h.id)).map((h) => h.id)).toEqual([]);
  });

  it("has added an action only on purpose", () => {
    const known = new Set(frozen.hotkeys.map((h) => h.id));
    expect(now.hotkeys.filter((h) => !known.has(h.id)).map((h) => h.id)).toEqual([]);
  });

  it.each(frozen.hotkeys.map((h) => [h.id, h] as const))(
    "%s keeps its default keys and its group",
    (id, row) => {
      expect(byId.get(id)).toEqual(row);
    },
  );
});

describe("the frozen settings keys", () => {
  it("has added a key only on purpose", () => {
    expect(addedTo(Object.keys(frozen.settingsKeys), Object.keys(now.settingsKeys))).toEqual([]);
  });

  it.each(Object.entries(frozen.settingsKeys))(
    "%s is still read and written under that exact name",
    (key, use) => {
      // Wider is fine (a key read-only today may gain a writer). Narrower is not.
      const is = now.settingsKeys[key];
      expect(is, `nothing reads or writes "${key}" any more`).toBeDefined();
      expect(is.store).toBe(use.store);
      if (use.read) expect(is.read, `nothing reads "${key}" any more`).toBe(true);
      if (use.written) expect(is.written, `nothing writes "${key}" any more`).toBe(true);
    },
  );
});

describe("the tools", () => {
  it("are all still stored tabs, in the code's own list", () => {
    for (const t of frozen.tools) expect(now.playTabs).toContain(t.mode);
  });

  it("keep their ids, names and positional hotkeys", () => {
    expect(now.tools).toEqual(frozen.tools);
  });
});

describe("where everything lives", () => {
  it("has not moved: these orphan user data or stop updates if they change", () => {
    expect(now.whereEverythingLives).toEqual(frozen.whereEverythingLives);
  });

  it("still keeps its data in settings.json", () => {
    expect(src.read("src/ipc.ts")).toContain('load("settings.json"');
    expect(src.read("src/ipc.ts")).toContain('load("songs.json"');
    expect(src.read("src-tauri/src/db.rs")).toContain('DB_FILE_NAME: &str = "practice.db"');
  });
});
