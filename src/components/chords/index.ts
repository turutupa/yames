/**
 * The chord diagrams, as the rest of the app sees them.
 *
 * One import for the three pieces: a single grip, the chords of a key in a
 * row, and one chord's shapes along the neck. None of them holds a string —
 * every visible word arrives as a prop, already translated, so the components
 * can live under `components/` without a locale file of their own.
 */
export { ChordDiagram } from "./ChordDiagram";
export type { ChordDiagramProps } from "./ChordDiagram";
export { KeyChordsStrip } from "./KeyChordsStrip";
export type { KeyChordsStripProps } from "./KeyChordsStrip";
export { ChordShapesRow } from "./ChordShapesRow";
export type { ChordShapesRowProps } from "./ChordShapesRow";
