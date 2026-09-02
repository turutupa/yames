import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { deletePreset, listPresets, savePreset } from "../../ipc";
import type { AppState, Preset } from "../../types";

export interface PresetSidebarHandle {
  triggerAdd: () => void;
  triggerUpdate: () => void;
  triggerRename: (id: string) => void;
}

interface PresetSidebarProps {
  state: AppState;
  view: "beat" | "drill";
  isOpen: boolean;
  onToggle: () => void;
  onLoadPreset: (preset: Preset) => void;
  onActiveChange: (preset: Preset | null, dirty: boolean) => void;
  shortcut?: string;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function stateToPreset(
  name: string,
  state: AppState,
  view: "beat" | "drill",
): Preset {
  const preset: Preset = {
    id: generateId(),
    name,
    createdAt: Date.now(),
    bpm: state.bpm,
    subdivision: state.subdivision,
    timeSignature: state.timeSignature,
    beatGroups: state.beatGroups,
    freeMode: state.freeMode,
    soundType: state.soundType,
    volume: state.volume,
    view,
  };
  if (view === "drill" && state.speedRamp) {
    preset.speedRamp = {
      startBpm: state.speedRamp.startBpm,
      targetBpm: state.speedRamp.targetBpm,
      increment: state.speedRamp.increment,
      decrement: state.speedRamp.decrement,
      barsPerStep: state.speedRamp.barsPerStep,
      beatsPerBar: state.speedRamp.beatsPerBar,
      mode: state.speedRamp.mode,
      cyclic: state.speedRamp.cyclic,
      warmupBeats: state.speedRamp.warmupBeats,
    };
  }
  return preset;
}

function isDirty(state: AppState, preset: Preset, view: string): boolean {
  if (state.bpm !== preset.bpm) return true;
  if (state.subdivision !== preset.subdivision) return true;
  if (state.timeSignature !== preset.timeSignature) return true;
  if (JSON.stringify(state.beatGroups) !== JSON.stringify(preset.beatGroups ?? [preset.timeSignature])) return true;
  if (state.soundType !== preset.soundType) return true;
  if (Math.abs(state.volume - preset.volume) > 0.01) return true;
  if ((state.freeMode ?? false) !== (preset.freeMode ?? false)) return true;
  if (view === "drill" && preset.speedRamp && state.speedRamp) {
    const r = state.speedRamp;
    const p = preset.speedRamp;
    if (
      r.startBpm !== p.startBpm ||
      r.targetBpm !== p.targetBpm ||
      r.increment !== p.increment ||
      r.decrement !== p.decrement ||
      r.barsPerStep !== p.barsPerStep ||
      r.beatsPerBar !== p.beatsPerBar ||
      r.mode !== p.mode ||
      r.cyclic !== p.cyclic ||
      r.warmupBeats !== p.warmupBeats
    )
      return true;
  }
  return false;
}

const MAX_PRESETS = 20;

export const PresetSidebar = forwardRef<PresetSidebarHandle, PresetSidebarProps>(function PresetSidebar({
  state,
  view,
  isOpen,
  onToggle,
  onLoadPreset,
  onActiveChange,
  shortcut,
}, ref) {
  const [allPresets, setAllPresets] = useState<Preset[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const justLoadedId = useRef<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [search, setSearch] = useState("");
  const [contextMenu, setContextMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const contextRef = useRef<HTMLDivElement>(null);

  // Load presets on mount
  useEffect(() => {
    listPresets().then(setAllPresets);
  }, []);

  // Filter presets for the current view, then by search query
  const viewPresets = allPresets
    .filter((p) => p.view === view)
    .sort((a, b) => a.name.localeCompare(b.name));
  const presets = search.trim()
    ? viewPresets.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : viewPresets;

  // Clear search when sidebar closes
  useEffect(() => {
    if (!isOpen) setSearch("");
  }, [isOpen]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (
        contextRef.current &&
        !contextRef.current.contains(e.target as Node)
      ) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextMenu]);

  // Auto-focus inputs
  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);
  useEffect(() => {
    if (renaming) {
      renameRef.current?.focus();
      renameRef.current?.select();
    }
  }, [renaming]);

  const handleSave = useCallback(async () => {
    const name = newName.trim();
    if (!name) {
      setAdding(false);
      return;
    }
    const preset = stateToPreset(name, state, view);
    await savePreset(preset);
    setAllPresets((prev) => [...prev, preset]);
    setActiveId(preset.id);
    setNewName("");
    setAdding(false);
  }, [newName, state, view]);

  const handleLoad = useCallback(
    (preset: Preset) => {
      if (activeId === preset.id) {
        setActiveId(null);
        return;
      }
      justLoadedId.current = preset.id;
      setActiveId(preset.id);
      onLoadPreset(preset);
      onActiveChange(preset, false);
    },
    [activeId, onLoadPreset, onActiveChange],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deletePreset(id);
      setAllPresets((prev) => prev.filter((p) => p.id !== id));
      if (activeId === id) setActiveId(null);
      setContextMenu(null);
    },
    [activeId],
  );

  const handleUpdate = useCallback(
    async (id: string) => {
      const existing = allPresets.find((p) => p.id === id);
      if (!existing) return;
      const updated: Preset = {
        ...stateToPreset(existing.name, state, view),
        id: existing.id,
        createdAt: existing.createdAt,
      };
      await savePreset(updated);
      setAllPresets((prev) => prev.map((p) => (p.id === id ? updated : p)));
      setContextMenu(null);
    },
    [allPresets, state, view],
  );

  const handleRename = useCallback(
    async (id: string) => {
      const name = renameValue.trim();
      if (!name) {
        setRenaming(null);
        return;
      }
      const existing = allPresets.find((p) => p.id === id);
      if (!existing) return;
      const updated = { ...existing, name };
      await savePreset(updated);
      setAllPresets((prev) => prev.map((p) => (p.id === id ? updated : p)));
      setRenaming(null);
    },
    [renameValue, allPresets],
  );

  const activePreset = viewPresets.find((p) => p.id === activeId);
  const computedDirty = activePreset ? isDirty(state, activePreset, view) : false;
  // Suppress dirty flicker: after loading a preset, force clean until state settles
  if (!computedDirty && justLoadedId.current) justLoadedId.current = null;
  const dirty = justLoadedId.current === activeId ? false : computedDirty;

  // Notify parent of active preset + dirty state changes
  useEffect(() => {
    onActiveChange(activePreset ?? null, dirty);
  }, [activePreset?.id, dirty, onActiveChange]);

  // Expose imperative actions to parent
  useImperativeHandle(ref, () => ({
    triggerAdd: () => {
      setAdding(true);
    },
    triggerUpdate: () => {
      if (!activeId) return;
      const existing = allPresets.find((p) => p.id === activeId);
      if (!existing) return;
      const updated: Preset = {
        ...stateToPreset(existing.name, state, view),
        id: existing.id,
        createdAt: existing.createdAt,
      };
      savePreset(updated).then(() => {
        setAllPresets((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      });
    },
    triggerRename: (id: string) => {
      const preset = allPresets.find((p) => p.id === id);
      if (!preset) return;
      setRenameValue(preset.name);
      setRenaming(id);
    },
  }), [activeId, allPresets, state, view]);

  const toggleIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );

  return (
    <>
      {/* Sidebar panel */}
      <div
        className={`preset-sidebar ${isOpen ? "open" : ""}`}
        /* Tour (O6) anchor — works open or collapsed; see tour/stops.ts. */
        data-tour="presets"
        onMouseDown={(e) => {
          if (searchRef.current && e.target !== searchRef.current) {
            searchRef.current.blur();
          }
        }}
      >
        {/* Collapsed tab — clickable strip when sidebar is closed */}
        {!isOpen && (
          <button
            className="preset-sidebar-collapsed-tab"
            onClick={onToggle}
            title={shortcut ? t("presets.openWithShortcut", { shortcut }) : t("presets.open")}
          >
            {toggleIcon}
          </button>
        )}
        {isOpen && (
        <>
        <div className="preset-sidebar-header">
          <span className="preset-sidebar-title">{t("presets.title")}</span>
          <div className="preset-sidebar-header-actions">
            {viewPresets.length < MAX_PRESETS && (
              <button
                className="preset-sidebar-add"
                onClick={() => setAdding(true)}
                title={t("presets.saveCurrent")}
              >
                +
              </button>
            )}
            <button
              className="preset-sidebar-toggle-inner"
              onClick={onToggle}
              title={shortcut ? t("presets.closeWithShortcut", { shortcut }) : t("presets.close")}
            >
              {toggleIcon}
            </button>
          </div>
        </div>

        <div className="preset-search-wrap">
          <div className="preset-search-field">
            <svg className="preset-search-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchRef}
              className="preset-search-input"
              type="text"
              placeholder={t("presets.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setSearch("");
                e.stopPropagation();
              }}
            />
          </div>
        </div>

        <div className="preset-sidebar-list">
          {adding && (
            <div className="preset-sidebar-item adding">
              <input
                ref={inputRef}
                className="preset-sidebar-name-input"
                value={newName}
                placeholder={t("presets.namePlaceholder")}
                onChange={(e) => setNewName(e.target.value)}
                onBlur={handleSave}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") {
                    setAdding(false);
                    setNewName("");
                  }
                  e.stopPropagation();
                }}
                maxLength={20}
              />
            </div>
          )}
          {presets.map((p) => (
            <button
              key={p.id}
              className={`preset-sidebar-item ${activeId === p.id ? "active" : ""} ${activeId === p.id && dirty ? "dirty" : ""}`}
              onClick={() => handleLoad(p)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ id: p.id, x: e.clientX, y: e.clientY });
              }}
              title={`${p.bpm} BPM`}
            >
              {renaming === p.id ? (
                <input
                  ref={renameRef}
                  className="preset-sidebar-name-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => handleRename(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(p.id);
                    if (e.key === "Escape") setRenaming(null);
                    e.stopPropagation();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  maxLength={20}
                />
              ) : (
                <>
                  <span className="preset-item-name">{p.name}</span>
                  <span className="preset-item-bpm">{p.view === "drill" && p.speedRamp ? `${p.speedRamp.startBpm}–${p.speedRamp.targetBpm}` : p.bpm}</span>
                </>
              )}
            </button>
          ))}
          {presets.length === 0 && !adding && (
            search.trim() ? (
              <div className="preset-sidebar-empty">{t("presets.noResults")}</div>
            ) : (
              /* Empty state with exactly one action (ONBOARDING_PLAN §6). The
                 button does what the "+" in the header does — starting the
                 name input is the whole gesture, and a first-time user has no
                 reason to know the "+" means "save what you have now". */
              <div className="preset-sidebar-empty preset-sidebar-empty-state">
                <p className="empty-state-title">{t("emptyStates.presets.title")}</p>
                <p className="empty-state-hint">{t("emptyStates.presets.hint")}</p>
                <button
                  type="button"
                  className="empty-state-action"
                  onClick={() => setAdding(true)}
                >
                  {t("emptyStates.presets.action")}
                </button>
                {shortcut && (
                  <p className="empty-state-shortcut">
                    {t("emptyStates.presets.shortcut", { shortcut })}
                  </p>
                )}
              </div>
            )
          )}
        </div>
        </>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextRef}
          className="preset-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            onClick={() => {
              const p = allPresets.find((p) => p.id === contextMenu.id);
              if (p) {
                setRenameValue(p.name);
                setRenaming(contextMenu.id);
              }
              setContextMenu(null);
            }}
          >
            {t("presets.rename")}
          </button>
          <button onClick={() => handleUpdate(contextMenu.id)}>{t("presets.update")}</button>
          <button
            className="preset-context-delete"
            onClick={() => handleDelete(contextMenu.id)}
          >
            {t("presets.delete")}
          </button>
        </div>
      )}
    </>
  );
});
