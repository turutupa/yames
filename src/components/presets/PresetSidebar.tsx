import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { deletePreset, listPresets, savePreset } from "../../ipc";
import { meterLabel, presetBeatGroups, presetFreeMode } from "../../utils/meter";
import { formBars } from "../../jam/forms";
import type { AppState, Setlist, Preset } from "../../types";
import type { Jam } from "../../jam/types";

export interface PresetSidebarHandle {
  triggerAdd: () => void;
  triggerUpdate: () => void;
  triggerRename: (id: string) => void;
  triggerRenameSetlist: (id: string) => void;
  triggerRenameJam: (id: string) => void;
  /** Drop the loaded marker — a setlist has taken the context bar. */
  clearActive: () => void;
}

interface PresetSidebarProps {
  state: AppState;
  view: "beat" | "drill" | "setlist" | "jam";
  isOpen: boolean;
  onLoadPreset: (preset: Preset) => void;
  onActiveChange: (preset: Preset | null, dirty: boolean) => void;
  shortcut?: string;
  /**
   * Setlists share this list with presets (U9.4) — the word is precise here
   * and nowhere else. They are the parent's state, not this component's:
   * the stage edits the loaded setlist continuously, and a second copy kept
   * here would be stale between every keystroke.
   */
  setlists?: Setlist[];
  activeSetlistId?: string | null;
  onLoadSetlist?: (setlist: Setlist) => void;
  onNewSetlist?: () => void;
  onDeleteSetlist?: (id: string) => void;
  onRenameSetlist?: (id: string, name: string) => void;
  /**
   * Jams, on the jam tab. Same deal as setlists: the stage edits the loaded
   * one continuously, so the list is the parent's state and this component
   * only draws it. Ordering is the library's, which is why there is a
   * reorder callback here and none for presets — presets sort by name.
   */
  jams?: Jam[];
  activeJamId?: string | null;
  onLoadJam?: (jam: Jam) => void;
  onNewJam?: () => void;
  onDeleteJam?: (id: string) => void;
  onRenameJam?: (id: string, name: string) => void;
  onDuplicateJam?: (id: string) => void;
  onReorderJams?: (from: number, to: number) => void;
}

