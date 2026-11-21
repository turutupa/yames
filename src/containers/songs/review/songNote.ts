/**
 * The Songs verdict's fact line (c5a2, DESIGN 3.1: "the existing verdict, in
 * the same note").
 *
 * The note is the Session's (`CoachNote`), and its fact line is the Session's
 * (`FactLine`) with the Session's own words (`session.note.fact.*`). What goes
 * on it is only what the pass measured and the review's head does not already
 * say: the head's summary counts the notes that landed, so they are not
 * counted again here.
 *
 * - **Extra notes**: always measured. No pass mark on a song, so the mark is a
 *   check for none and no mark at all for some: a song has no "not met".
 * - **Right notes**: only when the ear listened back (`pitch`), of the notes it
 *   could pitch. With none it could pitch the item is left out: none of the
 *   Session's "couldn't tell" reasons is known here, and a wrong reason is
 *   worse than none. Nothing on this line blocks anything.
 */
import type { FactItem } from "../../../coach/takeNote";
import type { NoteVerdict } from "../../../songs/types";

export function songFacts(facts: { extraCount: number }, pitch?: readonly NoteVerdict[]): FactItem[] {
  const items: FactItem[] = [
    facts.extraCount === 0
      ? { kind: "extras", mark: "check", line: { key: "session.note.fact.noExtras", values: {} } }
      : { kind: "extras", mark: "none", line: { key: "session.note.fact.extras", values: { count: facts.extraCount } } },
  ];
  if (pitch && pitch.length > 0) {
    let right = 0;
    let base = 0;
    for (const v of pitch) {
      if (v.state === "right") right += 1;
      if (v.state === "right" || v.state === "wrong" || v.state === "octave") base += 1;
    }
    if (base > 0) {
      items.push({
        kind: "rightNotes",
        mark: "none",
        line: { key: "session.note.fact.rightNotes", values: { value: Math.round((right / base) * 100), base } },
      });
    }
  }
  return items;
}
