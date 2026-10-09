import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon, type IconName } from "../icons/Icon";
import { onEscape, setBodyScrollLocked } from "../system/a11y";

export type DockContextItem = {
  id: string;
  title: string;
  detail?: string;
  tone?: "tip" | "alert" | "pending" | "info";
  /** Overrides the tone's default icon. */
  icon?: IconName;
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
  /**
   * One-tap example questions shown as chips. They also rotate through the closed
   * trigger's hint. Falls back to general guest examples when signed out.
   */
  suggestions?: string[];
};

const GUEST_SUGGESTIONS = [
  "Export honey to the EU",
  "Certify my bakery",
  "Standards for bottled water",
  "HACCP training for my staff",
];

const GUEST_CONTEXT: DockContextItem[] = [
  {
    id: "g-tip-std",
    title: "Find the standards that apply",
    detail: "Search SZNS and international references in the e-Store.",
    tone: "info",
    icon: "i-book",
    ask: "Find standards for my product",
  },
  {
    id: "g-tip-export",
    title: "Plan an export",
    detail: "Market rules, testing and the compliance path, step by step.",
    tone: "tip",
    icon: "i-globe",
    ask: "Help me export my product",
  },
  {
    id: "g-tip-cert",
    title: "Get certified",
    detail: "Which scheme fits your product, and what it costs.",
    tone: "tip",
    icon: "i-award",
    ask: "Which certification do I need?",
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

const TONE_ICON: Record<NonNullable<DockContextItem["tone"]>, IconName> = {
  tip: "i-spark",
  info: "i-book",
  pending: "i-clock",
  alert: "i-warn",
};

type DockMessage = {
  id: number;
  from: "user" | "esi";
  text: string;
  pending?: boolean;
};

/** Below this width the panel covers most of the screen, so lock page scroll. */
const COMPACT_QUERY = "(max-width: 640px)";

/** Cycles through `items` every `ms` while `active`; returns the current index. */
function useRotation(count: number, active: boolean, ms = 3800) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active || count < 2) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % count), ms);
    return () => window.clearInterval(id);
  }, [count, active, ms]);
  return count ? i % count : 0;
}

