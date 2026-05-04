# Yames — Free Desktop Metronome for Musicians

**Yet Another Metronome Everyone Skips** — except this one, you won't.

[Website](https://turutupa.github.io/yames) &nbsp;·&nbsp; [Download](https://github.com/turutupa/yames/releases/latest) &nbsp;·&nbsp; [Request a Feature](https://github.com/turutupa/yames/issues/new)

<br>

<p align="center">
  <img src="docs/img/zen/obsidian-cosmos-zen.png" alt="Yames zen mode — immersive fullscreen metronome" width="600">
</p>

<br>

## Table of Contents

- [Why does this exist?](#why-does-this-exist)
- [The Metronome](#the-metronome)
- [Speed Drill](#speed-drill)
- [Tap It](#tap-it)
- [Zen Mode](#zen-mode)
- [Floating Widget](#floating-widget)
- [Keyboard-Driven](#keyboard-driven)
- [Screenshots](#screenshots)
- [Install](#install)
- [Built With](#built-with)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

<br>

## Why does this exist?

Because most metronome apps out there feel outdated — clunky interfaces, too many taps to start, or just not something you want staring at you for an hour of practice. Yames exists because musicians deserve a metronome that looks great, sounds precise, and gets out of your way the moment you hit play.

The goal is simple: **reduce the friction between you and your practice.** Open it, hit play, and disappear into the music.

Built with Rust for sub-millisecond precision. No drift. No jitter. No Electron. Just a native app that runs quietly and sounds exactly when it should.

<br>

## The Metronome

The classic view. BPM control, subdivisions, time signatures, and a clean visual pulse that tracks every beat. Pick from 10+ handcrafted themes — dark, light, vibrant, minimal — and make it feel like yours.

<p align="center">
  <img src="docs/img/metronome/obsidian-metronome.png" alt="Yames metronome — Obsidian theme" height="310">
  &nbsp;&nbsp;
  <img src="docs/img/metronome/aurora-metronome.png" alt="Yames metronome — Aurora theme" height="310">
</p>

<br>

## Speed Drill

This is where it gets serious. Set a start BPM, an end BPM, and how many bars to hold each step. Hit play and the metronome auto-ramps for you — pushing your technique incrementally without breaking flow. No more fiddling with the tempo dial mid-practice. Just you and the climb.

If you're working on a passage, building speed on scales, or training endurance, Drill is the single best reason to use Yames.

<p align="center">
  <img src="docs/img/drill/obsidian-drill.png" alt="Yames speed drill mode" height="310">
  &nbsp;&nbsp;
  <img src="docs/img/drill/neon-drill.png" alt="Yames drill mode — Neon theme" height="310">
</p>

<br>

## Tap It

Practice keeping tempo by tapping along. Yames tracks your accuracy — how consistent your taps are — so you can see your internal clock improving over time.

<p align="center">
  <img src="docs/img/tapit/obsidian-tap.png" alt="Yames tap tempo" height="310">
  &nbsp;&nbsp;
  <img src="docs/img/tapit/prism-tap.png" alt="Yames tap tempo — Prism theme" height="310">
</p>

<br>

## Zen Mode

Press `Z` and everything else disappears. Fullscreen immersive visuals that pulse with the beat — particles, waves, cosmos. No UI chrome, no distractions. Just rhythm and breath. This is where deep practice happens.

<p align="center">
  <img src="docs/img/zen/obsidian-cosmos-zen.png" alt="Yames zen mode — Cosmos" height="310">
  &nbsp;&nbsp;
  <img src="docs/img/zen/neon-pulse-zen.png" alt="Yames zen mode — Neon Pulse" height="310">
</p>

<br>

## Floating Widget

A tiny always-on-top mini-player that sits over your DAW, sheet music, tabs, or whatever you're reading. It's draggable, transparent, and gets out of your way. Toggle it with `W`.

<p align="center">
  <img src="docs/img/widget/neon-widget.png" alt="Yames floating widget — Neon" width="280">
  &nbsp;&nbsp;
  <img src="docs/img/widget/obsidian-widget.png" alt="Yames floating widget — Obsidian" width="280">
  &nbsp;&nbsp;
  <img src="docs/img/widget/aurora-widget.png" alt="Yames floating widget — Aurora" width="280">
</p>

<br>

## Keyboard-Driven

Everything is a hotkey. You never have to reach for the mouse during practice.

| Key | Action |
|-----|--------|
| `Space` | Play / Stop |
| `↑` / `↓` | BPM ±5 |
| `Shift+↑` / `Shift+↓` | BPM ±1 |
| `[` / `]` | Cycle subdivision |
| `T` | Cycle time signature |
| `Z` | Zen mode (fullscreen visuals) |
| `F` | OS fullscreen |
| `W` | Toggle floating widget |
| `⌘1` / `⌘2` / `⌘3` | Switch tabs (Metronome / Drill / Tap It) |
| `⌘,` | Settings |

Global shortcuts work even when Yames isn't focused — play/stop, BPM nudge, and widget toggle all work from any app.

<br>

## Screenshots

> **[Browse the full gallery →](docs/img/)**

<details>
<summary>Metronome themes</summary>
<br>
<p align="center">
  <img src="docs/img/metronome/neon-metronome.png" width="260">
  <img src="docs/img/metronome/lavender-metronome.png" width="260">
  <img src="docs/img/metronome/prism-metronome.png" width="260">
</p>
<p align="center">
  <img src="docs/img/metronome/ivory-metronome.png" width="260">
  <img src="docs/img/metronome/arctic-metronome.png" width="260">
  <img src="docs/img/metronome/mono-metronome.png" width="260">
</p>
<p align="center">
  <img src="docs/img/metronome/sand-metronome.png" width="260">
  <img src="docs/img/metronome/velvet-metronome.png" width="260">
  <img src="docs/img/metronome/aurora-metronome.png" width="260">
</p>
</details>

<details>
<summary>Drill themes</summary>
<br>
<p align="center">
  <img src="docs/img/drill/neon-drill.png" width="260">
  <img src="docs/img/drill/lavender-drill.png" width="260">
  <img src="docs/img/drill/prism-drill.png" width="260">
</p>
<p align="center">
  <img src="docs/img/drill/ivory-drill.png" width="260">
  <img src="docs/img/drill/arctic-drill.png" width="260">
  <img src="docs/img/drill/mono-drill.png" width="260">
</p>
<p align="center">
  <img src="docs/img/drill/sand-drill.png" width="260">
  <img src="docs/img/drill/velvet-drill.png" width="260">
  <img src="docs/img/drill/aurora-drill.png" width="260">
</p>
</details>

<details>
<summary>Floating widgets</summary>
<br>
<p align="center">
  <img src="docs/img/widget/neon-widget.png" width="200">
  <img src="docs/img/widget/obsidian-widget.png" width="200">
  <img src="docs/img/widget/aurora-widget.png" width="200">
  <img src="docs/img/widget/lavender-widget.png" width="200">
</p>
<p align="center">
  <img src="docs/img/widget/prism-widget.png" width="200">
  <img src="docs/img/widget/ivory-widget.png" width="200">
  <img src="docs/img/widget/mono-widget.png" width="200">
  <img src="docs/img/widget/sand-widget.png" width="200">
</p>
</details>

<br>

## Install

| Platform | Download |
|----------|----------|
| macOS (Apple Silicon) | [.dmg](https://github.com/turutupa/yames/releases/latest) |
| macOS (Intel) | [.dmg](https://github.com/turutupa/yames/releases/latest) |
| Windows | [.exe installer](https://github.com/turutupa/yames/releases/latest) |
| Linux | [.AppImage / .deb](https://github.com/turutupa/yames/releases/latest) |

**Homebrew** (macOS):
```bash
brew install --cask --no-quarantine turutupa/tap/yames
```

**Winget** (Windows):
```bash
winget install turutupa.yames
```

Or build from source:
```bash
npm install
npm run tauri build
```

## Built With

Rust · Tauri v2 · React · TypeScript · rodio

## Development

```bash
npm install
npm run tauri dev
```

Requires [Rust](https://rustup.rs/) (stable) and [Node.js](https://nodejs.org/) 18+.

## Contributing

Found a bug? Want a feature? [Open an issue](https://github.com/turutupa/yames/issues/new). PRs welcome.

## License

[MIT](LICENSE) — free to use, modify, and distribute.
