# Translating Blues Pentatonics' cues

Input: `/tmp/coach-cues2/i18n-blues-pentatonics/todo.json` (`{ "blues-pentatonics": { key: English } }`, 317 keys,
each distinct English cue once) and `/tmp/coach-cues2/i18n-blues-pentatonics/context.txt` (for each key: the
Exercise it belongs to and the trigger it answers, so you know what it is for).

Read first: `/home/dgx-delgado/yames-coach-cues2/plans/paths/I18N_BRIEF.md` and
`/home/dgx-delgado/yames-coach-cues2/plans/COACH_I18N_BRIEF.md` (in parts if long). For each of your languages,
take the Path's terms from its existing overlay `/home/dgx-delgado/yames-coach-cues2/src/paths/packs/i18n/<lng>/blues-pentatonics.json`
(grep it, do not read it whole: how it says box, bend, slide, hammer-on, shuffle, riff, lick, turnaround, chorus,
call and answer, guide tone, sixth, open string, the string names "B string", "top string", "low E string", fret,
the chord names, "long-short"). Use the same words.

What a cue is: one order the guitarist reads in the second before a Take starts, with the guitar in their hands.
- Imperative, short, natural for a guitar teacher in that language (the informal "you" where the overlay uses it).
- **At most 48 characters, counted in characters** (not bytes). If a literal translation is longer, say less.
- Keep every digit and every quoted count as it is ('1', '3', '1, 2, 3, 4'): you may change the quote marks
  to your language's, never the numbers. Note names (A, C#, B flat, G#, Eb), chord names (A7, Dm7) and fret
  numbers written as words keep their meaning; fret numbers may be written as digits if the English has words
  (keep the number the same). In languages that use Do-Re-Mi note names, follow what the overlay does.
- No "!", no question, no praise, no grade.
- Return valid JSON with exactly the same keys.

Output: one file per language, `/tmp/coach-cues2/i18n-blues-pentatonics/done.<lng>.json`, shaped
`{ "blues-pentatonics": { key: translation } }`. Write it with the Write tool (if a file is long, write it in
one go; JSON must parse).

Self-check each file when written:
`python3 -I /tmp/coach-cues2/check_i18n.py /tmp/coach-cues2/i18n-blues-pentatonics blues-pentatonics <lng>`
It must print `problems 0`. Fix every LONG, BANG, DIGIT, QUOTED, EMPTY or missing key with the Edit tool and
run it again.
