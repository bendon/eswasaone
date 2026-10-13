import { useEffect, useState } from "react";
import { Icon, Toast } from "@eswasaone/shared-ui";
import { fmtMoney } from "./helpers";
import { useHrSettings } from "./useHrSettings";
import type { HrPayslip, HrSlipsResponse } from "./types";
import { useMeResource } from "./useMeResource";

type Props = {
  enabled: boolean;
  refreshKey: string;
  onAuthRequired: (reason?: string) => void;
};

type SlipWithUrl = HrPayslip & { pdf_url?: string | null };

export function PayslipsPane({ enabled, refreshKey, onAuthRequired }: Props) {
  const slipsRes = useMeResource<HrSlipsResponse>("/hr/slips?limit=12", {
    enabled,
    refreshKey,
  });
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (slipsRes.authRequired) onAuthRequired(slipsRes.error || undefined);
  }, [slipsRes.authRequired, slipsRes.error, onAuthRequired]);

  const items = (slipsRes.data?.items ?? []) as SlipWithUrl[];
  const currency = useHrSettings(enabled, refreshKey)?.currency ?? null;

  function download(slip: SlipWithUrl) {
    const url = slip.pdf_url;
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    setToast(`No PDF for ${slip.period || slip.id} yet. Ask HR for a copy.`);
  }

  return (
    <div className="me-pane">
      <Toast message={toast} />

      <div className="me-sec-h">Payslips</div>
      {slipsRes.loading && !slipsRes.data ? (
        <p className="field-muted">Loading payslips…</p>
      ) : items.length === 0 ? (
        <div className="field-card">
          <p className="field-muted">No payslips available.</p>
        </div>
      ) : (
        <div className="me-card">
          {items.map((slip) => (
            <div className="me-row" key={slip.id}>
              <span className="me-row__ic me-row__ic--gold" aria-hidden>
                <Icon name="i-dollar" />
              </span>
              <div className="me-row__b">
                <b>{slip.period || slip.id}</b>
                <span className="mono">{fmtMoney(slip.net_pay, currency)} net</span>
              </div>
              <button
                type="button"
                className="me-btn me-btn--ghost me-btn--icon"
                aria-label={`Download ${slip.period || slip.id}`}
                onClick={() => download(slip)}
              >
                <Icon name="i-dl" />
              </button>
            </div>
          ))}
        </div>
      )}
      {slipsRes.error && !slipsRes.authRequired ? (
        <p className="me-error" role="alert">
          {slipsRes.error}
        </p>
      ) : null}
    </div>
  );
}
