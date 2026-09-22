/**
 * Every block, in every theme, on one page.
 *
 * A workbench, not a screen. It is reached only at `/blocks-gallery.html` on
 * the dev server — nothing in the app links to it, no route reaches it, and
 * Vite's production build has one entry (`index.html`), so it is not in the
 * shipped bundle at all. The same arrangement the screenshot harness uses.
 *
 * It exists because thirteen themes times eight blocks is a hundred and four
 * pictures, and the only way to know they are all right is to look at them.
 * The layout suite measures the two narrowest widths here for the same
 * reason: happy-dom computes no geometry, so "the chord box is squeezed to
 * thirty pixels" is invisible to every unit test in the repo.
 *
 * The headings on this page are written in plain English rather than through
 * i18n, deliberately: no player ever sees them, and fifteen translations of
 * "What gets dropped" would be fifteen files of work for an audience of one.
 * Everything INSIDE a block goes through i18n like anything else.
 */

import type { CSSProperties } from "react";
import { THEMES } from "../../themes";
import { CoachBlocks } from "./CoachBlocks";
import { resolveCoachAnswer, type CoachBlockContext } from "./resolve";
import type { CoachAction } from "./types";
import "../../styles/global.css";

// ---------------------------------------------------------------------------
// A world for the references to point at
// ---------------------------------------------------------------------------

/**
 * Sixty-four bars, played straight through.
 *
 * No `printedBars`, and deliberately: a score with no repeats in it prints
 * the bars it plays, so the gallery reads the way the owner expects and the
 * two-numberings case is pinned where it belongs, in the tests.
 */
const SCORE = { id: "wish-you-were-here", title: "Wish You Were Here", bars: 64 };

export const OLDER = "0a3f1c62-1d64-4c2e-9d31-3f9a2b5c7e01";
export const NEWER = "5b8e2d47-9c10-4a55-8f2b-7d4c6e1a9b33";

export const GALLERY_CONTEXT: CoachBlockContext = {
  scores: [SCORE],
  attempts: [
    // The ids the store gives an attempt: UUIDs the frontend mints, not row
    // numbers. The catalogue believed otherwise until W14.
    { id: "0a3f1c62-1d64-4c2e-9d31-3f9a2b5c7e01", scoreId: SCORE.id, playedAt: "2026-09-12" },
    { id: "5b8e2d47-9c10-4a55-8f2b-7d4c6e1a9b33", scoreId: SCORE.id, playedAt: "2026-09-19" },
  ],
  presets: [{ id: "warmup", name: "Warm-up" }],
  jams: [{ id: "slow-blues-a", name: "Slow blues in A" }],
  progressFor: () => [
    { at: "2026-09-08", percent: 61 },
    { at: "2026-09-11", percent: 70 },
    { at: "2026-09-15", percent: 85 },
    { at: "2026-09-19", percent: 94 },
  ],
};

// ---------------------------------------------------------------------------
// The answers
// ---------------------------------------------------------------------------

type Scene = { name: string; note: string; answer: unknown };

