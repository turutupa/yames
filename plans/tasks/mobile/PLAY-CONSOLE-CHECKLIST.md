# Console checklist — Google Play and App Store Connect

For M05 (Android, Play Console) and M06 (iOS, App Store Connect). Each
line is one thing to enter, click, or check. Pulled from
`plans/tasks/mobile/store-listing.md` (§ numbers below refer to that
document) and general web research done for M05a — anything not
checked against an actual console session (none exists yet) is marked
**verify**.

---

## Part 1 — Google Play Console

### 1. Create the account

- [ ] Go to https://play.google.com/console/signup, sign in with the
      Google account that should own the app long-term (not a personal
      throwaway — this account cannot be easily transferred later).
- [ ] Choose **Personal** developer account type (not Organization —
      Organization accounts skip the closed-testing requirement below,
      but also need a D-U-N-S number / business verification, which is
      more setup than a solo owner needs; verify this trade-off is
      still what the owner wants before picking).
- [ ] Pay the **one-time USD 25 registration fee** by card. No recurring
      fee (checked against multiple current third-party guides; verify
      the amount has not changed at sign-up time — Google has changed
      this fee before).
- [ ] Complete **identity verification**: government-issued photo ID
      plus, depending on account age/region, a short verification
      video or additional document upload. This step has taken
      anywhere from minutes to a few days in current reports — **do
      not start this the day M05 needs production access; start it the
      day the account is created.**
- [ ] Set the developer display name (shown on the store listing) —
      recommend `turutupa` to match the GitHub org/handle already used
      on the website and in `LICENSE`/winget metadata (verify the
      owner wants the same public name here).

### 2. Create the app

- [ ] Play Console → **Create app**.
- [ ] App name: `Yames` (store-listing.md §1).
- [ ] Default language: English (US) — the mobile v1 ships all 15
      locales already in the repo eventually, but list under English
      first and add other Play listing languages later; not a v1
      blocker.
- [ ] App or game: **App**. Free or paid: **Free**.
- [ ] Declarations: confirm it meets Play policies, confirm US export
      law compliance — both are simple checkbox declarations, true for
      Yames.

### 3. Store listing (App content → Main store listing)

Enter directly from `store-listing.md`:

- [ ] Short description → §2 (Play field, ≤ 80 characters)
- [ ] Full description → §3
- [ ] App icon (512×512 PNG) → reuse `docs/icon-512.png`, or a version
      built for adaptive icon safe zones if Play flags the existing
      one (verify Play's current icon safe-zone requirement against
      the upload tool at fill-in time)
- [ ] Feature graphic (1024×500 PNG/JPEG, required) → not yet made;
      **open item for M05**, not covered by this task
- [ ] Screenshots → §10 shot-list, minimum 2 phone screenshots (Play
      currently allows up to 8; verify current minimum/maximum at
      upload time)
- [ ] Category → §6 (Music & Audio)
- [ ] Contact details → support email/website: link to
      `https://github.com/turutupa/yames/issues` (support URL field
      accepts a URL; verify it also wants an email address as a
      separate required field)
- [ ] Privacy Policy URL → `https://yames.app/privacy.html`

### 4. App content declarations (App content in the left nav)

- [ ] **Privacy policy** → `https://yames.app/privacy.html`
- [ ] **Data safety** → store-listing.md §9: answer "No" to collecting
      or sharing any data; the form should then skip the per-data-type
      follow-ups (verify this flow against the live form)
- [ ] **Ads** → "No, my app does not contain ads" (§8)
- [ ] **Content rating questionnaire** → answer every section "no" /
      "none" per §7; expected result Everyone/PEGI 3-equivalent, but
      let the questionnaire assign the actual rating
- [ ] **Target audience and content** → not primarily directed at
      children; standard "general audience" answer (verify current
      wording of this question, it has changed the exact phrasing over
      Play Console versions)
- [ ] **News apps, COVID-19 contact tracing, government apps** → No to
      all (standard for a metronome)
- [ ] **Data safety / Financial features / Health** declarations, if
      Play still asks separately from the main Data safety form →
      No to all (verify whether these are still separate questions or
      folded into Data safety now)

### 5. App signing

- [ ] Accept **Play App Signing** (the default/only option for new
      apps since 2021 — verify it is still the only path offered, i.e.
      that opting out is no longer possible, which is what current
      guidance says).
- [ ] Keep the **upload keystore** — the one generated for CI signing
      (`ANDROID_KEYSTORE_BASE64` etc. in `.github/workflows/android.yml`'s
      commented block) — private and backed up outside the repo.
      Losing it means generating a new upload key and asking Google to
      reset the upload key association; it does not lose the app.

### 6. Closed testing (required before production access)

- [ ] Create a **Closed testing** track (Testing → Closed testing).
- [ ] Add **at least 12 testers** by email (a Google Group email list
      works and is easiest to grow later) who must **opt in** via the
      testing link Play generates.
- [ ] Testers must stay opted in, actually using the app, for **14
      continuous days** before production access can be requested. If
      a tester drops below 12 or the streak breaks, the 14-day window
      restarts (checked against current third-party guides describing
      the 2026 continuous-engagement rule; this is the part most
      likely to trip up a small tester pool — recruit more than 12 to
      leave margin).
- [ ] **Start recruiting testers the day M05 starts**, per the plan's
      own risk table (§6) — this is the longest lead time in the whole
      Android release, longer than the build itself.
- [ ] Once the 12/14-day condition is met, **Production → Create new
      release**, then apply for **production access** from the
      Dashboard. "Production access" is what actually makes the app
      visible/installable from the public Play Store listing, as
      opposed to only the closed-test link.

