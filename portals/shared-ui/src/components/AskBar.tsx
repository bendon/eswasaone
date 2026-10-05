/** Condensing Ask bar — hero on Home, slim sticky everywhere. */

import { useState, type FormEvent, type ReactNode } from "react";
import { Icon } from "../icons/Icon";

export type AskBarVariant = "hero" | "condensed";

export type AskBarProps = {
  variant?: AskBarVariant;
  value?: string;
  onChange?: (value: string) => void;
  onAsk: (goal: string) => void | Promise<void>;
  busy?: boolean;
  placeholder?: string;
  chips?: readonly { label: string; goal: string }[];
  label?: string;
  title?: string;
  subtitle?: string;
  /** Extra content under chips (hero only) */
  footer?: ReactNode;
};

export function AskBar({
  variant = "condensed",
  value: controlled,
  onChange,
  onAsk,
  busy = false,
  placeholder = 'Ask EswasaOne anything…  e.g. "Export honey to the EU"',
  chips = [],
  label = "ESWASAONE SERVICE PORTAL",
  title = "What can we help you with today?",
  subtitle = "Tell us your goal and we'll map the standards, steps, and what it costs.",
  footer,
}: AskBarProps) {
  const [local, setLocal] = useState("");
  const value = controlled ?? local;

  function setValue(next: string) {
    if (controlled === undefined) setLocal(next);
    onChange?.(next);
  }

  function submit(goal?: string) {
    const g = (goal ?? value).trim();
    if (!g || busy) return;
    void onAsk(g);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  if (variant === "hero") {
    return (
      <section className="hero askbar askbar--hero" aria-label="Ask EswasaOne">
        <div className="hero__label">{label}</div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
        <form className="ask" onSubmit={onSubmit}>
          <span className="ic" aria-hidden>
            <Icon name="i-spark" />
          </span>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            aria-label="Your goal"
            autoComplete="off"
          />
          <button type="submit" disabled={busy || !value.trim()}>
            <Icon name="i-send" /> {busy ? "Building…" : "Build my guide"}
          </button>
        </form>
        {chips.length > 0 ? (
          <div className="chips">
            {chips.map((c) => (
              <button key={c.goal} type="button" onClick={() => submit(c.goal)} disabled={busy}>
                {c.label}
              </button>
            ))}
          </div>
        ) : null}
        {footer}
      </section>
    );
  }

  return (
    <form className="askbar__slim" onSubmit={onSubmit} role="search" aria-label="Ask EswasaOne">
      <span className="askbar__chip" aria-hidden>
        <Icon name="i-spark" />
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ask Esi anything…"
        aria-label="Ask EswasaOne"
        autoComplete="off"
      />
      <button type="submit" disabled={busy || !value.trim()}>
        {busy ? "…" : "Ask"}
      </button>
    </form>
  );
}
