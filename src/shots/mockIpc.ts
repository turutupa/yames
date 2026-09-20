/**
 * A stand-in Tauri backend, for screenshots only.
 *
 * `shots.html` is not part of the app: `vite build` is given `index.html` as
 * its single input, so nothing in this folder reaches a release. It exists so
 * the screenshots on the website and in the README can be taken from the real
 * UI — the same components, the same stylesheets, the same engine — without a
 * Rust build, an audio device, or the machine's own practice history.
 *
 * It is deliberately a sibling of `devShim.local.ts` rather than a copy of it:
 * that file is gitignored scratch for looking at layout, and it answers
 * whatever its author needed that day. This one is committed, and every answer
 * it gives is a decision about what the pictures show.
 */
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { Shot } from "./scenarios";
import { STARTER_JAMS } from "../jam/jams";
import { jamToSetlistStep } from "../setlist/setlists";
import { bandStateForBar } from "../jam/practice";
import type { JamEngineConfig } from "../jam/types";
import { importSong } from "../songs/import";
import { newSongRecord } from "../songs/library";
import type { SongRecord } from "../songs/library";
import { scriptFindings, scriptPass } from "../containers/songs/review/reviewFixtures";
import type { ScoreSchedule } from "../songs/types";

/**
 * The library in the sidebar.
 *
 * The sidebar is in frame on every window shot, so this is what the world
 * sees. Four presets fill the list without running past the fold, and the
 * names are the exercises a guitarist would actually keep.
 */
const PRESETS = [
  { id: "p1", name: "Warm-up", bpm: 80, subdivision: 1, timeSignature: 4,
    beatGroups: [4], soundType: "wood", volume: 0.7, view: "beat", createdAt: 1 },
  { id: "p2", name: "Gallop 16ths", bpm: 96, subdivision: 4, timeSignature: 4,
    beatGroups: [4], soundType: "drum", volume: 0.7, view: "beat", createdAt: 2 },
  { id: "p3", name: "Alt picking", bpm: 120, subdivision: 2, timeSignature: 4,
    beatGroups: [4], soundType: "drum", volume: 0.7, view: "beat", createdAt: 3 },
  { id: "p4", name: "Odd meter", bpm: 88, subdivision: 2, timeSignature: 7,
    beatGroups: [3, 2, 2], soundType: "click", volume: 0.7, view: "beat", createdAt: 4 },
];

/** The drill tab's library. `view: "drill"` is what puts them on that list. */
const DRILLS = [
  { id: "d1", name: "Slow climb", bpm: 60, subdivision: 1, timeSignature: 4,
    beatGroups: [4], soundType: "click", volume: 0.7, view: "drill", createdAt: 5,
    speedRamp: { startBpm: 60, targetBpm: 135, increment: 5, decrement: 3,
      barsPerStep: 8, beatsPerBar: 4, mode: "linear", cyclic: false, warmupBeats: 4 } },
  { id: "d2", name: "Push and pull", bpm: 90, subdivision: 2, timeSignature: 4,
    beatGroups: [4], soundType: "click", volume: 0.7, view: "drill", createdAt: 6,
    speedRamp: { startBpm: 90, targetBpm: 150, increment: 8, decrement: 4,
      barsPerStep: 6, beatsPerBar: 4, mode: "zigzag", cyclic: true, warmupBeats: 4 } },
];

/**
 * The routine ends with the band (JAM_MODE §8.5).
 *
 * Built through `jamToSetlistStep` rather than hand-written, so the picture
 * cannot show a step shape the app would never produce — the meter, the
 * tempo and the fallback click are all copied from the starter jam exactly
 * as pressing "Add a jam" would copy them.
 */
const JAM_STEP = {
  ...jamToSetlistStep(STARTER_JAMS[0]),
  trigger: { kind: "manual" as const },
  transition: { kind: "cut" as const },
};

const SETLISTS = [
  {
    id: "c1", name: "Daily routine", createdAt: 1, repeat: 1, countIn: 0,
    steps: [
      { id: "s1", name: "Loosen up", bpm: 70, subdivision: 1, timeSignature: 4,
        beatGroups: [4], soundType: "wood", volume: 0.7,
        trigger: { kind: "bars", bars: 8 }, transition: { kind: "cut" } },
      { id: "s2", name: "Alt picking", bpm: 96, subdivision: 4, timeSignature: 4,
        beatGroups: [4], soundType: "wood", volume: 0.7,
        trigger: { kind: "seconds", seconds: 120 }, transition: { kind: "countIn", bars: 2 } },
      { id: "s3", name: "Cool down", bpm: 60, subdivision: 1, timeSignature: 4,
        beatGroups: [4], soundType: "wood", volume: 0.7,
        trigger: { kind: "bars", bars: 16 }, transition: { kind: "countIn", bars: 1 } },
      JAM_STEP,
    ],
  },
];

