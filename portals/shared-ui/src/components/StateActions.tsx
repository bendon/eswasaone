import type { ReactNode } from "react";
import { useDemoMode } from "./DemoBadge";

/** Legal next transition from Core (workflow / docstate). */
export type AllowedAction = {
  action: string;
  label: string;
  /** Rule catalogue id when this transition fires a business rule */
  rule_id?: string | null;
  danger?: boolean;
  /** Consequence blurb for ConfirmAction */
  consequence?: string | null;
};

export type StateActionsProps = {
  /** From Core record.allowed_actions */
  actions: AllowedAction[] | null | undefined;
  /** Called after user confirms — parent performs the API write + refetch */
  onAction: (action: AllowedAction) => void | Promise<void>;
  /** Confirm helper from useConfirmAction / dialogs */
  confirm: (opts: {
    title: string;
    message: string;
    ruleId?: string;
    consequence?: string;
    danger?: boolean;
    confirmLabel?: string;
  }) => Promise<boolean>;
  busy?: boolean;
  className?: string;
  empty?: ReactNode;
};

/**
 * Renders only Core-returned allowed_actions[]. No hard-coded button sets.
 * Demo mode disables writes against fixture records.
 */
export function StateActions({
  actions,
  onAction,
  confirm,
  busy = false,
  className = "state-actions",
  empty = null,
}: StateActionsProps) {
  const demo = useDemoMode();
  const list = actions?.filter((a) => a?.action && a?.label) ?? [];

  if (!list.length) return <>{empty}</>;

  return (
    <div className={className} role="group" aria-label="Available actions">
      {list.map((a) => (
        <button
          key={a.action}
          type="button"
          className={a.danger ? "cta dialog-cta--danger" : "cta"}
          disabled={busy || demo}
          title={
            demo
              ? "Disabled in demo mode — fixture records cannot be committed"
              : a.rule_id
                ? `${a.label} (${a.rule_id})`
                : a.label
          }
          onClick={() => {
            void (async () => {
              if (demo || busy) return;
              const ok = await confirm({
                title: a.label,
                message: `${a.label}?\n\nThis will save the change and update the record for the team.`,
                ruleId: a.rule_id ?? undefined,
                consequence: a.consequence ?? undefined,
                danger: a.danger,
                confirmLabel: a.label,
              });
              if (ok) await onAction(a);
            })();
          }}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
