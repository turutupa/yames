# W4 stage A — the alphaTab spike, answered

> Run 2026-09-20 on the owner's Windows 11 laptop, `@coderline/alphatab`
> **1.8.4**, node v24.19.0, Playwright Chromium, vite 6.4.3 on port 5391.
> The spike scripts were throwaway (`SONGS.md` §B) and are not committed;
> every number below says how it was produced so it can be re-run.
> Fixtures were written by hand. No real song was imported at any point
> (`SONGS.md` S0.4).

**Verdict: alphaTab reads and draws. Nothing is blocked, no fallback is
needed.** Five things have to be configured a particular way, and one of
them (workers) is not optional. They are all in §7.

---

## 1. Licence — clear, and by the letter

`node_modules/@coderline/alphatab/LICENSE` is the stock MPL-2.0 text.
The phrase "Incompatible With Secondary Licenses" appears in it four
times, and **every one of them is the licence describing itself**, not a
notice attached to this code:

| line | what it is |
|---|---|
| 29 | §1.5, the definition of the term |
| 196 | §3.3, the clause that *permits* the GPL combination |
| 374 | the heading of Exhibit B — the template |
| 377 | the body of Exhibit B — the template |

The notice is only *attached* if a project copies Exhibit B into its own
file headers. alphaTab does not. `LICENSE.header`, which is the header
stamped into every shipped file, is Exhibit A verbatim and stops there —
`grep -n Incompatible LICENSE.header` finds nothing, and neither does a
recursive grep over the whole of `dist/`.

So MPL-2.0 §3.3 applies: a Secondary License (§1.12 names the GNU GPL
2.0-or-later, which covers our GPL-3) may be used for the Larger Work.
Yames is `GPL-3.0-or-later` in `package.json`. **Compatible.**

Three notes for whoever writes the about screen:

- alphaTab vendors MIT and BSD-3-Clause code (TinySoundFont, SFZero, the
  Haxe standard library, SharpZipLib, NVorbis, libvorbis), all listed in
  `LICENSE.header`. All GPL-compatible.
- MPL is per-file copyleft: if we ever *edit* an alphaTab file, that file
  stays MPL and must be published. We do not edit it, we configure it.
- The Bravura music font is SIL OFL, and we ship it (§5). Its licence
  text (`Bravura-OFL.txt`) has to travel with it.

## 2. The model gives us everything `SongScore` needs

Every field in the contract has a source. This was checked by parsing a
hand-written alphaTex with a repeat, first and second endings, a tempo
change, a 7/8 bar, a chord, a tie, a hammer-on, a capo, a six-string and
a four-string drop-D tuning, and printing the model.

| `SongScore` field | where it comes from | checked |
|---|---|---|
| `title`, `artist` | `score.title`, `score.artist` | yes |
| `tuning` | `track.staves[0].tuning` — MIDI notes, **highest string first**, exactly as the contract wants | yes |
| `capo` | `staves[0].capo` | yes |
| `ticksPerQuarter: 960` | alphaTab's own resolution **is 960**. A 4/4 bar measured 3840 ticks, a 7/8 bar 3360. No rescaling needed. | yes |
| `bars[]` unrolled | `MidiFileGenerator.tickLookup.masterBars` — the **played** order, repeats and endings already expanded | yes |
| `bars[].printedBar` | `playedBar.masterBar.index` | yes |
| `bars[].startTick` / `lengthTicks` | `playedBar.start` / `end - start` | yes |
| `meterMap` | `masterBar.timeSignatureNumerator` / `Denominator` | yes |
| `tempoMap` | `playedBar.tempoChanges[]` → `{tick, tempo}` | yes |
| `sections` | `masterBar.section.text` (null when the file has none) | yes |
| `notes[].string` / `fret` | `note.string` / `note.fret` — **see the numbering trap below** | yes |
| `notes[].midi` | `note.realValue` — the sounding pitch, capo **already added** | yes |
| `tieFromPrevious` | `note.isTieDestination` | yes |
| `ghost` / `dead` / `accent` | `note.isGhost` / `isDead` / `accentuated` | yes |
| techniques | `isHammerPullDestination`, `slideOutType`, `hasBend`, `vibrato`, `isPalmMute`, `harmonicType`, `isLetRing` | yes |
| soft onsets | `note.isHammerPullDestination` — true on the note that is *not* picked, which is precisely what `soft` means | yes |

