# Jam — what each vibe is tuned against

> **Why this file exists.** The first four kits were measured and never
> heard, and the owner's verdict on the result was that the band sounds
> smooth where it should sound raw. A measurement script is a gate, not a
> verdict (`plans/JAM_UX_DECISIONS.md` C2). So every vibe gets a card: two or
> three well-known tracks, the tempo, the feel, and what the drums, the bass
> and the keys sound like on them. The voices are then tuned A/B against
> those records, with the owner in the room for the styles the owner plays
> and with a bass player and a jazz player for the ones the owner does not
> (B10).
>
> **How to read a card.** The tracks are the target, not the product. Nothing
> in Yames samples, quotes or reproduces any of them: every sound is
> synthesised from a recipe, and these are the records the recipe is judged
> against by ear. Tempos are approximate — a human band drifts, and several
> of these were cut before a click track was normal — and are given as the
> figure a player would count off.
>
> **What the settings column means.** Each card ends with what the vibe tile
> actually sets: the groove from `src/jam/grooves.ts`, the kit, the bass
> voice and the keys voice from `src/jam/vibes.ts`. When a tuning session
> concludes that a voice is wrong for its references, the fix goes in
> `vibes.ts` and the card says so.

---

## Rock

**References**

- "Sweet Child o' Mine" — Guns N' Roses, 1987. About 125 bpm, straight.
- "Learn to Fly" — Foo Fighters, 1999. About 136 bpm, straight.
- "Start Me Up" — The Rolling Stones, 1981. About 124 bpm, straight with a
  loose, behind-the-beat backbeat.

**The feel.** Eighth notes on the hat, the backbeat unmissable, the tempo
sitting where a guitar riff has room to breathe rather than where it has to
be rushed.

**The drums.** A big, dry kick with a beater click you can hear over a
distorted guitar; a snare with a hard crack and a short tail rather than a
long room; hats bright and closed with the stick audible on the shoulder.

**The bass.** Played with a pick or hard fingers: a clear attack on the front
of the note, a fundamental that fills in under the guitar, and notes that
stop rather than ring on.

**The keys.** Where they appear at all, a drawbar organ sitting behind the
guitars — sustained, slightly overdriven, never on top.

**Set by the tile:** groove `rock8`, kit Raw, bass picked, keys organ, 120 in
A over an eight-bar loop.

---

## Hard rock

**References**

- "Back in Black" — AC/DC, 1980. About 94 bpm, straight, with the hats open
  on the off-beats.
- "Barracuda" — Heart, 1977. About 148 bpm, straight and driving.
- "Immigrant Song" — Led Zeppelin, 1970. About 113 bpm, straight, with a
  heavy, forward kick.

**The feel.** Slower than it feels. The drive comes from the hats being open
and the cymbals ringing between the backbeats, not from tempo.

**The drums.** The kick fat and forward; the snare loud and slightly ringy;
the hats OPEN on every off-beat, which is what the accent level means on the
hat lane; a crash that washes rather than pings.

**The bass.** Picked, distorted at the edges, doubling the guitar's low notes
with a hard attack.

**The keys.** Off, on these records. The organ is what would play if you
turned it on.

**Set by the tile:** groove `hardRock`, kit Raw, bass picked, keys organ,
loud, 132 in E over an eight-bar loop.

---

## Blues

**References**

- "Pride and Joy" — Stevie Ray Vaughan and Double Trouble, 1983. About 130
  bpm, shuffle — the Texas shuffle the variation is named for.
- "The Thrill Is Gone" — B.B. King, 1969. About 90 bpm, a slow minor blues
  with a triplet underlay.
- "Hide Away" — Freddie King, 1961. About 150 bpm, a boogie shuffle.

**The feel.** Triplets with the middle one left out. Everything on the record
leans on that long-short, including the bass.

**The drums.** A warm room around the kit; the snare rimmy and unhurried; the
shuffle carried on the hats with the foot closing them on two and four.

**The bass.** Fingered, round and woody, walking the boogie figure — root,
third, fifth, sixth and back down through the flat seventh.

**The keys.** A drawbar organ with a slow rotary, comping in the holes the
guitar leaves.

**Set by the tile:** groove `shuffle` with the shuffle feel, kit Room, bass
fingered, keys organ, 92 in A blues over the twelve bars.

---

## Funk

**References**

- "Superstition" — Stevie Wonder, 1972. About 101 bpm, straight sixteenths.
- "Cissy Strut" — The Meters, 1969. About 95 bpm, the New Orleans second-line
  feel the variation is named for.
- "Thank You (Falettinme Be Mice Elf Agin)" — Sly and the Family Stone, 1969.
  About 106 bpm, straight, with the bass slapped.

**The feel.** Sixteenths, and the space between them. The ghost notes on the
snare are the groove; take them out and it is a drum machine.

**The drums.** Tight and close-miked: a short punchy kick, a snare cranked
high with audible ghosts underneath the backbeat, hats fast and dry.

**The bass.** Slapped — a thumb thud on the low notes, a popped octave on the
high ones, and short notes with silence between them.

**The keys.** A clavinet through a wah: percussive, dry, and playing rhythm
rather than harmony.

**Set by the tile:** groove `funk`, kit Tight, bass slap, keys clav, 100 in E
minor over an eight-bar loop. The New Orleans variation moves to the
`secondLine` groove, the Room kit and a fingered bass.

---

## Jazz

**References**

