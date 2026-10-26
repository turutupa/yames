import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useMenuPlacement } from "../jam/useMenuPlacement";
import { GrooveGlyph } from "../jam/GrooveGlyph";
import {
  PATTERN_PRESETS,
  PATTERN_PRESET_CATEGORIES,
  type PatternPreset,
  type PatternPresetCategory,
} from "./patternPresets";

interface PatternPresetPickerProps {
  activePresetId: string;
  onSelectPreset: (preset: PatternPreset) => void;
}

const CATEGORY_LABELS: Record<PatternPresetCategory, string> = {
  practice: "Practice & Clave",
  rock: "Rock",
  blues: "Blues",
  funk: "Funk",
  jazz: "Jazz",
  latin: "Latin",
  pop: "Pop",
  metal: "Metal",
  country: "Country",
  world: "World",
};

export function PatternPresetPicker({
  activePresetId,
  onSelectPreset,
}: PatternPresetPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<"all" | PatternPresetCategory>("all");
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { wrapRef, menuRef, style } = useMenuPlacement(open, {
    tallest: 400,
    maxWidth: 380,
  });

  const getPresetLabel = (p: PatternPreset): string => {
    if (p.nameKey) {
      const translated = t(p.nameKey);
      if (translated && translated !== p.nameKey) return translated;
    }
    return p.name;
  };

  const getCategoryLabel = (cat: PatternPresetCategory): string => {
    if (cat === "practice") return CATEGORY_LABELS.practice;
    const translated = t(`jam.family.${cat}`);
    return translated && translated !== `jam.family.${cat}`
      ? translated
      : CATEGORY_LABELS[cat];
  };

  const activePreset = useMemo(
    () => PATTERN_PRESETS.find((p) => p.id === activePresetId),
    [activePresetId]
  );

  const currentLabel = activePreset
    ? getPresetLabel(activePreset)
    : activePresetId === "default"
      ? "Default"
      : "Custom Pattern";

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    searchInputRef.current?.focus({ preventScroll: true });
    const activeItem = menuRef.current?.querySelector<HTMLElement>(
      ".jam-dropdown-item.active"
    );
    if (activeItem && typeof activeItem.scrollIntoView === "function") {
      activeItem.scrollIntoView({ block: "nearest" });
    }
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, wrapRef, menuRef]);

  const filteredPresets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PATTERN_PRESETS.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (!q) return true;
      const label = getPresetLabel(p).toLowerCase();
      return (
        label.includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    });
  }, [category, query, t]);

  return (
    <div className="jam-select pattern-preset-select" ref={wrapRef}>
      <button
        type="button"
        className={`jam-dropdown pattern-preset-trigger${open ? " open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="jam-dropdown-label">Preset</span>
        <span className="jam-dropdown-value">{currentLabel}</span>
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div
            className="jam-dropdown-menu pattern-preset-menu"
            ref={menuRef}
            style={style}
            role="listbox"
            aria-label="Pattern Presets"
          >
            <div className="pattern-preset-menu-header">
              <input
                ref={searchInputRef}
                type="text"
                className="pattern-preset-search"
                placeholder="Search patterns & jam grooves…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filteredPresets.length > 0) {
                    e.preventDefault();
                    onSelectPreset(filteredPresets[0]);
                    setOpen(false);
                  }
                }}
              />
              <div className="pattern-preset-cat-row">
                <button
                  type="button"
                  className={`pattern-cat-chip${category === "all" ? " active" : ""}`}
                  onClick={() => setCategory("all")}
                >
                  All ({PATTERN_PRESETS.length})
                </button>
                {PATTERN_PRESET_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`pattern-cat-chip${category === cat ? " active" : ""}`}
                    onClick={() => setCategory(cat)}
                  >
                    {getCategoryLabel(cat)}
                  </button>
                ))}
              </div>
            </div>

            <div className="pattern-preset-menu-list">
              {filteredPresets.length === 0 ? (
                <div className="pattern-preset-empty">No matching patterns</div>
              ) : (
                filteredPresets.map((option, idx) => {
                  const prevCat = idx > 0 ? filteredPresets[idx - 1].category : null;
                  const showHeader = category === "all" && option.category !== prevCat;
                  const label = getPresetLabel(option);
                  const isSelected = option.id === activePresetId;

                  return (
                    <div key={option.id}>
                      {showHeader && (
                        <div className="jam-dropdown-section">
                          {getCategoryLabel(option.category)}
                        </div>
                      )}
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        className={`jam-dropdown-item pattern-preset-option${isSelected ? " active" : ""}`}
                        onClick={() => {
                          onSelectPreset(option);
                          setOpen(false);
                        }}
                      >
                        <span className="jam-dropdown-item-text">
                          <span className="jam-dropdown-item-name">{label}</span>
                          <span className="jam-dropdown-item-hint">
                            {option.description}
                          </span>
                        </span>
                        {option.groove && (
                          <span className="pattern-preset-glyph">
                            <GrooveGlyph groove={option.groove} />
                          </span>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
