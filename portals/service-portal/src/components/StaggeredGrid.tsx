import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";

/** Mirrors the .ggrid breakpoints in outline-card.css. */
function useColumnCount(): number {
  const read = () =>
    typeof window === "undefined"
      ? 3
      : window.matchMedia("(max-width:900px)").matches
        ? 1
        : window.matchMedia("(max-width:1150px)").matches
          ? 2
          : 3;
  const [cols, setCols] = useState(read);
  useEffect(() => {
    const queries = ["(max-width:900px)", "(max-width:1150px)"].map((m) => window.matchMedia(m));
    const update = () => setCols(read());
    queries.forEach((mq) => mq.addEventListener("change", update));
    return () => queries.forEach((mq) => mq.removeEventListener("change", update));
  }, []);
  return cols;
}

/**
 * Parallax rate per column: px of travel per px the grid centre is away from the
 * viewport centre. Opposite signs make neighbouring columns slide past each other.
 */
const DRIFT = [0.14, -0.1, 0.2];
/** Hard cap on travel (px) so no card can slide out of reach. */
const MAX_DRIFT = 90;

/** Nudges each column up/down at a slightly different rate as the grid scrolls. */
function useColumnDrift(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cols = () => Array.from(el.querySelectorAll<HTMLElement>(".ggrid__col"));
    if (!active || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      cols().forEach((c) => c.style.removeProperty("--drift"));
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // Positive once the grid's centre has scrolled above the viewport centre.
      const dist = vh / 2 - (r.top + r.height / 2);
      const list = cols();
      // A column may only rise into its own stagger offset, never above the grid's top
      // edge — otherwise it slides over the section heading. Read all, then write.
      const rise = list.map((c) => parseFloat(getComputedStyle(c).paddingTop) || 0);
      list.forEach((c, i) => {
        const y = Math.max(-Math.min(MAX_DRIFT, rise[i]), Math.min(MAX_DRIFT, dist * DRIFT[i % DRIFT.length]));
        c.style.setProperty("--drift", `${y.toFixed(1)}px`);
      });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    // Capture phase so scrolling inside any layout container also drives the drift.
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
    };
  }, [ref, active]);
}

type Props<T> = {
  label: string;
  items: T[];
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  /** Shown across the full grid width when there are no items. */
  empty?: ReactNode;
  className?: string;
};

/** Staggered, scroll-drifting card columns. Items are dealt round-robin so reading order stays left-to-right. */
export function StaggeredGrid<T>({ label, items, itemKey, renderItem, empty, className }: Props<T>) {
  const colCount = useColumnCount();
  const columns = useMemo(() => {
    const out: T[][] = Array.from({ length: colCount }, () => []);
    items.forEach((item, i) => out[i % colCount].push(item));
    return out;
  }, [items, colCount]);

  const ref = useRef<HTMLElement>(null);
  useColumnDrift(ref, colCount > 1 && items.length > 0);

  return (
    <section ref={ref} className={className ? `ggrid ${className}` : "ggrid"} aria-label={label}>
      {items.length > 0
        ? columns.map((col, ci) => (
            <div key={ci} className="ggrid__col">
              {col.map((item) => (
                <div key={itemKey(item)} className="ggrid__item">
                  {renderItem(item)}
                </div>
              ))}
            </div>
          ))
        : empty}
    </section>
  );
}
