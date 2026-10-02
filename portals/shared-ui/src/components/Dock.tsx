import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "../icons/Icon";
import { onEscape, setBodyScrollLocked } from "../system/a11y";

export type DockContextItem = {
  id: string;
  title: string;
  detail?: string;
  tone?: "tip" | "alert" | "pending" | "info";
  /** If set, clicking submits this as an ask goal. */
  ask?: string;
};

export type DockProps = {
  visible: boolean;
  onAsk: (goal: string) => void | Promise<void>;
  busy?: boolean;
  /** Increment to programmatically expand the panel (e.g. hero CTA). */
  expandSignal?: number;
  signedIn?: boolean;
  userName?: string;
  /** Contextual rows below the greeting. Falls back to guest/signed-in stubs. */
  contextItems?: DockContextItem[];
};

const GUEST_CONTEXT: DockContextItem[] = [
  {
    id: "g-tip-ask",
    title: "Describe a goal in plain language",
    detail: "I’ll map the standards, steps and estimated costs.",
    tone: "tip",
  },
  {
    id: "g-tip-std",
    title: "Browse the standards catalogue",
    detail: "Search SZNS and international references in e-Store.",
    tone: "info",
    ask: "Find standards for my product",
  },
  {
    id: "g-tip-export",
    title: "Planning an export?",
    detail: "I can outline market rules and the compliance path.",
    tone: "tip",
    ask: "Help me export my product",
  },
];

const SIGNED_IN_CONTEXT: DockContextItem[] = [
  {
    id: "s-pending",
    title: "Certification draft needs documents",
    detail: "Upload supporting files to keep your application moving.",
    tone: "pending",
    ask: "Continue my certification application",
  },
  {
    id: "s-alert",
    title: "Surveillance visit in 21 days",
    detail: "Review findings checklist before the auditor arrives.",
    tone: "alert",
    ask: "Prepare for my surveillance visit",
  },
  {
    id: "s-info",
    title: "3 new standards listed this week",
    detail: "See what’s new in the catalogue that may apply to you.",
    tone: "info",
    ask: "Show me newly listed standards",
  },
];

export function Dock({
  visible,
  onAsk,
  busy = false,
  expandSignal = 0,
  signedIn = false,
  userName,
  contextItems,
}: DockProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  useEffect(() => {
    if (expandSignal > 0) setOpen(true);
  }, [expandSignal]);

  useEffect(() => {
    if (!open) return;
    return onEscape(() => setOpen(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setBodyScrollLocked(true);
    return () => setBodyScrollLocked(false);
  }, [open]);

  function submit(goal?: string) {
    const g = (goal ?? value).trim();
    if (!g || busy) return;
    setValue(g);
    void onAsk(g);
    setOpen(false);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  const showDock = visible || open;
  const items = contextItems ?? (signedIn ? SIGNED_IN_CONTEXT : GUEST_CONTEXT);
  const contextLabel = signedIn ? "For you" : "From Esi";
  const greeting = signedIn
    ? `Hi${userName ? ` ${userName.split(/\s+/)[0]}` : ""}. What should we work on next?`
    : "What are you working on? I’ll map the standards, steps and costs.";

  return (
    <div className={`dock${showDock ? " is-visible" : ""}`} aria-hidden={!showDock}>
      <button
        className={`dock__trigger${open ? " is-hidden" : ""}`}
        type="button"
        aria-label="Ask Esi anything"
        onClick={() => setOpen(true)}
      >
        <span className="dock__av" aria-hidden="true">E</span>
        <span className="dock__hint">Ask Esi anything…</span>
      </button>

      {open ? (
        <div className="dock__panel" role="dialog" aria-label="Ask Esi" aria-modal="true">
          <div className="dock__head">
            <span className="av" aria-hidden="true">E</span>
            <div className="dock__id">
              <b>Esi</b>
              <span><i className="dot" aria-hidden="true" /> Your EswasaOne assistant</span>
            </div>
            <button
              className="dock__close"
              type="button"
              aria-label="Close chat"
              onClick={() => setOpen(false)}
            >×</button>
          </div>

          <div className="dock__body">
            <div className="dock__msg">
              <span className="dock__msg-av" aria-hidden="true">E</span>
              <p className="dock__bubble">{greeting}</p>
            </div>

            <div className="dock__feed" role="group" aria-label={contextLabel}>
              <span className="dock__feed-lbl">{contextLabel}</span>
              {items.map((item) => {
                const className = `dock__feed-item tone-${item.tone ?? "info"}`;
                const body = (
                  <>
                    <span className="dock__feed-mark" aria-hidden="true" />
                    <span className="dock__feed-copy">
                      <b>{item.title}</b>
                      {item.detail ? <span>{item.detail}</span> : null}
                    </span>
                  </>
                );
                if (item.ask) {
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`${className} is-action`}
                      disabled={busy}
                      onClick={() => submit(item.ask)}
                    >
                      {body}
                    </button>
                  );
                }
                return (
                  <div key={item.id} className={className}>
                    {body}
                  </div>
                );
              })}
            </div>
          </div>

          <form className="dock__form" onSubmit={onSubmit} role="search">
            <label className="sr-only" htmlFor="dockInput">Describe your goal</label>
            <input
              id="dockInput"
              type="text"
              autoComplete="off"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Tell me your goal…"
            />
            <button type="submit" disabled={busy || !value.trim()} aria-label="Ask Esi">
              <Icon name="i-send" />
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
