/**
 * Dock nudge — a small actionable card that appears above the Ask Esi dock
 * trigger when new items arrive (e.g. "Esi says something came in").
 *
 * Shows: Esi label, message, "Claim" (gold) + "View in From Esi" buttons, dismiss (×).
 */
import { Icon } from "@eswasaone/shared-ui";

export type DockNudgeProps = {
  visible: boolean;
  message: string;
  onClaim?: () => void;
  onView?: () => void;
  onDismiss?: () => void;
};

export function DockNudge({ visible, message, onClaim, onView, onDismiss }: DockNudgeProps) {
  if (!visible) return null;

  return (
    <div className="dock__nudge" role="status" aria-live="polite">
      <button
        type="button"
        className="dock__nudge-x"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        ×
      </button>
      <small>
        <Icon name="i-spark" />
        {" Esi"}
      </small>
      <p dangerouslySetInnerHTML={{ __html: message }} />
      <div className="dock__nudge-acts">
        <button type="button" className="nb gold" onClick={onClaim}>
          Claim
        </button>
        <button type="button" className="nb" onClick={onView}>
          View in From Esi
        </button>
      </div>
    </div>
  );
}