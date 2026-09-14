/**
 * The arrangement: what the band does with a tune, chorus by chorus.
 *
 * The band looped. It did not play. One bar that repeats, a fill every N, and
 * that was the whole of the plan — which is why the first thing the owner said
 * about it was that nothing on the screen sounded like three people in a room
 * (plans/JAM_KILLER.md §0.1). Three people in a room do not play chorus five
 * the way they played chorus one: somebody holds back at the top, somebody
 * digs in when the tune comes round, the whole band drops to the kick and the
 * hats halfway through so the guitar can be heard, and at the end they stop
 * together.
 *
 * That plan is what this file is, and it is ONE PURE FUNCTION —
 * `bandMoment(jam, chorus, formBar)` — because it has to be the same answer
 * every time, on every bar, in the compiler and on the timeline. The timeline
 * draws the build coming before you hear it; the compiler plays it. If the two
 * could disagree, the picture would be a lie, and a picture of the form that
 * lies is worse than no picture at all.
 *
 * ## Three modes
 *
 * **Loop** is today, exactly: the bar repeats, the fills land where the Fills
 * control says, the intensity is the one on the record. Nothing this file does
 * reaches it — `bandMoment` returns the same moment on every bar, and
 * `compileJam` hands the engine the table it has always handed it. Every jam
 * anybody has ever saved reads as Loop, because the field is absent on their
 * records, so nothing anybody saved changes.
 *
 * **Build** is a band playing a tune with no end in sight: held back at the
 * top, opening up, a breakdown when the form has come round enough times, a
 * stop-time bar to lean on, round and round until you stop it.
 *
 * **Song** is Build with a last chorus and an ending.
 *
 * ## Why the dynamics move RELATIVE to the record
 *
 * The brief's table is written at Normal: chorus one soft, chorus two normal,
 * chorus three and after loud. Read as absolute that would make the Intensity
 * control dead in the default mode — you set the drummer to Soft for a ballad
 * and the arrangement shouts at you on chorus three anyway.
 *
 * So the ladder is a ladder of STEPS from wherever the record sits, clamped at
 * both ends. At Normal it is the brief's table exactly, which is what the
 * default jam plays. At Soft a ballad goes soft, soft, normal — it lifts
 * without ever shouting. At Loud a punk tune goes normal, loud, loud. One
 * rule, three musics, and the control you set still means something.
 *
 * ## The tables are the music
 *
 * Everything below that is a judgement about a STYLE is a table, written so a
 * drummer could read it and say whether it is right. There is no formula that
 * turns a groove into an arrangement; there is only what that music does.
 */
import { formBars, sectionStarts } from "./forms";
import { GROOVES } from "./grooves";
import type { Jam, JamIntensity } from "./types";

// ---------------------------------------------------------------------------
// What the band is doing on one bar
// ---------------------------------------------------------------------------

/**
 * One bar's worth of plan, for every instrument at once.
 *
 * Deliberately flat and deliberately small: this is the whole of what the
 * arrangement is allowed to say, and anything it cannot say here it does not
 * get to do. A moment is compared for equality (see `momentKey`) to decide
 * whether the engine has to be told anything at all, so every field in it has
 * to be a value, never an object.
 */
export type BandMoment = {
  /** How hard the whole band plays this bar. Replaces the record's in Build and Song. */
  intensity: JamIntensity;
  /**
   * `full` the groove; `hatsAndKick` the breakdown (snare, ride, crash and
   * toms out); `stopTime` the one hit on the downbeat and silence after;
   * `off` a drummer with their hands down.
   */
  drums: "full" | "hatsAndKick" | "stopTime" | "off";
  /** `sparse` is roots and fifths on the strong beats, held. */
  bass: "full" | "sparse" | "off";
  /** `sparse` is one voicing at the top of the bar and nothing else. */
  keys: "full" | "sparse" | "off";
  /** `small` is the fill's last beat; `big` is the whole fill, topped. */
  fill: "none" | "small" | "big";
  /** A crash on the downbeat of this bar. */
  crash: boolean;
  /** Song, and only on its very last bar: how the tune finishes. */
  ending?: "stop" | "hold";
};

