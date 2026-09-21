import { useEffect, useMemo, useRef, useState } from "react";
import { warmJam } from "../../ipc";
import { useJamLoading } from "../../hooks/useJamLoading";
import { useTranslation } from "react-i18next";
import { GROOVE_FAMILIES, grooveById, groovesInFamily } from "../../jam/grooves";
import type { Groove, GrooveFamily } from "../../jam/grooves";
import { JAM_FORM_KINDS, clampFormBars, formBars } from "../../jam/forms";
import {
  JAM_ARRANGEMENT_MODES,
  JAM_BREAKDOWN_CHOICES,
  JAM_MAX_CHORUSES,
  JAM_MIN_CHORUSES,
  jamArrangement,
} from "../../jam/arrangement";
import {
  carryCountIn,
  countInChoiceId,
  countInChoices,
  parseCountInChoice,
} from "../../jam/jams";
import {
  jamBand,
  jamFamily,
  jamGroove,
  jamGrooveFitsMeter,
  jamKey,
  jamMix,
  jamWrittenGroove,
} from "../../jam/compile";
import { JAM_BASS_BUSY, JAM_BASS_STYLES, autoBassFigure } from "../../jam/bassFigures";
import { JAM_KEYS_STYLES_ALL, autoKeysStyle } from "../../jam/keysFigures";
import { changesFor, defaultChangesFor } from "../../jam/changes";
import type { ChangesBar } from "../../jam/changes";
import { SHARP_NAMES, TRANSPOSITION_OPTIONS, keyName, noteName } from "../../jam/harmony";
import { chartEdit, parseChordChart } from "../../jam/chart";
import { progressionEdit } from "../../jam/progression";
import { METER_PRESETS } from "../../constants/metronome";
import { meterKey } from "../../utils/meter";
import type { VibePatch } from "../../jam/vibesContract";
import type { KeyMode, TranspositionOption } from "../../jam/harmony";
import type {
  Jam,
  JamArrangement,
  JamBassVoice,
  JamCountInSound,
  JamFeel,
  JamFormKind,
  JamIntensity,
  JamKeysVoice,
} from "../../jam/types";
import { JAM_MAX_FORM_BARS } from "../../jam/types";
import type { JamTakesState } from "../main-window/hooks/useJamTakes";
import { GrooveGlyph } from "./GrooveGlyph";
import { JamSheetGroup } from "./JamSheet";
import { JamSelect } from "./JamSelect";
import { KitPicker } from "./KitPicker";
import { Segmented } from "./Segmented";
import { TakesSection } from "./TakesSection";
import { TakeSoundControl } from "../../takes/TakeSoundControl";
import { VibePicker } from "./VibePicker";
import type { VibePreviewMark } from "./VibePicker";

const FEELS: JamFeel[] = ["straight", "shuffle", "swing"];
const INTENSITIES: JamIntensity[] = ["soft", "normal", "loud"];
const KEY_MODES: KeyMode[] = ["major", "minor", "blues"];
const BASS_VOICES: JamBassVoice[] = ["fingered", "picked", "upright", "slap", "synth"];
const KEYS_VOICES: JamKeysVoice[] = ["epiano", "organ", "clav", "pad"];

/**
 * The Fills control, as the four things a player would say out loud.
 *
 * Two fields on the record — `fills` and `fillEvery` — because the engine
 * needs them apart; one control on screen, because "off, or every eight bars"
 * is one decision.
 */
export const FILL_CHOICES = ["off", "chorus", "every4", "every8"] as const;
export type FillChoice = (typeof FILL_CHOICES)[number];

/** Which of the four a record is showing. */
export function fillsChoiceOf(jam: Pick<Jam, "fills" | "fillEvery">): FillChoice {
  if (!jam.fills) return "off";
  const every = Math.trunc(jam.fillEvery ?? 0);
  if (every === 4) return "every4";
  if (every === 8) return "every8";
  return "chorus";
}

/** What picking one writes back. */
export function fillsEditFor(choice: FillChoice): { fills: boolean; fillEvery: number } {
  switch (choice) {
    case "off":
      // `fillEvery` is zeroed rather than left where it was: a record that
      // says "no fills, every four bars" is a record two readers can disagree
      // about, and one of them is the engine.
      return { fills: false, fillEvery: 0 };
    case "every4":
      return { fills: true, fillEvery: 4 };
    case "every8":
      return { fills: true, fillEvery: 8 };
    case "chorus":
      return { fills: true, fillEvery: 0 };
  }
}

/**
 * A progression's numerals, the way a player reads them off a chart: the
 * chords in order with repeats folded, "I · V · vi · IV". A bar that moves in
 * its middle is written "ii–V".
 */
export function numeralsOf(bars: readonly ChangesBar[]): string {
  const words: string[] = [];
  for (const bar of bars) {
    const word = typeof bar === "string" ? bar : `${bar[0]}–${bar[1]}`;
    const shown = word.replace("@tonic", "I");
    if (words[words.length - 1] !== shown) words.push(shown);
  }
  // A loop that comes round twice says so once.
  const half = words.length / 2;
  if (Number.isInteger(half) && words.slice(0, half).join() === words.slice(half).join()) {
    words.length = half;
  }
  return words.length > 8 ? `${words.slice(0, 8).join(" · ")} …` : words.join(" · ");
}

/**
 * Whose part is written in another key.
 *
 * A guitar, a bass and a piano all read concert pitch, so the control that
 * asks which one you read is a control those three players will never touch
 * (JAM_UX_DECISIONS A4). It shows for everybody else — the horns, where it is
 * the whole reason the feature exists.
 */
export function transpositionApplies(instrument: string): boolean {
  return !["electric-guitar", "acoustic-guitar", "bass", "piano"].includes(instrument);
}

