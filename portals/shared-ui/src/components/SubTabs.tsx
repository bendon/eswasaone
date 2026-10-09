import { NavLink, useLocation, type To } from "react-router-dom";
import { Icon, type IconName } from "../icons/Icon";

export type SubTab = {
  /** Route-relative path. Use "" for index tab, "audits" for a sub-route. */
  to: To;
  label: string;
  icon?: IconName;
  badge?: number | string;
  /** Set true to use in-page state instead of routing (tab managed by parent). */
  manual?: boolean;
};

type Props = {
  tabs: SubTab[];
  /** Active value — only used when `manual` tabs are present. */
  active?: string;
  onTab?: (label: string) => void;
};

/**
 * Shared sub-navigation tab bar for Institution module pages.
 *
 * Two modes:
 * - **Routed** (default): each tab is a `<NavLink>` with `end` styling.
 *   Used when tabs map to nested routes (`/institution/certification/audits`).
 * - **Manual**: tabs call `onTab(label)` and the parent manages `active` state.
 *   Used when tabs filter the same data (e.g. Approvals: Approvals/Tasks/Alerts).
 *
 * **Active tab logic for routed tabs:** The index tab (`to: ""`) is active when
 * the current path is exactly the module root OR when no other tab's path is a
 * prefix of the current path. This ensures record routes like
 * `/certification/applications/APP-2026-00027` highlight the Pipeline tab
 * (the module index) even though they don't have their own tab entry.
 */
export function SubTabs({ tabs, active, onTab }: Props) {
  const loc = useLocation();
  // Strip trailing slash for comparison
  const currentPath = loc.pathname.replace(/\/$/, "");

  // For routed tabs, determine which tab should be active based on path matching.
  // Tab paths are relative (e.g. "team", "audits") — we compare them against
  // the tail of the current URL path so they work at any nesting depth.
  const routedTabs = tabs.filter((t) => !t.manual);
  let bestMatch: string | null = null;
  let bestLen = 0;
  for (const t of routedTabs) {
    const tabPath = String(t.to);
    if (tabPath === "" || tabPath === ".") continue; // skip index tab
    // Normalise: strip leading slash, split into segments
    const tabSegs = tabPath.replace(/^\//, "").split("/").filter(Boolean);
    // Compare against the tail of the current path
    const pathSegs = currentPath.split("/").filter(Boolean);
    const tail = pathSegs.slice(-tabSegs.length).join("/");
    if (tail === tabSegs.join("/")) {
      if (tabSegs.length > bestLen) {
        bestLen = tabSegs.length;
        bestMatch = tabPath;
      }
    }
  }

  return (
    <nav className="subtabs" aria-label="Module sections">
      {tabs.map((tab) => {
        const label = (
          <>
            {tab.icon ? <Icon name={tab.icon} /> : null}
            {tab.label}
            {tab.badge != null ? <span className="subtab__badge">{tab.badge}</span> : null}
          </>
        );

        if (tab.manual) {
          const isActive = active === tab.label;
          return (
            <button
              key={tab.label}
              type="button"
              className={`subtab${isActive ? " on" : ""}`}
              onClick={() => onTab?.(tab.label)}
            >
              {label}
            </button>
          );
        }

        const tabPath = String(tab.to);
        const isIndex = tabPath === "" || tabPath === ".";
        // Index tab is active when no other tab matched (fallback for record routes)
        const isOn = isIndex ? bestMatch === null : bestMatch === tabPath;

        return (
          <NavLink
            key={String(tab.to)}
            to={tab.to}
            end={isIndex}
            className={() => `subtab${isOn ? " on" : ""}`}
          >
            {label}
          </NavLink>
        );
      })}
    </nav>
  );
}