import { useMemo } from "react";
import type { SubTab } from "@eswasaone/shared-ui";
import {
  caseSla,
  crmDemoMode,
  isAppealsPanel,
  isCommercialOnly,
  isOpen,
  listCases,
  listSignals,
  publicCrmConfig,
  useCrm,
} from "@eswasaone/shared-ui/crm";
import { useActor } from "../crm/shared";
import { ModulePageShell } from "./ModulePageShell";

/**
 * CRM & Commercial — client relationship, service desk and signal-driven commercial pipeline.
 * Overview · Cases · Appeals (panel only) · Clients · Signals · Opportunities · Quotes · Renewals · Insights · Settings
 */
export function CrmPage() {
  const actor = useActor();
  const demo = crmDemoMode();
  const cases = useCrm(() => (demo ? listCases({ includeAppeals: true }) : Promise.resolve([])), [demo]);
  const signals = useCrm(() => (demo ? listSignals() : Promise.resolve([])), [demo]);

  const tabs = useMemo<SubTab[]>(() => {
    const cfg = publicCrmConfig();
    const open = (cases.data ?? []).filter(isOpen);
    const breaching = open.filter((c) => c.type !== "appeal" && caseSla(c, cfg.case_types[c.type]).status === "breach").length;
    const appeals = open.filter((c) => c.type === "appeal").length;
    const newSignals = (signals.data ?? []).filter((s) => s.status === "new").length;
    const panel = isAppealsPanel(actor);
    const commercialOnly = isCommercialOnly(actor);
    return [
      { to: "", label: "Overview", icon: "i-chart" },
      { to: "cases", label: "Cases", icon: "i-mail", badge: breaching || undefined },
      ...(panel ? [{ to: "appeals", label: "Appeals", icon: "i-lock", badge: appeals || undefined } as SubTab] : []),
      { to: "clients", label: "Clients", icon: "i-building" },
      { to: "console", label: "Console", icon: "i-phone" },
      { to: "signals", label: "Signals", icon: "i-spark", badge: newSignals || undefined },
      { to: "pipeline", label: "Opportunities", icon: "i-trend" },
      { to: "quotes", label: "Quotes", icon: "i-file" },
      { to: "renewals", label: "Renewals", icon: "i-refresh" },
      { to: "insights", label: "Insights", icon: "i-layers" },
      { to: "knowledge", label: "Knowledge", icon: "i-book" },
      { to: "contracts", label: "Contracts", icon: "i-scroll" },
      ...(commercialOnly ? [] : [{ to: "settings", label: "Settings", icon: "i-sliders" } as SubTab]),
    ];
  }, [cases.data, signals.data, actor]);

  return <ModulePageShell reason="Staff sign-in required for CRM & Commercial" tabs={tabs} />;
}
