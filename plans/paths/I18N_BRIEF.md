# Translating a Yames learning-path pack

Yames is a guitar practice app. You translate the player-facing text of one learning
path from English into ONE target language.

Input:  /tmp/yames-i18n/<path>/todo.<lng>.json   shape: { "<pathId>": { "<key>": "<English>" } }
Output: /tmp/yames-i18n/<path>/done.<lng>.json   SAME shape, SAME keys, values translated.

Rules:
- Keep every key exactly. Translate every value. Valid JSON, UTF-8, no trailing commas.
- Voice: plain, direct, second person informal (es "tú", de "du", fr "tu", it "tu", nl "je",
  pl "ty", pt-BR "você", ru polite lowercase "вы" with -те imperatives (as the existing ru packs do), tr "sen"; ja/ko polite-plain です/ます / 해요체; vi "bạn").
  Like a calm teacher. NO exclamation marks anywhere. No emojis. Do not add or drop sentences.
- Keep all numbers as digits exactly as in the English (frets, BPM, fingers, counts). Do not
  spell a digit out and do not turn a spelled-out English number into a digit.
- Keep note names as letters A B C D E F G with # / b (e.g. "A minor" -> es "A menor",
  de "A-Moll", ja "Aマイナー"); never Do-Re-Mi and never German H.
- Keep "BPM" as is. Keep tab marks such as "h" literal. Keep any {{placeholder}} or <tag> intact.
- Capitalised product words Step, Exercise, Level, Path, Take, Session, Coach: use the same
  word the existing translations use. Reference translations by the same team live in
  /home/dgx-personal/projects/yames-mvp-paths-content/src/paths/packs/i18n/<lng>/shred.json and
  alternate-picking.json (English source beside them in i18n/en/). Read enough of them FIRST
  to copy their terminology for: hammer-on, pull-off, legato, palm mute, downstroke, upstroke,
  pick (the plectrum and the verb), fret, string names (low E, top E, B string...), eighth notes,
  sixteenths, triplets, sextuplets, click, bar, beat, rung, clean tempo, warm-up, take,
  "This is a warm-up. It tells you how it went, and it decides nothing." and
  "I check ... after the take". Reuse identical sentences verbatim when the English is identical.
- The coach speaks in first person ("I'll say how even it was"): keep first person.
- Natural, idiomatic guitar-teacher language of the target locale; standard music terms of
  that language (es corcheas/semicorcheas/tresillos, de Achtel/Sechzehntel/Triolen, fr croches/
  doubles croches/triolets, ...). zh-CN simplified, zh-TW traditional with Taiwan terms.
- Do not edit any file in the repository. Write only the done.<lng>.json file (you may write
  it in several passes with a small script if the text is long). Do not run git or npm.

Finish: verify with python that done has exactly the todo's keys and no value contains "!" or "！",
then reply with one line: the language, number of strings, and any key you were unsure about.

Extra notes for rhythm text:
- Counting syllables in quotes ('1 and 2 and', '1 e and a', '1-trip-let') are what a player says
  out loud. Use the counting convention the reference packs of your language already use (search
  the references for "1 e" / "trip"); if none, use the common convention of that language's guitar
  teachers. Keep the digits. Keep it consistent across the whole file.
- "the 'and' of 2" = the off-beat eighth after beat 2; "the 'e'" and "the 'a'" = 2nd and 4th sixteenth.
- The todo file may hold more than one path id at the top level; translate all of them.
- Metal terms: "chug" = the short palm-muted low note (keep the usual loanword or the natural local
  word guitarists use); "gallop" = eighth + two sixteenths; "power chord" = the usual local term;
  "pedal tone" = a repeated low note under a melody; "tremolo picking" = fast repeated alternate picking.
- Russian: polite lowercase "вы" throughout, as the existing ru packs.

Round 2 notes (path "round2"):
- The todo holds SIX path ids at the top level (alternate-picking, sweep-picking, blues-pentatonics,
  classic-rock, shred, know-the-neck). Translate all of them; the output keeps the same six ids.
