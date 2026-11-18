# Testing Yames

Thanks for trying this build. Yames is a guitar practice app: you pick how many
minutes you have, it plans a Session of Exercises on a 3D fretboard, listens to
your guitar, and tells you what it measured. Everything runs on your computer.
There is no account, no cloud and no telemetry: nothing leaves your machine
unless you send it to us yourself.

This takes about 15 minutes: 5 to install and set up, 10 to play.

## 1. Install

Download the file for your system from the link you were given (a GitHub
release or a build's artifacts).

Test builds are often **not signed**, so your system will warn you the first
time. That is expected; here is how to get past it.

### Windows

1. Run the `.exe` installer (or the `.msi`).
2. If **"Windows protected your PC"** (SmartScreen) appears, click
   **More info**, then **Run anyway**.
3. If your antivirus quarantines it, allow the file and run it again.

### macOS

1. Open the `.dmg` for your Mac: `aarch64` for Apple Silicon (M1 and later),
   `x64` for Intel. Drag Yames into Applications.
2. If macOS says **"Yames can't be opened because Apple cannot check it"**:
   open **System Settings > Privacy & Security**, scroll down, and click
   **Open Anyway** next to the message about Yames. Or right-click Yames in
   Applications and choose **Open**, then **Open** again.
3. If it says **"Yames is damaged and can't be opened"**, the download was
   quarantined. In Terminal run:
   `xattr -dr com.apple.quarantine /Applications/Yames.app`
   then open it again.
4. When Yames first asks for the **microphone**, click **Allow**. (This is
   needed for a USB audio interface too: macOS treats every input as a mic.)

### Linux

- **AppImage:** `chmod +x Yames_*.AppImage`, then run it.
- **.deb:** `sudo apt install ./Yames_*.deb`, then start Yames from your menu.
- Audio goes through ALSA/PulseAudio/PipeWire. If no input shows up, check
  that your interface or mic is visible in your system's sound settings first.
- On some Linux systems the 3D fretboard is not available (no WebGL2 in the
  system web view). Yames then draws a flat fretboard instead; everything
  else works the same. Tell us if that happens.

### Android (arm64 phones)

1. Open the `.apk` link on your phone and download it.
2. Android asks to allow installs from your browser (or Files): allow it for
   that one source, then **Install**. Later test builds install over this one.
3. When Yames asks for the **microphone**, allow it. Grading needs it.
4. Your guitar can come in through the **phone's mic**, a **USB-C audio
   interface** (iRig HD, Scarlett via an OTG adapter, an amp with USB audio) or
   an **analog adapter** like the iRig 2 in the headphone jack or a USB-C to
   3.5 mm dongle. Bluetooth is not supported: its delay is too long to grade
   timing.
5. Keep the screen on during a Session (Yames does this while the click runs).

## 2. Set up your input (2 minutes)

The first time Yames opens it walks you through setup:

1. **Instrument:** pick your guitar.
2. **How will I hear you?** Choose **Microphone** (the guitar in the room,
   through the computer's mic or a USB mic) or **Direct input** (a cable from
   the guitar into an audio interface). Play a few notes. The meter must
   move and the line under it must say Yames can hear you before **Next**
   unlocks.
   - Direct input: turn up the guitar's volume and the interface's gain, and
     pick the input channel your cable is in.
   - Microphone: play close to the mic. Single notes work best.
   - Nothing moves? The screen tells you what to check. The usual cause is
     the microphone permission: **macOS** System Settings > Privacy & Security
     > Microphone (turn Yames on); **Windows** Settings > Privacy > Microphone
     (allow desktop apps). Restart Yames after changing it.
3. **Hear it work:** play one note on each beat of the click for eight beats.
   You see exactly what was heard; if it heard nothing it says so.
4. The rest (coach, sound, pedal) can be skipped. **Go to Today** finishes.

You can run setup again any time from **Help (?) > Run setup again**, and
change the input in **Settings > Devices**.

## 3. What to try (10 minutes)

1. **Paths:** pick what you want to get better at and **Subscribe**: **Shred**
   (alternate and economy picking, legato, sweeps, tapping), **Blues and
   Pentatonics**, **Classic Rock**, or the deep-dive **Alternate Picking** and
   **Sweep Picking**. Up to 4 at once. Your first Session on a new Path is a
   short placement, so you don't redo what you already play.
2. **Today:** pick 5, 10, 15 or 20 minutes and press **Start**. Today mixes all
   your Paths, with a line saying why each Exercise is there today.
3. **Play a Take:** play along with the click (or the band). Each Take is
   graded from your guitar: evenness, notes heard, extra notes and, where it
   can tell, the right notes. The result tells you which number moved and your
   clean tempo (the fastest you played it cleanly).
4. **Neck or Runway:** top right of the Take screen. **Neck** shows the notes on
   the fretboard; **Runway** scrolls the notes towards a line, like tab
   approaching. Try both and tell us which you'd practise with.
5. **Was this grade fair?** Tap Yes or No on a result. It is the most useful
   thing you can tell us.
6. **Go again**, **Slower**, **Faster**, or let the Session move on. **Find my
   edge** (on a result, or a Step page) speeds up Take by Take until your
   playing stops being clean.
7. **Quit Yames and open it again.** Your progress and clean tempos should
   still be there, and Today should plan from them.
8. **The tools still work:** **Tools** in the rail opens Metronome, Setlist,
   Drill, Jam and Songs. Play with each for a minute.
9. **Keys:** **Ctrl+1** Today, **Ctrl+2** Paths, **Ctrl+3** Progress,
   **Ctrl+4** Tools; the tools are **Ctrl+5** to **Ctrl+9** (⌘ on a Mac), in the order of the sidebar
   (Metronome, Setlist, Drill, Jam, Songs), and **Ctrl+,** is Settings. On a
   Mac it is ⌘ instead of Ctrl. If you had changed any of these keys, yours
   are kept. **Escape** goes back: out of a Session to where you started it,
   from a Step to its Path, from a Path to the list. In a Session, the first
   Escape stops a running Take and the next one asks before leaving.

Things worth telling us: anything that looked wrong, a grade that did not
match what you played, a click that stuttered or drifted, a screen that did
not fit your window, setup steps that confused you.

## 4. Known limits in this build

- **Right notes are checked only where Yames can trust it:** picked notes far
  enough apart on a clean or high-gain tone. Sweeps, ringing tones and very
  fast runs say "notes not checked" and are graded on timing.
- **"Your turn" items are not graded yet.** Landing on chord tones, playing
  inside the scale and improvising are self-checked until those graders exist.
- **Bends are graded on timing only;** the bend's pitch is a self-check.
- **Legato** (hammer-ons and pull-offs) is graded through the picked notes
  around it; a missed hammer-on costs nothing.
- **The content is a first draft** written to established courses, not yet
  reviewed by a teacher with a guitar in hand. Tell us what feels wrong.
- **Thresholds are first guesses.** Pass bars and grades have not been tuned
  on many real guitars yet. That is part of what you are helping with.
- **No account, no cloud, no sync.** Progress lives on this computer only.
- The coach's optional AI model is a large download; you can skip it, the
  grading does not depend on it.

## 5. Send feedback

**Your practice data:** **Settings > Support > Export my practice data** (also
on Progress) saves a file with your Takes, clean tempos and fairness answers.
Attaching it to your feedback helps us more than anything. It contains nothing
but your practice.

In Yames: **Help (?) > Send feedback**, or **Settings > Support > Send
feedback**. This opens a new GitHub issue in your browser with the Yames
version and your system already filled in. Write what happened in your own
words (any language), then press **Submit new issue**. Nothing is sent until
you press it. You need a free GitHub account to submit.

If something crashed or audio misbehaved, also use **Help (?) > Report a
problem**: it saves a diagnostics file on your computer and shows where. Drag
that file into the GitHub issue.

No GitHub account? Tell whoever sent you the build, and include the version
from **Settings > About**.

## 6. Test builds that update themselves (the beta channel)

Test builds are published on one GitHub pre-release,
[`beta`](https://github.com/turutupa/yames/releases/tag/beta). Its files are
replaced every time a new test build is made. A test build's version looks like
`1.3.0-beta.57`, and **Settings > About** shows **Channel: Test build (beta)**.
People on the normal releases never get these builds. A pre-release never
counts as the latest release, so their updates, winget and Homebrew are not
affected.

**Install the first one by hand.**

- **Windows:** download `Yames_<version>_x64-setup.exe` from the `beta`
  release and run it. It installs over a normal Yames and keeps your settings
  and practice data. If you installed the `.msi` before, uninstall that one
  first.
- **Linux:** download the `.AppImage` (when the build includes Linux) and
  run it.
- **Android:** download `Yames_<version>_aarch64.apk` on the phone and open
  it. If you have a Play Store or website copy of Yames, uninstall it first:
  test builds are signed with a different key, so Android will not install one
  over the other.

**After that, updates come to you.**

- **Desktop:** when a newer test build is out, a small notice under the header
  says so, at most once a day and never while the metronome is playing.
  Press **Update** there, or use **Settings > About > Updates**. Yames
  downloads the new build, checks its signature, installs it with a progress
  window (no questions) and opens again.
- **Android:** Yames checks once a day when you open it, and you can check
  yourself in **Settings > About > Updates**. **Update** downloads the APK
  (with progress), checks it, and opens Android's installer. The first time,
  Android sends you to **Install unknown apps** for Yames. Allow it, come back,
  and press **Update** again.

**To make a test build** (maintainers): run the `Beta (test builds)` workflow
from any branch. Pick the platforms (default `windows,android`; `linux` and
`macos` are optional, and macOS fails until Apple signing is sorted) and write
the notes testers will see:

```sh
gh workflow run beta.yml --ref revamp -f platforms=windows,android -f notes="What changed in this build"
```

The version is the minor after the current stable (`1.2.2` gives `1.3.0`)
plus `-beta.<run number>`. Android and desktop are separate feeds. A run
without Android leaves the current APK in place, and a run without any desktop
platform leaves the desktop builds in place. A run with some desktop platforms
replaces the whole desktop feed, so include every desktop platform testers use.
