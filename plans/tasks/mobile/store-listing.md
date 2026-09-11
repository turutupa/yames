# Store listing copy — Google Play and App Store

For M05 (Android) and M06 (iOS). Paste-ready copy plus the fields
around it. Wording follows the plan's rule: musicians, not developers
— no Rust, Tauri, WebView, APK, NDK, "open source stack". "Free and
open source" is fine.

Anything marked **verify** is a field name, limit, or rule I could not
confirm against the current console UI (no developer account exists
yet to check against directly) — I checked it against the sources
named and it should be re-confirmed by whoever fills in the console.

---

## 1. App name

**Both stores:** `Yames`

Play allows up to 30 characters for the app title; App Store Connect's
app name field is also capped at 30 characters (verify against the
current App Store Connect UI — checked against third-party ASO
reference pages, not Apple's own docs, since I have no App Store
Connect account to look at directly). `Yames` fits either way with
room to spare. Do not add a subtitle like "— Metronome" to the name
field itself; both stores have a separate field for that (§2).

---

## 2. Short description / subtitle

These are **different fields with different limits** — do not reuse
one string for both.

**Google Play — "Short description"** (≤ 80 characters):

```
Free metronome with drills, setlists, and zen mode. No ads, no account.
```
(73 characters)

**App Store — "Subtitle"** (≤ 30 characters — this is Apple's field;
Apple has no 80-character short-description field, verify this is
still called "Subtitle" in the current App Store Connect UI):

```
Metronome, drills, setlists
```
(28 characters)

---

## 3. Full description

Same text for both stores' "Description" field (Play: up to 4000
characters; App Store: up to 4000 characters — verify both limits
against each console at fill-in time, checked against third-party ASO
references rather than Apple's or Google's own current help pages).

```
Yames is a free, open-source metronome built for real practice, not
just keeping time.

TIMING YOU CAN TRUST
A steady click that holds through a whole practice session — no drift,
no surprises when you get to the end of a long piece.

SPEED DRILLS
Set a start tempo, a target tempo, and a step size. Yames climbs the
tempo for you on a schedule, so you can focus on playing instead of
watching the dial. Choose a steady climb or a push-and-pull ramp.

SETLISTS
Build a list of songs with their own tempo, subdivision, and sound —
one tap between songs, mid-rehearsal.

ZEN MODE
A fullscreen view with visuals that move on the beat, for when you
want the room instead of a screen full of numbers.

PRESETS
Save any tempo and setup as a preset. Reorder them, apply them,
practice the same exercises every day without resetting anything by
hand.

THEMES
More than a dozen color themes, including dark and light options.

FREE, NO ACCOUNT, NOTHING TRACKED
No sign-up, no ads, no in-app purchases, and no data collected. Yames
does not need the internet to work and does not talk to a server while
you practice. See the full privacy policy: https://yames.app/privacy.html

Yames is free and open source. Found a bug or want a feature? Tell us:
https://github.com/turutupa/yames/issues
```

---

## 4. Feature bullets (five, for stores/press that want a short list)

1. A click you can trust for a whole session
2. Speed drills that ramp the tempo for you
3. Setlists — one tap between songs
4. Zen mode — fullscreen visuals on the beat
5. Free, open source, no account, nothing tracked

---

## 5. Keywords

**App Store "Keywords" field** (≤ 100 characters total, comma-separated,
no spaces after commas needed — verify the exact separator convention
against the current App Store Connect UI):

```
metronome,tempo,bpm,practice,drill,rhythm,setlist,tap tempo,musician,band
```
(83 characters)

**Google Play** has no separate keywords field — Play's search indexing
reads the title and description, which is why §3's description repeats
"metronome", "tempo", "BPM", "drill", "setlist" and "practice" as plain
words rather than a keyword list.

---

## 6. Category

**Google Play:** Music & Audio (verify this is still the closest
category name in the current Play Console category list).

**App Store:** Primary category **Music**; secondary category (optional)
**Health & Fitness** or leave blank — recommend leaving it blank since
Yames is not a fitness app (verify current App Store category list).

---

## 7. Content rating / age rating

