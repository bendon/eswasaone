import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon, Select, type OrderSummary } from "@eswasaone/shared-ui";
import { useAccount } from "./AccountContext";
import { listOrders } from "../../api/orders";
import { useToast } from "../../ui/Toast";
import { Skeleton } from "./Skeleton";

export function AccountOrdersPage() {
  const { entity, activeEntity } = useAccount();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { showToast } = useToast();

  useEffect(() => {
    setLoading(true);
    void listOrders(entity).then((o) => {
      setOrders(o);
      setLoading(false);
    });
  }, [entity]);

  const filtered = useMemo(() => {
    let items = orders;
    if (query.trim()) {
      const q = query.toLowerCase();
      items = items.filter(
        (o) =>
          o.id.toLowerCase().includes(q) ||
          o.title.toLowerCase().includes(q) ||
          (o.subtitle || "").toLowerCase().includes(q),
      );
    }
    if (statusFilter !== "all") {
      const map: Record<string, string> = { completed: "done", review: "review", pending: "pending" };
      items = items.filter((o) => o.status === map[statusFilter]);
    }
    return items;
  }, [orders, query, statusFilter]);

  const subtitle = entity === "business"
    ? `Standards, training and services purchased by ${activeEntity?.name ?? "this business"}`
    : "Standards and training purchased under your personal account";

  return (
    <section className="panel is-on" role="tabpanel">
      <div className="panel__head">
        <div>
          <h2>Orders</h2>
          <p>{subtitle}</p>
        </div>
        <div className="actions">
          <Link className="abtn ghost" to="/standards">
            <Icon name="i-book" /> Browse catalogue
          </Link>
        </div>
      </div>

      <div className="toolbar">
        <label className="toolbar__input">
          <Icon name="i-search" width={17} height={17} />
          <input
            type="search"
            placeholder="Search by reference or title…"
            aria-label="Search orders"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <Select className="toolbar__select" aria-label="Status" value={statusFilter} onChange={(val) => setStatusFilter(val)}>
          <option value="all">All statuses</option>
          <option value="completed">Completed</option>
          <option value="review">In review</option>
          <option value="pending">Pending payment</option>
        </Select>
      </div>

      <div className="tablewrap">
        {loading ? (
          <Skeleton lines={5} />
        ) : filtered.length === 0 ? (
          <div className="empty">
            <span className="empty__ic"><Icon name="i-book" /></span>
            <b>No orders yet</b>
            <p>Standards and training purchases will appear here.</p>
            <Link to="/standards">Browse the catalogue</Link>
          </div>
        ) : (
          <table className="rtable">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Item</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id}>
                  <td className="rtable__ref">{o.id}</td>
                  <td className="rtable__title">
                    {o.title}
                    {o.subtitle ? <span>{o.subtitle}</span> : null}
                  </td>
                  <td>{formatDate(o.date)}</td>
                  <td className="rtable__amount">{o.amount}</td>
                  <td>
                    <span className={`pill pill--${o.status}`}>{o.status_label}</span>
                  </td>
                  <td className="rtable__act">
                    <button
                      type="button"
                      className="rowbtn"
                      onClick={() => showToast("Preparing download…")}
                    >
                      <Icon name="i-download" width={13} height={13} /> PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}