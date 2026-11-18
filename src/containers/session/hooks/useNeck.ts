/**
 * The learning screens' side of the neck stage (`src/stage3d/api.ts`).
 *
 * A screen renders a slot and says which view it wants; the stage frames the
 * neck into it. Everything here is selectors over what the screens already
 * hold (a Take's score, an Exercise's notes, the live lights): nothing decides
 * anything, and with no stage mounted every call lands on the no-op stage.
 */
import { useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { useNeck } from "../../../stage3d/api";
import type { NeckKind, NeckNote, NeckView } from "../../../stage3d/api";
import type { PathNote } from "../../../paths/format";
import type { TakePlan } from "../../../session/take";
import type { TimingMark } from "../../songs/review/marks";
import type { MainView } from "../../main-window/MainHeader";

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** A note's letter, the way the neck labels it: no octave. */
function letterOf(midi: number): string {
  return NAMES[((Math.round(midi) % 12) + 12) % 12];
}

type Fretted = { string: number; fret: number; midi: number };

/** Each place on the neck once, in the order it is first played. */
export function neckNotesOf(notes: readonly Fretted[], kind: NeckKind = "aim"): NeckNote[] {
  const seen = new Set<string>();
  const out: NeckNote[] = [];
  for (const n of notes) {
    if (n.string < 1 || n.string > 6) continue;
    const key = `${n.string}:${n.fret}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      string: n.string as NeckNote["string"],
      fret: n.fret,
      kind,
      label: letterOf(n.midi),
    });
  }
  return out;
}

/** The frets a set of notes sits on, with a fret of air either side. */
export function zoomOf(notes: readonly { fret: number }[]): NeckView {
  const frets = notes.map((n) => n.fret).filter((f) => f > 0);
  if (frets.length === 0) return { kind: "zoom", from: 0, to: 5 };
  let from = Math.max(0, Math.min(...frets) - 1);
  let to = Math.min(24, Math.max(...frets) + 1);
  // A span narrower than four frets reads as a close-up of one note.
  while (to - from < 4) {
    if (from > 0) from -= 1;
    if (to - from < 4 && to < 24) to += 1;
  }
  return { kind: "zoom", from, to };
}

/** A live mark as a colour on the neck: on time is a tone, off is tension. */
export function kindOfMark(mark: TimingMark): NeckKind | null {
  switch (mark) {
    case "onTime":
    case "slightlyEarly":
    case "slightlyLate":
      return "tone";
    case "early":
    case "late":
      return "tens";
    case "missed":
      return "clash";
    case "notAssessed":
      return null;
  }
}

/**
 * An Exercise's own notes, on the neck. Labelled with their fret numbers, as
 * the practice neck labels NOW and NEXT (UX audit SES-17: the result's neck
 * said letters where the practice neck said numbers); a Theory Exercise,
 * whose point is the notes' names, keeps its letters.
 */
export function exerciseNeck(notes: readonly PathNote[] | undefined, kind: NeckKind = "aim", letters = false) {
  const list = notes ?? [];
  const placed = neckNotesOf(list, kind);
  return { view: zoomOf(list), notes: letters ? placed : placed.map((n) => ({ ...n, label: String(n.fret) })) };
}

function viewKey(view: NeckView): string {
  return view.kind === "zoom" ? `zoom:${view.from}:${view.to}${view.flat ? ":flat" : ""}${view.clip ? ":clip" : ""}` : view.kind;
}

/**
 * A slot for the neck: put the ref on an element and the stage frames into it.
 *
 * `sweep` plays the warm sweep once on arrival (results, Today). Notes are
 * replaced whenever their content changes; an empty list clears the neck.
 */
export function useNeckSlot(
  view: NeckView,
  notes: readonly NeckNote[] = [],
  options: { sweep?: boolean } = {},
): RefObject<HTMLDivElement> {
  const neck = useNeck();
  const slot = useRef<HTMLDivElement>(null);
  const key = viewKey(view);
  const latestView = useRef(view);
  latestView.current = view;

  useEffect(() => {
    neck.setView(latestView.current, slot.current);
    // The stage defers a hide, so leaving one screen for another in the same
    // commit flies the camera rather than blinking the neck out.
    return () => neck.setView({ kind: "hidden" }, null);
  }, [neck, key]);

  const notesKey = notes.map((n) => `${n.string}:${n.fret}:${n.kind}:${n.label ?? ""}`).join("|");
  const latestNotes = useRef(notes);
  latestNotes.current = notes;
  useEffect(() => {
    neck.setNotes([...latestNotes.current]);
  }, [neck, notesKey]);

  const sweep = options.sweep === true;
  useEffect(() => {
    if (sweep) neck.sweep();
  }, [neck, sweep]);

  return slot;
}

/**
 * A Take on the neck while it runs: the frame rate capped, and every note the
 * analyzer rules on plucked in the colour of its verdict.
 *
 * Reads `lights`, the same provisional per-note verdicts the tab is lit with,
 * so the neck and the tab cannot disagree about a note. A note nobody marked
 * (an extra one) has no place in the score to light, so it is not drawn.
 */
export function useNeckTake(
  take: TakePlan | null,
  lights: ReadonlyMap<number, TimingMark>,
  running: boolean,
): void {
  const neck = useNeck();

  useEffect(() => {
    neck.setTakeRunning(running);
    return () => neck.setTakeRunning(false);
  }, [neck, running]);

  // Onset id to the places on the neck it asks for.
  const places = useMemo(() => {
    const map = new Map<number, Array<{ string: number; fret: number }>>();
    if (!take) return map;
    const byId = new Map(take.score.notes.map((n) => [n.id, n]));
    for (const onset of take.schedule.onsets) {
      const at: Array<{ string: number; fret: number }> = [];
      for (const id of onset.noteIds) {
        const note = byId.get(id);
        if (note) at.push({ string: note.string, fret: note.fret });
      }
      map.set(onset.id, at);
    }
    return map;
  }, [take]);

  const plucked = useRef(new Set<number>());
  useEffect(() => {
    // The lights empty when a Take stops: the next one starts afresh.
    if (lights.size === 0) {
      plucked.current = new Set();
      return;
    }
    for (const [id, mark] of lights) {
      if (plucked.current.has(id)) continue;
      plucked.current.add(id);
      const kind = kindOfMark(mark);
      if (!kind) continue;
      for (const p of places.get(id) ?? []) neck.pluck(p.string, p.fret, kind);
    }
  }, [neck, lights, places]);
}

const NECK_VIEWS: readonly MainView[] = ["today", "paths", "progress", "session"];

/**
 * Off the learning side the neck does no work at all: the tools and Settings
 * get `hidden`. Each learning screen sets its own view when it mounts.
 */
export function useNeckOffLearning(view: MainView): void {
  const neck = useNeck();
  const on = NECK_VIEWS.includes(view);
  useEffect(() => {
    if (!on) neck.setView({ kind: "hidden" }, null);
  }, [neck, on]);
}

/**
 * `data-neck3d` for a learning page: present while the stage draws in 3D, so the
 * page leaves its own backdrop off and the neck shows through.
 */
export function useNeck3d(): "" | undefined {
  return useNeck().is3d ? "" : undefined;
}
