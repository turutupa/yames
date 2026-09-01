import { setBeatGroups, notifySettingsChange } from "../../ipc";

const SUBDIVISION_MULTIPLIER: Record<number, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
};

interface GroupEditorProps {
  beatGroups: number[];
  subdivision: number;
}

function computeAccentPositions(groups: number[]): Set<number> {
  const s = new Set<number>();
  let c = 0;
  for (const g of groups) {
    s.add(c);
    c += g;
  }
  return s;
}

export function GroupEditor({ beatGroups, subdivision }: GroupEditorProps) {
  const total = beatGroups.reduce((a, b) => a + b, 0);
  const formula = beatGroups.join(" + ");
  const clicksPerBar = total * (SUBDIVISION_MULTIPLIER[subdivision] ?? 1);
  const accentPositions = computeAccentPositions(beatGroups);

  async function updateGroups(newGroups: number[]) {
    await setBeatGroups(newGroups);
    await notifySettingsChange();
  }

  function handleDecrement(idx: number) {
    const current = beatGroups[idx];
    if (current <= 1) {
      // Remove this group
      const next = beatGroups.filter((_, i) => i !== idx);
      if (next.length === 0) return; // always keep at least 1 group
      updateGroups(next);
    } else {
      const next = beatGroups.map((g, i) => (i === idx ? g - 1 : g));
      updateGroups(next);
    }
  }

  function handleIncrement(idx: number) {
    const newTotal = total + 1;
    if (beatGroups[idx] >= 8 || newTotal > 16) return;
    const next = beatGroups.map((g, i) => (i === idx ? g + 1 : g));
    updateGroups(next);
  }

  function handleAddGroup() {
    if (beatGroups.length >= 6 || total + 2 > 16) return;
    updateGroups([...beatGroups, 2]);
  }

  let dotCursor = 0;
  const groups = beatGroups.map((count, idx) => {
    const startPos = dotCursor;
    dotCursor += count;
    return { count, startPos, idx };
  });

  return (
    <div className="group-editor">
      <div className="group-editor-boxes">
        {groups.map(({ count, startPos, idx }) => (
          <div key={idx} className="group-box">
            <div className="group-box-controls">
              <button
                className="group-btn"
                onClick={() => handleDecrement(idx)}
                aria-label={count <= 1 ? "Remove group" : "Decrease beats"}
              >
                −
              </button>
              <div className="group-dots">
                {Array.from({ length: count }, (_, d) => {
                  const pos = startPos + d;
                  const isAccent = accentPositions.has(pos);
                  return (
                    <div
                      key={d}
                      className={`group-dot ${isAccent ? "accent" : ""}`}
                    />
                  );
                })}
              </div>
              <button
                className="group-btn"
                onClick={() => handleIncrement(idx)}
                disabled={count >= 8 || total >= 16}
                aria-label="Increase beats"
              >
                +
              </button>
            </div>
            <span className="group-label">{count} {count === 1 ? "beat" : "beats"}</span>
          </div>
        ))}

        <button
          className="group-add-btn"
          onClick={handleAddGroup}
          disabled={beatGroups.length >= 6 || total + 2 > 16}
          aria-label="Add group"
        >
          + group
        </button>
      </div>

      <div className="group-formula">
        <span className="group-formula-total">{total} beats</span>
        <span className="group-formula-sep">·</span>
        <span className="group-formula-expr">{formula}</span>
        <span className="group-formula-sep">·</span>
        <span className="group-formula-clicks">{clicksPerBar} clicks/bar</span>
      </div>
    </div>
  );
}
