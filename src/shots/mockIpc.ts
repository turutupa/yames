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
import type { ScoreSchedule, SongTransport } from "../songs/types";

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

/**
 * W21 — the take the camera scene records, and the sound it plays back.
 *
 * One second of silence as a WAV, base64'd into a data URL: the review plays
 * the take's MIX in an `<audio>` element and reads the clock off it, so a
 * scene with no audio is a scene whose tape never moves. Built rather than
 * checked in because forty-four bytes of header and a run of zeros is shorter
 * to write than to explain.
 */
const SILENT_WAV = (() => {
  const rate = 8000;
  const samples = rate;
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples * 2, true);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
})();

const SHOT_TAKE_ID = "w21";
const SHOT_TAKE_JAM = "shot-song";

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
function baseStore(
  theme: string,
  tab: string,
  zenStyle?: string,
  starter?: boolean,
): Map<string, unknown> {
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
  // W19 — the starter shelf is already seeded, so the seven pieces Yames
  // ships with do not appear in the library. Every Songs scene but
  // `songs-starter` wants that: seven extra rows would change which song row
  // 0 is and quietly re-point every songs shot at a different piece. The one
  // scene that IS about the shelf leaves this key unset, and the seeding runs
  // for real — through the real importer, like everything else here.
  if (!starter) store.set("songsStarterShelf", { seeded: true, ids: [] });
  return store;
}

