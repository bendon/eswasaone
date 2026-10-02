import type { PackSection } from "../api/types";
import { packSegClass, packStatusLabel } from "./types";

type Props = {
  sections: PackSection[];
  onSelect?: (section: PackSection) => void;
};

/** Signature segmented pack track — one segment per pack section, colour by status. */
export function PackTrack({ sections, onSelect }: Props) {
  if (sections.length === 0) {
    return <div className="track" aria-label="Pack track empty" />;
  }

  return (
    <div className="track" role="list" aria-label="Board pack section track">
      {sections.map((s) => {
        const meta = packStatusLabel(s.status);
        const seg = packSegClass(s.status);
        return (
          <button
            key={s.id}
            type="button"
            role="listitem"
            className={`seg ${seg}`}
            title={`${s.title} — ${meta.label}`}
            onClick={() => onSelect?.(s)}
          >
            <b>{s.title}</b>
            <span>{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}
