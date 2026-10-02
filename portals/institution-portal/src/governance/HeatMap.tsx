import { heatLevel, riskScore } from "./types";
import type { GovernanceRisk } from "../api/types";

type Props = {
  risks: GovernanceRisk[];
  /** Selected cell key `"L-I"` or null. */
  selected: string | null;
  onSelect: (key: string | null) => void;
};

/** 5×5 residual heat map. Cell click toggles filter. */
export function HeatMap({ risks, selected, onSelect }: Props) {
  const counts: Record<string, number> = {};
  for (const r of risks) {
    const k = `${r.residual_likelihood}-${r.residual_impact}`;
    counts[k] = (counts[k] ?? 0) + 1;
  }

  return (
    <div>
      <div className="heat-y">Likelihood ↑</div>
      <div className="heat" role="grid" aria-label="Risk heat map">
        {([5, 4, 3, 2, 1] as const).map((L) => (
          <div key={`row-${L}`} style={{ display: "contents" }}>
            <span className="ax">{L}</span>
            {([1, 2, 3, 4, 5] as const).map((I) => {
              const key = `${L}-${I}`;
              const n = counts[key] ?? 0;
              const level = heatLevel(riskScore(L, I));
              const sel = selected === key;
              return (
                <button
                  key={key}
                  type="button"
                  className={`cell l${level}${n ? " has" : ""}${sel ? " sel" : ""}`}
                  aria-label={`Likelihood ${L}, impact ${I}: ${n} risks`}
                  aria-pressed={sel}
                  onClick={() => onSelect(sel ? null : key)}
                >
                  {n || ""}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="heat-foot">
        <span>Impact 1</span>
        <span>Impact 5 →</span>
      </div>
    </div>
  );
}
