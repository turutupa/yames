# Yames — Free Desktop Metronome for Musicians

**Yet Another Metronome Everyone Skips** — but not just another metronome.

A free, open-source desktop metronome app for macOS, Windows, and Linux. Sub-millisecond precision, always-on-top floating widget, zen mode, drill practice, tap tempo, and 10 beautiful themes. Built with Rust for musicians who actually practice.

[Website](https://turutupa.github.io/yames) &nbsp;·&nbsp; [Download](https://github.com/turutupa/yames/releases/latest) &nbsp;·&nbsp; [Request a Feature](https://github.com/turutupa/yames/issues/new)

<br>

<p align="center">
  <img src="docs/img/zen/obsidian-cosmos-zen.png" alt="Yames metronome zen mode" width="520">
</p>

<br>

## Why Yames?

Every metronome app feels like an afterthought. A clock face. A blinking dot. Yames is a musician-grade desktop metronome you actually *want* on screen while you play.

- **Sub-millisecond precision** — Rust audio engine with hybrid sleep + spin-wait. No drift. No jitter.
- **Always-on-top widget** — A floating mini-player that stays visible over your DAW, tabs, or sheet music.
- **Zen mode** — Fullscreen immersive visuals that pulse with the beat. Focus. Breathe. Play.
- **Speed drill** — Auto-ramping BPM to push your technique without breaking flow.
- **Tap tempo** — Tap your way to the right BPM.
- **10+ themes** — Dark, light, vibrant, minimal. Make it yours.
- **Global hotkeys** — Play, stop, nudge BPM — all without switching windows.
- **Cross-platform** — Native app for macOS (Apple Silicon & Intel), Windows, and Linux.
- **Lightweight** — Native Rust + Tauri build, uses minimal CPU and memory.

<br>

<p align="center">
  <img src="docs/img/widget/neon-widget.png" alt="floating widget" width="320">
  &nbsp;&nbsp;
  <img src="docs/img/widget/obsidian-widget.png" alt="floating widget" width="320">
</p>

<br>

## Install

Download the latest release for your platform:

| Platform | Link |
|----------|------|
| macOS | [Download .dmg](https://github.com/turutupa/yames/releases/latest) |
| Windows | [Download .msi](https://github.com/turutupa/yames/releases/latest) |
| Linux | [Download .AppImage](https://github.com/turutupa/yames/releases/latest) |

Or build from source:

```bash
npm install
npm run tauri build
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Stop |
| `↑` / `↓` | BPM ±1 |
| `Shift+↑` / `Shift+↓` | BPM ±5 |
| `1` – `4` | Set subdivision |
| `Tab` | Toggle widget mode |

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