interface JamSetupSheetProps {
  jam: Jam;
  jams: readonly Jam[];
  onEdit: (patch: Partial<Omit<Jam, "id" | "createdAt">>) => void;
  onLoadJam: (jam: Jam) => void;
  /** What you play — the transposition row shows only where it applies. */
  instrument: string;
  /** The band when the record has not been asked. */
  lineup: { drums: boolean; bass: boolean };
  /** Two bars of the current groove on a kit, through the engine (B7). */
  onPreviewKit: (kit: string) => void;
  previewingKit: string | null;
  /** Two bars of a whole vibe, through the same door (JAM_KILLER A4). */
  onPreviewVibe?: ((vibeId: string, variationId?: string) => void) | null;
  onStopPreview?: (() => void) | null;
  previewingVibe?: VibePreviewMark | null;
  /** True while the engine is refusing a folder of your own samples (B3). */
  customKitRefused?: boolean;
  /** The groove editor's door, which lives on this sheet now. */
  onOpenEditor: () => void;
  /** "Edit changes" — the sheet turns the mode on and the timeline behind it obeys. */
  editingChords: boolean;
  onEditingChords: (on: boolean) => void;
  takes: JamTakesState;
  onToggleTakes: (next: boolean) => void;
}

/**
 * "started from the Hard rock vibe", or nothing when no vibe was picked.
 *
 * Out here because the header belongs to the docked frame now, and the frame
 * is shared with the chord sheet (A11): one `<aside>`, whose title changes
 * when you switch between the two rather than sliding away and back.
 */
export function setupSheetSubtitle(
  jam: Pick<Jam, "vibe">,
  t: (k: string, o?: Record<string, unknown>) => string,
): string | undefined {
  if (!jam.vibe) return undefined;
  return t("jam.vibe.startedFrom", {
    vibe: t(`jam.vibe.${jam.vibe}`, { defaultValue: jam.vibe }),
  });
}

/**
 * Everything you set once, behind one button (JAM_UX_DECISIONS A1, A3).
 *
 * The screen used to be one page of twenty-three blocks, with the things you
 * choose once an hour drawn at the same weight and in the same scroll as the
 * chord you are reading right now. The owner's first word for it was
 * "overwhelming". So the page split in two: a playing screen of five blocks,
 * and this — vibe, the drummer, the form, the band, and a MORE nobody has to
 * open.
 *
 * The ORDER is the argument. A vibe first, because one tap should get you a
 * rock drummer; then the drummer, because that is what you came to change;
 * then the form and the band; then, collapsed, the three things that are true
 * of maybe one jam in twenty.
 */
/** The context bar's speaker, at the size this heading reads at. */
function SpeakerGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path d="M17 9.5a3.5 3.5 0 0 1 0 5" />
    </svg>
  );
}

