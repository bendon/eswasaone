import { Link, useParams } from "react-router-dom";
import { RequireAuth } from "../auth/RequireAuth";

/**
 * Wave 0 / F0c — order status poll shell.
 * MoMo pending → paid / failed wiring is Wave 1 WS-S1.
 */
export function OrderStatusPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireAuth>
      <div className="wrap" style={{ padding: "48px 24px", maxWidth: 640 }}>
        <h1>Order {id}</h1>
        <p>Payment status and licence download will poll Core here (WS-S1).</p>
        <p>
          <Link to="/account/orders">Back to orders</Link>
        </p>
      </div>
    </RequireAuth>
  );
}