export const GALLERY_SCENES: Scene[] = [
  {
    name: "The verdict",
    note: "text · tabExcerpt · action — what A4 and A5 ask for, and what the review screen is built from.",
    answer: {
      blocks: [
        {
          type: "text",
          text: "The last four bars ran ahead three times out of four — about a sixteenth early each time.",
        },
        { type: "tabExcerpt", score: SCORE.id, fromBar: 17, toBar: 20, attempt: NEWER },
        {
          type: "action",
          action: { kind: "loopBars", score: SCORE.id, fromBar: 17, toBar: 20, bpm: 96 },
        },
      ],
    },
  },
  {
    name: "The neck",
    note: "fretboard (a scale) · fretboard (a chord, in a named position) · chordShape.",
    answer: {
      blocks: [
        { type: "fretboard", show: { of: "scale", root: "A", scale: "minorPentatonic" } },
        {
          type: "fretboard",
          show: { of: "chord", chord: "Am7" },
          position: "rootOn5",
        },
        { type: "chordShape", chord: "Am7", shape: 2 },
      ],
    },
  },
  {
    name: "On the bass",
    note: "The same two blocks, told they are for a bass. Four strings, four-string grips.",
    answer: {
      blocks: [
        {
          type: "fretboard",
          show: { of: "scale", root: "Bb", scale: "dorian" },
          instrument: "bass",
        },
        { type: "chordShape", chord: "Bbm7", shape: 0, instrument: "bass" },
      ],
    },
  },
  {
    name: "Over time",
    note: "progress · take · compare. The last two are slots: their drawings arrive with Songs.",
    answer: {
      blocks: [
        { type: "text", text: "A month ago this passage topped out at 61. Today you held 94." },
        { type: "progress", score: SCORE.id, fromBar: 17, toBar: 20 },
        { type: "take", attempt: NEWER, fromBar: 17, toBar: 20 },
        { type: "compare", attempts: [OLDER, NEWER] },
      ],
    },
  },
  {
    name: "Every button",
    note: "All six actions. Six is the cap, so this answer is exactly full.",
    answer: {
      blocks: [
        { type: "action", action: { kind: "loopBars", score: SCORE.id, fromBar: 33, toBar: 40 } },
        { type: "action", action: { kind: "ramp", fromBpm: 90, toBpm: 120 } },
        { type: "action", action: { kind: "clickSubdivision", subdivision: 2 } },
        { type: "action", action: { kind: "loadPreset", preset: "warmup" } },
        { type: "action", action: { kind: "loadJam", jam: "slow-blues-a" } },
        { type: "action", action: { kind: "comeBack", days: 1 } },
      ],
    },
  },
  {
    name: "What gets dropped",
    note: "Six references that mean nothing. One sentence survives; the rest render as nothing, never as a guess.",
    answer: {
      blocks: [
        { type: "text", text: "Only this line should be on screen." },
        { type: "chordShape", chord: "Hm7", shape: 0 },
        { type: "chordShape", chord: "C", shape: 25 },
        { type: "fretboard", show: { of: "scale", root: "C", scale: "minorPentatonic" }, position: "rootOn6", instrument: "bass" },
        { type: "tabExcerpt", score: SCORE.id, fromBar: 60, toBar: 300 },
        { type: "tabExcerpt", score: "a-song-nobody-imported", fromBar: 1, toBar: 4 },
        { type: "compare", attempts: [NEWER, NEWER] },
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

function SceneBlock({ scene, onAction }: { scene: Scene; onAction: (a: CoachAction) => void }) {
  const { blocks, dropped } = resolveCoachAnswer(scene.answer, GALLERY_CONTEXT);
  return (
    <section className="gallery-scene">
      <h3 className="gallery-scene-name">{scene.name}</h3>
      <p className="gallery-scene-note">{scene.note}</p>
      <CoachBlocks blocks={blocks} onAction={onAction} />
      {dropped.length > 0 && (
        <ul className="gallery-dropped" data-testid="gallery-dropped">
          {dropped.map((drop) => (
            <li key={`${String(drop.at)}-${drop.reason}`}>
              <code>{drop.type ?? "?"}</code> — {drop.detail}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function BlocksGallery() {
  // The gallery is a mirror, not a rehearsal: pressing a button here says so
  // and changes nothing, because half the actions want a transport that does
  // not exist yet and the other half would reach the owner's real settings.
  const onAction = (action: CoachAction) => {
    console.log("coach block action", action);
  };

  return (
    <div className="gallery">
      <header className="gallery-head">
        <h1>The coach&rsquo;s blocks</h1>
        <p>
          Every block in the catalogue, drawn in all {THEMES.length} themes. Nothing links here;
          it is only ever <code>/blocks-gallery.html</code> on the dev server.
        </p>
      </header>

      {THEMES.map((theme) => (
        <section
          key={theme.id}
          className="gallery-theme"
          data-theme={theme.id}
          data-theme-group={theme.group}
          style={{
            ...(theme.vars as unknown as CSSProperties),
            background: theme.vars["--bg-primary"],
            color: theme.vars["--text-primary"],
            fontFamily: theme.vars["--font-family"],
          }}
        >
          <h2 className="gallery-theme-name">
            {theme.name} <span className="gallery-theme-group">{theme.group}</span>
          </h2>
          <div className="gallery-scenes">
            {GALLERY_SCENES.map((scene) => (
              <SceneBlock key={`${theme.id}-${scene.name}`} scene={scene} onAction={onAction} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default BlocksGallery;
