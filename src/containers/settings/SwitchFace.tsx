/**
 * What an on/off button in Settings looks like: a switch.
 *
 * Only the face. The button around it is the same element it always was, with
 * the same `toggle-btn` / `active` classes and the same handler, so every test
 * and every caller that presses it is unchanged. The word ("On" / "Off") stays
 * inside it as the button's name for a screen reader, and is hidden from the
 * eye because the switch already says it. The button carries `setting-switch`
 * so the stylesheet can tell it from an action button or a segmented option,
 * which share `toggle-btn` and used to share its shape too.
 */
export function SwitchFace({ label }: { label: string }) {
  return (
    <>
      <span className="setting-switch-track" aria-hidden="true">
        <span className="setting-switch-thumb" />
      </span>
      <span className="setting-switch-text">{label}</span>
    </>
  );
}