/**
 * Three takes of the slow blues, so the shelf photographs with something on
 * it. Fixed timestamps rather than "an hour ago", so the picture is the same
 * whenever it is taken.
 */
const TAKES = [
  { id: "tk3", jamId: STARTER_JAMS[0].id, createdAt: new Date(2026, 1, 18, 20, 12).getTime(),
    durationSec: 402, path: "takes/tk3.wav" },
  { id: "tk2", jamId: STARTER_JAMS[0].id, createdAt: new Date(2026, 1, 18, 19, 51).getTime(),
    durationSec: 247, path: "takes/tk2.wav" },
  { id: "tk1", jamId: STARTER_JAMS[0].id, createdAt: new Date(2026, 1, 16, 11, 30).getTime(),
    durationSec: 118, path: "takes/tk1.wav" },
];

function baseState(theme: string) {
  return {
    // 120 reads ALLEGRO on the tempo scale; 4/4 with eighths is the setting
    // nobody has to decode.
    bpm: 120,
    isPlaying: false,
    subdivision: 2,
    timeSignature: 4,
    beatGroups: [4],
    accentMode: "groups",
    soundType: "drum",
    volume: 0.7,
    freeMode: false,
    countIn: { beats: 0, done: 0 },
    theme,
    accentColor: "#88ccff",
    mode: "comfortable",
    corner: "bottom-right",
    alwaysOnTop: false,
    widgetAlwaysOnTop: false,
    instrument: "electric-guitar",
    // The drill screen reads its whole form off this, so it is the numbers in
    // the drill shot: a climb from 60 to 135, which is the example the
    // website's drill copy already uses.
    speedRamp: {
      startBpm: 60,
      targetBpm: 135,
      increment: 5,
      decrement: 3,
      barsPerStep: 8,
      beatsPerBar: 4,
      subdivision: 1,
      mode: "linear",
      cyclic: false,
      aggressiveness: "moderate",
      active: false,
      currentStep: 0,
      currentBpm: 60,
      direction: "up",
      barsInStep: 0,
      completed: false,
      warmupBeats: 4,
      warmupCount: 0,
    },
  };
}

/**
 * The one song in the library on a Songs shot.
 *
 * Written here in alphaTex, like the importer's fixtures and for the same
 * reason: the app ships no songs and this repository holds no real ones
 * (`plans/SONGS.md` S0.4). Eight bars in two named sections, so the section
 * chips, the bar range and a tab worth scrolling are all in frame.
 */
/**
 * The song on the stage, and the band under it.
 *
 * The guitar is track 0 and is the part the shot plays; the drums and the
 * bass are what the engine plays behind it, and they are here so the band's
 * faders on the stage have rows to be about (`W13-SONGS-ENGINE.md` item 4).
 * `\articulation defaults` is what makes the drum names parse at all.
 */
