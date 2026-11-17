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

1. **Today:** pick 5, 10, 15 or 20 minutes and start the Session.
2. **Play a Take:** the Session runs Exercises from the Alternate Picking
   path on the fretboard. Play along with the click; each Take is graded
   from your guitar (evenness, notes heard, extra notes). Read the result:
   it should tell you which number moved.
3. **Go again** on an Exercise, or let the Session move on.
4. **Find my edge** (from a Step page under Paths): it speeds up Take by Take
   until your playing stops being clean, and records your clean tempo.
5. **Quit Yames and open it again.** Your progress and clean tempos should
   still be there, and Today should plan from them.
6. **The tools still work:** open Metronome, Setlist, Drill, Jam and Songs
   from the rail and play with each for a minute.

Things worth telling us: anything that looked wrong, a grade that did not
match what you played, a click that stuttered or drifted, a screen that did
not fit your window, setup steps that confused you.

## 4. Known limits in this build

- **Only Alternate Picking is runnable.** The Blues path is listed but cannot
  be played yet.
- **Note identity is not checked.** Yames grades timing and whether a note
  was heard, not whether it was the right note. A result says "not assessed"
  where that applies.
- **Thresholds are first guesses.** Pass bars and grades have not been tuned
  on many real guitars yet. That is part of what you are helping with.
- **No account, no cloud, no sync.** Progress lives on this computer only.
- The coach's optional AI model is a large download; you can skip it, the
  grading does not depend on it.

## 5. Send feedback

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
