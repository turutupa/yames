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
