import { useMemo, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { getTempoMarking } from "../../constants/metronome";
import { GROOVES } from "../../jam/grooves";
import { carryCountIn } from "../../jam/jams";
import { JAM_FORM_KINDS, clampFormBars, formBars } from "../../jam/forms";
import { jamBand, jamGroove, jamKey, jamBassLine } from "../../jam/compile";
import { bandStatesForChorus, practiceConfigFrom } from "../../jam/practice";
import {
  chordName,
  chordsForForm,
  displayTransposition,
  keyName,
  midiToName,
  noteName,
  sameChord,
  spellingForKey,
  transposeChord,
  transposeKey,
} from "../../jam/harmony";
import { SCALE_NAMES_EN, scalesForChord } from "../../jam/scales";
import { bassStyleForGroove } from "../../jam/bassline";
import { JAM_MAX_COUNT_IN, JAM_MAX_FORM_BARS } from "../../jam/types";
import type {
  Jam,
  JamFeel,
  JamFormKind,
  JamIntensity,
  JamPracticeSettings,
} from "../../jam/types";
import type { Chord, TranspositionOption } from "../../jam/harmony";
import type { Instrument } from "../../jam/chordShapes";
import type { BeatEvent } from "../../types";
import { GrooveGlyph } from "./GrooveGlyph";
import { FormTimeline } from "./FormTimeline";
import { NowBlock } from "./NowBlock";
import { ChordsPanel } from "./ChordsPanel";
import { BandLanes } from "./BandLanes";
import { PracticeRow, NO_PRACTICE } from "./PracticeRow";
import { TradeCue } from "./TradeCue";
import { JamSetup } from "./JamSetup";
import { GrooveEditorDrawer } from "./GrooveEditorDrawer";
import "../../styles/jam.css";

const FEELS: JamFeel[] = ["straight", "shuffle", "swing"];
const INTENSITIES: JamIntensity[] = ["soft", "normal", "loud"];

/** Which neck a player has, if any. Horns and voices get the chords only. */
function neckFor(instrument: string): Instrument | null {
  if (instrument === "bass") return "bass";
  if (instrument === "electric-guitar" || instrument === "acoustic-guitar") return "guitar";
  return null;
}

/** Everything the jam screen keeps that the record does not. */
export interface JamScreenState {
  fretboardOpen: boolean;
  toggleFretboard: () => void;
  sevenths: boolean;
  setSevenths: (next: boolean) => void;
  shapeIndex: number;
  setShapeIndex: (index: number) => void;
  pinnedChord: Chord | null;
  setPinnedChord: (chord: Chord | null) => void;
  editorOpen: boolean;
  setEditorOpen: (open: boolean) => void;
  editorPage: "bar" | "fill";
  setEditorPage: (page: "bar" | "fill") => void;
}

interface JamViewProps {
  jam: Jam;
  /** Every edit lands on the working copy, which recompiles and re-sends. */
  onEdit: (patch: Partial<Omit<Jam, "id" | "createdAt">>) => void;
  currentBeat: BeatEvent | null;
  isPlaying: boolean;
  /** What you play, so the band knows what not to be. */
  instrument: string;
  /** The band when the record has not been asked. */
  lineup: { drums: boolean; bass: boolean };
  /** Where the tempo trainer has got to, or null while it has not moved. */
  trainedBpm: number | null;
  /** Whether the mic is on, so the "you" lane says something true. */
  listening: boolean;
  screen: JamScreenState;
  /** The metronome's tempo controls, shared rather than built again. */
  tapActive: boolean;
  tapCount: number;
  tapPulse: boolean;
  editingBpm: boolean;
  bpmEditValue: string;
  setBpmEditValue: (v: string) => void;
  setEditingBpm: (v: boolean) => void;
  bpmInputRef: Ref<HTMLInputElement>;
  onTap: () => void;
  onBpmChange: (v: number) => void;
  onStartBpmEdit: () => void;
  onCommitBpmEdit: () => void;
}

/**
 * A segmented control, in the stage's existing vocabulary.
 *
 * The same three-in-a-trough shape as the metronome's accent control, which is
 * what the setup board draws for feel and intensity too — so it is that
 * component's stylesheet rather than a second one that looks nearly like it.
 */
function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="accent-control jam-segmented" role="group" aria-label={label}>
      <span className="stage-label accent-label">{label}</span>
      <div className="accent-options">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`accent-option${value === option.id ? " active" : ""}`}
            aria-pressed={value === option.id}
            disabled={option.disabled}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The Jam stage: what the band plays, where you are in it, and what to play.
 *
 * Top to bottom it is the order you read it in while playing, not the order
 * you set it up in: the chord you are on, the chords of the key under it, the
 * form, the band, the practice tools, and the setup — grooves, kit, key — last,
 * because you touch that once and then leave it alone for an hour.
 *
 * Two rules hold this screen together. **One chord at a time**: the NOW block
 * is the largest thing here, and everything harmonic below it is about that
 * one chord, never a sheet of every chord there is (JAM_MODE §4.3). And
 * **every control writes to the jam record, nothing writes to the engine**:
 * `useJamSession` owns the traffic, because the meter and the table have to
 * leave together and in order.
 */