/** What a jam row says on its right: the tempo and the shape. */
function jamSummary(
  jam: Jam,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const form =
    jam.form.kind === "custom"
      ? t("jam.short.custom", { count: formBars(jam.form) })
      : t(`jam.short.${jam.form.kind}`);
  return t("jam.summary", { bpm: jam.bpm, form });
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

/**
 * The line at the right of a row: what the preset restores, in as few
 * characters as the column has room for.
 *
 * A drill is its tempo range — the two numbers that say how far it climbs.
 * Everything else is tempo and meter, because tempo alone does not
 * distinguish two presets a player keeps at the same speed in 4/4 and 6/8,
 * which is exactly the pair worth telling apart at a glance. FREE mode has
 * no signature to print, so it says so.
 */
function presetSummary(preset: Preset, t: (key: string) => string): string {
  if (preset.view === "drill" && preset.speedRamp) {
    return `${preset.speedRamp.startBpm}–${preset.speedRamp.targetBpm}`;
  }
  const meter = presetFreeMode(preset)
    ? t("metronome.free")
    : meterLabel(presetBeatGroups(preset));
  return `${preset.bpm} · ${meter}`;
}

export const PresetSidebar = forwardRef<PresetSidebarHandle, PresetSidebarProps>(function PresetSidebar({
  state,
  view,
  isOpen,
  onLoadPreset,
  onActiveChange,
  shortcut,
  setlists,
  activeSetlistId,
  onLoadSetlist,
  onNewSetlist,
  onDeleteSetlist,
  onRenameSetlist,
  jams,
  activeJamId,
  onLoadJam,
  onNewJam,
  onDeleteJam,
  onRenameJam,
  onDuplicateJam,
  onReorderJams,
}, ref) {
  const [allPresets, setAllPresets] = useState<Preset[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const justLoadedId = useRef<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [search, setSearch] = useState("");
  // The field is asked for rather than permanent (design: a magnifier beside
  // the "+"). A list of five presets does not need a row of chrome spent on
  // finding one.
  const [searchOpen, setSearchOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  // Setlists rename through the same field but never at the same time as a
  // preset, so the two ids are kept apart rather than sharing one slot that
  // would have to say which list it meant.
  const [renamingSetlist, setRenamingSetlist] = useState<string | null>(null);
  const [setlistMenu, setSetlistMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renamingJam, setRenamingJam] = useState<string | null>(null);
  const [jamMenu, setJamMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  /**
   * The jam being dragged, and the row it is currently over.
   *
   * A jam library is an ORDER — the one you warm up on first, the one you end
   * on — so unlike presets it is not sorted for you, and the only way to
   * express that order is to move the rows. The id rather than the index: the
   * list can be filtered by the search field while a drag is in flight.
   */
  const [dragJamId, setDragJamId] = useState<string | null>(null);
  const [dragOverJamId, setDragOverJamId] = useState<string | null>(null);
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
  /**
   * Which play tab a NEW preset would belong to.
   *
   * A preset is a metronome or a drill configuration; there is no such thing
   * as a setlist preset. On the setlist tab the affordances that would call
   * this are not rendered at all, so the fallback is unreachable — it exists
   * so the type says what is true rather than being asserted away.
   */
  const presetView: "beat" | "drill" = view === "beat" || view === "drill" ? view : "beat";

  const viewPresets = allPresets
    .filter((p) => p.view === view)
    .sort((a, b) => a.name.localeCompare(b.name));
  const presets = search.trim()
    ? viewPresets.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : viewPresets;

  // Clear search when sidebar closes
  useEffect(() => {
    if (!isOpen) {
      setSearch("");
      setSearchOpen(false);
    }
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
  // Opening the field and then having to click into it would make the icon
  // worse than the permanent row it replaces.
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);
  useEffect(() => {
    if (renaming || renamingSetlist || renamingJam) {
      renameRef.current?.focus();
      renameRef.current?.select();
    }
  }, [renaming, renamingSetlist, renamingJam]);

  // Close the setlist context menu on an outside click, same rule as the
  // preset one above.
  useEffect(() => {
    if (!setlistMenu) return;
    const handler = (e: MouseEvent) => {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) {
        setSetlistMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [setlistMenu]);

  useEffect(() => {
    if (!jamMenu) return;
    const handler = (e: MouseEvent) => {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) {
        setJamMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [jamMenu]);

  const handleSave = useCallback(async () => {
    const name = newName.trim();
    if (!name) {
      setAdding(false);
      return;
    }
    const preset = stateToPreset(name, state, presetView);
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
        ...stateToPreset(existing.name, state, presetView),
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
        ...stateToPreset(existing.name, state, presetView),
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
    clearActive: () => setActiveId(null),
    triggerRenameSetlist: (id: string) => {
      const setlist = setlists?.find((c) => c.id === id);
      if (!setlist) return;
      setRenameValue(setlist.name);
      setRenamingSetlist(id);
    },
    triggerRenameJam: (id: string) => {
      const jam = jams?.find((j) => j.id === id);
      if (!jam) return;
      setRenameValue(jam.name);
      setRenamingJam(id);
    },
  }), [activeId, allPresets, setlists, jams, state, view]);

  // The rail's setlist glyph at row size — lines with a play head, a list that
  // runs in order. Rail.tsx has the note on why it is no longer a chain.
  const setlistIcon = (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6.5h11" />
      <path d="M4 12h7" />
      <path d="M4 17.5h7" />
      <path d="m14 10.75 7 4-7 4z" />
    </svg>
  );

  // The setlist tab's library IS the setlists, and no other tab's carries
  // them. This is what a mode buys that a section heading could not: each
  // list holds one kind of thing, so nothing has to be labelled to be told
  // apart, and the panel's title is true on every tab.
  // The band's lanes at row size — the rail's jam glyph, same four bars.
  const jamIcon = (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 9v6" />
      <path d="M10 5v14" />
      <path d="M15 8v8" />
      <path d="M20 11v2" />
    </svg>
  );

  const showSetlists = view === "setlist" && !!setlists;
  const setlistList = showSetlists
    ? (search.trim()
        ? setlists!.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
        : setlists!)
    : [];
  const showJams = view === "jam" && !!jams;
  const jamList = showJams
    ? (search.trim()
        ? jams!.filter((j) => j.name.toLowerCase().includes(search.toLowerCase()))
        : jams!)
    : [];

  /**
   * Finish a drag: move the dragged jam to where it was dropped.
   *
   * The indices are looked up in the FULL list rather than the filtered one —
   * dropping row two of a search result onto row four must move the jam to the
   * fourth jam's place in the library, not to the fourth row of a view that
   * will not exist a keystroke later.
   */
  const dropJam = (targetId: string) => {
    const from = jams?.findIndex((j) => j.id === dragJamId) ?? -1;
    const to = jams?.findIndex((j) => j.id === targetId) ?? -1;
    setDragJamId(null);
    setDragOverJamId(null);
    if (from === -1 || to === -1 || from === to) return;
    onReorderJams?.(from, to);
  };

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
        {isOpen && (
        <>
        <div className="preset-sidebar-header">
          {/* The library is contextual: the same panel lists presets on the
              metronome and drills on the drill screen, and it already filters
              by `view`. Titling both PRESETS said one of them wrongly. */}
          <span className="preset-sidebar-title">
            {t(
              view === "drill"
                ? "presets.titleDrill"
                : view === "setlist"
                  ? "presets.titleSetlist"
                  : view === "jam"
                    ? "presets.titleJam"
                    : "presets.title",
            )}
          </span>
          <div className="preset-sidebar-header-actions">
            <button
              className={`preset-sidebar-head-btn preset-sidebar-search-btn${searchOpen ? " active" : ""}`}
              onClick={() => {
                // Closing takes the filter with it — a list still narrowed by
                // a query you can no longer see is a list that looks broken.
                if (searchOpen) setSearch("");
                setSearchOpen((o) => !o);
              }}
              aria-label={t("presets.search")}
              aria-expanded={searchOpen}
              data-tip={t("presets.search")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="6.5" />
                <line x1="16" y1="16" x2="21" y2="21" />
              </svg>
            </button>
            {/* A setlist needs its own opener. The "+" beside it means "save
                what I have now as a preset" and is the first thing a new user
                presses; overloading it with a menu would put a choice in
                front of the gesture that has never needed one. */}
            {showSetlists && onNewSetlist && (
              <button
                className="preset-sidebar-head-btn preset-sidebar-new-setlist"
                onClick={onNewSetlist}
                aria-label={t("setlist.newSetlist")}
                data-tip={t("setlist.newSetlist")}
              >
                {setlistIcon}
              </button>
            )}
            {/* The jam tab's opener. It copies the loaded jam rather than
                starting from nothing — "another one like this" is what a
                player actually wants at the moment they press it. */}
            {showJams && onNewJam && (
              <button
                className="preset-sidebar-head-btn preset-sidebar-new-jam"
                onClick={onNewJam}
                aria-label={t("jam.newJam")}
                data-tip={t("jam.newJam")}
              >
                {jamIcon}
              </button>
            )}
            {!showSetlists && !showJams && viewPresets.length < MAX_PRESETS && (
              <button
                className="preset-sidebar-head-btn preset-sidebar-add"
                onClick={() => setAdding(true)}
                aria-label={t("presets.saveCurrent")}
                data-tip={t("presets.saveCurrent")}
              >
                {/* The same floppy the context bar's "Save preset" carries.
                    It was a "+", which reads as "add an empty one" — the two
                    buttons do the same thing and now say so. */}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {searchOpen && (
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
                // Escape empties a query you can see; a second Escape puts the
                // field away. Closing on the first press would hide the reason
                // the list is short before you had a chance to read it.
                if (e.key === "Escape") {
                  if (search) setSearch("");
                  else setSearchOpen(false);
                }
                e.stopPropagation();
              }}
            />
          </div>
        </div>
        )}

        <div className="preset-sidebar-list">
          {/* Setlists sit above the presets and above the rule that separates
              them: they are the bigger thing, and a list that opened with
              four presets would bury them. */}
          {setlistList.map((c) => (
            <div
              key={c.id}
              className={`preset-sidebar-item setlist-item ${activeSetlistId === c.id ? "active" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => onLoadSetlist?.(c)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onLoadSetlist?.(c);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setSetlistMenu({ id: c.id, x: e.clientX, y: e.clientY });
              }}
            >
              {renamingSetlist === c.id ? (
                <input
                  ref={renameRef}
                  className="preset-sidebar-name-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => {
                    const name = renameValue.trim();
                    if (name) onRenameSetlist?.(c.id, name);
                    setRenamingSetlist(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const name = renameValue.trim();
                      if (name) onRenameSetlist?.(c.id, name);
                      setRenamingSetlist(null);
                    }
                    if (e.key === "Escape") setRenamingSetlist(null);
                    e.stopPropagation();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  maxLength={20}
                />
              ) : (
                <>
                  <span className="setlist-item-row">
                    <span className="setlist-item-glyph">{setlistIcon}</span>
                    <span className="preset-item-name">{c.name}</span>
                  </span>
                  <span className="setlist-item-sub">
                    {t("setlist.librarySteps", { count: c.steps.length })}
                  </span>
                </>
              )}
            </div>
          ))}
          {jamList.map((j) => (
            <div
              key={j.id}
              className={`preset-sidebar-item jam-item ${activeJamId === j.id ? "active" : ""}`}
              role="button"
              tabIndex={0}
              draggable={!renamingJam}
              data-dragging={dragJamId === j.id ? "" : undefined}
              data-drag-over={dragOverJamId === j.id && dragJamId !== j.id ? "" : undefined}
              title={t("jam.reorderHint")}
              onClick={() => onLoadJam?.(j)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onLoadJam?.(j);
                }
              }}
              onDragStart={(e) => {
                setDragJamId(j.id);
                e.dataTransfer.effectAllowed = "move";
                // Firefox refuses to start a drag without data on it.
                e.dataTransfer.setData("text/plain", j.id);
              }}
              onDragEnter={() => setDragOverJamId(j.id)}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                dropJam(j.id);
              }}
              onDragEnd={() => {
                setDragJamId(null);
                setDragOverJamId(null);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setJamMenu({ id: j.id, x: e.clientX, y: e.clientY });
              }}
            >
              {renamingJam === j.id ? (
                <input
                  ref={renameRef}
                  className="preset-sidebar-name-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => {
                    const name = renameValue.trim();
                    if (name) onRenameJam?.(j.id, name);
                    setRenamingJam(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const name = renameValue.trim();
                      if (name) onRenameJam?.(j.id, name);
                      setRenamingJam(null);
                    }
                    if (e.key === "Escape") setRenamingJam(null);
                    e.stopPropagation();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  maxLength={24}
                />
              ) : (
                <>
                  <span className="setlist-item-row">
                    <span className="setlist-item-glyph">{jamIcon}</span>
                    <span className="preset-item-name">{j.name}</span>
                  </span>
                  <span className="setlist-item-sub">{jamSummary(j, t)}</span>
                </>
              )}
            </div>
          ))}
          {showJams && jamList.length === 0 && search.trim() && (
            <div className="preset-sidebar-empty">{t("presets.noResults")}</div>
          )}

          {/* The rule separates setlists from presets; on the setlist tab
              there are no presets under it to separate. */}
          {setlistList.length > 0 && !showSetlists && (
            <div className="setlist-item-rule" aria-hidden="true" />
          )}

          {!showSetlists && !showJams && adding && (
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
          {!showSetlists && !showJams && presets.map((p) => (
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
                  {/* The dot is the loaded marker. `.active` already tints the
                      row, but tint is what hover does too, and a preset you
                      loaded and then edited has to stay identifiable. Every
                      row carries the dot so the names line up; only the
                      loaded one is painted. */}
                  <span className="preset-item-dot" aria-hidden="true" />
                  <span className="preset-item-name">{p.name}</span>
                  <span className="preset-item-bpm">{presetSummary(p, t)}</span>
                </>
              )}
            </button>
          ))}
          {!showSetlists && !showJams && presets.length === 0 && !adding && (
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

      {jamMenu && (
        <div
          ref={contextRef}
          className="preset-context-menu"
          style={{ top: jamMenu.y, left: jamMenu.x }}
        >
          <button
            onClick={() => {
              const j = jams?.find((j) => j.id === jamMenu.id);
              if (j) {
                setRenameValue(j.name);
                setRenamingJam(jamMenu.id);
              }
              setJamMenu(null);
            }}
          >
            {t("presets.rename")}
          </button>
          <button
            onClick={() => {
              onDuplicateJam?.(jamMenu.id);
              setJamMenu(null);
            }}
          >
            {t("jam.duplicateJam")}
          </button>
          <button
            className="preset-context-delete"
            onClick={() => {
              onDeleteJam?.(jamMenu.id);
              setJamMenu(null);
            }}
          >
            {t("jam.deleteJam")}
          </button>
        </div>
      )}

      {setlistMenu && (
        <div
          ref={contextRef}
          className="preset-context-menu"
          style={{ top: setlistMenu.y, left: setlistMenu.x }}
        >
          <button
            onClick={() => {
              const c = setlists?.find((c) => c.id === setlistMenu.id);
              if (c) {
                setRenameValue(c.name);
                setRenamingSetlist(setlistMenu.id);
              }
              setSetlistMenu(null);
            }}
          >
            {t("presets.rename")}
          </button>
          <button
            className="preset-context-delete"
            onClick={() => {
              onDeleteSetlist?.(setlistMenu.id);
              setSetlistMenu(null);
            }}
          >
            {t("setlist.deleteSetlist")}
          </button>
        </div>
      )}
    </>
  );
});