const SHOT_SONG_TEX = `\\title "Practice piece"
\\artist "Written for the pictures"
\\tempo 96
.
\\track "Guitar"
\\tuning e5 b4 g4 d4 a3 e3
\\section Verse
\\ts 4 4 5.5.8 7.5.8 5.4.8 7.4.8 5.5.8 7.5.8 5.4.8 7.4.8 |
5.5.8 7.5.8 5.4.8 7.4.8 5.5.8 7.5.8 5.4.8 7.4.8 |
3.5.8 5.5.8 3.4.8 5.4.8 3.5.8 5.5.8 3.4.8 5.4.8 |
3.5.8 5.5.8 3.4.8 5.4.8 3.5.8 5.5.8 3.4.8 5.4.8 |
\\section Chorus
8.5.8 10.5.8 8.4.8 10.4.8 8.5.8 10.5.8 8.4.8 10.4.8 |
8.5.8 10.5.8 8.4.8 10.4.8 8.5.8 10.5.8 8.4.8 10.4.8 |
7.5.8 8.5.8 7.4.8 8.4.8 7.5.8 8.5.8 7.4.8 8.4.8 |
7.5.8 8.5.8 7.4.8 8.4.8 7.5.8 8.5.8 7.4.8 8.4.8 |
\\track "Drums"
\\instrument percussion
\\articulation defaults
\\ts 4 4 (KickHit HiHatClosed).4 HiHatClosed.4 (SnareHit HiHatClosed).4 HiHatClosed.4 |
(KickHit HiHatClosed).4 HiHatClosed.4 (SnareHit HiHatClosed).4 HiHatClosed.4 |
(KickHit HiHatClosed).4 HiHatClosed.4 (SnareHit HiHatClosed).4 HiHatClosed.4 |
(KickHit HiHatClosed).4 HiHatClosed.4 (SnareHit HiHatClosed).4 HiHatClosed.4 |
(KickHit HiHatClosed).4 HiHatClosed.4 (SnareHit HiHatClosed).4 HiHatClosed.4 |
(KickHit HiHatClosed).4 HiHatClosed.4 (SnareHit HiHatClosed).4 HiHatClosed.4 |
(KickHit HiHatClosed).4 HiHatClosed.4 (SnareHit HiHatClosed).4 HiHatClosed.4 |
(KickHit HiHatClosed).4 HiHatClosed.4 (SnareHit HiHatClosed).4 HiHatClosed.4 |
\\track "Bass"
\\tuning g2 d2 a1 e1
\\ts 4 4 5.4.4 5.4.4 5.4.4 5.4.4 |
5.4.4 5.4.4 5.4.4 5.4.4 |
3.4.4 3.4.4 3.4.4 3.4.4 |
3.4.4 3.4.4 3.4.4 3.4.4 |
8.4.4 8.4.4 8.4.4 8.4.4 |
8.4.4 8.4.4 8.4.4 8.4.4 |
7.4.4 7.4.4 7.4.4 7.4.4 |
7.4.4 7.4.4 7.4.4 7.4.4 |`;

let songRecord: SongRecord | null = null;

/** Built once: parsing is the expensive half and the shot never changes it. */
function songShotRecord(): SongRecord {
  if (!songRecord) {
    const bytes = new TextEncoder().encode(SHOT_SONG_TEX);
    songRecord = newSongRecord(importSong(bytes, "Practice piece.alphatex", 0).score, bytes);
  }
  return songRecord;
}

/**
 * The store, settled.
 *
 * Everything a first-time user sees is a screen that must never reach a
 * marketing image, and each one has its own flag:
 *
 *   instrument / onboarding.*   the setup wizard, over the whole window
 *   tour.seenVersion            "New here? Take the 30-second tour"
 *   whatsNew.seenVersion        the release-notes modal, over everything
 *   hints.*                     a coach tip, popping in mid-capture
 *
 * All four postdate the last time these screenshots were taken, and all four
 * would have landed on the homepage.
 */
function baseStore(theme: string, tab: string, zenStyle?: string): Map<string, unknown> {
  const hints = [
    "drill-first-open", "preset-suggest", "coach-ask",
    "zen-first", "widget-discover", "midi-plugged",
  ];
  const store = new Map<string, unknown>([
    ["presets", [...PRESETS, ...DRILLS]],
    ["setlists", SETLISTS],
    ["activeTab", tab],
    ["theme", theme],
    ["keybindings", {}],
    ["sessions", []],
    ["instrument", "electric-guitar"],
    ["onboarding.version", 1],
    ["onboarding.completedAt", "2026-01-01T00:00:00.000Z"],
    ["tour.seenVersion", 99],
    // Any string will do: the modal opens only when this differs from the
    // running app's version, and a mocked backend reports no version at all.
    ["whatsNew.seenVersion", "screenshots"],
    ["appSessionCount", 12],
    ["widgetOpened", true],
    ["lastWindow", "main"],
  ]);
  for (const h of hints) store.set(`hints.${h}`, true);
  if (zenStyle) store.set("zenStyle", zenStyle);
  // `songs.json` is empty and already moved: the library lives in the store
  // now, and `SCORES` below is what answers for it. Saying the move has run
  // keeps the harness off a migration path the shots are not about.
  store.set("movedToPracticeStore", true);
  return store;
}

