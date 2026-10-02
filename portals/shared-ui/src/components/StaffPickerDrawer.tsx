import { useEffect, useMemo, useState } from "react";
import { Icon } from "../icons/Icon";

/* ---------- StaffMember type ---------- */

export type StaffMember = {
  username: string;
  full_name: string;
  email?: string | null;
  roles?: string[];
  department?: string | null;
  designation?: string | null;
  avatar_initials?: string;
  enabled?: boolean;
};

/* ---------- StaffPickerDrawer ---------- */

type StaffPickerDrawerProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Called when a staff member is selected */
  onPick: (staff: StaffMember) => void;
  /** Fetch function — returns staff list. If not provided, uses default fetch. */
  fetchStaff?: (query: string) => Promise<StaffMember[]>;
  /** Filter by role (passed to backend) */
  roleFilter?: string;
};

/**
 * Reusable staff picker drawer for task assignment / reassignment.
 *
 * - Slide-in drawer (uses same `.record-drawer` CSS as RecordDrawer)
 * - Searchable staff list with avatar initials, name, email, roles
 * - Clicking a staff member calls `onPick` and closes the drawer
 * - Uses `/api/org/staff?q=...&role=...` by default
 */
export function StaffPickerDrawer({
  open,
  onClose,
  title = "Assign to staff member",
  onPick,
  fetchStaff,
  roleFilter,
}: StaffPickerDrawerProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (fetchStaff) {
          const result = await fetchStaff(query);
          if (!cancelled) setStaff(result);
        } else {
          const params = new URLSearchParams();
          if (query) params.set("q", query);
          if (roleFilter) params.set("role", roleFilter);
          params.set("limit", "50");
          const res = await fetch(`/api/org/staff?${params}`, { credentials: "include" });
          if (!res.ok) throw new Error(`Failed to load staff (${res.status})`);
          const data = await res.json();
          if (!cancelled) setStaff(data.items || []);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load staff");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    const debounce = setTimeout(load, 250);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
    };
  }, [open, query, roleFilter, fetchStaff]);

  const filtered = useMemo(() => {
    if (!query) return staff;
    const q = query.toLowerCase();
    return staff.filter(
      (s) =>
        s.full_name.toLowerCase().includes(q) ||
        s.username.toLowerCase().includes(q) ||
        (s.email || "").toLowerCase().includes(q),
    );
  }, [staff, query]);

  if (!open) return null;

  return (
    <>
      <div className="drawer-scrim show" onClick={onClose} />
      <aside className="record-drawer show" role="dialog" aria-label={title}>
        <div className="record-drawer__h">
          <button className="x" type="button" onClick={onClose} aria-label="Close">×</button>
          <div className="record-drawer__title">{title}</div>
          <div className="record-drawer__sub">Search by name, username, or email</div>
        </div>
        <div className="record-drawer__b" style={{ paddingTop: 0 }}>
          <div className="mod-search" style={{ marginBottom: 14, height: 42 }}>
            <Icon name="i-search" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search staff…"
              aria-label="Search staff"
              autoFocus
            />
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>
              Loading staff…
            </div>
          ) : error ? (
            <div style={{ textAlign: "center", padding: 32, color: "var(--red)" }}>
              {error}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>
              No staff members found.
            </div>
          ) : (
            <div className="staff-pick-list">
              {filtered.map((member) => (
                <button
                  key={member.username}
                  type="button"
                  className="staff-pick-row"
                  onClick={() => {
                    onPick(member);
                    onClose();
                  }}
                >
                  <span className="staff-pick-av">
                    {member.avatar_initials || member.username.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="staff-pick-info">
                    <span className="staff-pick-name">{member.full_name}</span>
                    <span className="staff-pick-meta">
                      @{member.username}
                      {member.designation ? ` · ${member.designation}` : ""}
                    </span>
                    {member.roles && member.roles.length > 0 ? (
                      <span className="staff-pick-roles">
                        {member.roles.slice(0, 3).map((r) => (
                          <span key={r} className="tag">{r}</span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                  <Icon name="i-chev" />
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}