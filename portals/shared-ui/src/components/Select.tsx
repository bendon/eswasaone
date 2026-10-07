import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";
import { Icon } from "../icons/Icon";
import "../styles/select.css";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
  /** Consecutive options sharing a group render under one heading (like <optgroup>). */
  group?: string;
  title?: string;
};

export type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  /** Plain strings are used as both value and label. */
  options: readonly (SelectOption | string)[];
  /** Shown when `value` matches no option. */
  placeholder?: string;
  "aria-label"?: string;
  id?: string;
  /** Submitted with the enclosing form via a hidden input. */
  name?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  /** Stretch to the container width (form fields). */
  block?: boolean;
};

const norm = (o: SelectOption | string): SelectOption => (typeof o === "string" ? { value: o, label: o } : o);
const stop = (e: SyntheticEvent) => e.stopPropagation();

/**
 * Styled drop-in for a native <select>: button + listbox, portalled to <body> so it
 * escapes drawers and overflow containers. Focus stays on the button
 * (aria-activedescendant), so keyboard behaviour matches a native select.
 */
export function Select({
  value,
  onChange,
  options: rawOptions,
  placeholder,
  "aria-label": ariaLabel,
  id,
  name,
  className,
  disabled,
  required,
  block,
}: SelectProps) {
  const uid = useId();
  const options = rawOptions.map(norm);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });
  const typed = useRef({ buf: "", at: 0 });

  const selectedIndex = options.findIndex((o) => o.value === value);
  const current = selectedIndex >= 0 ? options[selectedIndex] : null;
  const optId = (i: number) => `${uid}-opt-${i}`;

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  }, []);

  // Portal host; native listeners keep clicks inside the list from reaching
  // document-level click-outside handlers (drawers, menus).
  useEffect(() => {
    if (!open) return;
    const el = document.createElement("div");
    el.className = "xsel-host";
    document.body.appendChild(el);
    const evs = ["mousedown", "pointerdown", "click", "touchstart"];
    const halt = (e: Event) => e.stopPropagation();
    evs.forEach((t) => el.addEventListener(t, halt));
    setHost(el);
    return () => {
      evs.forEach((t) => el.removeEventListener(t, halt));
      el.remove();
      setHost(null);
      setStyle({ visibility: "hidden" });
    };
  }, [open]);

  const reposition = useCallback(() => {
    const t = btnRef.current;
    const p = listRef.current;
    if (!t || !p) return;
    const r = t.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const below = vh - r.bottom - 12;
    const above = r.top - 12;
    const natural = p.scrollHeight;
    const flip = below < Math.min(natural, 220) && above > below;
    const maxHeight = Math.max(120, Math.min(320, flip ? above : below));
    const left = Math.min(Math.max(8, r.left), Math.max(8, vw - p.offsetWidth - 8));
    setStyle(
      flip
        ? { bottom: vh - r.top + 6, left, minWidth: r.width, maxHeight }
        : { top: r.bottom + 6, left, minWidth: r.width, maxHeight },
    );
  }, []);

  useLayoutEffect(() => {
    if (!open || !host) return;
    reposition();
    const onScroll = (e: Event) => {
      if (listRef.current && e.target instanceof Node && listRef.current.contains(e.target)) return;
      reposition();
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, host, reposition]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (btnRef.current?.contains(e.target as Node)) return;
      close(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, close]);

  useEffect(() => {
    if (!open || !host || active < 0) return;
    document.getElementById(optId(active))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, host, active]);

  function step(from: number, dir: 1 | -1) {
    const n = options.length;
    for (let k = 1; k <= n; k++) {
      const i = (((from + dir * k) % n) + n) % n;
      if (!options[i].disabled) return i;
    }
    return from;
  }

  function edge(dir: 1 | -1) {
    return step(dir === 1 ? -1 : options.length, dir);
  }

  function openMenu() {
    if (disabled || options.length === 0) return;
    setActive(selectedIndex >= 0 && !options[selectedIndex].disabled ? selectedIndex : edge(1));
    setOpen(true);
  }

  function choose(i: number) {
    const o = options[i];
    if (!o || o.disabled) return;
    if (o.value !== value) onChange(o.value);
    close();
  }

  function typeahead(ch: string) {
    const now = Date.now();
    const t = typed.current;
    t.buf = now - t.at > 600 ? ch : t.buf + ch;
    t.at = now;
    const q = t.buf.toLowerCase();
    const start = t.buf.length === 1 ? active + 1 : Math.max(active, 0);
    for (let k = 0; k < options.length; k++) {
      const i = (start + k) % options.length;
      if (!options[i].disabled && options[i].label.toLowerCase().startsWith(q)) return i;
    }
    return -1;
  }

  function onKeyDown(e: KeyboardEvent) {
    const printable = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (Date.now() - typed.current.at > 600) typed.current.buf = "";
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openMenu();
      } else if (printable) {
        openMenu();
        const i = typeahead(e.key);
        if (i >= 0) setActive(i);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => step(i, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => step(i, -1));
    } else if (e.key === "Home" || e.key === "PageUp") {
      e.preventDefault();
      setActive(edge(1));
    } else if (e.key === "End" || e.key === "PageDown") {
      e.preventDefault();
      setActive(edge(-1));
    } else if (e.key === "Enter" || (e.key === " " && !typed.current.buf)) {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape") {
      // Keep the enclosing drawer / dialog open.
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") {
      close(false);
    } else if (printable) {
      e.preventDefault();
      const i = typeahead(e.key);
      if (i >= 0) setActive(i);
    }
  }

  const rootCls = ["xsel", block ? "xsel--block" : "", open ? "is-open" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={rootCls}>
      <button
        ref={btnRef}
        id={id}
        type="button"
        className="xsel__btn"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${uid}-list` : undefined}
        aria-activedescendant={open && active >= 0 ? optId(active) : undefined}
        aria-label={ariaLabel}
        aria-required={required || undefined}
        disabled={disabled}
        title={current?.title}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className="xsel__val">
          <span className={current ? undefined : "is-ph"}>{current ? current.label : placeholder ?? "Select…"}</span>
          {/* Invisible sizers keep the width steady across selections, like a native select. */}
          {options.map((o) => (
            <span key={o.value} className="xsel__sizer" aria-hidden="true">
              {o.label}
            </span>
          ))}
          {placeholder ? (
            <span className="xsel__sizer" aria-hidden="true">
              {placeholder}
            </span>
          ) : null}
        </span>
        <Icon name="i-chev" />
      </button>
      {name || required ? (
        <input
          className="xsel__req"
          tabIndex={-1}
          aria-hidden="true"
          name={name}
          required={required}
          disabled={disabled}
          value={current ? value : ""}
          onChange={() => {}}
          onFocus={() => btnRef.current?.focus()}
        />
      ) : null}
      {open && host
        ? createPortal(
            <ul
              ref={listRef}
              id={`${uid}-list`}
              className="xsel-pop"
              role="listbox"
              aria-label={ariaLabel}
              style={style}
              onClick={stop}
              onMouseDown={(e) => {
                // Keep focus on the trigger.
                e.preventDefault();
                stop(e);
              }}
              onPointerDown={stop}
            >
              {options.map((o, i) => (
                <OptionRow
                  key={`${o.group ?? ""}:${o.value}`}
                  id={optId(i)}
                  option={o}
                  heading={o.group && o.group !== options[i - 1]?.group ? o.group : undefined}
                  selected={o.value === value}
                  active={i === active}
                  onHover={() => !o.disabled && setActive(i)}
                  onPick={() => choose(i)}
                />
              ))}
            </ul>,
            host,
          )
        : null}
    </span>
  );
}

function OptionRow({
  id,
  option,
  heading,
  selected,
  active,
  onHover,
  onPick,
}: {
  id: string;
  option: SelectOption;
  heading?: string;
  selected: boolean;
  active: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  const cls = ["xsel__opt", active ? "is-active" : "", option.group ? "is-grouped" : ""].filter(Boolean).join(" ");
  return (
    <>
      {heading ? (
        <li className="xsel__grp" role="presentation">
          {heading}
        </li>
      ) : null}
      <li
        id={id}
        role="option"
        aria-selected={selected}
        aria-disabled={option.disabled || undefined}
        title={option.title}
        className={cls}
        onPointerEnter={onHover}
        onClick={onPick}
      >
        <span>{option.label}</span>
        {selected ? <Icon name="i-check" /> : null}
      </li>
    </>
  );
}
