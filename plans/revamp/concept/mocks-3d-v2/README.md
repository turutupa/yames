# Yames Coach: 3D mocks, v2

The same concept, screens, terms and data as `../mocks/`, re-imagined in three.js. A clickable app, not a gallery.

v2, from the owner's feedback: the fretboard is the hero on every screen, sharp and with no depth of field; pearl dots at 3, 5, 7, 9 and 12, side dots, quiet fret numbers; markers sit behind the fret and above the strings so dots and letters stay clear; no body: the instrument shown is the neck, nut to fret 24; whole-neck views on Today, Paths and Coach; on practice screens a large zoom of the active frets with a crisp nut-to-24 overview strip showing where you are; an abstract backdrop instead of the bench and room. Each shot shows only its own subject. On Paths, the ten Steps are the ten real inlays, 3 to 24.

## View it

Serve the parent folder over HTTP (modules don't load from `file://`), then open
`http://127.0.0.1:8765/mocks-3d-v2/index.html`. It needs network access for three@0.170.0 (unpkg) and Google Fonts.

- Walk it: **Start** on Today runs Theory (count-in), Between takes, Theory again, Result, Mechanics, Mechanics result, Jam, Recap.
- Jump: the **Screens** button (top right), or a hash: `#today #theory #mechanics #result #edge #metronome #jam #blues`. Full list in the panel.
- URL options: `?q=0|1|2` forces a quality tier, `?nogl=1` the flat fallback, `?rm=1` reduced motion, `?snap=1` no camera flights, `?maxfps=N` caps rendering.

## What is simulated

Everything: no mic, no MIDI, no model. Notes, timing, evenness, the tempo climb and the coach's lines are scripted or lightly randomised
on a loop. Opened from a hash, a screen loops; started from Today, a take ends by itself and moves on. Sound is optional, off until
tapped, and synthesised (click, plucks, bass). Nothing is stored, except that setlist edits last until a reload.

## How it's built

No build step. `js/world.js` holds the one continuous scene (objects on an abstract backdrop), the camera rig and quality tiers; `js/guitar.js` the
neck, strings and notes; `js/objects.js` the amp, meter, metronome, pedals and tempo chart; `js/tex.js` every texture, computed at load;
`js/screens.js` all words and behaviour; `js/app.js` the router and loop. Key text is crisp HTML over the canvas; each screen marks a DOM
slot and the camera solves itself to frame the object into it, so layouts hold on any viewport.

## Performance notes

- Tier 2 (desktop): shadow map, plus light bloom on non-neck shots only. Neck shots go straight to the screen, with no post at all.
- Tier 1 (most phones): DPR cap 2, no post, painted string shadows, smaller textures. Tier 0 (older GPUs, software): DPR cap 1.6, half textures.
- Adaptive: if frames average over 26 ms it lowers resolution, then drops post, then shadows.
- Frame rate follows the screen: 60 during takes and flights, 20 to 30 on calm screens. Rendering pauses when the tab is hidden.
- WebGL context loss is handled and restored; without WebGL every screen still works flat.
- Startup computes textures once: expect a short "Warming up" on a phone.
- Verified only under SwiftShader software rendering, so frame rates here say nothing about real devices. **Not yet run on a real phone GPU.**

## Checks

`tools/verify.cjs` (routes, tap-through, overflow, context loss, fallback) and `tools/shoot.cjs` (writes `shots/`). Both use the Playwright
in `../../yames/node_modules`. Set `BASE` if the server isn't on 8765.
