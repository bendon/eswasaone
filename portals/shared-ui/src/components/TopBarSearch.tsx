import { useState, type FormEvent } from "react";
import { Icon } from "../icons/Icon";

type Props = {
  /** Runs the query; the search box clears once it settles. */
  onAsk: (message: string) => Promise<void> | void;
  busy?: boolean;
  placeholder?: string;
};

/** Global "Ask EswasaOne" box for the top bar's centre slot. */
export function TopBarSearch({
  onAsk,
  busy = false,
  placeholder = "Ask EswasaOne — “audits overdue this week”, “APP-2026-00042”…",
}: Props) {
  const [value, setValue] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q || busy) return;
    try {
      await onAsk(q);
    } finally {
      setValue("");
    }
  }

  return (
    <form className="top-search" role="search" onSubmit={submit}>
      <Icon name="i-search" />
      <label className="sr-only" htmlFor="topSearchInput">
        Ask EswasaOne
      </label>
      <input
        id="topSearchInput"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        disabled={busy}
      />
      <button type="submit" aria-label="Ask" disabled={busy || !value.trim()}>
        <Icon name="i-spark" />
        <span>{busy ? "Asking…" : "Ask"}</span>
      </button>
    </form>
  );
}