- For the five existing paths, the pack's current translation is in
  src/paths/packs/i18n/<lng>/<pathId>.json: read the neighbouring strings of the same Step there and
  match their wording exactly (the same Step and Exercise terms, the same tempo sentence pattern such
  as "Straight eighths, 60 BPM up to a pass at 80."). A few keys are sentences whose English changed
  slightly (path.assumes of shred, some level.advanced.summary, two classic-rock howTo lines): start
  from the existing translation of that key in that file and change only what the English changed.
- know-the-neck is about note names: keep A B C D E F G letters, "C major" style names as the
  reference packs write them, and translate "octave", "third", "fifth", "triad", "root", "arpeggio",
  "box" (pentatonic box) with the terms the blues-pentatonics and classic-rock packs of your language
  already use. The mnemonic "Eddie Ate Dynamite, Good Bye Eddie" stays in English, in quotes if natural.

Round 3 notes (path folder "round3"): the todo holds three path ids (alternate-picking, legato,
metal-rhythm), about 70 strings. They are new Steps and rewritten how-to lines inside packs that are
ALREADY translated: read the current translation of the same pack in
src/paths/packs/i18n/<lng>/<pathId>.json first and match its terminology and tone exactly (the same
words for roll, hammer-on, pull-off, chug, gallop, power chord, crossing, outside/inside, burst).
For a key that already exists in that file (its English changed), keep what still applies and
translate the rest. "hip-po-pot-a-mus" is a five-syllable counting word: replace it with a natural
five-syllable word of your language, hyphenated by syllable. Use scratch files only under
/tmp/yames-i18n/round3/work_<lng>/.

Round 4 notes (path folder "round4"): the todo holds two path ids: scales-and-modes (a new Theory
Path, about 220 strings) and legato (one sentence whose English changed; start from its existing
translation in src/paths/packs/i18n/<lng>/legato.json). For scales-and-modes, take the music-theory
vocabulary from the know-the-neck, blues-pentatonics and classic-rock packs of your language
(src/paths/packs/i18n/<lng>/): major scale, natural minor, relative minor, harmonic minor, whole
step / half step, third, sixth, seventh, root, octave, shape, position, sequence, triplets, "Your
turn", "Not checked yet". Mode names: use the standard names of your language for Dorian and
Mixolydian. Scale-degree words ("the raised sixth", "the lowered seventh") in the standard theory
terms of your language. "Ode to Joy" by its usual title in your language. Scratch files only under
/tmp/yames-i18n/round4/work_<lng>/.

Round 5 notes (path folder "round5"): about 40 strings in four packs that are ALREADY translated
(legato, rhythm-foundations, metal-rhythm, sweep-picking): new warm-ups, and six sweep-picking how-to
lines whose English grew from one sentence to two. Read the current translation of each pack in
src/paths/packs/i18n/<lng>/<pathId>.json FIRST and copy its wording: every warm-up there already has a
translated title/purpose/howTo in the same pattern ("... A different key and string each time.",
"Start well under your clean tempo. ...") and the same coach line; reuse those sentences verbatim
where the English is the same. For sweep-picking keys that already exist, start from the existing
translation. Scratch files only under /tmp/yames-i18n/round5/work_<lng>/.

Round 6 notes (path folder "round6"): one new path id, "tapping" (two-hand tapping), about 190
strings. Take the vocabulary from the shred pack of your language, Step "tapping-etude"
(src/paths/packs/i18n/<lng>/shred.json: keys step.tapping-etude.* and exercise.tapping-etude.tap-*),
and from the legato pack (hammer-on, pull-off, roll, "from the top"). Use the same word for "tap"
the shred pack uses; "the cell" = the three-note tap / pull-off / hammer-on figure (translate as
the natural word for a small repeating figure). Chord names Am, F, G, E stay as letters. Scratch
files only under /tmp/yames-i18n/round6/work_<lng>/.