**Google Play — content rating questionnaire (IARC):** Yames has no
user-generated content, no violence, no sexual content, no gambling, no
user-to-user interaction (chat, sharing), and no user account. Answer
every questionnaire section "no" / "none". Expected result: **Everyone
/ PEGI 3** (or equivalent per region — IARC issues one rating per
region from the same questionnaire; verify the exact rating strings
shown, since they are assigned by the questionnaire, not chosen
directly).

**App Store — age rating questionnaire:** same answers (no objectionable
content of any kind, no unrestricted web access, no user-generated
content). Expected result: **4+**. Verify against the current App
Store Connect questionnaire, which has been revised in recent years to
add categories beyond the older fixed list — answer honestly item by
item rather than assuming 4+ from this note.

---

## 8. Ads and purchases

**Both stores:** No ads. No in-app purchases. No subscriptions.
Google Play's "Ads" declaration: answer **No, my app does not contain
ads**. Neither store's purchase/subscription setup applies — skip
those sections entirely rather than filling them with zeros.

---

## 9. Data Safety (Google Play) / App Privacy (App Store)

Both forms ask the same underlying question with different UI. Answer:

**Google Play — Data safety section:**
- "Does your app collect or share any of the required user data
  types?" → **No**
- Because the answer is No, Play does not ask the follow-up questions
  about data types, purpose, or encryption-in-transit — those only
  appear once you say Yes to something (verify this against the
  current Data Safety form flow; checked against Play Console Help's
  own description of the section, not a live form, since no account
  exists yet).
- Privacy policy URL field: `https://yames.app/privacy.html`

**App Store — App Privacy section ("Privacy Nutrition Label"):**
- "Data Used to Track You" → none
- "Data Linked to You" → none
- "Data Not Linked to You" → none
- Overall label: **Data Not Collected**
- Privacy Policy URL field: `https://yames.app/privacy.html`

If a future version adds anything that talks to a server (even just an
update check on mobile, which v1 does not have — see
`docs/privacy.html`), both of these forms and the privacy page must be
updated together before that version ships. Do not let this drift.

---

## 10. Screenshot shot-list (for the M05 worker to capture)

Portrait only (the plan locks mobile to portrait in v1 — §1 of
`plans/MOBILE_IMPLEMENTATION_PLAN.md`). Google Play requires at least
2 screenshots per supported form factor (phone); App Store requires at
least one set sized for the largest supported iPhone display it is
submitted for. Both stores accept the same source images if captured
at a size each store's uploader accepts — check each console's current
minimum/maximum pixel dimensions at upload time (verify; these have
changed release to release for both stores).

Capture these six, on a real or emulated device, in whichever theme
looks best in a thumbnail grid (recommend Obsidian or Aurora — the
same two the website leads with):

1. **Metronome (beat view)** — running, mid-session, a tempo in the
   120–140 BPM range, subdivision and accents visible.
2. **Speed drill** — a drill in progress showing the ramp (current BPM,
   target, and the ramp chart if visible on the phone layout).
3. **Setlist** — a setlist open with two or more songs listed, one
   marked as currently playing.
4. **Zen mode** — one of the fullscreen visuals mid-animation.
5. **Presets** — the presets sheet/list open with a few saved presets.
6. **Themes** — the appearance settings screen, or the app itself in a
   second theme, to sell the theme count without needing a caption.

Do not stage a screenshot with an interaction that does not exist yet
on mobile — MIDI, the practice coach, and the floating widget are cut
(plan §1); a screenshot implying they exist would misrepresent the
listing.

---

## 11. Support and marketing URLs

- **Support URL (both stores):** `https://github.com/turutupa/yames/issues`
- **Marketing URL (App Store, optional):** `https://yames.app`
- **Privacy Policy URL (both stores, required):** `https://yames.app/privacy.html`

---

## Open questions for M05 / M06

- Exact current character limits and category lists for both consoles
  should be re-checked at fill-in time — the app's own account did not
  exist to verify against directly during this task; everything above
  was checked against third-party ASO reference pages and each store's
  general help documentation, not a live console session.
- Confirm the final screenshot device size(s) once M03's phone layout
  work is verified on a real device (M00/M04 dependency).
