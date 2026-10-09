import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { focusFirst, onEscape, setBodyScrollLocked, trapFocus } from "../system/a11y";
import {
  clearAlertState,
  getAlertState,
  globalAlert,
  subscribeAlert,
  type AlertOptions,
  type AlertState,
} from "./dialogBus";

export type { AlertOptions } from "./dialogBus";
export { globalAlert } from "./dialogBus";

/* ---------- Types ---------- */

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Emphasise confirm as a destructive / high-impact action */
  danger?: boolean;
  /** Optional rule catalogue id (also used by ConfirmAction) */
  ruleId?: string;
};

export type PromptOptions = {
  title: string;
  message?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  inputType?: "text" | "email";
};

type ConfirmState = ConfirmOptions & { resolve: (ok: boolean) => void };
type PromptState = PromptOptions & { resolve: (value: string | null) => void };
/* ---------- Shell ---------- */

function DialogShell({
  open,
  titleId,
  labelledBy,
  onDismiss,
  children,
}: {
  open: boolean;
  titleId: string;
  labelledBy?: string;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setBodyScrollLocked(true);
    const root = rootRef.current;
    const t = window.setTimeout(() => focusFirst(root), 40);
    const releaseTrap = root ? trapFocus(root) : () => {};
    const releaseEsc = onEscape(onDismiss);
    return () => {
      window.clearTimeout(t);
      releaseTrap();
      releaseEsc();
      setBodyScrollLocked(false);
    };
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div
      ref={rootRef}
      className="overlay show"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy ?? titleId}
      onClick={onDismiss}
    >
      <div className="modal dialog-modal" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/* ---------- Confirm ---------- */

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmOptions & {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  return (
    <DialogShell open={open} titleId={titleId} onDismiss={onCancel}>
      <button type="button" className="x" aria-label="Close" onClick={onCancel}>
        ×
      </button>
      <h3 id={titleId}>{title}</h3>
      <p style={{ whiteSpace: "pre-wrap" }}>{message}</p>
      <div className="dialog-actions">
        <button type="button" className="alt" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={danger ? "cta dialog-cta--danger" : "cta"}
          onClick={onConfirm}
          autoFocus
        >
          {confirmLabel}
        </button>
      </div>
    </DialogShell>
  );
}

/* ---------- Message alert ---------- */

export function MessageAlert({
  open,
  title,
  message,
  kind = "info",
  okLabel = "OK",
  onClose,
}: AlertOptions & { open: boolean; onClose: () => void }) {
  const titleId = useId();
  const heading =
    title ?? (kind === "error" ? "Something went wrong" : kind === "success" ? "Done" : "Notice");
  return (
    <DialogShell open={open} titleId={titleId} onDismiss={onClose}>
      <button type="button" className="x" aria-label="Close" onClick={onClose}>
        ×
      </button>
      <div className={`dialog-kind dialog-kind--${kind}`} aria-hidden />
      <h3 id={titleId}>{heading}</h3>
      <p style={{ whiteSpace: "pre-wrap" }}>{message}</p>
      <div className="dialog-actions">
        <button type="button" className="cta" onClick={onClose} autoFocus>
          {okLabel}
        </button>
      </div>
    </DialogShell>
  );
}

/* ---------- Prompt ---------- */

export function PromptModal({
  open,
  title,
  message,
  label = "Value",
  placeholder,
  defaultValue = "",
  confirmLabel = "Continue",
  cancelLabel = "Cancel",
  inputType = "text",
  onSubmit,
  onCancel,
}: PromptOptions & {
  open: boolean;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (open) setValue(defaultValue);
  }, [open, defaultValue]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  }

  return (
    <DialogShell open={open} titleId={titleId} onDismiss={onCancel}>
      <button type="button" className="x" aria-label="Close" onClick={onCancel}>
        ×
      </button>
      <h3 id={titleId}>{title}</h3>
      {message ? <p style={{ whiteSpace: "pre-wrap" }}>{message}</p> : null}
      <form onSubmit={handleSubmit}>
        <label className="dialog-field">
          {label}
          <input
            type={inputType}
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            required
            autoFocus
          />
        </label>
        <div className="dialog-actions">
          <button type="button" className="alt" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="submit" className="cta" disabled={!value.trim()}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

/* ---------- Global store (confirm / prompt; alert lives in dialogBus) ---------- */

type Listener = () => void;

let _confirm: ConfirmState | null = null;
let _prompt: PromptState | null = null;
const _listeners = new Set<Listener>();

function notify() {
  _listeners.forEach((l) => l());
}

function subscribe(listener: Listener): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

function globalConfirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    _confirm = { ...opts, resolve };
    notify();
  });
}

function globalPrompt(opts: PromptOptions): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    _prompt = { ...opts, resolve };
    notify();
  });
}

/**
 * Mount once near the app root (layout). Renders the global confirm / alert / prompt dialogs.
 */
