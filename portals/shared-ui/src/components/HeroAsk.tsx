import type { ReactNode } from "react";
import { AskBox } from "./AskBox";
import { Icon } from "../icons/Icon";

type Props = {
  label: string;
  title?: string;
  subtitle: string;
  chips: string[];
  placeholder?: string;
  onAsk: (message: string) => void | Promise<void>;
  onChip?: (chip: string) => void | Promise<void>;
  busy?: boolean;
  side?: ReactNode;
};

export function HeroAsk({
  label,
  title = "What can we help you with today?",
  subtitle,
  chips,
  placeholder,
  onAsk,
  onChip,
  busy,
  side,
}: Props) {
  return (
    <section className="hero">
      <div>
        <div className="hero__label">{label}</div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
        <AskBox placeholder={placeholder} onAsk={onAsk} busy={busy} />
        <div className="hero__hint">
          <Icon name="i-spark" /> Powered by the EswasaOne AI assistant · answers in
          seconds
        </div>
        <div className="hero__chips">
          {chips.map((chip) => (
            <span
              key={chip}
              role="button"
              tabIndex={0}
              onClick={() => onChip?.(chip) ?? onAsk(chip)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  void (onChip?.(chip) ?? onAsk(chip));
                }
              }}
            >
              {chip}
            </span>
          ))}
        </div>
      </div>
      {side}
    </section>
  );
}
