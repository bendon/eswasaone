/** Detect A10 DemoSeed markers that should never surface as live UI. */
export const DEMO_SEED_MARKER = "A10_DEMOSEED";

export function isDemoSeedText(value?: string | null): boolean {
  if (!value) return false;
  const v = value.trim();
  return v.includes(DEMO_SEED_MARKER) || /^a10[_-]/i.test(v);
}

export function withoutDemoSeedSections<T extends { title?: string | null }>(
  sections: T[] | null | undefined,
): T[] {
  return (sections ?? []).filter((s) => !isDemoSeedText(s.title));
}
