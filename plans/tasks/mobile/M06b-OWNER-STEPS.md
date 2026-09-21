# M06b — putting Yames on your iPhone, without a Mac

Written 2026-09-20, against Apple's and Tauri's current documentation
(links at the bottom — every claim here comes from one of them, not from
memory). M06a is finished: the iPhone app is generated, compiled and
booted on GitHub's macOS runners, and the only thing left that nobody
has done is **signing it**, which needs your Apple Developer account and
therefore has to be you.

**The short version.** Everything you have to do is in a web browser.
Nothing on this page needs a Mac. The five or six things that genuinely
need macOS — building, signing, packaging, uploading — happen on
GitHub's runners, which are macOS machines with Xcode on them, paid for
by nobody because this repository is public.

There is one caveat worth reading before you start, in *The one thing
that is not certain* near the end.

---

## Before you start

- You are enrolled in the Apple Developer Program. (You are — the
  desktop release already signs with *Developer ID Application: Alberto
  Delgado Cabrera (BBG489SR42)*, which is that enrolment.)
- You are the **Account Holder** on it. Two of the steps below can only
  be done by an Account Holder or an Admin.
- The app's identifier is `com.yames.metronome`. It has to match
  everywhere, exactly, and it already matches in the repository.
- The licence question is **not** settled and is not part of this page:
  see `plans/tasks/mobile/LICENSE-EXCEPTION.md`. Do that before you
  submit for review, not before you make a TestFlight build.

---

## Part 1 — five things in a browser

### 1. Register the app's identifier — browser

<https://developer.apple.com/account/resources/identifiers/list>

**Identifiers → + → App IDs → App → Continue.**

- Description: `Yames`
- Bundle ID: **Explicit**, `com.yames.metronome`
- Capabilities: **tick nothing.**

That last line is the part people get wrong. Background audio is not a
capability you enable here — it is a line in the app's own `Info.plist`
(`UIBackgroundModes: audio`), and it is already there and already
checked by CI. Yames uses no push notifications, no iCloud, no sign-in
with Apple, no associated domains, nothing. Ticking a capability you do
not use adds an entitlement the app does not have, and then signing
fails with a mismatch that is miserable to read.

Then **Continue → Register.**

### 2. Create the app record — browser

<https://appstoreconnect.apple.com/apps>

**+ → New App.**

- Platforms: **iOS** only
- Name: `Yames` (this is the App Store name; it must be unique across
  the whole store — if it is taken, `Yames Metronome` is the fallback,
  and it changes nothing in the build)
- Primary language: English (U.K.) or (U.S.), your call
- Bundle ID: pick `com.yames.metronome` from the list — it appears
  because of step 1
- SKU: anything private to you; `yames-ios` is fine
- User Access: Full Access

You do not have to fill in screenshots, description or pricing to get a
TestFlight build. Leave the listing alone for now;
`plans/tasks/mobile/store-listing.md` has the copy when you want it.

### 3. Create an App Store Connect API key — browser

This is the key CI uses instead of your password, and the one Apple
documents as **downloadable exactly once**.

<https://appstoreconnect.apple.com/access/integrations/api>

**Users and Access → Integrations → App Store Connect API → Team Keys
→ Generate API Key.**

- Name: `Yames CI`
- Access: **Admin**

Why Admin and not App Manager: App Manager is enough to *upload* a
build, but it cannot create or download signing certificates, and
letting Xcode create the certificate for you is the entire reason this
works without a Mac (Part 2). If you later switch to the manual
certificate path in Part 3, you can revoke this key and make an
App Manager one instead.

**Generate**, then, on the row that appears:

- Copy the **Key ID** (ten characters, e.g. `2X9R4HXF34`).
- Copy the **Issuer ID** — it is shown once above the table, a UUID,
  and it is the same for every key in your account.
- Click **Download API Key**. You get `AuthKey_<KeyID>.p8`. **Apple
  will not let you download it again.** Put it in your password manager
  now, before the next step.

### 4. Put three secrets into GitHub — browser

<https://github.com/turutupa/yames/settings/secrets/actions>

**New repository secret**, three times:

