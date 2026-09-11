# M05a — Release prep that needs no build: privacy page, store copy, CI draft, licence text

Size: S. Branch: `mob/m05a-release-prep`, from `mobile`. Feeds M05
and M06. Parallel-safe with everything; touches only `docs/`,
`.github/workflows/`, `plans/`, `LICENSE`-adjacent text.

## Goal

Everything Google Play and the App Store will ask for that can be
written before there is an APK, so M05 is plumbing rather than
writing.

## Why (context you would otherwise lack)

- Read `plans/MOBILE_IMPLEMENTATION_PLAN.md` §1, §5 and §6.
- Yames collects nothing: no accounts, no telemetry, no network calls
  except the desktop coach's optional model download (which does not
  exist on mobile) and the desktop updater (same). Google Play requires
  a privacy-policy URL for every app and a Data Safety declaration; the
  App Store asks the same in App Privacy. The page must say, in plain
  words, that nothing leaves the phone.
- Wording rule for anything a user reads (store listings, the privacy
  page, the website): musicians, not developers. No "Rust", "Tauri",
  "WebView", "APK", "open source stack" language. "Free and open
  source" is fine; the licence name is fine in the legal line.
- Yames is GPL-3.0-or-later. Distributing GPL code through the App
  Store needs an explicit additional permission from the copyright
  holders because the store's terms add restrictions the GPL forbids.
  The owner holds almost all of the copyright; one external
  contribution exists — the i18n system from PR #8 (2026-09-02). With
  aubio out of the mobile binary (M01), no other GPL code is involved.
  You draft the exception text and a short consent request; the owner
  sends it. Do not add the exception to `LICENSE` yet — the owner
  decides when.
- The website is `docs/` (GitHub Pages, `pages.yml`). Do not change
  the download section: there is nothing to download yet.
- `release.yml` on `main` is the desktop release and the owner is
  cutting a release today. **Do not modify `release.yml`.** Write a
  separate `.github/workflows/android.yml` that runs only on
  `workflow_dispatch`, so merging it changes nothing until someone
  clicks it.

## Deliverables

1. `docs/privacy.html` — same visual style as `docs/index.html`
   (reuse `style.css`), reachable from the site footer. Sections:
   what the app stores on the device (settings, presets, setlists,
   drill history), what it sends (nothing), permissions it asks for
   (none on mobile v1; microphone is not requested), contact
   (`https://github.com/turutupa/yames/issues`). Date it. Add it to
   `docs/sitemap.xml`.
2. `plans/tasks/mobile/store-listing.md` — Play and App Store copy:
   app name, short description (≤ 80 chars), full description, five
   feature bullets, keywords (App Store, ≤ 100 chars), category,
   content rating answers (no user content, no ads, no purchases),
   Data Safety / App Privacy answers ("no data collected"), and a
   screenshot shot-list (which screens, which state, portrait) for
   the M05 worker to capture. Both stores' copy in the same document,
   marked where they differ.
3. `.github/workflows/android.yml` — `workflow_dispatch` only. Installs
   JDK 17, Android SDK + NDK (use `android-actions/setup-android`),
   the four Android Rust targets, runs `npm ci`, then
   `npx tauri android build --apk` with the mobile flags M01 chooses —
   read `plans/tasks/mobile/M01-rust-gates.md` and leave a clearly
   marked placeholder for the flag if M01 has not merged. Uploads the
   unsigned APK as a workflow artifact. Signing is M05's job; leave a
   commented block showing where the keystore secrets go
   (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`).
4. `plans/tasks/mobile/LICENSE-EXCEPTION.md` — the App Store
   additional-permission text for the owner's code (base it on the
   widely used wording for GPL projects distributed through the App
   Store; keep it short and quote nothing longer than needed), plus a
   five-line consent request the owner can paste to the PR #8 author,
   and a note on where the text would go (`LICENSE` notice, About
   screen legal line).
5. `plans/tasks/mobile/PLAY-CONSOLE-CHECKLIST.md` — the exact steps
   for a new personal Play developer account: fee, identity
   verification, closed-test requirement (12 testers, 14 days),
   what "production access" means, the app-signing choice (Play App
   Signing on, upload key kept), and the privacy/data-safety forms —
   one line each with what to enter, drawn from the store-listing
   document. Same for App Store Connect in a second section (bundle
   id `com.yames.metronome`, TestFlight, App Review notes).

## Rules

- No changes to `release.yml`, `ci.yml`, `pages.yml`, `snap.yml`.
- No changes under `src/` or `src-tauri/`.
- Do not run the app.
- `bun run tsc --noEmit` and `bun run test` still pass (you touched
  nothing they cover; run them anyway and say so).

## Report

Files written, anything you were unsure about in the store
requirements (say what you checked it against), open questions for M05
and M06. Open a PR against `mobile`; do not merge; do not push to
`main`.
