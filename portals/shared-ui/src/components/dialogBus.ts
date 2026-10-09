/** Tiny bus so api/errors can call globalAlert without importing React Dialogs. */

export type AlertOptions = {
  title?: string;
  message: string;
  kind?: "info" | "success" | "error";
  okLabel?: string;
};

export type AlertState = AlertOptions & { resolve: () => void };
type Listener = () => void;

let _alert: AlertState | null = null;
const _listeners = new Set<Listener>();

export function getAlertState(): AlertState | null {
  return _alert;
}

export function clearAlertState(): void {
  _alert = null;
}

export function subscribeAlert(listener: Listener): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

function notify() {
  _listeners.forEach((l) => l());
}

export function globalAlert(opts: AlertOptions | string): Promise<void> {
  const normalized: AlertOptions = typeof opts === "string" ? { message: opts } : opts;
  return new Promise<void>((resolve) => {
    if (_alert) {
      _alert.resolve();
    }
    _alert = { ...normalized, resolve };
    notify();
  });
}
