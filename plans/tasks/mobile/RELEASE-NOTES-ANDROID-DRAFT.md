# Android release notes — a draft (M12, 2026-09-20)

> **Draft. Nothing here is published and nothing here cuts a release.**
> When the owner is happy with the words, the block below becomes the
> body of the `release` commit that ships Android, with the version
> number of the day. The voice is the one the notes already use —
> `git log --grep "^release" -3 --format=%B` on `main`.
>
> Two things to settle before it goes out: the **version number**, and
> whether the phone build rides the next desktop release or gets one of
> its own. The draft below is written as a release of its own, with the
> desktop's own line at the end saying nothing about it changed.

---

```
release v1.3.0 — Yames on a phone

**New**

- Yames runs on Android. The same metronome, the same drills, the same
  setlists, the same zen mode and the same band — laid out for a screen
  you hold in one hand, with the modes along the bottom where your thumb
  already is.
- The click keeps going with the screen off. Put the phone down, pick
  the instrument up; the tempo sits in the notification shade with a
  stop button on it, and a phone call pauses the click and hands it back
  when you hang up.
- Jam came with it. Pick a vibe, press play, and the drummer, the bass
  player and the keyboard player follow you through the changes, with
  the cheat sheet a tap away — every chord in the key with its shapes on
  the neck, and the scales drawn out fret by fret.
- Everything you save stays on the phone. No account, no ads, nothing
  sent anywhere.
- All fifteen languages, all thirteen themes.

**Not on a phone yet**

- The practice coach, playing into the microphone, a footswitch, and
  Songs. Everything else the app does, it does here.

**Improved**

- The desktop app is unchanged in this release.
```

---

## Notes for whoever publishes it, not for the notes

- **"Yames on a phone"** rather than "Android support". The subtitle
  line in these notes has always said what a player gets, not what was
  built — "a much smaller download, and the same band", "a band that
  plays along, and a cheat sheet to read while it does".
- **The screen-off bullet is the one that matters** and it is second on
  purpose. A metronome that stops when the screen locks is not a
  metronome you can practise with, and it is the first thing anybody
  will test.
- **"Not on a phone yet" is its own heading**, above Improved rather
  than buried in it. The four things are named plainly and nothing is
  promised. It is the same sentence as the website's, deliberately.
- **No word about how it is installed.** The notes are read inside the
  app and on the releases page; the three steps live on the website,
  where somebody who has not got it yet is standing.
- **Nothing here says Rust, WebView, APK or SDK**, and the app's own
  "what's new" card renders this text, so nothing can.
- If Android ships inside a desktop release instead, drop the last line
  and fold these bullets into that release's **New**, keeping the
  order: the app, then the screen-off behaviour, then Jam.