/** Install the mock. Call once, before React mounts. */
export function installShotMock(shot: Shot, theme: string): void {
  const w = window as unknown as Record<string, unknown>;
  if (w.__TAURI_INTERNALS__) return;

  /** W21 — the bytes `MediaRecorder` handed over during the camera scene. */
  const cameraChunks: ArrayBuffer[] = [];
  const cameraMime = "video/webm";
  /**
   * The id the take was STARTED with.
   *
   * Echoed back by `stop_take`, because that is what the real engine does and
   * because `useSongTakes` drops a take whose `jamId` is not the song on the
   * stage — a run at one piece filed under another. A fixed id here meant the
   * shelf, and therefore the review's picture, silently went nowhere.
   */
  let cameraTakeFor = SHOT_TAKE_JAM;

  const STATE = baseState(theme) as Record<string, unknown>;
  if (shot.ramp) Object.assign(STATE.speedRamp as object, shot.ramp);
  const store = baseStore(theme, shot.tab ?? "beat", shot.zenStyle, shot.starterShelf);

  /** The song library, the way the practice store holds it. */
  const SCORES = new Map<string, SongRecord>();
  // The starter-shelf scene starts with an EMPTY store, so what the pictures
  // and the layout suite see is the seven pieces the app really ships with,
  // seeded by the real code through the real importer — not this fixture
  // beside them.
  if (shot.tab === "songs" && !shot.starterShelf) {
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

  /**
   * The song the "engine" is carrying, as `load_song` was given it.
   *
   * Kept for one reason, and it is the bug this harness was hiding: the beat
   * event the mock sent carried the jam's fields and none of the song's, so
   * `songTick` arrived `undefined`, `songPosition` fell back to the start of
   * the range, and the tab's cursor sat on tick zero for the whole of every
   * playing scene. A capture of the stage then showed a transport counting
   * bars four over a page with the cursor still on bar one — which read as
   * "the cursor is not drawn" and was really "the harness never moved it".
   *
   * A mock that answers a command has to send what the command's engine
   * sends. `engine.rs` walks the song's own tick table and reports
   * `songBar`, `songTick`, `songPass` and `songCountIn` on every tick; the
   * transport it was handed carries every number needed to do the same, so
   * that is what happens below.
   */
  let songTransport: SongTransport | null = null;

  /** Which onsets of the pushed schedule have already been reported. */
  let onsetsSaid = 0;

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

  /**
   * Where a song is on this tick, the way `engine.rs` reports it.
   *
   * The contract is `BeatEvent`'s four song fields and `src/songs/position.ts`
   * is what reads them, so this walks the transport it was handed rather than
   * inventing an axis: the range's bars in order, in the score's own ticks,
   * wrapping when the range repeats. A count-in is whole bars of the range's
   * first meter and reports `songBar: null` — a count-in is not a bar of the
   * piece, and a cursor that walked through one would be pointing at notes
   * nobody has been asked to play yet.
   */
  function songAt(beat: number) {
    const rest = { songBar: null as number | null, songTick: 0, songPass: 0, songCountIn: false };
    const transport = songTransport;
    if (!transport) return rest;
    const bars = transport.bars.slice(transport.range.startBar, transport.range.endBar + 1);
    const first = bars[0];
    if (!first) return rest;

    // One click per beat of the bar's own meter: a 6/8 counts eighths, and
    // `ticksPerQuarter` is about quarters, so the denominator does the work.
    const tpq = transport.ticksPerQuarter;
    const beatTicks = (tpq * 4) / (first.denominator || 4);
    const countInBeats = (transport.countInBars || 0) * (first.numerator || 4);
    if (beat < countInBeats) return { ...rest, songCountIn: true };

    const span = bars.reduce((sum, bar) => sum + bar.lengthTicks, 0);
    if (span <= 0) return rest;
    const walked = (beat - countInBeats) * beatTicks;
    // Off the end with no repeat is the range's last tick, which is where a
    // song that has finished leaves the cursor.
    const into = transport.loops ? walked % span : Math.min(walked, span - 1);

    let bar = transport.range.startBar;
    let seen = 0;
    for (let i = 0; i < bars.length; i++) {
      bar = transport.range.startBar + i;
      if (into < seen + bars[i].lengthTicks) break;
      seen += bars[i].lengthTicks;
    }
    return {
      songBar: bar,
      songTick: first.startTick + into,
      songPass: transport.loops ? Math.floor(walked / span) : 0,
      songCountIn: false,
    };
  }

  /**
   * And the verdicts on the notes that have gone by (`SONGS.md` A7).
   *
   * One `score-onset` per expected note as the cursor passes it, which is
   * what the analyzer emits when a schedule is loaded. Without these the
   * stage photographs with nothing lit, so the one check nobody could make
   * was whether a lit note is visible at all.
   *
   * The verdicts are a fixed cycle rather than anything random: a screenshot
   * has to come out the same way twice, and a cycle gives the picture the
   * whole mark language — on time, a little either side, and one that got
   * away — instead of a page of green.
   */
  const ONSET_DEVIATIONS: (number | null)[] = [-3, 8, 2, -22, 5, null, -9, 30];
  function sayOnsets(beatInRange: number, pass: number) {
    const schedule = songSchedule;
    if (!schedule) return;
    while (onsetsSaid < schedule.onsets.length) {
      const onset = schedule.onsets[onsetsSaid];
      if (onset.beat > beatInRange) return;
      const deviationMs = ONSET_DEVIATIONS[onsetsSaid % ONSET_DEVIATIONS.length];
      emit("score-onset", {
        id: onset.id,
        pass,
        state: deviationMs === null ? "miss" : "hit",
        deviationMs,
      });
      onsetsSaid += 1;
    }
  }

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

    const song = songAt(beatCount);

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
      ...song,
    });
    if (!song.songCountIn && songTransport) {
      const tpq = songTransport.ticksPerQuarter;
      const start = songTransport.bars[songTransport.range.startBar]?.startTick ?? 0;
      sayOnsets((song.songTick - start) / tpq, song.songPass);
    }
    beatCount += 1;
    beatTimer = setTimeout(beatLoop, 60000 / (STATE.bpm as number));
  }

  function setPlaying(next: boolean) {
    STATE.isPlaying = next;
    beatCount = 0;
    // A new pass has said nothing about any note yet.
    onsetsSaid = 0;
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
    // W19 — the library is "recently played" now. The shots open exactly one
    // song, so there is no order for this to change; it exists so the call
    // the session makes on every open resolves rather than returning the
    // harness's blanket `null`.
    mark_score_opened: () => null,
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
    /*
     * W21 — a take with a real picture on it, made by the harness's own fake
     * camera.
     *
     * The real engine writes a WAV and hands back a record; here the take is
     * a second of silence as a data URL, which every webview will play, and
     * `startOffsetMs` is a plausible small negative — the file starts a moment
     * after beat 0, which is what recording on the first beat produces. The
     * PICTURE is not faked at all: Chromium's `--use-fake-device-for-media-
     * stream` gives the page a synthetic camera, `MediaRecorder` encodes it
     * for real, and the chunks that arrive at `take_video_append` below are
     * the bytes it produced. So the layout suite measures the shipping review
     * playing a real video element, which is the only version of this scene
     * worth having.
     */
    start_take: (a) => {
      cameraChunks.length = 0;
      if (typeof a?.jamId === "string") cameraTakeFor = a.jamId;
      return null;
    },
    stop_take: () => ({
      id: SHOT_TAKE_ID,
      jamId: cameraTakeFor,
      createdAt: Date.now(),
      durationSec: 3,
      path: SILENT_WAV,
      position: { mode: "song", bar: 0, tick: 0, pass: 0, startOffsetMs: -40 },
    }),
    take_video_begin: () => {
      cameraChunks.length = 0;
      return null;
    },
    /*
     * The chunk arrives as the invoke's BODY rather than as named arguments —
     * `ipc.ts` sends a `Uint8Array` so a third of a megabyte of video crosses
     * as a third of a megabyte — so what lands here is the bytes themselves.
     * `mockIPC` carries no headers, so the chunk's own number is not
     * available; order of call is order of chunk, which is what the pipe
     * guarantees anyway.
     */
    take_video_append: (a) => {
      const bytes = a as unknown as Uint8Array | ArrayBuffer | undefined;
      if (bytes instanceof Uint8Array) cameraChunks.push(bytes.slice().buffer);
      else if (bytes instanceof ArrayBuffer) cameraChunks.push(bytes);
      return cameraChunks.reduce((n, c) => n + c.byteLength, 0);
    },
    take_video_finish: () => {
      const blob = new Blob(cameraChunks as BlobPart[], { type: cameraMime });
      // A blob URL rather than a path: the harness is an ordinary browser with
      // no asset protocol behind it, and `songs/camera/src.ts` hands anything
      // that is already a URL straight to the element.
      return { path: URL.createObjectURL(blob), bytes: blob.size, offsetMs: 120 };
    },
    take_video_discard: () => null,
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
    load_song: (a) => {
      songTransport = (a?.transport as SongTransport | undefined) ?? null;
      return { bars: 8, passMs: 20_000, playedNotes: 96, droppedNotes: 0 };
    },
    /*
     * A new range starts the piece again from the top of it, so the beat
     * count the cursor is derived from starts again too — the way the
     * engine recompiles and restarts (W9).
     */
    set_song_range: (a) => {
      if (songTransport) {
        songTransport = {
          ...songTransport,
          range: (a?.range as SongTransport["range"]) ?? songTransport.range,
          loops: a?.loops === true,
          tempoPercent: Number(a?.tempoPercent) || songTransport.tempoPercent,
          countInBars: Number(a?.countInBars) || 0,
        };
      }
      beatCount = 0;
      onsetsSaid = 0;
      return { bars: 8, passMs: 20_000, playedNotes: 96, droppedNotes: 0 };
    },
    clear_song: () => {
      songTransport = null;
      return null;
    },
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
      onsetsSaid = 0;
      return null;
    }
    if (cmd === "clear_score_schedule") {
      // The schedule itself is kept: `analyze_attempt` is asked for a pass
      // over it after the transport has already cleared it, and a review
      // scene with nothing to score photographs as a coach with nothing to
      // say. Only the "which notes have been reported" counter resets.
      onsetsSaid = 0;
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

    /*
     * A download that has just finished (W19, `SONGS.md` S0.9).
     *
     * The app starts the watch on its way into Songs; this answers that a
     * file arrived, the way the Rust watcher does. Nothing is faked past the
     * IPC boundary — the banner in the picture is `DownloadOffer.tsx`
     * drawing what `useDownloadWatch` made of the event.
     */
    if (cmd === "start_download_watch") {
      if (shot.downloadOffer) {
        setTimeout(
          () =>
            emit("songs-download-offer", {
              path: "C:\\Users\\you\\Downloads\\Blackbird (fingerstyle).gp5",
              fileName: "Blackbird (fingerstyle).gp5",
              sizeBytes: 41_233,
              modifiedMs: Date.now(),
            }),
          0,
        );
      }
      return "C:\\Users\\you\\Downloads";
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
