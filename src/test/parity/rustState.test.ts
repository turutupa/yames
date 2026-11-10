/**
 * P4, the half that needs no running app: Rust's own saved state.
 *
 * `persist_state` takes an `AppHandle`, so it cannot run in a test without a Tauri
 * app behind it, and the brief for this suite adds no production code to change
 * that. Its body is a list of `store.set` calls, and startup in `lib.rs` is a list of
 * `store.get`s, so they are read as text. Renaming a key on either side alone
 * silently resets that setting for everyone, and it is exactly the kind of edit
 * this catches. The frozen store itself is `src-tauri/tests/parity_store.rs`.
 */
import { describe, expect, it } from "vitest";
import { read } from "./extract";

const commands = read("src-tauri/src/commands.rs");
const lib = read("src-tauri/src/lib.rs");
const midi = read("src-tauri/src/midi.rs");
const db = read("src-tauri/src/db.rs");

/** A function's body: from its signature to the first `}` at column zero. */
function body(source: string, signature: string): string {
  const start = source.indexOf(signature);
  expect(start, `${signature} is gone`).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf("\n}\n", start));
}

/** Section 4.3's list. Rust reads each of these at startup. */
const RESTORED_AT_STARTUP = [
  "bpm",
  "subdivision",
  "mode",
  "corner",
  "alwaysOnTop",
  "widgetAlwaysOnTop",
  "accentColor",
  "theme",
  "volume",
  "soundType",
  "timeSignature",
  "beatGroups",
  "freeMode",
  "instrument",
  "speedRamp",
  "audioOutputDevice",
  "coachVoiceName",
  "coachTtsVolume",
  "midiBindings",
  "midiDevice",
  "lastWindow",
  "window_size_main",
  "window_position_main",
  "window_position_floating",
] as const;

/** What `persist_state` itself writes, on every change. */
const PERSISTED = [
  "bpm",
  "subdivision",
  "mode",
  "corner",
  "alwaysOnTop",
  "widgetAlwaysOnTop",
  "accentColor",
  "theme",
  "volume",
  "soundType",
  "timeSignature",
  "beatGroups",
  "freeMode",
  "speedRamp",
  "instrument",
] as const;

describe("persist_state", () => {
  const persist = body(commands, "fn persist_state(");

  it.each(PERSISTED)('writes "%s"', (key) => {
    expect(persist).toMatch(new RegExp(`store\\.set\\(\\s*"${key}"`));
  });

  it("does not write the transient playing state", () => {
    expect(persist).not.toMatch(/"isPlaying"/);
  });

  it.each(["startBpm", "targetBpm", "increment", "decrement", "barsPerStep", "beatsPerBar", "subdivision", "mode", "cyclic"])(
    'writes the ramp\'s "%s" (RMP-34)',
    (field) => {
      expect(persist).toContain(`"${field}": s.speed_ramp`);
    },
  );
});

describe("startup", () => {
  it.each(RESTORED_AT_STARTUP)('reads "%s"', (key) => {
    expect(lib).toMatch(new RegExp(`\\.get\\(\\s*"${key}"`));
  });

  it("is what puts the window on screen, through app_ready", () => {
    expect(body(commands, "pub fn app_ready")).toMatch(/\.show\(\)/);
  });
});

describe("the migrations that have to stay in the code (section 4.5)", () => {
  it("restores beat groups from the Never accent days", () => {
    expect(commands).toContain("fn restore_beat_groups");
  });

  it("imports the JSON history into SQLite", () => {
    expect(db).toContain("pub fn import_json_history");
    expect(db).toContain("pub fn import_legacy_history");
  });

  it("moves `soon` instruments", () => {
    expect(lib).toMatch(/"instrument"/);
    expect(commands).toContain("fn should_persist_instrument");
  });

  it("has no migration taken out or rewritten: they run in order, from v1", () => {
    const migrations = [...db.matchAll(/const MIGRATION_V(\d+): &str/g)].map((m) => Number(m[1]));
    expect(migrations.slice(0, 4)).toEqual([1, 2, 3, 4]);
  });

  it("has never gone below schema 4", () => {
    const version = /SCHEMA_VERSION: i64 = (\d+)/.exec(db);
    expect(Number(version?.[1])).toBeGreaterThanOrEqual(4);
  });
});

describe("what counts as pressing a pedal (MID-07, MID-09)", () => {
  // Inside a callback with an `AppHandle`, so read rather than run. parse_midi and
  // the bindings are run for real in src-tauri/tests/parity_midi.rs.
  it("a control change above 63", () => {
    expect(midi).toContain("MidiMsgType::ControlChange => value > 63");
  });

  it("a note with any velocity", () => {
    expect(midi).toContain("MidiMsgType::NoteOn => value > 0");
  });

  it("any program change", () => {
    expect(midi).toContain("MidiMsgType::ProgramChange => true");
  });

  it("a binding with no channel answers on all of them", () => {
    expect(midi).toContain("binding.channel.map_or(true, |ch| ch == channel)");
  });

  it("emits the action the frontend listens for", () => {
    expect(midi).toContain('"midi-action"');
  });
});
