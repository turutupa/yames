/**
 * Ask, hosted: the coach's context for it, the panel's state, and the
 * Session's rules for the drawer, in one hook so `MainWindow` carries one
 * call and one mount (leg c2a1).
 *
 * The context is built from getters over the latest values (`CoachSources`,
 * `src/coach/context.ts`) and read only in effects and handlers: when the
 * panel is open and the screen changes (the "Looking at" line), and when a
 * question is sent (the model's context). Never in a render, never per beat.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { lastEvent } from "../../coach/bus";
import { buildCoachContext, type CoachScreen, type CoachSources } from "../../coach/context";
import { getCoachModelSnapshot } from "../../hooks/coachLoader";
import type { Jam } from "../../jam/types";
import { currentStep } from "../../session/runner";
import type { SongRecord } from "../../songs/library";
import { wholeSong } from "../../songs/schedule";
import type { MainView } from "../main-window/MainHeader";
import { seedOf, type SessionRun } from "../session/hooks/useSessionRun";
import { askModelContext, askScreenKey, lookingAtParts } from "./askContext";
import type { AskLookingAt } from "./AskPanel";
import { registerNotebookSource } from "./askStore";
import { noteAskToolView, registerAskToolContext } from "./askTools";
import { useAskSessionRules, useCoachPanel, type CoachPanel } from "./useCoachPanel";

/** The screens Ask is shown on: all of them but Settings. */
export function askShownOn(view: MainView): boolean {
  return view !== "settings";
}

function screenOf(view: MainView): CoachScreen {
  return view === "settings" ? "today" : view;
}

export type AskHostInput = {
  view: MainView;
  session: SessionRun;
  /** The input is on (graded listening). */
  listening: boolean;
  /** The engine is playing: the click, a demo, a band. */
  isPlaying: boolean;
  jam: Jam | null;
  song: SongRecord | null;
};

export function useAskHost(input: AskHostInput): { panel: CoachPanel; lookingAt: AskLookingAt | null } {
  const { t, i18n } = useTranslation();
  const latest = useRef(input);
  latest.current = input;

  const sources = useRef<CoachSources>({
    screen: () => screenOf(latest.current.view),
    locale: () => i18n.language,
    grading: () => latest.current.session.grading,
    input: () => ({
      listening: latest.current.listening,
      direct: latest.current.session.directInput,
      failure: latest.current.session.inputStart.failure ?? undefined,
    }),
    brain: () => {
      const snap = getCoachModelSnapshot();
      return {
        llmCompiled: !snap.rows.some((r) => r.why === "noLlm"),
        choice: snap.choice,
        resident: snap.state === "ready",
        // The speed gate is measured later (c3b); nothing claims it here.
        fastEnough: false,
      };
    },
    progress: () => latest.current.session.progress,
    plan: () => (latest.current.view === "session" ? (latest.current.session.plan ?? undefined) : undefined),
    run: () => (latest.current.view === "session" ? latest.current.session.run : undefined),
    path: () => {
      const s = latest.current.session;
      if (latest.current.view !== "session" || !s.take) return undefined;
      return s.paths.find((p) => p.id === s.take?.pathId);
    },
    exercise: () => {
      const s = latest.current.session;
      if (latest.current.view !== "session" || !s.exercise) return undefined;
      return { exercise: s.exercise, variantSeed: seedOf(currentStep(s.run)) };
    },
    lastTake: () => {
      if (latest.current.view !== "session") return undefined;
      const outcomes = latest.current.session.run.outcomes;
      return outcomes[outcomes.length - 1];
    },
    // The last Take's analysis, as the bus carried it with that Take's result
    // (the note reads the same one): the fact cards' places and leans (c2b1a).
    review: () => {
      if (latest.current.view !== "session") return undefined;
      const outcomes = latest.current.session.run.outcomes;
      const last = outcomes[outcomes.length - 1];
      const event = lastEvent("takeResult");
      if (!last || !event) return undefined;
      const same = event.outcome === last || (!!last.takeId && event.outcome.takeId === last.takeId);
      return same ? (event.review ?? undefined) : undefined;
    },
    jam: () => (latest.current.view === "jam" && latest.current.jam ? { jam: latest.current.jam } : undefined),
    song: () => {
      const song = latest.current.song;
      return latest.current.view === "songs" && song ? { song, range: wholeSong(song.score) } : undefined;
    },
  }).current;

  // The model's context leaves the Take's raw review out (review c2b1a F5).
  const panel = useCoachPanel({ contextText: () => askModelContext(sources) });

  // The tools read the same context, at each press (leg t1b1).
  useEffect(() => registerAskToolContext(() => buildCoachContext(sources)), [sources]);
  // The Notebook reads the stored Takes when its tab opens (leg c4a2), never per beat.
  useEffect(
    () =>
      registerNotebookSource(() => {
        const s = latest.current.session;
        const inRun = latest.current.view === "session" && s.run.phase !== "idle";
        return { rows: s.progress.takes, paths: s.paths, sessionStartedAt: inRun ? s.run.startedAt : null };
      }),
    [],
  );

  const { session, view, isPlaying } = input;

  const run = session.run;
  const inSession = view === "session";
  // A receipt's way back is good on its own screen only, and an open proposal on
  // its own screen and Session step only: say when either changes.
  const step = inSession && run.phase !== "idle" ? run.stepIndex : null;
  useEffect(() => {
    noteAskToolView(view, step);
  }, [view, step]);
  useAskSessionRules({
    inSession,
    takeRunning: run.phase === "playing" || run.phase === "listening",
    timedRunning: run.phase === "timed" && !run.paused && !run.ended,
    pauseTimed: session.actions.togglePause,
    sounding: isPlaying,
    open: panel.open,
    deferred: panel.deferred,
  });

  // "Looking at: …", when the panel is open and what it looks at changes.
  const [lookingAt, setLookingAt] = useState<AskLookingAt | null>(null);
  const exerciseId = inSession ? (session.exercise?.id ?? null) : null;
  const outcomes = inSession ? run.outcomes.length : 0;
  useEffect(() => {
    if (!panel.open) return;
    const ctx = buildCoachContext(sources);
    const text = lookingAtParts(ctx, t).join(" · ");
    const key = askScreenKey(ctx);
    setLookingAt((prev) => (prev?.text === text && prev.key === key ? prev : { text, key }));
  }, [panel.open, view, run.phase, exerciseId, outcomes, input.jam?.id, input.song?.id, t, sources]);

  return { panel, lookingAt };
}