// ---------------------------------------------------------------------------
// The arrangement on the record
// ---------------------------------------------------------------------------

export const JAM_ARRANGEMENT_MODES = ["loop", "build", "song"] as const;

/** How many choruses a Song may be. Two is the shortest thing worth an ending. */
export const JAM_MIN_CHORUSES = 2;
export const JAM_MAX_CHORUSES = 32;
export const JAM_DEFAULT_CHORUSES = 4;

/**
 * What the Breakdown control offers, as `breakdownEvery` values.
 *
 * 0 is Off. There is no 1: a breakdown every chorus is not a breakdown, it is
 * the arrangement, and a control that offers it would be offering a thing
 * nobody wants by the same name as a thing everybody does.
 */
export const JAM_BREAKDOWN_CHOICES: readonly number[] = [0, 2, 4, 8];
export const JAM_DEFAULT_BREAKDOWN_EVERY = 4;

/** The arrangement with every blank filled in — what every rule below reads. */
export type ResolvedArrangement = {
  mode: "loop" | "build" | "song";
  choruses: number;
  intro: "none" | "fill";
  breakdownEvery: number;
};

/**
 * The arrangement a record is actually asking for.
 *
 * **Absent reads as Loop.** That is the whole compatibility story of this
 * pass: a jam saved before the arrangement existed plays exactly what it
 * played, because the field it does not carry means "what you did before".
 * New jams are created carrying `{ mode: "build" }`, which is where the
 * default actually lives — on the record, not in this function. A default in
 * here would change what every saved jam plays the moment it was written.
 */
export function jamArrangement(jam: Pick<Jam, "arrangement">): ResolvedArrangement {
  const raw = jam.arrangement;
  const mode =
    raw?.mode === "build" || raw?.mode === "song" ? raw.mode : ("loop" as const);
  const choruses = Number.isFinite(raw?.choruses)
    ? Math.max(JAM_MIN_CHORUSES, Math.min(JAM_MAX_CHORUSES, Math.trunc(raw!.choruses!)))
    : JAM_DEFAULT_CHORUSES;
  const breakdownEvery = Number.isFinite(raw?.breakdownEvery)
    ? Math.max(0, Math.min(JAM_MAX_CHORUSES, Math.trunc(raw!.breakdownEvery!)))
    : JAM_DEFAULT_BREAKDOWN_EVERY;
  return {
    mode,
    choruses,
    intro: raw?.intro === "none" ? "none" : "fill",
    breakdownEvery,
  };
}

/*
 * A note on `intro`, which is ONE gesture in two halves, decided in two
 * places, because the two halves happen either side of bar one.
 *
 * The half that is here is the CRASH on bar one of chorus one: the band
 * arriving, the answer to a pickup. `bandMoment` can write it because it is a
 * bar of the form and a bar of the form is what this file is asked about.
 * Every chorus after the first is marked either way — coming round to the top
 * is a different event from starting.
 *
 * The half that is NOT here is the pickup itself, on the count-in's last beat.
 * That beat is before bar one exists, so `bandMoment` is never asked about it
 * and could not answer if it were: the count-in is played by the engine from
 * its own counter, and every one of those ticks used to go back to the click
 * whatever the table said. It reaches the engine as `pickup` on the config
 * instead — `compileJam` sets it from the `intro` this function resolves, and
 * the drummer plays the fill's last beat there (`src-tauri/src/jam.rs`,
 * `pickup_beat`).
 *
 * So: this file decides WHETHER there is an intro, and where the two halves
 * land is a fact about the engine rather than about the music.
 */

// ---------------------------------------------------------------------------
// The style: which music is this, and what does that music do
// ---------------------------------------------------------------------------

