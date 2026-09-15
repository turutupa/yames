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

> **What this file became.** It started as one card per vibe tile, written so
> the nine voices could be tuned A/B against records rather than against a
> measurement script. The fourth pass took the grooves from twenty-five to a
> hundred and fifteen, so it now carries two things: the nine cards, which are
> about SOUND and are still the tuning brief, and an index of every groove and
> the record its table was written against, which is about the TABLES and is
> generated from `src/jam/grooves.ts` so the two cannot drift apart.

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

**Set by the tile:** groove `rock8`, kit Studio, bass picked, keys organ, 120 in
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

**Set by the tile:** groove `hardRock`, kit Studio, bass picked, keys organ,
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

**Set by the tile:** groove `shuffle` with the shuffle feel, kit Studio, bass
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

**Set by the tile:** groove `funk`, kit Club, bass slap, keys clav, 100 in E
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

**Set by the tile:** groove `swingRide` with the swing feel, kit Club,
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

**Set by the tile:** groove `bossa`, kit Club, bass fingered, keys pad, 132 in
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

**Set by the tile:** groove `rock8`, kit Studio, bass synth, keys pad, 112
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

**Set by the tile:** groove `doubleKick`, kit Studio, bass picked, keys pad,
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

**Set by the tile:** groove `train`, kit Studio, bass upright, keys electric
piano, 120 in G over an eight-bar loop. Two-step takes the `twoStep` groove at
168; the waltz takes `waltz` at 108, in three.

---

## World

> The one card with no vibe tile behind it. The nine tiles are the nine
> families a guitarist in a bedroom reaches for first, and "World" is not a
> style anybody plays — it is where thirteen grooves live that would each have
> been a family of its own if the chip row were longer. So this card has no
> "set by the tile" line, and the grooves under it are reached by name from the
> World chip in the groove picker.

**References**

- "Water No Get Enemy" — Fela Kuti, 1975. About 108 bpm, straight sixteenths.
- "Exodus" — Bob Marley and The Wailers, 1977. About 122 bpm, the kick on all
  four.
- "Libertango" — Ástor Piazzolla, 1974. About 132 bpm, three-three-two across
  a bar of four.

**The feel.** Almost none of it is a backbeat. A one-drop leaves beat one
empty, a ska bar puts everything the band plays on the off-beat and the drums
on none of it, a tango argues with itself, and a ruchenitsa is counted
two-two-three. What the shelf has in common is that a rock drummer's instinct
is wrong on every one of them, which is exactly why they are worth having.

**The drums.** The cross-stick does most of the work in the reggae grooves —
four of the eight rim grooves in the file are on this shelf — and the rest is
hand percussion written onto a kit: a dhol gallop, a cajón, a bell.

**The bass.** Fingered and long. Reggae is the one family in the file where
the bass line IS the tune, and a slap or a pick would be the wrong instrument
before it played a note.

**The keys.** An organ for reggae, played on the off-beat and nowhere else;
a clean piano for cumbia and tango.

---

## Every groove, and the record it was written against

One hundred and fifteen tables, nine shelves. The record is the target and
not the product: nothing here samples, quotes or reproduces any of them, and
each is the take the table was written against by ear. The three that name no
track say so — a village dance is older than recording.


### Rock (18)

| Groove | Written against |
|---|---|
| Rock 8ths | "Sweet Child o' Mine" — Guns N' Roses, 1987 |
| Rock 16ths | "Everlong" — Foo Fighters, 1997 |
| Half-time | "In the Air Tonight" — Phil Collins, 1981 |
| Hard rock | "Back in Black" — AC/DC, 1980 |
| Stomp | "When the Levee Breaks" — Led Zeppelin, 1971 |
| Quarter hats | "Highway to Hell" — AC/DC, 1979 |
| Driving eighths | "Learn to Fly" — Foo Fighters, 1999 |
| Rock ride | "Won't Get Fooled Again" — The Who, 1971 |
| Anthem stomp | "We Will Rock You" — Queen, 1977 |
| Grunge | "Smells Like Teen Spirit" — Nirvana, 1991 |
| Motorik | "Hallogallo" — Neu!, 1972 |
| Funk rock | "Can't Stop" — Red Hot Chili Peppers, 2002 |
| 12/8 rock | "Unchained Melody" — The Righteous Brothers, 1965 |
| Half-time shuffle | "Rosanna" — Toto, 1982 |
| Garage | "Seven Nation Army" — The White Stripes, 2003 |
| Boogie rock | "Rockin' All Over the World" — Status Quo, 1977 |
| Surf | "Wipe Out" — The Surfaris, 1963 |
| Rock waltz | "Manic Depression" — The Jimi Hendrix Experience, 1967 |


