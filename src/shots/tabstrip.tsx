/**
 * The Session tab strip's `?shot=` scenes: the strip alone on a minimal page,
 * in the chosen theme, drawing a real Exercise from a bundled Path pack.
 *
 * - `preview`: before a Take, the whole pattern numbered in order.
 * - `follow`: mid-Take, held still in bar 2 with the notes before the column
 *   already judged (good, early, late, miss), so a picture shows every colour.
 * - `playing`: the same, running from the page's clock, so the layout suite
 *   can see the strip move.
 * - `dense`: sixteenths, the tightest pattern the Paths have, followed.
 *
 * `?reduced=1` is not needed: the browser's own `prefers-reduced-motion`
 * emulation reaches the component.
 */
import { useMemo } from "react";
import ReactDOM from "react-dom/client";
import { THEMES, applyTheme } from "../themes";
import { findExercise, readPack } from "../session/packs";
import type { Exercise } from "../paths/format";
import { barLengthTicks } from "../paths/format";
import { TabStrip } from "../containers/session/tabstrip/TabStrip";
import type { TabResult } from "../containers/session/tabstrip/TabStrip";
import { patternModel, occurrences } from "../containers/session/tabstrip/tabStripModel";

export type TabStripShotKind = "preview" | "follow" | "playing" | "dense" | "paused";

const SOURCES: Record<TabStripShotKind, { pack: string; exercise: string }> = {
  preview: { pack: "blues-pentatonics", exercise: "box-one.first-lick" },
  follow: { pack: "blues-pentatonics", exercise: "box-one.first-lick" },
  playing: { pack: "blues-pentatonics", exercise: "box-one.first-lick" },
  dense: { pack: "shred", exercise: "crossing.outside-pairs" },
  paused: { pack: "blues-pentatonics", exercise: "box-one.first-lick" },
};

const PACKS = import.meta.glob("../paths/packs/*.json");

async function loadExercise(pack: string, id: string): Promise<Exercise> {
  const load = PACKS[`../paths/packs/${pack}.json`];
  if (!load) throw new Error(`no pack ${pack}`);
  const module = (await load()) as { default?: unknown };
  const doc = readPack(module.default ?? module);
  const found = doc && findExercise(doc, id);
  if (!found) throw new Error(`no exercise ${id} in ${pack}`);
  return found.exercise;
}

const BPM = 70;
const TAKE_BARS = 10;
const RECIPE: TabResult[] = ["good", "good", "early", "good", "late", "good", "good", "miss"];

function Scene({ kind, exercise }: { kind: TabStripShotKind; exercise: Exercise }) {
  const barTicks = barLengthTicks(exercise.meter);
  const mode = kind === "preview" || kind === "paused" ? "preview" : "follow";
  // Held in bar 2, just after beat 3, where the lick has a note.
  const held = barTicks + barTicks / 2 + 20;
  const results = useMemo(() => {
    const map = new Map<number, TabResult>();
    if (kind === "preview" || kind === "paused") return map;
    const model = patternModel(exercise.notes, barTicks, exercise.bars);
    occurrences(model, 0, 1, TAKE_BARS)
      .filter((n) => n.at < held - barTicks / 32)
      .forEach((n, i) => map.set(n.id, RECIPE[i % RECIPE.length]));
    return map;
  }, [kind, exercise, barTicks, held]);
  const position = useMemo(() => {
    if (kind !== "playing") return held;
    const started = performance.now();
    const perMs = (BPM * 960) / 60000;
    return () => held + (performance.now() - started) * perMs;
  }, [kind, held]);
  return (
    <div className="tabstrip-shot">
      <header>
        <span className="tabstrip-shot-kick">{mode === "preview" ? "Next up" : "Bar 2 of 2"}</span>
        <span className="tabstrip-shot-title">{exercise.title}</span>
      </header>
      <TabStrip
        notes={exercise.notes}
        barTicks={barTicks}
        patternBars={exercise.bars}
        takeBars={TAKE_BARS}
        position={position}
        bpm={BPM}
        playing={kind === "playing"}
        results={results}
        mode={mode}
        marker={kind === "paused" ? held : null}
      />
    </div>
  );
}

const CSS = `
html,body,#root{margin:0;height:100%}
body{background:var(--bg-primary,#0a0705);color:var(--text-primary,#fbf5ea);font-family:Inter,system-ui,sans-serif}
.tabstrip-shot{box-sizing:border-box;height:100%;display:flex;flex-direction:column;gap:18px;padding:28px clamp(12px,2vw,28px)}
.tabstrip-shot header{display:flex;flex-direction:column;gap:6px}
.tabstrip-shot-kick{font:600 13px/1 "Barlow Condensed",sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--text-secondary,#c9bba6)}
.tabstrip-shot>.tabstrip{flex:1 1 auto;max-height:440px}
.tabstrip-shot-title{font:700 clamp(28px,4vw,44px)/1 "Barlow Condensed",sans-serif}
`;

export async function mountTabStripShot(kind: TabStripShotKind, themeId: string): Promise<void> {
  const theme = THEMES.find((t) => t.id === themeId);
  if (theme) applyTheme(theme);
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  // `&pack=<pathId>&ex=<step.exercise>` draws any Exercise in the scene, for content review.
  const params = new URLSearchParams(window.location.search);
  const source = { pack: params.get("pack") ?? SOURCES[kind].pack, exercise: params.get("ex") ?? SOURCES[kind].exercise };
  const exercise = await loadExercise(source.pack, source.exercise);
  const root = document.getElementById("root")!;
  ReactDOM.createRoot(root).render(<Scene kind={kind} exercise={exercise} />);
  await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  if (!document.querySelector('[data-testid="tabstrip"] .tabstrip-note')) {
    await new Promise((r) => setTimeout(r, 100));
  }
  window.__SHOT_READY__ = true;
}
