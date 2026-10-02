/**
 * Shared a11y helpers used across portals (modals, sheets, dock).
 */

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Focus the first focusable element inside `root`, if any. */
export function focusFirst(root: HTMLElement | null): void {
  if (!root) return;
  const el = root.querySelector<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  el?.focus();
}

/**
 * Trap Tab focus inside `root`. Returns a cleanup function.
 */
export function trapFocus(root: HTMLElement): () => void {
  const selector =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== "Tab") return;
    const nodes = Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
    if (!nodes.length) return;
    const first = nodes[0]!;
    const last = nodes[nodes.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  root.addEventListener("keydown", onKeyDown);
  return () => root.removeEventListener("keydown", onKeyDown);
}

/**
 * Call `handler` on Escape. Returns a cleanup function.
 */
export function onEscape(handler: () => void): () => void {
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") handler();
  }
  document.addEventListener("keydown", onKeyDown);
  return () => document.removeEventListener("keydown", onKeyDown);
}

/** Lock / unlock body scroll (modals, sheets). */
export function setBodyScrollLocked(locked: boolean): void {
  if (typeof document === "undefined") return;
  document.body.style.overflow = locked ? "hidden" : "";
}