### The unroll, and the two tick bases

This is the single most load-bearing thing the spike found, because
getting it wrong would put every note in the wrong bar.

**`beat.playbackStart` is bar-relative. `MasterBarTickLookup.start` is
absolute, in played order.** A third field, `beat.absolutePlaybackStart`,
is absolute in *printed* order and is the wrong one for us — on a
repeated song it has one value for a bar that is played twice.

Measured on a two-bar repeat played twice:

```
bar.index=1  masterBar.start=3840
   playbackStart=0     absolutePlaybackStart=3840
   playbackStart=960   absolutePlaybackStart=4800
...
played     0..3840  -> printed 0
played  3840..7680  -> printed 1
played  7680..11520 -> printed 2
played 11520..15360 -> printed 0     <- the repeat
played 15360..19200 -> printed 1
played 19200..23040 -> printed 2
```

So the importer's rule is one line, and it is the whole unroll:

```
playedTick = playedBar.start + beat.playbackStart
```

A repeat with a first and second ending came out as printed bars
`0,1,2, 0,1,3, 4` — correct, with `printedBar` mapping each played bar
back to the page.

### The string-numbering trap

**alphaTab numbers strings from the lowest; Guitar Pro and our contract
number them from the highest.** `tuning[]` is highest-first, but
`note.string` is 1 = lowest. On a six-string, alphaTab's `string: 4` is
the contract's string 3.

```
tuning = [76, 71, 67, 62, 57, 52]   // e5 b4 g4 d4 a3 e3, capo 2
note.string = 4, fret = 3  ->  realValue = 72
check: tuning[6 - 4] = 67 (g4);  67 + 3 fret + 2 capo = 72  ✓
```

So: `tuningEntry = tuning[tuning.length - note.string]`, and
`contractString = tuning.length - note.string + 1`. Both are in
`import.ts` with this comment on them.

## 3. The cursor can be driven from outside, with no audio at all

This was the question that could have sunk the whole approach. It does
not.

`PlayerMode.EnabledExternalMedia` (added in 1.5) exists for exactly our
case — its own doc says "an external audio/video source is used as time
axis". The Yames engine is that external source.

With `playerMode = EnabledExternalMedia`, **`api.tickPosition = tick`
moves the cursor**, with no handler registered, no `play()` called and
the player state left at `Paused`. Measured, with the cursor's transform
read out of the DOM:

```
tick     0 -> translate(121.096px, 97px)
tick  1920 -> translate(302.116px, 97px)     same system, further right
tick 19200 -> translate(83.5859px, 344px)    a later system
```

**`AudioContext` was constructed 0 times.** The page's `AudioContext`
constructor was wrapped in a counter before alphaTab loaded; after a
full render and twenty seeks it had never been called. alphaTab's player
opens no WebAudio, loads no soundfont, and starts no clock of its own.

Cost per seek: **120 sequential seeks took 2.6 ms — 0.02 ms each.** At
60 fps that is 0.13 % of a frame. Driving this off the engine's beat
events is free.

