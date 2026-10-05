import { useCallback } from "react";
import { useDialogs, type ConfirmOptions } from "./Dialogs";

export type ConfirmActionOptions = ConfirmOptions & {
  /** Rule catalogue id, e.g. R-C3, R-E2 — shown in the dialog */
  ruleId?: string;
  /** Extra consequence text (feed event, invoice, gazette, …) */
  consequence?: string;
};

/**
 * Confirm-before-commit for mutating UI actions.
 * Surfaces rule id + consequence; never optimistically commits.
 */
export function useConfirmAction() {
  const dialogs = useDialogs();

  const confirmAction = useCallback(
    async (opts: ConfirmActionOptions): Promise<boolean> => {
      const parts = [opts.message];
      if (opts.consequence) parts.push(opts.consequence);
      if (opts.ruleId) parts.push(`Rule: ${opts.ruleId}`);
      return dialogs.confirm({
        ...opts,
        message: parts.filter(Boolean).join("\n\n"),
        confirmLabel: opts.confirmLabel ?? "Confirm",
      });
    },
    [dialogs],
  );

  return { confirmAction, host: dialogs.host, dialogs };
}

/** Presentational confirm button that runs confirmAction then onConfirm. */
export function ConfirmActionButton({
  label,
  options,
  onConfirm,
  disabled,
  className = "cta",
  demoLocked = false,
}: {
  label: string;
  options: ConfirmActionOptions;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  className?: string;
  /** When demo mode shows fixtures — disable writes */
  demoLocked?: boolean;
}) {
  const { confirmAction, host } = useConfirmAction();
  const locked = demoLocked || disabled;

  return (
    <>
      {host}
      <button
        type="button"
        className={className}
        disabled={locked}
        title={
          demoLocked
            ? "Disabled in demo mode: fixture records cannot be committed"
            : options.ruleId
              ? `${options.title} (${options.ruleId})`
              : options.title
        }
        onClick={() => {
          void (async () => {
            if (locked) return;
            const ok = await confirmAction(options);
            if (ok) await onConfirm();
          })();
        }}
      >
        {label}
      </button>
    </>
  );
}
