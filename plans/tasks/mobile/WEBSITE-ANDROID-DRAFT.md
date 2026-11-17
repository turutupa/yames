# The website's Android row — a draft (M12, 2026-09-20)

> **Draft. Nothing here is published.** `docs/` is untouched by this
> task; when the owner is happy with the words, the two blocks below
> replace the `.android-row` that is in `docs/index.html` today.
>
> Tone follows the download section already on the page — short lines,
> plain verbs, no explaining. The rule the whole port follows applies
> to every word here: musicians, not developers. The only technical
> word allowed is **APK**, and only where the file is actually named,
> because that is what the phone will call the thing it downloads and a
> reader who does not see the word will think they got the wrong file.

---

## What is there now

```html
<div class="android-row">
  <a class="btn btn--sm" id="android-btn" href="…/releases/latest">
    <svg …><rect x="6" y="2" width="12" height="20" rx="2.5" /><line … /></svg>
    <span>Android</span>
  </a>
  <span class="android-note">
    Install it straight from the file, or wait for it on Google Play.
  </span>
</div>
```

One line, and it leaves the reader at a page of release files with no
idea which one is theirs or what to do with it. The three steps below
are the whole of what is missing.

---

## 1. The row

Same shape, same button, a shorter note — the steps do the explaining
now, so the note only has to say what the button gives you.

```html
<div class="android-row">
  <a class="btn btn--sm" id="android-btn" href="…/releases/latest">
    <svg …>…</svg>
    <span>Android</span>
  </a>
  <span class="android-note">
    Free, and it works the same on a phone. Google Play is coming.
  </span>
</div>
```

## 2. The three steps, under the row

A musician doing this on the phone in their hand, with the phone in
their hand. Three steps, because that is how many there are.

```html
<details class="android-how">
  <summary>How to install it on your phone</summary>
  <ol>
    <li>
      Open this page on your phone and press <strong>Android</strong>.
      The file is called <code>yames.apk</code>.
    </li>
    <li>
      Your phone will ask whether to let your browser install it. Say
      yes — it only asks the first time.
    </li>
    <li>Open Yames and press play.</li>
  </ol>
  <p class="android-how__note">
    Not on a phone yet: the practice coach, playing into the microphone,
    a footswitch, and Songs.
  </p>
</details>
```

### The same words, plain

> **How to install it on your phone**
>
> 1. Open this page on your phone and press **Android**. The file is
>    called `yames.apk`.
> 2. Your phone will ask whether to let your browser install it. Say
>    yes — it only asks the first time.
> 3. Open Yames and press play.
>
> Not on a phone yet: the practice coach, playing into the microphone,
> a footswitch, and Songs.

---

## Why it is worded this way

- **"Press Android"**, not "download the APK". The button says Android;
  the sentence should say what the reader will see themselves doing.
  The file's name is given once, right after, so the notification that
  appears makes sense.
- **"whether to let your browser install it"** is what the phone
  actually asks — it names the browser, not Yames. A musician who is
  told to expect a question about Chrome is not alarmed by one.
- **"it only asks the first time"** is the sentence that stops people
  abandoning it half way. The permission is per-browser and it sticks.
- **No word for what this is called.** Everyone who already knows the
  word does not need the page to say it; everyone else is put off by
  it. Three steps and a file name is the whole story.
- **One sentence on what is missing**, at the end, where someone who
  wants it will look and nobody else has to read it. Four things by
  name, no apology, no date.
- `<details>` rather than always-open: the download section's whole job
  is one button, and a numbered list under it would make the phone look
  like the hard way to get the app. Closed by default, one tap open.

## Two things for whoever publishes this

1. `.android-how` and `.android-how__note` need styles in
   `docs/style.css`. The summary should read at the weight of
   `.android-note`; the list wants the page's normal body size, not
   smaller — this is the one place on the site someone is reading
   instructions rather than a pitch.
2. The note says "Google Play is coming". The day the listing is live,
   this whole block becomes the Play badge and the steps go. They are
   the answer to "there is no store listing yet", not a permanent part
   of the page.