Round 7 notes (path folder "round7"): about 115 strings across ten packs that are ALREADY translated.
Nearly all are sentences whose English was corrected after proof-reading (a wrong count, a wrong
finger, a clearer description). For every key: open the current translation of that key in
src/paths/packs/i18n/<lng>/<pathId>.json, compare the new English in the todo with the old English
(src/paths/packs/i18n/en/<pathId>.json holds the NEW English; the old one is only reflected in the
existing translation), and produce the translation of the NEW English, keeping the existing wording
wherever the meaning did not change. One sentence is new and repeated on many exercises (it appears
once in the todo): "The frets and note names here are for the first version. Other Takes move the
same figure to another string or key." Use the pack's existing word for "Take". Scratch files only
under /tmp/yames-i18n/round7/work_<lng>/.

Round 8 notes (path folder "round8"): one new path id, "funk-lines" (funk rhythm guitar: single-note
sixteenth lines, two-note stabs, octaves). Take rhythm vocabulary and the counting convention
('1 e and a', "the 'and' of 2", "the 'e'", "the 'a'") from the rhythm-foundations pack of your
language (src/paths/packs/i18n/<lng>/rhythm-foundations.json) and copy it exactly; band/line/Take/Step
words from the same pack. "stab" = a short two-note chord hit (use the natural word guitarists use,
or keep "stab" if that is what they say); "scratch" = a muted percussive stroke; "the pocket" = the
groove feeling of playing exactly in time (keep "pocket" if the language's musicians do). Chord
names Am7 and D9 stay as written. IMPORTANT: write scratch files only under
/tmp/yames-i18n/round8/work_<lng>/ and write only your own language's output file.

Round 9 notes (path folder "round9"): about 200 strings for a pack that is ALREADY translated,
"blues-pentatonics" (seven new Steps added to it, plus five changed sentences). Your first job is
consistency with the existing translation: read src/paths/packs/i18n/<lng>/blues-pentatonics.json
and reuse its vocabulary exactly (box, shuffle, lick, chorus, twelve bars, "your turn",
"not checked yet", landing, third, arpeggio, boogie line, quick change, sixths, bend, slide, the
form of address and the level names). Several new sentences are close copies of existing ones
(the coach lines, "Shuffle eighths, 50 BPM up to a pass at 80", the "Your turn, and not checked
yet…" sentence): where the English is identical or near-identical to an existing key's English
(compare src/paths/packs/i18n/en/blues-pentatonics.json), copy the existing translation. For the
five changed keys (path.assumes, path.orderRationale, three level.*.summary) start from the
existing translation and change only what the English changed. Note names (A, C#, F#, B flat, E
flat) follow the convention the existing pack uses in your language. Chord names (A7, D7, E7, G7,
C7, Am7, Dm7) stay as written. IMPORTANT: write scratch files only under
/tmp/yames-i18n/round9/work_<lng>/ and write only your own language's output file.

Round 10 notes (path folder "round10"): one new path id, "triads" (a theory path for a player with
NO theory: what a triad is, its three shapes, minor, common chord progressions). About 250 strings.
Take vocabulary from the know-the-neck pack of your language
(src/paths/packs/i18n/<lng>/know-the-neck.json, especially keys step.triads.* and exercise.triads.*:
triad, root, third, fifth, shape, "top string", string names, fret, band, the coach lines, "Your
turn, and not checked yet…", level names) and from scales-and-modes.json (major scale, key). Copy
existing translations where the English is identical (the coach lines "Right notes and even eighths
after the take.", "Band on. Right notes and time after the take.", "This is a warm-up. It tells you
how it went, and it decides nothing." appear in know-the-neck). "shape one / shape two / shape
three" are fixed names: translate them the same way everywhere, including the three variant labels.
"roll" a shape = pick its strings one at a time, low to high and back. Chord names in charts and
prose (C, F, G, Am, Cmaj7, C7, "C major seven", "B flat") follow the convention the know-the-neck
pack uses in your language for note and chord names. The reader is a beginner: keep sentences as
plain as the English. IMPORTANT: write scratch files only under /tmp/yames-i18n/round10/work_<lng>/
and write only your own language's output file.

Round 11 notes (path folder "round11"): one new path id, "chords-in-a-key" (theory, the Path after
"triads": the seven chords of a key, chord numbers, common progressions, other keys, the minor key).
About 210 strings. Your FIRST reference is the triads pack of your language
(src/paths/packs/i18n/<lng>/triads.json): reuse its words exactly for triad, shape, root, third,
fifth, "top three strings", "the D, G and B strings", string names, fret, band, key, the coach lines
("Band on. Right notes and time after the take.", "This is a warm-up…", "A key that changes from
day to day…"), "Your turn, and not checked yet…", the variant note sentence, chord names (A minor,
B flat, C sharp minor…) and level names. Chord numbers are written as words in the English ("one,
four, five", "two, five, one", "six"): keep them as number WORDS in your language (they are spoken
names of chords), in the same order; Roman numerals I, IV, V, ii, iii, vi stay as written. Fret
lists such as "5, 5, 3" stay as digits. "diminished" = the diminished triad; "verse" and "chorus"
are song sections; "twelve-bar blues" as your language's musicians say it. Keep sentences as plain
as the English: the reader is new to theory. IMPORTANT: write scratch files only under
/tmp/yames-i18n/round11/work_<lng>/ and write only your own language's output file.

Round 13 notes (path folder "round13"): THREE path ids in one todo file; your output file must have
the same three top-level keys with the same inner keys.
(1) "arpeggios-over-changes": a new pack, about 230 strings (theory, the Path after "chords-in-a-key":
a chord played as a line, the nearest note at a change, seventh chords, two octaves, first sweeps).
(2) "triads": about 75 strings: three new Steps (f-and-g, more-minors, diminished) and three changed
Level summaries. (3) "chords-in-a-key": about 30 strings: one new Step (key-of-g) and one changed
Level summary.
References, in this order: src/paths/packs/i18n/<lng>/triads.json and chords-in-a-key.json of your
language (reuse their words exactly for triad, shape, "shape one/two/three", root, third, fifth,
string names, fret, band, key, chord numbers as number WORDS, the coach lines, "Your turn, and not
checked yet…", the variant note sentence, chord names such as A minor / B flat / F sharp / "C major
seven" / "B diminished", level names); for the changed Level summaries start from the existing
translation and change only what the English changed. For sweeping vocabulary (sweep, "one push /
one pull" of the pick, rest stroke, triplets, "Timed and counted", "the pitch is for your ear") use
src/paths/packs/i18n/<lng>/sweep-picking.json, keys step.triads.* and exercise.triads.*. "arpeggio"
= the chord's notes one at a time as a line; "roll" a finger = lay it flat and rock it from string
to string; "half step" = one fret. The Path names "Triads", "Chords in a Key", "Sweep Picking" are
titles: use the translated titles from those packs (path.title). Fret lists like "10, 9, 8, 8" stay
as digits. Keep sentences as plain as the English. IMPORTANT: write scratch files only under
/tmp/yames-i18n/round13/work_<lng>/ and write only your own language's output file.

Round 14 notes (folder /tmp/yp2/i18n/round14/ (the working copy of this brief was /tmp/yp2/i18n/BRIEF.md) ): THREE path ids in one todo file, 443 strings:
"triads" (141), "chords-in-a-key" (190), "arpeggios-over-changes" (112). All three packs are ALREADY
translated in your language: src/paths/packs/i18n/<lng>/triads.json, chords-in-a-key.json and
arpeggios-over-changes.json (English beside them in src/paths/packs/i18n/en/). The todo holds new
consolidation Steps for each Path plus about thirty sentences whose English changed.

OUTPUT: write ONE FILE PER PATH ID, each shaped { "<pathId>": { "<key>": "<translation>" } }:
  /tmp/yp2/i18n/round14/done.<lng>.triads.json
  /tmp/yp2/i18n/round14/done.<lng>.chords-in-a-key.json
  /tmp/yp2/i18n/round14/done.<lng>.arpeggios-over-changes.json
Finish and verify one path before starting the next. Scratch files only under
/tmp/yp2/i18n/round14/work_<lng>/ . Do not touch any other language's files.

How to work:
1. Read the existing translation of the same pack FIRST and reuse its words exactly: triad, shape,
   "shape one / two / three", root, third, fifth, seventh, string names ("the D, G and B strings",
   "top string", "low E string"), fret, band, key, chord numbers as number WORDS in the same order
   ("one, six, two, five"), chord names in prose ("A minor", "B flat", "F sharp minor", "C major
   seven", "D minor seven", "G seven", "B diminished"), the coach lines, "Your turn, and not checked
   yet…", the variant-note sentence, level names, arpeggio, two octaves, sweep, "one push / one pull",
   "Timed and counted", "the pitch is for your ear".
2. For a key that ALREADY EXISTS in your language's pack file (its English changed): start from the
   existing translation and change only what the English changed.
3. Where the English of a new string is identical to an English string that is already translated in
   that pack (coach lines, "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
   "The letters are … every time.", the variant note), copy that translation verbatim. A small script
   that maps identical English to the existing translation saves you most of this work: build it from
   i18n/en/<pathId>.json and i18n/<lng>/<pathId>.json before translating by hand.
4. New vocabulary in this round, to translate the same way everywhere:
   - "set of strings" / "the low set" / "the A, D and G strings": a group of three neighbouring strings.
   - "verse", "chorus", "bridge", "A section", the form "A, A, B, A" (keep the letters A and B).
   - "from outside the key", "the flat seven" (the major chord a whole step below home, e.g. B flat in
     C), "the major two", "the minor four": spoken names of chords, keep them as number words.
   - Seventh chords: "major seven", "minor seven", "seven" (the dominant seventh, as in "G seven"),
     "half-diminished" (written Bm7b5; keep "Bm7b5" as written). Use your language's standard names
     and stay consistent with how the arpeggios-over-changes pack already names "C major seven",
     "A minor seven", "G seven".
   - "root on the A string / on the low E string", "leave out the A string", "the first finger laid
     flat / across fret 5" (a small barre), "lean on a string so it stays quiet" (muting).
   - "relative minor", "home" (the tonic chord: use the word the chords-in-a-key pack already uses),
     "the way home", "the pull" (of a leading note).
   - "pentatonic box" (as blues-pentatonics names it), "roll / rock the finger" (as the existing
     arpeggios-over-changes sweeps Step says it).
   - Path titles "Triads", "Chords in a Key", "Arpeggios over Changes", "Sweep Picking": use the
     translated titles (path.title of each pack).
5. Digits stay digits (frets "7, 5, 5", BPM, bar numbers "Bars 1 to 4"), spelled-out English numbers
   stay words. Chord symbols in charts or after "written" (Bm7b5, Cmaj7) stay as written. No
   exclamation marks. Keep sentences as plain as the English: the reader is new to theory.

Finish: for each output file verify with python that it has exactly the todo's keys for that path id
and that no value contains "!" or "！" and no value is empty or identical to the English (unless it is
only chord names and digits). Then reply with one line: the language, strings per path, and any key you
were unsure about.

Round 15 notes (folder /tmp/yp2/i18n/round15/): TWO path ids in the todo, 374 strings.
(1) "first-chords" (314 strings): a NEW pack, "First Chords and Strumming": a Path for a TRUE
BEGINNER: open chords, changing between them, strumming, a first song. The reader has never played a
chord and knows no theory and no jargon: keep every sentence as short and plain as the English, like
a patient teacher sitting beside them.
(2) "classic-rock" (60 strings): two new Steps (riffs-in-e, box-two) and two changed Level
summaries in a pack that is ALREADY translated: read src/paths/packs/i18n/<lng>/classic-rock.json
first and reuse its words exactly (riff, root line, fourths, pedal, palm-muted, box, extension, lick,
"Your turn…", the Step numbering "Step 1", level names); for the two changed summaries start from the
existing translation and change only what the English changed. "box 2" = the second pentatonic box.

OUTPUT: ONE FILE PER PATH ID, each shaped { "<pathId>": { "<key>": "<translation>" } } with exactly
the todo's keys for that path:
  /tmp/yp2/i18n/round15/done.<lng>.first-chords.json
  /tmp/yp2/i18n/round15/done.<lng>.classic-rock.json
Scratch files only under /tmp/yp2/i18n/round15/work_<lng>/ . Write a file in several passes if it is
long. Do the short classic-rock file first.

The notes below are for "first-chords".

References in your language, to read FIRST and copy vocabulary from (all under
src/paths/packs/i18n/<lng>/, English beside them in i18n/en/):
- rhythm-foundations.json: the beginner voice, click, beat, bar, quarter / half / whole notes,
  eighth notes, the counting convention ('1 and 2 and', "the 'and' of 2"), rest, downstroke,
  upstroke, band, "Start well under your clean tempo", the warm-up sentences.
- metal-rhythm.json: downstroke, upstroke, palm / side of the picking hand, "one attack", "timed
  and counted", power chord.
- triads.json and chords-in-a-key.json: chord, chord names in prose ("E minor", "A minor",
  "F major seven"), string names ("the A string", "top string", "low E string"), fret, finger
  names ("first finger" … "fourth finger"), "one string toward the floor", band, key, "Your turn,
  and not checked yet…", "Not checked yet. Record it and listen …", level names, Path titles
  "Triads" and "Chords in a Key" (use their translated path.title).
Copy a translation verbatim where the English is identical to one already translated in those packs
("This is a warm-up. It tells you how it went, and it decides nothing.").

New vocabulary, to translate the same way everywhere in the file:
- "strum" (noun and verb): one stroke of the pick across several strings. Use the word guitar
  teachers of your language use; "four strums a bar".
- "the change" / "to change chord": moving the fretting hand from one chord to the next.
- "Check every string": the chord held down and picked one string at a time.
- "a dead string" / "buzzes": a string that does not ring / rattles against the fret.
- "the pattern": a strumming pattern. "down, down-up, up-down-up" is said out loud by the player:
  translate "down" and "up" with the short words a teacher would say, keep the commas and hyphens.
- "the swing" of the strumming hand: its constant down-up movement, like a pendulum (not the jazz
  feel). "strokes left out" / "the hand misses the strings".
- "the small F": the four-string F chord with a two-string first-finger barre. "barre" as your
  language's guitarists say it.
- "bass note": the lowest string of the chord picked alone. "accent": a louder stroke. "a stop":
  silencing the strings.
- "verse", "chorus": song sections (as chords-in-a-key translates them).
- "three chords for a thousand songs" is a saying: translate the sense naturally.
Chord names: follow the triads pack's convention for chord names in prose; chord symbols in lists
such as "G, D, E minor, C" keep the same style throughout. Digits stay digits (frets, fingers
written as digits, BPM, "Bars 1 to 8", "4 strums"); spelled-out English numbers stay words.
Counting in quotes ('1, 2 and, (3) and, 4 and', '1 and TWO and 3 and FOUR and') keeps its digits,
brackets and capitals; use your language's counting syllable for "and" as rhythm-foundations does.
No exclamation marks. No first person.

Finish: verify with python that each output file has exactly the todo's keys for its path id, no
value contains "!" or "！", and none is empty; then reply with one line: the language, the number of
strings per path, and any key you were unsure about.
