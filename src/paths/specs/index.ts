/** Every Path the pipeline builds. `npm run paths -- new <id>` adds a line here. */
import alternatePicking from "./alternate-picking";
import bluesPentatonics from "./blues-pentatonics";
import sweepPicking from "./sweep-picking";
import type { PathSpec } from "../spec";

export const SPECS: readonly PathSpec[] = [
  alternatePicking,
  sweepPicking,
  bluesPentatonics,
  // new paths go above this line
];
