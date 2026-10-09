import { useEffect, useState } from "react";
import { registerSW } from "virtual:pwa-register";

/**
 * Registers the Field service worker and offers an in-app update banner
 * (registerType: "prompt" — no silent full reload).
 */
export function PwaUpdateBanner() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [updateSW, setUpdateSW] = useState<((reload?: boolean) => Promise<void>) | null>(
    null,
  );

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const sw = registerSW({
      immediate: true,
      onNeedRefresh() {
        setNeedRefresh(true);
      },
      onOfflineReady() {
        setOfflineReady(true);
        window.setTimeout(() => setOfflineReady(false), 4000);
      },
    });
    setUpdateSW(() => sw);
  }, []);

  if (!needRefresh && !offlineReady) return null;

  return (
    <div className="field-pwa-banner" role="status">
      {needRefresh ? (
        <>
          <span>Update available</span>
          <button
            type="button"
            className="field-pwa-banner__btn"
            onClick={() => {
              void updateSW?.(true);
            }}
          >
            Refresh
          </button>
          <button
            type="button"
            className="field-pwa-banner__btn field-pwa-banner__btn--ghost"
            onClick={() => setNeedRefresh(false)}
          >
            Later
          </button>
        </>
      ) : (
        <span>Ready offline: shell cached on this device</span>
      )}
    </div>
  );
}
