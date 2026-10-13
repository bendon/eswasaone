import type { components } from "@contracts";
import { useMeResource } from "./useMeResource";

type HrSettings = components["schemas"]["HrSettings"];

/** HR rules and the company currency from GET /hr/settings; null until loaded (screens then leave them out). */
export function useHrSettings(enabled = true, refreshKey: string | number | null = ""): HrSettings | null {
  return useMeResource<HrSettings>("/hr/settings", { enabled, refreshKey, quiet: true }).data;
}