### Blues (10)

| Groove | Written against |
|---|---|
| Shuffle | "Got My Mojo Working" — Muddy Waters, 1957 |
| Slow blues | "The Thrill Is Gone" — B.B. King, 1969 |
| Texas shuffle | "Pride and Joy" — Stevie Ray Vaughan and Double Trouble, 1983 |
| Chicago shuffle | "Every Day I Have the Blues" — B.B. King, 1955 |
| Jump blues | "Caldonia" — Louis Jordan and His Tympany Five, 1945 |
| Blues rhumba | "Hoochie Coochie Man" — Muddy Waters, 1954 |
| Boogie | "Boom Boom" — John Lee Hooker, 1962 |
| Straight blues | "Born Under a Bad Sign" — Albert King, 1967 |
| Stop time | "Mannish Boy" — Muddy Waters, 1955 |
| Swamp blues | "I'm a King Bee" — Slim Harpo, 1957 |


### Funk and soul (14)

| Groove | Written against |
|---|---|
| Funk | "Superstition" — Stevie Wonder, 1972 |
| Boom bap | "The World Is Yours" — Nas, 1994 |
| Second line | "Hey Pocky A-Way" — The Meters, 1974 |
| Motown | "I Can't Help Myself" — Four Tops, 1965 |
| Funky drummer | "Funky Drummer" — James Brown, 1970 |
| Purdie shuffle | "Home at Last" — Steely Dan, 1977 |
| Meters funk | "Cissy Strut" — The Meters, 1969 |
| Soul backbeat | "Respect" — Aretha Franklin, 1967 |
| Stax | "Green Onions" — Booker T. & the M.G.'s, 1962 |
| Boogaloo | "Get Out of My Life, Woman" — Lee Dorsey, 1966 |
| Go-go | "Bustin' Loose" — Chuck Brown & the Soul Searchers, 1978 |
| New jack swing | "My Prerogative" — Bobby Brown, 1988 |
| Gospel shout | "Oh Happy Day" — The Edwin Hawkins Singers, 1969 |
| Slow jam | "Let's Get It On" — Marvin Gaye, 1973 |


### Jazz (12)

| Groove | Written against |
|---|---|
| Swing ride | "So What" — Miles Davis, 1959 |
| Jazz waltz | "Someday My Prince Will Come" — Miles Davis, 1961 |
| Brushes swing | "My Funny Valentine" — Chet Baker, 1954 |
| Up-tempo swing | "Cherokee" — Clifford Brown and Max Roach, 1955 |
| Two feel | "Take the 'A' Train" — Duke Ellington and His Orchestra, 1941 |
| Jazz ballad | "Blue in Green" — Miles Davis, 1959 |
| Five | "Take Five" — The Dave Brubeck Quartet, 1959 |
| Bebop | "Now's the Time" — Charlie Parker, 1945 |
| Big band | "Corner Pocket" — Count Basie and His Orchestra, 1955 |
| Hard bop | "Moanin'" — Art Blakey and the Jazz Messengers, 1958 |
| Soul jazz | "Back at the Chicken Shack" — Jimmy Smith, 1960 |
| Trad jazz | "West End Blues" — Louis Armstrong and His Hot Five, 1928 |


### Latin (14)

| Groove | Written against |
|---|---|
| Bossa | "Desafinado" — João Gilberto, 1959 |
| Samba | "Mas Que Nada" — Jorge Ben, 1963 |
| Cha-cha | "Oye Como Va" — Tito Puente, 1963 |
| Mambo | "Mambo No. 5" — Pérez Prado, 1949 |
| Son | "Chan Chan" — Buena Vista Social Club, 1997 |
| Guaguancó | "Ran Kan Kan" — Tito Puente, 1949 |
| Cáscara | "Manteca" — Dizzy Gillespie, 1947 |
| Songo | "Sandunguera" — Los Van Van, 1985 |
| Merengue | "Ojalá Que Llueva Café" — Juan Luis Guerra, 1989 |
| Bolero | "Bésame Mucho" — Trío Los Panchos, 1944 |
| Baião | "Asa Branca" — Luiz Gonzaga, 1947 |
| Partido alto | "Taj Mahal" — Jorge Ben, 1972 |
| Bossa 2-3 | "The Girl from Ipanema" — Stan Getz and João Gilberto, 1964 |
| Afro-Cuban 6/8 | "Afro Blue" — Mongo Santamaría, 1959 |