export function Dock({
  visible,
  onAsk,
  busy = false,
  expandSignal = 0,
  signedIn = false,
  userName,
  contextItems,
  suggestions,
}: DockProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  // Lives in the layout, so the thread survives route changes the asks trigger.
  const [thread, setThread] = useState<DockMessage[]>([]);
  const nextId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expandSignal > 0) setOpen(true);
  }, [expandSignal]);

  useEffect(() => {
    if (!open) return;
    return onEscape(() => setOpen(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const compact = window.matchMedia?.(COMPACT_QUERY).matches ?? false;
    if (compact) setBodyScrollLocked(true);
    // Focus the composer once the panel has animated in.
    const id = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 180);
    return () => {
      window.clearTimeout(id);
      if (compact) setBodyScrollLocked(false);
    };
  }, [open]);

  useEffect(() => {
    if (open && thread.length) endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [open, thread]);

  async function submit(goal?: string) {
    const g = (goal ?? value).trim();
    if (!g || busy) return;
    setValue("");
    const userId = nextId.current++;
    const replyId = nextId.current++;
    setThread((t) => [
      ...t,
      { id: userId, from: "user", text: g },
      { id: replyId, from: "esi", text: "Working on it…", pending: true },
    ]);
    let reply = `Done. I’ve opened the results for “${g}”. Ask a follow-up any time.`;
    try {
      await onAsk(g);
    } catch {
      reply = "Sorry, I couldn’t reach the guide service. Please try again shortly.";
    }
    setThread((t) => t.map((m) => (m.id === replyId ? { ...m, text: reply, pending: false } : m)));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submit();
  }

  const showDock = visible || open;
  const items = contextItems ?? (signedIn ? SIGNED_IN_CONTEXT : GUEST_CONTEXT);
  const chips = suggestions ?? (signedIn ? [] : GUEST_SUGGESTIONS);
  const contextLabel = signedIn ? "For you" : "I can help you";
  const firstName = userName?.split(/\s+/)[0];
  const title = signedIn ? `Hi${firstName ? ` ${firstName}` : ""}, what’s next?` : "Hi, I’m Esi.";
  const sub = signedIn
    ? "Pick up where you left off, or ask me anything."
    : "Tell me what you’re working on and I’ll map the standards, steps and costs.";

  const hintIdx = useRotation(chips.length, !open);
  const hint = chips.length ? chips[hintIdx] : "Ask Esi anything…";

  return (
    <div className={`dock${showDock ? " is-visible" : ""}`} aria-hidden={!showDock}>
      <button
        className={`dock__trigger${open ? " is-hidden" : ""}`}
        type="button"
        aria-label="Ask Esi anything"
        onClick={() => setOpen(true)}
      >
        <span className="dock__av" aria-hidden="true">
          <Icon name="i-spark" />
        </span>
        <span className="dock__hint" aria-hidden="true">
          <small>Ask Esi</small>
          <span key={hint} className="dock__hint-txt">
            {chips.length ? `“${hint}”` : hint}
          </span>
        </span>
      </button>

      {open ? (
        <div className="dock__panel" role="dialog" aria-label="Ask Esi" aria-modal="false">
          <div className="dock__head">
            <span className="av" aria-hidden="true">
              <Icon name="i-spark" />
            </span>
            <div className="dock__id">
              <b>Esi</b>
              <span>
                EswasaOne assistant · online
              </span>
            </div>
            <button
              className="dock__close"
              type="button"
              aria-label="Close chat"
              onClick={() => setOpen(false)}
            >
              <Icon name="i-x" />
            </button>
          </div>

          <div className="dock__body">
            <div className="dock__intro">
              <h3>{title}</h3>
              <p>{sub}</p>
            </div>

            {chips.length ? (
              <div className="dock__chips" role="group" aria-label="Try asking">
                <span className="dock__feed-lbl">Try asking</span>
                <div className="dock__chips-row">
                  {chips.map((c) => (
                    <button key={c} type="button" disabled={busy} onClick={() => void submit(c)}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="dock__feed" role="group" aria-label={contextLabel}>
              <span className="dock__feed-lbl">{contextLabel}</span>
              {items.map((item) => {
                const tone = item.tone ?? "info";
                const className = `dock__feed-item tone-${tone}`;
                const body = (
                  <>
                    <span className="dock__feed-ic" aria-hidden="true">
                      <Icon name={item.icon ?? TONE_ICON[tone]} />
                    </span>
                    <span className="dock__feed-copy">
                      <b>{item.title}</b>
                      {item.detail ? <span>{item.detail}</span> : null}
                    </span>
                    {item.ask ? (
                      <span className="dock__feed-go" aria-hidden="true">
                        <Icon name="i-cright" />
                      </span>
                    ) : null}
                  </>
                );
                if (item.ask) {
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`${className} is-action`}
                      disabled={busy}
                      onClick={() => void submit(item.ask)}
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

            {thread.length ? (
              <div className="dock__thread" role="log" aria-live="polite" aria-label="Conversation">
                {thread.map((m) => (
                  <p
                    key={m.id}
                    className={`dock__msg is-${m.from}${m.pending ? " is-pending" : ""}`}
                  >
                    {m.text}
                  </p>
                ))}
                <div ref={endRef} />
              </div>
            ) : null}
          </div>

          <form className="dock__form" onSubmit={onSubmit} role="search">
            <div className="dock__composer">
              <label className="sr-only" htmlFor="dockInput">
                Describe your goal
              </label>
              <input
                ref={inputRef}
                id="dockInput"
                type="text"
                autoComplete="off"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Describe your goal…"
              />
              <button type="submit" disabled={busy || !value.trim()} aria-label="Ask Esi">
                <Icon name="i-plane" />
              </button>
            </div>
            <p className="dock__note">Esi gives guidance. Confirm important details with ESWASA.</p>
          </form>
        </div>
      ) : null}
    </div>
  );
}
