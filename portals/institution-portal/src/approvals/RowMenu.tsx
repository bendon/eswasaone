/**
 * ⋯ row menu for table rows. The panel is position:fixed so the table's horizontal scroll
 * container never clips it.
 */
import { useEffect, useRef, useState } from "react";

export type RowMenuItem = { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean; hint?: string } | "divider";

export function RowMenu({ items, label = "Row actions" }: { items: RowMenuItem[]; label?: string }) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pos) return;
    const close = (e: Event) => {
      if (e.type === "keydown" && (e as KeyboardEvent).key !== "Escape") return;
      if (e.type === "mousedown" && (panel.current?.contains(e.target as Node) || btn.current?.contains(e.target as Node))) return;
      setPos(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos]);

  const toggle = () => {
    if (pos) return setPos(null);
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const height = items.length * 36 + 12;
    const below = r.bottom + 4 + height < window.innerHeight;
    setPos({ top: below ? r.bottom + 4 : Math.max(8, r.top - height - 4), right: window.innerWidth - r.right });
  };

  return (
    <>
      <button ref={btn} type="button" className="eo-kebab" aria-label={label} aria-haspopup="menu" aria-expanded={Boolean(pos)} onClick={toggle}>
        <span aria-hidden="true">⋯</span>
      </button>
      {pos ? (
        <div ref={panel} className="eo-menu" role="menu" style={{ top: pos.top, right: pos.right }}>
          {items.map((it, i) =>
            it === "divider" ? (
              <hr key={`d${i}`} />
            ) : (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                className={it.danger ? "danger" : undefined}
                disabled={it.disabled}
                title={it.hint}
                onClick={() => {
                  setPos(null);
                  it.onSelect();
                }}
              >
                {it.label}
              </button>
            ),
          )}
        </div>
      ) : null}
    </>
  );
}
