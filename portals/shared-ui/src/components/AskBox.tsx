import { useState, type FormEvent } from "react";
import { Icon } from "../icons/Icon";

type Props = {
  placeholder?: string;
  onAsk: (message: string) => void | Promise<void>;
  busy?: boolean;
};

export function AskBox({
  placeholder = "Ask EswasaOne anything…",
  onAsk,
  busy,
}: Props) {
  const [value, setValue] = useState("");

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const msg = value.trim();
    if (!msg || busy) return;
    await onAsk(msg);
  }

  return (
    <form className="ask-main" onSubmit={submit}>
      <span className="am__ic">
        <Icon name="i-spark" />
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        disabled={busy}
      />
      <button type="submit" className="am__btn" disabled={busy}>
        <Icon name="i-send" /> Ask
      </button>
    </form>
  );
}
