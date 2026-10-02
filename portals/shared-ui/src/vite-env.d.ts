/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_WS_BASE?: string;
  readonly VITE_USE_MSW?: string;
  /** Frappe Desk origin for HR desk-links (e.g. http://127.0.0.1:8020). */
  readonly VITE_FRAPPE_URL?: string;
  readonly VITE_DESK_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
