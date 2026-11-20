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
   metre away, with a recorder app set to **WAV** (m4a cannot be read on the
   DGX yet). **Start it before step 4**, stop it after step 6. A second
   laptop's recorder works the same way.

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
   - **The phone's recording**: copy the WAV into the session folder first:
     Settings > Recording session > **Open folder**, drop the file in, name it
     with what it is (`phone.wav`, `laptop.wav`).
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

## Sessions that send themselves (test builds, card #123)

Once per device, then nothing to copy ever again. The inbox runs on the DGX
(`https://dgx-delgado.taildf6572.ts.net:8646`, tailnet only).

1. **Tailscale on the phone** (and on the RTX if it is not there yet): install
   the Tailscale app from the Play Store, log in with the same account as the
   DGX, and leave it connected. Check: the phone's browser opens
   `https://dgx-delgado.taildf6572.ts.net:8646/v1/ping` and answers
   `{"error": "unauthorized"}` (that is right: it needs the token).
2. **A pairing code**: on the DGX, `npm run inbox:pair` (or ask for one). It
   prints a code (`ABCDE-12345`, one use, 24 h) and a link with the code in it.
3. **In Yames** (a beta build): Settings > Support > **Send my test sessions
   to my computer**: on. Paste the link into the inbox field (it fills the
   code too), or type the address and the code. **Pair**. The row then says
   "Sending to dgx-delgado…".
4. From then on, every recording session that ends is zipped and uploaded in
   the background, and the line under the switch says **uploaded**,
   **waiting** (the DGX could not be reached: it tries again when Yames
   opens, when the network is back, and every ten minutes) or **failed**
   (pair again for a refused device; Send now tries again). A session closed
   by quitting Yames is sent the next time it opens.
5. On the DGX each arrival is ingested by itself: the report is at
   `~/projects/.preview/corpus/<session>/report.html`, the zip in
   `~/projects/.datasets/yames-corpus/inbox/`.

**Without Tailscale on the phone**: with the switch on, the Android app also
keeps each session's zip in `Documents/Yames/capture` (Android 11 or later).
Plug the phone into the RTX with USB debugging on and `npm run corpus:ingest
-- rtx` pulls them by adb, on a normal (non-debuggable) build too.

**Privacy**: the raw microphone audio of the session goes only to the address
you paired with; with the switch off (the default) nothing goes anywhere.
Forget in the same row removes the pairing.

## What it records, plainly

The raw input of every Take (whatever the mic hears, voices included), into
`%APPDATA%\com.yames.metronome\capture\<date-time>\` on this PC. Nothing is
sent anywhere. Delete the folder whenever you like. The setting turns itself
off when Yames closes, so it never records on its own.