export function JamView({
  jam,
  onEdit,
  currentBeat,
  isPlaying,
  instrument,
  lineup,
  trainedBpm,
  listening,
  screen,
  tapActive,
  tapCount,
  tapPulse,
  editingBpm,
  bpmEditValue,
  setBpmEditValue,
  setEditingBpm,
  bpmInputRef,
  onTap,
  onBpmChange,
  onStartBpmEdit,
  onCommitBpmEdit,
}: JamViewProps) {
  const { t } = useTranslation();
  const shownBpm = trainedBpm ?? jam.bpm;
  const marking = getTempoMarking(shownBpm);

  /** The meter the jam actually runs in, feel and custom groove included. */
  const meter = useMemo(() => jamGroove(jam), [jam]);

  /**
   * Count-in, in bars of the jam's own meter.
   *
   * Beats are what the engine takes and bars are what a player counts, so the
   * options are bars and the values are beats. Two bars of 6/8 is twelve
   * beats, which is past `arm_count_in`'s limit of eight — so that option is
   * not offered there rather than offered and quietly clamped to something
   * that is not two bars.
   */
  const countInOptions = useMemo(() => {
    const options = [{ id: "0", label: t("jam.countIn.none") }];
    for (const bars of [1, 2]) {
      const beats = bars * meter.beatsPerBar;
      if (beats > JAM_MAX_COUNT_IN) continue;
      options.push({ id: String(beats), label: t("jam.countIn.bars", { count: bars }) });
    }
    return options;
  }, [t, meter.beatsPerBar]);

  const bars = formBars(jam.form);
  const chorus = currentBeat?.chorus ?? 1;
  const formBar = currentBeat?.formBar ?? 0;
  const bandState = isPlaying ? (currentBeat?.bandState ?? "full") : "full";
  const band = jamBand(jam, lineup);
  const neck = neckFor(instrument);
  const practice = jam.practice ?? NO_PRACTICE;

  /**
   * The harmony, once, in the key the player READS.
   *
   * Transposition is a shift of the whole picture: shift the key and every
   * chord in it and the scales come out shifted too, with no second code path
   * and nothing left in concert pitch to contradict it. A Bb player sees a Bb
   * player's chart, including the grips — which is what they asked for by
   * choosing Bb.
   */
  const harmony = useMemo(() => {
    const concert = jamKey(jam);
    const semitones = displayTransposition(jam.transposition ?? "concert");
    const key = transposeKey(concert, semitones);
    const chords = chordsForForm(jam.form.kind, bars, concert).map((chord) =>
      transposeChord(chord, semitones),
    );
    return { key, chords };
  }, [jam, bars]);

  /** Which bar's chord is under your hands: the one playing, or bar one. */
  const at = isPlaying ? Math.min(Math.max(formBar, 0), bars - 1) : 0;
  const chord = harmony.chords[at] ?? null;

  /**
   * The next chord that is DIFFERENT, and how far off it is.
   *
   * Over a twelve-bar blues bars 1 to 4 are all the I, and "A7 in 1 bar" four
   * times running tells you nothing. "D7 in 4 bars" is the sentence a player
   * holds in their head.
   */
  const next = useMemo(() => {
    if (!chord || bars <= 1) return null;
    for (let ahead = 1; ahead <= bars; ahead += 1) {
      const candidate = harmony.chords[(at + ahead) % bars];
      if (candidate && !sameChord(candidate, chord)) {
        return { name: chordName(candidate, harmony.key), inBars: ahead };
      }
    }
    return null;
  }, [chord, bars, at, harmony]);

  const scales = useMemo(
    () => (chord ? scalesForChord(chord, harmony.key) : []),
    [chord, harmony.key],
  );

  /**
   * Two, not three.
   *
   * `scalesForChord` offers up to three and they are all defensible, but this
   * line sits beside the chord at the busiest moment there is. Two is what the
   * design board asks for and what a player reads without stopping; the third
   * is a tap away in the strip and on the neck below.
   */
  const scaleLabels = useMemo(
    () =>
      scales.slice(0, 2).map((suggestion) => {
        // `noteName`, not `midiToName`: a suggestion's root is a PITCH CLASS,
        // and putting one through the MIDI speller names the note in the
        // octave below the piano ("A-1 mixolydian").
        const root = noteName(suggestion.root, spellingForKey(harmony.key));
        // Not lower-cased on the way out: the locale files already write each
        // scale the way that language writes it, and German capitalises its
        // nouns whether or not English happens to.
        const name = t(suggestion.labelKey, { defaultValue: SCALE_NAMES_EN[suggestion.scale] });
        return `${root} ${name}`;
      }),
    [scales, harmony.key, t],
  );

  /** The chord names the timeline draws, or null when chords are off. */
  const timelineChords = useMemo(
    () => (jam.chords ? harmony.chords.map((c) => chordName(c, harmony.key)) : null),
    [jam.chords, harmony],
  );

  /** What the band will do on each bar of this chorus — drawn before it happens. */
  const bandStates = useMemo(
    () =>
      jam.practice
        ? bandStatesForChorus({
            chorus,
            formBars: bars,
            practice: practiceConfigFrom(jam.practice),
          })
        : null,
    [jam.practice, chorus, bars],
  );

  /** The bass's notes for the bar being played, for the band lane. */
  const bassNotes = useMemo(() => {
    if (!band.bass) return [];
    const line = jamBassLine(jam, at, lineup);
    if (!line) return [];
    const spelling = spellingForKey(harmony.key);
    // A rest is an empty cell, not a gap: the row is the bar, and eight cells
    // with three names in them reads as a rhythm.
    return line.pitches.map((midi) => (midi === 0 ? "" : midiToName(midi, spelling).slice(0, -1)));
  }, [jam, at, band.bass, lineup, harmony.key]);

  const grooveName = jam.customGroove
    ? jam.customGroove.name
    : t(`jam.groove.${jam.grooveId}`, { defaultValue: jam.grooveId });

  return (
    <div className="jam-view">
      <TradeCue bandState={bandState} isPlaying={isPlaying} />

      {/* Its own row, above the tempo. The chord is the largest thing on the
          screen and the one a player reads mid-chorus; sharing a line with the
          tempo and the feel controls had all three fighting for the width at
          every window size, and the chord is the one that must not lose. */}
      {jam.chords && chord ? (
        <NowBlock
          chord={chordName(chord, harmony.key)}
          next={next}
          scales={scaleLabels}
          fretboardOpen={screen.fretboardOpen}
          onToggleFretboard={neck ? screen.toggleFretboard : null}
        />
      ) : null}

      <section className="bpm-section jam-head">
        <div className="tempo-block">
          <span className="stage-label">{t("metronome.tempo")}</span>
          <div className="bpm-display">
            {editingBpm ? (
              <input
                ref={bpmInputRef}
                type="text"
                inputMode="numeric"
                className="bpm-input"
                value={bpmEditValue}
                onChange={(e) => setBpmEditValue(e.target.value.replace(/\D/g, ""))}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={onCommitBpmEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onCommitBpmEdit();
                  if (e.key === "Escape") setEditingBpm(false);
                }}
                autoFocus
              />
            ) : (
              /* `role` and `tabIndex` are load-bearing: the window-drag
                 handler asks whether a mousedown landed on a control, and a
                 bare span with an onClick answers no. See MetronomeView. */
              <span
                className="bpm-input bpm-clickable"
                role="button"
                tabIndex={0}
                onClick={onStartBpmEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onStartBpmEdit();
                  }
                }}
              >
                {shownBpm}
              </span>
            )}
            <div className="tempo-units">
              <span className="tempo-unit">BPM</span>
              <span className="tempo-marking">
                {trainedBpm === null ? marking : t("jam.practice.climbing", { from: jam.bpm })}
              </span>
            </div>
            <div className="tempo-controls">
              <button
                className="bpm-btn"
                aria-label={t("metronome.tempoDown")}
                onClick={() => onBpmChange(jam.bpm - 5)}
              >
                −
              </button>
              <button
                className="bpm-btn"
                aria-label={t("metronome.tempoUp")}
                onClick={() => onBpmChange(jam.bpm + 5)}
              >
                +
              </button>
              <button
                className={`tap-btn ${tapActive ? "active" : ""} ${tapPulse ? "pulse" : ""}`}
                onClick={onTap}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M8 13V4.5a1.5 1.5 0 0 1 3 0V12" />
                  <path d="M11 11.5V4a1.5 1.5 0 0 1 3 0v8" />
                  <path d="M14 12V6.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-.5a6 6 0 0 1-5.5-4l-1.4-3.2a1.6 1.6 0 0 1 2.7-1.7L8 14" />
                </svg>
                {t("metronome.tap")}
                {tapActive && tapCount >= 2 && (
                  <span className="tap-count">{t("metronome.tapCount", { count: tapCount })}</span>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="jam-head-controls">
          <Segmented
            label={t("jam.feel.label")}
            value={jam.feel}
            options={FEELS.map((id) => ({ id, label: t(`jam.feel.${id}`) }))}
            onChange={(feel) => onEdit({ feel })}
          />
          <Segmented
            label={t("jam.intensity.label")}
            value={jam.intensity}
            options={INTENSITIES.map((id) => ({ id, label: t(`jam.intensity.${id}`) }))}
            onChange={(intensity) => onEdit({ intensity })}
          />
        </div>
      </section>

      {jam.chords && (
        <ChordsPanel
          playedKey={harmony.key}
          current={chord}
          scale={scales[0] ?? null}
          instrument={neck}
          fretboardOpen={screen.fretboardOpen}
          pinned={screen.pinnedChord}
          onPin={screen.setPinnedChord}
          shapeIndex={screen.shapeIndex}
          onShapeIndex={screen.setShapeIndex}
          sevenths={screen.sevenths}
          onSevenths={screen.setSevenths}
        />
      )}

      <div className="stage-divider" aria-hidden="true" />

      <FormTimeline
        form={jam.form}
        fills={jam.fills}
        formBar={formBar}
        chorus={chorus}
        beat={currentBeat?.measureBeat ?? 0}
        beatsPerBar={meter.beatsPerBar}
        isPlaying={isPlaying}
        chords={timelineChords}
        bandStates={bandStates}
      />

      <BandLanes
        lanes={[
          {
            id: "drums",
            on: band.drums,
            detail: `${grooveName} · ${t(`jam.kit.${jam.kit}`, { defaultValue: jam.kit })}`,
          },
          {
            id: "bass",
            on: band.bass,
            detail: t(`jam.bassStyle.${bassStyleForGroove(jam.customGroove ? "" : jam.grooveId)}`),
            notes: bassNotes,
          },
        ]}
        onToggle={(id) =>
          onEdit({ band: { ...band, [id]: !band[id] } })
        }
        bandState={bandState}
        isPlaying={isPlaying}
        youLabel={t("jam.band.youPlay", {
          instrument: t(`instrument.${instrument}`, { defaultValue: instrument }),
        })}
        listening={listening}
      />

      <PracticeRow
        value={practice}
        onChange={(next: JamPracticeSettings) => onEdit({ practice: next })}
      />

      <div className="stage-divider" aria-hidden="true" />

      <section className="jam-section">
        <div className="jam-section-head">
          <span className="stage-label">{t("jam.groove.label")}</span>
          {/* Only once the groove IS yours. Before that the ninth card below
              is the door, and two controls a hand's width apart both saying
              "make this one yours" is one control too many. */}
          {jam.customGroove && (
            <button
              type="button"
              className="jam-link"
              onClick={() => screen.setEditorOpen(true)}
            >
              {t("jam.editor.edit")}
            </button>
          )}
        </div>
        <div className="jam-cards jam-cards-groove">
          {GROOVES.map((groove) => (
            <button
              key={groove.id}
              type="button"
              className={`sub-row-btn jam-card${
                !jam.customGroove && jam.grooveId === groove.id ? " active" : ""
              }`}
              aria-pressed={!jam.customGroove && jam.grooveId === groove.id}
              onClick={() =>
                onEdit({
                  grooveId: groove.id,
                  // A groove carries its own meter, so the count-in has to
                  // follow it. The setting is BARS and the engine takes beats:
                  // one bar of a waltz is three beats, not four, and a
                  // count-in left in the old meter lands you on beat two of
                  // the first bar. Two bars stay two bars where they fit.
                  countIn: carryCountIn(jam.countIn, meter.beatsPerBar, groove.beatsPerBar),
                  // Picking a preset is picking a preset. The groove you drew
                  // is still on the record until you pick one.
                  customGroove: undefined,
                })
              }
            >
              <GrooveGlyph groove={groove} />
              <span className="sub-row-label">{t(`jam.groove.${groove.id}`)}</span>
            </button>
          ))}

          {/* The ninth card. A groove of your own is one of the choices, not a
              mode you have to find — which is the difference between an editor
              people use and one they read about in a changelog. */}
          <button
            type="button"
            className={`sub-row-btn jam-card jam-card-mine${jam.customGroove ? " active" : ""}`}
            aria-pressed={!!jam.customGroove}
            onClick={() => screen.setEditorOpen(true)}
          >
            <GrooveGlyph groove={meter} />
            <span className="sub-row-label">
              {jam.customGroove ? jam.customGroove.name : t("jam.editor.makeYourOwn")}
            </span>
          </button>
        </div>
      </section>

      <div className="stage-divider" aria-hidden="true" />

      <section className="jam-section">
        <span className="stage-label">{t("jam.form.label")}</span>
        <div className="jam-cards jam-cards-form">
          {JAM_FORM_KINDS.map((kind: JamFormKind) => (
            <button
              key={kind}
              type="button"
              className={`sub-row-btn jam-card jam-card-form${jam.form.kind === kind ? " active" : ""}`}
              aria-pressed={jam.form.kind === kind}
              onClick={() =>
                onEdit({
                  form: {
                    kind,
                    // Switching to "your own" starts from the length you were
                    // already looking at, so the timeline does not jump.
                    bars: kind === "custom" ? bars : formBars({ kind, bars }),
                  },
                })
              }
            >
              <span className="jam-card-title">{t(`jam.form.${kind}`)}</span>
              <span className="jam-card-hint">{t(`jam.form.${kind}Hint`)}</span>
            </button>
          ))}
        </div>

        <div className="jam-form-row">
          {jam.form.kind === "custom" && (
            <div className="jam-bars">
              <span className="stage-label">{t("jam.form.barsLabel")}</span>
              <div className="beat-stepper" role="group" aria-label={t("jam.form.barsLabel")}>
                <button
                  className="beat-stepper-btn"
                  aria-label={t("jam.form.fewerBars")}
                  disabled={bars <= 1}
                  onClick={() => onEdit({ form: { kind: "custom", bars: clampFormBars(bars - 1) } })}
                >
                  −
                </button>
                <span className="beat-stepper-value">{bars}</span>
                <button
                  className="beat-stepper-btn"
                  aria-label={t("jam.form.moreBars")}
                  disabled={bars >= JAM_MAX_FORM_BARS}
                  onClick={() => onEdit({ form: { kind: "custom", bars: clampFormBars(bars + 1) } })}
                >
                  +
                </button>
              </div>
            </div>
          )}

          <Segmented
            label={t("jam.countIn.label")}
            value={String(jam.countIn)}
            options={countInOptions}
            onChange={(beats) => onEdit({ countIn: Number(beats) })}
          />

          <button
            type="button"
            role="switch"
            aria-checked={jam.fills}
            className={`transport-switch jam-switch ${jam.fills ? "on" : ""}`}
            title={t("jam.fills.hint")}
            onClick={() => onEdit({ fills: !jam.fills })}
          >
            <span className="transport-switch-track" aria-hidden="true" />
            {t("jam.fills.label")}
          </button>
        </div>
      </section>

      <div className="stage-divider" aria-hidden="true" />

      <JamSetup
        jamKey={jamKey(jam)}
        onKey={(key) => onEdit({ key: keyName(key) })}
        kit={jam.kit}
        onKit={(kit) => onEdit({ kit })}
        transposition={jam.transposition ?? "concert"}
        onTransposition={(transposition: TranspositionOption) => onEdit({ transposition })}
        chords={!!jam.chords}
        onChords={(on) => onEdit({ chords: on })}
      />

      {/* JAM_MODE §3, principle 5. A band is louder than a click, and through
          speakers its hits land on the grid and the mic scores them as your
          notes. The screen says so rather than letting a flattered score go
          unexplained. */}
      <p className="jam-honest">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
          <rect x="2.5" y="13.5" width="4.5" height="7" rx="2" />
          <rect x="17" y="13.5" width="4.5" height="7" rx="2" />
        </svg>
        {t("jam.headphones")}
      </p>

      <GrooveEditorDrawer
        jam={jam}
        onEdit={onEdit}
        open={screen.editorOpen}
        onClose={() => screen.setEditorOpen(false)}
        page={screen.editorPage}
        onPageChange={screen.setEditorPage}
        currentBeat={currentBeat}
        isPlaying={isPlaying}
      />
    </div>
  );
}