| Secret name | What goes in it |
|---|---|
| `APPLE_API_ISSUER` | the Issuer ID UUID from step 3 |
| `APPLE_API_KEY` | the Key ID from step 3 |
| `APPLE_API_KEY_P8` | **the entire contents** of the `AuthKey_….p8` file, pasted as text — open it in any text editor; it starts `-----BEGIN PRIVATE KEY-----` |

The first two are the names Tauri reads directly. The third is not:
Tauri wants `APPLE_API_KEY_PATH`, a path to a *file*, and a GitHub
secret is a string — so the workflow writes the secret to a file on the
runner and sets `APPLE_API_KEY_PATH` to point at it. That file exists
for the length of one job on a machine that is destroyed afterwards.

**Do not** paste the `.p8` anywhere else, do not commit it, and do not
send it to anyone — including to a coding agent. Nothing in M06a has
ever handled a key, and nothing in M06b should either.

### 5. App Privacy — browser

<https://appstoreconnect.apple.com> → your app → **App Privacy → Get
Started.**

Answer **"No, we do not collect data from this app."** That is the
truthful answer: Yames has no analytics, no crash reporting, no network
calls of its own, and on a phone it does not even have a microphone.
Apple requires this section to be filled in before a build can go to
external TestFlight testers.

---

## Part 2 — the recommended path: let Xcode make the certificate

**Recommendation: use automatic signing, driven by the API key.** It is
the only path that is genuinely Mac-free, and it is the one Tauri
documents for CI.

With `APPLE_API_ISSUER`, `APPLE_API_KEY` and `APPLE_API_KEY_PATH` set,
Tauri passes the key to Xcode and Xcode's cloud-managed signing does
everything else: it registers what needs registering, creates the
distribution certificate **in Apple's own systems**, and issues the
provisioning profile. No Keychain, no `.p12`, no `openssl`, and no
private key that you have to keep safe forever — the certificate's key
lives on the runner for the length of the job and is regenerated next
time.

What the workflow then runs, on the macOS runner:

```sh
npm run tauri -- ios build --export-method app-store-connect
xcrun altool --upload-app --type ios \
  --file "src-tauri/gen/apple/build/arm64/Yames.ipa" \
  --apiKey "$APPLE_API_KEY" --apiIssuer "$APPLE_API_ISSUER"
```

Neither of those is yours to type. They go into `.github/workflows/ios.yml`
as a job that runs only on `workflow_dispatch`, the way `android.yml`
already works — so a TestFlight build is a button in the Actions tab and
nothing else.

**Your part of Part 2 is: nothing.** If Parts 1 and 3 of this page are
done, the first run either produces a TestFlight build or fails with a
message that tells you which of the two fallbacks below you need.

---

## Part 3 — the fallback, if automatic signing will not do it

Automatic signing occasionally refuses in CI — an account that has never
had an iOS certificate, a team that requires the certificate to be
created by a device, or simply Apple changing its mind. If it does, you
make the certificate yourself. **This is still browser-only**, plus four
`openssl` commands you can run on the Windows machine (Git Bash has
`openssl`).

On the Windows machine:

```sh
openssl genrsa -out yames_ios_distribution.key 2048
openssl req -new -key yames_ios_distribution.key -out yames_ios_distribution.csr \
  -subj "/emailAddress=albertodelgadocabrera@gmail.com/CN=Alberto Delgado Cabrera/C=ES"
```

In the browser —
<https://developer.apple.com/account/resources/certificates/list>:

**Certificates → + → Apple Distribution → Continue →** upload
`yames_ios_distribution.csr` **→ Continue → Download.** You get
`distribution.cer`.

Back on Windows, turn the certificate and the key you kept into the
`.p12` bundle that signing wants:

```sh
openssl x509 -inform der -in distribution.cer -out yames_ios_distribution.pem
curl -o AppleWWDRCAG3.cer https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer
openssl x509 -inform der -in AppleWWDRCAG3.cer -out AppleWWDRCAG3.pem
openssl pkcs12 -export -legacy \
  -out yames_ios_distribution.p12 \
  -inkey yames_ios_distribution.key \
  -in yames_ios_distribution.pem \
  -certfile AppleWWDRCAG3.pem
```

It asks for an export password. Choose one and keep it with the `.p12`.

Then, still in the browser —
<https://developer.apple.com/account/resources/profiles/list>:

