import { NavLink, type To } from "react-router-dom";
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
 */
export function SubTabs({ tabs, active, onTab }: Props) {
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

        return (
          <NavLink
            key={String(tab.to)}
            to={tab.to}
            end={tab.to === "" || tab.to === "."}
            className={({ isActive }: { isActive: boolean }) => `subtab${isActive ? " on" : ""}`}
          >
            {label}
          </NavLink>
        );
      })}
    </nav>
  );
}