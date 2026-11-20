# A recording session: 30 minutes of practice in, labelled test data out

What you do: practise normally. What you don't do: label anything. The only
manual input is **M** (or the **Felt off** button on the REC pill) when a
Take's grade felt wrong.

## Before (5 min)

1. **The app.** A build from branch `mvp-capture` or later, on the RTX
   (Windows). Settings > Input: choose the input you are testing, and run the
   latency calibration once if you have not on this rig.
2. **The rig, one of these per session** (one session = one rig; start a new
   session to switch):
   - **DI**: guitar into the audio interface, the interface as Yames' input.
     The best ground truth. Best of all: DI as Yames' input, the laptop mic
     and the phone recording the room alongside (step 3).
   - **Laptop mic**: no interface, the built-in mic as Yames' input, an
     unplugged electric or an acoustic.
   - **Phone app** (Android build): the phone's mic as Yames' input.
3. **A second recorder (optional, worth it).** A phone on the desk, about a
   metre away, with its recorder app as it comes: m4a (the usual default),
   WAV, mp3 or opus all work (the DGX converts m4a/aac/mp3/opus with ffmpeg
   from `~/tools/ffmpeg/`). WAV is still the safest if the app offers it.
   **Start it before step 4**, stop it after step 6. A second laptop's
   recorder works the same way.

## During (30 min)

4. Settings > Support > **Recording session**: on. You hear a short double
   chirp (the sync signal; the second recorder must hear it too). A red
   **REC** pill shows bottom right: Takes kept and size so far.
5. Practise as you normally would: a Session from Today, Exercises from a
   Path, "Just play" Takes, the Session's jam, the Jam screen. Everything is
   kept: graded and ungraded, rhythm and notes, with what was expected.
   - Keep the volume of the click where you usually have it.
   - A Take that felt graded wrong: press **M** (or tap **Felt off**) during
     it or right after it. Nothing else to note.
   - The pill turns amber past 5 GB; it stops keeping Takes at the cap
     (10 GB unless you change it in the same row). 30 minutes is about 0.5 to
     1 GB.
6. Settings > Recording session: **off**. The end chirp plays. Then stop the
   phone's recording. (Closing Yames also ends the session, but without the
   end chirp: the alignment then leans on the start chirp only.)

## After (2 min)

7. **On the RTX, nothing to send.** On the DGX, ask for (or run)
   `npm run corpus:ingest -- rtx` (it pulls the newest session over `ssh rtx`).
   - **The phone's recording**: copy the file (m4a or WAV, as recorded) into
     the session folder first: Settings > Recording session > **Open folder**,
     drop the file in, name it with what it is (`phone.m4a`, `laptop.wav`).
   - **A session recorded on the Android app**: Settings > Recording session >
     **Share session**, send the zip to the PC (it ends up in
     `Downloads\yames-capture-<session>.zip`, which `rtx` also picks up), or
     leave the phone plugged in over USB with debugging on.
   - **From anywhere else**: **Zip session** and send the zip; the DGX takes
     `npm run corpus:ingest -- <file.zip>`.
8. **What comes back**: a report on the DGX at
   `~/projects/.preview/corpus/<session>/report.html`: every
   Take where the live grade and the verifier disagreed, your Felt off marks
   next to them, how well the phone recording lined up, and the regression
   cases made from them.

## What it records, plainly

The raw input of every Take (whatever the mic hears, voices included), into
`%APPDATA%\com.yames.metronome\capture\<date-time>\` on this PC. Nothing is
sent anywhere. Delete the folder whenever you like. The setting turns itself
off when Yames closes, so it never records on its own.
