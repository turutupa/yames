# Contributing to Yames

Thanks for considering a contribution! This document covers everything you need
to get a change merged.

## License

Yames is licensed under the **GNU General Public License v3.0 or later
(GPL-3.0-or-later)**. By submitting a pull request you agree that your
contribution will be released under the same license. See [`LICENSE`](LICENSE)
for the full text.

The GPL-3.0 requirement is driven by the
[aubio](https://aubio.org/manual/latest/) dependency (GPL-2+), which is
compiled statically into the Rust backend.

## Development setup

```sh
# Node toolchain via nvm (the project pins Node 20)
export PATH="$HOME/.nvm/versions/node/v20.15.1/bin:$HOME/.cargo/bin:$HOME/.local/bin:$PATH"

# Install JS dependencies
npm install          # or: bun install

# Run the desktop app (Tauri + Rust + Vite)
npm run tauri dev
```

The first cold Rust compile takes 1-2 minutes. Subsequent rebuilds are fast.

## Translations

Yames uses react-i18next. English (`src/locales/en.json`) is the source of
truth and the fallback for every missing key — a partial translation degrades
gracefully.

To add a language:

1. Copy `src/locales/en.json` to `src/locales/<tag>.json`
   (e.g. `de.json`, `ja.json`, `ko.json`). The file name becomes the language
   tag; the tag is the only place that needs to be in the name.
2. Translate every value. Run `bun run test` — the Vitest suite
   (`src/test/i18n.locales.test.ts`) enforces:
   - the key set exactly matches `en.json` (no missing, no extra keys),
   - every `{{placeholder}}` token from `en.json` is preserved,
   - a top-level `"_name"` with the language's native name (e.g. `"Deutsch"`).
3. Done — no other files need edits. The language appears in
   Settings → General automatically, and the choice persists.

Keep keys in the same order as `en.json` to keep diffs reviewable. Add new
strings to `en.json` first; other languages will fall back to English until
they are updated. Never rename or merge existing keys without updating
`en.json`.

## Fast validation (no full app boot required)

Run these in order after any change — they catch the vast majority of
regressions without waiting for a Tauri compile:

```sh
bun run tsc --noEmit   # strict TypeScript, no emit
bun run test           # Vitest unit suite
bun run build          # tsc + Vite production build
```

Rust unit tests:

```sh
bun run test:rust        # or: npm run test:rust
```

Use the script rather than a bare `cargo test --lib`: on Windows the
unit-test harness needs a Common-Controls v6 manifest that
`scripts/rust-test.mjs` supplies, and will not load without it.

## Commit conventions

| Prefix | Effect |
|--------|--------|
| `feat:` | triggers a versioned release via CI |
| `fix:` | triggers a versioned release via CI |
| `refactor:`, `chore:`, `docs:` | no release triggered |

Pick the prefix that matches the actual change scope. A docs-only edit should
not bump a release.

## Pull request checklist

- [ ] `bun run tsc --noEmit` passes (zero errors)
- [ ] `bun run test` passes
- [ ] `bun run build` passes
- [ ] Rust tests pass (`bun run test:rust`)
- [ ] No large-file rewrites — edit surgically (see AGENTS.md)
- [ ] Commit message follows the convention above
