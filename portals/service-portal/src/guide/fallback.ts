/** Offline / degraded-mode guides — same honey / ISO / water fixtures as the HTML mock. */

import honeyGuide from "../mocks/fixtures/guide-honey.json";
import isoGuide from "../mocks/fixtures/guide-iso9001.json";
import waterGuide from "../mocks/fixtures/guide-water.json";
import type { GuideResponse } from "./types";

export function pickMockGuide(goal: string): GuideResponse {
  const g = goal.toLowerCase();
  if (g.includes("iso") || g.includes("9001")) {
    return isoGuide as GuideResponse;
  }
  if (g.includes("water") || g.includes("bottled")) {
    return waterGuide as GuideResponse;
  }
  return honeyGuide as GuideResponse;
}