export function DialogHost() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const unsubA = subscribe(() => setTick((n) => n + 1));
    const unsubB = subscribeAlert(() => setTick((n) => n + 1));
    return () => {
      unsubA();
      unsubB();
    };
  }, []);

  const confirmState = _confirm;
  const alertState = getAlertState();
  const promptState = _prompt;

  return (
    <>
      <ConfirmModal
        open={!!confirmState}
        title={confirmState?.title ?? ""}
        message={confirmState?.message ?? ""}
        confirmLabel={confirmState?.confirmLabel}
        cancelLabel={confirmState?.cancelLabel}
        danger={confirmState?.danger}
        onCancel={() => {
          confirmState?.resolve(false);
          _confirm = null;
          notify();
        }}
        onConfirm={() => {
          confirmState?.resolve(true);
          _confirm = null;
          notify();
        }}
      />
      <MessageAlert
        open={!!alertState}
        title={alertState?.title}
        message={alertState?.message ?? ""}
        kind={alertState?.kind}
        okLabel={alertState?.okLabel}
        onClose={() => {
          alertState?.resolve();
          clearAlertState();
          notify();
        }}
      />
      <PromptModal
        open={!!promptState}
        title={promptState?.title ?? ""}
        message={promptState?.message}
        label={promptState?.label}
        placeholder={promptState?.placeholder}
        defaultValue={promptState?.defaultValue}
        confirmLabel={promptState?.confirmLabel}
        cancelLabel={promptState?.cancelLabel}
        inputType={promptState?.inputType}
        onCancel={() => {
          promptState?.resolve(null);
          _prompt = null;
          notify();
        }}
        onSubmit={(value) => {
          promptState?.resolve(value);
          _prompt = null;
          notify();
        }}
      />
    </>
  );
}
/* ---------- Context + hooks ---------- */

export type DialogsApi = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  alert: (opts: AlertOptions | string) => Promise<void>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
  /**
   * Legacy per-page host slot. Prefer mounting `<DialogHost />` once in the layout.
   * When a global host is mounted, this is null.
   */
  host: ReactNode;
};

const DialogContext = createContext<DialogsApi | null>(null);

const GLOBAL_API: DialogsApi = {
  confirm: globalConfirm,
  alert: globalAlert,
  prompt: globalPrompt,
  host: null,
};

/**
 * Wrap the portal shell so every page shares one dialog host.
 */
export function DialogProvider({ children }: { children: ReactNode }) {
  return (
    <DialogContext.Provider value={GLOBAL_API}>
      {children}
      <DialogHost />
    </DialogContext.Provider>
  );
}

/**
 * Promise-based confirm / alert / prompt (replaces window.confirm / alert / prompt).
 * Uses the global DialogProvider host when present; otherwise falls back to a local host
 * (return value `.host` must be rendered by the caller).
 */
export function useDialogs(): DialogsApi {
  const ctx = useContext(DialogContext);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [alertState, setAlertState] = useState<AlertState | null>(null);
  const [promptState, setPromptState] = useState<PromptState | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    if (ctx) return ctx.confirm(opts);
    return new Promise<boolean>((resolve) => {
      setConfirmState({ ...opts, resolve });
    });
  }, [ctx]);

  const alert = useCallback((opts: AlertOptions | string) => {
    if (ctx) return ctx.alert(opts);
    const normalized: AlertOptions = typeof opts === "string" ? { message: opts } : opts;
    return new Promise<void>((resolve) => {
      setAlertState({ ...normalized, resolve });
    });
  }, [ctx]);

  const prompt = useCallback((opts: PromptOptions) => {
    if (ctx) return ctx.prompt(opts);
    return new Promise<string | null>((resolve) => {
      setPromptState({ ...opts, resolve });
    });
  }, [ctx]);

  // When global provider is mounted, pages must not render a second host.
  if (ctx) {
    return { confirm, alert, prompt, host: null };
  }

  const host = (
    <>
      <ConfirmModal
        open={!!confirmState}
        title={confirmState?.title ?? ""}
        message={confirmState?.message ?? ""}
        confirmLabel={confirmState?.confirmLabel}
        cancelLabel={confirmState?.cancelLabel}
        danger={confirmState?.danger}
        onCancel={() => {
          confirmState?.resolve(false);
          setConfirmState(null);
        }}
        onConfirm={() => {
          confirmState?.resolve(true);
          setConfirmState(null);
        }}
      />
      <MessageAlert
        open={!!alertState}
        title={alertState?.title}
        message={alertState?.message ?? ""}
        kind={alertState?.kind}
        okLabel={alertState?.okLabel}
        onClose={() => {
          alertState?.resolve();
          setAlertState(null);
        }}
      />
      <PromptModal
        open={!!promptState}
        title={promptState?.title ?? ""}
        message={promptState?.message}
        label={promptState?.label}
        placeholder={promptState?.placeholder}
        defaultValue={promptState?.defaultValue}
        confirmLabel={promptState?.confirmLabel}
        cancelLabel={promptState?.cancelLabel}
        inputType={promptState?.inputType}
        onCancel={() => {
          promptState?.resolve(null);
          setPromptState(null);
        }}
        onSubmit={(value) => {
          promptState?.resolve(value);
          setPromptState(null);
        }}
      />
    </>
  );

  return { confirm, alert, prompt, host };
}
