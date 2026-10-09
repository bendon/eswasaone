import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { DayPicker, type Matcher } from "react-day-picker";
import { addMonths, addYears, format, isValid, startOfMonth } from "date-fns";
import { Icon } from "../icons/Icon";
import "react-day-picker/style.css";
import "../styles/datepicker.css";

/* Values stay ISO strings ("YYYY-MM-DD" / "YYYY-MM") so these drop in for native inputs. */

function parseDay(v?: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? "");
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isValid(d) ? d : undefined;
}

function parseMonth(v?: string): { y: number; m: number } | undefined {
  const m = /^(\d{4})-(\d{2})$/.exec(v ?? "");
  return m ? { y: Number(m[1]), m: Number(m[2]) - 1 } : undefined;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => format(new Date(2000, i, 1), "MMM"));
const SHEET_BELOW = 560;

type Placement = { sheet: boolean; style: CSSProperties };

/**
 * Popover anchored to a trigger, portalled to <body> so it escapes drawers,
 * cards with overflow and wrapping <label>s. Pointer and key events are kept
 * from reaching document-level listeners (e.g. a drawer's click-outside).
 */
function usePopover() {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Placement>({ sheet: false, style: {} });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const el = document.createElement("div");
    el.className = "dp-host";
    document.body.appendChild(el);
    const stop = (e: Event) => e.stopPropagation();
    const evs = ["mousedown", "pointerdown", "click", "touchstart", "keydown", "focusin"];
    evs.forEach((t) => el.addEventListener(t, stop));
    setHost(el);
    return () => {
      evs.forEach((t) => el.removeEventListener(t, stop));
      el.remove();
      setHost(null);
    };
  }, [open]);

  const reposition = useCallback(() => {
    const t = triggerRef.current;
    const p = popRef.current;
    if (!t) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vw < SHEET_BELOW) {
      setPlace({ sheet: true, style: {} });
      return;
    }
    const r = t.getBoundingClientRect();
    const w = p?.offsetWidth ?? 320;
    const h = p?.offsetHeight ?? 360;
    const below = vh - r.bottom;
    const top = below < h + 12 && r.top > below ? Math.max(8, r.top - h - 6) : r.bottom + 6;
    const left = Math.min(Math.max(8, r.left), vw - w - 8);
    setPlace({ sheet: false, style: { top, left } });
  }, []);

  useLayoutEffect(() => {
    if (!open || !host) return;
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, host, reposition]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || popRef.current?.contains(target)) return;
      close(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, close]);

  function onPopKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  function portal(children: ReactNode, label: string) {
    if (!open || !host) return null;
    return createPortal(
      <>
        {place.sheet ? <div className="dp-backdrop" onClick={() => close()} /> : null}
        <div
          ref={popRef}
          className={`dp-pop${place.sheet ? " dp-pop--sheet" : ""}`}
          style={place.style}
          role="dialog"
          aria-modal="false"
          aria-label={label}
          onKeyDown={onPopKey}
        >
          {children}
        </div>
      </>,
      host,
    );
  }

  return { open, setOpen, close, triggerRef, portal };
}

type TriggerProps = {
  id?: string;
  value: string;
  display: string;
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  open: boolean;
  className?: string;
  ariaLabel?: string;
  icon: "i-cal";
  onToggle: () => void;
  onClear?: () => void;
  triggerRef: RefObject<HTMLButtonElement>;
  popId: string;
};

function Trigger(p: TriggerProps) {
  return (
    <span className={`dp-field${p.open ? " is-open" : ""}${p.invalid ? " is-invalid" : ""} ${p.className ?? ""}`.trim()}>
      <button
        ref={p.triggerRef}
        id={p.id}
        type="button"
        className="dp-trigger"
        disabled={p.disabled}
        aria-haspopup="dialog"
        aria-expanded={p.open}
        aria-controls={p.open ? p.popId : undefined}
        aria-required={p.required || undefined}
        aria-invalid={p.invalid || undefined}
        aria-label={p.ariaLabel ? `${p.ariaLabel}: ${p.display || "not set"}` : undefined}
        onClick={p.onToggle}
        onKeyDown={(e) => {
          if (e.key === "Escape" && p.open) {
            e.stopPropagation();
            p.onToggle();
          }
          if (e.key === "ArrowDown" && !p.open) {
            e.preventDefault();
            p.onToggle();
          }
        }}
      >
        <Icon name={p.icon} />
        <span className={p.display ? "dp-trigger__val" : "dp-trigger__ph"}>{p.display || p.placeholder}</span>
      </button>
      {p.onClear && p.value && !p.disabled ? (
        <button type="button" className="dp-clear" onClick={p.onClear} aria-label="Clear date">
          <Icon name="i-x" />
        </button>
      ) : null}
    </span>
  );
}