/**
 * The nine families the content pass files every groove under (A3).
 *
 * The same nine words, so that when `Groove.family` lands this file can read
 * it instead of the table below without a single rule changing.
 */
export type JamStyleFamily =
  | "rock"
  | "blues"
  | "funk"
  | "jazz"
  | "latin"
  | "pop"
  | "metal"
  | "country"
  | "world";

/**
 * What a family DOES with a tune. Three decisions, and they are the only
 * three where the style is the whole of the answer.
 *
 * - `bigChorus` — what happens on chorus three and after. `loud` is the band
 *   digging in. `open` is the other way a band lifts: it stays where it is and
 *   the cymbal opens up, which is what a jazz trio does when the second
 *   soloist stands up. A jazz group that got LOUDER on the third chorus would
 *   be a rock band playing changes.
 * - `stopTime` — does this music stop the band dead on the last bar of the
 *   form and leave the soloist out there. Blues and rock do; it is one of the
 *   oldest gestures either of them has. Nobody plays stop-time on a bossa.
 * - `ending` — `hold` is a downbeat with a crash under it, ringing. `stop` is
 *   the band hitting one and going silent, which is how funk and metal finish
 *   and why either sounds wrong ringing out.
 */
export type StylePlan = {
  bigChorus: "loud" | "open";
  stopTime: boolean;
  ending: "hold" | "stop";
};

export const FAMILY_PLAN: Record<JamStyleFamily, StylePlan> = {
  rock: { bigChorus: "loud", stopTime: true, ending: "hold" },
  blues: { bigChorus: "loud", stopTime: true, ending: "hold" },
  funk: { bigChorus: "loud", stopTime: false, ending: "stop" },
  metal: { bigChorus: "loud", stopTime: false, ending: "stop" },
  pop: { bigChorus: "loud", stopTime: false, ending: "hold" },
  country: { bigChorus: "loud", stopTime: false, ending: "hold" },
  world: { bigChorus: "loud", stopTime: false, ending: "hold" },
  jazz: { bigChorus: "open", stopTime: false, ending: "hold" },
  latin: { bigChorus: "open", stopTime: false, ending: "hold" },
};

/**
 * Which family each groove belongs to.
 *
 * A table and not a guess, written the same way `BASS_STYLE_FOR_GROOVE` is
 * written next door in `./bassline` and for the same reason: `src/jam/grooves.ts`
 * belongs to another worker, `Groove.family` is landing in the same pass as
 * this file, and a lookup that normalises the spelling can be written against
 * ids that have not settled yet. When `family` is on the groove, this table
 * becomes the fallback for a groove that has none.
 *
 * A groove with no id at all — one you drew in the editor — has no family to
 * look up, so a custom groove takes its jam's VIBE instead, and a jam with
 * neither is rock, which is what the default jam is.
 */
export const FAMILY_FOR_GROOVE: Record<string, JamStyleFamily> = {
  // The four you reach for first.
  rock8: "rock",
  rock16: "rock",
  halfTime: "rock",
  shuffle: "blues",
  // The three that carry their own meter, and the jazz one. A waltz in this
  // app is the country waltz the country vibe offers, not a Viennese one.
  waltz: "country",
  sixEight: "blues",
  bossa: "latin",
  swingRide: "jazz",
  // The five that came later. Boom bap is filed under funk because funk is
  // where its bass lives and where its backbeat comes from; the one-drop is
  // the only reggae in the list and `world` is where that list keeps it.
  funk: "funk",
  oneDrop: "world",
  train: "country",
  boomBap: "funk",
  fourOnFloor: "pop",
  // The seven the vibes brought. Hard rock and the stomp are rock — they take
  // rock's stop-time — and their ENDING is overridden below, because hard rock
  // stops dead where rock rings out.
  hardRock: "rock",
  stomp: "rock",
  doubleKick: "metal",
  twoStep: "country",
  samba: "latin",
  chaCha: "latin",
  secondLine: "funk",
  // The five the third pass added.
  ballad: "pop",
  slowBlues: "blues",
  jazzWaltz: "jazz",
  motown: "pop",
  mambo: "latin",
};