- "So What" — Miles Davis, 1959. About 136 bpm, medium swing.
- "Autumn Leaves" — Cannonball Adderley with Miles Davis, 1958. About 140
  bpm, medium swing.
- "The Girl from Ipanema" — Stan Getz and João Gilberto, 1964. About 130 bpm,
  bossa nova — the reference for the bossa-jazz variation.

**The feel.** Swing: the ride's spang-a-lang with the second eighth late and
light, the hat closing on two and four, the bass drum felt more than heard.

**The drums.** Brushes or light sticks in a real room; the ride the loudest
thing on the kit; no crash unless something happens.

**The bass.** An upright: a thick, short-decaying fundamental with the finger
noise on the front, walking in quarters that ring into each other.

**The keys.** An electric piano — bell-like, soft attack, comping in
rootless voicings behind the horn.

**Set by the tile:** groove `swingRide` with the swing feel, kit Brushes,
bass upright, keys electric piano, soft, 140 in F over AABA 32.

---

## Latin

**References**

- "The Girl from Ipanema" — Stan Getz and João Gilberto, 1964. About 130 bpm,
  bossa nova.
- "Mas Que Nada" — Jorge Ben, 1963. About 104 bpm, samba.
- "Oye Como Va" — Santana, 1970. About 124 bpm, cha-cha.

**The feel.** Even sixteenths with the accents falling off the beat. A bossa
floats, a samba leans on two and four, a cha-cha states the figure and stops.

**The drums.** The rim rather than the snare head; a light kick that walks
rather than punches; a shaker or a closed hat running continuous sixteenths
underneath.

**The bass.** Fingered and round, playing the dotted root-and-fifth figure
with the fifth pushed onto the "and" — the one pattern all three of these
styles share.

**The keys.** A soft, nylon-edged pad or a clean electric piano, comping the
chord and getting out of the way.

**Set by the tile:** groove `bossa`, kit Room, bass fingered, keys pad, 132 in
A minor over sixteen bars. Samba takes the `samba` groove, loud, at 100;
cha-cha takes the `chaCha` groove at 120 with an electric piano.

---

## Pop

**References**

- "Billie Jean" — Michael Jackson, 1982. About 117 bpm, straight, with a
  famously rigid backbeat.
- "Dancing Queen" — ABBA, 1976. About 101 bpm, straight, four on the floor.
- "Uptown Funk" — Mark Ronson featuring Bruno Mars, 2014. About 115 bpm,
  straight.

**The feel.** Metronomic. The point of a pop groove is that it does not move,
so a player can hang anything over it.

**The drums.** Electronic or heavily processed: a short synthetic kick, a
gated snare with a hard front and no room, hats programmed and even.

**The bass.** A synth bass — a filtered saw or a sine with a click on the
attack, sustaining through the bar rather than articulating every note.

**The keys.** A pad: slow attack, wide, filling the space behind everything
without a rhythm of its own.

**Set by the tile:** groove `rock8`, kit Electronic, bass synth, keys pad, 112
in C over an eight-bar loop.

---

## Metal

**References**

- "Master of Puppets" — Metallica, 1986. About 212 bpm, straight, thrash.
- "Raining Blood" — Slayer, 1986. Sections from about 100 to about 230 bpm,
  straight, with sustained double kick.
- "Walk" — Pantera, 1992. About 116 bpm, a half-time stomp.

**The feel.** Straight and relentless, whether that is sixteenths on the kick
at speed or a half-time bar with all the weight on one and three.

**The drums.** The kick clicky and triggered-sounding so sixteen of them a bar
stay countable; the snare high, tight and cutting; the hats and cymbals
bright, with the crash used as an accent rather than a wash.

**The bass.** Picked hard and slightly distorted, locked to the kick — under a
double-kick roll it is one held, driven root, which is what the hold rule in
`src/jam/bassline.ts` writes.

**The keys.** Absent. The pad is only what would play if you asked for it.

**Set by the tile:** groove `doubleKick`, kit Raw, bass picked, keys pad,
loud, 160 in E minor over an eight-bar loop.

---

## Country

**References**

- "Folsom Prison Blues" — Johnny Cash, 1955. About 104 bpm, the train beat.
- "Friends in Low Places" — Garth Brooks, 1990. About 136 bpm, a two-step.
- "Tennessee Waltz" — Patti Page, 1950. About 96 bpm, in three.

**The feel.** A two-feel: the bar counted in halves, the bass alternating root
and fifth, the snare running underneath like a rhythm guitar.

**The drums.** Brushes on the snare more often than sticks; sixteenths swept
with the accent on every "and", which is what makes a train a train; the kick
plain, on one and three.

**The bass.** An upright, or an electric played like one: root and fifth,
long notes, no fills.

**The keys.** A clean electric piano or an acoustic-sounding one, comping in
simple triads.

**Set by the tile:** groove `train`, kit Brushes, bass upright, keys electric
piano, 120 in G over an eight-bar loop. Two-step takes the `twoStep` groove at
168; the waltz takes `waltz` at 108, in three.

---

## What still has to happen

These cards are the target. They are not a claim that the voices already hit
it. The A/B sessions (C2) are still owed for:

- **Raw kit and the driving grooves** — with the owner, who plays rock.
- **The five bass voices** — with a bass player; the roster and its synthesis
  recipes are B9's, and note length is the only part of it that lives in
  `src/jam/bassline.ts`.
- **Jazz and Latin** — with a jazz player. Nobody on this build plays either
  well enough to judge a brushes kit or an upright by ear.

Until a card has been listened through, the vibe it describes is a
measurement, not a verdict.