type View = "day" | "month" | "year";
const YEARS_PER_PAGE = 12;
const mkey = (y: number, m: number) => y * 12 + m;

/** Arrow-key movement across a grid of buttons with `cols` columns. */
function gridKeys(e: KeyboardEvent<HTMLDivElement>, cols: number) {
  const btns = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
  const i = btns.indexOf(document.activeElement as HTMLButtonElement);
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
  if (i < 0 || !step) return;
  e.preventDefault();
  btns[Math.max(0, Math.min(btns.length - 1, i + step))]?.focus();
}

type PanelProps = {
  /** "day" picks a full date; "month" stops at month + year. */
  mode: "day" | "month";
  selected?: Date;
  minD?: Date;
  maxD?: Date;
  disabledDays?: Matcher[];
  required?: boolean;
  hasValue: boolean;
  onPick: (d: Date) => void;
  onClear: () => void;
};

/**
 * Calendar with drill-down: click the year to pick from a year grid, then a
 * month grid, then the days. Month/year chips in the header jump straight
 * to those views.
 */
function CalendarPanel({ mode, selected, minD, maxD, disabledDays = [], required, hasValue, onPick, onClear }: PanelProps) {
  const today = new Date();
  const initial = selected ?? (minD && minD > today ? minD : maxD && maxD < today ? maxD : today);
  const [view, setView] = useState<View>(mode === "day" ? "day" : "month");
  const [month, setMonth] = useState<Date>(startOfMonth(initial));
  const [yearPage, setYearPage] = useState(
    () => initial.getFullYear() - (((initial.getFullYear() % YEARS_PER_PAGE) + YEARS_PER_PAGE) % YEARS_PER_PAGE),
  );
  const [anim, setAnim] = useState<"in" | "out" | "fwd" | "back">("in");
  const bodyRef = useRef<HTMLDivElement>(null);

  const y = month.getFullYear();
  const m = month.getMonth();
  const minY = minD?.getFullYear() ?? today.getFullYear() - 100;
  const maxY = maxD?.getFullYear() ?? today.getFullYear() + 15;
  const lo = minD ? mkey(minD.getFullYear(), minD.getMonth()) : -Infinity;
  const hi = maxD ? mkey(maxD.getFullYear(), maxD.getMonth()) : Infinity;
  const monthBlocked = (yy: number, mm: number) => mkey(yy, mm) < lo || mkey(yy, mm) > hi;

  // Focus the most relevant cell whenever the view changes.
  useEffect(() => {
    window.requestAnimationFrame(() => {
      const root = bodyRef.current;
      if (!root) return;
      const pick =
        view === "day"
          ? root.querySelector<HTMLButtonElement>(".rdp-selected button, .rdp-today button, .rdp-day:not(.rdp-disabled) button")
          : root.querySelector<HTMLButtonElement>(".is-sel, .is-now, button:not(:disabled)");
      pick?.focus();
    });
  }, [view]);

  function switchView(next: View) {
    setAnim(next === "day" || (view === "year" && next === "month") ? "in" : "out");
    if (next === "year") setYearPage(y - (((y % YEARS_PER_PAGE) + YEARS_PER_PAGE) % YEARS_PER_PAGE));
    setView(next);
  }

  function shift(delta: number) {
    setAnim(delta > 0 ? "fwd" : "back");
    if (view === "day") setMonth((d) => addMonths(d, delta));
    else if (view === "month") setMonth((d) => addYears(d, delta));
    else setYearPage((p) => p + delta * YEARS_PER_PAGE);
  }

  const canPrev =
    view === "day" ? mkey(y, m) > lo : view === "month" ? y > minY : yearPage > minY;
  const canNext =
    view === "day" ? mkey(y, m) < hi : view === "month" ? y < maxY : yearPage + YEARS_PER_PAGE - 1 < maxY;

  const todayOk =
    !(minD && format(today, "yyyy-MM-dd") < format(minD, "yyyy-MM-dd")) &&
    !(maxD && format(today, "yyyy-MM-dd") > format(maxD, "yyyy-MM-dd"));
  const thisMonthOk = !monthBlocked(today.getFullYear(), today.getMonth());

  const headline = selected
    ? format(selected, mode === "day" ? "EEE, d MMM yyyy" : "MMMM yyyy")
    : mode === "day"
      ? "No date yet"
      : "No month yet";

  const navLabel = view === "day" ? "month" : view === "month" ? "year" : "years";
  const stepLabel =
    view === "year" ? (
      <span className="dp-range">
        {yearPage} – {yearPage + YEARS_PER_PAGE - 1}
      </span>
    ) : null;

  return (
    <div className={`dp-cal dp-cal--${mode}`}>
      <div className="dp-cal__top">
        <small>{mode === "day" ? "Select date" : "Select month"}</small>
        <b key={headline}>{headline}</b>
      </div>

      <div className="dp-cal__bar">
        <div className="dp-cal__chips">
          {stepLabel ?? (
            <>
              {mode === "day" ? (
                <button
                  type="button"
                  className={`dp-chip${view === "month" ? " is-on" : ""}`}
                  onClick={() => switchView(view === "month" ? "day" : "month")}
                  aria-label={`Month: ${format(month, "MMMM")}. Choose month`}
                  aria-expanded={view === "month"}
                >
                  {format(month, "MMMM")} <Icon name="i-chev" />
                </button>
              ) : null}
              <button
                type="button"
                className={`dp-chip${view === "year" ? " is-on" : ""}`}
                onClick={() => switchView("year")}
                aria-label={`Year: ${y}. Choose year`}
                aria-expanded={false}
              >
                {y} <Icon name="i-chev" />
              </button>
            </>
          )}
          {view === "year" ? (
            <button
              type="button"
              className="dp-chip is-on"
              onClick={() => switchView(mode === "day" ? "day" : "month")}
              aria-label="Close year list"
            >
              {y} <Icon name="i-chev" />
            </button>
          ) : null}
        </div>
        <div className="dp-cal__arrows">
          <button type="button" className="dp-nav" onClick={() => shift(-1)} disabled={!canPrev} aria-label={`Previous ${navLabel}`}>
            <Icon name="i-cleft" />
          </button>
          <button type="button" className="dp-nav" onClick={() => shift(1)} disabled={!canNext} aria-label={`Next ${navLabel}`}>
            <Icon name="i-cright" />
          </button>
        </div>
      </div>

      <div className="dp-cal__body" ref={bodyRef}>
        {view === "day" ? (
          <div key={`d-${mkey(y, m)}`} className={`dp-view is-${anim}`}>
            <DayPicker
              mode="single"
              hideNavigation
              showOutsideDays
              fixedWeeks
              weekStartsOn={1}
              month={month}
              onMonthChange={setMonth}
              selected={selected}
              onSelect={(d: Date | undefined) => d && onPick(d)}
              disabled={[...(minD ? [{ before: minD }] : []), ...(maxD ? [{ after: maxD }] : []), ...disabledDays]}
              required={required}
            />
          </div>
        ) : view === "month" ? (
          <div
            key={`m-${y}`}
            className={`dp-view dp-grid dp-grid--months is-${anim}`}
            onKeyDown={(e) => gridKeys(e, 3)}
            role="group"
            aria-label={`Months of ${y}`}
          >
            {MONTHS.map((label, mm) => {
              const isSel = selected?.getFullYear() === y && selected.getMonth() === mm;
              const isNow = today.getFullYear() === y && today.getMonth() === mm;
              return (
                <button
                  key={label}
                  type="button"
                  className={[isSel && "is-sel", isNow && "is-now", mode === "day" && mm === m && !isSel && "is-cursor"].filter(Boolean).join(" ") || undefined}
                  disabled={monthBlocked(y, mm)}
                  aria-pressed={isSel}
                  onClick={() => {
                    const d = new Date(y, mm, 1);
                    if (mode === "month") return onPick(d);
                    setMonth(d);
                    switchView("day");
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : (
          <div
            key={`y-${yearPage}`}
            className={`dp-view dp-grid dp-grid--years is-${anim}`}
            onKeyDown={(e) => gridKeys(e, 3)}
            role="group"
            aria-label={`Years ${yearPage} to ${yearPage + YEARS_PER_PAGE - 1}`}
          >
            {Array.from({ length: YEARS_PER_PAGE }, (_, i) => yearPage + i).map((yy) => (
              <button
                key={yy}
                type="button"
                className={[selected?.getFullYear() === yy && "is-sel", today.getFullYear() === yy && "is-now", yy === y && selected?.getFullYear() !== yy && "is-cursor"].filter(Boolean).join(" ") || undefined}
                disabled={yy < minY || yy > maxY}
                aria-pressed={selected?.getFullYear() === yy}
                onClick={() => {
                  // Keep the month if it is allowed in the new year, else clamp into range.
                  let mm = m;
                  if (mkey(yy, mm) < lo && minD) mm = minD.getMonth();
                  if (mkey(yy, mm) > hi && maxD) mm = maxD.getMonth();
                  setMonth(new Date(yy, mm, 1));
                  switchView("month");
                }}
              >
                {yy}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="dp-foot">
        {mode === "day" ? (
          <button type="button" className="dp-link" disabled={!todayOk} onClick={() => onPick(today)}>
            Today
          </button>
        ) : (
          <button
            type="button"
            className="dp-link"
            disabled={!thisMonthOk}
            onClick={() => onPick(new Date(today.getFullYear(), today.getMonth(), 1))}
          >
            This month
          </button>
        )}
        {!required && hasValue ? (
          <button type="button" className="dp-link dp-link--muted" onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

export type DateFieldProps = {
  value: string;
  onChange: (iso: string) => void;
  /** ISO "YYYY-MM-DD" bounds; days outside are disabled. */
  min?: string;
  max?: string;
  /** Extra react-day-picker matchers, e.g. { dayOfWeek: [0, 6] } to block weekends. */
  disabledDays?: Matcher | Matcher[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  id?: string;
  className?: string;
  ariaLabel?: string;
};

/** Themed date field: year → month → day drill-down calendar. Value is "YYYY-MM-DD" or "". */
export function DateField({
  value,
  onChange,
  min,
  max,
  disabledDays,
  placeholder = "Select a date",
  disabled,
  required,
  invalid,
  id,
  className,
  ariaLabel,
}: DateFieldProps) {
  const pop = usePopover();
  const popId = useId();
  const selected = parseDay(value);

  return (
    <>
      <Trigger
        id={id}
        value={value}
        display={selected ? format(selected, "EEE, d MMM yyyy") : ""}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        invalid={invalid}
        open={pop.open}
        className={className}
        ariaLabel={ariaLabel}
        icon="i-cal"
        onToggle={() => pop.setOpen((o) => !o)}
        onClear={required ? undefined : () => onChange("")}
        triggerRef={pop.triggerRef}
        popId={popId}
      />
      {pop.portal(
        <div id={popId}>
          <CalendarPanel
            mode="day"
            selected={selected}
            minD={parseDay(min)}
            maxD={parseDay(max)}
            disabledDays={disabledDays ? (Array.isArray(disabledDays) ? disabledDays : [disabledDays]) : []}
            required={required}
            hasValue={Boolean(value)}
            onPick={(d) => {
              onChange(format(d, "yyyy-MM-dd"));
              pop.close();
            }}
            onClear={() => {
              onChange("");
              pop.close();
            }}
          />
        </div>,
        "Choose a date",
      )}
    </>
  );
}

export type MonthFieldProps = Omit<DateFieldProps, "disabledDays">;

/** Month + year field with the same drill-down (year → month). Value is "YYYY-MM" or "". */
export function MonthField({
  value,
  onChange,
  min,
  max,
  placeholder = "Select a month",
  disabled,
  required,
  invalid,
  id,
  className,
  ariaLabel,
}: MonthFieldProps) {
  const pop = usePopover();
  const popId = useId();
  const sel = parseMonth(value);
  const lo = parseMonth(min);
  const hi = parseMonth(max);
  const selected = sel ? new Date(sel.y, sel.m, 1) : undefined;

  return (
    <>
      <Trigger
        id={id}
        value={value}
        display={selected ? format(selected, "MMMM yyyy") : ""}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        invalid={invalid}
        open={pop.open}
        className={className}
        ariaLabel={ariaLabel}
        icon="i-cal"
        onToggle={() => pop.setOpen((o) => !o)}
        onClear={required ? undefined : () => onChange("")}
        triggerRef={pop.triggerRef}
        popId={popId}
      />
      {pop.portal(
        <div id={popId}>
          <CalendarPanel
            mode="month"
            selected={selected}
            minD={lo ? new Date(lo.y, lo.m, 1) : undefined}
            maxD={hi ? new Date(hi.y, hi.m + 1, 0) : undefined}
            required={required}
            hasValue={Boolean(value)}
            onPick={(d) => {
              onChange(format(d, "yyyy-MM"));
              pop.close();
            }}
            onClear={() => {
              onChange("");
              pop.close();
            }}
          />
        </div>,
        "Choose a month",
      )}
    </>
  );
}
