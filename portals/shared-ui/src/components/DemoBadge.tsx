import { demoDataEnabled } from "../demo";

/** Demo mode: local demo data is on unless VITE_DEMO_MODE=false. */
export function useDemoMode(): boolean {
  return demoDataEnabled();
}

export function DemoBadge({ className = "" }: { className?: string }) {
  if (!useDemoMode()) return null;
  return (
    <span
      className={`demo-badge ${className}`.trim()}
      title="Sample data: changes are saved on this device until the backend is connected"
      role="status"
    >
      Demo data
    </span>
  );
}
