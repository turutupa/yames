# Shipping Yames on Android — what the owner does, in order

Everything a worker can do is done. What is left needs the owner's own
credentials, the owner's own Google account, and a phone. This is that
list, in the order it has to happen, with the exact commands and the
exact field values.

`plans/tasks/mobile/PLAY-CONSOLE-CHECKLIST.md` is the long-form console
walkthrough and `plans/tasks/mobile/store-listing.md` is the copy. This
file is the order of operations and the parts only the owner can do.

---

## 0. Start the fourteen-day clock first

Play will not grant production access to a new personal developer
account until **twelve testers have been opted into a closed test for
fourteen continuous days**. That clock is longer than everything else on
this page put together, and it does not start until the testers actually
opt in.

So: create the developer account and recruit the testers **before**
touching anything below. The checklist's Part 1 §1 and §6 are the two
sections to do on day one.

---

## 1. Generate the upload key

This is a credential. No worker has ever held it, and the repository has
never seen it — the gradle config reads it from the environment and
nothing else.

```bash
keytool -genkeypair -v \
  -keystore yames-upload.jks \
  -alias yames \
  -keyalg RSA -keysize 4096 -validity 10000
```

`keytool` is in the JDK: `C:\Users\alber\android\jdk-17.0.20.1+1\bin`.
It will ask for a keystore password, then the certificate fields (name,
organisation, city, country — any honest answer), then whether to reuse
the keystore password for the key. **Say yes to that**; the workflow
supports two different passwords, but one fewer secret to lose is one
fewer secret to lose.

Then, for the CI secret:

```bash
base64 -w0 yames-upload.jks > yames-upload.jks.b64
```

`-w0` matters — one line, no wrapping. The workflow decodes with a plain
`base64 -d`.

**Keep `yames-upload.jks` somewhere backed up and outside the repo.**
Losing it does not lose the listing (Play App Signing holds the real app
signing key), but it does mean asking Google to reset the upload key
association, which is a support round trip.

## 2. Add four secrets

Repository → Settings → Secrets and variables → Actions → New repository
secret. Exactly these names; `android.yml` reads no others:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | the whole contents of `yames-upload.jks.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password from step 1 |
| `ANDROID_KEY_ALIAS` | `yames` |
| `ANDROID_KEY_PASSWORD` | the key password (the same one, if you said yes above) |

With these absent the workflow still runs and still builds — it just
produces unsigned artifacts and refuses to publish them.

## 3. Cut the release and run the build

The Android build does not ride the desktop's `release …` commit. It is
run by hand against a tag that already exists.

1. Cut the desktop release as usual, or create the tag by hand. Either
   way there has to be a GitHub release with that tag before step 3.
2. Actions → **Android (signed release)** → Run workflow.
3. Fill in the two inputs:
   - **ref** — the branch or tag to build. Leave empty to build the
     branch you are running from.
   - **tag** — the release tag to attach the APK to, e.g. `v1.0.5`.
     Leave it empty to build without publishing anything.

What comes out:

- **`Yames_<version>_aarch64.apk`** — signed, attached to that release.
  This is what the website's Android row points people at. arm64 only,
  which is every phone anyone will install it on.
- **`Yames_<version>.aab`** — all four ABIs, as a workflow artifact.
  Download it from the run's Artifacts section. This is the file Play
  wants; it is deliberately *not* on the release page, because Play
  splits it per device and nobody can install one.

The run's summary page prints the size of both and of the native library
per ABI.

### versionCode

Nothing to set. `gen/android/app/build.gradle.kts` derives it from the
one version string the whole project already carries:
`major*10000 + minor*100 + patch`. 1.0.4 is versionCode 10004, 1.1.0
would be 10100. Play only ever needs it to increase, and it does, as
long as minor and patch stay under 100 (the build fails loudly if they
do not).

## 4. Play Console, in order

Work through `PLAY-CONSOLE-CHECKLIST.md` Part 1. The fields it asks for
are all in `store-listing.md`. The assets it asks for are now made:

| Asset | Where |
|---|---|
| App icon, 512×512 | `plans/tasks/mobile/m05/store/icon-512.png` |
| Feature graphic, 1024×500 | `plans/tasks/mobile/m05/store/feature-graphic-1024x500.png` |
| Six phone screenshots, 1080×2400 | `plans/tasks/mobile/m05/store/01..06-*.png` |

The screenshots are captured from the real app on a Pixel 6 profile, at
a resolution Play accepts for phones as-is. They follow
`store-listing.md` §10's shot list.

Two things in the console that are easy to get wrong:

- **Data safety** → "Does your app collect or share any of the required
  user data types?" → **No**. Yames has no account, no analytics and no
  network traffic during practice. The privacy page at
  `https://yames.app/privacy.html` says the same thing and is what goes
  in the Privacy policy URL field.
- **App signing** → accept **Play App Signing**. The key from step 1 is
  the *upload* key, not the app signing key.

## 5. The website

`docs/index.html` already carries the Android row, pointing at the
Releases page, with the line "Install it straight from the file, or wait
for it on Google Play." It reaches the live site when `mobile` merges to
`main` — which, per the mobile README, happens once, when Android v1 is
releasable. So the row cannot appear before there is something behind
it.

When the Play listing goes live, swap that note for the Play badge.

---

## What still has to happen on a phone

Nothing on this page is blocked by it, but the release notes for the
first Android version should not claim any of it until a phone has said
so. From `plans/tasks/mobile/m05/M05-FINDINGS.md`:

- **Output latency**, and whether the phone grants the low-latency audio
  path. One `adb logcat -s RustStdoutStderr` on hardware answers it: the
  app prints `asked LowLatency/Shared, got …` at startup. The emulator
  says `got None/Shared`; a phone should not.
- **Audibility** at a useful volume next to an instrument.
- **Real Doze and an OEM battery manager** over an hour, not ten
  minutes.
- **The denial path** for the notification permission — the click is
  designed to carry on without it, and that has never been exercised.
