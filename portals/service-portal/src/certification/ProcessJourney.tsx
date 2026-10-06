import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Icon } from "@eswasaone/shared-ui";
import type { FlowStage } from "./flows";

const WHO_LABEL: Record<FlowStage["who"], string> = {
  you: "You",
  eswasa: "ESWASA",
  both: "You + ESWASA",
};

function isTyping(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable;
}

/**
 * One step at a time walkthrough of a certification flow. Steps ahead of the
 * furthest one reached stay hidden; the full path is revealed on the finish card.
 * Arrow keys work while the section is on screen; swipe works on touch.
 */
export function ProcessJourney({ stages, label }: { stages: FlowStage[]; label: string }) {
  const total = stages.length;
  const [idx, setIdx] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useRef(false);
  const swipeX = useRef<number | null>(null);

  const done = idx === total;

  const go = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(total, next));
      if (clamped === idx) return;
      setDir(clamped > idx ? "fwd" : "back");
      setIdx(clamped);
      setFurthest((f) => Math.max(f, clamped));
    },
    [idx, total],
  );

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      inView.current = entry.isIntersecting;
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!inView.current || e.altKey || e.ctrlKey || e.metaKey || isTyping(document.activeElement)) return;
      if (e.key === "ArrowRight") go(idx + 1);
      else if (e.key === "ArrowLeft") go(idx - 1);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, idx]);

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType !== "mouse") swipeX.current = e.clientX;
  }
  function onPointerUp(e: PointerEvent) {
    if (swipeX.current === null) return;
    const dx = e.clientX - swipeX.current;
    swipeX.current = null;
    if (Math.abs(dx) > 50) go(idx + (dx < 0 ? 1 : -1));
  }

  const step = stages[idx];
  const remaining = total - idx - 1;
  const progress = (Math.min(idx, total) / total) * 100;

  return (
    <div className="pj" ref={rootRef} aria-roledescription="carousel" aria-label={label}>
      <ol className="pj-rail" style={{ "--pj-fill": `${progress}%` } as CSSProperties}>
        {stages.map((s, i) => {
          const state = i < idx || done ? "done" : i === idx ? "cur" : i <= furthest ? "seen" : "todo";
          const locked = i > furthest;
          return (
            <li key={s.key} className={`pj-node is-${state}`}>
              <button
                type="button"
                onClick={() => go(i)}
                disabled={locked}
                aria-current={i === idx ? "step" : undefined}
                aria-label={locked ? `Step ${i + 1}, not reached yet` : `Step ${i + 1}: ${s.title}`}
              >
                {state === "done" ? <Icon name="i-check" /> : i + 1}
              </button>
              {!locked ? <span className="pj-node__tip">{s.title}</span> : null}
            </li>
          );
        })}
        <li className={`pj-node pj-node--end is-${done ? "cur" : "todo"}`}>
          <button
            type="button"
            onClick={() => go(total)}
            disabled={furthest < total}
            aria-label={furthest < total ? "Finish, not reached yet" : "Full path"}
          >
            <Icon name="i-award" />
          </button>
        </li>
      </ol>

      <div
        className="pj-stage"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipeX.current = null)}
      >
        {!done
          ? Array.from({ length: Math.min(2, remaining) }, (_, k) => (
              <div key={`ghost-${k}`} className="pj-ghost" style={{ "--k": k + 1 } as CSSProperties} aria-hidden="true">
                {k === 0 ? (
                  <span className="pj-ghost__label">
                    <Icon name="i-lock" /> Step {String(idx + 2).padStart(2, "0")}
                  </span>
                ) : null}
              </div>
            ))
          : null}

        <div className="pj-live" aria-live="polite">
          {done ? (
            <article key="finish" className={`pj-card pj-card--finish is-${dir}`}>
              <span className="pj-card__kicker">
                <Icon name="i-award" /> The full path
              </span>
              <h3>That’s every step, from first enquiry to certificate.</h3>
              <ol className="pj-recap">
                {stages.map((s, i) => (
                  <li key={s.key} style={{ "--i": i } as CSSProperties}>
                    <button type="button" onClick={() => go(i)}>
                      <span className="pj-recap__n">{String(i + 1).padStart(2, "0")}</span>
                      <b>{s.title}</b>
                      <span className={`pj-recap__who who-${s.who}`}>{WHO_LABEL[s.who]}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </article>
          ) : (
            <article key={`${step.key}-${idx}`} className={`pj-card is-${dir}`}>
              <span className="pj-card__ghostnum" aria-hidden="true">
                {String(idx + 1).padStart(2, "0")}
              </span>
              <span className="pj-card__kicker">
                Step {idx + 1} of {total}
              </span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              {step.sla ? (
                <span className="pj-sla">
                  <Icon name="i-clock" /> {step.sla}
                </span>
              ) : null}
              <div className={`pj-who who-${step.who}`} aria-label={`Who acts: ${WHO_LABEL[step.who]}`}>
                <span className="pj-who__party pj-who__party--you">
                  <Icon name="i-users" /> You
                </span>
                <span className="pj-who__link" aria-hidden="true" />
                <span className="pj-who__party pj-who__party--eswasa">
                  <Icon name="i-shield-c" /> ESWASA
                </span>
              </div>
            </article>
          )}
        </div>
      </div>

      <div className="pj-controls">
        <button type="button" className="pj-arrow" onClick={() => go(idx - 1)} disabled={idx === 0} aria-label="Previous step">
          <Icon name="i-cleft" />
        </button>
        <span className="pj-count">
          {done ? "Complete" : `${idx + 1} / ${total}`}
        </span>
        {done ? (
          <button type="button" className="pj-next pj-next--ghost" onClick={() => { setDir("back"); setIdx(0); }}>
            <Icon name="i-refresh" /> Walk through again
          </button>
        ) : (
          <button type="button" className="pj-next" onClick={() => go(idx + 1)}>
            {idx === total - 1 ? "See the full path" : idx >= furthest ? "Reveal next step" : "Next step"}
            <Icon name="i-cright" />
          </button>
        )}
        <span className="pj-hint" aria-hidden="true">
          <kbd>←</kbd> <kbd>→</kbd> to move
        </span>
      </div>
    </div>
  );
}
