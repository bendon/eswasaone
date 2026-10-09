import { useEffect, useId, useRef, useState } from "react";
import type { HeadcountPoint } from "./overviewMock";

/** SVG headcount sparkline — SoT: docs/mocks/eswasaone-hr.html */
export function HeadcountChart({ series }: { series: HeadcountPoint[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(480);
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(280, el.clientWidth)));
    ro.observe(el);
    setWidth(Math.max(280, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  const H = 190;
  const L = 30;
  const R = 30;
  const T = 20;
  const B = 28;
  const lo = 78;
  const hi = 88;
  const last = series.length - 1;
  const x = (i: number) => L + (i * (width - L - R)) / Math.max(1, last);
  const y = (v: number) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const active = hover ?? last;
  const d = series
    .map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ");
  const step = width < 520 ? 2 : 1;

  return (
    <div
      className="hr-line"
      ref={wrapRef}
      role="img"
      aria-label={`Headcount rose from ${series[0]?.value ?? "—"} in ${series[0]?.label ?? ""} to ${series[last]?.value ?? "—"} in ${series[last]?.label ?? ""}`}
    >
      <svg viewBox={`0 0 ${width} ${H}`} aria-hidden>
        {[80, 84, 88].map((t) => (
          <g key={t}>
            <line className="grid" x1={L} x2={width - R} y1={y(t)} y2={y(t)} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {series.map((p, i) =>
          (last - i) % step === 0 ? (
            <text key={p.label} x={x(i)} y={H - 8} textAnchor="middle">
              {p.label.slice(0, 3)}
            </text>
          ) : null,
        )}
        <path className="ln" d={d} />
        <line
          className="cross"
          y1={T}
          y2={H - B}
          x1={x(active)}
          x2={x(active)}
          visibility={hover == null ? "hidden" : "visible"}
        />
        <circle className="pt" r={4.5} cx={x(active)} cy={y(series[active].value)} />
        <text className="end" x={x(active)} y={y(series[active].value) - 10} textAnchor="middle">
          {series[active].value}
        </text>
        <rect
          x={L}
          y={0}
          width={width - L - R}
          height={H}
          fill="transparent"
          stroke="none"
          style={{ cursor: "crosshair" }}
          onPointerMove={(e) => {
            const svg = e.currentTarget.ownerSVGElement;
            if (!svg) return;
            const r = svg.getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * width;
            const i = Math.max(0, Math.min(last, Math.round((px - L) / ((width - L - R) / last))));
            setHover(i);
          }}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hover != null ? (
        <div
          className="hr-tip"
          id={uid}
          style={{ left: Math.max(70, Math.min(width - 70, x(hover))) }}
        >
          {series[hover].label}: {series[hover].value} employees
        </div>
      ) : null}
    </div>
  );
}