export function JamSetupSheet({
  jam,
  jams,
  onEdit,
  onLoadJam,
  instrument,
  lineup,
  onPreviewKit,
  previewingKit,
  onPreviewVibe = null,
  onStopPreview = null,
  previewingVibe = null,
  customKitRefused = false,
  onOpenEditor,
  editingChords,
  onEditingChords,
  takes,
  onToggleTakes,
}: JamSetupSheetProps) {
  const { t } = useTranslation();
  /** Which roles' voices this sheet has already asked to be built. Once each. */
  const warmedRef = useRef({ bass: false, keys: false });
  /**
   * The sound control touched last, so the spinner shows on the one you
   * changed rather than on all three. Forgotten once the band has loaded —
   * or a moment later if it never had to (the sound was already decoded).
   */
  const [changed, setChanged] = useState<"kit" | "bass" | "keys" | null>(null);
  const loading = useJamLoading();
  useEffect(() => {
    if (!changed || loading) return;
    const timer = setTimeout(() => setChanged(null), 400);
    return () => clearTimeout(timer);
  }, [changed, loading]);
  const spinning = (which: "kit" | "bass" | "keys") => loading && changed === which;
  const warmVoices = (role: "bass" | "keys") => {
    if (warmedRef.current[role]) return;
    warmedRef.current[role] = true;
    warmJam(role === "bass" ? { bassVoices: true } : { keysVoices: true });
  };
  /** The breakdown disclosure inside the FORM group, closed until asked for. */
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  /** The arrangement with its blanks filled in — what the controls below show. */
  const arrangement = jamArrangement(jam);

  const meter = useMemo(() => jamGroove(jam), [jam]);
  const written = jamWrittenGroove(jam);
  const grooveFits = jamGrooveFitsMeter(jam);
  const bars = formBars(jam.form);
  const band = jamBand(jam, lineup);
  const mix = jamMix(jam);
  const key = jamKey(jam);

  /** The on/off switch a player's section wears on its heading. */
  /** The pair every player's heading carries: how loud, and whether at all. */
  const playerMix = (id: "drums" | "bass" | "keys" | "perc") => (
    <>
      {playerVolume(id)}
      {playerSwitch(id)}
    </>
  );

  const playerSwitch = (id: "drums" | "bass" | "keys" | "perc") => {
    const on = !!band[id];
    return (
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={t(`jam.band.${id}`)}
        className={`transport-switch jam-switch ${on ? "on" : ""}`}
        onPointerEnter={id === "bass" || id === "keys" ? () => warmVoices(id) : undefined}
        onClick={() => {
          // Hiring a bass or keys player loads their instrument.
          if (!on && (id === "bass" || id === "keys")) setChanged(id);
          onEdit({
            band: {
              drums: band.drums,
              bass: band.bass,
              keys: !!band.keys,
              perc: !!band.perc,
              [id]: !on,
            },
          });
        }}
      >
        <span className="transport-switch-track" aria-hidden="true" />
        {/* "Playing" and "out" are different lengths, and the switch sits at
            the end of a heading that is pushed right — so every flip dragged
            the volume slider and the switch sideways. The owner: "each
            element must have the same width so it doesn't move left or
            right". Both words are in the box and the box is as wide as the
            longer of them; only one is ever visible. Stacked rather than
            measured, because which word is longer is a fact about the
            language being read, not about English. */}
        <span className="jam-switch-state">
          <span className="jam-switch-ghost" aria-hidden="true">
            {t("jam.band.playing")}
          </span>
          <span className="jam-switch-ghost" aria-hidden="true">
            {t("jam.band.out")}
          </span>
          <span className="jam-switch-now">
            {on ? t("jam.band.playing") : t("jam.band.out")}
          </span>
        </span>
      </button>
    );
  };

  /**
   * How loud this player is — on their heading, beside their on/off switch.
   *
   * A player's section holds two kinds of control: what they PLAY (the voice,
   * the style, how busy) and whether they are here and how loud. The second
   * pair belongs together, and the playing screen has said so all along — its
   * band rows put the slider and the switch side by side at the right of
   * every row. Saying it the same way here means the same two controls in the
   * same relationship in both places, and it takes a whole line out of every
   * section of a sheet whose besetting sin is length.
   *
   * It was the last LINE of the section before that, and before that it was
   * dropped wherever the section happened to end — the owner: "the switches
   * and volumes look all over the place for these instruments", and then,
   * looking at the fix: "should we have a volume bar next to the on off
   * switch for that instrument?"
   *
   * Live even when the player is out. The playing screen used to disable it,
   * reasoning that turning up somebody who is not in the band is a control
   * that does nothing — which is wrong twice over: setting a level before you
   * bring a player in is an ordinary thing to do, so the keys do not arrive
   * at full tilt when you switch them on, and a slider that sets what happens
   * next is not a slider doing nothing.
   */
  const playerVolume = (id: "drums" | "bass" | "keys" | "perc") => (
    <div className="jam-player-volume">
      {/* The speaker and the word, exactly as the context bar's volume chip
          wears them. The owner: "could we have a Vol next to it? Or similar?
          So it looks like the volume bar in the main metronome page (In the
          top rail) for consistency" — and a bare slider between a sentence
          and a switch really is the one control on the heading that does not
          say what it is. */}
      <SpeakerGlyph />
      <span className="jam-player-volume-label">{t("volume.short")}</span>
      <input
        type="range"
        min={0}
        max={1.5}
        step={0.05}
        value={mix[id]}
        aria-label={t("jam.mix.forLane", { lane: t(`jam.band.${id}`) })}
        onChange={(e) => onEdit({ mix: { ...mix, [id]: Number(e.target.value) } })}
      />
      <span className="jam-band-volume-value">{Math.round(mix[id] * 100)}</span>
    </div>
  );

  // What each player's "Auto" would play, named, so Auto is never a mystery.
  const grooveIdForAuto = jam.customGroove ? null : jam.grooveId;
  const bassFigureOptions = [
    {
      id: "auto" as const,
      label: t("jam.bassFigure.autoNamed", {
        style: t(`jam.bassFigure.${autoBassFigure(grooveIdForAuto)}`),
      }),
    },
    ...JAM_BASS_STYLES.map((id) => ({ id, label: t(`jam.bassFigure.${id}`) })),
  ];
  const keysStyleOptions = [
    {
      id: "auto" as const,
      label: t("jam.keysComp.autoNamed", {
        style: t(`jam.keysComp.${autoKeysStyle(grooveIdForAuto, jamFamily(jam))}`),
      }),
    },
    ...JAM_KEYS_STYLES_ALL.map((id) => ({ id, label: t(`jam.keysComp.${id}`) })),
  ];

  // The progressions this form and key can play, with their numerals.
  const autoChanges = defaultChangesFor(jam.form.kind, key.mode, jamFamily(jam));
  const progressionEntries = changesFor(jam.form.kind, key.mode);
  const progressionOptions = progressionEntries.length === 0
    ? []
    : [
        {
          id: "auto",
          label: t("jam.progressions.autoNamed", {
            name: autoChanges ? t(`jam.progressions.${autoChanges.id}`) : "",
          }),
          hint: autoChanges ? numeralsOf(autoChanges.bars) : undefined,
        },
        ...progressionEntries.map((entry) => ({
          id: entry.id,
          label: t(`jam.progressions.${entry.id}`),
          hint: numeralsOf(entry.bars),
        })),
      ];
  const progressionValue =
    jam.changes && progressionEntries.some((entry) => entry.id === jam.changes) ? jam.changes : "auto";
  const hasOwnChords = !!jam.progression?.some((name) => name.trim());

  const grooveName = jam.customGroove
    ? jam.customGroove.name
    : t(`jam.groove.${jam.grooveId}`, { defaultValue: jam.grooveId });

  /**
   * Which shelf of grooves is open.
   *
   * `null` means "follow the jam", which is the default and what makes a vibe
   * tile leave the right shelf open behind it. A chip sets it, and it stays
   * set for as long as the sheet is: a player browsing Latin grooves is
   * browsing Latin grooves, and having the row jump back under them on every
   * tap would be the picker arguing.
   */
  const [pickedFamily, setPickedFamily] = useState<GrooveFamily | "all" | null>(null);
  const grooveFamily: GrooveFamily | "all" =
    pickedFamily ?? (jam.customGroove ? "all" : grooveById(jam.grooveId).family);

  /**
   * The paste-a-chart box, and what it has understood so far.
   *
   * The preview is recomputed on every keystroke and says three things: how
   * many bars, what key, and how many symbols it did something lossy with.
   * That last number is the one that matters — a paste box whose mistakes you
   * only find out about after it has replaced your changes is a paste box
   * nobody uses twice.
   */
  const [pasteOpen, setPasteOpen] = useState(false);
  const [chartText, setChartText] = useState("");
  const chart = useMemo(() => parseChordChart(chartText), [chartText]);
  const chartPreview = useMemo(() => {
    if (!chartText.trim()) return t("jam.chart.empty");
    if (chart.bars.length === 0) return t("jam.chart.none");
    const summary = t("jam.chart.summary", {
      count: chart.bars.length,
      key: keyName(chart.key ?? key),
    });
    if (chart.warnings.length === 0) return summary;
    return `${summary} · ${t("jam.chart.check", {
      count: chart.warnings.length,
      list: chart.warnings.slice(0, 4).join(", "),
    })}`;
  }, [chartText, chart, key, t]);

  /** One groove card. The same button whichever shelf it is drawn under. */
  const grooveCard = (groove: Groove) => {
    const active = !jam.customGroove && jam.grooveId === groove.id;
    return (
      <button
        key={groove.id}
        type="button"
        className={`sub-row-btn jam-card${active ? " active" : ""}`}
        aria-pressed={active}
        onClick={() =>
          onEdit({
            grooveId: groove.id,
            // A groove carries its own meter, so the count-in has to follow
            // it. The setting is BARS and the engine takes beats: one bar of
            // a waltz is three beats, not four.
            countIn: carryCountIn(jam.countIn, meter.beatsPerBar, groove.beatsPerBar),
            // Picking a preset is picking a preset. The groove you drew is
            // still on the record until you pick one.
            customGroove: undefined,
          })
        }
      >
        <GrooveGlyph groove={groove} />
        <span className="sub-row-label">{t(`jam.groove.${groove.id}`)}</span>
      </button>
    );
  };

  const countIn = { beats: jam.countIn, sound: jam.countInSound ?? "beep" };
  const countInOptions = useMemo(
    () =>
      countInChoices(meter.beatsPerBar).map((choice) => ({
        id: countInChoiceId(choice),
        label:
          choice.beats <= 0
            ? t("jam.countIn.none")
            : t("jam.countIn.barsAnd", {
                count: Math.round(choice.beats / Math.max(1, meter.beatsPerBar)),
                sound: t(`jam.countInSound.${choice.sound}`),
              }),
      })),
    [t, meter.beatsPerBar],
  );

  /**
   * A change to the form, with the changes brought along.
   *
   * The progression is exactly `form.bars` long or it is wrong, and the form
   * is the thing that changes its length, so the one goes with the other.
   */
  const editForm = (next: { kind: JamFormKind; bars: number }) => {
    onEdit({ form: next, progression: progressionEdit(jam.progression, formBars(next)) });
  };

  /**
   * A change to the arrangement, written WHOLE.
   *
   * `jamArrangement` fills the blanks in for reading, and this writes them
   * back out: touch the mode of a jam that has no arrangement and what lands
   * on the record is a complete one, chorus count and breakdown included. A
   * record carrying half an arrangement would read its missing half as the
   * default on every load, which is fine until the default changes.
   */
  const editArrangement = (patch: Partial<JamArrangement>) =>
    onEdit({ arrangement: { ...arrangement, ...patch } });

  const activeGroups = jam.meter ? meterKey(jam.meter.beatGroups) : null;
  const ticks = jam.meter?.ticksPerBeat ?? (written.ticksPerBeat as 1 | 2 | 3 | 4 | 6);

  /**
   * A vibe's bundle, landing on the record.
   *
   * Straight through `onEdit`: a vibe is an edit like any other, it marks the
   * jam dirty like any other, and Revert puts it back like any other. What it
   * is NOT is a new jam — you picked Rock while looking at this tune, not
   * instead of it.
   */
  const applyPatch = (patch: VibePatch) => onEdit(patch);

  return (
    <>
      <JamSheetGroup label={t("jam.vibe.label")} lead={t("jam.vibe.lead")} player="vibe">
        <VibePicker
          jam={jam}
          jams={jams}
          onApply={applyPatch}
          onLoadOwn={onLoadJam}
          onPreview={onPreviewVibe}
          onStopPreview={onStopPreview}
          previewing={previewingVibe}
        />
      </JamSheetGroup>

      <JamSheetGroup
        label={t("jam.section.form")}
        lead={t("jam.section.formLead")}
        player="form"
      >
        <div className="jam-sheet-row">
          <JamSelect
            label={t("jam.form.shape")}
            value={jam.form.kind}
            options={JAM_FORM_KINDS.map((kind: JamFormKind) => ({
              id: kind,
              label: t(`jam.form.${kind}`),
              hint: t(`jam.form.${kind}Hint`),
            }))}
            onChange={(kind) =>
              editForm({
                kind,
                // Switching to "your own" starts from the length you were
                // already looking at, so the timeline does not jump.
                bars: kind === "custom" ? bars : formBars({ kind, bars }),
              })
            }
          />
          <JamSelect
            label={t("jam.countIn.label")}
            value={countInChoiceId(countIn)}
            options={countInOptions}
            compact
            onChange={(id) => {
              const next = parseCountInChoice(id);
              onEdit({ countIn: next.beats, countInSound: next.sound as JamCountInSound });
            }}
          />
        </div>

        {/* THE ARRANGEMENT (plans/tasks/jam-v4/BRIEF.md A1).

            In the FORM group and nowhere else, because it IS the form: the
            shape above says how long one time round is, and this says what
            the band does with it the second, third and fourth time round.

            One sentence under it saying what the mode does, because these are
            three words a musician knows and three behaviours they cannot
            guess. Breakdown is behind a disclosure: it is a real decision, but
            it is one decision in twenty, and the sheet's whole job is to stop
            being a wall. */}
        <div className="jam-sheet-row">
          <Segmented
            label={t("jam.arrangement.label")}
            value={arrangement.mode}
            options={JAM_ARRANGEMENT_MODES.map((id) => ({
              id,
              label: t(`jam.arrangement.${id}`),
            }))}
            onChange={(mode) => editArrangement({ mode })}
          />
          {arrangement.mode === "song" && (
            <div className="jam-bars">
              <span className="stage-label">{t("jam.arrangement.choruses")}</span>
              <div
                className="beat-stepper"
                role="group"
                aria-label={t("jam.arrangement.choruses")}
              >
                <button
                  className="beat-stepper-btn"
                  aria-label={t("jam.arrangement.fewerChoruses")}
                  disabled={arrangement.choruses <= JAM_MIN_CHORUSES}
                  onClick={() => editArrangement({ choruses: arrangement.choruses - 1 })}
                >
                  −
                </button>
                <span className="beat-stepper-value">{arrangement.choruses}</span>
                <button
                  className="beat-stepper-btn"
                  aria-label={t("jam.arrangement.moreChoruses")}
                  disabled={arrangement.choruses >= JAM_MAX_CHORUSES}
                  onClick={() => editArrangement({ choruses: arrangement.choruses + 1 })}
                >
                  +
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="jam-sheet-lead">
          {t(`jam.arrangement.${arrangement.mode}Lead`, { choruses: arrangement.choruses })}
        </p>

        {arrangement.mode !== "loop" && (
          <>
            <button
              type="button"
              className="jam-more-toggle"
              aria-expanded={breakdownOpen}
              onClick={() => setBreakdownOpen((open) => !open)}
            >
              <span className="stage-label">{t("jam.arrangement.breakdown")}</span>
              <span className="jam-sheet-lead">
                {arrangement.breakdownEvery > 0
                  ? t("jam.arrangement.breakdownEvery", {
                      choruses: arrangement.breakdownEvery,
                    })
                  : t("jam.arrangement.breakdownOff")}
              </span>
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                data-open={breakdownOpen ? "" : undefined}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {breakdownOpen && (
              <div className="jam-more-body">
                <Segmented
                  label={t("jam.arrangement.breakdown")}
                  labelHidden
                  value={String(arrangement.breakdownEvery)}
                  // Off, and then the numbers themselves: "2" is "2" in every
                  // one of the fifteen languages, and a key whose whole value
                  // is a placeholder is a string asked of fifteen translators
                  // that none of them can improve.
                  options={JAM_BREAKDOWN_CHOICES.map((every) => ({
                    id: String(every),
                    label: every === 0 ? t("jam.arrangement.breakdownOff") : String(every),
                  }))}
                  onChange={(id) => editArrangement({ breakdownEvery: Number(id) })}
                  hint={t("jam.arrangement.breakdownHint")}
                />
              </div>
            )}
          </>
        )}

        {jam.form.kind === "custom" && (
          <div className="jam-bars">
            <span className="stage-label">{t("jam.form.barsLabel")}</span>
            <div className="beat-stepper" role="group" aria-label={t("jam.form.barsLabel")}>
              <button
                className="beat-stepper-btn"
                aria-label={t("jam.form.fewerBars")}
                disabled={bars <= 1}
                onClick={() => editForm({ kind: "custom", bars: clampFormBars(bars - 1) })}
              >
                −
              </button>
              <span className="beat-stepper-value">{bars}</span>
              <button
                className="beat-stepper-btn"
                aria-label={t("jam.form.moreBars")}
                disabled={bars >= JAM_MAX_FORM_BARS}
                onClick={() => editForm({ kind: "custom", bars: clampFormBars(bars + 1) })}
              >
                +
              </button>
            </div>
          </div>
        )}

        {/* How long a BAR is, under how many bars there are.

            It was in a collapsed "More" at the foot of the sheet, where the
            owner found it and asked the right question: "doesn't the meter
            belong to the vibe or the form or something?" The form. A form
            says how long one time round is and a meter says how long a bar
            is — the same question at two sizes. Its default answer, the
            groove's own, is what makes this a rare edit rather than one that
            had to be hidden.

            It must stay INSIDE this group. Moving it out of "More" put it
            after the closing tag rather than before it, so it drew as a
            sibling of the sections — no rail, no heading, belonging to
            nothing — and the owner asked the same question a second time:
            "why doesn't the meter belong to any section?" */}
        <div className="jam-setup-block">
          <span className="stage-label">
            {t("jam.meter.label")}
            <span className="jam-setup-value">
              {jam.meter ? jam.meter.beatGroups.join(" + ") : t("jam.meter.grooves")}
            </span>
          </span>
          <div className="jam-meters" role="group" aria-label={t("jam.meter.label")}>
            <button
              type="button"
              className={`jam-meter${jam.meter ? "" : " active"}`}
              aria-pressed={!jam.meter}
              onClick={() => onEdit({ meter: undefined })}
            >
              {t("jam.meter.grooves")}
            </button>
            {METER_PRESETS.map((preset) => {
              const on = activeGroups === meterKey(preset.groups);
              return (
                <button
                  key={preset.label}
                  type="button"
                  className={`jam-meter${on ? " active" : ""}`}
                  aria-pressed={on}
                  onClick={() =>
                    onEdit({
                      meter: { beatGroups: [...preset.groups], ticksPerBeat: ticks },
                      // The count-in is a number of BARS wearing a number
                      // of beats, so a new meter has to carry it.
                      countIn: carryCountIn(
                        jam.countIn,
                        meter.beatsPerBar,
                        preset.groups.reduce((sum, n) => sum + n, 0),
                      ),
                    })
                  }
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* The feel is the band's, not the drummer's: the bass swings with
            it too. So it sits with the song. Last, because it is the one
            question here that is not about length. */}
        <div className="jam-sheet-row">
          <Segmented
            label={t("jam.feel.label")}
            value={jam.feel}
            options={FEELS.map((id) => ({ id, label: t(`jam.feel.${id}`) }))}
            onChange={(feel) => onEdit({ feel })}
            hint={t("jam.feel.scope")}
          />
        </div>
      </JamSheetGroup>

      {/* THE CHANGES — what everybody plays over (2026-09-17).

          One section until the owner said "the song section is super messy...
          its just a bunch of optinos one stacking on top of another...
          progression dropdown down there in the middle of nowhere ... chords
          switch at the end without context on what it does". It was: the
          shape of the tune and the harmony of it are two different questions
          and they were in one column, so nothing sat next to the thing it
          belonged with.

          Time above, harmony here — which is how a musician holds them apart
          anyway. The progression, the two ways to overrule it, and the switch
          that puts the result on the timeline are now one block, and that
          switch finally has something beside it to explain what "chords"
          means. */}
      <JamSheetGroup
        label={t("jam.section.changes")}
        lead={t("jam.section.changesLead")}
        player="changes"
      >
        {/* The key, as two rows rather than a dropdown of thirty-six: twelve
            roots and three modes is a shape a player recognises. The roots are
            written sharp here and only here — a key picker has no key to spell
            itself in yet, since that is what you are choosing.

            Both rows unpin the shape in the corner. A pinned grip belongs to
            the key it was pinned in, and a G shape left in the corner of a jam
            you moved to B flat is a chord that is not in the tune — drawn as
            if it were the one to play. */}
        <div className="jam-setup-block">
          <span className="stage-label">
            {t("jam.key.label")}
            <span className="jam-setup-value">{keyName(key)}</span>
          </span>
          <div className="jam-keys" role="group" aria-label={t("jam.key.label")}>
            {SHARP_NAMES.map((name, root) => (
              <button
                key={name}
                type="button"
                className={`jam-key${key.root === root ? " active" : ""}`}
                aria-pressed={key.root === root}
                onClick={() => onEdit({ key: keyName({ ...key, root }), pinnedShape: null })}
              >
                {noteName(root, "sharp")}
              </button>
            ))}
          </div>
          <div className="accent-control jam-segmented" role="group" aria-label={t("jam.key.mode")}>
            <div className="accent-options">
              {KEY_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`accent-option${key.mode === mode ? " active" : ""}`}
                  aria-pressed={key.mode === mode}
                  onClick={() => onEdit({ key: keyName({ ...key, mode }), pinnedShape: null })}
                >
                  {t(`jam.key.${mode}`)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Which progression the form plays, named the way players name
            them, with the numerals underneath (2026-09-16). Offered only
            where the form has alternatives — rhythm changes is the form. */}
        {progressionOptions.length > 1 && (
          <div className="jam-sheet-row">
            <JamSelect
              label={t("jam.progressions.label")}
              value={progressionValue}
              options={progressionOptions}
              onChange={(id) => onEdit({ changes: id === "auto" ? undefined : id })}
            />
          </div>
        )}
        {progressionOptions.length > 1 && hasOwnChords && (
          <p className="jam-meter-note">{t("jam.progressions.ownChords")}</p>
        )}

        {/* The two ways to overrule it, beside the thing they overrule.
            They used to be links up in the section's heading, which put the
            fastest way into the app — pasting the chart you already have —
            above a form control it has nothing to do with. */}
          <span className="jam-sheet-links">
            {jam.chords && (
              <button
                type="button"
                className={`jam-link${editingChords ? " active" : ""}`}
                aria-pressed={editingChords}
                title={t("jam.changes.hint")}
                onClick={() => onEditingChords(!editingChords)}
              >
                {editingChords ? t("jam.changes.done") : t("jam.changes.edit")}
              </button>
            )}
            {/* The fastest way to jam over a tune is to paste the chart you
                already have (A3). Beside "Edit changes" rather than inside it:
                typing chords in one at a time and pasting a page of them are
                two different gestures, and the second one is the one people
                arrive with. */}
            <button
              type="button"
              className={`jam-link${pasteOpen ? " active" : ""}`}
              aria-pressed={pasteOpen}
              onClick={() => setPasteOpen((open) => !open)}
            >
              {t("jam.chart.paste")}
            </button>
          </span>
        {pasteOpen && (
          <div className="jam-chart-paste">
            <label className="stage-label" htmlFor="jam-chart-text">
              {t("jam.chart.label")}
            </label>
            <textarea
              id="jam-chart-text"
              className="jam-chart-text"
              rows={6}
              spellCheck={false}
              value={chartText}
              placeholder={t("jam.chart.placeholder")}
              onChange={(e) => setChartText(e.target.value)}
            />
            {/* The preview is live, because the whole risk of a paste box is
                that you cannot tell what it understood until after it has
                replaced your changes. */}
            <p className="jam-chart-preview">{chartPreview}</p>
            <div className="jam-chart-actions">
              <button
                type="button"
                className="preset-text-btn"
                disabled={chart.bars.length === 0}
                onClick={() => {
                  onEdit(chartEdit(chartText, jam));
                  setPasteOpen(false);
                  setChartText("");
                }}
              >
                {t("jam.chart.use")}
              </button>
              <button
                type="button"
                className="jam-link"
                onClick={() => {
                  setPasteOpen(false);
                  setChartText("");
                }}
              >
                {t("jam.chart.cancel")}
              </button>
            </div>
          </div>
        )}


        {/* The switch that draws the names on the timeline used to end this
            section. It is on the playing screen now, in the practice row,
            where you can reach it without opening anything — and a control
            in two places is a control you have to check twice, so this copy
            goes rather than sitting here shadowing the other one. */}

        {/* What you READ, which is not always what the band plays: a B flat
            instrument reads a tone up. It belongs with the changes because
            that is the whole of what it changes — the names on the chords,
            here and on the neck. */}
          {transpositionApplies(instrument) && (
            <div
              className="accent-control jam-segmented"
              role="group"
              aria-label={t("jam.transposition.label")}
            >
              <span className="stage-label accent-label">{t("jam.transposition.label")}</span>
              <div className="accent-options">
                {TRANSPOSITION_OPTIONS.map((option: TranspositionOption) => (
                  <button
                    key={option}
                    type="button"
                    className={`accent-option${
                      (jam.transposition ?? "concert") === option ? " active" : ""
                    }`}
                    aria-pressed={(jam.transposition ?? "concert") === option}
                    onClick={() => onEdit({ transposition: option, pinnedShape: null })}
                  >
                    {t(`jam.transposition.${option}`)}
                  </button>
                ))}
              </div>
            </div>
          )}
      </JamSheetGroup>

      <JamSheetGroup
        label={t("jam.section.drums")}
        lead={t("jam.section.drumsLead")}
        player="drums"
        control={playerMix("drums")}
        action={
          jam.customGroove ? (
            <button type="button" className="jam-link" onClick={onOpenEditor}>
              {t("jam.editor.edit")}
            </button>
          ) : undefined
        }
      >
        {/* A hundred and fifteen cards in one grid is a wall, not a picker
            (A3). So: a chip row of the nine shelves, and the cards of one
            shelf at a time — with "All" still there for the person who wants
            to scroll the whole book. The row follows the jam by default, so
            tapping the Latin vibe leaves the Latin shelf open rather than
            leaving the selected card somewhere off screen. */}
        {/* The kit, the loudness and the fills, ABOVE the grooves.
            They were under them, which meant scrolling past a hundred and
            fifteen cards to reach three controls — the owner: "not sure if
            those options should go at the top of drums section?" They should:
            the heading says who this is, these three say what they sound
            like, and then the wall of grooves is the last and largest thing,
            which is the order every other section already reads in. */}
        <div className="jam-sheet-row">
          <KitPicker
            kit={jam.kit}
            onKit={(kit) => {
              setChanged("kit");
              onEdit({ kit });
            }}
            customKit={jam.customKit ?? null}
            onCustomKit={(customKit) => onEdit({ customKit })}
            onPreview={onPreviewKit}
            previewing={previewingKit}
            refused={customKitRefused}
            loading={spinning("kit")}
          />
          <Segmented
            label={t("jam.intensity.label")}
            value={jam.intensity}
            options={INTENSITIES.map((id) => ({ id, label: t(`jam.intensity.${id}`) }))}
            onChange={(intensity) => onEdit({ intensity })}
            hint={t("jam.intensity.hint")}
          />
          <Segmented
            label={t("jam.fills.label")}
            value={fillsChoiceOf(jam)}
            options={FILL_CHOICES.map((id) => ({ id, label: t(`jam.fills.${id}`) }))}
            onChange={(choice) => onEdit(fillsEditFor(choice))}
            hint={t("jam.fills.hint")}
          />
        </div>

        <div className="jam-groove-shelves">
          <div
            className="jam-variations jam-family-chips"
            role="group"
            aria-label={t("jam.family.label")}
          >
            <button
              type="button"
              className={`jam-chip${grooveFamily === "all" ? " active" : ""}`}
              aria-pressed={grooveFamily === "all"}
              onClick={() => setPickedFamily("all")}
            >
              {t("jam.family.all")}
            </button>
            {GROOVE_FAMILIES.map((id) => (
              <button
                key={id}
                type="button"
                className={`jam-chip${grooveFamily === id ? " active" : ""}`}
                aria-pressed={grooveFamily === id}
                onClick={() => setPickedFamily(id)}
              >
                {t(`jam.family.${id}`)}
              </button>
            ))}
          </div>

          {grooveFamily === "all" ? (
            GROOVE_FAMILIES.map((id) => (
              <div key={id} className="jam-family-block">
                <span className="stage-label">{t(`jam.family.${id}`)}</span>
                <div className="jam-cards jam-cards-groove">
                  {groovesInFamily(id).map(grooveCard)}
                </div>
              </div>
            ))
          ) : (
            <div className="jam-cards jam-cards-groove">
              {groovesInFamily(grooveFamily).map(grooveCard)}
            </div>
          )}

          {/* The last card, under whichever shelf is open. A groove of your
              own is one of the choices, not a mode you have to find — and it
              is on no shelf, because nobody else has heard it. */}
          <div className="jam-cards jam-cards-groove">
            <button
              type="button"
              className={`sub-row-btn jam-card jam-card-mine${jam.customGroove ? " active" : ""}`}
              aria-pressed={!!jam.customGroove}
              onClick={onOpenEditor}
            >
              {/* A groove you drew gets its own pattern drawn, like every
                  other card. Until then there is no pattern to draw, and a
                  borrowed one was the whole reason this read as a preset:
                  it was wearing somebody else's bar. */}
              {jam.customGroove ? (
                <GrooveGlyph groove={meter} />
              ) : (
                <span className="jam-card-plus" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       strokeWidth="2" strokeLinecap="round">
                    <path d="M12 6v12M6 12h12" />
                  </svg>
                </span>
              )}
              <span className="sub-row-label">
                {jam.customGroove ? jam.customGroove.name : t("jam.editor.makeYourOwn")}
              </span>
            </button>
          </div>
        </div>



        {/* Said plainly rather than left to be noticed by ear. The groove card
            above still looks selected — and it is, it is just not what is
            playing — so this is the only place that can say why. */}
        {!grooveFits && (
          <p className="jam-meter-note">
            {t("jam.meter.doesNotFit", {
              groove: grooveName,
              meter: jam.meter ? jam.meter.beatGroups.join("+") : "",
            })}
          </p>
        )}
      </JamSheetGroup>

      {/* THE BASS. The on/off switch is on the heading; the rest appears
          with the player, because a dropdown for a bass nobody has hired is a
          control that does nothing (B9). Hovering the section builds every
          recorded bass in the background, so the pick that follows is
          instant. */}
      <JamSheetGroup
        label={t("jam.section.bass")}
        lead={t("jam.section.bassLead")}
        player="bass"
        control={playerMix("bass")}
      >
        {band.bass && (
          <div className="jam-player" onPointerEnter={() => warmVoices("bass")}>
            <div className="jam-sheet-row">
              <JamSelect
                label={t("jam.bassVoice.label")}
                value={jam.bassVoice ?? "fingered"}
                compact
                options={BASS_VOICES.map((voice) => ({
                  id: voice,
                  label: t(`jam.bassVoice.${voice}`),
                }))}
                onChange={(bassVoice) => {
                  setChanged("bass");
                  onEdit({ bassVoice });
                }}
                loading={spinning("bass")}
                onWarm={() => warmVoices("bass")}
              />
              <JamSelect
                label={t("jam.bassFigure.label")}
                value={jam.bassStyle ?? "auto"}
                options={bassFigureOptions}
                onChange={(id) => onEdit({ bassStyle: id === "auto" ? undefined : id })}
              />
            </div>
            <div className="jam-sheet-row">
              <Segmented
                label={t("jam.bassBusy.label")}
                value={jam.bassBusy ?? "normal"}
                options={JAM_BASS_BUSY.map((id) => ({ id, label: t(`jam.bassBusy.${id}`) }))}
                onChange={(bassBusy) => onEdit({ bassBusy: bassBusy === "normal" ? undefined : bassBusy })}
              />
            </div>
          </div>
        )}
      </JamSheetGroup>

      {/* THE KEYS. The comping style lives here and on the keys row of the
          playing screen — the same choice, in the two places you make it. */}
      <JamSheetGroup
        label={t("jam.section.keys")}
        lead={t("jam.section.keysLead")}
        player="keys"
        control={playerMix("keys")}
      >
        {band.keys && (
          <div className="jam-player" onPointerEnter={() => warmVoices("keys")}>
            <div className="jam-sheet-row">
              <JamSelect
                label={t("jam.keysVoice.label")}
                value={jam.keysVoice ?? "epiano"}
                compact
                options={KEYS_VOICES.map((voice) => ({
                  id: voice,
                  label: t(`jam.keysVoice.${voice}`),
                }))}
                onChange={(keysVoice) => {
                  setChanged("keys");
                  onEdit({ keysVoice });
                }}
                loading={spinning("keys")}
                onWarm={() => warmVoices("keys")}
              />
              <JamSelect
                label={t("jam.keysComp.label")}
                value={jam.keysStyle ?? "auto"}
                options={keysStyleOptions}
                onChange={(id) => onEdit({ keysStyle: id === "auto" ? undefined : id })}
              />
            </div>
          </div>
        )}
      </JamSheetGroup>

      {/* THE PERCUSSIONIST. Always here even where the groove has none
          written for it: this is where you decide who is in the band, and a
          switch that disappeared when you changed groove would be a decision
          taken away from you. */}
      <JamSheetGroup
        label={t("jam.section.perc")}
        lead={t("jam.section.percLead")}
        player="perc"
        control={playerMix("perc")}
      >
      </JamSheetGroup>

      {/* MORE. Collapsed, because these are true of maybe one jam in twenty
          and the sheet's whole job is to stop being a wall (A3). */}

      {/* TAKES — a section of its own, and not folded away (2026-09-18).

          It was the last third of a collapsed "More", which is where the
          owner went looking and concluded the feature did not exist: "we
          don't even have an option on the ui yet to show the recordings". It
          did, three clicks down. A heading and one line of empty state is a
          cheap price for a thing being findable, and recording is the one
          part of the sheet that makes something you would come back for.

          The switch sits directly above the list it fills, which is also why
          it left the practice row on the playing screen — it was in both
          places, and this is the one with the recordings in it. */}
      <JamSheetGroup
        label={t("jam.takes.label")}
        lead={t("jam.takes.lead")}
        player="takes"
        /* On the heading, where every player's switch is. Recording is the
           one thing in this drawer you turn on and then forget about, so it
           belongs where the eye already looks for a switch. */
        control={
          <button
            type="button"
            role="switch"
            aria-checked={!!jam.takes}
            className={`transport-switch jam-switch ${jam.takes ? "on" : ""}`}
            disabled={takes.available === false}
            onClick={() => onToggleTakes(!jam.takes)}
          >
            <span className="transport-switch-track" aria-hidden="true" />
            {t("jam.takes.record")}
          </button>
        }
      >

            {/* What a take is made of, above the shelf it fills and below the
                switch that starts it — the order a person reads in: turn it
                on, decide what goes in, see what came out. */}
            {takes.available !== false && (
              <TakeSoundControl state={takes.soundSource} disabled={!jam.takes} />
            )}

            <TakesSection
              available={takes.available}
              takes={takes.takes}
              recording={takes.recording}
              dirBytes={takes.dirBytes}
              playingId={takes.playingId}
              jam={jam}
              vibeLabel={jam.vibe ?? null}
              onPlay={takes.play}
              onStop={takes.stopPlayback}
              onDelete={takes.remove}
            />
      </JamSheetGroup>

    </>
  );
}