**Profiles → + → App Store Connect** (under Distribution) **→** App ID
`com.yames.metronome` **→** the certificate you just made **→** name it
`Yames App Store` **→ Generate → Download.** You get
`Yames_App_Store.mobileprovision`.

Two more GitHub secrets, and one more:

| Secret name | What goes in it |
|---|---|
| `IOS_CERTIFICATE` | base64 of the `.p12` — `base64 -w0 yames_ios_distribution.p12 > cert.txt` on Git Bash, then paste the contents of `cert.txt` |
| `IOS_CERTIFICATE_PASSWORD` | the export password you chose above |
| `IOS_MOBILE_PROVISION` | base64 of the `.mobileprovision`, the same way |

With those three set, Tauri signs manually and does not ask Xcode for
anything. Keep `yames_ios_distribution.key` and the `.p12` in your
password manager: the certificate is valid for a year and re-creating it
means re-doing this page.

---

## Which steps need what

| Step | Needs a Mac? | Needs what |
|---|---|---|
| Register the bundle identifier | No | a browser |
| Create the app record | No | a browser |
| Create the App Store Connect API key | No | a browser, Account Holder or Admin |
| Paste secrets into GitHub | No | a browser |
| App Privacy answers | No | a browser |
| Make a distribution certificate | No — **either** Xcode cloud-managed signing on the CI runner (Part 2) **or** `openssl` + a browser (Part 3) | |
| Make a provisioning profile | No — created by Part 2, or by a browser form in Part 3 | |
| Compile the app for an iPhone | Yes, **and CI does it** | nothing from you |
| Sign and package the `.ipa` | Yes, **and CI does it** | nothing from you |
| Upload to TestFlight | Yes, **and CI does it** | nothing from you |
| Install the TestFlight build | No | the TestFlight app on your iPhone |
| Answer App Review | No | a browser |

The pattern is: **Apple's websites do not care what computer you are
on, and everything that does care runs on GitHub's machines.**

---

## The one thing that is not certain

Tauri's own iOS signing page lists, among its prerequisites, *an Apple
device for signing (required by Apple's terms)*. That is a statement
about Apple's developer agreement, not about whether the commands work
— and the commands demonstrably work on a macOS CI runner, which is
what every iOS CI pipeline in the world is. It is being written down
here rather than quietly skipped, because it is the one line on this
subject that could turn out to matter, and you should know it exists
before you decide how much to build on this.

Nothing else here is guesswork. The rest was checked against Apple's
and Tauri's current documentation on 2026-09-20.

---

## After the first TestFlight build

1. It appears under **TestFlight → iOS Builds** a few minutes after the
   upload, in *Processing*, and then becomes installable.
2. Add yourself as an **Internal Tester** (Users and Access → your own
   row → check the app). Internal testers need no review and can
   install immediately.
3. Install TestFlight on the iPhone and run the four device gates
   nothing has ever been able to run — they are in `M06a-FINDINGS.md`
   under *What only an iPhone can prove*.
4. A TestFlight build expires after **90 days**. That is a clock, not a
   deadline: it means a build you install in September stops working in
   December whether or not anything has changed.

## What is still open before the App Store itself

- The GPL App Store exception, and the PR #8 author's consent —
  `plans/tasks/mobile/LICENSE-EXCEPTION.md`. This blocks *submission*,
  not TestFlight.
- The listing copy, screenshots and review notes —
  `plans/tasks/mobile/store-listing.md`. The simulator screenshots from
  M06a are at the wrong sizes for a store listing; App Store Connect's
  required sizes change yearly and have to be checked at the time.

---

## Sources

Checked 2026-09-20.

- Tauri — App Store distribution:
  <https://v2.tauri.app/distribute/app-store/>
- Tauri — iOS code signing (automatic vs manual, and every environment
  variable named above):
  <https://v2.tauri.app/distribute/sign/ios/>
- Apple — App Store Connect API, getting started (the menu path, the
  roles a team key can hold, and the download-once rule):
  <https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/>
- Apple — Creating API keys for the App Store Connect API:
  <https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api>
- Apple — Certificates, Identifiers & Profiles:
  <https://developer.apple.com/account/resources/>
- The `openssl` certificate-signing-request route, for Part 3:
  <https://gist.github.com/jcward/d08b33fc3e6c5f90c18437956e5ccc35>
