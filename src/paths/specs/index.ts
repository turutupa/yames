/** Every Path the pipeline builds. `npm run paths -- new <id>` adds a line here. */
import alternatePicking from "./alternate-picking";
import bluesPentatonics from "./blues-pentatonics";
import classicRock from "./classic-rock";
import shred from "./shred";
import sweepPicking from "./sweep-picking";
import legato from "./legato";
import rhythmFoundations from "./rhythm-foundations";
import metalRhythm from "./metal-rhythm";
import type { PathSpec } from "../spec";

export const SPECS: readonly PathSpec[] = [
  alternatePicking,
  sweepPicking,
  bluesPentatonics,
  classicRock,
  shred,
  legato,
  rhythmFoundations,
  metalRhythm,
  // new paths go above this line
];