/** Install the mock. Call once, before React mounts. */
export function installShotMock(shot: Shot, theme: string): void {
  const w = window as unknown as Record<string, unknown>;
  if (w.__TAURI_INTERNALS__) return;

  const STATE = baseState(theme) as Record<string, unknown>;
  if (shot.ramp) Object.assign(STATE.speedRamp as object, shot.ramp);
  const store = baseStore(theme, shot.tab ?? "beat", shot.zenStyle);

  /** The song library, the way the practice store holds it. */
  const SCORES = new Map<string, SongRecord>();
  if (shot.tab === "songs") {
    const record = songShotRecord();
    SCORES.set(record.id, record);
  }

  mockWindows(shot.window === "floating" ? "floating" : "main");

  const listeners = new Map<string, number[]>();
  let nextListenerId = 1;

  function emit(event: string, payload: unknown) {
    const internals = (window as unknown as {
      __TAURI_INTERNALS__?: { runCallback?: (id: number, p: unknown) => void };
    }).__TAURI_INTERNALS__;
    for (const handler of listeners.get(event) ?? []) {
      internals?.runCallback?.(handler, { event, id: handler, payload });
    }
  }

  // A beat every 60/bpm seconds while playing. Only the Zen shot runs it, and
  // only because Zen is a picture of a metronome that is going.
  let beatTimer: ReturnType<typeof setTimeout> | undefined;
  let beatCount = 0;

  /**
   * The jam the "engine" is carrying, if any.
   *
   * The mock counts the form the way `engine.rs` does — bars from the first
   * downbeat, chorus from the bar count — so the timeline, the NOW block and
   * the band lanes all move in a screenshot exactly as they do in the app.
   * Without it the jam screen photographs as bar one of chorus one for ever,
   * which is the one state that says nothing about what the mode does.
   */
  let jamConfig: JamEngineConfig | null = null;

  /**
   * Where the form has been sent, the way `set_jam_position` sends it.
   *
   * Applied at the bar line and never mid-bar, which is the whole rule the
   * real command is written around. Without it the harness would photograph a
   * timeline with a loop drawn on it and a lit cell walking straight out of
   * the loop, which is a picture of the feature not working.
   */
  let jamJumpTo: number | null = null;
  let jamLoop: { start: number; end: number } | null = null;
  /** Added to the bar the beat count implies, so a jump is a shift not a reset. */
  let jamBarShift = 0;
  /** The bar reported on the last beat, so a bar line is detectable. */
  let jamLastBar: number | null = null;

  /**
   * The schedule the app actually pushed, and the pass built from it.
   *
   * The review scenes are not a mock-up: the app imports the song, derives
   * the schedule, hands it over, and the "analyzer" here answers with a pass
   * over THAT schedule. So the verdicts line up with the notes on the page,
   * and a change to `schedule.ts` shows up in the pictures the way it would
   * show up in the app.
   */
  let songSchedule: ScoreSchedule | null = null;
  const scripted = () => {
    const recipe = shot.songs?.review;
    if (!recipe || !songSchedule) return null;
    const record = songShotRecord();
    // 96 BPM is the shot song's own tempo; the review's bands are taken
    // against the click's quarter note, so it has to be the same one.
    const quarterMs = 60_000 / 96;
    const pass = scriptPass(songSchedule, recipe, { quarterMs });
    return {
      pass,
      findings: scriptFindings(record.score, songSchedule, recipe, pass, { bpm: 96 }),
      quarterMs,
    };
  };

  function beatLoop() {
    clearTimeout(beatTimer);
    if (!STATE.isPlaying) return;
    const groups = STATE.beatGroups as number[];
    const total = groups.reduce((a, b) => a + b, 0) || 4;
    const measureBeat = beatCount % total;
    // The engine's accent rule, drawn again for the screenshot harness: the
    // beat that opens the bar is strong, every other group start is a middle.
    const opens = new Map<number, 1 | 2>();
    let cursor = 0;
    for (const g of groups) {
      opens.set(cursor, cursor === 0 ? 2 : 1);
      cursor += g;
    }
    // Bar zero of chorus one is what the engine reports with no jam loaded.
    let formBar = 0;
    let chorus = 1;
    let bandState: "full" | "hatsOnly" | "silent" = "full";
    if (jamConfig) {
      const formBars = Math.max(1, jamConfig.formBars);
      const raw = Math.floor(beatCount / total);
      // A bar line is the only place the form is allowed to move.
      if (jamLastBar !== raw) {
        jamLastBar = raw;
        const at = (((raw + jamBarShift) % formBars) + formBars) % formBars;
        if (jamJumpTo !== null) {
          jamBarShift += jamJumpTo - at;
          jamJumpTo = null;
        } else if (jamLoop && at > jamLoop.end) {
          // Off the end of the loop: back to its first bar. A loop does not
          // start a new chorus, so only the bar moves.
          jamBarShift += jamLoop.start - at;
        }
      }
      const bar = raw + jamBarShift;
      formBar = ((bar % formBars) + formBars) % formBars;
      chorus = Math.floor(Math.max(0, raw) / formBars) + 1;
      bandState = bandStateForBar({
        formBar,
        chorus,
        formBars,
        practice: jamConfig.practice,
      });
    }

    emit("beat", {
      beat: beatCount,
      measureBeat,
      subdivision: 0,
      isDownbeat: true,
      accentLevel: opens.get(measureBeat) ?? 0,
      isAccent: opens.has(measureBeat),
      formBar,
      chorus,
      bandState,
      beatsPerMeasure: total,
    });
    beatCount += 1;
    beatTimer = setTimeout(beatLoop, 60000 / (STATE.bpm as number));
  }

  function setPlaying(next: boolean) {
    STATE.isPlaying = next;
    beatCount = 0;
    emit("state-changed", STATE);
    if (next) beatLoop();
    else clearTimeout(beatTimer);
  }

  // Handlers take the command's own arguments, because some answers depend on
  // them: `list_takes` is about ONE jam's shelf, and a mock that ignores which
  // one cannot photograph an empty one.
  const MAP: Record<string, (a?: Record<string, unknown>) => unknown> = {
    get_state: () => STATE,
    list_presets: () => [...PRESETS, ...DRILLS],
    get_active_tab: () => shot.tab ?? "beat",
    app_ready: () => null,
    get_model_status: () => ({ voiceReady: false, downloaded: [], active: null }),
    get_system_memory_mb: () => 32768,
    tts_list_voices: () => [],
    tts_voice_diagnostics: () => [],
    // A bool, not an object — see `get_evaluation_state` in commands.rs. An
    // object here is truthy, and the app drew a live green "Listening" chip
    // over a microphone that was not on.
    get_evaluation_state: () => false,
    list_audio_input_devices: () => [],
    list_audio_output_devices: () => ["Default"],
    list_midi_devices: () => [],
    get_midi_bindings: () => [],
    get_session_history: () => [],
    query_history: () => [],
    /*
     * The song library, as the practice store answers it.
     *
     * Songs moved out of `songs.json` into `scores`, so the harness has to
     * answer the four commands `src/songs/library.ts` now uses. A `Map`
     * rather than four constants because the library writes as well as
     * reads: the shots never delete anything, but a scene that did would
     * otherwise photograph a list that ignored it.
     */
    list_scores: () =>
      [...SCORES.values()].map((r) => ({
        id: r.id,
        title: r.score.title,
        artist: r.score.artist,
        sourceFile: r.score.source.fileName,
        format: r.score.source.format,
        trackIndex: r.score.source.trackIndex,
        trackName: r.score.source.trackName,
        importedAt: r.addedAt,
        name: r.name,
      })),
    get_score: (a) => SCORES.get(String(a?.id))?.score ?? null,
    get_score_source: (a) => SCORES.get(String(a?.id))?.sourceBase64 ?? null,
    save_score: (a) => {
      const score = a?.score as SongRecord["score"];
      SCORES.set(score.id, {
        id: score.id,
        name: (a?.name as string) ?? score.title,
        addedAt: (a?.importedAt as number) ?? Date.now(),
        score,
        sourceBase64: (a?.sourceBase64 as string) ?? "",
      });
      return score.id;
    },
    delete_score: (a) => {
      SCORES.delete(String(a?.id));
      return null;
    },
    is_coach_loaded: () => false,
    get_calibration_offset: () => null,
    llm_compiled: () => false,
    get_calibration_cache_entry: () => null,
    list_instruments: () => [],
    get_hint_state: () => ({}),
    get_onboarding_state: () => ({ completed: true }),
    toggle_playback: () => {
      setPlaying(!STATE.isPlaying);
      return null;
    },
    start_metronome: () => {
      setPlaying(true);
      return null;
    },
    stop_metronome: () => {
      setPlaying(false);
      return null;
    },
    arm_count_in: () => null,
    /**
     * The jam library. The six that ship, so the Jam tab photographs with
     * something in it — and so a click-through of the mode does not have to
     * start by inventing a jam.
     */
    list_jams: () => [...STARTER_JAMS],
    save_jams: () => null,
    /**
     * The takes (JAM_MODE §4.4), of the jam that was asked about.
     *
     * Answered rather than left to fall through to `null`, because the
     * section's whole point is what a shelf with recordings on it looks
     * like — and because a rejection here is the "cannot record" state,
     * which is a different picture.
     *
     * Filtered by `jamId`, like the real command: the fixtures are all on the
     * first starter jam, so handing the same three back for every jam meant
     * the empty shelf — the one a musician sees on every jam but the one they
     * recorded — could not be photographed at all.
     */
    list_takes: (a) => TAKES.filter((take) => take.jamId === a?.jamId),
    start_take: () => null,
    stop_take: () => null,
    delete_take: () => null,
    play_take: () => null,
    stop_take_playback: () => null,
    // Under the 100 MB the section starts mentioning: the picture is of a
    // shelf, not of a warning about one.
    takes_dir_size: () => 46 * 1024 * 1024,
    // A folder of your own samples (JAM_UX_DECISIONS B3). Named after a real
    // free pack so the row reads like something a person would actually point
    // at, and short one voice — the interesting picture is the sentence that
    // says where the missing one comes from, not a folder with all eight.
    /**
     * Songs on the engine. Answered rather than left to fall through to
     * `null`, because the stage reads what came back: a `SongLoaded` of
     * nothing would photograph as a song that loaded no notes, and the
     * notice about instruments the band cannot play would never appear.
     *
     * The numbers are a plausible eight bars of the fixture above and
     * nothing turns on them — what the shot needs is that the call resolves
     * and that `droppedNotes` is zero, so the quiet line under the facts
     * stays out of the picture.
     */
    load_song: () => ({ bars: 8, passMs: 20_000, playedNotes: 96, droppedNotes: 0 }),
    set_song_range: () => ({ bars: 8, passMs: 20_000, playedNotes: 96, droppedNotes: 0 }),
    clear_song: () => null,
    set_song_mix: () => null,
    pick_kit_folder: () => "C:\\Users\\you\\Samples\\Studio Kit",
    inspect_kit_folder: () => ({
      voices: ["kick", "snare", "hat", "hat_open", "ride", "rim", "crash"],
      missing: ["snare_soft"],
    }),
  };

  mockIPC(async (cmd, args) => {
    const a = args as Record<string, unknown> | undefined;

    if (cmd.startsWith("plugin:store|")) {
      const op = cmd.split("|")[1];
      // `load`/`get_store` hand back a resource id that every later call is
      // keyed by. Returning null makes the JS wrapper destructure nothing and
      // throw, which looks exactly like "the app cannot read its own store".
      if (op === "load" || op === "get_store") return 1;
      if (op === "get") {
        const v = store.get(String(a?.key));
        return [v ?? null, store.has(String(a?.key))];
      }
      if (op === "has") return store.has(String(a?.key));
      if (op === "entries") return [...store.entries()];
      if (op === "keys") return [...store.keys()];
      if (op === "values") return [...store.values()];
      if (op === "length") return store.size;
      if (op === "set") {
        store.set(String(a?.key), a?.value);
        return null;
      }
      if (op === "delete") return store.delete(String(a?.key));
      if (op === "clear") {
        store.clear();
        return null;
      }
      return null;
    }

    if (cmd === "plugin:event|listen") {
      const event = String(a?.event);
      const handler = Number(a?.handler);
      listeners.set(event, [...(listeners.get(event) ?? []), handler]);
      return nextListenerId++;
    }
    if (cmd === "plugin:event|unlisten") {
      for (const [event, ids] of listeners) {
        listeners.set(event, ids.filter((id) => id !== Number(a?.handler)));
      }
      return null;
    }
    // The updater. `check()` turns whatever comes back here into an
    // `Update`, or into null when it is null — so a shot that asked for a
    // pending version gets the real banner, in its real place, rendered by
    // the real component.
    if (cmd === "plugin:updater|check") {
      if (shot.settings?.update !== "available") return null;
      return {
        rid: 1,
        currentVersion: "1.2.0",
        version: "1.2.1",
        date: null,
        body: "- A much smaller download, and the same band",
        rawJson: {},
      };
    }
    if (cmd.startsWith("plugin:")) return null;

    /*
     * The score the player is about to play, and the verdict on it.
     *
     * Four commands, and between them they are the whole review: the app
     * pushes a schedule, presses play, presses stop, and the forced segment
     * close reports a pass built from that very schedule. Nothing here
     * invents a note — the recipes are `reviewFixtures.ts`, the same ones the
     * unit tests use, so a green suite and a picture cannot disagree.
     */
    if (cmd === "load_score_schedule") {
      songSchedule = a?.schedule as ScoreSchedule;
      return null;
    }
    if (cmd === "clear_score_schedule") {
      return null;
    }
    if (cmd === "close_open_segment") {
      const script = scripted();
      if (script) {
        emit("practice-segment-ended", {
          startMs: 0,
          endMs: 30_000,
          score: script.pass.score,
          componentScores: {
            intervalConsistency: 0.8,
            gridAlignment: 0.8,
            hitCompleteness: 0.9,
            onsetEfficiency: 0.9,
          },
          bpm: 96,
          instrument: "electric-guitar",
          endReason: "userStopped",
          onsetCount: script.pass.results.length,
          beatCount: 32,
          totalOnsets: script.pass.results.length,
          spuriousOnsets: script.pass.extras.length,
          onsetEfficiency: 0.9,
          inferredDivisor: 2,
          inferredDivisorConfidence: 0.9,
          playMode: "structured",
          onsetResults: script.pass.results,
          extraOnsets: script.pass.extras,
        });
      }
      return null;
    }
    if (cmd === "score_timing_bands") {
      // `timing.rs`'s two formulas, drawn again here and ONLY here. The real
      // numbers come from Rust in the app; a screenshot harness cannot call
      // it, and a review with no bands would photograph as a coarser picture
      // than the one that ships.
      const schedule = a?.schedule as ScoreSchedule | undefined;
      const quarterMs = Number(a?.quarterMs) || 500;
      const beats = (schedule?.onsets ?? []).map((o) => o.beat);
      let gap = 1;
      for (let i = 1; i < beats.length; i++) {
        const d = beats[i] - beats[i - 1];
        if (d > 1e-6 && d < gap) gap = d;
      }
      const windowMs = Math.max(10, Math.min(80, quarterMs * gap * 0.4));
      const perfect = Math.max(8, windowMs * 0.2);
      const good = Math.max(perfect, windowMs * 0.5);
      return { windowMs, perfect, good, ok: Math.max(good, windowMs), smallestGapBeats: gap };
    }
    if (cmd === "analyze_attempt") {
      return scripted()?.findings ?? [];
    }
    if (cmd === "save_attempt" || cmd === "query_attempts") {
      return cmd === "query_attempts" ? [] : null;
    }

    if (cmd === "set_jam") {
      jamConfig = (a?.config as JamEngineConfig | null) ?? null;
      // The bar count restarts with the jam, the way the engine's form
      // counter does when a new table arrives.
      if (!jamConfig) {
        beatCount = 0;
        jamJumpTo = null;
        jamLoop = null;
        jamBarShift = 0;
        jamLastBar = null;
      }
      return null;
    }

    if (cmd === "set_jam_position") {
      const command = (a?.command ?? {}) as {
        jumpTo?: number | null;
        loop?: { start: number; end: number } | null;
      };
      jamJumpTo = typeof command.jumpTo === "number" ? command.jumpTo : null;
      jamLoop = command.loop ?? null;
      return null;
    }

    if (cmd === "set_beat_groups" && Array.isArray(a?.groups)) {
      STATE.beatGroups = a.groups as number[];
      emit("state-changed", STATE);
      return null;
    }

    if (cmd === "set_subdivision" && typeof a?.subdivision === "number") {
      STATE.subdivision = a.subdivision;
      emit("state-changed", STATE);
      return null;
    }

    if (cmd === "set_bpm" && typeof a?.bpm === "number") {
      STATE.bpm = a.bpm;
      emit("state-changed", STATE);
      return null;
    }

    return MAP[cmd]?.(a) ?? null;
  });

  // Already running for the shots that are of a running app, so the first
  // `get_state` the app makes already says so. Toggling it from the page
  // instead would mount the stopped layout and then change it, and a capture
  // can land between the two.
  if (shot.playing) {
    STATE.isPlaying = true;
    beatLoop();
  }
}
