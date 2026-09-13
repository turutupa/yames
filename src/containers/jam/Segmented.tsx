/**
 * A segmented control, in the stage's existing vocabulary.
 *
 * The same three-in-a-trough shape as the metronome's accent control, which is
 * what the setup board draws for feel and intensity too — so it is that
 * component's stylesheet rather than a second one that looks nearly like it.
 *
 * Its own file since the second pass: the playing screen and the setup sheet
 * both draw one, and a control shared by two screens that lives inside one of
 * them is a circular import waiting to happen.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  hint,
}: {
  label: string;
  options: { id: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (id: T) => void;
  /** A sentence on hover, for a control whose four words are not the whole story. */
  hint?: string;
}) {
  return (
    <div className="accent-control jam-segmented" role="group" aria-label={label} title={hint}>
      <span className="stage-label accent-label">{label}</span>
      <div className="accent-options">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`accent-option${value === option.id ? " active" : ""}`}
            aria-pressed={value === option.id}
            disabled={option.disabled}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