### Pop and dance (14)

| Groove | Written against |
|---|---|
| Four on the floor | "Dancing Queen" — ABBA, 1976 |
| Ballad | "Every Breath You Take" — The Police, 1983 |
| Disco | "Le Freak" — Chic, 1978 |
| House | "Your Love" — Frankie Knuckles, 1987 |
| Electro | "Planet Rock" — Afrika Bambaataa and the Soulsonic Force, 1982 |
| Drum and bass | "Inner City Life" — Goldie, 1995 |
| Breakbeat | "Firestarter" — The Prodigy, 1996 |
| Trap | "Turn Down for What" — DJ Snake and Lil Jon, 2013 |
| Reggaetón | "Gasolina" — Daddy Yankee, 2004 |
| Synth-pop | "Just Can't Get Enough" — Depeche Mode, 1981 |
| Stadium | "Viva la Vida" — Coldplay, 2008 |
| UK garage | "Re-Rewind" — Artful Dodger featuring Craig David, 1999 |
| Pop ballad | "I Will Always Love You" — Whitney Houston, 1992 |
| Indie disco | "Take Me Out" — Franz Ferdinand, 2004 |


### Metal and punk (10)

| Groove | Written against |
|---|---|
| Double kick | "Raining Blood" — Slayer, 1986 |
| Gallop | "The Trooper" — Iron Maiden, 1983 |
| Blast beat | "You Suffer" — Napalm Death, 1987 |
| Thrash | "Master of Puppets" — Metallica, 1986 |
| D-beat | "Realities of War" — Discharge, 1980 |
| Breakdown | "Walk" — Pantera, 1990 |
| Doom | "Black Sabbath" — Black Sabbath, 1970 |
| Djent | "Bleed" — Meshuggah, 2008 |
| Punk eighths | "Blitzkrieg Bop" — Ramones, 1976 |
| Skank | "American Jesus" — Bad Religion, 1993 |


### Country and folk (10)

| Groove | Written against |
|---|---|
| Waltz | "Tennessee Waltz" — Patti Page, 1950 |
| 6/8 | "House of the Rising Sun" — The Animals, 1964 |
| Train beat | "Folsom Prison Blues" — Johnny Cash, 1955 |
| Two-step | "Friends in Low Places" — Garth Brooks, 1990 |
| Country shuffle | "Swinging Doors" — Merle Haggard, 1966 |
| Boom-chick | "Hey Good Lookin'" — Hank Williams, 1951 |
| Bluegrass | "Blue Moon of Kentucky" — Bill Monroe, 1947 |
| Rockabilly | "Blue Suede Shoes" — Carl Perkins, 1956 |
| Country ballad | "Crazy" — Patsy Cline, 1961 |
| Outlaw | "Are You Sure Hank Done It This Way" — Waylon Jennings, 1975 |


### World (13)

| Groove | Written against |
|---|---|
| One-drop | "No Woman, No Cry" — Bob Marley and The Wailers, 1974 |
| Afrobeat | "Water No Get Enemy" — Fela Kuti, 1975 |
| Steppers | "Exodus" — Bob Marley and The Wailers, 1977 |
| Rockers | "Right Time" — The Mighty Diamonds, 1976 |
| Rocksteady | "Rock Steady" — Alton Ellis, 1966 |
| Ska | "Guns of Navarone" — The Skatalites, 1965 |
| Bhangra | "Gur Nalo Ishq Mitha" — Malkit Singh, 1990 |
| Rumba flamenca | "Bamboléo" — Gipsy Kings, 1987 |
| Tango | "Libertango" — Ástor Piazzolla, 1974 |
| Freylekhs | "Der Heyser Bulgar" — Naftule Brandwein, 1923 |
| Cumbia | "Cómo Te Voy a Olvidar" — Los Ángeles Azules, 1996 |
| Highlife | "All for You" — E.T. Mensah and the Tempos, 1952 |
| Ruchenitsa 7/8 | No reference track — this one is older than recording |


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