`api.play()` must never be called. It works (the cursor then interpolates
between beats on alphaTab's own animation), and that is the failure mode
to avoid: two clocks. The rule for stage C is that Songs sets
`tickPosition` and nothing else.

## 4. It takes our colours

`settings.display.resources.*Color` are respected. With
`--text-primary: #e8e8ea` fed in, **every `fill` in the rendered SVG was
`#E8E8EA`** — alphaTab painted nothing in its own black.

All thirteen were then checked one at a time in stage C, driving the
real screen: **13/13 draw the tab, and 13/13 draw it in that theme's own
`--text-primary`.** Two things came out of doing that rather than
assuming it, and the second was a bug nobody would have reported as a
theming problem.

**The fonts are separate from the colours, and one of them is a crash.**
`RenderingResources` carries fonts as well as colours, and left alone
alphaTab draws in Georgia and Arial under every theme. Setting them from
`--font-family` is easy; the trap is that alphaTab hands the family name
to `document.fonts.check()`, **which throws on a family that is not a
valid CSS identifier**. The Manuscript theme's stack opens with
`Source Serif 4`. Unquoted, the check raises `Could not resolve '1em
Source Serif 4' as a font`, the exception escapes alphaTab's font loader
before anything is drawn, and **Manuscript's tab is blank** — one theme
in thirteen, with no error on screen and nothing in the console a user
would see.

alphaTab is inconsistent here: it quotes a family with a space when it
writes the SVG's `font:` shorthand, and does not when it builds the
string for `fonts.check`. So the quotes have to come from our side, and
the cost is that families which needed them arrive double-quoted in the
drawn CSS and match nothing — the stack then falls to the next family,
so Manuscript draws in Georgia rather than Source Serif 4 and Ember in
Outfit rather than Segoe UI. That trade is taken deliberately: every
theme draws its tab, in a face from its own stack. Worth raising
upstream; if alphaTab quotes both paths, one `.map` in `TabStage.tsx`
goes away.

`tests/layout/songs.spec.ts` pins it under four themes — Manuscript, one
light, one dark, and one with a quoted multi-word family.

**Still not right, and small:** five or six runs of text per score — the
title, the subtitle, the effect marks, the bar numbers — are still drawn
in Georgia and Arial. They are not among the font fields
`RenderingResources` exposes as own properties, so the loop that themes
the rest does not reach them, and naming them explicitly did not take
either. Cosmetic, identical under all thirteen themes, and not worth
more of this wave.

Because the resources are plain settings rather than CSS, a theme change
means re-applying them and re-rendering. That is a re-render, not a
reload — the parsed `Score` is kept.

## 5. Loading it: workers, fonts, and the asset protocol

### `csp: null`

`src-tauri/tauri.conf.json` sets `app.security.csp` to `null`, so Tauri
injects **no CSP at all**. Every worry in this category — blob workers,
`worker-src`, `font-src` — is moot for us today. Worth knowing that it is
a decision someone could reverse; if a CSP is ever added, §5 of this file
is the list of things it has to allow.

### Workers are off, and that is not optional

The entry module builds its worker from
`new URL("./alphaTab.worker.mjs", import.meta.url)`. Vite's dependency
optimiser rewrites the module's location and the URL resolves to
`/node_modules/.vite/deps/alphaTab.worker.mjs`, **which does not exist**.
Measured, with `useWorkers = true`:

```
WORKERS ON: never finished -> waitForFunction: Timeout 20000ms exceeded
failed requests: /node_modules/.vite/deps/alphaTab.worker.mjs :: net::ERR_FAILED
```

Not an error dialog, not a caught exception — the render simply never
completes. So **`settings.core.useWorkers = false`**, and stage C sets it
explicitly with this paragraph as the comment.

The supported fix is alphaTab's bundler plugin, and **that would be a
second dependency**: the copy inside this package
(`@coderline/alphatab/vite`) prints "deprecated. Please use the new
`@coderline/alphatab-vite` npm package" on import. I did not add it. The
brief allows me one package, synchronous rendering measures fine (§6),
and the thing it would buy us — keeping layout off the main thread — is
worth less here than anywhere else, because **Yames's click is in Rust on
a cpal thread and cannot be touched by anything the webview does.** If
the UI stall ever becomes the complaint, that package is the answer and
this paragraph is why it was not taken now.

### The music font

Bravura is resolved through the package's own exports map, so vite hashes
it into `dist/assets` on build and serves it in dev, with no `public/`
directory and no binary committed:

```ts
import bravuraWoff2 from "@coderline/alphatab/font/Bravura.woff2?url";
import bravuraWoff  from "@coderline/alphatab/font/Bravura.woff?url";
settings.core.smuflFontSources = new Map([
  [FontFileFormat.Woff2, bravuraWoff2],
  [FontFileFormat.Woff,  bravuraWoff],
]);
```

Verified: `200 /node_modules/@coderline/alphatab/dist/font/Bravura.woff2`,
and the score renders. Left to its default, alphaTab guesses a
`fontDirectory` from its own script location and asks for
`/node_modules/.vite/deps/font/Bravura.woff2`, which vite answers with
JavaScript — the browser then says `OTS parsing error: invalid
sfntVersion` and rendering stops on "Font not available". Same class of
bug as the worker, same fix: never let it guess a URL.

A hashed asset under `dist/assets` is served by Tauri's asset protocol
exactly like every other built asset, so this needs no capability and no
Rust. Note it makes Songs the **first part of the app with a local
font** — everything else pulls its typefaces from Google Fonts over the
network (`index.html`).

### Neither soundfont ships

`dist/soundfont/` is 2.3 MB and is only for the synthesiser. We never
load it. Nothing imports it, so vite never sees it.

## 6. Numbers

Two hundred bars of eighth notes, written by the spike, one track drawn.

| | |
|---|---|
| parse, 200 bars | **79–84 ms** (three runs) |
| layout + render, 200 bars, workers off | **352–417 ms** (four runs) |
| SVG partials produced | 102, total surface 900 × 10076 px |
| cursor seek | **0.02 ms** |
| library, minified | 1.07 MB raw, **0.27 MB gzip**, 0.21 MB brotli |
| Bravura.woff2 | 306 KB |
| added to the installer | ≈ 0.6 MB (font + gzipped JS) |

The last line is the one to weigh against v1.2.1, which was a release
specifically about making the download *smaller* (`05284291`).

**Corrected after stage C measured it.** This section first said the JS
would be "a lazy chunk the moment `SongsView` is imported the way
`JamView` is". That was wrong on the facts: `JamView` is a plain static
import, `MainWindow` lazy-loads nothing, and importing Songs the same
way put all of alphaTab in the main bundle — 3,181 kB raw / 917 kB
gzipped, against 628 kB gzipped before. So stage C split it on purpose,
and Songs is the app's only lazy chunk:

```
dist/assets/index-*.js      1,969.01 kB │ gzip: 628.02 kB   the app
dist/assets/import-*.js     1,207.47 kB │ gzip: 288.72 kB   alphaTab, on demand
dist/assets/TabStage-*.js       2.67 kB │ gzip:   1.27 kB   the renderer
dist/assets/Bravura-*.woff2   313.35 kB                     the music font
```

The main bundle is back to exactly where it was. A player who never
opens Songs downloads the font and nothing else, and the font is the one
remaining unconditional cost — fetching it on first use is a later
decision, not this wave's. Only `.woff2` ships: the `.woff` beside it is
550 kB of fallback for browsers no Tauri webview uses.

Two things had to move to make the split real, because both dragged
alphaTab back in: `SONG_FILE_EXTENSIONS` now lives in `types.ts` (the
file input needs it on a screen that has not loaded the renderer), and
`useSongsSession` imports the importer with a dynamic `import()` inside
the two functions that need it.

A caveat on the render figure, stated plainly: it was measured in
headless Chromium, not in WebView2, and not inside the real app with the
rail, the transport and thirteen stylesheets around it. It is the right
order of magnitude and it is not a blocker; it is not a promise about
the shipped app. The frame-gap probe I wrote to catch a Jam-style freeze
returned 0 ms, which I do not believe — the render completes before
enough animation frames pass to measure — so **UI stall during a big
render is still unmeasured**, and the honest position is that it is
unknown rather than fine.

## 7. What stage B and C must do, because of the above

1. `settings.core.useWorkers = false`. Not negotiable (§5).
2. `smuflFontSources` set from a vite-resolved URL. Never the default (§5).
3. `playerMode = EnabledExternalMedia`; drive with `api.tickPosition`;
   never call `api.play()` (§3).
4. Convert string numbers — alphaTab counts from the lowest (§2).
5. Set resource fonts as well as colours, and re-render on theme change (§4).

## 8. The real import paths work, not just alphaTex

alphaTex is what the fixtures are written in, but nobody imports one. So
the byte paths were checked too, with files this spike produced:

- **Guitar Pro 7.** `Gp7Exporter` wrote the hand-written score to 3343
  bytes of `.gp` (a PK zip), and `loadScoreFromBytes` read it back with
  the title, artist, tempo, both tracks, the tuning, the capo and the
  unrolled repeat all identical to the original. The binary importer is
  therefore exercised end to end without a copyrighted file existing.
- **MusicXML.** A `score-partwise` document written by hand, with a TAB
  clef, six `staff-tuning` elements and `<capo>2</capo>`, imported with
  `tuning=[64,59,55,50,45,40]` and `capo=2` read correctly.
- **Unreadable bytes** throw (`UnsupportedFormatError`, or an
  `EndOfReaderError` from whichever importer got furthest). Catchable, so
  the importer can turn it into a sentence a musician can act on.

Guitar Pro 3–6 (`.gp3`/`.gp4`/`.gp5`) go through a different importer
(`Gp3To5Importer`) and are **untested here** — I have no such file and
will not download one. The risk is low (it is the same library's
best-travelled path) and it is named here rather than hidden.

## 8b. The layout suite's port is shared, and it lies when it collides

Not alphaTab, and it cost an hour, so it is written down where the next
worker will find it.

`npm run test:layout` starts vite on port 5390 with
`reuseExistingServer: !process.env.CI`. **A dev server left running by
another worktree answers on that port, and Playwright happily uses it** —
so the suite runs the real tests against a *different worker's source*.
What it looked like from here: twenty-four tests passing and every
`songs` scene reporting "the scene did not build", with the harness
listing shot ids that do not exist on this branch. `fits.ts` already
guards the case where the port belongs to a different app entirely; it
cannot tell one Yames worktree from another.

If a layout run reports scenes that should exist as missing, kill every
`vite` process on the machine — not just this worktree's — and run
again. While several workers share one laptop, layout runs are not safe
to run in parallel.

## 9. Two things that are not alphaTab's fault, and block stage C's shape

Found while reading how Jam was wired, and they change what stage C can
build:

- **There is no file drop to hook.** `dragDropEnabled: false` on both
  windows in `tauri.conf.json`, pinned by
  `src/tauriConfig.dragDrop.test.ts`, because turning it on breaks the
  HTML5 drag that reorders the library. Turning it back on is not mine to
  do. It is also not needed: with Tauri's own handler disabled the
  webview keeps ordinary DOM drop events, `dataTransfer.files` included,
  so Songs reads the dropped file as bytes in JS without touching Rust.
- **The Tauri file dialog cannot be reached from the frontend.**
  `tauri-plugin-dialog` is a Rust dependency and `tauri_plugin_dialog::init()`
  is registered, but the JS package is not installed, `default.json`
  grants no `dialog:` permission, and the one existing picker
  (`pick_kit_folder`) is our own Rust command. Reaching it would mean a
  new Rust command — which this task is told not to write — or a second
  npm package plus a capability edit in a file I do not own. And it would
  return a *path*, which the frontend still cannot read without
  `plugin-fs` on top. A plain `<input type="file">` opens the same
  Windows dialog, needs neither, and hands over the bytes directly. That
  is what stage C uses.