/** A jam whose groove has no id of its own falls back to the vibe it started from. */
export const FAMILY_FOR_VIBE: Record<string, JamStyleFamily> = {
  rock: "rock",
  hardRock: "rock",
  blues: "blues",
  funk: "funk",
  jazz: "jazz",
  latin: "latin",
  pop: "pop",
  metal: "metal",
  country: "country",
};

/**
 * The grooves whose own style differs from their family's.
 *
 * Three exceptions, each of them a thing a drummer would tell you:
 *
 * - **hardRock and stomp** end dead. A hard rock tune finishes on a hit, not
 *   on a ringing crash, and so does everything that borrows its stomp.
 * - **ballad** opens up rather than gets loud, and never plays stop-time. A
 *   ballad that shouted at you on the third chorus would not be a ballad, and
 *   the rock vibe, the jazz vibe and the pop vibe all offer one.
 * - **samba and mambo** dig in. Latin's default is to open up, because that is
 *   what a bossa does; a samba and a mambo are the two in that family that get
 *   hotter, and they get hotter fast.
 */
export const PLAN_FOR_GROOVE: Record<string, Partial<StylePlan>> = {
  hardRock: { ending: "stop" },
  stomp: { ending: "stop" },
  ballad: { bigChorus: "open", stopTime: false },
  samba: { bigChorus: "loud" },
  mambo: { bigChorus: "loud" },
};

/** The vibe's own exceptions, for a jam whose groove does not carry one. */
export const PLAN_FOR_VIBE: Record<string, Partial<StylePlan>> = {
  hardRock: { ending: "stop" },
};

