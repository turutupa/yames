import { setBeatGroups } from "../../ipc";

const SUBDIVISION_MULTIPLIER: Record<number, number> = {
  1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6,
};

interface GroupEditorProps {
  beatGroups: number[];
  subdivision: number;
  isPlaying?: boolean;
  activeBeat?: number;
  activeSub?: number;
  isDownbeat?: boolean;
  freeMode?: boolean;
}

function computeAccentPositions(groups: number[]): Set<number> {
  const s = new Set<number>();
  let c = 0;
  for (const g of groups) { s.add(c); c += g; }
  return s;
}

export function GroupEditor({
  beatGroups,
  subdivision,
  isPlaying = false,
  activeBeat = -1,
  activeSub = -1,
  isDownbeat = false,
  freeMode = false,
}: GroupEditorProps) {
  const total = beatGroups.reduce((a, b) => a + b, 0);
  const formula = beatGroups.join(" + ");
  const clicksPerBar = total * (SUBDIVISION_MULTIPLIER[subdivision] ?? 1);
  const accentPositions = computeAccentPositions(beatGroups);

  if (freeMode) {
    return (
      <div className="group-editor">
        {/* N active dots — display only, no grid */}
        <div className="free-dots">
          {Array.from({ length: total }, (_, i) => {
            const isActive = isPlaying && isDownbeat && activeBeat === i;
            const isSubBeat = isPlaying && !isDownbeat && activeBeat === i;
            return (
              <div key={i} className="group-dot-wrap">
                <div className={`group-dot ${isActive ? "playing" : "free-active"}`} />
                {subdivision > 1 && (
                  <div className="group-sub-dots">
                    {Array.from({ length: subdivision - 1 }, (_, s) => (
                      <div key={s} className={`group-sub-dot ${isSubBeat && activeSub === s + 1 ? "active" : ""}`} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* Formula bar with inline beat count control */}
        <div className="group-formula">
          <button
            className="free-count-btn"
            onClick={() => { if (total > 1) setBeatGroups([total - 1]); }}
            disabled={total <= 1}
            aria-label="Remove beat"
          >‹</button>
          <span className="group-formula-total">{total} beats</span>
          <button
            className="free-count-btn"
            onClick={() => { if (total < 12) setBeatGroups([total + 1]); }}
            disabled={total >= 12}
            aria-label="Add beat"
          >›</button>
          <span className="group-formula-clicks">{total * (SUBDIVISION_MULTIPLIER[subdivision] ?? 1)} clicks/bar</span>
        </div>
      </div>
    );
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
            <div className="group-display">
              <div className="group-dots">
                {Array.from({ length: count }, (_, d) => {
                  const pos = startPos + d;
                  const isAccent = accentPositions.has(pos);
                  const isActive = isPlaying && isDownbeat && activeBeat === pos;
                  const isSubBeat = isPlaying && !isDownbeat && activeBeat === pos;
                  return (
                    <div key={d} className="group-dot-wrap">
                      <div className={`group-dot ${isAccent ? "accent" : ""} ${isActive ? "playing" : ""}`} />
                      {subdivision > 1 && (
                        <div className="group-sub-dots">
                          {Array.from({ length: subdivision - 1 }, (_, s) => (
                            <div
                              key={s}
                              className={`group-sub-dot ${isSubBeat && activeSub === s + 1 ? "active" : ""}`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <span className="group-label">{count} {count === 1 ? "beat" : "beats"}</span>
          </div>
        ))}
      </div>

      <div className="group-formula">
        <span className="group-formula-total">{total} beats</span>
        <span className="group-formula-expr">{formula}</span>
        <span className="group-formula-clicks">{clicksPerBar} clicks/bar</span>
      </div>
    </div>
  );
}
