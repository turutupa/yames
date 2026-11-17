# Revamp, wave 2: the learning side looks like the 3D mocks

Read `CLAUDE.md`, then `plans/tasks/revamp/BRIEF.md` (wave 1: its rules still hold),
`plans/tasks/revamp/STATUS.md`, then this.

## Why

The owner signed off on the design in `plans/revamp/concept/mocks-3d-v2/` (three.js, recovered
2026-11-16; serve the folder over http and open `index.html`, it needs network for unpkg and
Google Fonts). Wave 1 built that flow in plain 2D. This wave makes the app's learning side **be**
that design: the fretboard is the hero on every learning screen, Tools are secondary.

What the owner described: "a really cool almost 3D fretboard done in three.js, and the entire
experience shifted to you hopping in, selecting how much time you have, and it starts giving you
exercises for those 20 minutes."

## The design, in short (read `mocks-3d-v2/README.md` and the code for the rest)

- One continuous scene behind the screens: the neck alone, nut to fret 24, no body, on an
  abstract backdrop. Pearl dots 3 5 7 9 12 (and up), side dots, quiet fret numbers; markers sit
  behind the fret, above the strings. Sharp, no depth of field.
- Whole-neck views on Today, Paths, Progress. On practice screens a large zoom of the active
  frets plus a crisp nut-to-24 overview strip showing where you are.
- Key text is HTML over the canvas. Each screen marks a DOM slot and the camera frames the neck
  into it, so layouts hold at any size.
- Note colours: `aim` amber, `tone` green, `tens` blue, `clash` red, `box` cream, `dim` brown.
- Type: Barlow Condensed (display), Fraunces (the big serif "Today"), Inter (body).

## Rules (wave 1's, plus)

1. **The click is sacred.** The canvas renders on demand: on a change, and for a short animation
   after it. No continuous loop on calm screens. During a Take, at most 30 fps, and only while
   something moves. Pause when the window is hidden. Lazy-load three.js (dynamic `import`); it
   must not be in the main chunk. Changes under `src-tauri/` are out of scope for this wave.
2. **Tools lose nothing.** The tool screens stay as they are. Tab hotkeys `tab-1`..`tab-5` keep
   their meaning, `tab-today` too. Every parity test stays green; update a parity test only where
   it encodes the old rail on purpose, and say so in the commit.
3. **No logic changes behind the screens.** Planner, runner, grading, `useSessionRun` and the
   store are wave 1's and are tested; this wave is the stage and the screens. If a screen needs
   data that isn't exposed, add a selector, not new behaviour.
4. **A fallback for every screen.** Without WebGL2 (WebKitGTK on Linux is the risk), every screen
   still works, with the existing SVG `components/fretboard/Fretboard.tsx` in the slot.
5. Local and free; no telemetry. Fonts load the way the app already loads its others (the
   Google Fonts link in `index.html`).
6. Commit as you go on your own branch, conventional prefixes, never `release`. No push, no
   merge, no `tauri dev`. Work only in your worktree.

## The contract between the two workers

`src/stage3d/api.ts` (W4 writes it first, W5 codes against it from the start):

```ts
export type NeckKind = "aim" | "tone" | "tens" | "clash" | "box" | "dim";
export type NeckNote = { string: 1 | 2 | 3 | 4 | 5 | 6; fret: number; kind: NeckKind; label?: string };
export type NeckView =
  | { kind: "whole" }                          // Today, Paths, Progress: the hero angle
  | { kind: "zoom"; from: number; to: number } // practice: these frets large, plus the overview strip
  | { kind: "hidden" };                        // tools, settings: no canvas work at all
export interface NeckStage {
  /** Frame the neck into `slot` (a DOM element the screen renders); null = full stage. */
  setView(view: NeckView, slot: HTMLElement | null, opts?: { instant?: boolean }): void;
  setNotes(notes: NeckNote[], opts?: { fade?: number }): void;
  /** A heard note: the string vibrates and the spot flashes in its colour. */
  pluck(string: number, fret: number, kind: NeckKind): void;
  /** The warm sweep along the frets, for arrivals and results. */
  sweep(): void;
  /** A Take is running: cap the frame rate (rule 1). */
  setTakeRunning(on: boolean): void;
  /** True when WebGL2 is up; false means the SVG fallback is drawing. */
  readonly is3d: boolean;
}
export function useNeck(): NeckStage;              // a no-op stage when none is mounted
export function NeckStageProvider(props: { children: React.ReactNode }): JSX.Element;
```

String 1 is high E, 6 is low E (as in the packs). W5 may add to this file only by asking W4
through the orchestrator.

## Workers

| Worker | Branch | Owns | Must not touch |
|---|---|---|---|
| W4 stage | `revamp-3d-stage` | `src/stage3d/**`, `three` in `package.json`, `?shot=` scenes for the stage, layout tests for it | `src/containers/**`, `src/session/**`, `src-tauri/**` |
| W5 screens | `revamp-3d-screens` | `src/containers/session/**`, `src/styles/session.css`, `Rail.tsx`, a Tools list screen, `index.html` fonts, session strings in all 15 locales, parity test updates the rail needs | `src/stage3d/**` beyond a stub, `src/session/**` logic, `src-tauri/**` |

Both branch from `revamp`. Each merges back when green; the orchestrator integrates.

## Gates

```sh
npx tsc --noEmit && npx vitest run && npm run build
npx playwright test --trace off   # test:layout; the session and stage specs at least
```
`npm run build` must show three.js in its own chunk, not in `index-*.js`. Every `?shot=` scene
must reach `__SHOT_READY__`. Headless Chromium has WebGL through SwiftShader (launch args
`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` if a test needs them).

Machine: DGX Spark (aarch64 Linux, 20 cores). `node_modules`: copy with `cp -al` from
`~/projects/yames-revamp/node_modules`, then `npm install --no-save --no-package-lock three@0.170.0 @types/three@0.170.0` (W4 only).

## Report

What works end to end, screenshots of the screens you changed (save under
`~/projects/.preview/<worker>/`), the gate output, `git diff --stat revamp...HEAD`, and anything
you need from the other worker.
