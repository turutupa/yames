# Jam, second pass — the build brief (shared by every worker)

Read this, then your own file. Then `plans/JAM_UX_DECISIONS.md` in full —
every entry there is decided and each is a line item in one of the briefs —
and `plans/tasks/jam/BRIEF.md` for the rules that still hold (worktree
branch names with hyphens, the gates, the store hazard, no push, no merge,
the report format). The boards are on the canvas linked at the top of the
decision log; working files in `design/jam-v2/` (static HTML at 1440×900).

## The branch

The feature branch is **`jam-v2`**, from `jam`. Your worktree may start on a
stale branch: run `git log --oneline -1`; if HEAD is not the tip of
`jam-v2`, run `git checkout -B <your-branch> jam-v2`. Nothing is committed
on `jam` or `main`. The orchestrator merges into `jam-v2`, which becomes a
pull request on top of #50.

## The contract (already on the branch; use, do not change)

`src/jam/types.ts` grew, additively: `Jam.vibe`, `Jam.variation`,
`Jam.bassVoice`, `Jam.keysVoice`, `Jam.customKit`, `Jam.pinnedShape`,
`Jam.shapesFollow`, the unions `JamBassVoice` and `JamKeysVoice`, and on
`JamEngineConfig`: `bassVoice`, `keysVoice`, `customKit`. `src/ipc.ts` grew
`pickKitFolder()` and `inspectKitFolder(dir)`, whose Rust commands W20
registers. The guard test `src/ipc.commands.test.ts` is red on the branch
until W20 merges; nobody else touches it.

## Who owns what

| Worker | Area | Does not touch |
|---|---|---|
| W18 | `src/` screens, hooks, locales, hints; `src/jam/compile.ts` | `src/jam/vibes.ts`, `grooves.ts`, `intensity.ts`, `src-tauri/` |
| W19 | new `src/jam/vibes.ts`, `src/jam/intensity.ts`, `src/jam/grooves.ts` (additions), `src/jam/bassline.ts` (per-voice tweaks), their tests, `plans/JAM_REFERENCES.md` | every screen file, `compile.ts`, `src-tauri/` |
| W20 | `src-tauri/` | `src/` |
| W21 | `generate_sounds.py` (new section), new `src-tauri/sounds/kit_raw_*.wav`, `KITS.md` | `.rs`, `src/` |

W18 integrates W19's exports; the orchestrator hands W18 the export list
when W19 lands, and W18 keeps a stub (`vibes: []`) until then.

## Gates

The five in `plans/tasks/jam/BRIEF.md`, plus for W20 the jitter probe with
`--jam-swap --jam-move --jam-take`, plus for W21 `scripts/sounds/
measure_kits.py`. Report as before.
