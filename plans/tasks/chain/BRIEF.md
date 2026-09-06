# Preset chains — the build brief

A chain is an ordered list of preset-shaped steps with a configured gap between
each pair. Loading one and pressing play walks the steps on its own, so a
practice session can be set up once and then not touched.

The design is settled. Read **`plans/UI_DECISIONS.md` U9.1–U9.7** before
anything else, and look at the artboard: `design/app/PresetChain.dc.html`,
served at `http://localhost:1421/design/app/PresetChain.dc.html` at 1440×900.

The decisions, in short:

- **U9.1 — steps are copies, not pointers.** A step holds a full config. No
  `presetId` reference: editing "Warmup" must never silently change a chain.
- **U9.2 — two axes per gap.** The *trigger* says when to move on (`manual`,
  `bars`, `seconds`). The *transition* says how to arrive (`cut`, `countIn`,
  `rest`). Both are needed: "after two minutes, with two bars of count-in".
- **U9.3 — the bar always finishes.** `engine.rs` resets `measure_beat` to 0
  the instant `beat_groups` changes, so an unquantised swap cuts the current
  bar in half. Every switch defers to the next downbeat. This is a rule.
- **U9.4 — it is called a chain.** `chain`, in the UI and the code.
- **U9.6 — a chain ends.** Default is stop after the last step. `repeat` is a
  count on the chain (1 = once through, N = N times, 0 = forever), not a
  toggle and not a property of the last gap.
- **U9.7 — the transport counts.** "Step 1 of 4", "next in 5 bars", and a way
  to skip ahead.

## Shape

```ts
export type ChainTrigger =
  | { kind: "manual" }
  | { kind: "bars"; bars: number }
  | { kind: "seconds"; seconds: number };

export type ChainTransition =
  | { kind: "cut" }
  | { kind: "countIn"; bars: number }
  | { kind: "rest"; bars: number };

export type ChainStep = {
  id: string;
  name: string;
  /** A full configuration. Copied in, never referenced. (U9.1) */
  bpm: number;
  subdivision: number;
  beatGroups: number[];
  freeMode?: boolean;
  soundType: string;
  volume: number;
  /** How the gap AFTER this step behaves. The last step's is unused. */
  trigger: ChainTrigger;
  transition: ChainTransition;
};

export type Chain = {
  id: string;
  name: string;
  createdAt: number;
  steps: ChainStep[];
  /** 1 = once through. 0 = until stopped. (U9.6) */
  repeat: number;
};
```

Chains persist in the Tauri store beside presets, under their own key
(`chains`). Follow exactly how `presets` is loaded and saved — see `src/ipc.ts`
and the store usage in `MainWindow.tsx`.

## Parity rules that apply here

- Every user-visible string is an i18n key in `src/locales/<lang>/<ns>.json`,
  **all 15 languages**, properly translated. `npm test` fails on a missed key
  and flags keys that became dead.
- Never `git add -A`. Add explicit paths. `src/main.tsx` in the orchestrator's
  checkout carries a local dev-shim import that must never be committed.
- Gates before reporting: `npx tsc --noEmit` and `npm test`, both clean.
- The rail hides its labels when collapsed, so every rail button needs an
  `aria-label`; there are tests asserting it.
- Comments say *why*, not *what*. Read `git log -5` for the house style before
  writing commit messages.

## Do NOT

- Do not run `npm run tauri dev`. It collides with the owner's app-data store
  and port. The browser preview at `localhost:1421` is the main checkout's.
- Do not touch `src-tauri/` unless your section says to.
- Do not build the count-in transition's *audio*. U9.5 records that the engine's
  count-in is welded to the speed ramp (`ramp_warming_up`, `speed_ramp.warmup_*`)
  and needs unwelding first. Until then `countIn` is stored and shown, and the
  runtime treats it as `cut` with a TODO naming U9.5.
