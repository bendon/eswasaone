export function Skeleton({ lines = 3 }: { lines?: number }) {
  const widths = ["lg", "md", "sm"];
  return (
    <div className="skelly">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={`skelly__line skelly__line--${widths[i % 3]}`} />
      ))}
    </div>
  );
}