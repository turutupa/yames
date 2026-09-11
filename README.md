# Yames — Free Desktop Metronome for Musicians

**Yet Another Metronome Everyone Skips** — except this one, you won't.

[Website](https://yames.app) &nbsp;·&nbsp; [Download](https://github.com/turutupa/yames/releases/latest) &nbsp;·&nbsp; [Request a Feature](https://github.com/turutupa/yames/issues/new) &nbsp;·&nbsp; [![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

<br>

<p align="center">
  <img src="docs/img/metronome/obsidian-metronome.webp" alt="Yames — metronome with practice coach" width="700">
</p>

<p align="center">
  <img src="docs/img/zen/velvet-cosmos.webp" alt="Zen mode — Velvet theme" width="380">
  &nbsp;
  <img src="docs/img/drill/aurora-drill.webp" alt="Speed drill — Aurora theme" width="380">
</p>

<br>

## Table of Contents

- [Why does this exist?](#why-does-this-exist)
- [Designed for Practice](#designed-for-practice)
- [The Metronome](#the-metronome)
- [Speed Drill](#speed-drill)
- [Practice Coach](#practice-coach)
- [Zen Mode](#zen-mode)
- [Floating Widget](#floating-widget)
- [Hands-Free Control](#hands-free-control)
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

## Designed for Practice

Yames is built around one principle: **your hands stay on the instrument.** Everything is designed so you never have to break your flow to interact with the app.

- **Practice coach** — an AI-powered companion that listens to your playing, gives real-time feedback, session reports, and adaptive tempo coaching. Runs fully local — no internet, no data sent anywhere.
- **MIDI controller & footswitch support** — map any MIDI CC, note, or program change to play/stop, BPM adjust, subdivisions, and more. Assign a footswitch and control everything without looking up.
- **Full keyboard shortcuts** — every action has a hotkey. Rebindable in settings.
- **Presets** — save your exercise configurations (BPM, subdivision, time signature) and switch between them instantly. No setup time between exercises.
- **Zen mode** — fullscreen immersive visuals. No UI, no distractions. Just rhythm.
- **Always-on-top floating widget** — sits over your DAW, tabs, or sheet music. Draggable, minimal, out of your way.

The metronome is a background tool. You should be focused on playing, not on the screen.

<br>

## The Metronome

The classic view. BPM control, subdivisions, time signatures, and a clean visual pulse that tracks every beat. Pick from 13 handcrafted themes — dark, light, vibrant, minimal — and make it feel like yours.

<p align="center">
  <img src="docs/img/metronome/obsidian-metronome.webp" alt="Yames metronome — Obsidian theme" width="380">
  &nbsp;&nbsp;
  <img src="docs/img/metronome/aurora-metronome.webp" alt="Yames metronome — Aurora theme" width="380">
</p>

<br>

## Speed Drill

This is where it gets serious. Set a start BPM, an end BPM, and how many bars to hold each step. Hit play and the metronome auto-ramps for you — pushing your technique incrementally without breaking flow. No more fiddling with the tempo dial mid-practice.

Choose your ramp strategy: **Linear** (steady climb), **Zigzag** (push and pull), or **Adaptive** (coming soon — the app adjusts tempo based on how you're playing).

If you're working on a passage, building speed on scales, or training endurance, Drill is the single best reason to use Yames.

<p align="center">
  <img src="docs/img/drill/obsidian-drill.webp" alt="Yames speed drill mode" width="380">
  &nbsp;&nbsp;
  <img src="docs/img/drill/neon-drill.webp" alt="Yames drill mode — Neon theme" width="380">
</p>

<br>

## Practice Coach

An AI-powered practice companion that listens to your playing and gives real-time feedback — without you ever looking at the screen.

- **Live coaching during practice** — audio notifications (chime or natural voice) when the coach has feedback. Comments appear in a chat-like feed for you to read when you pause.
- **Automatic detection** — the coach knows if you're doing grid exercises or playing freely. Feedback adapts: timing accuracy for exercises, groove and tempo stability for musical playing.
- **Session reports** — timeline-based breakdown of your practice with stats per segment. Not just numbers — natural language summaries that tell you what to work on.
- **Adaptive drill mode** — set a start BPM and a target (or no ceiling). The coach adjusts tempo based on your accuracy: pushes you when you're comfortable, backs off when you struggle.
- **Preset history** — track your progress on specific exercises over weeks and months. See how your comfortable BPM and accuracy improve over time.
- **Conversational** — ask the coach questions about your session: "How was my timing?" "What should I focus on?"
- **Fully local** — runs entirely on your machine. No internet required, no data sent anywhere.

<br>

## Zen Mode

Press `Z` and everything else disappears. Fullscreen immersive visuals that pulse with the beat — particles, waves, cosmos. No UI chrome, no distractions. Just rhythm and breath. This is where deep practice happens.

<p align="center">
  <img src="docs/img/zen/obsidian-cosmos.webp" alt="Yames zen mode — Obsidian Cosmos" width="380">
  &nbsp;&nbsp;
  <img src="docs/img/zen/neon-cosmos.webp" alt="Yames zen mode — Neon Cosmos" width="380">
</p>

<br>

## Floating Widget

A tiny always-on-top mini-player that sits over your DAW, sheet music, tabs, or whatever you're reading. It's draggable, transparent, and gets out of your way. Toggle it with `W`.

<p align="center">
  <img src="docs/img/widget/neon-widget.webp" alt="Yames floating widget — Neon" width="280">
  &nbsp;&nbsp;
  <img src="docs/img/widget/obsidian-widget.webp" alt="Yames floating widget — Obsidian" width="280">
  &nbsp;&nbsp;
  <img src="docs/img/widget/aurora-widget.webp" alt="Yames floating widget — Aurora" width="280">
</p>

<br>

## Hands-Free Control

Everything is a hotkey. MIDI controllers and footswitches are first-class. You never have to reach for the mouse during practice.

<table>
<tr>
<td valign="top">

**Metronome**

| Key | Action |
|-----|--------|
| `Space` | Play / Stop |
| `↑` | BPM +5 |
| `↓` | BPM −5 |
| `Shift+↑` | BPM +1 |
| `Shift+↓` | BPM −1 |
| `]` | Subdivision + |
| `[` | Subdivision − |
| `1` | Quarter notes |
| `2` | Eighth notes |
| `3` | Triplets |
| `4` | Sixteenth notes |
| `T` | Time signature + |
| `Shift+T` | Time signature − |

</td>
<td valign="top">

**View**

| Key | Action |
|-----|--------|
| `Z` | Zen mode |
| `F` | OS fullscreen |

**Navigation**

| Key | Action |
|-----|--------|
| `W` | Toggle floating widget |
| `B` | Toggle presets sidebar |
| `C` | Toggle practice coach |
| `Cmd+1` | Metronome tab |
| `Cmd+2` | Drill tab |
| `Cmd+,` | Settings |

</td>
</tr>
</table>

All keyboard shortcuts are rebindable. MIDI bindings are fully customizable — connect any controller and map CC, Note, or Program Change messages to any action.

<br>

## Screenshots

> **[Browse the full gallery →](docs/img/)**

<details>
<summary>Metronome themes</summary>
<br>
<p align="center">
  <img src="docs/img/metronome/neon-metronome.webp" width="260">
  <img src="docs/img/metronome/lavender-metronome.webp" width="260">
  <img src="docs/img/metronome/prism-metronome.webp" width="260">
</p>
<p align="center">
  <img src="docs/img/metronome/ivory-metronome.webp" width="260">
  <img src="docs/img/metronome/arctic-metronome.webp" width="260">
  <img src="docs/img/metronome/mono-metronome.webp" width="260">
</p>
<p align="center">
  <img src="docs/img/metronome/sand-metronome.webp" width="260">
  <img src="docs/img/metronome/velvet-metronome.webp" width="260">
  <img src="docs/img/metronome/aurora-metronome.webp" width="260">
</p>
<p align="center">
  <img src="docs/img/metronome/ash-metronome.webp" width="260">
  <img src="docs/img/metronome/ember-metronome.webp" width="260">
  <img src="docs/img/metronome/manuscript-metronome.webp" width="260">
</p>
</details>

<details>
<summary>Drill themes</summary>
<br>
<p align="center">
  <img src="docs/img/drill/neon-drill.webp" width="260">
  <img src="docs/img/drill/lavender-drill.webp" width="260">
  <img src="docs/img/drill/prism-drill.webp" width="260">
</p>
<p align="center">
  <img src="docs/img/drill/ivory-drill.webp" width="260">
  <img src="docs/img/drill/arctic-drill.webp" width="260">
  <img src="docs/img/drill/mono-drill.webp" width="260">
</p>
<p align="center">
  <img src="docs/img/drill/sand-drill.webp" width="260">
  <img src="docs/img/drill/velvet-drill.webp" width="260">
  <img src="docs/img/drill/aurora-drill.webp" width="260">
</p>
<p align="center">
  <img src="docs/img/drill/ash-drill.webp" width="260">
  <img src="docs/img/drill/ember-drill.webp" width="260">
  <img src="docs/img/drill/manuscript-drill.webp" width="260">
</p>
</details>

<details>
<summary>Floating widgets</summary>
<br>
<p align="center">
  <img src="docs/img/widget/neon-widget.webp" width="200">
  <img src="docs/img/widget/obsidian-widget.webp" width="200">
  <img src="docs/img/widget/aurora-widget.webp" width="200">
  <img src="docs/img/widget/lavender-widget.webp" width="200">
</p>
<p align="center">
  <img src="docs/img/widget/prism-widget.webp" width="200">
  <img src="docs/img/widget/ivory-widget.webp" width="200">
  <img src="docs/img/widget/mono-widget.webp" width="200">
  <img src="docs/img/widget/sand-widget.webp" width="200">
</p>
<p align="center">
  <img src="docs/img/widget/ash-widget.webp" width="200">
  <img src="docs/img/widget/ember-widget.webp" width="200">
  <img src="docs/img/widget/manuscript-widget.webp" width="200">
  <img src="docs/img/widget/velvet-widget.webp" width="200">
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

Rust · Tauri v2 · React · TypeScript · cpal · rodio

## Development

```bash
npm install
npm run tauri dev
```

Requires [Rust](https://rustup.rs/) (stable) and [Node.js](https://nodejs.org/) 18+.

## Contributing

Contributions are welcome. Here's where help would make the biggest impact:

- **Practice Coach** — LLM inference pipeline, session analysis, adaptive tempo logic
- **New themes** — add your own visual style to the theme system (CSS variables + a name in settings)
- **Bug fixes & platform polish** — especially Windows and Linux edge cases
- **Tests** — Rust unit tests for the audio engine; TypeScript tests for UI logic

**Getting started:**

```sh
npm install
npm run tauri dev   # requires Rust stable + Node.js 18+
```

Run `npm run tsc -- --noEmit` after changes to catch type errors. See [`AGENTS.md`](AGENTS.md) for the full dev workflow.

Found a bug or have a feature idea? [Open an issue](https://github.com/turutupa/yames/issues/new). PRs are welcome — keep them focused and include a short description of what changed and why.

## License

[GPL-3.0](LICENSE) — free to use, modify, and distribute. See [LICENSE](LICENSE) for details.