### 7. Release

- [ ] Upload the signed **AAB** (not the APK — Play requires an Android
      App Bundle for production releases; the unsigned APK from
      `.github/workflows/android.yml` is for closed testing/sideloading
      only, verify Play still requires AAB specifically for production
      at upload time).
- [ ] Fill in release notes (can reuse the desktop release notes
      convention from `release.yml`'s commit-message parsing, adapted
      by hand since Android has its own release cadence).
- [ ] Roll out to production once the above are all green.

---

## Part 2 — App Store Connect (iOS, M06)

### 1. Prerequisites

- [ ] Apple Developer Program membership — plan §5 says already paid;
      verify it is active and not expired before M06 starts.
- [ ] Bundle ID **`com.yames.metronome`** registered in the Apple
      Developer portal (Certificates, Identifiers & Profiles →
      Identifiers) — must match `src-tauri/tauri.conf.json`'s existing
      identifier exactly.
- [ ] Distribution certificate and provisioning profile created for
      that bundle ID (needed for CI signing in a future iOS workflow,
      not covered by this task).
- [ ] App Store Connect API key generated (Users and Access → Keys) for
      CI uploads — store as a CI secret when M06 sets up the iOS
      workflow; not created by this task.

### 2. Create the app record

- [ ] App Store Connect → **My Apps → +  → New App**.
- [ ] Platform: iOS. Name: `Yames` (§1 — verify availability; App
      Store app names must be unique across the whole store, unlike
      Play).
- [ ] Primary language: English (U.S.).
- [ ] Bundle ID: select `com.yames.metronome` from the dropdown
      (already registered above).
- [ ] SKU: an internal identifier, e.g. `yames-ios` (never shown to
      users; verify no format constraint beyond "unique to your
      account").

### 3. App Information

- [ ] Subtitle → §2 (App Store field, ≤ 30 characters)
- [ ] Category → §6 (Music primary; leave secondary blank)
- [ ] Age rating → complete the questionnaire per §7; expected 4+ but
      let the questionnaire decide
- [ ] Privacy Policy URL → `https://yames.app/privacy.html`

### 4. Pricing and Availability

- [ ] Price: Free.
- [ ] Availability: all territories, unless the owner wants to start
      narrower (verify default territory list at fill-in time — Apple
      periodically adds new storefronts).

### 5. App Privacy (Privacy Nutrition Label)

- [ ] App Store Connect → App Privacy → answer the data-collection
      questionnaire per store-listing.md §9: no data types collected
      in any category (tracking, linked, or not linked to identity).
- [ ] Resulting label: **Data Not Collected**.
- [ ] This must be re-done (not just re-verified) if any future
      version starts collecting anything — Apple's label is a
      per-version declaration, not a one-time policy link like Play's.

### 6. Prepare the listing (per version)

- [ ] Description → §3 (same 4000-character text as Play; verify
      Apple's current limit is still 4000 at fill-in time)
- [ ] Keywords → §5 (App Store field, ≤ 100 characters — this is
      Apple-only; Play has no equivalent field)
- [ ] Screenshots → §10 shot-list, sized for whichever iPhone display
      sizes Apple currently requires a screenshot set for (this
      changes with new device sizes; verify the required set at
      upload time rather than assuming last year's sizes)
- [ ] Support URL → `https://github.com/turutupa/yames/issues`
- [ ] Marketing URL (optional) → `https://yames.app`
- [ ] Promotional text (170 characters, editable without a new binary
      review — good place for something like "Free, open source, and
      nothing you play ever leaves your phone.")

### 7. TestFlight (before App Review)

- [ ] Upload a build via CI (M06's job, once it exists) or Xcode.
- [ ] Internal testing (up to 100 users on the team, no review needed)
      to sanity-check the build before inviting external testers.
- [ ] External testing requires a first **Beta App Review** (lighter
      than full App Review, typically faster; verify current turnaround
      expectations at M06 time) before non-team testers can install it.
- [ ] Decide whether iOS gets any external TestFlight period before
      submitting for release, analogous to Play's mandatory closed
      test — Apple does not require this, but a real-device shakeout
      before App Review is still worth doing (open question for M06).

### 8. App Review notes (submission)

- [ ] In the version's "App Review Information" notes, state plainly:
      "Yames collects no data and requires no account; there is
      nothing to log in to and no test credentials are needed."
      Reviewers sometimes bounce apps for missing login instructions —
      heading that off in the notes avoids a needless review cycle
      (verify this is still good practice; App Review guidance changes
      over time).
- [ ] Reference the GPL App Store exception
      (`plans/tasks/mobile/LICENSE-EXCEPTION.md`) in the submission
      notes only if Apple's own review ever asks about licensing —
      it is not something Apple's standard submission form has a field
      for, and does not need to be volunteered unprompted.
- [ ] Confirm the PR #8 author's consent (see
      `LICENSE-EXCEPTION.md`) is in hand **before** submitting a build
      that includes the App Store exception in its `LICENSE` file —
      submitting before that consent exists would ship the exception
      as if it were settled when it is not.

---

## Open questions for M05 / M06

- Feature graphic (Play, 1024×500) and any additional promotional
  assets are not produced by this task — M05 needs to make or
  commission one.
- Whether the owner wants a broader set of Play store listing
  languages at launch (Play supports per-language listings distinct
  from the app's runtime locales) — recommend starting with English
  only and adding more once the store description has been tested.
- Every limit, field name, and form flow marked **verify** above
  should be re-checked against the live console at fill-in time; this
  document was written from third-party guides and each store's
  general help documentation, not a live account (none exists yet).
