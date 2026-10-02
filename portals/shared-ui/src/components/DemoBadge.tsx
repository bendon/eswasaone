/** Demo mode — fixture data allowed only when VITE_DEMO_MODE=true. */

export function useDemoMode(): boolean {
  try {
    return String(import.meta.env.VITE_DEMO_MODE ?? "").toLowerCase() === "true";
  } catch {
    return false;
  }
}

export function DemoBadge({ className = "" }: { className?: string }) {
  if (!useDemoMode()) return null;
  return (
    <span
      className={`demo-badge ${className}`.trim()}
      title="Fixture / sample data — write actions are disabled"
      role="status"
    >
      Demo data
    </span>
  );
}