/** Ids arrive spelled three ways across the app's history; this reads them all. */
function normalise(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function lookup<T>(table: Record<string, T>, id: string | undefined): T | undefined {
  if (!id) return undefined;
  const key = normalise(id);
  for (const [name, value] of Object.entries(table)) {
    if (normalise(name) === key) return value;
  }
  return undefined;
}

/**
 * Which music this jam is.
 *
 * The GROOVE first, because the groove is what is playing: a jam that started
 * from the Rock vibe and has had a bossa dropped on it is a bossa, and an
 * arrangement that went on treating it as rock would put stop-time on a
 * bossa's turnaround. The vibe is the fallback for a groove of your own, which
 * has no id and therefore no family.
 */
export function styleFamily(jam: Pick<Jam, "grooveId" | "customGroove" | "vibe">): JamStyleFamily {
  if (!jam.customGroove) {
    const byGroove = lookup(FAMILY_FOR_GROOVE, jam.grooveId);
    if (byGroove) return byGroove;
    // Then the groove's own shelf. The table above stays in front of it on
    // purpose: the picker's shelf answers "where would a player look for
    // this", and the arrangement's answer to "what does this music DO" is not
    // always the same word — a 6/8 is filed under folk in the picker and
    // arranged like a slow blues, because that is the shape of the bar. The
    // eighteen entries above are where the two disagree; everything else takes
    // the family it is filed under and needs no second table.
    const groove = GROOVES.find((g) => g.id === jam.grooveId);
    if (groove) return groove.family;
  }
  return lookup(FAMILY_FOR_VIBE, jam.vibe) ?? "rock";
}

/** The family's plan, with this groove's or this vibe's exceptions on top. */
export function stylePlan(jam: Pick<Jam, "grooveId" | "customGroove" | "vibe">): StylePlan {
  const base = FAMILY_PLAN[styleFamily(jam)];
  const override = jam.customGroove
    ? lookup(PLAN_FOR_VIBE, jam.vibe)
    : (lookup(PLAN_FOR_GROOVE, jam.grooveId) ?? lookup(PLAN_FOR_VIBE, jam.vibe));
  return override ? { ...base, ...override } : base;
}

// ---------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------

const INTENSITY_LADDER: readonly JamIntensity[] = ["soft", "normal", "loud"];

/** `steps` rungs up or down from here, clamped. Soft cannot go softer. */
export function shiftIntensity(base: JamIntensity, steps: number): JamIntensity {
  const at = INTENSITY_LADDER.indexOf(base);
  const from = at < 0 ? 1 : at;
  return INTENSITY_LADDER[Math.max(0, Math.min(INTENSITY_LADDER.length - 1, from + steps))];
}

/**
 * How far from the record's own intensity chorus `chorus` sits.
 *
 * −1 at the top of the tune, level on the second time round, and then either
 * a rung up or level again depending on how this music lifts. Choruses past
 * the third do not keep climbing: a band that got louder every chorus for
 * nine minutes would be a joke, and there is nowhere above Loud to go anyway.
 */
function chorusStep(chorus: number, plan: StylePlan): number {
  if (chorus <= 1) return -1;
  if (chorus === 2) return 0;
  return plan.bigChorus === "loud" ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Where the seams are
// ---------------------------------------------------------------------------

/** The 0-based bars a section begins on, as a set the rules below can ask. */
function sectionTops(jam: Pick<Jam, "form">): Set<number> {
  return new Set(sectionStarts(jam.form));
}

/**
 * Is this the last bar of a section that is not the last section?
 *
 * A fill at a seam is a fill INTO the next section, so the bar that carries it
 * is the one before the seam. The chorus's own last bar is excluded here
 * because it has a bigger fill of its own — you do not play the same gesture
 * into bar five of a blues and into the top of the next chorus.
 */
function isSeam(jam: Pick<Jam, "form">, formBar: number, bars: number): boolean {
  if (formBar === bars - 1) return false;
  return sectionTops(jam).has(formBar + 1);
}

// ---------------------------------------------------------------------------
// The moment
// ---------------------------------------------------------------------------

/**
 * What the band does on bar `formBar` of chorus `chorus`.
 *
 * `chorus` is 1-based, straight off `BeatEvent.chorus`; `formBar` is 0-based
 * within the chorus. Pure, total, and defined for every pair — a number out of
 * range is folded back in rather than thrown at, because the one caller that
 * can hand this a strange bar is a beat event from a build that has not filled
 * it in, and a jam that stops playing because of that is a worse bug than a
 * bar counted from the wrong end.
 *
 * ## The tables, in words
 *
 * **Loop.** Every bar the same: the record's intensity, everybody full, no
 * fill and no crash of this file's doing. The engine's own `fillEvery` and
 * `crashOnOne` are left switched on and do exactly what they did before.
 *
 * **Build.**
 *
 * | | chorus 1 | chorus 2 | chorus 3+ |
 * |---|---|---|---|
 * | intensity | a rung down | the record's | a rung up, or level where the style opens up |
 * | bass | sparse | full | full |
 * | keys | sparse | full | full |
 *
 * On top of the ladder, three events:
 *
 * - **the crash on the one**, at the top of every chorus — and on chorus one
 *   only when the intro is a pickup, because a band told not to play one does
 *   not crash into a bar nobody counted them into;
 * - **stop-time** on the chorus's last bar, every second chorus, in the musics
 *   that play it, and never in a chorus that already has a breakdown in it;
 * - **the breakdown**, every `breakdownEvery` choruses: the first half of the
 *   chorus is the kick and the hats with the bass walking over them and the
 *   keys out, a rung quieter still; a big fill on the last bar of that half;
 *   everything back at the halfway bar with a crash on it.
 *
 * And the fills: `small` at every section seam, `big` into the top of the next
 * chorus, `big` out of a breakdown. None of them where the Fills switch is
 * off — that switch is the player saying "no fills", and an arrangement that
 * played them anyway would be the app overruling a control it drew.
 *
 * **Song.** Build, for `choruses` choruses, and then the last bar of the last
 * chorus is the ending: one downbeat, the bass and the keys on it, silence
 * after, a crash under it where the style rings out and none where it stops
 * dead. The bar before it gets a big fill, whatever the seams say.
 */
export function bandMoment(
  jam: Pick<Jam, "form" | "intensity" | "fills" | "arrangement" | "grooveId" | "customGroove" | "vibe">,
  chorus: number,
  formBar: number,
): BandMoment {
  const arrangement = jamArrangement(jam);
  const bars = formBars(jam.form);
  const bar = ((Math.trunc(formBar) % bars) + bars) % bars;
  const at = Math.max(1, Math.trunc(Number.isFinite(chorus) ? chorus : 1));

  if (arrangement.mode === "loop") {
    return {
      intensity: jam.intensity,
      drums: "full",
      bass: "full",
      keys: "full",
      fill: "none",
      crash: false,
    };
  }

  const plan = stylePlan(jam);
  // Past the end of a song the tune is over; the last chorus is the honest
  // answer to "what is the band playing", and it is what the timeline draws
  // if a beat event ever arrives late.
  const chorusAt = arrangement.mode === "song" ? Math.min(at, arrangement.choruses) : at;
  const intensity = shiftIntensity(jam.intensity, chorusStep(chorusAt, plan));
  const fillsOn = jam.fills !== false;
  const last = bars - 1;

  /** A crash the Fills switch has not vetoed. */
  const crashing = (on: boolean) => on && fillsOn;
  /** A fill the Fills switch has not vetoed. */
  const filling = (size: "none" | "small" | "big") => (fillsOn ? size : "none");

  // The ending. The last bar of the last chorus of a Song, and nothing else in
  // the whole file reaches it: one downbeat, and the engine stops after it.
  if (arrangement.mode === "song" && chorusAt >= arrangement.choruses && bar === last) {
    return {
      intensity,
      drums: "stopTime",
      bass: "full",
      keys: "full",
      fill: "none",
      // The crash is the difference between the two endings and is not the
      // Fills switch's to veto: a tune has to finish whether or not the
      // drummer was playing fills on the way round.
      crash: plan.ending === "hold",
      ending: plan.ending,
    };
  }
  // The bar before the ending is the run-up to it, and it gets the big one
  // wherever it falls — a seam's small fill into the end of the tune would be
  // the band not knowing the tune was ending.
  const beforeEnding =
    arrangement.mode === "song" && chorusAt >= arrangement.choruses && bar === last - 1;

  const breakdown =
    arrangement.breakdownEvery > 0 && chorusAt > 1 && chorusAt % arrangement.breakdownEvery === 0;
  // The halfway bar, which is where a breakdown hands the band back. A form of
  // one bar has no halves, so `half` is never 0 and a one-bar form simply
  // never breaks down — which is right: there is nothing to break down from.
  const half = Math.max(1, Math.floor(bars / 2));
  const topOfChorus = bar === 0 && !(chorusAt === 1 && arrangement.intro === "none");

  if (breakdown && bars > 1) {
    if (bar < half) {
      return {
        // A rung below the chorus it sits in. A breakdown is the band getting
        // out of the way, and a loud breakdown is a contradiction.
        intensity: shiftIntensity(intensity, -1),
        drums: "hatsAndKick",
        bass: "full",
        keys: "off",
        fill: filling(bar === half - 1 ? "big" : isSeam(jam, bar, bars) ? "small" : "none"),
        crash: crashing(topOfChorus),
      };
    }
    return {
      intensity,
      drums: "full",
      bass: "full",
      keys: "full",
      fill: filling(
        beforeEnding || bar === last ? "big" : isSeam(jam, bar, bars) ? "small" : "none",
      ),
      // The band coming back is the loudest gesture in the chorus and it is
      // marked as one, Fills switch or not: this crash is not decoration, it
      // is how you know the breakdown is over.
      crash: bar === half || crashing(topOfChorus),
    };
  }

  // Stop-time: the last bar of the form, every second chorus, where the music
  // plays it. Never on chorus one — you cannot leave a soloist out there
  // before the tune has been round once — and never in a breakdown chorus,
  // which has already had its event.
  //
  // And never on a form shorter than a phrase. Stop-time is one bar out of
  // twelve; one bar out of two is not a gesture, it is half the tune missing.
  if (plan.stopTime && bars >= 4 && bar === last && chorusAt > 1 && chorusAt % 2 === 0) {
    return {
      intensity,
      drums: "stopTime",
      bass: "full",
      keys: "full",
      fill: "none",
      crash: false,
    };
  }

  const holdingBack = chorusAt === 1;
  return {
    intensity,
    drums: "full",
    bass: holdingBack ? "sparse" : "full",
    keys: holdingBack ? "sparse" : "full",
    fill: filling(
      beforeEnding || bar === last ? "big" : isSeam(jam, bar, bars) ? "small" : "none",
    ),
    crash:
      crashing(topOfChorus) ||
      // The other way a band lifts. On the third chorus and after, a style
      // that opens up rather than digging in marks the top of every section
      // instead — the cymbal doing the work the volume does elsewhere.
      crashing(plan.bigChorus === "open" && chorusAt >= 3 && sectionTops(jam).has(bar)),
  };
}

/**
 * The bar before this one, as (chorus, bar), or null at the very top.
 *
 * Null at chorus one bar zero on purpose: the first bar of a take is not a
 * CHANGE, it is the start, and treating it as a change is what would make a
 * load hand the engine a table marked "wait for the next bar line" when the
 * bar line it is waiting for is the one it is being loaded for.
 */
export function previousBar(
  jam: Pick<Jam, "form">,
  chorus: number,
  formBar: number,
): { chorus: number; formBar: number } | null {
  const bars = formBars(jam.form);
  const bar = ((Math.trunc(formBar) % bars) + bars) % bars;
  const at = Math.max(1, Math.trunc(Number.isFinite(chorus) ? chorus : 1));
  if (bar > 0) return { chorus: at, formBar: bar - 1 };
  if (at <= 1) return null;
  return { chorus: at - 1, formBar: bars - 1 };
}

/** One moment as one comparable string — for equality, and for a send's dedupe. */
export function momentKey(moment: BandMoment): string {
  return [
    moment.intensity,
    moment.drums,
    moment.bass,
    moment.keys,
    moment.fill,
    moment.crash ? "crash" : "-",
    moment.ending ?? "-",
  ].join("|");
}

/** Do these two bars ask the band for the same thing? */
export function sameMoment(a: BandMoment, b: BandMoment): boolean {
  return momentKey(a) === momentKey(b);
}

/**
 * Every bar of one chorus, in order — what the timeline draws its marks from.
 *
 * The same function the compiler calls, per bar, so the mark under bar nine
 * and the table bar nine plays cannot say different things.
 */
export function momentsForChorus(
  jam: Pick<Jam, "form" | "intensity" | "fills" | "arrangement" | "grooveId" | "customGroove" | "vibe">,
  chorus: number,
): BandMoment[] {
  const bars = formBars(jam.form);
  return Array.from({ length: bars }, (_, bar) => bandMoment(jam, chorus, bar));
}

/**
 * Is this chorus a breakdown chorus? For the one sentence the setup sheet says
 * about the mode, and for a timeline that wants to hatch the right half.
 */
export function isBreakdownChorus(jam: Pick<Jam, "arrangement">, chorus: number): boolean {
  const arrangement = jamArrangement(jam);
  if (arrangement.mode === "loop" || arrangement.breakdownEvery <= 0) return false;
  const at = Math.max(1, Math.trunc(chorus));
  return at > 1 && at % arrangement.breakdownEvery === 0;
}
