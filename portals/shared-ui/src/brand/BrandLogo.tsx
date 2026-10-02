import markUrl from "./eswasa-mark.png";
import markTransparentUrl from "./eswasa-mark-transparent.png";
import lockupUrl from "./eswasa-lockup.png";

/** Official ESWASA brand asset URLs (Vite-resolved). */
export const brandAssets = {
  mark: markUrl,
  markTransparent: markTransparentUrl,
  lockup: lockupUrl,
} as const;

export type BrandLogoVariant = "mark" | "lockup";

export type BrandLogoProps = {
  variant?: BrandLogoVariant;
  /** Prefer transparent mark on dark chrome (institution sidebar). */
  transparent?: boolean;
  className?: string;
  alt?: string;
};

/**
 * Official ESWASA mark (ST square) or full lockup.
 * Product name (EswasaOne) stays separate in surrounding chrome.
 */
export function BrandLogo({
  variant = "mark",
  transparent = false,
  className,
  alt,
}: BrandLogoProps) {
  const src =
    variant === "lockup"
      ? brandAssets.lockup
      : transparent
        ? brandAssets.markTransparent
        : brandAssets.mark;
  const label =
    alt ??
    (variant === "lockup"
      ? "Eswatini Standards Authority"
      : "ESWASA");

  return (
    <img
      className={["brand-logo", `brand-logo--${variant}`, className].filter(Boolean).join(" ")}
      src={src}
      alt={label}
      decoding="async"
      draggable={false}
    />
  );
}
